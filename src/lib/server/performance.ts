import { and, asc, eq, gte, inArray } from 'drizzle-orm';
import { db } from './db';
import {
	activity,
	bestEffort,
	performance,
	type Athlete,
	type PaceName,
	type PaceOverrides
} from './db/schema';
import { athleteToday, hrProfile } from './dashboard';
import { addDays } from './engine/metrics/load';
import { weekStart } from './engine/metrics/volume';
import { defaultRefHr, efficiencyBetween, efficiencyTrend } from './engine/performance/aerobic';
import {
	estimateVdot,
	predictTime,
	predictUltra,
	RACE_DISTANCES,
	trainingPaces,
	vdotHistory,
	type Effort
} from './engine/performance/vdot';
import { DETAIL_SPORTS, pendingDetailCount } from './sources/strava/index';
import { EFFORT_NAMES, effortLabel } from '../format';

interface EffortRow {
	id: string;
	name: string;
	distance: number;
	elapsedTime: number;
	startDateLocal: string;
	activityId: string;
	activityName: string;
	activityDistance: number;
	sourceId: string;
}

function effortRows(athleteId: number): EffortRow[] {
	return db
		.select({
			id: bestEffort.id,
			name: bestEffort.name,
			distance: bestEffort.distance,
			elapsedTime: bestEffort.elapsedTime,
			startDateLocal: bestEffort.startDateLocal,
			activityId: bestEffort.activityId,
			activityName: activity.name,
			activityDistance: activity.distance,
			sourceId: activity.sourceId
		})
		.from(bestEffort)
		.innerJoin(activity, eq(bestEffort.activityId, activity.id))
		.where(eq(bestEffort.athleteId, athleteId))
		.all();
}

/**
 * A long effort inside a much longer run (a marathon split from a 100 km ultra)
 * says little about race fitness at that distance.
 */
function insideLongerRun(e: EffortRow) {
	return e.distance >= 21000 && e.activityDistance > e.distance * 1.2;
}

function manualResults(athleteId: number) {
	return db
		.select()
		.from(performance)
		.where(eq(performance.athleteId, athleteId))
		.orderBy(asc(performance.date))
		.all();
}

function toEfforts(rows: EffortRow[], manual: ReturnType<typeof manualResults>): Effort[] {
	return [
		...rows.map((e) => ({
			distance: e.distance,
			time: e.elapsedTime,
			date: e.startDateLocal.slice(0, 10),
			label: `${effortLabel(e.name)} in “${e.activityName}”`,
			source: 'best-effort' as const,
			activityId: e.activityId
		})),
		...manual.map((m) => ({
			distance: m.distance,
			time: m.time,
			date: m.date,
			label: m.name,
			source: 'manual' as const
		}))
	];
}

/** All efforts (best efforts + manual results) that feed the VDOT estimate. */
export function athleteEfforts(athleteId: number): Effort[] {
	return toEfforts(effortRows(athleteId), manualResults(athleteId));
}

/** VDOT estimate at the end of each of the last `weeks` weeks. */
export function weeklyVdot(efforts: Effort[], today: string, weeks: number) {
	const thisWeek = weekStart(today);
	const ends = Array.from({ length: weeks }, (_, i) =>
		addDays(thisWeek, -7 * (weeks - 1 - i) + 6)
	).map((d) => (d > today ? today : d));
	return vdotHistory(efforts, ends);
}

/**
 * Training paces (s/km) for the planner, from your current VDOT and overrides.
 * Without any estimate yet, falls back to `fallbackVdot` (e.g. the goal's).
 */
export function paceTableFor(a: Athlete, fallbackVdot: number, goalPace?: number) {
	const today = athleteToday(a.id);
	const value = estimateVdot(athleteEfforts(a.id), today)?.value ?? fallbackVdot;
	const p = applyOverrides(trainingPaces(value), a.paceOverrides);
	return {
		vdot: value,
		easyRange: p.easy.range ?? ([p.easy.value, p.easy.value] as [number, number]),
		table: {
			easy: p.easy.value,
			marathon: p.marathon.value,
			threshold: p.threshold.value,
			interval: p.interval.value,
			strides: p.repetition.value,
			jog: p.easy.value * 1.1,
			goal: goalPace
		}
	};
}

export function currentVdot(a: Athlete) {
	const today = athleteToday(a.id);
	const estimate = estimateVdot(toEfforts(effortRows(a.id), manualResults(a.id)), today);
	if (!estimate) return null;
	const paces = applyOverrides(trainingPaces(estimate.value), a.paceOverrides);
	return {
		value: estimate.value,
		fiveK: predictTime(estimate.value, 5000),
		marathon: paces.marathon.value,
		threshold: paces.threshold.value
	};
}

type PaceRow = {
	name: PaceName;
	label: string;
	value: number;
	range?: [number, number];
	overridden: boolean;
	purpose: string;
};

