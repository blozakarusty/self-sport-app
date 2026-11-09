import Anthropic from '@anthropic-ai/sdk';
import { and, desc, eq } from 'drizzle-orm';
import { ANTHROPIC_API_KEY } from '$app/env/private';
import { db } from './db';
import { chatMessage, planSession, type Athlete, type ChatProposal } from './db/schema';
import { latestRevision } from './adapt';
import { athleteToday, getDashboard } from './dashboard';
import {
	validateProposal,
	type ChangeOp,
	type ProposalRow,
	type SessionPatch
} from './engine/adapt/proposal';
import { requiredVdot } from './engine/goals/readiness';
import { addDays } from './engine/metrics/load';
import { weekStart } from './engine/metrics/volume';
import { raceTime } from '../format';
import { activeGoal, goalTimeline } from './goals';
import { currentVdot, paceTableFor } from './performance';
import { getSeason, getWeek, prefsFor, sessionsBetween, weekWarnings } from './plan';
import { getStrength } from './strength';

const MAX_TURNS = 8;
const HISTORY = 20;
const inProgress = new Set<number>();

export const chatEnabled = !!ANTHROPIC_API_KEY;

const SYSTEM = `You are the coach inside Fulcrum, this athlete's personal running and strength training app. Answer questions about their plan and adapt it when they ask.

Look up the facts with the tools before answering, and refer to real sessions and dates. Phase descriptions are general: before saying when a type of session starts or stops, check the actual weeks with get_week. Reply in short, plain, warm prose without markdown. Explain the reasoning behind the plan honestly, including when something is a limitation of how the app works.

Their training: Monday, Wednesday and Friday runs, a weekend long run, tennis on Tuesday as leisure. Equipment: kettlebells 8 to 24 kg in pairs, bodyweight, paralettes and a pull-up bar. The terrain is flat, so never prescribe hills. They tend to skip double days. Base phase strength is push Tuesday, legs Thursday, pull on the free weekend day; pull-ups are also practised as grease the groove.

To change the plan, call propose_changes. Nothing changes until the athlete clicks Apply, so say it is a proposal and never claim it is done. Keep heavy legs at least 48 hours before key runs. Take care with sudden increases. If propose_changes returns errors, fix them or explain the limit. Propose only what they asked for.

You give training guidance, not medical advice. For pain, illness or injury, suggest easing off and seeing a professional, and never diagnose.`;

const TOOLS: Anthropic.Beta.Messages.BetaTool[] = [
	{
		name: 'get_week',
		description:
			'One week of the plan: sessions with ids, dates, structure, paces and whether they were done. Call this before proposing changes, to get session ids.',
		input_schema: {
			type: 'object',
			properties: { date: { type: 'string', description: 'Any YYYY-MM-DD in that week' } },
			required: ['date']
		}
	},
	{
		name: 'get_plan_overview',
		description:
			'Goal, macro phases with their focus, and planned versus actual km and long run for every week.',
		input_schema: { type: 'object', properties: {} }
	},
	{
		name: 'get_training_status',
		description:
			'Current fitness, fatigue, form, VDOT, training paces, recent weekly volume, the latest weekly review and strength benchmarks.',
		input_schema: { type: 'object', properties: {} }
	},
	{
		name: 'propose_changes',
		description:
			'Propose plan changes for the athlete to approve. Calling it again replaces the earlier proposal. Ops: move (session_id, date), skip (session_id), restore (session_id), scale (session_id, factor 0.5-1.1, easy and long runs only), replace_run (session_id, title, purpose, steps). A step is {kind: warmup|work|recover|cooldown|steady, pace: easy|marathon|threshold|interval|strides|jog|goal, and exactly one of km, minutes, seconds} or {kind: repeat, reps, steps}.',
		input_schema: {
			type: 'object',
			properties: {
				summary: { type: 'string', description: 'One sentence describing the change' },
				changes: {
					type: 'array',
					items: {
						type: 'object',
						properties: {
							op: { type: 'string', enum: ['move', 'skip', 'restore', 'scale', 'replace_run'] },
							session_id: { type: 'integer' },
							date: { type: 'string' },
							factor: { type: 'number' },
							title: { type: 'string' },
							purpose: { type: 'string' },
							steps: { type: 'array', items: { type: 'object' } }
						},
						required: ['op', 'session_id']
					}
				}
			},
			required: ['summary', 'changes']
		}
	}
];

