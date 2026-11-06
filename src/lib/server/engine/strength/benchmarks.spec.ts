import { describe, expect, it } from 'vitest';
import {
	BENCHMARK_LIBRARY,
	benchmarkDef,
	benchmarkProgress,
	strengthWeeks,
	suggestTarget,
	weeklyTrend
} from './benchmarks';

describe('benchmark library', () => {
	it('has unique keys and a pull-up target of 10', () => {
		const keys = BENCHMARK_LIBRARY.map((b) => b.key);
		expect(new Set(keys).size).toBe(keys.length);
		expect(suggestTarget(benchmarkDef('pullups-max')!, 4)).toBe(10);
	});

	it('suggests targets from a baseline within bounds', () => {
		expect(suggestTarget(benchmarkDef('pushups-max')!, 30)).toBe(42);
		expect(suggestTarget(benchmarkDef('pushups-max')!, 10)).toBe(30); // min
		expect(suggestTarget(benchmarkDef('plank')!, 150)).toBe(180); // max
		expect(suggestTarget(benchmarkDef('lsit-hold')!, 9)).toBe(20); // rounded to 5 s
		expect(suggestTarget(benchmarkDef('body-weight')!, 83)).toBeNull(); // yours to set
	});

	it('always suggests a step up', () => {
		expect(suggestTarget(benchmarkDef('pistol-squat')!, 15)).toBe(16);
	});
});

describe('benchmarkProgress', () => {
	it('measures the share of the way from baseline to target', () => {
		expect(benchmarkProgress(4, 7, 10, 'higher')).toBeCloseTo(0.5);
		expect(benchmarkProgress(83, 81, 79, 'lower')).toBeCloseTo(0.5);
		expect(benchmarkProgress(4, 3, 10, 'higher')).toBe(0);
		expect(benchmarkProgress(4, 12, 10, 'higher')).toBeCloseTo(8 / 6);
		expect(benchmarkProgress(4, 7, null, 'higher')).toBeNull();
	});
});

describe('weeklyTrend', () => {
	it('fits change per week', () => {
		expect(
			weeklyTrend([
				{ date: '2026-11-01', value: 83 },
				{ date: '2026-11-15', value: 82 }
			])
		).toBeCloseTo(-0.5);
		expect(weeklyTrend([{ date: '2026-11-01', value: 83 }])).toBeNull();
	});
});

describe('strengthWeeks', () => {
	it('counts sessions per week by tag', () => {
		const s = (d: string, split: string | null, sportType = 'WeightTraining') => ({
			startDateLocal: `${d}T12:00:00`,
			sportType,
			strengthSplit: split
		});
		const [w] = strengthWeeks(
			[
				s('2026-11-02', 'push'),
				s('2026-11-04', 'pull'),
				s('2026-11-05', null),
				s('2026-11-05', 'legs', 'Run')
			],
			'2026-11-06',
			1
		);
		expect(w).toEqual({ week: '2026-11-02', push: 1, pull: 1, legs: 0, full: 0, untagged: 1 });
	});
});
