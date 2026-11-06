/**
 * Running side of the planner: weekly volume and long-run progression, and the
 * session library with progression ladders. Pure functions only.
 * Paces are referenced by name and resolved at display time, so a plan keeps
 * up with your fitness without being regenerated.
 */
import type { PhaseName } from '../goals/phases';

export type PaceKey = 'easy' | 'marathon' | 'threshold' | 'interval' | 'strides' | 'jog' | 'goal';

export type Step =
	| {
			kind: 'warmup' | 'work' | 'recover' | 'cooldown' | 'steady';
			km?: number;
			minutes?: number;
			seconds?: number;
			pace: PaceKey;
	  }
	| { kind: 'repeat'; reps: number; steps: Step[] };

export interface RunDetails {
	kind: 'run';
	/** estimated total distance */
	km: number;
	steps: Step[];
	/** one line: why this session */
	purpose: string;
	/** e.g. "Threshold ladder, step 3 of 8" */
	progression?: string;
}

/** Seconds per km for each pace name, from your current training paces. */
export type PaceTable = Record<Exclude<PaceKey, 'goal'>, number> & { goal?: number };

export interface WeekTarget {
	week: number; // 1-based
	monday: string;
	phase: PhaseName;
	recovery: boolean;
	/** index among non-recovery weeks within the phase (for ladders) */
	stepInPhase: number;
	/** weeks left in the taper including this one (taper only) */
	taperLeft: number;
	km: number;
	longKm: number;
	raceWeek: boolean;
}

const round1 = (x: number) => Math.round(x * 2) / 2;

/**
 * Weekly km and long-run km. Volume grows evenly from what you run now so it
 * arrives at the peak target when the peak phase starts (at most 8% per normal
 * week); recovery weeks drop to 75%, the peak phase holds, the taper steps
 * down. The long run grows linearly to its peak the same way (at most 2 km).
 */
export function weeklyTargets(
	weeks: { monday: string; phase: PhaseName; recovery: boolean }[],
	opts: { startKm: number; peakKm: number; startLongKm: number; peakLongKm: number }
): WeekTarget[] {
	const out: WeekTarget[] = [];
	let km = Math.min(Math.max(opts.startKm, 15), opts.peakKm);
	let long = Math.min(Math.max(opts.startLongKm, 10), opts.peakLongKm);
	let lastNormalKm = km;
	let lastNormalLong = long;
	const taperTotal = weeks.filter((w) => w.phase === 'taper').length;
	const TAPER = taperTotal >= 3 ? [0.7, 0.55, 0.35] : taperTotal === 2 ? [0.65, 0.35] : [0.4];
	let normalSeen = 0;
	const stepCounter: Record<string, number> = {};
	// normal (non-recovery) weeks before the peak phase, after the first one
	const rampWeeks = Math.max(
		1,
		weeks.filter((w) => !w.recovery && (w.phase === 'base' || w.phase === 'build')).length - 1
	);
	const growth = Math.min(1.08, Math.max(1, (opts.peakKm / km) ** (1 / rampWeeks)));
	const longStep = Math.min(2, Math.max(0, (opts.peakLongKm - long) / rampWeeks));

	weeks.forEach((w, i) => {
		const isLast = i === weeks.length - 1;
		let weekKm: number;
		let weekLong: number;
		if (w.phase === 'taper') {
			const t = weeks.slice(0, i + 1).filter((x) => x.phase === 'taper').length - 1;
			weekKm = opts.peakKm * TAPER[Math.min(t, TAPER.length - 1)];
			weekLong = isLast ? 0 : Math.min(opts.peakLongKm, [0.75, 0.55][t] * opts.peakLongKm);
		} else if (w.recovery) {
			weekKm = lastNormalKm * 0.75;
			weekLong = lastNormalLong * 0.7;
		} else {
			if (normalSeen > 0) {
				km = w.phase === 'peak' ? opts.peakKm : Math.min(opts.peakKm, km * growth);
				long =
					w.phase === 'peak'
						? // alternate the two longest runs with a shorter one in the peak phase
							(stepCounter.peak ?? 0) % 2 === 0
							? opts.peakLongKm
							: opts.peakLongKm - 4
						: Math.min(opts.peakLongKm, long + longStep);
			}
			weekKm = km;
			weekLong = long;
			lastNormalKm = km;
			lastNormalLong = long;
			normalSeen++;
		}
		// the long run never takes more than about half the week (+3 km)
		weekLong = Math.min(weekLong, weekKm * 0.5 + 3);
		const stepInPhase = stepCounter[w.phase] ?? 0;
		if (!w.recovery) stepCounter[w.phase] = stepInPhase + 1;
		out.push({
			week: i + 1,
			monday: w.monday,
			phase: w.phase,
			recovery: w.recovery,
			stepInPhase,
			taperLeft: w.phase === 'taper' ? weeks.length - i : 0,
			km: Math.round(weekKm),
			longKm: round1(weekLong),
			raceWeek: isLast
		});
	});
	return out;
}

