import { eq, sql } from 'drizzle-orm';
import { STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET } from '$app/env/private';
import { db } from '../../db';
import { activity, athlete, stravaToken, syncState } from '../../db/schema';
import type { DataSource, SyncResult } from '../types';
import {
	exchangeToken,
	stravaGet,
	StravaRateLimitError,
	type StravaAthlete,
	type StravaSummaryActivity,
	type StravaTokenResponse,
	type StravaZones
} from './api';
import { mapStravaActivity } from './mapper';

const PAGE_SIZE = 200;
/** Re-read the last few days every sync to pick up edits and late uploads. */
const OVERLAP_SECONDS = 3 * 24 * 3600;

export function saveTokens(athleteId: number, t: StravaTokenResponse, scope: string) {
	const values = {
		athleteId,
		accessToken: t.access_token,
		refreshToken: t.refresh_token,
		expiresAt: t.expires_at,
		scope
	};
	db.insert(stravaToken)
		.values(values)
		.onConflictDoUpdate({ target: stravaToken.athleteId, set: values })
		.run();
}

async function accessToken(athleteId: number): Promise<string> {
	const row = db.select().from(stravaToken).where(eq(stravaToken.athleteId, athleteId)).get();
	if (!row) throw new Error('Strava is not connected');
	if (row.expiresAt - 60 > Date.now() / 1000) return row.accessToken;

	const t = await exchangeToken({
		client_id: STRAVA_CLIENT_ID,
		client_secret: STRAVA_CLIENT_SECRET,
		grant_type: 'refresh_token',
		refresh_token: row.refreshToken
	});
	saveTokens(athleteId, t, row.scope);
	return t.access_token;
}

export function upsertAthleteFromStrava(a: StravaAthlete) {
	const values = {
		id: a.id,
		firstName: a.firstname ?? null,
		lastName: a.lastname ?? null,
		weightKg: a.weight ?? null,
		units: a.measurement_preference === 'feet' ? ('imperial' as const) : ('metric' as const)
	};
	db.insert(athlete).values(values).onConflictDoUpdate({ target: athlete.id, set: values }).run();
}

async function refreshProfile(athleteId: number, token: string) {
	const [profile, zones] = await Promise.all([
		stravaGet<StravaAthlete>(token, '/athlete'),
		stravaGet<StravaZones>(token, '/athlete/zones').catch(() => null)
	]);
	upsertAthleteFromStrava(profile);
	if (zones?.heart_rate?.zones) {
		db.update(athlete)
			.set({ hrZones: zones.heart_rate.zones })
			.where(eq(athlete.id, athleteId))
			.run();
	}
}

const running = new Set<number>();

export const strava: DataSource = {
	id: 'strava',

	isConnected(athleteId) {
		return !!db.select().from(stravaToken).where(eq(stravaToken.athleteId, athleteId)).get();
	},

	async sync(athleteId): Promise<SyncResult> {
		if (running.has(athleteId)) {
			return { source: 'strava', upserted: 0, partial: true, message: 'Sync already running' };
		}
		running.add(athleteId);

		db.insert(syncState).values({ athleteId }).onConflictDoNothing().run();
		const state = db.select().from(syncState).where(eq(syncState.athleteId, athleteId)).get()!;

		let cursor = state.cursor;
		let upserted = 0;
		try {
			const token = await accessToken(athleteId);
			await refreshProfile(athleteId, token);

			// With `after`, Strava returns activities oldest-first, so the cursor
			// can advance page by page and an interrupted backfill resumes cleanly.
			const after = state.backfillComplete ? Math.max(0, cursor - OVERLAP_SECONDS) : cursor;
			for (let page = 1; ; page++) {
				const batch = await stravaGet<StravaSummaryActivity[]>(token, '/athlete/activities', {
					after,
					page,
					per_page: PAGE_SIZE
				});
				if (batch.length === 0) break;

				db.transaction((tx) => {
					for (const a of batch) {
						const row = mapStravaActivity(a, athleteId);
						const { id: _id, createdAt: _c, ...update } = row;
						tx.insert(activity)
							.values(row)
							.onConflictDoUpdate({
								target: activity.id,
								set: { ...update, updatedAt: new Date() }
							})
							.run();
						cursor = Math.max(cursor, Math.floor(Date.parse(a.start_date) / 1000));
					}
				});
				upserted += batch.length;
				db.update(syncState).set({ cursor }).where(eq(syncState.athleteId, athleteId)).run();
				if (batch.length < PAGE_SIZE) break;
			}

			db.update(syncState)
				.set({ cursor, backfillComplete: true, lastSyncAt: new Date(), lastError: null })
				.where(eq(syncState.athleteId, athleteId))
				.run();
			return { source: 'strava', upserted, partial: false };
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e);
			db.update(syncState)
				.set({ cursor, lastSyncAt: new Date(), lastError: message })
				.where(eq(syncState.athleteId, athleteId))
				.run();
			if (e instanceof StravaRateLimitError) {
				return { source: 'strava', upserted, partial: true, message };
			}
			throw e;
		} finally {
			running.delete(athleteId);
		}
	}
};

export function activityCount(athleteId: number): number {
	return (
		db
			.select({ n: sql<number>`count(*)` })
			.from(activity)
			.where(eq(activity.athleteId, athleteId))
			.get()?.n ?? 0
	);
}
