import { and, desc, eq, gte } from 'drizzle-orm';
import { db } from './db';
import { activity, syncState, type Athlete } from './db/schema';
import {
	acwrZone,
	activityLoad,
	addDays,
	dailyLoads,
	DEFAULT_REST_HR,
	estimateMaxHr,
	fitnessSeries,
	type HrProfile
} from './engine/metrics/load';
import { weeklyVolume } from './engine/metrics/volume';

/** Days of history fed to the model so CTL has settled before the visible window. */
const WARMUP_DAYS = 180;
const CHART_DAYS = 120;
const WEEKS = 12;

/** "(GMT+01:00) Europe/Brussels" → "Europe/Brussels" */
function ianaZone(stravaTz: unknown): string | undefined {
	if (typeof stravaTz !== 'string') return undefined;
	const zone = stravaTz.split(' ').at(-1);
	try {
		if (zone) new Intl.DateTimeFormat('en', { timeZone: zone });
		return zone;
	} catch {
		return undefined;
	}
}

/** Today's date in the athlete's time zone (taken from their latest activity). */
export function athleteToday(athleteId: number): string {
	const latest = db
		.select({ raw: activity.raw })
		.from(activity)
		.where(eq(activity.athleteId, athleteId))
		.orderBy(desc(activity.startDate))
		.limit(1)
		.get();
	const timeZone = ianaZone((latest?.raw as { timezone?: string } | null)?.timezone);
	return new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date());
}

export function hrProfile(a: Athlete): (HrProfile & { maxHrSource: 'user' | 'estimated' }) | null {
	let maxHr = a.maxHr;
	let maxHrSource: 'user' | 'estimated' = 'user';
	if (!maxHr) {
		const since = new Date(Date.now() - 365 * 864e5).toISOString();
		const rows = db
			.select({ maxHr: activity.maxHr })
			.from(activity)
			.where(and(eq(activity.athleteId, a.id), gte(activity.startDate, since)))
			.all();
		maxHr = estimateMaxHr(rows.map((r) => r.maxHr));
		maxHrSource = 'estimated';
	}
	if (!maxHr) return null;
	return { maxHr, restHr: a.restHr ?? DEFAULT_REST_HR, maxHrSource };
}

export function getDashboard(a: Athlete) {
	const today = athleteToday(a.id);
	const from = addDays(today, -(WARMUP_DAYS + CHART_DAYS));
	const rows = db
		.select({
			startDateLocal: activity.startDateLocal,
			sportType: activity.sportType,
			movingTime: activity.movingTime,
			avgHr: activity.avgHr,
			distance: activity.distance,
			elevationGain: activity.elevationGain
		})
		.from(activity)
		.where(and(eq(activity.athleteId, a.id), gte(activity.startDateLocal, from)))
		.all();

	const hr = hrProfile(a);
	const series = fitnessSeries(dailyLoads(rows, hr, from, today));
	const visible = series.slice(-CHART_DAYS);
	const current = series.at(-1)!;
	const weekAgo = series.at(-8)!;
	const last7 = series.slice(-7).reduce((s, p) => s + p.load, 0);

	const sync = db.select().from(syncState).where(eq(syncState.athleteId, a.id)).get() ?? null;

	return {
		today,
		hr,
		current: {
			ctl: current.ctl,
			atl: current.atl,
			tsb: current.tsb,
			acwr: current.acwr,
			acwrZone: current.acwr == null ? null : acwrZone(current.acwr),
			ctlDelta: current.ctl - weekAgo.ctl,
			last7
		},
		chart: visible.map(({ day, ctl, atl, load }) => ({ day, ctl, atl, load })),
		weeks: weeklyVolume(rows, today, WEEKS),
		sync: sync && {
			lastSyncAt: sync.lastSyncAt?.toISOString() ?? null,
			lastError: sync.lastError,
			backfillComplete: sync.backfillComplete
		}
	};
}

export function listActivities(
	a: Athlete,
	opts: { page: number; perPage: number; sport?: string }
) {
	const hr = hrProfile(a);
	const where = opts.sport
		? and(eq(activity.athleteId, a.id), eq(activity.sportType, opts.sport))
		: eq(activity.athleteId, a.id);
	const rows = db
		.select()
		.from(activity)
		.where(where)
		.orderBy(desc(activity.startDate))
		.limit(opts.perPage + 1)
		.offset((opts.page - 1) * opts.perPage)
		.all();
	const sports = db
		.selectDistinct({ sport: activity.sportType })
		.from(activity)
		.where(eq(activity.athleteId, a.id))
		.all()
		.map((r) => r.sport)
		.sort();
	return {
		hasMore: rows.length > opts.perPage,
		sports,
		activities: rows.slice(0, opts.perPage).map((r) => {
			const { load, method } = activityLoad(r, hr);
			return {
				id: r.id,
				sourceId: r.sourceId,
				name: r.name,
				sportType: r.sportType,
				startDateLocal: r.startDateLocal,
				movingTime: r.movingTime,
				distance: r.distance,
				elevationGain: r.elevationGain,
				avgHr: r.avgHr,
				load,
				loadMethod: method
			};
		})
	};
}
