import { eq } from 'drizzle-orm';
import { db } from '../db';
import { athlete } from '../db/schema';
import { runWeeklyReview } from '../adapt';
import { generateFeedback } from '../feedback';
import { strava } from '../sources/strava';
import type { DataSource } from '../sources/types';

/** Register new data sources here. */
export const sources: DataSource[] = [strava];

export async function syncAthlete(athleteId: number) {
	const results = [];
	for (const source of sources) {
		if (source.isConnected(athleteId)) results.push(await source.sync(athleteId));
	}
	// A short coach note on anything new; never let it break the sync
	const a = db.select().from(athlete).where(eq(athlete.id, athleteId)).get();
	if (a) await generateFeedback(a).catch((e) => console.warn('[feedback]', e));
	return results;
}

export async function syncAll() {
	for (const a of db.select().from(athlete).all()) {
		const { id } = a;
		const results = await syncAthlete(id);
		for (const r of results) {
			console.log(
				`[sync] athlete ${id} ${r.source}: ${r.upserted} activities${r.partial ? ' (partial)' : ''}`
			);
		}
		// Review last week, but only with a complete picture of it
		if (!results.some((r) => r.message?.includes('rate limit'))) {
			const revision = await runWeeklyReview(a);
			if (revision) console.log(`[review] athlete ${id}: weekly review ${revision} applied`);
		}
	}
}
