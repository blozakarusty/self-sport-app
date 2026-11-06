import { and, asc, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { db } from './db';
import { activity, benchmark, benchmarkResult, type Athlete } from './db/schema';
import { athleteToday, hrProfile } from './dashboard';
import { activityLoad, addDays } from './engine/metrics/load';
import {
	BENCHMARK_LIBRARY,
	benchmarkDef,
	benchmarkProgress,
	STRENGTH_SPORTS,
	strengthWeeks,
	weeklyTrend
} from './engine/strength/benchmarks';
import { activeGoal, goalTimeline } from './goals';

/** Add the starter benchmarks the first time; afterwards you manage the list. */
export function ensureStarterBenchmarks(athleteId: number) {
	const count =
		db
			.select({ n: sql<number>`count(*)` })
			.from(benchmark)
			.where(eq(benchmark.athleteId, athleteId))
			.get()?.n ?? 0;
	if (count > 0) return;
	for (const def of BENCHMARK_LIBRARY.filter((b) => b.starter))
		addBenchmarkFromLibrary(athleteId, def.key);
}

export function addBenchmarkFromLibrary(athleteId: number, key: string) {
	const def = benchmarkDef(key);
	if (!def) throw new Error(`Unknown benchmark ${key}`);
	db.insert(benchmark)
		.values({
			athleteId,
			key: def.key,
			name: def.name,
			category: def.category,
			unit: def.unit,
			better: def.better,
			target: def.target && 'fixed' in def.target ? def.target.fixed : null
		})
		.run();
}

const STRENGTH_SPORT_LIST = [...STRENGTH_SPORTS];

export function getStrength(a: Athlete) {
	ensureStarterBenchmarks(a.id);
	const today = athleteToday(a.id);
	const hr = hrProfile(a);

	const sessions = db
		.select({
			id: activity.id,
			name: activity.name,
			sportType: activity.sportType,
			startDateLocal: activity.startDateLocal,
			movingTime: activity.movingTime,
			avgHr: activity.avgHr,
			rpe: activity.rpe,
			strengthSplit: activity.strengthSplit
		})
		.from(activity)
		.where(
			and(
				eq(activity.athleteId, a.id),
				inArray(activity.sportType, STRENGTH_SPORT_LIST),
				gte(activity.startDateLocal, addDays(today, -7 * 12))
			)
		)
		.orderBy(desc(activity.startDateLocal))
		.all()
		.map((s) => ({ ...s, ...activityLoad(s, hr) }));

	// Phase-based recommendation, when a goal is set
	const g = activeGoal(a.id);
	const timeline = g ? goalTimeline(g, today) : null;
	const testWeeks =
		timeline?.phases.map((p) => p.testWeek).filter((w): w is string => w != null) ?? [];
	const nextTestWeek = testWeeks.find((w) => addDays(w, 6) >= today) ?? null;

	const rows = db
		.select()
		.from(benchmark)
		.where(eq(benchmark.athleteId, a.id))
		.orderBy(asc(benchmark.id))
		.all();
	const results = rows.length
		? db
				.select()
				.from(benchmarkResult)
				.where(
					inArray(
						benchmarkResult.benchmarkId,
						rows.map((r) => r.id)
					)
				)
				.orderBy(asc(benchmarkResult.date), asc(benchmarkResult.id))
				.all()
		: [];

	const benchmarks = rows.map((b) => {
		const rs = results.filter((r) => r.benchmarkId === b.id);
		const baseline = rs[0]?.value ?? null;
		const latest = rs.at(-1)?.value ?? null;
		const def = benchmarkDef(b.key);
		return {
			...b,
			how: def?.how ?? null,
			results: rs.map((r) => ({ id: r.id, date: r.date, value: r.value })),
			baseline,
			latest,
			best: rs.length
				? b.better === 'higher'
					? Math.max(...rs.map((r) => r.value))
					: Math.min(...rs.map((r) => r.value))
				: null,
			progress: benchmarkProgress(baseline, latest, b.target, b.better),
			trendPerWeek: weeklyTrend(rs),
			lastTested: rs.at(-1)?.date ?? null
		};
	});

	return {
		today,
		sessions,
		weeks: strengthWeeks(sessions, today, 12),
		recommendedPerWeek: timeline?.current?.strengthPerWeek ?? 3,
		phase: timeline?.current ?? null,
		nextTestWeek,
		benchmarks,
		library: BENCHMARK_LIBRARY.filter((d) => !rows.some((r) => r.key === d.key)).map((d) => ({
			key: d.key,
			name: d.name,
			category: d.category
		})),
		stravaWeightKg: a.weightKg
	};
}

/** This week's strength sessions by tag, for the Today page. */
export function strengthThisWeek(a: Athlete) {
	const today = athleteToday(a.id);
	const sessions = db
		.select({
			sportType: activity.sportType,
			startDateLocal: activity.startDateLocal,
			strengthSplit: activity.strengthSplit
		})
		.from(activity)
		.where(
			and(
				eq(activity.athleteId, a.id),
				inArray(activity.sportType, STRENGTH_SPORT_LIST),
				gte(activity.startDateLocal, addDays(today, -7))
			)
		)
		.all();
	return strengthWeeks(sessions, today, 1)[0];
}
