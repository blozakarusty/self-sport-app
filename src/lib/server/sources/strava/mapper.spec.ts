import { describe, expect, it } from 'vitest';
import { mapStravaActivity } from './mapper';
import type { StravaSummaryActivity } from './api';

const base: StravaSummaryActivity = {
	id: 20881338532,
	name: 'Lunch Run',
	sport_type: 'Run',
	start_date: '2026-11-06T11:07:50Z',
	start_date_local: '2026-11-06T12:07:50Z',
	timezone: '(GMT+01:00) Europe/Brussels',
	moving_time: 2316,
	elapsed_time: 2363,
	distance: 7240.2,
	total_elevation_gain: 11,
	has_heartrate: true,
	average_heartrate: 142.3,
	max_heartrate: 160,
	suffer_score: 14,
	workout_type: 0,
	trainer: false
};

describe('mapStravaActivity', () => {
	it('normalizes a Strava summary activity', () => {
		expect(mapStravaActivity(base, 7)).toMatchObject({
			id: 'strava:20881338532',
			source: 'strava',
			sourceId: '20881338532',
			athleteId: 7,
			sportType: 'Run',
			startDate: '2026-11-06T11:07:50Z',
			startDateLocal: '2026-11-06T12:07:50', // fake "Z" stripped
			distance: 7240.2,
			elevationGain: 11,
			avgHr: 142.3,
			maxHr: 160,
			relativeEffort: 14
		});
	});

	it('drops HR when the activity has none', () => {
		const a = mapStravaActivity({ ...base, has_heartrate: false, average_heartrate: 0 }, 7);
		expect(a.avgHr).toBeNull();
		expect(a.maxHr).toBeNull();
	});

	it('falls back to the legacy type field', () => {
		const { sport_type: _s, ...legacy } = base;
		expect(
			mapStravaActivity({ ...legacy, type: 'WeightTraining' } as StravaSummaryActivity, 7).sportType
		).toBe('WeightTraining');
	});
});