// ---------------------------------------------------------------- sessions

const wu = (km = 2): Step => ({ kind: 'warmup', km, pace: 'easy' });
const cd = (km = 2): Step => ({ kind: 'cooldown', km, pace: 'easy' });
const reps = (n: number, ...steps: Step[]): Step => ({ kind: 'repeat', reps: n, steps });

/** Estimated km of a step list at the given paces. */
export function stepsKm(steps: Step[], paces: PaceTable): number {
	let km = 0;
	for (const s of steps) {
		if (s.kind === 'repeat') km += s.reps * stepsKm(s.steps, paces);
		else if (s.km) km += s.km;
		else {
			const sec = (s.minutes ?? 0) * 60 + (s.seconds ?? 0);
			const pace = s.pace === 'goal' ? (paces.goal ?? paces.marathon) : paces[s.pace];
			km += sec / pace;
		}
	}
	return Math.round(km * 10) / 10;
}

function run(steps: Step[], paces: PaceTable, purpose: string, progression?: string): RunDetails {
	return { kind: 'run', km: stepsKm(steps, paces), steps, purpose, progression };
}

export function easyRun(km: number, paces: PaceTable, strides = 0): RunDetails {
	const steps: Step[] = [{ kind: 'steady', km: Math.max(3, round1(km)), pace: 'easy' }];
	if (strides)
		steps.push(
			reps(
				strides,
				{ kind: 'work', seconds: 20, pace: 'strides' },
				{ kind: 'recover', seconds: 60, pace: 'jog' }
			)
		);
	return run(
		steps,
		paces,
		strides
			? 'Easy aerobic running, then relaxed strides to keep your legs quick.'
			: 'Easy aerobic running. Conversational; slower is fine.'
	);
}

/** Base phase Wednesday: strides and flat fartlek, then a first taste of tempo. */
const BASE_LADDER: { title: string; steps: (easyKm: number) => Step[]; purpose: string }[] = [
	{
		title: 'Easy + 6 strides',
		steps: (k) => [
			{ kind: 'steady', km: k, pace: 'easy' },
			reps(
				6,
				{ kind: 'work', seconds: 20, pace: 'strides' },
				{ kind: 'recover', seconds: 60, pace: 'jog' }
			)
		],
		purpose: 'Strides wake up speed and form without fatigue.'
	},
	{
		title: 'Easy + 8 strides',
		steps: (k) => [
			{ kind: 'steady', km: k, pace: 'easy' },
			reps(
				8,
				{ kind: 'work', seconds: 20, pace: 'strides' },
				{ kind: 'recover', seconds: 60, pace: 'jog' }
			)
		],
		purpose: 'A few more strides; still relaxed, never sprinting.'
	},
	{
		title: 'Fartlek 6 × 1 min',
		steps: () => [
			wu(),
			reps(
				6,
				{ kind: 'work', minutes: 1, pace: 'interval' },
				{ kind: 'recover', minutes: 1, pace: 'jog' }
			),
			cd()
		],
		purpose: 'Short surges at 5K effort to build speed on flat roads.'
	},
	{
		title: 'Fartlek 8 × 1 min',
		steps: () => [
			wu(),
			reps(
				8,
				{ kind: 'work', minutes: 1, pace: 'interval' },
				{ kind: 'recover', minutes: 1, pace: 'jog' }
			),
			cd()
		],
		purpose: 'More surges; keep the recoveries truly easy.'
	},
	{
		title: 'Tempo intro 3 × 5 min',
		steps: () => [
			wu(),
			reps(
				3,
				{ kind: 'work', minutes: 5, pace: 'threshold' },
				{ kind: 'recover', minutes: 2, pace: 'jog' }
			),
			cd()
		],
		purpose: 'First threshold work: comfortably hard, about 1-hour race effort.'
	},
	{
		title: 'Fartlek 5 × 2 min',
		steps: () => [
			wu(),
			reps(
				5,
				{ kind: 'work', minutes: 2, pace: 'threshold' },
				{ kind: 'recover', minutes: 1, pace: 'jog' }
			),
			cd()
		],
		purpose: 'Longer surges at threshold; smooth and controlled.'
	},
	{
		title: 'Tempo 3 × 6 min',
		steps: () => [
			wu(),
			reps(
				3,
				{ kind: 'work', minutes: 6, pace: 'threshold' },
				{ kind: 'recover', minutes: 2, pace: 'jog' }
			),
			cd()
		],
		purpose: 'Bridges base into the build phase threshold ladder.'
	}
];

