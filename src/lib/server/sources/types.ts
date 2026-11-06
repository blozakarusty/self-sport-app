import type { NewActivity } from '../db/schema';

export interface SyncResult {
	source: string;
	upserted: number;
	/** true when the source stopped early (e.g. rate limit) and will resume next run */
	partial: boolean;
	message?: string;
}

/**
 * A provider of activities (Strava now; Garmin, Hevy, Apple Health later).
 * Implementations write normalized `activity` rows and keep their own cursor.
 */
export interface DataSource {
	id: string;
	isConnected(athleteId: number): boolean;
	sync(athleteId: number): Promise<SyncResult>;
}

export type { NewActivity };
