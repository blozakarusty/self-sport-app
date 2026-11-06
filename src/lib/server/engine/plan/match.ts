/**
 * Plan versus actual: link synced activities to planned sessions and summarise
 * each week. Pure functions only.
 */
import { addDays, dayOf } from '../metrics/load';
import { RUN_SPORTS } from '../metrics/volume';
import { STRENGTH_SPORTS } from '../strength/benchmarks';

export interface PlanItem {
	id: number;
	date: string;
	kind: string;
	type: string;
	optional: boolean;
	key: boolean;
	skipped: boolean;
	km?: number;
}

export interface ActivityItem {
	id: string;
	startDateLocal: string;
	sportType: string;
	distance: number;
	movingTime: number;
	name: string;
}

export type SessionStatus = 'done' | 'skipped' | 'missed' | 'planned' | 'today';

function matches(kind: string, type: string, sport: string) {
	if (kind === 'run') return RUN_SPORTS.has(sport);
	if (kind === 'strength') return STRENGTH_SPORTS.has(sport);
	if (kind === 'leisure' && type === 'tennis') return sport === 'Tennis';
	return false;
}

/**
 * Greedy matching: key sessions first, then required, then optional; same day
 * first, then ±1 day for activities you moved without telling the plan.
 * Grease-the-groove has no activity to match.
 */
export function matchActivities(
	items: PlanItem[],
	acts: ActivityItem[]
): Map<number, ActivityItem> {
	const used = new Set<string>();
	const result = new Map<number, ActivityItem>();
	const ranked = [...items]
		.filter((i) => i.kind !== 'gtg' && !i.skipped)
		.sort(
			(a, b) =>
				Number(b.key) - Number(a.key) ||
				Number(a.optional) - Number(b.optional) ||
				a.date.localeCompare(b.date)
		);
	for (const pass of [0, 1]) {
		for (const item of ranked) {
			if (result.has(item.id)) continue;
			const days = pass === 0 ? [item.date] : [addDays(item.date, -1), addDays(item.date, 1)];
			const candidates = acts.filter(
				(a) =>
					!used.has(a.id) &&
					days.includes(dayOf(a.startDateLocal)) &&
					matches(item.kind, item.type, a.sportType)
			);
			if (!candidates.length) continue;
			// closest in distance for runs, longest otherwise
			const best = candidates.sort((x, y) =>
				item.km != null
					? Math.abs(x.distance / 1000 - item.km) - Math.abs(y.distance / 1000 - item.km)
					: y.movingTime - x.movingTime
			)[0];
			used.add(best.id);
			result.set(item.id, best);
		}
	}
	return result;
}

export function sessionStatus(item: PlanItem, matched: boolean, today: string): SessionStatus {
	if (matched) return 'done';
	if (item.skipped) return 'skipped';
	if (item.date < today) return 'missed';
	if (item.date === today) return 'today';
	return 'planned';
}

export interface WeekSummary {
	plannedKm: number;
	actualKm: number;
	required: number;
	requiredDone: number;
	keyTotal: number;
	keyDone: number;
}

export function summarizeWeek(
	items: PlanItem[],
	matched: Map<number, ActivityItem>,
	weekActs: ActivityItem[]
): WeekSummary {
	const required = items.filter((i) => !i.optional && i.kind !== 'gtg');
	return {
		plannedKm: Math.round(
			items.filter((i) => i.kind === 'run' && !i.optional).reduce((s, i) => s + (i.km ?? 0), 0)
		),
		actualKm:
			Math.round(
				weekActs
					.filter((a) => RUN_SPORTS.has(a.sportType))
					.reduce((s, a) => s + a.distance / 1000, 0) * 10
			) / 10,
		required: required.length,
		requiredDone: required.filter((i) => matched.has(i.id)).length,
		keyTotal: items.filter((i) => i.key).length,
		keyDone: items.filter((i) => i.key && matched.has(i.id)).length
	};
}
