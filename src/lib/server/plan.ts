import { and, asc, desc, eq, gte, inArray, lte } from 'drizzle-orm';
import { db } from './db';
import {
	activity,
	benchmark,
	benchmarkResult,
	planSession,
	workingWeight,
	type Athlete,
	type Goal,
	type PlanPrefs
} from './db/schema';
import { athleteToday } from './dashboard';
import { addDays, dayOf } from './engine/metrics/load';
import { weekStart } from './engine/metrics/volume';
import { macroPhases, PHASE_INFO, phaseOn } from './engine/goals/phases';
import {
	longestRoadRun,
	readinessTargets,
	requiredVdot,
	weeklyKmAverage
} from './engine/goals/readiness';
import {
	DEFAULT_PREFS,
	generatePlan,
	planWeeks,
	type SessionDetails
} from './engine/plan/generate';
import { weeklyTargets, type Step } from './engine/plan/runs';
import { EXERCISES, FOCUS_INFO } from './engine/plan/strength';
import { matchActivities, sessionStatus, summarizeWeek, type PlanItem } from './engine/plan/match';
import { activeGoal } from './goals';
import { paceTableFor } from './performance';
import { DETAIL_SPORTS } from './sources/strava/index';

export function prefsFor(a: Athlete): PlanPrefs {
	return { ...DEFAULT_PREFS, ...(a.planPrefs ?? {}) };
}

export function weightsFor(athleteId: number): Record<string, number> {
	return Object.fromEntries(
		db
			.select()
			.from(workingWeight)
			.where(eq(workingWeight.athleteId, athleteId))
			.all()
			.map((w) => [w.exercise, w.kg])
	);
}

function latestPullups(athleteId: number): number | null {
	const row = db
		.select({ value: benchmarkResult.value })
		.from(benchmarkResult)
		.innerJoin(benchmark, eq(benchmarkResult.benchmarkId, benchmark.id))
		.where(and(eq(benchmark.athleteId, athleteId), eq(benchmark.key, 'pullups-max')))
		.orderBy(desc(benchmarkResult.date), desc(benchmarkResult.id))
		.get();
	return row?.value ?? null;
}

function recentRuns(athleteId: number, today: string) {
	return db
		.select({
			startDateLocal: activity.startDateLocal,
			sportType: activity.sportType,
			distance: activity.distance,
			movingTime: activity.movingTime,
			elevationGain: activity.elevationGain
		})
		.from(activity)
		.where(
			and(
				eq(activity.athleteId, athleteId),
				inArray(activity.sportType, DETAIL_SPORTS),
				gte(activity.startDateLocal, addDays(today, -60))
			)
		)
		.all();
}

function planInputs(a: Athlete, g: Goal) {
	const today = athleteToday(a.id);
	const target = requiredVdot(g.distance, g.targetTime);
	const goalPace = g.targetTime / (g.distance / 1000);
	const paces = paceTableFor(a, target, goalPace);
	const runs = recentRuns(a.id, today);
	const t = readinessTargets(g.distance, target);
	return {
		today,
		paces,
		input: {
			today,
			raceDay: g.date,
			raceKm: g.distance / 1000,
			phases: macroPhases(g.startDate, g.date, g.distance),
			startKm: weeklyKmAverage(runs, today),
			startLongKm: Math.max(12, Math.round(longestRoadRun(runs, today, g.distance) * 0.9)),
			peakKm: t.peakWeeklyKm,
			peakLongKm: t.longRunKm,
			paces: paces.table,
			prefs: prefsFor(a),
			pullupMax: latestPullups(a.id),
			weights: weightsFor(a.id)
		}
	};
}

/**
 * (Re)generate the plan from today on. Sessions you moved or skipped are kept,
 * and the generator's version of a moved session that week is dropped.
 */
export function regeneratePlan(a: Athlete) {
	const g = activeGoal(a.id);
	if (!g) return 0;
	const { today, input } = planInputs(a, g);
	const kept = db
		.select()
		.from(planSession)
		.where(
			and(
				eq(planSession.athleteId, a.id),
				eq(planSession.goalId, g.id),
				gte(planSession.date, today)
			)
		)
		.all()
		.filter((s) => s.moved || s.skipped);
	const keptKeys = new Set(kept.map((s) => `${s.week}:${s.type}`));
	const { sessions } = generatePlan(input);
	db.transaction((tx) => {
		tx.delete(planSession)
			.where(and(eq(planSession.athleteId, a.id), gte(planSession.date, today)))
			.run();
		// sessions from goals that are no longer active go too
		for (const s of kept) {
			const { id: _id, ...rest } = s;
			tx.insert(planSession).values(rest).run();
		}
		for (const s of sessions) {
			if (keptKeys.has(`${s.week}:${s.type}`)) continue;
			tx.insert(planSession)
				.values({ ...s, athleteId: a.id, goalId: g.id })
				.run();
		}
	});
	return sessions.length;
}