function validationContext(a: Athlete) {
	const g = activeGoal(a.id);
	if (!g) return null;
	const today = athleteToday(a.id);
	const paces = paceTableFor(
		a,
		requiredVdot(g.distance, g.targetTime),
		g.targetTime / (g.distance / 1000)
	);
	const rows: ProposalRow[] = sessionsBetween(a.id, today, g.date);
	return { today, raceDay: g.date, paces: paces.table, rows };
}

/** Rule warnings for the weeks a change touches, as if it were applied. */
function previewWarnings(rows: ProposalRow[], patches: SessionPatch[], key: Map<number, boolean>) {
	const applied = rows.map((r) => {
		const p = patches.find((x) => x.id === r.id);
		return {
			...r,
			date: p?.date ?? r.date,
			skipped: p?.skipped ?? r.skipped,
			title: p?.title ?? r.title
		};
	});
	const weeks = new Set(
		patches.flatMap((p) => {
			const r = applied.find((x) => x.id === p.id)!;
			const original = rows.find((x) => x.id === p.id)!;
			return [weekStart(r.date), weekStart(original.date)];
		})
	);
	return [...weeks].flatMap((monday) =>
		weekWarnings(
			Array.from({ length: 8 }, (_, i) => {
				const date = addDays(monday, i - 1);
				return {
					date,
					sessions: applied
						.filter((s) => s.date === date)
						.map((s) => ({
							type: s.type,
							key: !!key.get(s.id),
							skipped: s.skipped,
							title: s.title
						}))
				};
			})
		)
	);
}

function keyMap(athleteId: number, ids: number[]) {
	if (!ids.length) return new Map<number, boolean>();
	return new Map(
		db
			.select({ id: planSession.id, key: planSession.key })
			.from(planSession)
			.where(eq(planSession.athleteId, athleteId))
			.all()
			.map((r) => [r.id, r.key])
	);
}

/** Tool data deliberately leaves out activity names and descriptions. */
function runTool(
	a: Athlete,
	name: string,
	input: Record<string, unknown>,
	state: { proposal: ChatProposal | null }
) {
	if (name === 'get_week') {
		const date = String(input.date ?? '');
		if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: 'date must be YYYY-MM-DD' };
		const w = getWeek(a, weekStart(date));
		return {
			monday: w.monday,
			phase: w.phase,
			summary: w.summary,
			days: w.days.map((d) => ({
				date: d.date,
				sessions: d.sessions.map((s) => ({
					id: s.id,
					kind: s.kind,
					type: s.type,
					title: s.title,
					optional: s.optional,
					key: s.key,
					status: s.status,
					done_km: s.activity?.km,
					details: s.details
				})),
				other_activities: d.unplanned.map((u) => ({ sport: u.sportType, km: u.km }))
			}))
		};
	}
	if (name === 'get_plan_overview') {
		const g = activeGoal(a.id);
		if (!g) return { error: 'No race goal is set.' };
		const t = goalTimeline(g, athleteToday(a.id));
		return {
			goal: {
				name: g.name,
				date: g.date,
				distance_km: g.distance / 1000,
				target: raceTime(g.targetTime)
			},
			prefs: prefsFor(a),
			current_phase: t.current?.name,
			week: t.week,
			phases: t.phases,
			weeks: getSeason(a)
		};
	}
	if (name === 'get_training_status') {
		const g = activeGoal(a.id);
		const paces = g
			? paceTableFor(a, requiredVdot(g.distance, g.targetTime), g.targetTime / (g.distance / 1000))
			: null;
		const s = getStrength(a);
		const d = getDashboard(a);
		return {
			load: d.current,
			weekly_running: d.weeks.map((w) => ({ week: w.week, km: Math.round(w.runKm * 10) / 10 })),
			vdot: currentVdot(a)?.value,
			target_vdot: g && requiredVdot(g.distance, g.targetTime),
			paces_sec_per_km: paces?.table,
			latest_review: latestRevision(a.id),
			benchmarks: s.benchmarks.map((b) => ({
				name: b.name,
				unit: b.unit,
				latest: b.latest,
				target: b.target,
				last_tested: b.lastTested
			})),
			strength_sessions_per_week: s.weeks
		};
	}
	if (name === 'propose_changes') {
		const ctx = validationContext(a);
		if (!ctx) return { error: 'No race goal is set.' };
		const ops = input.changes as ChangeOp[];
		const { patches, errors } = validateProposal(ops, ctx.rows, ctx);
		if (errors.length) return { accepted: false, errors };
		const warnings = previewWarnings(
			ctx.rows,
			patches,
			keyMap(
				a.id,
				patches.map((p) => p.id)
			)
		);
		state.proposal = {
			summary: String(input.summary ?? '').slice(0, 300),
			ops,
			changes: patches.map((p) => p.summary),
			warnings
		};
		return {
			accepted: true,
			shown_to_athlete_for_approval: state.proposal.changes,
			rule_warnings: warnings
		};
	}
	return { error: 'Unknown tool' };
}

