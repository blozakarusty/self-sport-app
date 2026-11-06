import { describe, expect, it } from 'vitest';
import {
	acwrZone,
	activityLoad,
	addDays,
	dailyLoads,
	estimateMaxHr,
	fitnessSeries,
	trimp
} from './load';
import { weekStart, weeklyVolume } from './volume';

const hr = { maxHr: 199, restHr: 55 };

describe('trimp', () => {
	it('grows with duration and intensity', () => {
		const easy = trimp(60, 140, hr);
		expect(trimp(120, 140, hr)).toBeCloseTo(easy * 2);
		expect(trimp(60, 170, hr)).toBeGreaterThan(easy * 1.5);
	});

	it('clamps HR outside the reserve range', () => {
		expect(trimp(60, 40, hr)).toBe(0);
		expect(trimp(60, 250, hr)).toBeCloseTo(trimp(60, 199, hr));
	});

	it('gives ~90 for an hour of easy running', () => {
		// HR reserve ≈ 0.6: a typical Z2 run
		expect(trimp(60, 141, hr)).toBeGreaterThan(70);
		expect(trimp(60, 141, hr)).toBeLessThan(110);
	});
});

describe('activityLoad', () => {
	const run = { startDateLocal: '2026-11-06T12:00:00', sportType: 'Run', movingTime: 3600 };

	it('uses TRIMP when HR is present', () => {
		expect(activityLoad({ ...run, avgHr: 141 }, hr).method).toBe('trimp');
	});

	it('falls back to a sport estimate without HR or HR profile', () => {
		expect(activityLoad({ ...run, avgHr: null }, hr)).toEqual({ load: 90, method: 'estimate' });
		expect(activityLoad({ ...run, avgHr: 141 }, null).method).toBe('estimate');
		expect(activityLoad({ ...run, sportType: 'Unknown', avgHr: null }, hr).load).toBe(60);
	});

	it('keeps the estimate in the same range as TRIMP for easy runs', () => {
		const est = activityLoad({ ...run, avgHr: null }, hr).load;
		const real = activityLoad({ ...run, avgHr: 141 }, hr).load;
		expect(Math.abs(est - real) / real).toBeLessThan(0.25);
	});
});

describe('dailyLoads', () => {
	it('sums per local day and zero-fills gaps', () => {
		const acts = [
			{ startDateLocal: '2026-11-01T08:00:00', sportType: 'Run', movingTime: 600, avgHr: null },
			{ startDateLocal: '2026-11-01T18:00:00', sportType: 'Run', movingTime: 600, avgHr: null },
			{ startDateLocal: '2026-11-03T23:59:00', sportType: 'Walk', movingTime: 600, avgHr: null },
			{ startDateLocal: '2026-10-20T08:00:00', sportType: 'Run', movingTime: 600, avgHr: null }
		];
		expect(dailyLoads(acts, null, '2026-11-01', '2026-11-03')).toEqual([
			{ day: '2026-11-01', load: 30 },
			{ day: '2026-11-02', load: 0 },
			{ day: '2026-11-03', load: 5 }
		]);
	});
});

describe('fitnessSeries', () => {
	const constant = (n: number, load: number) =>
		Array.from({ length: n }, (_, i) => ({ day: addDays('2026-01-01', i), load }));

	it('converges to a constant daily load', () => {
		const last = fitnessSeries(constant(400, 80)).at(-1)!;
		expect(last.ctl).toBeCloseTo(80, 0);
		expect(last.atl).toBeCloseTo(80, 3);
		expect(last.acwr).toBeCloseTo(1, 1);
	});

	it('fatigue reacts faster than fitness, making form negative after a hard block', () => {
		const series = fitnessSeries([...constant(200, 50), ...constant(7, 150)]);
		const last = series.at(-1)!;
		expect(last.atl).toBeGreaterThan(last.ctl);
		expect(last.tsb).toBeLessThan(0);
		expect(acwrZone(last.acwr!)).not.toBe('optimal');
	});

	it('reports no ACWR while fitness is tiny', () => {
		expect(fitnessSeries(constant(3, 1)).at(-1)!.acwr).toBeNull();
	});
});

describe('acwrZone', () => {
	it('maps to the usual bands', () => {
		expect([0.5, 1, 1.4, 2].map(acwrZone)).toEqual(['low', 'optimal', 'caution', 'high']);
	});
});

describe('estimateMaxHr', () => {
	it('ignores spikes and missing values', () => {
		expect(estimateMaxHr([null, 180, 195, 240, 90])).toBe(195);
		expect(estimateMaxHr([null])).toBeNull();
	});
});

describe('weekly volume', () => {
	it('finds the Monday of a week', () => {
		expect(weekStart('2026-11-06')).toBe('2026-11-02'); // Friday
		expect(weekStart('2026-11-08')).toBe('2026-11-02'); // Sunday
		expect(weekStart('2026-11-02')).toBe('2026-11-02'); // Monday
	});

	it('buckets run km and hours per sport', () => {
		const acts = [
			{
				startDateLocal: '2026-11-03T08:00:00',
				sportType: 'Run',
				movingTime: 1800,
				distance: 6000,
				elevationGain: 10
			},
			{
				startDateLocal: '2026-11-04T08:00:00',
				sportType: 'TrailRun',
				movingTime: 3600,
				distance: 9000,
				elevationGain: 300
			},
			{
				startDateLocal: '2026-11-05T20:00:00',
				sportType: 'Tennis',
				movingTime: 3600,
				distance: 2000,
				elevationGain: 0
			},
			{
				startDateLocal: '2026-10-28T08:00:00',
				sportType: 'Run',
				movingTime: 1800,
				distance: 5000,
				elevationGain: 0
			}
		];
		const [prev, cur] = weeklyVolume(acts, '2026-11-06', 2);
		expect(prev.runKm).toBe(5);
		expect(cur).toMatchObject({ week: '2026-11-02', runKm: 15, runElevation: 310, runCount: 2 });
		expect(cur.hoursBySport).toEqual({ Run: 0.5, TrailRun: 1, Tennis: 1 });
	});
});
