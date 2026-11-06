import type { NewActivity } from '../../db/schema';
import type { StravaSummaryActivity } from './api';

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
