import { and, desc, eq, gte, inArray } from 'drizzle-orm';
import { db } from './db';
import { activity, goal, type Athlete, type Goal } from './db/schema';
import { athleteToday } from './dashboard';
import { addDays } from './engine/metrics/load';
import { weekStart } from './engine/metrics/volume';
import { estimateVdot, predictTime } from './engine/performance/vdot';
import { macroPhases, PHASE_INFO, phaseOn, planWeek } from './engine/goals/phases';
import {
	expectedVdot,
	goalPaceKm,
	goalStatus,
	longestRoadRun,
	rampShare,
	readinessTargets,
	requiredVdot,
	weeklyKmAverage
} from './engine/goals/readiness';
import { athleteEfforts, weeklyVdot } from './performance';
import { DETAIL_SPORTS } from './sources/strava/index';

export function activeGoal(athleteId: number): Goal | null {
	return (
		db
			.select()
			.from(goal)
			.where(and(eq(goal.athleteId, athleteId), eq(goal.active, true)))
			.orderBy(desc(goal.date))
			.get() ?? null
	);
}

/** Phases and the current position in them, without the heavier readiness numbers. */
export function goalTimeline(g: Goal, today: string) {
	const phases = macroPhases(g.startDate, g.date, g.distance);
	const current = phaseOn(phases, today);
	return {
		phases: phases.map((p) => ({ ...p, ...PHASE_INFO[p.name] })),
		current: current && { ...current, ...PHASE_INFO[current.name] },
		week: planWeek(phases, today),
		totalWeeks: phases.reduce((n, p) => n + p.weeks, 0),
		daysToGo: Math.round((Date.parse(g.date) - Date.parse(today)) / 864e5)
	};
}

export function getGoalView(a: Athlete) {
	const g = activeGoal(a.id);
	if (!g) return null;
	const today = athleteToday(a.id);
	const timeline = goalTimeline(g, today);
	const efforts = athleteEfforts(a.id);
	const current = estimateVdot(efforts, today)?.value ?? null;
	const target = requiredVdot(g.distance, g.targetTime);
	const start = g.startVdot ?? current;
	const taper = timeline.phases.find((p) => p.name === 'taper');
	const taperStart = taper?.start ?? g.date;
	const expected =
		start != null ? expectedVdot(g.startDate, start, target, taperStart, today) : null;

	// Fitness path: one point per week from 26 weeks ago to race week. Actual
	// VDOT up to today; the target line from the goal start to race day.
	const actualByWeek = new Map(
		weeklyVdot(efforts, today, 26).map((p) => [weekStart(p.day), p.value])
	);
	const path: { day: string; actual: number | null; target: number | null }[] = [];
	for (let w = addDays(weekStart(today), -25 * 7); w <= weekStart(g.date); w = addDays(w, 7)) {
		const end = addDays(w, 6);
		const day = end > g.date ? g.date : end > today && w <= today ? today : end;
		path.push({
			day,
			actual: w <= today ? (actualByWeek.get(w) ?? null) : null,
			target:
				start != null && day >= g.startDate
					? expectedVdot(g.startDate, start, target, taperStart, day)
					: null
		});
	}

	// Supporting readiness markers
	const runs = db
		.select({
			startDateLocal: activity.startDateLocal,
			sportType: activity.sportType,
			distance: activity.distance,
			movingTime: activity.movingTime,
			elevationGain: activity.elevationGain,
			laps: activity.laps,
			splits: activity.splits
		})
		.from(activity)
		.where(
			and(
				eq(activity.athleteId, a.id),
				inArray(activity.sportType, DETAIL_SPORTS),
				gte(activity.startDateLocal, addDays(today, -60))
			)
		)
		.all();
	const targets = readinessTargets(g.distance, target);
	const goalPace = g.targetTime / (g.distance / 1000);
	const share = rampShare(macroPhases(g.startDate, g.date, g.distance), today, 0.5);
	const readiness = [
		{
			key: 'volume',
			label: 'Weekly volume, 4-week average',
			unit: 'km',
			value: weeklyKmAverage(runs, today),
			target: targets.peakWeeklyKm,
			expected: targets.peakWeeklyKm * share,
			note: `Peak target ~${targets.peakWeeklyKm} km/week in the peak phase.`
		},
		{
			key: 'longrun',
			label: 'Longest road run, last 6 weeks',
			unit: 'km',
			value: longestRoadRun(runs, today, g.distance),
			target: targets.longRunKm,
			expected: targets.longRunKm * share,
			note: 'Trail runs and ultras are left out.'
		},
		{
			key: 'goalpace',
			label: 'Km at goal pace, last 4 weeks',
			unit: 'km',
			value: goalPaceKm(runs, today, goalPace),
			target: targets.goalPaceKm4w,
			// goal-pace work starts in the build phase
			expected: timeline.current?.name === 'base' ? 0 : targets.goalPaceKm4w * share,
			note: 'Laps or km splits within 3% of goal pace.'
		}
	];

	return {
		goal: g,
		today,
		...timeline,
		goalPace,
		fitness: {
			start,
			current,
			target,
			expected,
			status: current != null && expected != null ? goalStatus(current, expected) : null,
			predicted: current != null ? predictTime(current, g.distance) : null
		},
		path,
		readiness
	};
}