export function chatHistory(athleteId: number) {
	const rows = db
		.select()
		.from(chatMessage)
		.where(eq(chatMessage.athleteId, athleteId))
		.orderBy(desc(chatMessage.id))
		.limit(50)
		.all()
		.reverse();
	return rows.map((m) => ({
		id: m.id,
		role: m.role,
		content: m.content,
		proposal: m.proposal && {
			summary: m.proposal.summary,
			changes: m.proposal.changes,
			warnings: m.proposal.warnings
		},
		status: m.proposalStatus
	}));
}

export async function sendChat(a: Athlete, text: string) {
	if (!ANTHROPIC_API_KEY) throw new ChatError('The coach is off: ANTHROPIC_API_KEY is not set.');
	if (inProgress.has(a.id)) throw new ChatError('The coach is still answering your last message.');
	inProgress.add(a.id);
	const userId = db
		.insert(chatMessage)
		.values({ athleteId: a.id, role: 'user', content: text })
		.returning({ id: chatMessage.id })
		.get().id;
	try {
		const past = db
			.select({ role: chatMessage.role, content: chatMessage.content })
			.from(chatMessage)
			.where(eq(chatMessage.athleteId, a.id))
			.orderBy(desc(chatMessage.id))
			.limit(HISTORY)
			.all()
			.reverse();
		// a conversation must start with the athlete's turn
		while (past.length && past[0].role !== 'user') past.shift();
		const messages: Anthropic.Beta.Messages.BetaMessageParam[] = past.map((m) => ({
			role: m.role,
			content: m.content
		}));

		const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY, timeout: 120_000 });
		const state: { proposal: ChatProposal | null } = { proposal: null };
		const system = `${SYSTEM}\n\nToday is ${athleteToday(a.id)}.`;
		let reply = '';
		for (let turn = 0; turn < MAX_TURNS; turn++) {
			const response = await client.beta.messages.create({
				model: 'claude-opus-5-5',
				max_tokens: 16000,
				betas: ['server-side-fallback-2026-07-01'],
				fallbacks: 'default',
				system,
				tools: TOOLS,
				output_config: { effort: 'medium' },
				messages
			});
			if (response.stop_reason === 'refusal')
				throw new ChatError("The coach couldn't answer that one.");
			if (response.stop_reason === 'tool_use') {
				messages.push({ role: 'assistant', content: response.content });
				const results: Anthropic.Beta.Messages.BetaToolResultBlockParam[] = [];
				for (const block of response.content) {
					if (block.type !== 'tool_use') continue;
					let result: unknown;
					try {
						result = runTool(a, block.name, block.input as Record<string, unknown>, state);
					} catch (e) {
						console.warn('[chat] tool failed', block.name, e);
						result = { error: 'That lookup failed.' };
					}
					results.push({
						type: 'tool_result',
						tool_use_id: block.id,
						content: JSON.stringify(result)
					});
				}
				messages.push({ role: 'user', content: results });
				continue;
			}
			reply = response.content
				.flatMap((b) => (b.type === 'text' ? [b.text] : []))
				.join('')
				.trim();
			break;
		}
		if (!reply) throw new ChatError("The coach didn't finish an answer. Try asking again.");

		const id = db.transaction((tx) => {
			if (state.proposal) {
				tx.update(chatMessage)
					.set({ proposalStatus: 'expired' })
					.where(and(eq(chatMessage.athleteId, a.id), eq(chatMessage.proposalStatus, 'pending')))
					.run();
			}
			return tx
				.insert(chatMessage)
				.values({
					athleteId: a.id,
					role: 'assistant',
					content: reply,
					proposal: state.proposal,
					proposalStatus: state.proposal ? 'pending' : null
				})
				.returning({ id: chatMessage.id })
				.get().id;
		});
		return id;
	} catch (e) {
		// don't leave a question with no answer in the history
		db.delete(chatMessage).where(eq(chatMessage.id, userId)).run();
		if (e instanceof ChatError) throw e;
		if (e instanceof Anthropic.AuthenticationError)
			throw new ChatError('The Anthropic API key was rejected.');
		if (e instanceof Anthropic.RateLimitError)
			throw new ChatError('The coach is rate limited. Try again shortly.');
		if (e instanceof Anthropic.APIError)
			throw new ChatError(`The coach is unavailable (error ${e.status}).`);
		throw e;
	} finally {
		inProgress.delete(a.id);
	}
}

