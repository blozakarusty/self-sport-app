/**
 * Strength side of the planner for kettlebells (8–24 kg, pairs), bodyweight,
 * paralettes and a pull-up bar. Pure data and functions.
 */
import type { PhaseName } from '../goals/phases';

export type Focus = 'strength' | 'hypertrophy' | 'power' | 'endurance' | 'skill';

export const FOCUS_INFO: Record<Focus, { label: string; tip: string }> = {
	strength: {
		label: 'Strength',
		tip: '3–6 reps, heavy, 2–3 min rest. Builds maximal force; stop 1–2 reps before failure.'
	},
	hypertrophy: {
		label: 'Hypertrophy',
		tip: '8–12 reps, moderate weight, 60–90 s rest. Builds muscle, which also helps you lose fat.'
	},
	power: {
		label: 'Power',
		tip: 'Low reps done explosively, full rest. Builds speed and stiffness that improve running economy.'
	},
	endurance: {
		label: 'Muscular endurance',
		tip: '15+ reps or timed holds, short rest. Builds resistance to fatigue late in a run.'
	},
	skill: {
		label: 'Skill',
		tip: 'Easy, frequent, crisp reps far from failure. Trains the movement pattern and your nervous system.'
	}
};

export interface ExerciseDef {
	key: string;
	name: string;
	/** null for bodyweight-only */
	defaultKg: number | null;
	/** "per arm", "per leg", "total (two bells)" */
	loadNote?: string;
	cue: string;
}

export const EXERCISES: Record<string, ExerciseDef> = {
	'double-front-squat': {
		key: 'double-front-squat',
		name: 'Double kettlebell front squat',
		defaultKg: 16,
		loadNote: 'each bell',
		cue: 'Bells in the rack, elbows down, sit between your heels.'
	},
	'goblet-squat': {
		key: 'goblet-squat',
		name: 'Goblet squat',
		defaultKg: 24,
		cue: 'Bell at your chest, knees out, hips below knees.'
	},
	'kb-swing': {
		key: 'kb-swing',
		name: 'Kettlebell swing',
		defaultKg: 24,
		cue: 'Hinge, snap the hips, float the bell to chest height.'
	},
	'sl-rdl': {
		key: 'sl-rdl',
		name: 'Single-leg Romanian deadlift',
		defaultKg: 20,
		loadNote: 'per leg, bell in opposite hand',
		cue: 'Square hips, long spine, feel the hamstring.'
	},
	'split-squat': {
		key: 'split-squat',
		name: 'Rear-foot-elevated split squat',
		defaultKg: 12,
		loadNote: 'each hand',
		cue: 'Back foot on a bench, front shin near vertical.'
	},
	'pistol-progression': {
		key: 'pistol-progression',
		name: 'Pistol squat (to a box if needed)',
		defaultKg: null,
		loadNote: 'per leg',
		cue: 'Slow down, full control; lower the box as you improve.'
	},
	'calf-raise-sl': {
		key: 'calf-raise-sl',
		name: 'Single-leg calf raise',
		defaultKg: 16,
		loadNote: 'per leg',
		cue: 'Off a step, full range, 2 s up and 2 s down.'
	},
	copenhagen: {
		key: 'copenhagen',
		name: 'Copenhagen plank (short lever)',
		defaultKg: null,
		loadNote: 'per side',
		cue: 'Knee on a bench, hips high; protects the groin and hips.'
	},
	'hollow-hold': {
		key: 'hollow-hold',
		name: 'Hollow body hold',
		defaultKg: null,
		cue: 'Lower back pressed down, arms and legs long.'
	},
	'side-plank': {
		key: 'side-plank',
		name: 'Side plank',
		defaultKg: null,
		loadNote: 'per side',
		cue: 'Straight line from head to feet.'
	},
	'pullup-negative': {
		key: 'pullup-negative',
		name: 'Pull-up negatives',
		defaultKg: null,
		cue: 'Jump or step to the top, lower in 5 seconds.'
	},
	pullup: {
		key: 'pullup',
		name: 'Strict pull-ups',
		defaultKg: null,
		cue: 'Dead hang to chin over bar; stop with 1–2 reps in the tank.'
	},
	'kb-row': {
		key: 'kb-row',
		name: 'Kettlebell bent-over row',
		defaultKg: 24,
		loadNote: 'per arm',
		cue: 'Flat back, pull the bell to your hip.'
	},
	'dead-hang': {
		key: 'dead-hang',
		name: 'Dead hang',
		defaultKg: null,
		cue: 'Active shoulders, breathe.'
	},
	'paralette-pushup': {
		key: 'paralette-pushup',
		name: 'Deficit push-up on paralettes',
		defaultKg: null,
		cue: 'Chest below the handles, body straight.'
	},
	pushup: { key: 'pushup', name: 'Push-ups', defaultKg: null, cue: 'Full range, body straight.' },
	'kb-press': {
		key: 'kb-press',
		name: 'Kettlebell strict press',
		defaultKg: 16,
		loadNote: 'per arm',
		cue: 'Squeeze glutes, press straight up, no lean.'
	},
	'pike-pushup': {
		key: 'pike-pushup',
		name: 'Pike push-up (feet on a box when easy)',
		defaultKg: null,
		cue: 'Hips high, head to the floor between your hands.'
	},
	'paralette-dip': {
		key: 'paralette-dip',
		name: 'Paralette dips, feet raised',
		defaultKg: null,
		cue: 'Shoulders down, elbows back.'
	},
	lsit: {
		key: 'lsit',
		name: 'L-sit (or tuck) on paralettes',
		defaultKg: null,
		cue: 'Push the floor away, legs as straight as you can.'
	},
	plank: { key: 'plank', name: 'Plank', defaultKg: null, cue: 'Squeeze glutes, ribs down.' }
};

