import { error, fail, redirect } from '@sveltejs/kit';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { activity, bestEffort } from '#lib/server/db/schema.ts';
import { hrProfile } from '#lib/server/dashboard.ts';
import { activityLoad } from '#lib/server/engine/metrics/load.ts';
import { classifyIntensity, zonesFromMaxHr } from '#lib/server/engine/metrics/insights.ts';
import { fetchActivityDetail } from '#lib/server/sources/strava/index.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, params }) => {
	if (!locals.athlete) redirect(303, '/');
	const a = db
		.select()
		.from(activity)
		.where(and(eq(activity.id, params.id), eq(activity.athleteId, locals.athlete.id)))
		.get();
	if (!a) error(404, 'Activity not found');

	const hr = hrProfile(locals.athlete);
	const zones = locals.athlete.hrZones?.length
		? locals.athlete.hrZones
		: hr
			? zonesFromMaxHr(hr.maxHr)
			: null;
	const { load, method } = activityLoad(a, hr);
	const zoneIndex =
		a.avgHr && zones
			? zones.findIndex((z) => a.avgHr! >= z.min && (z.max < 0 || a.avgHr! <= z.max))
			: -1;

	return {
		activity: {
			id: a.id,
			sourceId: a.sourceId,
			source: a.source,
			name: a.name,
			sportType: a.sportType,
			startDateLocal: a.startDateLocal,
			movingTime: a.movingTime,
			elapsedTime: a.elapsedTime,
			distance: a.distance,
			elevationGain: a.elevationGain,
			avgHr: a.avgHr,
			maxHr: a.maxHr,
			description: (a.raw as { description?: string } | null)?.description ?? null,
			splits: a.splits,
			laps: a.laps,
			detailFetchedAt: a.detailFetchedAt?.toISOString() ?? null
		},
		load,
		loadMethod: method,
		hr,
		zone: zoneIndex >= 0 ? zoneIndex + 1 : null,
		intensity: a.avgHr && zones ? classifyIntensity(a.avgHr, zones) : null,
		bestEfforts: db
			.select()
			.from(bestEffort)
			.where(eq(bestEffort.activityId, a.id))
			.orderBy(asc(bestEffort.distance))
			.all()
	};
};

export const actions: Actions = {
	fetchDetail: async ({ locals, params }) => {
		if (!locals.athlete) return fail(401);
		try {
			await fetchActivityDetail(locals.athlete.id, params.id);
			return { fetched: true };
		} catch (e) {
			return fail(502, { error: e instanceof Error ? e.message : 'Could not fetch details' });
		}
	}
};