export class ChatError extends Error {}

function ownMessage(athleteId: number, id: number) {
	return db
		.select()
		.from(chatMessage)
		.where(and(eq(chatMessage.id, id), eq(chatMessage.athleteId, athleteId)))
		.get();
}

/** Re-validates against the current plan, since it may have changed. */
export function applyProposal(a: Athlete, id: number) {
	const m = ownMessage(a.id, id);
	if (!m?.proposal || m.proposalStatus !== 'pending')
		throw new ChatError('This proposal is no longer open.');
	const ctx = validationContext(a);
	if (!ctx) throw new ChatError('No race goal is set.');
	const { patches, errors } = validateProposal(m.proposal.ops as ChangeOp[], ctx.rows, ctx);
	if (errors.length) throw new ChatError(`This proposal no longer fits the plan: ${errors[0]}`);
	const raw = sessionsBetween(a.id, ctx.today, ctx.raceDay);
	db.transaction((tx) => {
		const before = patches.map((p) => {
			const r = raw.find((x) => x.id === p.id)!;
			return {
				id: r.id,
				date: r.date,
				title: r.title,
				details: r.details,
				skipped: r.skipped,
				moved: r.moved
			};
		});
		for (const { id: sid, summary: _s, ...set } of patches) {
			tx.update(planSession).set(set).where(eq(planSession.id, sid)).run();
		}
		tx.update(chatMessage)
			.set({ proposalStatus: 'applied', before })
			.where(eq(chatMessage.id, id))
			.run();
	});
}

export function declineProposal(athleteId: number, id: number) {
	const m = ownMessage(athleteId, id);
	if (m?.proposalStatus !== 'pending') throw new ChatError('This proposal is no longer open.');
	db.update(chatMessage).set({ proposalStatus: 'declined' }).where(eq(chatMessage.id, id)).run();
}

export function undoProposal(athleteId: number, id: number) {
	const m = ownMessage(athleteId, id);
	if (m?.proposalStatus !== 'applied' || !m.before)
		throw new ChatError('This change can no longer be undone.');
	db.transaction((tx) => {
		for (const b of m.before as {
			id: number;
			date: string;
			title: string;
			details: unknown;
			skipped: boolean;
			moved: boolean;
		}[]) {
			const { id: sid, ...set } = b;
			tx.update(planSession)
				.set(set)
				.where(and(eq(planSession.id, sid), eq(planSession.athleteId, athleteId)))
				.run();
		}
		tx.update(chatMessage)
			.set({ proposalStatus: 'undone', before: null })
			.where(eq(chatMessage.id, id))
			.run();
	});
}