export function hasPlan(athleteId: number, goalId: number) {
	return !!db
		.select({ id: planSession.id })
		.from(planSession)
		.where(and(eq(planSession.athleteId, athleteId), eq(planSession.goalId, goalId)))
		.get();
}

// ------------------------------------------------------------------ views

const fmtPace = (s: number) =>
	`${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

export interface ResolvedStep {
	label: string;
	pace: string | null;
	children?: ResolvedStep[];
	reps?: number;
}

const STEP_LABEL: Record<string, string> = {
	warmup: 'Warm-up',
	cooldown: 'Cool-down',
	steady: 'Run',
	work: 'Hard',
	recover: 'Recover'
};
const PACE_LABEL: Record<string, string> = {
	easy: 'easy',
	marathon: 'marathon pace',
	threshold: 'threshold',
	interval: 'interval pace',
	strides: 'strides, relaxed fast',
	jog: 'easy jog',
	goal: 'goal pace'
};

function resolveSteps(steps: Step[], paces: ReturnType<typeof paceTableFor>): ResolvedStep[] {
	return steps.map((s) => {
		if (s.kind === 'repeat')
			return {
				label: `${s.reps} ×`,
				pace: null,
				reps: s.reps,
				children: resolveSteps(s.steps, paces)
			};
		const amount = s.km
			? `${Math.round(s.km * 10) / 10} km`
			: s.minutes
				? `${s.minutes} min`
				: `${s.seconds} s`;
		const sec = s.pace === 'goal' ? paces.table.goal : paces.table[s.pace];
		const pace =
			s.pace === 'easy'
				? `${fmtPace(paces.easyRange[0])}–${fmtPace(paces.easyRange[1])} /km`
				: s.pace === 'jog'
					? 'easy jog'
					: sec
						? `${fmtPace(sec)} /km`
						: null;
		return { label: `${STEP_LABEL[s.kind] ?? s.kind} ${amount} · ${PACE_LABEL[s.pace]}`, pace };
	});
}

function resolveDetails(d: SessionDetails, paces: ReturnType<typeof paceTableFor>) {
	if (d.kind === 'run') return { ...d, resolved: resolveSteps(d.steps, paces) };
	if (d.kind === 'strength') {
		return {
			...d,
			exercises: d.exercises.map((e) => ({
				...e,
				name: EXERCISES[e.key]?.name ?? e.key,
				cue: EXERCISES[e.key]?.cue ?? '',
				loadNote: EXERCISES[e.key]?.loadNote ?? null,
				focusLabel: FOCUS_INFO[e.focus].label,
				focusTip: FOCUS_INFO[e.focus].tip
			})),
			focusInfo: d.focus.map((f) => ({ key: f, ...FOCUS_INFO[f] }))
		};
	}
	return d;
}

function sessionsBetween(athleteId: number, from: string, to: string) {
	return db
		.select()
		.from(planSession)
		.where(
			and(
				eq(planSession.athleteId, athleteId),
				gte(planSession.date, from),
				lte(planSession.date, to)
			)
		)
		.orderBy(asc(planSession.date), asc(planSession.id))
		.all();
}

function activitiesBetween(athleteId: number, from: string, to: string) {
	return db
		.select({
			id: activity.id,
			startDateLocal: activity.startDateLocal,
			sportType: activity.sportType,
			distance: activity.distance,
			movingTime: activity.movingTime,
			name: activity.name
		})
		.from(activity)
		.where(
			and(
				eq(activity.athleteId, athleteId),
				gte(activity.startDateLocal, from),
				lte(activity.startDateLocal, `${to}T23:59:59`)
			)
		)
		.all();
}

const toItem = (s: ReturnType<typeof sessionsBetween>[number]): PlanItem => ({
	id: s.id,
	date: s.date,
	kind: s.kind,
	type: s.type,
	optional: s.optional,
	key: s.key,
	skipped: s.skipped,
	km: (s.details as SessionDetails).kind === 'run' ? (s.details as { km: number }).km : undefined
});

/** One week of the plan with paces, statuses and matched activities. */
export function getWeek(a: Athlete, monday: string) {
	const today = athleteToday(a.id);
	const g = activeGoal(a.id);
	const sunday = addDays(monday, 6);
	const rows = sessionsBetween(a.id, monday, sunday);
	// look one day either side so moved activities still match
	const acts = activitiesBetween(a.id, addDays(monday, -1), addDays(sunday, 1));
	const items = rows.map(toItem);
	const matched = matchActivities(items, acts);
	const paces = paceTableFor(
		a,
		g ? requiredVdot(g.distance, g.targetTime) : 45,
		g ? g.targetTime / (g.distance / 1000) : undefined
	);
	const weekActs = acts.filter(
		(x) => dayOf(x.startDateLocal) >= monday && dayOf(x.startDateLocal) <= sunday
	);
	const phases = g ? macroPhases(g.startDate, g.date, g.distance) : [];
	const phase = phaseOn(phases, monday) ?? phaseOn(phases, sunday);

	return {
		monday,
		today,
		phase: phase && {
			name: phase.name,
			...PHASE_INFO[phase.name],
			recovery: phase.recoveryWeeks.includes(monday),
			test: phase.testWeek === monday
		},
		week: rows[0]?.week ?? null,
		days: Array.from({ length: 7 }, (_, i) => {
			const date = addDays(monday, i);
			return {
				date,
				sessions: rows
					.filter((s) => s.date === date)
					.map((s, _i, all) => {
						const m = matched.get(s.id);
						return {
							id: s.id,
							kind: s.kind,
							type: s.type,
							title: s.title,
							optional: s.optional,
							key: s.key,
							moved: s.moved,
							skipped: s.skipped,
							status: sessionStatus(toItem(s), !!m, today),
							activity: m
								? { id: m.id, name: m.name, km: m.distance / 1000, movingTime: m.movingTime }
								: null,
							details: resolveDetails(s.details as SessionDetails, paces)
						};
					}),
				unplanned: acts
					.filter(
						(x) =>
							dayOf(x.startDateLocal) === date && ![...matched.values()].some((m) => m.id === x.id)
					)
					.map((x) => ({ id: x.id, name: x.name, sportType: x.sportType, km: x.distance / 1000 }))
			};
		}),
		summary: summarizeWeek(items, matched, weekActs),
		hasGoal: !!g
	};
}

export function getWeekWithWarnings(a: Athlete, monday: string) {
	const w = getWeek(a, monday);
	return { ...w, warnings: weekWarnings(w.days) };
}

/**
 * Rule checks after you move things around: legs the day before a key run,
 * or two key runs on consecutive days.
 */
export function weekWarnings(
	days: {
		date: string;
		sessions: { type: string; key: boolean; skipped: boolean; title: string }[];
	}[]
) {
	const warnings: string[] = [];
	const active = (d: (typeof days)[number]) => d.sessions.filter((s) => !s.skipped);
	for (let i = 0; i < days.length - 1; i++) {
		const today = active(days[i]);
		const tomorrow = active(days[i + 1]);
		const nextKey = tomorrow.find((s) => s.key);
		if (nextKey && today.some((s) => s.type === 'legs')) {
			warnings.push(
				`Legs on ${days[i].date} is the day before “${nextKey.title}”; heavy legs can blunt that session.`
			);
		}
		if (nextKey && today.some((s) => s.key)) {
			warnings.push(
				`Two key runs back to back (${days[i].date} and ${days[i + 1].date}); consider an easy day between.`
			);
		}
	}
	return warnings;
}

/** Every week of the plan with planned vs actual km, for the season overview. */
export function getSeason(a: Athlete) {
	const g = activeGoal(a.id);
	if (!g) return null;
	const today = athleteToday(a.id);
	const { input } = planInputs(a, g);
	const weeks = planWeeks(input.phases);
	const targets = weeklyTargets(weeks, input);
	const runs = db
		.select({ startDateLocal: activity.startDateLocal, distance: activity.distance })
		.from(activity)
		.where(
			and(
				eq(activity.athleteId, a.id),
				inArray(activity.sportType, ['Run', 'TrailRun', 'VirtualRun']),
				gte(activity.startDateLocal, targets[0]?.monday ?? today)
			)
		)
		.all();
	const actual = new Map<string, number>();
	for (const r of runs) {
		const w = weekStart(dayOf(r.startDateLocal));
		actual.set(w, (actual.get(w) ?? 0) + r.distance / 1000);
	}
	return targets.map((t) => ({
		week: t.week,
		monday: t.monday,
		phase: t.phase,
		recovery: t.recovery,
		plannedKm: t.km,
		longKm: t.longKm,
		actualKm: t.monday <= today ? Math.round((actual.get(t.monday) ?? 0) * 10) / 10 : null
	}));
}

/** Today's and tomorrow's sessions for the Today page. */
export function getUpcoming(a: Athlete) {
	const today = athleteToday(a.id);
	const week = getWeek(a, weekStart(today));
	const next = addDays(today, 1);
	const nextWeek = next > addDays(weekStart(today), 6) ? getWeek(a, weekStart(next)) : week;
	return {
		today: week.days.find((d) => d.date === today)!,
		tomorrow: nextWeek.days.find((d) => d.date === next)!
	};
}
