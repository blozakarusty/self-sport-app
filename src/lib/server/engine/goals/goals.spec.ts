import { describe, expect, it } from 'vitest';
import { macroPhases, phaseOn, planWeek, taperWeeks } from './phases';
import {
	expectedVdot,
	goalPaceKm,
	goalStatus,
	longestRoadRun,
	rampShare,
	readinessTargets,
	requiredVdot,
	weeklyKmAverage
} from './readiness';

describe('macroPhases', () => {
	// Your goal: marathon on Sun 11 Apr 2027, planning from Fri 6 Nov 2026
	const phases = macroPhases('2026-11-06', '2027-04-11', 42195);

	it('splits 23 weeks into base, build, peak and a 3-week taper', () => {
		expect(phases.map((p) => [p.name, p.weeks])).toEqual([
			['base', 7],
			['build', 7],
			['peak', 6],
			['taper', 3]
		]);
		expect(phases[0].start).toBe('2026-11-02'); // Monday of this week
		expect(phases.at(-1)!.end).toBe('2027-04-11');
	});

	it('is contiguous', () => {
		for (let i = 1; i < phases.length; i++) {
			expect(Date.parse(phases[i].start) - Date.parse(phases[i - 1].end)).toBe(864e5);
		}
	});

	it('marks every 4th week as recovery and tests in the last week of each phase', () => {
		expect(phases[0].recoveryWeeks).toEqual(['2026-11-23']);
		expect(phases[0].testWeek).toBe('2026-12-14');
		expect(phases.at(-1)!.testWeek).toBeNull();
	});

	it('drops base for short runways and shortens taper for short races', () => {
		expect(macroPhases('2026-11-06', '2026-12-13', 10000).map((p) => p.name)).toEqual([
			'build',
			'peak',
			'taper'
		]);
		expect(taperWeeks(5000)).toBe(1);
		expect(taperWeeks(21097)).toBe(2);
	});

	it('finds the phase and week for a day', () => {
		expect(phaseOn(phases, '2026-11-06')?.name).toBe('base');
		expect(phaseOn(phases, '2027-04-11')?.name).toBe('taper');
		expect(planWeek(phases, '2026-11-09')).toBe(2);
	});

	it('returns nothing for a race in the past', () => {
		expect(macroPhases('2026-11-06', '2026-10-01', 42195)).toEqual([]);
	});
});

describe('goal fitness', () => {
	it('knows a 3:20 marathon needs VDOT ~47', () => {
		expect(requiredVdot(42195, 3 * 3600 + 20 * 60)).toBeCloseTo(47.2, 1);
	});

	it('expects a straight line to the target by the taper', () => {
		const e = (d: string) => expectedVdot('2026-11-06', 42, 47, '2027-03-22', d);
		expect(e('2026-11-06')).toBe(42);
		expect(e('2027-03-22')).toBe(47);
		expect(e('2027-04-11')).toBe(47);
		expect(e('2027-01-13')).toBeCloseTo(44.5, 1);
	});

	it('rates progress against the line', () => {
		expect(goalStatus(44, 43)).toBe('ahead');
		expect(goalStatus(43, 43.2)).toBe('on-track');
		expect(goalStatus(42, 43)).toBe('behind');
	});
});

describe('readiness', () => {
	const run = (day: string, km: number, extra: object = {}) => ({
		startDateLocal: `${day}T10:00:00`,
		sportType: 'Run',
		distance: km * 1000,
		movingTime: km * 300,
		elevationGain: 0,
		...extra
	});

	it('scales targets with distance and ambition', () => {
		const m320 = readinessTargets(42195, 47.2);
		expect(m320.peakWeeklyKm).toBeGreaterThanOrEqual(55);
		expect(m320.peakWeeklyKm).toBeLessThanOrEqual(70);
		expect(m320.longRunKm).toBe(32);
		expect(readinessTargets(42195, 55).peakWeeklyKm).toBeGreaterThan(m320.peakWeeklyKm);
		expect(readinessTargets(5000, 47).peakWeeklyKm).toBeLessThan(m320.peakWeeklyKm);
	});

	it('ramps expected volume up to the peak phase and down in the taper', () => {
		const phases = macroPhases('2026-11-06', '2027-04-11', 42195);
		expect(rampShare(phases, '2026-11-02', 0.5)).toBe(0.5);
		expect(rampShare(phases, phases[2].start, 0.5)).toBe(1);
		expect(rampShare(phases, '2027-04-01', 0.5)).toBe(0.6);
	});

	it('averages weekly km and ignores other sports', () => {
		const runs = [
			run('2026-11-01', 20),
			run('2026-10-20', 20),
			{ ...run('2026-11-02', 50), sportType: 'Ride' }
		];
		expect(weeklyKmAverage(runs, '2026-11-06')).toBe(10);
	});

	it('takes the longest road run but skips ultras and trail', () => {
		const runs = [
			run('2026-10-10', 104),
			run('2026-10-20', 21),
			{ ...run('2026-10-25', 30), sportType: 'TrailRun' }
		];
		expect(longestRoadRun(runs, '2026-11-06', 42195)).toBe(21);
	});

	it('counts km near goal pace from laps', () => {
		const r = run('2026-11-01', 16, {
			laps: [
				{ distance: 3000, movingTime: 3 * 330 },
				{ distance: 10000, movingTime: 10 * 286 }, // 4:46 vs goal 4:44 → counts
				{ distance: 3000, movingTime: 3 * 330 }
			]
		});
		expect(goalPaceKm([r], '2026-11-06', 284)).toBeCloseTo(10);
	});
});