/** Threshold ladder for build/peak: total time at threshold grows from 24 to 40 min. */
const T_LADDER: [number, number][] = [
	[3, 8],
	[4, 8],
	[3, 10],
	[4, 10],
	[3, 12],
	[2, 15],
	[4, 12],
	[2, 20]
];
/** Interval ladder (VO2max): metres per rep. */
const I_LADDER: [number, number][] = [
	[5, 800],
	[5, 1000],
	[6, 1000],
	[5, 1200]
];
/** Peak-phase midweek marathon-pace runs, km at goal pace. */
const MP_LADDER = [8, 10, 12];

function thresholdSession(step: number, paces: PaceTable): { title: string; details: RunDetails } {
	const [n, min] = T_LADDER[Math.min(step, T_LADDER.length - 1)];
	return {
		title: `Threshold ${n} × ${min} min`,
		details: run(
			[
				wu(),
				reps(
					n,
					{ kind: 'work', minutes: min, pace: 'threshold' },
					{ kind: 'recover', minutes: 2, pace: 'jog' }
				),
				cd()
			],
			paces,
			'Raises the pace you can hold for a long time. Comfortably hard, never all-out.',
			`Threshold ladder, step ${Math.min(step, T_LADDER.length - 1) + 1} of ${T_LADDER.length}: ${n * min} min at threshold`
		)
	};
}

function intervalSession(step: number, paces: PaceTable): { title: string; details: RunDetails } {
	const [n, m] = I_LADDER[Math.min(step, I_LADDER.length - 1)];
	return {
		title: `Intervals ${n} × ${m} m`,
		details: run(
			[
				wu(2.5),
				reps(
					n,
					{ kind: 'work', km: m / 1000, pace: 'interval' },
					{ kind: 'recover', minutes: 2, pace: 'jog' }
				),
				cd()
			],
			paces,
			'VO2max work: hard but even, same pace for every rep.',
			`Interval ladder, step ${Math.min(step, I_LADDER.length - 1) + 1} of ${I_LADDER.length}: ${(n * m) / 1000} km fast`
		)
	};
}

/** Wednesday's key session for a given week. */
export function qualitySession(
	w: WeekTarget,
	paces: PaceTable
): { title: string; details: RunDetails } {
	if (w.phase === 'base') {
		const l = w.recovery
			? BASE_LADDER[0]
			: BASE_LADDER[Math.min(w.stepInPhase, BASE_LADDER.length - 1)];
		return {
			title: l.title,
			details: run(
				l.steps(7),
				paces,
				l.purpose,
				w.recovery
					? 'Recovery week: easy version'
					: `Base ladder, step ${Math.min(w.stepInPhase, BASE_LADDER.length - 1) + 1} of ${BASE_LADDER.length}`
			)
		};
	}
	if (w.phase === 'taper') {
		if (w.raceWeek)
			return {
				title: 'Race-week tune-up',
				details: run(
					[
						wu(2),
						reps(
							3,
							{ kind: 'work', km: 1, pace: 'goal' },
							{ kind: 'recover', minutes: 2, pace: 'jog' }
						),
						cd(1)
					],
					paces,
					'Short and sharp: remind your legs of race pace, nothing more.'
				)
			};
		return w.taperLeft >= 3
			? {
					title: 'Goal pace 3 × 3 km',
					details: run(
						[
							wu(),
							reps(
								3,
								{ kind: 'work', km: 3, pace: 'goal' },
								{ kind: 'recover', minutes: 2, pace: 'jog' }
							),
							cd()
						],
						paces,
						'Taper: less volume, same intensity. Lock in goal pace.'
					)
				}
			: {
					title: 'Threshold 4 × 1 km',
					details: run(
						[
							wu(),
							reps(
								4,
								{ kind: 'work', km: 1, pace: 'threshold' },
								{ kind: 'recover', minutes: 2, pace: 'jog' }
							),
							cd()
						],
						paces,
						'Taper: keep some intensity so you feel sharp, not flat.'
					)
				};
	}
	if (w.recovery) {
		return {
			title: 'Threshold 2 × 8 min (easy week)',
			details: run(
				[
					wu(),
					reps(
						2,
						{ kind: 'work', minutes: 8, pace: 'threshold' },
						{ kind: 'recover', minutes: 2, pace: 'jog' }
					),
					cd()
				],
				paces,
				'Recovery week: a short reminder of threshold, no progression.'
			)
		};
	}
	if (w.phase === 'build') {
		// two threshold weeks, then one interval week
		const s = w.stepInPhase;
		return s % 3 === 2
			? intervalSession(Math.floor(s / 3), paces)
			: thresholdSession(s - Math.floor(s / 3), paces);
	}
	// peak: alternate marathon-pace runs and the longest threshold sessions
	const s = w.stepInPhase;
	if (s % 2 === 0) {
		const km = MP_LADDER[Math.min(s / 2, MP_LADDER.length - 1)];
		return {
			title: `${km} km at goal pace`,
			details: run(
				[wu(), { kind: 'work', km, pace: 'goal' }, cd()],
				paces,
				'Race-specific: teach your body to hold goal pace while staying relaxed.',
				`Goal-pace ladder, step ${Math.min(s / 2, MP_LADDER.length - 1) + 1} of ${MP_LADDER.length}`
			)
		};
	}
	return thresholdSession(T_LADDER.length - 2 + Math.floor(s / 2), paces);
}

