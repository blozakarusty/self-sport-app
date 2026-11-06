import { describe, expect, it } from 'vitest';
import {
	classifyIntensity,
	classifyPace,
	runIntensity,
	intensityByWeek,
	loadBySport,
	longestRunPerWeek,
	monthlyHoursBySport,
	OTHER,
	sumIntensity,
	zonesFromMaxHr
} from './insights';
import {
	defaultRefHr,
	efficiencyBetween,
	efficiencyTrend,
	isEfficiencyRun,
	paceAtHr
} from '../performance/aerobic';

const act = (
	startDateLocal: string,
	sportType: string,
	minutes: number,
	km = 0,
	avgHr: number | null = null,
	elevationGain = 0
) => ({
	startDateLocal: `${startDateLocal}T10:00:00`,
	sportType,
	movingTime: minutes * 60,
	distance: km * 1000,
	elevationGain,
	avgHr
});

const zones = [
	{ min: 0, max: 129 },
	{ min: 130, max: 161 },
	{ min: 162, max: 177 },
	{ min: 178, max: 193 },
	{ min: 194, max: -1 }
];

describe('monthlyHoursBySport', () => {
	it('buckets by month and folds small sports into Other', () => {
		const r = monthlyHoursBySport(
			[
				act('2026-10-02', 'Run', 120),
				act('2026-11-03', 'Run', 60),
				act('2026-11-04', 'Tennis', 90),
				act('2026-11-05', 'Yoga', 30),
				act('2026-11-05', 'Hike', 15),
				act('2025-01-01', 'Run', 600) // out of range
			],
			'2026-11-06',
			2,
			2
		);
		expect(r.months).toEqual(['2026-10', '2026-11']);
		expect(r.sports).toEqual(['Run', 'Tennis', OTHER]);
		expect(r.hours[0]).toEqual({ Run: 2 });
		expect(r.hours[1]).toEqual({ Run: 1, Tennis: 1.5, [OTHER]: 0.75 });
	});

	it('handles year boundaries', () => {
		expect(monthlyHoursBySport([], '2026-01-15', 3).months).toEqual([
			'2025-11',
			'2025-12',
			'2026-01'
		]);
	});
});

describe('longestRunPerWeek', () => {
	it('keeps the longest run of each week', () => {
		const [w1, w2] = longestRunPerWeek(
			[
				act('2026-10-27', 'Run', 60, 10),
				act('2026-10-31', 'TrailRun', 120, 21),
				act('2026-11-03', 'Ride', 120, 60)
			],
			'2026-11-06',
			2
		);
		expect(w1).toMatchObject({ week: '2026-10-26', km: 21 });
		expect(w2.km).toBe(0); // rides don't count
	});
});

describe('intensity', () => {
	it('classifies by zone', () => {
		expect([145, 161, 170, 185].map((hr) => classifyIntensity(hr, zones))).toEqual([
			'easy',
			'easy',
			'moderate',
			'hard'
		]);
	});

	it('derives zones from max HR', () => {
		expect(zonesFromMaxHr(200)[1]).toEqual({ min: 130, max: 162 });
	});

	it('sums run minutes per week and computes the easy share', () => {
		const weeks = intensityByWeek(
			[
				act('2026-11-02', 'Run', 60, 10, 145),
				act('2026-11-03', 'Run', 30, 7, 182),
				act('2026-11-04', 'Run', 30, 5, null), // no HR: skipped
				act('2026-11-04', 'Tennis', 60, 0, 170) // not a run
			],
			zones,
			null,
			'2026-11-06',
			1
		);
		expect(weeks[0]).toEqual({ week: '2026-11-02', easy: 60, moderate: 0, hard: 30 });
		expect(sumIntensity(weeks).easyShare).toBeCloseTo(2 / 3);
	});
});

