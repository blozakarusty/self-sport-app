import { describe, expect, it } from 'vitest';
import { macroPhases } from '../goals/phases';
import { addDays } from '../metrics/load';
import { generatePlan, DEFAULT_PREFS, planWeeks } from './generate';
import { matchActivities, sessionStatus, summarizeWeek } from './match';
import { qualitySession, stepsKm, weeklyTargets, type PaceTable } from './runs';
import { gtg, snapToBell, strengthSession, FOCUS_INFO, EXERCISES } from './strength';

// Paces (s/km) roughly for VDOT 46, goal 4:44/km
const paces: PaceTable = {
	easy: 340,
	marathon: 287,
	threshold: 270,
	interval: 248,
	strides: 230,
	jog: 380,
	goal: 284
};

const phases = macroPhases('2026-11-06', '2027-04-11', 42195);
const input = {
	today: '2026-11-06',
	raceDay: '2027-04-11',
	raceKm: 42.195,
	phases,
	startKm: 33,
	startLongKm: 19,
	peakKm: 62,
	peakLongKm: 32,
	paces,
	prefs: DEFAULT_PREFS,
	pullupMax: 4,
	weights: {}
};
const { sessions, targets } = generatePlan(input);
const dow = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay(); // 0 = Sunday

describe('weekly targets', () => {
	it('grows volume gradually, never more than 8% between normal weeks', () => {
		const normal = targets.filter((t) => !t.recovery && t.phase !== 'taper');
		for (let i = 1; i < normal.length; i++) {
			// 8% per week; whole-km rounding can show up to ~10%
			expect(normal[i].km / normal[i - 1].km).toBeLessThanOrEqual(1.1);
		}
		expect(Math.max(...targets.map((t) => t.km))).toBe(62);
	});

	it('drops recovery weeks and tapers', () => {
		const rec = targets.find((t) => t.recovery)!;
		expect(rec.km).toBeLessThan(targets[rec.week - 2].km);
		const taper = targets.filter((t) => t.phase === 'taper').map((t) => t.km);
		expect(taper).toEqual([...taper].sort((a, b) => b - a));
	});

	it('builds the long run to 32 km by the peak phase', () => {
		expect(Math.max(...targets.map((t) => t.longKm))).toBe(32);
		expect(targets[0].longKm).toBeLessThanOrEqual(20);
	});

	it('works for a short runway', () => {
		const w = weeklyTargets(planWeeks(macroPhases('2026-11-06', '2026-12-06', 10000)), {
			startKm: 30,
			peakKm: 45,
			startLongKm: 10,
			peakLongKm: 15
		});
		expect(w.at(-1)!.raceWeek).toBe(true);
	});
});

describe('generated plan', () => {
	it('starts today and ends with the race on race day', () => {
		expect(sessions[0].date >= '2026-11-06').toBe(true);
		const race = sessions.filter((s) => s.type === 'race');
		expect(race).toHaveLength(1);
		expect(race[0].date).toBe('2027-04-11');
	});

	it('follows your week: runs Mon/Wed/Fri/Sun, tennis Tue, legs Thu, upper Sat', () => {
		const week = sessions.filter((s) => s.week === 3);
		const on = (d: number, kind: string) =>
			week.filter((s) => dow(s.date) === d && s.kind === kind);
		expect(on(1, 'run')).toHaveLength(1);
		expect(on(3, 'run')[0].type).toBe('quality');
		expect(on(5, 'run')).toHaveLength(1);
		expect(on(0, 'run')[0].type).toBe('long');
		expect(on(2, 'leisure')[0].type).toBe('tennis');
		expect(on(4, 'strength')[0].type).toBe('legs');
		expect(on(2, 'strength')[0].type).toBe('push');
		expect(on(6, 'strength')[0].type).toBe('pull');
	});

	it('keeps legs at least 48 hours before every long run and quality session', () => {
		const legs = sessions.filter((s) => s.type === 'legs');
		const hard = sessions.filter((s) => s.key);
		for (const l of legs) {
			for (const h of hard) {
				const days = (Date.parse(h.date) - Date.parse(l.date)) / 864e5;
				expect(days === 1).toBe(false);
				expect(days === 0).toBe(false);
			}
		}
	});

	it('adds an optional Saturday run only in build and peak', () => {
		const optional = sessions.filter((s) => s.kind === 'run' && s.optional);
		expect(optional.length).toBeGreaterThan(0);
		expect(optional.every((s) => s.phase === 'build' || s.phase === 'peak')).toBe(true);
		expect(optional.every((s) => dow(s.date) === 6)).toBe(true);
	});

	it('swaps Saturday and Sunday when the long run is on Saturday', () => {
		const sat = generatePlan({
			...input,
			prefs: { longRunDay: 'sat', optionalExtraRun: false }
		}).sessions;
		expect(sat.filter((s) => s.type === 'long').every((s) => dow(s.date) === 6)).toBe(true);
		expect(
			sat.filter((s) => s.type === 'upper' || s.type === 'pull').every((s) => dow(s.date) === 0)
		).toBe(true);
	});

	it('plans grease-the-groove on weekdays, not in race week', () => {
		const g = sessions.filter((s) => s.kind === 'gtg');
		expect(g.every((s) => dow(s.date) >= 1 && dow(s.date) <= 5)).toBe(true);
		expect(g.some((s) => s.date >= '2027-04-05')).toBe(false);
	});

	it('schedules benchmark tests in test weeks', () => {
		const tests = sessions.filter(
			(s) => s.kind === 'strength' && 'test' in s.details && s.details.test
		);
		expect(tests.map((t) => t.date)).toContain('2026-12-17'); // Thursday of the 14 Dec test week
	});

	it('has no strength in the last two taper weeks', () => {
		expect(sessions.some((s) => s.kind === 'strength' && s.date >= '2027-03-29')).toBe(false);
	});
});

