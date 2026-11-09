import { describe, expect, it } from 'vitest';
import { reviewWeek } from '../engine/adapt/review';
import { coachPrompt, parseCoachReply } from './parse';

describe('parseCoachReply', () => {
	it('accepts the expected shape and caps the tips', () => {
		const r = parseCoachReply(
			JSON.stringify({ explanation: ' Fine. ', tips: ['a', 'b', 'c'], volume_adjustment: -0.05 })
		);
		expect(r).toEqual({ explanation: 'Fine.', tips: ['a', 'b'], volumeAdjustment: -0.05 });
	});

	it('rejects anything else', () => {
		expect(parseCoachReply('not json')).toBeNull();
		expect(
			parseCoachReply(JSON.stringify({ explanation: '', tips: [], volume_adjustment: 0 }))
		).toBeNull();
		expect(
			parseCoachReply(JSON.stringify({ explanation: 'x', tips: [1], volume_adjustment: 0 }))
		).toBeNull();
		expect(parseCoachReply(JSON.stringify({ explanation: 'x', tips: [] }))).toBeNull();
	});
});

describe('coachPrompt', () => {
	it('sends only the summary numbers and session titles', () => {
		const review = reviewWeek({
			plannedKm: 30,
			actualKm: 28,
			keyTotal: 2,
			keyDone: 2,
			qualityMissed: false,
			longMissed: false,
			acwr: 1,
			tsb: 0
		});
		const data = JSON.parse(
			coachPrompt({
				review,
				goal: { name: 'Marathon', distanceKm: 42.195, targetTime: '3:20:00', weeksToGo: 22 },
				phase: 'base',
				plannedKm: 30,
				actualKm: 28,
				keyDone: 2,
				keyTotal: 2,
				missedKeySessions: [],
				acwr: 1,
				form: 0,
				vdot: 42.4,
				targetVdot: 47.2,
				nextWeekKeySessions: ['Long run 20 km']
			})
		);
		expect(data.last_week.actual_km).toBe(28);
		expect(Object.keys(data).sort()).toEqual([
			'current_phase',
			'fitness',
			'goal',
			'last_week',
			'load',
			'next_week_key_sessions',
			'rules_decision'
		]);
	});
});