/** Sunday's long run: easy in base, then marathon-pace finishes and blocks. */
export function longRun(
	w: WeekTarget,
	paces: PaceTable,
	raceKm: number
): { title: string; details: RunDetails } {
	const total = w.longKm;
	if (w.raceWeek) {
		return {
			title: 'Race day',
			details: run(
				[{ kind: 'work', km: raceKm, pace: 'goal' }],
				paces,
				'Start controlled at goal pace; the second half is where the race is.'
			)
		};
	}
	const easyLong = (purpose: string) => ({
		title: `Long run ${total} km`,
		details: run([{ kind: 'steady', km: total, pace: 'easy' }], paces, purpose)
	});
	if (w.phase === 'base' || w.recovery)
		return easyLong(
			'Builds endurance. Easy pace the whole way; take fluids for anything over 90 min.'
		);
	if (w.phase === 'taper') {
		const mp = w.taperLeft >= 3 ? 8 : 5;
		return {
			title: `Long run ${total} km, ${mp} km at goal pace`,
			details: run(
				[
					{ kind: 'steady', km: Math.max(total - mp, 4), pace: 'easy' },
					{ kind: 'work', km: mp, pace: 'goal' }
				],
				paces,
				'Taper long run: shorter, with a goal-pace finish.'
			)
		};
	}
	const s = w.stepInPhase;
	if (w.phase === 'build') {
		if (s % 2 === 0) return easyLong('Easy long run; time on feet.');
		const mp = Math.min(3 + Math.floor(s / 2) * 1.5, 8);
		return {
			title: `Long run ${total} km, last ${mp} km at goal pace`,
			details: run(
				[
					{ kind: 'steady', km: Math.max(total - mp, 6), pace: 'easy' },
					{ kind: 'work', km: mp, pace: 'goal' }
				],
				paces,
				'Finish at goal pace on tired legs: the core marathon skill.',
				`Goal-pace finish grows each time: ${mp} km now`
			)
		};
	}
	// peak: goal-pace blocks inside the longest runs
	const blocks: [number, number][] = [
		[2, 5],
		[3, 5],
		[2, 8]
	];
	if (s % 2 === 1) return easyLong('Longest easy run: time on feet, practise race fuelling.');
	const [n, km] = blocks[Math.min(s / 2, blocks.length - 1)];
	const rest = Math.max(total - n * km - (n - 1), 6);
	return {
		title: `Long run ${total} km with ${n} × ${km} km at goal pace`,
		details: run(
			[
				{ kind: 'warmup', km: rest / 2, pace: 'easy' },
				reps(n, { kind: 'work', km, pace: 'goal' }, { kind: 'recover', km: 1, pace: 'easy' }),
				{ kind: 'cooldown', km: rest / 2, pace: 'easy' }
			],
			paces,
			'The key marathon session: goal pace deep into a long run. Practise race fuelling.',
			`Goal-pace blocks: ${n * km} km total`
		)
	};
}
