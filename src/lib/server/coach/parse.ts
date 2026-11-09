/**
 * Prompt and reply handling for the coach. No I/O, so it can be tested without
 * calling the API. Only aggregated numbers and the app's own session titles go
 * in: never activity names, descriptions, GPS or streams.
 */
import type { Review } from '../engine/adapt/review';

export interface CoachContext {
	review: Review;
	goal: { name: string; distanceKm: number; targetTime: string; weeksToGo: number };
	phase: string | null;
	plannedKm: number;
	actualKm: number;
	keyDone: number;
	keyTotal: number;
	missedKeySessions: string[];
	acwr: number | null;
	form: number;
	vdot: number | null;
	targetVdot: number;
	nextWeekKeySessions: string[];
}

export interface CoachReply {
	explanation: string;
	tips: string[];
	volumeAdjustment: number;
}

export const COACH_SYSTEM = `You are the running and strength coach inside a personal training app. Each week you receive a numeric summary of the athlete's last training week and the decision the app's rules already made.

Write for the athlete directly, in plain and warm language with no hype. Explain in 2-4 sentences what happened and why next week looks the way it does. Give at most 2 short, concrete tips for the coming week. Only refer to numbers you were given.

volume_adjustment fine-tunes next week's easy and long-run distance: a number from -0.10 to 0.05, where 0 means accept the rules' decision. Keep it at 0 unless the numbers clearly call for something else. The app enforces the limits. This is training guidance, so do not diagnose injuries or illness; suggest seeing a professional if pain is mentioned by the data.`;

export const COACH_SCHEMA = {
	type: 'object',
	properties: {
		explanation: { type: 'string' },
		tips: { type: 'array', items: { type: 'string' } },
		volume_adjustment: { type: 'number' }
	},
	required: ['explanation', 'tips', 'volume_adjustment'],
	additionalProperties: false
} as const;

export function coachPrompt(c: CoachContext): string {
	return JSON.stringify({
		goal: c.goal,
		current_phase: c.phase,
		last_week: {
			planned_km: c.plannedKm,
			actual_km: Math.round(c.actualKm * 10) / 10,
			key_sessions_done: c.keyDone,
			key_sessions_total: c.keyTotal,
			missed_key_sessions: c.missedKeySessions
		},
		load: { acute_chronic_ratio: c.acwr, form: Math.round(c.form) },
		fitness: { current_vdot: c.vdot, vdot_needed_for_goal: Math.round(c.targetVdot * 10) / 10 },
		rules_decision: {
			decision: c.review.decision,
			next_week_volume_factor: c.review.factor,
			repeats_missed_quality_session: c.review.repeatQuality,
			reasons: c.review.reasons
		},
		next_week_key_sessions: c.nextWeekKeySessions
	});
}

/** Validate the model's JSON; null means fall back to the rules' explanation. */
export function parseCoachReply(text: string): CoachReply | null {
	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch {
		return null;
	}
	const r = raw as { explanation?: unknown; tips?: unknown; volume_adjustment?: unknown };
	if (typeof r?.explanation !== 'string' || !r.explanation.trim()) return null;
	if (!Array.isArray(r.tips) || !r.tips.every((t) => typeof t === 'string')) return null;
	if (typeof r.volume_adjustment !== 'number') return null;
	return {
		explanation: r.explanation.trim().slice(0, 1500),
		tips: (r.tips as string[]).slice(0, 2).map((t) => t.trim().slice(0, 300)),
		volumeAdjustment: r.volume_adjustment
	};
}
