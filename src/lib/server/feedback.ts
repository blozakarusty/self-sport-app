import Anthropic from '@anthropic-ai/sdk';
import { and, desc, eq, gte, inArray } from 'drizzle-orm';
import { ANTHROPIC_API_KEY } from '$app/env/private';
import { db } from './db';
import { activity, activityFeedback, type Athlete } from './db/schema';
import { athleteToday, hrProfile } from './dashboard';
import { addDays, activityLoad, dayOf } from './engine/metrics/load';
import { zonesFromMaxHr } from './engine/metrics/insights';
import { weekStart } from './engine/metrics/volume';
import { dayLabel, paceStr, raceTime } from '../format';
import { cleanFeedback, FEEDBACK_SYSTEM, type FeedbackFacts } from './coach/feedback-prompt';
import { activeGoal } from './goals';
import { getWeek } from './plan';

/** Only sessions this recent get a note, so old history never costs anything. */
const RECENT_DAYS = 3;
/** At most this many notes per sync. */
const MAX_PER_SYNC = 3;
const inProgress = new Set<number>();

type Row = typeof activity.$inferSelect;

function factsFor(a: Athlete, r: Row): FeedbackFacts {
	const hr = hrProfile(a);
	const zones = a.hrZones?.length ? a.hrZones : hr ? zonesFromMaxHr(hr.maxHr) : null;
	const zone =
		r.avgHr && zones
			? zones.findIndex((z) => r.avgHr! >= z.min && (z.max < 0 || r.avgHr! <= z.max))
			: -1;
	const km = r.distance / 1000;
	const week = getWeek(a, weekStart(dayOf(r.startDateLocal)));
	const sessions = week.days.flatMap((d) => d.sessions);
	const planned = sessions.find((s) => s.activity?.id === r.id);
	const g = activeGoal(a.id);
	const upcoming = week.days
		.flatMap((d) => d.sessions.map((s) => ({ ...s, date: d.date })))
		.find((s) => s.status === 'planned' && s.kind !== 'gtg' && s.kind !== 'leisure');

	let details: { purpose: string | null; km: number | null; structure: string[] } = {
		purpose: null,
		km: null,
		structure: []
	};
	if (planned?.details.kind === 'run') {
		const flat = (l: { label: string; pace: string | null; children?: unknown[] }[]): string[] =>
			l.flatMap((s) =>
				s.children
					? [`${s.label} [${flat(s.children as typeof l).join('; ')}]`]
					: [`${s.label}${s.pace ? ` ${s.pace}` : ''}`]
			);
		details = {
			purpose: planned.details.purpose,
			km: planned.details.km,
			structure: flat(planned.details.resolved)
		};
	} else if (planned?.details.kind === 'strength') {
		details = {
			purpose: null,
			km: null,
			structure: planned.details.exercises.map(
				(e: { name: string; sets: number; reps: string }) => `${e.name} ${e.sets} x ${e.reps}`
			)
		};
	}

	const segments = r.laps && r.laps.length > 1 ? r.laps : (r.splits ?? []);
	return {
		session: {
			date: dayOf(r.startDateLocal),
			sport: r.sportType,
			km: km > 0 ? Math.round(km * 100) / 100 : null,
			minutes: Math.round(r.movingTime / 60),
			pace_per_km: km > 0 ? paceStr(r.movingTime / km) : null,
			avg_hr: r.avgHr ? Math.round(r.avgHr) : null,
			hr_zone: zone >= 0 ? zone + 1 : null,
			elevation_m: r.elevationGain > 0 ? Math.round(r.elevationGain) : null,
			load: Math.round(activityLoad(r, hr).load),
			strength_type: r.strengthSplit,
			effort_1_to_10: r.rpe
		},
		laps: segments.slice(0, 40).map((s) => ({
			km: Math.round(s.distance / 10) / 100,
			pace_per_km: s.distance > 0 ? paceStr(s.movingTime / (s.distance / 1000)) : '–',
			avg_hr: s.avgHr ? Math.round(s.avgHr) : null
		})),
		planned: planned ? { title: planned.title, ...details } : null,
		week: {
			planned_km: week.summary.plannedKm,
			run_km: week.summary.actualKm,
			key_done: week.summary.keyDone,
			key_total: week.summary.keyTotal,
			phase: week.phase?.name ?? null
		},
		goal: g
			? {
					name: g.name,
					target: raceTime(g.targetTime),
					weeks_to_go: Math.floor(
						(Date.parse(g.date) - Date.parse(athleteToday(a.id))) / (7 * 864e5)
					)
				}
			: null,
		next_session: upcoming ? `${upcoming.title} on ${dayLabel(upcoming.date)}` : null
	};
}

/** Write a note for one activity. Network errors leave it for the next sync. */
async function writeNote(client: Anthropic, a: Athlete, r: Row) {
	try {
		const response = await client.beta.messages.create({
			model: 'claude-opus-5-5',
			max_tokens: 16000,
			betas: ['server-side-fallback-2026-07-01'],
			fallbacks: 'default',
			system: FEEDBACK_SYSTEM,
			output_config: { effort: 'low' },
			messages: [{ role: 'user', content: JSON.stringify(factsFor(a, r)) }]
		});
		// a refusal would repeat every sync, so record it as "no note"
		const text =
			response.stop_reason === 'refusal'
				? ''
				: cleanFeedback(
						response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('')
					);
		db.insert(activityFeedback)
			.values({ activityId: r.id, athleteId: a.id, text })
			.onConflictDoNothing()
			.run();
	} catch (e) {
		if (e instanceof Anthropic.APIError) console.warn(`[feedback] API error ${e.status}`);
		else console.warn('[feedback] failed', e);
	}
}

/** Called after every sync; does nothing without an API key or new sessions. */
export async function generateFeedback(a: Athlete) {
	if (!ANTHROPIC_API_KEY || inProgress.has(a.id)) return;
	inProgress.add(a.id);
	try {
		const since = addDays(athleteToday(a.id), -RECENT_DAYS);
		const recent = db
			.select()
			.from(activity)
			.where(and(eq(activity.athleteId, a.id), gte(activity.startDateLocal, since)))
			.orderBy(desc(activity.startDateLocal))
			.all();
		if (!recent.length) return;
		const done = new Set(
			db
				.select({ id: activityFeedback.activityId })
				.from(activityFeedback)
				.where(
					inArray(
						activityFeedback.activityId,
						recent.map((r) => r.id)
					)
				)
				.all()
				.map((f) => f.id)
		);
		const todo = recent.filter((r) => !done.has(r.id)).slice(0, MAX_PER_SYNC);
		if (!todo.length) return;
		const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY, timeout: 60_000 });
		await Promise.all(todo.map((r) => writeNote(client, a, r)));
	} finally {
		inProgress.delete(a.id);
	}
}

export function feedbackFor(activityId: string): string | null {
	return (
		db
			.select({ text: activityFeedback.text })
			.from(activityFeedback)
			.where(eq(activityFeedback.activityId, activityId))
			.get()?.text || null
	);
}

export function recentFeedback(athleteId: number, limit = 3) {
	return db
		.select({
			id: activity.id,
			sportType: activity.sportType,
			startDateLocal: activity.startDateLocal,
			text: activityFeedback.text
		})
		.from(activityFeedback)
		.innerJoin(activity, eq(activityFeedback.activityId, activity.id))
		.where(eq(activityFeedback.athleteId, athleteId))
		.orderBy(desc(activity.startDateLocal))
		.limit(limit + 3)
		.all()
		.filter((f) => f.text)
		.slice(0, limit);
}
