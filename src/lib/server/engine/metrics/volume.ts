import { addDays, dayOf } from './load';

export interface VolumeInput {
	startDateLocal: string;
	sportType: string;
	movingTime: number;
	distance: number;
	elevationGain: number;
}

export const RUN_SPORTS = new Set(['Run', 'TrailRun', 'VirtualRun']);

/** Monday of the ISO week containing `day` ('YYYY-MM-DD'). */
export function weekStart(day: string): string {
	const dow = new Date(`${day}T00:00:00Z`).getUTCDay(); // 0 = Sunday
	return addDays(day, -((dow + 6) % 7));
}

export interface WeekVolume {
	week: string; // Monday
	runKm: number;
	runElevation: number;
	runCount: number;
	/** moving time in hours per sport */
	hoursBySport: Record<string, number>;
}

/** Weekly volume for the `weeks` weeks ending with the week containing `today`. */
export function weeklyVolume(
	activities: VolumeInput[],
	today: string,
	weeks: number
): WeekVolume[] {
	const last = weekStart(today);
	const first = addDays(last, -7 * (weeks - 1));
	const byWeek = new Map<string, WeekVolume>();
	for (let w = first; w <= last; w = addDays(w, 7)) {
		byWeek.set(w, { week: w, runKm: 0, runElevation: 0, runCount: 0, hoursBySport: {} });
	}
	for (const a of activities) {
		const bucket = byWeek.get(weekStart(dayOf(a.startDateLocal)));
		if (!bucket) continue;
		if (RUN_SPORTS.has(a.sportType)) {
			bucket.runKm += a.distance / 1000;
			bucket.runElevation += a.elevationGain;
			bucket.runCount++;
		}
		bucket.hoursBySport[a.sportType] =
			(bucket.hoursBySport[a.sportType] ?? 0) + a.movingTime / 3600;
	}
	return [...byWeek.values()];
}
