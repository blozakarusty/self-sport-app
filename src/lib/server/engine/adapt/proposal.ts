/**
 * Validates plan changes proposed in chat. The model can only suggest these
 * operations; everything is checked here, then applied by your click.
 */
import { retitle, scaleRun } from './review';
import { stepsKm, type PaceTable, type RunDetails, type Step } from '../plan/runs';

export type ChangeOp =
	| { op: 'move'; session_id: number; date: string }
	| { op: 'skip'; session_id: number }
	| { op: 'restore'; session_id: number }
	| { op: 'scale'; session_id: number; factor: number }
	| { op: 'replace_run'; session_id: number; title: string; purpose: string; steps: Step[] };

export interface ProposalRow {
	id: number;
	date: string;
	kind: string;
	type: string;
	title: string;
	phase: string;
	details: unknown;
	skipped: boolean;
}

export interface SessionPatch {
	id: number;
	date?: string;
	moved?: boolean;
	skipped?: boolean;
	title?: string;
	details?: unknown;
	summary: string;
}

const STEP_KINDS = new Set(['warmup', 'work', 'recover', 'cooldown', 'steady']);
const PACES = new Set(['easy', 'marathon', 'threshold', 'interval', 'strides', 'jog', 'goal']);
const DAY = /^\d{4}-\d{2}-\d{2}$/;

function validSteps(steps: unknown, depth = 0): steps is Step[] {
	if (!Array.isArray(steps) || !steps.length || steps.length > 12 || depth > 1) return false;
	return steps.every((raw) => {
		const s = raw as Record<string, unknown>;
		if (s?.kind === 'repeat') {
			return (
				Number.isInteger(s.reps) &&
				(s.reps as number) >= 1 &&
				(s.reps as number) <= 20 &&
				validSteps(s.steps, depth + 1)
			);
		}
		if (!STEP_KINDS.has(s?.kind as string) || !PACES.has(s?.pace as string)) return false;
		const amounts = (['km', 'minutes', 'seconds'] as const).filter((k) => s[k] != null);
		return (
			amounts.length === 1 && typeof s[amounts[0]] === 'number' && (s[amounts[0]] as number) > 0
		);
	});
}

/** Minutes spent at threshold pace or faster. */
export function hardMinutes(steps: Step[], paces: PaceTable): number {
	let min = 0;
	for (const s of steps) {
		if (s.kind === 'repeat') min += s.reps * hardMinutes(s.steps, paces);
		else if (s.pace === 'threshold' || s.pace === 'interval' || s.pace === 'strides') {
			min += s.km ? (s.km * paces[s.pace]) / 60 : (s.minutes ?? 0) + (s.seconds ?? 0) / 60;
		}
	}
	return min;
}

/** Returns patches for valid operations and a reason for each invalid one. */
export function validateProposal(
	ops: ChangeOp[],
	rows: ProposalRow[],
	ctx: { today: string; raceDay: string; paces: PaceTable }
): { patches: SessionPatch[]; errors: string[] } {
	const patches: SessionPatch[] = [];
	const errors: string[] = [];
	if (!Array.isArray(ops) || !ops.length || ops.length > 30)
		return { patches, errors: ['Propose between 1 and 30 changes.'] };

	for (const op of ops) {
		const row = rows.find((r) => r.id === op?.session_id);
		if (!row) {
			errors.push(`Session ${op?.session_id} does not exist.`);
			continue;
		}
		const label = `“${row.title}” (${row.date})`;
		if (row.date < ctx.today) {
			errors.push(`${label} is in the past.`);
			continue;
		}
		if (row.type === 'race') {
			errors.push('Race day cannot be changed here; edit the goal instead.');
			continue;
		}
		if (op.op === 'move') {
			if (!DAY.test(op.date ?? '') || op.date < ctx.today || op.date >= ctx.raceDay)
				errors.push(`${label}: pick a day from today up to the day before the race.`);
			else
				patches.push({
					id: row.id,
					date: op.date,
					moved: true,
					summary: `${row.title}: ${row.date} → ${op.date}`
				});
		} else if (op.op === 'skip') {
			patches.push({ id: row.id, skipped: true, summary: `Skip ${row.title} (${row.date})` });
		} else if (op.op === 'restore') {
			patches.push({ id: row.id, skipped: false, summary: `Restore ${row.title} (${row.date})` });
		} else if (op.op === 'scale') {
			if (row.phase === 'taper') errors.push(`${label}: the taper is protected.`);
			else if (row.kind !== 'run' || (row.type !== 'easy' && row.type !== 'long'))
				errors.push(`${label}: only easy and long runs can be scaled.`);
			else if (!(op.factor >= 0.5 && op.factor <= 1.1))
				errors.push(`${label}: scale must be between 0.5 and 1.1.`);
			else {
				const details = scaleRun(row.details as RunDetails, op.factor);
				patches.push({
					id: row.id,
					title: retitle(row.title, details.km),
					details,
					summary: `${row.title} → ${details.km} km`
				});
			}
		} else if (op.op === 'replace_run') {
			if (row.phase === 'taper') {
				errors.push(`${label}: the taper is protected.`);
				continue;
			}
			if (row.kind !== 'run') {
				errors.push(`${label}: only runs can be replaced.`);
				continue;
			}
			if (
				!validSteps(op.steps) ||
				typeof op.title !== 'string' ||
				!op.title.trim() ||
				op.title.length > 80
			) {
				errors.push(`${label}: the workout structure is invalid.`);
				continue;
			}
			const old = (row.details as RunDetails).km;
			const km = stepsKm(op.steps, ctx.paces);
			if (km > Math.max(old * 1.3, old + 3)) {
				errors.push(`${label}: ${km} km is too big a jump from ${old} km.`);
				continue;
			}
			if (hardMinutes(op.steps, ctx.paces) > 45) {
				errors.push(`${label}: more than 45 minutes at threshold or faster.`);
				continue;
			}
			const details: RunDetails = {
				kind: 'run',
				km,
				steps: op.steps,
				purpose: String(op.purpose ?? '').slice(0, 200)
			};
			patches.push({
				id: row.id,
				title: op.title.trim(),
				details,
				summary: `${row.title} → ${op.title.trim()} (${km} km)`
			});
		} else {
			errors.push('Unknown change type.');
		}
	}
	return { patches, errors };
}
