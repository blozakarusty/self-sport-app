import type { Lap, NewActivity, Split } from '../../db/schema';
import type { StravaDetailedActivity, StravaSummaryActivity } from './api';

/** Strava returns local time with a fake "Z"; strip it so it reads as wall-clock time. */
function stripZ(iso: string) {
	return iso.endsWith('Z') ? iso.slice(0, -1) : iso;
}

export function mapStravaActivity(a: StravaSummaryActivity, athleteId: number): NewActivity {
	return {
		id: `strava:${a.id}`,
		source: 'strava',
		sourceId: String(a.id),
		athleteId,
		name: a.name,
		sportType: a.sport_type ?? a.type ?? 'Workout',
		startDate: a.start_date,
		startDateLocal: stripZ(a.start_date_local),
		movingTime: a.moving_time,
		elapsedTime: a.elapsed_time,
		distance: a.distance ?? 0,
		elevationGain: a.total_elevation_gain ?? 0,
		avgHr: a.has_heartrate === false ? null : (a.average_heartrate ?? null),
		maxHr: a.has_heartrate === false ? null : (a.max_heartrate ?? null),
		relativeEffort: a.suffer_score ?? null,
		workoutType: a.workout_type ?? null,
		trainer: a.trainer ?? false,
		raw: a
	};
}

/** Activities dated before Strava existed come from watches with a reset clock. */
export function isPlausibleActivity(a: StravaSummaryActivity): boolean {
	return a.start_date >= '2008-01-01';
}

type SplitLike = NonNullable<StravaDetailedActivity['splits_metric']>[number];

function mapSplit(s: SplitLike): Split {
	return {
		distance: s.distance,
		movingTime: s.moving_time,
		elapsedTime: s.elapsed_time,
		elevationDifference: s.elevation_difference ?? s.total_elevation_gain ?? null,
		avgHr: s.average_heartrate ?? null
	};
}

export function mapStravaDetail(d: StravaDetailedActivity) {
	return {
		splits: (d.splits_metric ?? []).map(mapSplit),
		laps: (d.laps ?? []).map((l): Lap => ({ name: l.name, ...mapSplit(l) })),
		bestEfforts: (d.best_efforts ?? []).map((e) => ({
			id: `strava:${e.id}`,
			name: e.name,
			distance: e.distance,
			elapsedTime: e.elapsed_time,
			startDateLocal: stripZ(e.start_date_local)
		}))
	};
}
