/** Aggregations for the Insights page. Pure functions only. */
import { activityLoad, addDays, dayOf, type HrProfile, type LoadInput } from './load';
import { RUN_SPORTS, weekStart, type VolumeInput } from './volume';

export type InsightInput = VolumeInput & LoadInput;

function monthKey(day: string) {
	return day.slice(0, 7);
}

function addMonths(month: string, n: number): string {
	const [y, m] = month.split('-').map(Number);
	const d = new Date(Date.UTC(y, m - 1 + n, 1));
	return d.toISOString().slice(0, 7);
}

export const OTHER = 'Other';

export interface MonthlyHours {
	months: string[]; // 'YYYY-MM'
	/** sports in display order, biggest first, `Other` last */
	sports: string[];
	/** hours[monthIndex][sport] */
	hours: Record<string, number>[];
}

/** Hours per sport per month; sports beyond the top `maxSports` fold into "Other". */
export function monthlyHoursBySport(
	acts: VolumeInput[],
	today: string,
	months: number,
	maxSports = 4
): MonthlyHours {
	const last = monthKey(today);
	const keys = Array.from({ length: months }, (_, i) => addMonths(last, i - months + 1));
	const index = new Map(keys.map((k, i) => [k, i]));
	const raw: Record<string, number>[] = keys.map(() => ({}));
	const totals = new Map<string, number>();
	for (const a of acts) {
		const i = index.get(monthKey(dayOf(a.startDateLocal)));
		if (i == null) continue;
		const h = a.movingTime / 3600;
		raw[i][a.sportType] = (raw[i][a.sportType] ?? 0) + h;
		totals.set(a.sportType, (totals.get(a.sportType) ?? 0) + h);
	}
	const ranked = [...totals].sort((a, b) => b[1] - a[1]).map(([s]) => s);
	const top = ranked.slice(0, maxSports);
	const hasOther = ranked.length > maxSports;
	const hours = raw.map((m) => {
		const out: Record<string, number> = {};
		for (const [sport, h] of Object.entries(m)) {
			const key = top.includes(sport) ? sport : OTHER;
			out[key] = (out[key] ?? 0) + h;
		}
		return out;
	});
	return { months: keys, sports: hasOther ? [...top, OTHER] : top, hours };
}

export interface LongRunWeek {
	week: string;
	km: number;
	name: string | null;
}

export function longestRunPerWeek(
	acts: VolumeInput[],
	today: string,
	weeks: number
): LongRunWeek[] {
	const last = weekStart(today);
	const first = addDays(last, -7 * (weeks - 1));
	const byWeek = new Map<string, LongRunWeek>();
	for (let w = first; w <= last; w = addDays(w, 7)) byWeek.set(w, { week: w, km: 0, name: null });
	for (const a of acts) {
		if (!RUN_SPORTS.has(a.sportType)) continue;
		const b = byWeek.get(weekStart(dayOf(a.startDateLocal)));
		if (b && a.distance / 1000 > b.km) {
			b.km = a.distance / 1000;
			b.name = (a as { name?: string }).name ?? null;
		}
	}
	return [...byWeek.values()];
}

export type Intensity = 'easy' | 'moderate' | 'hard';

/**
 * Classify a run by its average HR: up to the top of zone 2 is easy, zone 3 is
 * moderate, above is hard. Approximate: intervals average out to "moderate".
 */
export function classifyIntensity(avgHr: number, zones: { min: number; max: number }[]): Intensity {
	if (avgHr <= zones[1].max) return 'easy';
	if (avgHr <= zones[2].max) return 'moderate';
	return 'hard';
}

/** Fallback zones from max HR (Strava's default 65/81/89/97% split). */
export function zonesFromMaxHr(maxHr: number) {
	const z = (lo: number, hi: number) => ({
		min: Math.round(maxHr * lo),
		max: Math.round(maxHr * hi)
	});
	return [
		z(0, 0.65),
		z(0.65, 0.81),
		z(0.81, 0.89),
		z(0.89, 0.97),
		{ min: Math.round(maxHr * 0.97), max: -1 }
	];
}

export interface IntensityWeek {
	week: string;
	/** run minutes by intensity */
	easy: number;
	moderate: number;
	hard: number;
}

