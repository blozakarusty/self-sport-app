/**
 * Weekly review: compare what was planned with what happened, decide what the
 * coming weeks should do, and apply that to the stored sessions. Pure functions.
 *
 * Progress is earned: volume only stays on plan if last week was done, and a
 * missed key session is repeated instead of skipped over. The taper and race
 * week are never changed.
 */
import type { PhaseName } from '../goals/phases';
import type { RunDetails, Step } from '../plan/runs';

export type Decision = 'progress' | 'hold' | 'reduce' | 'recover';

export interface ReviewInput {
	plannedKm: number;
	actualKm: number;
	keyTotal: number;
	keyDone: number;
	qualityMissed: boolean;
	longMissed: boolean;
	/** acute:chronic load ratio; null when history is too short */
	acwr: number | null;
	/** form (fitness minus fatigue) */
	tsb: number;
}

export interface Review {
	decision: Decision;
	/** multiplier on next week's easy and long-run distance */
	factor: number;
	repeatQuality: boolean;
	holdLong: boolean;
	reasons: string[];
	kmRatio: number | null;
}

export function reviewWeek(i: ReviewInput): Review {
	const kmRatio = i.plannedKm > 0 ? i.actualKm / i.plannedKm : null;
	const done = `${i.actualKm.toFixed(0)} of ${i.plannedKm} km`;
	const carry = { repeatQuality: i.qualityMissed, holdLong: i.longMissed, kmRatio };

	if ((i.acwr != null && i.acwr > 1.5) || i.tsb < -30) {
		return {
			...carry,
			decision: 'recover',
			factor: 0.8,
			reasons: [
				i.acwr != null && i.acwr > 1.5
					? `Recent load is well above your usual (acute:chronic ${i.acwr.toFixed(2)}).`
					: `Fatigue is high (form ${Math.round(i.tsb)}).`
			]
		};
	}
	if ((kmRatio != null && kmRatio < 0.6) || (i.keyTotal > 0 && i.keyDone === 0)) {
		const reasons = [];
		if (kmRatio != null && kmRatio < 0.6) reasons.push(`Ran ${done}, well short of plan.`);
		if (i.keyTotal > 0 && i.keyDone === 0) reasons.push('No key session was completed.');
		return { ...carry, decision: 'reduce', factor: 0.85, reasons };
	}
	if (kmRatio != null && kmRatio > 1.25) {
		return {
			...carry,
			decision: 'hold',
			factor: 0.95,
			reasons: [`Ran ${done}, well above plan; easing slightly to absorb it.`]
		};
	}
	if ((kmRatio != null && kmRatio < 0.85) || i.keyDone < i.keyTotal) {
		const reasons = [];
		if (kmRatio != null && kmRatio < 0.85) reasons.push(`Ran ${done}, a bit short of plan.`);
		if (i.keyDone < i.keyTotal) reasons.push(`${i.keyDone} of ${i.keyTotal} key sessions done.`);
		return { ...carry, decision: 'hold', factor: 1, reasons };
	}
	return {
		...carry,
		decision: 'progress',
		factor: 1,
		reasons: [`Ran ${done} and hit your key sessions. The plan continues as written.`]
	};
}

/**
 * The coach may fine-tune volume, inside limits the engine sets: never more
 * than 10% down or 5% up, and never up after a reduce or recover decision.
 */
export function applyCoachAdjustment(review: Review, adjustment: number): number {
	if (!Number.isFinite(adjustment)) return review.factor;
	const upper = review.decision === 'reduce' || review.decision === 'recover' ? 0 : 0.05;
	const bounded = Math.min(Math.max(adjustment, -0.1), upper);
	return Math.round(Math.min(Math.max(review.factor + bounded, 0.7), 1) * 100) / 100;
}

const roundHalf = (x: number) => Math.round(x * 2) / 2;