describe('quality progression', () => {
	it('climbs the threshold ladder through the build phase', () => {
		const build = sessions
			.filter((s) => s.phase === 'build' && s.type === 'quality')
			.map((s) => s.title);
		expect(build[0]).toBe('Threshold 3 × 8 min');
		expect(build.some((t) => t.startsWith('Intervals'))).toBe(true);
	});

	it('estimates distance from the structure', () => {
		const q = qualitySession(
			targets.find((t) => t.phase === 'build' && !t.recovery)!,
			paces
		);
		// 2 + 3 × 8 min at 4:30 + 3 × 2 min jog + 2
		expect(q.details.km).toBeCloseTo(stepsKm(q.details.steps, paces));
		expect(q.details.km).toBeGreaterThan(8);
		expect(q.details.km).toBeLessThan(11);
	});
});

describe('strength', () => {
	it('uses your bells and lightens recovery weeks', () => {
		const normal = strengthSession('legs', 'base', { 'double-front-squat': 20 }, false)!;
		const light = strengthSession('legs', 'base', { 'double-front-squat': 20 }, true)!;
		expect(normal.details.exercises[0].kg).toBe(20);
		expect(light.details.exercises[0].kg).toBe(16);
		expect(light.details.exercises[0].sets).toBe(normal.details.exercises[0].sets - 1);
		expect(snapToBell(18)).toBe(16);
	});

	it('gives the base phase three strength sessions and later phases two', () => {
		const count = (week: number) =>
			sessions.filter((s) => s.week === week && s.kind === 'strength').length;
		expect(count(3)).toBe(3);
		expect(count(9)).toBe(2);
	});

	it('explains every focus and knows every exercise', () => {
		for (const phase of ['base', 'build', 'peak'] as const) {
			for (const type of ['legs', 'upper'] as const) {
				for (const e of strengthSession(type, phase, {}, false)!.details.exercises) {
					expect(EXERCISES[e.key]).toBeDefined();
					expect(FOCUS_INFO[e.focus].tip.length).toBeGreaterThan(10);
				}
			}
		}
	});

	it('prescribes half your max for grease the groove', () => {
		expect(gtg(4, 'base', false)!.reps).toBe(2);
		expect(gtg(7, 'build', false)!.reps).toBe(3);
		expect(gtg(null, 'base', false)!.reps).toBe(2);
		expect(gtg(4, 'taper', true)).toBeNull();
	});
});

describe('matching', () => {
	const item = (id: number, date: string, kind: string, extra: object = {}) => ({
		id,
		date,
		kind,
		type: kind === 'run' ? 'easy' : 'legs',
		optional: false,
		key: false,
		skipped: false,
		...extra
	});
	const act = (id: string, date: string, sportType: string, km = 0) => ({
		id,
		startDateLocal: `${date}T12:00:00`,
		sportType,
		distance: km * 1000,
		movingTime: 3000,
		name: id
	});

	it('links same-day activities, then ±1 day, preferring key sessions', () => {
		const items = [
			item(1, '2026-11-09', 'run', { km: 8 }),
			item(2, '2026-11-11', 'run', { km: 12, key: true, type: 'quality' }),
			item(3, '2026-11-12', 'strength')
		];
		const acts = [
			act('a', '2026-11-09', 'Run', 8),
			act('b', '2026-11-12', 'Run', 12),
			act('c', '2026-11-12', 'WeightTraining')
		];
		const m = matchActivities(items, acts);
		expect(m.get(1)?.id).toBe('a');
		expect(m.get(2)?.id).toBe('b'); // ran the quality session a day late
		expect(m.get(3)?.id).toBe('c');
	});

	it('gives statuses and a week summary', () => {
		const items = [
			item(1, '2026-11-09', 'run', { km: 8, key: true }),
			item(2, '2026-11-13', 'run', { km: 6 })
		];
		const m = matchActivities(items, [act('a', '2026-11-09', 'Run', 9)]);
		expect(sessionStatus(items[1], false, '2026-11-14')).toBe('missed');
		expect(sessionStatus(items[1], false, '2026-11-13')).toBe('today');
		expect(summarizeWeek(items, m, [act('a', '2026-11-09', 'Run', 9)])).toMatchObject({
			plannedKm: 14,
			actualKm: 9,
			requiredDone: 1,
			keyDone: 1
		});
	});

	it('handles dates across the week boundary', () => {
		expect(addDays('2026-11-08', 1)).toBe('2026-11-09');
	});
});
