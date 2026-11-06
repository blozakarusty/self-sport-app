import { describe, expect, it } from 'vitest';
import {
	estimateVdot,
	oxygenCost,
	predictTime,
	predictUltra,
	speedForOxygen,
	trainingPaces,
	vdot,
	type Effort
} from './vdot';

// Reference values from Daniels' Running Formula (VDOT 50 row).
const VDOT50 = { fiveK: 19 * 60 + 57, marathon: 3 * 3600 + 10 * 60 + 49 };

describe('vdot', () => {
	it('matches the Daniels table for VDOT 50', () => {
		expect(vdot(5000, VDOT50.fiveK)).toBeCloseTo(50, 0);
		expect(vdot(42195, VDOT50.marathon)).toBeCloseTo(50, 0);
	});

	it('round-trips through predictTime', () => {
		expect(predictTime(50, 5000)).toBeCloseTo(VDOT50.fiveK, -1);
		expect(predictTime(50, 42195)).toBeCloseTo(VDOT50.marathon, -2);
		expect(vdot(10000, predictTime(47.3, 10000))).toBeCloseTo(47.3, 3);
	});

	it('inverts oxygen cost', () => {
		expect(oxygenCost(speedForOxygen(40))).toBeCloseTo(40, 6);
	});
});

describe('trainingPaces', () => {
	const p = trainingPaces(50);

	it('is ordered from slow to fast', () => {
		expect(p.easy[1]).toBeGreaterThan(p.easy[0]);
		expect(p.easy[0]).toBeGreaterThan(p.marathon);
		expect(p.marathon).toBeGreaterThan(p.threshold);
		expect(p.threshold).toBeGreaterThan(p.interval);
		expect(p.interval).toBeGreaterThan(p.repetition);
	});

	it('is within a few seconds of the Daniels table for VDOT 50', () => {
		// Table: M 4:31/km, T 4:15/km, I 3:55/km, E roughly 5:00–5:40/km.
		expect(Math.abs(p.marathon - 271)).toBeLessThan(4);
		expect(Math.abs(p.threshold - 255)).toBeLessThan(6);
		expect(Math.abs(p.interval - 235)).toBeLessThan(6);
		expect(p.easy[0]).toBeGreaterThan(290);
		expect(p.easy[1]).toBeLessThan(350);
	});
});

describe('predictUltra', () => {
	it('is slower per km than the marathon and penalises climbing', () => {
		const flat = predictUltra(50, 100_000);
		expect(flat / 100).toBeGreaterThan(predictTime(50, 42195) / 42.195);
		expect(predictUltra(50, 100_000, 2000)).toBeGreaterThan(flat);
	});
});

describe('estimateVdot', () => {
	const effort = (distance: number, time: number, date: string): Effort => ({
		distance,
		time,
		date,
		label: 'x',
		source: 'best-effort'
	});

	it('takes the best recent effort, ignoring short and old ones', () => {
		const est = estimateVdot(
			[
				effort(5000, 20 * 60, '2026-10-01'),
				effort(5000, 19 * 60, '2026-01-01'), // too old
				effort(400, 60, '2026-11-01'), // too short
				effort(10000, 41 * 60, '2026-11-01')
			],
			'2026-11-06'
		);
		expect(est?.effort.distance).toBe(10000);
		expect(est!.value).toBeLessThan(est!.raw);
	});

	it('prefers a slightly weaker but newer effort over an older one', () => {
		const est = estimateVdot(
			[effort(5000, 20 * 60, '2026-07-15'), effort(5000, 20 * 60 + 10, '2026-11-01')],
			'2026-11-06'
		);
		expect(est?.effort.date).toBe('2026-11-01');
	});

	it('returns null without usable efforts', () => {
		expect(estimateVdot([], '2026-11-06')).toBeNull();
	});
});
