import { and, eq, gte } from 'drizzle-orm';
import { db } from './db';
import { activity, type Athlete } from './db/schema';
import { athleteToday, hrProfile } from './dashboard';
import { currentVdot } from './performance';
import { addDays } from './engine/metrics/load';
import {
	intensityByWeek,
	loadBySport,
	longestRunPerWeek,
	monthlyHoursBySport,
	sumIntensity,
	zonesFromMaxHr
} from './engine/metrics/insights';

export function getInsights(a: Athlete) {
	const today = athleteToday(a.id);
	const from = `${addDays(today, -366).slice(0, 7)}-01`;
	const acts = db
		.select({
			name: activity.name,
			startDateLocal: activity.startDateLocal,
			sportType: activity.sportType,
			movingTime: activity.movingTime,
			distance: activity.distance,
			elevationGain: activity.elevationGain,
			avgHr: activity.avgHr,
			rpe: activity.rpe,
			laps: activity.laps,
			splits: activity.splits
		})
		.from(activity)
		.where(and(eq(activity.athleteId, a.id), gte(activity.startDateLocal, from)))
		.all();

	const hr = hrProfile(a);
	const zones =
		a.hrZones?.length && a.hrZones.length >= 3 ? a.hrZones : hr ? zonesFromMaxHr(hr.maxHr) : null;
	const vdot = currentVdot(a);
	const bands = vdot && { marathon: vdot.marathon, threshold: vdot.threshold };
	const intensity = zones || bands ? intensityByWeek(acts, zones, bands, today, 12) : null;

	return {
		today,
		monthly: monthlyHoursBySport(acts, today, 12),
		longRuns: longestRunPerWeek(acts, today, 16),
		intensity: intensity && {
			weeks: intensity,
			last4: sumIntensity(intensity.slice(-4)),
			last12: sumIntensity(intensity),
			bands,
			easyMaxHr: zones?.[1].max ?? null,
			moderateMaxHr: zones?.[2].max ?? null
		},
		loadBySport: loadBySport(acts, hr, addDays(today, -27), today)
	};
}
