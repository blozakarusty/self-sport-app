import { db } from '../db';
import { athlete } from '../db/schema';
import { strava } from '../sources/strava';
import type { DataSource } from '../sources/types';

/** Register new data sources here. */
export const sources: DataSource[] = [strava];

export async function syncAthlete(athleteId: number) {
	const results = [];
	for (const source of sources) {
		if (source.isConnected(athleteId)) results.push(await source.sync(athleteId));
	}
	return results;
}

export async function syncAll() {
	for (const { id } of db.select({ id: athlete.id }).from(athlete).all()) {
		const results = await syncAthlete(id);
		for (const r of results) {
			console.log(
				`[sync] athlete ${id} ${r.source}: ${r.upserted} activities${r.partial ? ' (partial)' : ''}`
			);
		}
	}
}
