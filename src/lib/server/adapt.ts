import { and, desc, eq } from 'drizzle-orm';
import { db } from './db';
import { planRevision, planSession, type Athlete } from './db/schema';
import { askCoach, coachEnabled } from './coach/index';
import { athleteToday, getDashboard } from './dashboard';
import {
	applyCoachAdjustment,
	planChanges,
	reviewWeek,
	ruleExplanation,
	type PlanRow
} from './engine/adapt/review';
import { requiredVdot } from './engine/goals/readiness';
import { addDays } from './engine/metrics/load';
import { RUN_SPORTS, weekStart } from './engine/metrics/volume';
import { raceTime } from '../format';
import { activeGoal } from './goals';
import { currentVdot } from './performance';
import { getWeek, sessionsBetween } from './plan';

const inProgress = new Set<number>();

function revisionFor(athleteId: number, reviewedWeek: string) {
	return db
		.select()
		.from(planRevision)
		.where(and(eq(planRevision.athleteId, athleteId), eq(planRevision.reviewedWeek, reviewedWeek)))
		.get();
}

/**
 * Review last week once and adapt the coming weeks. Safe to call repeatedly:
 * it does nothing if last week has been reviewed. `force` re-runs a review you
 * undid.
 */
export async function runWeeklyReview(a: Athlete, opts: { force?: boolean } = {}) {
	if (inProgress.has(a.id)) return null;
	const g = activeGoal(a.id);
	if (!g) return null;
	const today = athleteToday(a.id);
	const thisMonday = weekStart(today);
	const reviewed = addDays(thisMonday, -7);
	if (addDays(reviewed, 6) < g.startDate || g.date < today) return null;

	const existing = revisionFor(a.id, reviewed);
	if (existing && !(opts.force && existing.undone)) return null;

	inProgress.add(a.id);
	try {
		const week = getWeek(a, reviewed);
		const sessions = week.days.flatMap((d) => d.sessions);
		if (!sessions.some((s) => !s.optional && s.kind !== 'gtg')) return null;

		// Only count running from the day the plan started
		const actualKm = week.days
			.filter((d) => d.date >= g.startDate)
			.reduce(
				(km, d) =>
					km +
					d.sessions.reduce((s, x) => s + (x.kind === 'run' && x.activity ? x.activity.km : 0), 0) +
					d.unplanned.reduce((s, u) => s + (RUN_SPORTS.has(u.sportType) ? u.km : 0), 0),
				0
			);

		const toRow = (s: ReturnType<typeof sessionsBetween>[number]): PlanRow => ({
			id: s.id,
			type: s.type,
			kind: s.kind,
			title: s.title,
			phase: s.phase as PlanRow['phase'],
			week: s.week,
			details: s.details,
			skipped: s.skipped
		});
		const reviewedRows = sessionsBetween(a.id, reviewed, addDays(reviewed, 6));
		const missedKey = sessions.filter((s) => s.key && s.status !== 'done');
		const findMissed = (type: string) => {
			const m = missedKey.find((s) => s.type === type);
			const row = m && reviewedRows.find((r) => r.id === m.id);
			return row ? toRow(row) : null;
		};
		const missed = { quality: findMissed('quality'), long: findMissed('long') };

		const { current } = getDashboard(a);
		const review = reviewWeek({
			plannedKm: week.summary.plannedKm,
			actualKm,
			keyTotal: week.summary.keyTotal,
			keyDone: week.summary.keyDone,
			qualityMissed: !!missed.quality,
			longMissed: !!missed.long,
			acwr: current.acwr,
			tsb: current.tsb
		});

		const next = sessionsBetween(a.id, today, addDays(thisMonday, 6));
		const after = sessionsBetween(a.id, addDays(thisMonday, 7), addDays(thisMonday, 13));

		const reply = await askCoach({
			review,
			goal: {
				name: g.name,
				distanceKm: g.distance / 1000,
				targetTime: raceTime(g.targetTime),
				weeksToGo: Math.floor((Date.parse(g.date) - Date.parse(today)) / (7 * 864e5))
			},
			phase: week.phase?.name ?? null,
			plannedKm: week.summary.plannedKm,
			actualKm,
			keyDone: week.summary.keyDone,
			keyTotal: week.summary.keyTotal,
			missedKeySessions: missedKey.map((s) => s.title),
			acwr: current.acwr,
			form: current.tsb,
			vdot: currentVdot(a)?.value ?? null,
			targetVdot: requiredVdot(g.distance, g.targetTime),
			nextWeekKeySessions: next.filter((s) => s.key).map((s) => s.title)
		});

		const factor = reply ? applyCoachAdjustment(review, reply.volumeAdjustment) : review.factor;
		const changes = planChanges(review, factor, next.map(toRow), after.map(toRow), missed);
		const all = [...next, ...after];

		const id = db.transaction((tx) => {
			if (existing) tx.delete(planRevision).where(eq(planRevision.id, existing.id)).run();
			for (const c of changes) {
				tx.update(planSession)
					.set({ title: c.title, details: c.details })
					.where(eq(planSession.id, c.id))
					.run();
			}
			return tx
				.insert(planRevision)
				.values({
					athleteId: a.id,
					goalId: g.id,
					reviewedWeek: reviewed,
					decision: review.decision,
					factor,
					reasons: review.reasons,
					metrics: {
						plannedKm: week.summary.plannedKm,
						actualKm: Math.round(actualKm * 10) / 10,
						keyDone: week.summary.keyDone,
						keyTotal: week.summary.keyTotal
					},
					changes: changes.map((c) => c.summary),
					before: changes.map((c) => {
						const s = all.find((x) => x.id === c.id)!;
						return { id: s.id, title: s.title, details: s.details };
					}),
					explanation: reply?.explanation ?? ruleExplanation(review, changes),
					tips: reply?.tips ?? [],
					source: reply ? 'claude' : 'rules'
				})
				.returning({ id: planRevision.id })
				.get().id;
		});
		return id;
	} finally {
		inProgress.delete(a.id);
	}
}

export function undoRevision(athleteId: number, id: number) {
	const r = db
		.select()
		.from(planRevision)
		.where(and(eq(planRevision.id, id), eq(planRevision.athleteId, athleteId)))
		.get();
	if (!r || r.undone || !r.before) return false;
	db.transaction((tx) => {
		for (const b of r.before!) {
			tx.update(planSession)
				.set({ title: b.title, details: b.details })
				.where(and(eq(planSession.id, b.id), eq(planSession.athleteId, athleteId)))
				.run();
		}
		tx.update(planRevision)
			.set({ undone: true, before: null })
			.where(eq(planRevision.id, id))
			.run();
	});
	return true;
}

/** The most recent review, for the Plan and Today pages. */
export function latestRevision(athleteId: number) {
	const r = db
		.select()
		.from(planRevision)
		.where(eq(planRevision.athleteId, athleteId))
		.orderBy(desc(planRevision.reviewedWeek))
		.get();
	return r
		? {
				id: r.id,
				reviewedWeek: r.reviewedWeek,
				decision: r.decision,
				factor: r.factor,
				reasons: r.reasons,
				metrics: r.metrics,
				changes: r.changes,
				explanation: r.explanation,
				tips: r.tips,
				source: r.source,
				undone: r.undone,
				canUndo: !r.undone && !!r.before?.length
			}
		: null;
}

export { coachEnabled };
