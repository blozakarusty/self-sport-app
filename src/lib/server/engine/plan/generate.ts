/**
 * Lays runs, strength, grease-the-groove and leisure into your week template
 * for every week from today to race day. Pure function; the result is stored.
 *
 * Default week (long run on Sunday):
 *   Mon easy run · Tue tennis (leisure) · Wed quality run · Thu legs + core
 *   Fri easy run · Sat upper body (+ optional easy run in build/peak) · Sun long run
 * With the long run on Saturday, Saturday and Sunday swap.
 * Grease-the-groove pull-ups run Monday to Friday.
 */
import { addDays } from '../metrics/load';
import { weekStart } from '../metrics/volume';
import type { Phase, PhaseName } from '../goals/phases';
import {
	easyRun,
	longRun,
	qualitySession,
	weeklyTargets,
	type PaceTable,
	type RunDetails,
	type WeekTarget
} from './runs';
import { gtg, strengthSession, type GtgDetails, type StrengthDetails } from './strength';

export interface PlanPrefs {
	longRunDay: 'sat' | 'sun';
	optionalExtraRun: boolean;
}

export const DEFAULT_PREFS: PlanPrefs = { longRunDay: 'sun', optionalExtraRun: true };

export interface LeisureDetails {
	kind: 'leisure';
	note: string;
}

export type SessionDetails = RunDetails | StrengthDetails | GtgDetails | LeisureDetails;

export interface PlannedSession {
	date: string;
	kind: 'run' | 'strength' | 'gtg' | 'leisure';
	type: string;
	title: string;
	optional: boolean;
	key: boolean;
	details: SessionDetails;
	phase: PhaseName;
	week: number;
}

export interface PlanInput {
	today: string;
	raceDay: string;
	raceKm: number;
	phases: Phase[];
	/** your recent 4-week average */
	startKm: number;
	/** your recent longest road run */
	startLongKm: number;
	peakKm: number;
	peakLongKm: number;
	paces: PaceTable;
	prefs: PlanPrefs;
	pullupMax: number | null;
	weights: Record<string, number>;
}

/** Benchmarks to re-test on the strength days of a test week. */
const TESTS = {
	legs: ['kb-swings-5min', 'pistol-squat'],
	upper: ['pullups-max', 'pushups-max', 'plank']
};

export function planWeeks(phases: Phase[]) {
	return phases.flatMap((p) =>
		Array.from({ length: p.weeks }, (_, i) => {
			const monday = addDays(p.start, i * 7);
			return {
				monday,
				phase: p.name,
				recovery: p.recoveryWeeks.includes(monday),
				test: p.testWeek === monday
			};
		})
	);
}

export function generatePlan(input: PlanInput): {
	sessions: PlannedSession[];
	targets: WeekTarget[];
} {
	const weeks = planWeeks(input.phases);
	const targets = weeklyTargets(weeks, {
		startKm: input.startKm,
		peakKm: input.peakKm,
		startLongKm: input.startLongKm,
		peakLongKm: input.peakLongKm
	});
	const longOffset = input.prefs.longRunDay === 'sat' ? 5 : 6;
	const freeWeekendOffset = longOffset === 6 ? 5 : 6;
	const taperWeeks = weeks.filter((w) => w.phase === 'taper').length;
	const out: PlannedSession[] = [];

	targets.forEach((t, i) => {
		const w = weeks[i];
		const day = (offset: number) => addDays(t.monday, offset);
		const add = (offset: number, s: Omit<PlannedSession, 'date' | 'phase' | 'week'>) => {
			const date = day(offset);
			if (date < input.today || date > input.raceDay) return;
			out.push({ ...s, date, phase: t.phase, week: t.week });
		};

		// Runs
		const quality = qualitySession(t, input.paces);
		const long = longRun(t, input.paces, input.raceKm);
		const restKm = Math.max(0, t.km - quality.details.km - (t.raceWeek ? 0 : long.details.km));
		const monKm = t.raceWeek ? 6 : Math.min(14, Math.max(5, restKm * 0.55));
		const friKm = t.raceWeek ? 5 : Math.min(14, Math.max(5, restKm * 0.45));
		const sharpen = t.phase !== 'base' || t.raceWeek;

		add(0, {
			kind: 'run',
			type: 'easy',
			title: `Easy run ${Math.round(monKm)} km`,
			optional: false,
			key: false,
			details: easyRun(monKm, input.paces)
		});
		add(2, {
			kind: 'run',
			type: 'quality',
			title: quality.title,
			optional: false,
			key: true,
			details: quality.details
		});
		add(4, {
			kind: 'run',
			type: 'easy',
			title: `Easy run ${Math.round(friKm)} km${sharpen ? ' + strides' : ''}`,
			optional: false,
			key: false,
			details: easyRun(friKm, input.paces, sharpen ? 4 : 0)
		});
		if (t.raceWeek) {
			// race on race day itself, whatever weekday it is
			const offset = Math.round((Date.parse(input.raceDay) - Date.parse(t.monday)) / 864e5);
			add(offset, {
				kind: 'run',
				type: 'race',
				title: long.title,
				optional: false,
				key: true,
				details: long.details
			});
		} else {
			add(longOffset, {
				kind: 'run',
				type: 'long',
				title: long.title,
				optional: false,
				key: true,
				details: long.details
			});
		}
		if (
			input.prefs.optionalExtraRun &&
			(t.phase === 'build' || t.phase === 'peak') &&
			!t.recovery
		) {
			add(freeWeekendOffset, {
				kind: 'run',
				type: 'easy',
				title: 'Optional easy run 6 km',
				optional: true,
				key: false,
				details: easyRun(6, input.paces)
			});
		}

		// Tennis: leisure, outside the training rules
		add(1, {
			kind: 'leisure',
			type: 'tennis',
			title: 'Tennis',
			optional: true,
			key: false,
			details: { kind: 'leisure', note: 'Leisure; not part of the training load rules.' }
		});

		// Strength: legs Thursday (≥ 48 h before the long run), upper on the free weekend day
		const firstTaperWeek = t.phase === 'taper' && t.taperLeft === taperWeeks;
		const legs = strengthSession(
			'legs',
			t.phase,
			input.weights,
			t.recovery,
			w.test ? TESTS.legs : undefined
		);
		if (legs)
			add(3, {
				kind: 'strength',
				type: 'legs',
				title: legs.title,
				optional: false,
				key: false,
				details: legs.details
			});
		if (t.phase !== 'taper' || firstTaperWeek) {
			const upper = strengthSession(
				'upper',
				t.phase,
				input.weights,
				t.recovery,
				w.test ? TESTS.upper : undefined
			);
			if (upper)
				add(freeWeekendOffset, {
					kind: 'strength',
					type: 'upper',
					title: upper.title,
					optional: false,
					key: false,
					details: upper.details
				});
		}

		// Grease the groove, Monday to Friday
		const g = gtg(input.pullupMax, t.phase, t.raceWeek);
		if (g) {
			for (let d = 0; d < 5; d++) {
				add(d, {
					kind: 'gtg',
					type: 'gtg',
					title: `Pull-ups: ${g.sets} × ${g.reps}`,
					optional: true,
					key: false,
					details: g
				});
			}
		}
	});

	return {
		sessions: out.sort((a, b) => a.date.localeCompare(b.date) || order(a) - order(b)),
		targets
	};
}

const ORDER: Record<string, number> = { run: 0, strength: 1, gtg: 2, leisure: 3 };
function order(s: { kind: string }) {
	return ORDER[s.kind] ?? 9;
}

/** Monday of the week containing `day` (re-exported for callers). */
export { weekStart };