function applyOverrides(p: ReturnType<typeof trainingPaces>, o: PaceOverrides | null) {
	const row = (
		name: PaceName,
		label: string,
		value: number,
		purpose: string,
		range?: [number, number]
	): PaceRow => ({
		name,
		label,
		value: o?.[name] ?? value,
		range: o?.[name] ? undefined : range,
		overridden: o?.[name] != null,
		purpose
	});
	return {
		easy: row('easy', 'Easy', (p.easy[0] + p.easy[1]) / 2, 'Recovery, easy and long runs', p.easy),
		marathon: row('marathon', 'Marathon', p.marathon, 'Steady long-run segments, marathon pace'),
		threshold: row(
			'threshold',
			'Threshold',
			p.threshold,
			'Tempo runs and cruise intervals (~1 hour race effort)'
		),
		interval: row('interval', 'Interval', p.interval, '3–5 min repeats at ~3K–5K effort'),
		repetition: row(
			'repetition',
			'Repetition',
			p.repetition,
			'Short fast repeats (200–400 m), full recovery'
		)
	};
}

export function getPerformance(a: Athlete) {
	const today = athleteToday(a.id);
	const rows = effortRows(a.id);
	const manual = manualResults(a.id);
	const efforts = toEfforts(rows, manual);
	const estimate = estimateVdot(efforts, today);

	// VDOT trend: estimate at the end of each of the last 52 weeks
	const thisWeek = weekStart(today);
	const weekEnds = Array.from({ length: 52 }, (_, i) => addDays(thisWeek, -7 * (51 - i) + 6)).map(
		(d) => (d > today ? today : d)
	);
	const vdotTrend = vdotHistory(efforts, weekEnds);

	// Aerobic efficiency from flat road runs
	const hr = hrProfile(a);
	const refHr = a.refHr ?? defaultRefHr(a.hrZones ?? null, hr?.maxHr ?? null);
	const since = addDays(today, -26 * 7);
	const runs = db
		.select({
			startDateLocal: activity.startDateLocal,
			sportType: activity.sportType,
			distance: activity.distance,
			movingTime: activity.movingTime,
			elevationGain: activity.elevationGain,
			avgHr: activity.avgHr
		})
		.from(activity)
		.where(
			and(
				eq(activity.athleteId, a.id),
				inArray(activity.sportType, DETAIL_SPORTS),
				gte(activity.startDateLocal, since)
			)
		)
		.all();
	const efficiency = refHr
		? {
				refHr,
				refHrSource: a.refHr ? ('user' as const) : ('zone 2' as const),
				trend: efficiencyTrend(runs, refHr, today, 26),
				recent: efficiencyBetween(runs, refHr, addDays(today, -27), today),
				earlier: efficiencyBetween(runs, refHr, addDays(today, -83), addDays(today, -56))
			}
		: null;

	// Personal records: all-time and per year, per distance
	const years = [...new Set(rows.map((r) => r.startDateLocal.slice(0, 4)))]
		.sort()
		.reverse()
		.slice(0, 3);
	const records = EFFORT_NAMES.map(({ key: name, label }) => {
		const all = rows
			.filter((r) => r.name.toLowerCase() === name)
			.sort((x, y) => x.elapsedTime - y.elapsedTime);
		if (!all.length) return null;
		const pick = (r: EffortRow | undefined) =>
			r && {
				time: r.elapsedTime,
				date: r.startDateLocal.slice(0, 10),
				activityId: r.activityId,
				activityName: r.activityName,
				insideLongerRun: insideLongerRun(r)
			};
		return {
			name,
			label,
			best: pick(all[0])!,
			byYear: Object.fromEntries(
				years.map((y) => [y, pick(all.find((r) => r.startDateLocal.startsWith(y)))])
			)
		};
	}).filter((r) => r != null);

	return {
		today,
		estimate: estimate && {
			value: estimate.value,
			raw: estimate.raw,
			effort: estimate.effort
		},
		paces: estimate
			? Object.values(applyOverrides(trainingPaces(estimate.value), a.paceOverrides))
			: null,
		paceOverrides: a.paceOverrides ?? {},
		predictions: estimate
			? [
					...RACE_DISTANCES.map((r) => ({
						...r,
						time: predictTime(estimate.value, r.distance),
						rough: false
					})),
					{
						name: '50K trail (1,000 m climb)',
						distance: 50000,
						time: predictUltra(estimate.value, 50000, 1000),
						rough: true
					},
					{
						name: '100K (flat)',
						distance: 100000,
						time: predictUltra(estimate.value, 100000),
						rough: true
					}
				]
			: null,
		vdotTrend,
		efficiency,
		records,
		years,
		manual,
		detailsPending: pendingDetailCount(a.id),
		effortCount: rows.length
	};
}