describe('loadBySport', () => {
	it('totals load per sport within the range, biggest first', () => {
		const r = loadBySport(
			[
				act('2026-11-01', 'Run', 60),
				act('2026-11-02', 'Tennis', 60),
				act('2026-10-01', 'Run', 600)
			],
			null,
			'2026-10-15',
			'2026-11-06'
		);
		expect(r.map((s) => s.sport)).toEqual(['Run', 'Tennis']);
		expect(r[0]).toMatchObject({ load: 90, hours: 1, count: 1 });
	});
});

describe('aerobic efficiency', () => {
	const easy = (date: string, paceSec: number, hr: number) =>
		act(date, 'Run', (10 * paceSec) / 60, 10, hr);

	it('only uses flat road runs with HR of 5 km or more', () => {
		expect(isEfficiencyRun(easy('2026-11-01', 320, 145))).toBe(true);
		expect(isEfficiencyRun({ ...easy('2026-11-01', 320, 145), sportType: 'TrailRun' })).toBe(false);
		expect(isEfficiencyRun(act('2026-11-01', 'Run', 20, 4, 145))).toBe(false);
		expect(isEfficiencyRun(act('2026-11-01', 'Run', 60, 10, 145, 400))).toBe(false);
	});

	it('reports pace at the reference HR', () => {
		// 5:20/km at 145 bpm → exactly 5:20/km at 145
		expect(
			efficiencyBetween([easy('2026-11-01', 320, 145)], 145, '2026-10-01', '2026-11-06')?.pace
		).toBeCloseTo(320);
		// same run, reference HR 10% higher → ~10% faster pace
		expect(paceAtHr(10_000 / (3200 / 60) / 145, 159.5)).toBeCloseTo(320 / 1.1);
	});

	it('shows improvement week over week', () => {
		const trend = efficiencyTrend(
			[easy('2026-10-27', 330, 145), easy('2026-11-03', 320, 145)],
			145,
			'2026-11-06',
			2
		);
		expect(trend[1].pace!).toBeLessThan(trend[0].pace!);
	});

	it('picks a reference HR from zone 2', () => {
		expect(defaultRefHr(zones, 199)).toBe(146);
		expect(defaultRefHr(null, 200)).toBe(150);
		expect(defaultRefHr(null, null)).toBeNull();
	});
});

describe('pace-based intensity', () => {
	const bands = { marathon: 311, threshold: 291 }; // 5:11 and 4:51 /km
	const lap = (meters: number, seconds: number) => ({ distance: meters, movingTime: seconds });

	it('classifies pace against marathon and threshold', () => {
		expect([400, 315, 300, 225].map((p) => classifyPace(p, bands))).toEqual([
			'easy',
			'moderate',
			'moderate',
			'hard'
		]);
	});

	it('finds the hard reps in an interval session with an easy-looking average HR', () => {
		const run = {
			...act('2026-09-23', 'Run', 43, 8, 144),
			laps: [lap(1000, 339), lap(400, 90), lap(90, 60), lap(400, 92), lap(90, 60), lap(1000, 348)]
		};
		const r = runIntensity(run, zones, bands);
		expect(r.hard).toBeCloseTo((90 + 92) / 60);
		expect(r.easy).toBeCloseTo((339 + 60 + 60 + 348) / 60);
		// without pace bands it falls back to average HR
		expect(runIntensity(run, zones, null)).toEqual({ easy: 43 });
	});

	it('keeps a steady run easy when HR says easy, even if pace looks moderate', () => {
		const steady = {
			...act('2026-11-06', 'Run', 39, 7.2, 142),
			splits: [lap(1000, 318), lap(1000, 322)]
		};
		expect(runIntensity(steady, zones, bands)).toEqual({ easy: 640 / 60 });
	});

	it('uses HR for trail runs, where pace reflects terrain', () => {
		const trail = {
			...act('2026-08-01', 'TrailRun', 60, 8, 150),
			laps: [lap(4000, 1800), lap(4000, 1800)]
		};
		expect(runIntensity(trail, zones, bands)).toEqual({ easy: 60 });
	});
});