/** Your bells. Weights snap to these. */
export const BELLS = [8, 12, 16, 20, 24];

export function snapToBell(kg: number): number {
	return BELLS.reduce((best, b) => (Math.abs(b - kg) < Math.abs(best - kg) ? b : best), BELLS[0]);
}

export interface PlannedExercise {
	key: string;
	sets: number;
	/** "6–8", "20–30 s", "max − 1" */
	reps: string;
	focus: Focus;
	restSec: number;
	kg: number | null;
	note?: string;
}

export interface StrengthDetails {
	kind: 'strength';
	focus: Focus[];
	minutes: number;
	exercises: PlannedExercise[];
	/** benchmark test day */
	test?: string[];
}

export interface GtgDetails {
	kind: 'gtg';
	exercise: 'pullup';
	sets: string;
	reps: number;
	note: string;
}

type Template = Omit<PlannedExercise, 'kg'>[];

const ex = (
	key: string,
	sets: number,
	reps: string,
	focus: Focus,
	restSec: number,
	note?: string
) => ({
	key,
	sets,
	reps,
	focus,
	restSec,
	note
});

/** Thursday: legs and core. Heavier in base, power in build, maintenance later. */
const LEGS: Partial<Record<PhaseName, Template>> = {
	base: [
		ex('double-front-squat', 4, '6–8', 'strength', 150),
		ex('kb-swing', 5, '10', 'power', 60),
		ex('sl-rdl', 3, '8–10', 'hypertrophy', 75),
		ex('split-squat', 3, '8–10', 'hypertrophy', 75),
		ex('calf-raise-sl', 3, '12–15', 'endurance', 45),
		ex('hollow-hold', 3, '20–30 s', 'endurance', 45)
	],
	build: [
		ex('double-front-squat', 3, '4–6', 'strength', 180),
		ex('kb-swing', 6, '8', 'power', 60, 'Fast and crisp; stop when the snap fades.'),
		ex('pistol-progression', 3, '3–5', 'strength', 90),
		ex('sl-rdl', 2, '6–8', 'strength', 90),
		ex('calf-raise-sl', 3, '15', 'endurance', 45),
		ex('copenhagen', 2, '20 s', 'endurance', 45)
	],
	peak: [
		ex('goblet-squat', 2, '6–8', 'strength', 120, 'Maintenance: leave plenty in the tank.'),
		ex('kb-swing', 3, '10', 'power', 60),
		ex('calf-raise-sl', 2, '15', 'endurance', 45),
		ex('side-plank', 2, '30 s', 'endurance', 30)
	]
};