/** Pace boundaries (s/km) for pace-based classification. */
export interface PaceBands {
	marathon: number;
	threshold: number;
}

/**
 * Classify a stretch of running by pace: slower than marathon pace is easy,
 * between marathon and threshold is moderate, threshold or faster is hard.
 * A 3% margin keeps steady running near a boundary on the slower side.
 */
export function classifyPace(paceSecPerKm: number, bands: PaceBands): Intensity {
	if (paceSecPerKm > bands.marathon * 1.03) return 'easy';
	if (paceSecPerKm > bands.threshold * 1.03) return 'moderate';
	return 'hard';
}

export interface Segment {
	distance: number;
	movingTime: number;
}

export type IntensityInput = InsightInput & { laps?: Segment[] | null; splits?: Segment[] | null };

/**
 * Minutes per intensity for one run. Road runs with laps or splits are checked
 * lap by lap: laps at threshold pace or faster are hard (this catches 400 m
 * repeats whose average HR looks easy). Every other lap takes the run's
 * HR-based class, so an underestimated VDOT can't turn easy runs "moderate".
 * Trail runs and runs without laps use average HR only.
 */
export function runIntensity(
	a: IntensityInput,
	zones: { min: number; max: number }[] | null,
	bands: PaceBands | null
): Partial<Record<Intensity, number>> {
	const segments = a.laps && a.laps.length > 1 ? a.laps : a.splits;
	if (bands && a.sportType === 'Run' && segments && segments.length > 1) {
		const out: Partial<Record<Intensity, number>> = {};
		const hrClass = zones && a.avgHr ? classifyIntensity(a.avgHr, zones) : null;
		for (const s of segments) {
			if (s.movingTime <= 0) continue;
			const byPace =
				s.distance > 50 ? classifyPace(s.movingTime / (s.distance / 1000), bands) : 'easy';
			const cls = byPace === 'hard' ? 'hard' : (hrClass ?? byPace);
			out[cls] = (out[cls] ?? 0) + s.movingTime / 60;
		}
		return out;
	}
	if (zones && a.avgHr) return { [classifyIntensity(a.avgHr, zones)]: a.movingTime / 60 };
	return {};
}

export function intensityByWeek(
	acts: IntensityInput[],
	zones: { min: number; max: number }[] | null,
	bands: PaceBands | null,
	today: string,
	weeks: number
): IntensityWeek[] {
	const last = weekStart(today);
	const first = addDays(last, -7 * (weeks - 1));
	const byWeek = new Map<string, IntensityWeek>();
	for (let w = first; w <= last; w = addDays(w, 7)) {
		byWeek.set(w, { week: w, easy: 0, moderate: 0, hard: 0 });
	}
	for (const a of acts) {
		if (!RUN_SPORTS.has(a.sportType)) continue;
		const b = byWeek.get(weekStart(dayOf(a.startDateLocal)));
		if (!b) continue;
		for (const [k, v] of Object.entries(runIntensity(a, zones, bands))) b[k as Intensity] += v;
	}
	return [...byWeek.values()];
}

export function sumIntensity(weeks: IntensityWeek[]) {
	const t = weeks.reduce(
		(s, w) => ({ easy: s.easy + w.easy, moderate: s.moderate + w.moderate, hard: s.hard + w.hard }),
		{ easy: 0, moderate: 0, hard: 0 }
	);
	const total = t.easy + t.moderate + t.hard;
	return { ...t, total, easyShare: total ? t.easy / total : null };
}

export interface SportLoad {
	sport: string;
	load: number;
	hours: number;
	count: number;
}

export function loadBySport(
	acts: InsightInput[],
	hr: HrProfile | null,
	from: string,
	to: string
): SportLoad[] {
	const out = new Map<string, SportLoad>();
	for (const a of acts) {
		const day = dayOf(a.startDateLocal);
		if (day < from || day > to) continue;
		const s = out.get(a.sportType) ?? { sport: a.sportType, load: 0, hours: 0, count: 0 };
		s.load += activityLoad(a, hr).load;
		s.hours += a.movingTime / 3600;
		s.count++;
		out.set(a.sportType, s);
	}
	return [...out.values()].sort((a, b) => b.load - a.load);
}
