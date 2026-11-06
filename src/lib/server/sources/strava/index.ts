import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET } from '$app/env/private';
import { db } from '../../db';
import { activity, athlete, bestEffort, stravaToken, syncState } from '../../db/schema';
import type { DataSource, SyncResult } from '../types';
import {
	exchangeToken,
	stravaGet,
	StravaRateLimitError,
	type StravaAthlete,
	type StravaDetailedActivity,
	type StravaSummaryActivity,
	type StravaTokenResponse,
	type StravaZones
} from './api';
import { isPlausibleActivity, mapStravaActivity, mapStravaDetail } from './mapper';

const PAGE_SIZE = 200;
/** Re-read the last few days every sync to pick up edits and late uploads. */
const OVERLAP_SECONDS = 3 * 24 * 3600;
/**
 * Max detail requests (splits, laps, best efforts) per sync run. With hourly
 * syncs this stays under Strava's 1,000 reads/day; history fills in newest first.
 */
const DETAIL_BUDGET = 40;
export const DETAIL_SPORTS = ['Run', 'TrailRun', 'VirtualRun'];

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
						cursor = Math.max(cursor, Math.floor(Date.parse(a.start_date) / 1000));
						if (!isPlausibleActivity(a)) continue;
						const row = mapStravaActivity(a, athleteId);
						const { id: _id, createdAt: _c, ...update } = row;
						tx.insert(activity)
							.values(row)
							.onConflictDoUpdate({
								target: activity.id,
								set: { ...update, updatedAt: new Date() }
							})
							.run();
					}
				});
				upserted += batch.length;
				db.update(syncState).set({ cursor }).where(eq(syncState.athleteId, athleteId)).run();
				if (batch.length < PAGE_SIZE) break;
			}

			db.update(syncState)
				.set({ cursor, backfillComplete: true })
				.where(eq(syncState.athleteId, athleteId))
				.run();

			const { fetched, remaining } = await fetchPendingDetails(athleteId, token, DETAIL_BUDGET);

			db.update(syncState)
				.set({ lastSyncAt: new Date(), lastError: null })
				.where(eq(syncState.athleteId, athleteId))
				.run();
			return {
				source: 'strava',
				upserted,
				partial: remaining > 0,
				message:
					fetched || remaining ? `${fetched} run details fetched, ${remaining} to go` : undefined
			};
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

function pendingDetailsQuery(athleteId: number) {
	return and(
		eq(activity.athleteId, athleteId),
		eq(activity.source, 'strava'),
		inArray(activity.sportType, DETAIL_SPORTS),
		isNull(activity.detailFetchedAt)
	);
}

export function pendingDetailCount(athleteId: number): number {
	return (
		db
			.select({ n: sql<number>`count(*)` })
			.from(activity)
			.where(pendingDetailsQuery(athleteId))
			.get()?.n ?? 0
	);
}

function saveDetail(activityId: string, athleteId: number, d: StravaDetailedActivity) {
	const { splits, laps, bestEfforts } = mapStravaDetail(d);
	db.transaction((tx) => {
		tx.update(activity)
			.set({ splits, laps, detailFetchedAt: new Date() })
			.where(eq(activity.id, activityId))
			.run();
		tx.delete(bestEffort).where(eq(bestEffort.activityId, activityId)).run();
		for (const e of bestEfforts) {
			tx.insert(bestEffort)
				.values({ ...e, activityId, athleteId })
				.onConflictDoNothing()
				.run();
		}
	});
}

async function fetchDetail(token: string, sourceId: string) {
	return stravaGet<StravaDetailedActivity>(token, `/activities/${sourceId}`, {
		include_all_efforts: 'false'
	});
}

/** Fetch details for recent runs, newest first, stopping at the budget. */
async function fetchPendingDetails(athleteId: number, token: string, budget: number) {
	const pending = db
		.select({ id: activity.id, sourceId: activity.sourceId })
		.from(activity)
		.where(pendingDetailsQuery(athleteId))
		.orderBy(desc(activity.startDate))
		.all();
	let fetched = 0;
	for (const row of pending.slice(0, budget)) {
		saveDetail(row.id, athleteId, await fetchDetail(token, row.sourceId));
		fetched++;
	}
	return { fetched, remaining: pending.length - fetched };
}

/** Fetch (or refresh) one activity's details on demand, e.g. from its detail page. */
export async function fetchActivityDetail(athleteId: number, activityId: string) {
	const row = db
		.select({ sourceId: activity.sourceId })
		.from(activity)
		.where(and(eq(activity.id, activityId), eq(activity.athleteId, athleteId)))
		.get();
	if (!row) throw new Error('Activity not found');
	saveDetail(activityId, athleteId, await fetchDetail(await accessToken(athleteId), row.sourceId));
}

export function activityCount(athleteId: number): number {
	return (
		db
			.select({ n: sql<number>`count(*)` })
			.from(activity)
			.where(eq(activity.athleteId, athleteId))
			.get()?.n ?? 0
	);
}