/** Saturday: upper body, push and pull. Pull-ups get the most attention. */
const UPPER: Partial<Record<PhaseName, Template>> = {
	base: [
		ex('pullup-negative', 3, '3', 'strength', 120, '5-second lowering on every rep.'),
		ex('kb-row', 4, '8–10', 'hypertrophy', 75),
		ex('paralette-pushup', 4, '8–12', 'hypertrophy', 75),
		ex('kb-press', 3, '6–8', 'strength', 120),
		ex('lsit', 4, '10–20 s', 'skill', 60),
		ex('dead-hang', 2, 'max', 'endurance', 60)
	],
	build: [
		ex('pullup', 4, 'max − 1', 'strength', 150, 'Stop one rep short of failure.'),
		ex('pullup-negative', 2, '2', 'strength', 90),
		ex('kb-row', 3, '6–8', 'strength', 90),
		ex('paralette-dip', 3, '6–10', 'hypertrophy', 90),
		ex('kb-press', 3, '5', 'strength', 120),
		ex('lsit', 3, '15–20 s', 'skill', 60)
	],
	peak: [
		ex('pullup', 3, 'max − 2', 'strength', 120),
		ex('pushup', 2, 'max − 3', 'endurance', 60),
		ex('kb-row', 2, '10', 'hypertrophy', 60),
		ex('plank', 2, '45 s', 'endurance', 30)
	],
	taper: [
		ex('pullup', 2, '3', 'skill', 90, 'Light: just stay sharp.'),
		ex('pushup', 2, '10', 'skill', 60),
		ex('plank', 2, '30 s', 'endurance', 30)
	]
};

function minutesFor(t: Template) {
	return Math.round(t.reduce((m, e) => m + e.sets * (e.restSec + 40), 300) / 60 / 5) * 5;
}

function withWeights(
	t: Template,
	weights: Record<string, number>,
	lighter: boolean
): PlannedExercise[] {
	return t.map((e) => {
		const def = EXERCISES[e.key];
		const base = weights[e.key] ?? def?.defaultKg ?? null;
		return {
			...e,
			sets: lighter ? Math.max(1, e.sets - 1) : e.sets,
			kg: base == null ? null : lighter ? snapToBell(base * 0.8) : base
		};
	});
}

/**
 * A strength session for a phase. Recovery weeks drop a set per exercise and
 * use lighter bells. Returns null when the phase has no such session.
 */
export function strengthSession(
	type: 'legs' | 'upper',
	phase: PhaseName,
	weights: Record<string, number>,
	recovery: boolean,
	test?: string[]
): { title: string; details: StrengthDetails } | null {
	const t = (type === 'legs' ? LEGS : UPPER)[phase];
	if (!t) return null;
	const exercises = withWeights(t, weights, recovery);
	const focus = [...new Set(t.map((e) => e.focus))];
	const label = type === 'legs' ? 'Legs and core' : 'Upper body: push and pull';
	return {
		title: `${label}${recovery ? ' (light week)' : ''}`,
		details: { kind: 'strength', focus, minutes: minutesFor(t), exercises, test }
	};
}

/**
 * Grease the groove: frequent submaximal pull-up sets through the day.
 * About half your max per set, never to failure.
 */
export function gtg(
	pullupMax: number | null,
	phase: PhaseName,
	raceWeek: boolean
): GtgDetails | null {
	if (raceWeek) return null;
	const max = pullupMax ?? 4;
	const reps = Math.max(1, Math.floor(max * 0.5));
	return {
		kind: 'gtg',
		exercise: 'pullup',
		sets: phase === 'taper' ? '3–4' : '5–8',
		reps,
		note: `${reps} strict ${reps === 1 ? 'rep' : 'reps'} per set, spread through the day with at least 15 minutes between sets. Never to failure; if a set feels hard, stop for the day.`
	};
}