/** Scale the easy kilometres of a run; goal-pace and hard work stay as prescribed. */
export function scaleRun(details: RunDetails, factor: number): RunDetails {
	let delta = 0;
	const steps = details.steps.map((s): Step => {
		if (s.kind === 'repeat' || !s.km || s.pace !== 'easy') return s;
		const km = Math.max(3, roundHalf(s.km * factor));
		delta += km - s.km;
		return { ...s, km };
	});
	return { ...details, steps, km: Math.round((details.km + delta) * 10) / 10 };
}

/** Keep a session title in step with its new distance. */
export function retitle(title: string, km: number): string {
	const n = Number.isInteger(km * 2) ? km : Math.round(km);
	return title
		.replace(/^Easy run [\d.]+ km/, `Easy run ${Math.round(n)} km`)
		.replace(/^Optional easy run [\d.]+ km/, `Optional easy run ${Math.round(n)} km`)
		.replace(/^Long run [\d.]+ km/, `Long run ${n} km`);
}

export interface PlanRow {
	id: number;
	type: string;
	kind: string;
	title: string;
	phase: PhaseName;
	week: number;
	details: unknown;
	skipped: boolean;
}

export interface SessionChange {
	id: number;
	title: string;
	details: unknown;
	/** one line for the review card */
	summary: string;
}

const isRun = (d: unknown): d is RunDetails => (d as RunDetails)?.kind === 'run';

/**
 * Work out the edits for the coming weeks. Next week gets the full factor; a
 * clear cut eases back in over the week after. Taper and race weeks are left
 * alone, so the plan always arrives at race day as designed.
 */
export function planChanges(
	review: Review,
	factor: number,
	nextWeek: PlanRow[],
	weekAfter: PlanRow[],
	missed: { quality: PlanRow | null; long: PlanRow | null }
): SessionChange[] {
	const out: SessionChange[] = [];
	const protectedWeek = (rows: PlanRow[]) =>
		rows.some((r) => r.phase === 'taper' || r.type === 'race');

	const scaleWeek = (rows: PlanRow[], f: number, repeat: boolean) => {
		for (const r of rows) {
			if (r.skipped || r.kind !== 'run' || !isRun(r.details)) continue;
			if (r.type === 'quality') {
				if (
					repeat &&
					missed.quality &&
					missed.quality.phase === r.phase &&
					missed.quality.title !== r.title
				) {
					out.push({
						id: r.id,
						title: missed.quality.title,
						details: missed.quality.details,
						summary: `${r.title} → repeats ${missed.quality.title}`
					});
				}
				continue;
			}
			if (r.type !== 'easy' && r.type !== 'long') continue;
			let sessionFactor = f;
			if (repeat && r.type === 'long' && review.holdLong && isRun(missed.long?.details)) {
				const cap = (missed.long!.details as RunDetails).km;
				if (r.details.km > cap) sessionFactor = Math.min(f, cap / r.details.km);
			}
			if (sessionFactor >= 0.995) continue;
			const details = scaleRun(r.details, sessionFactor);
			if (details.km === r.details.km) continue;
			out.push({
				id: r.id,
				title: retitle(r.title, details.km),
				details,
				summary: `${r.title} → ${details.km} km`
			});
		}
	};

	if (!protectedWeek(nextWeek)) scaleWeek(nextWeek, factor, true);
	if (factor < 0.9 && !protectedWeek(weekAfter)) scaleWeek(weekAfter, (1 + factor) / 2, false);
	return out;
}

/** The plain-language explanation used when the coach is off or unavailable. */
export function ruleExplanation(review: Review, changes: SessionChange[]): string {
	const lead: Record<Decision, string> = {
		progress: 'Good week. Next week stays as planned.',
		hold: 'Solid enough to continue, without adding anything extra.',
		reduce: 'Last week fell short, so next week is lighter to rebuild consistency.',
		recover: 'Your body needs to absorb recent load, so next week is lighter.'
	};
	const tail = changes.length ? ` ${changes.length} upcoming sessions were adjusted.` : '';
	return `${lead[review.decision]} ${review.reasons.join(' ')}${tail}`;
}
