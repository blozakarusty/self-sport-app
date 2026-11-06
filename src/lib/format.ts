export function duration(seconds: number): string {
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = Math.round(seconds % 60);
	return h > 0
		? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
		: `${m}:${String(s).padStart(2, '0')}`;
}

export function km(meters: number, digits = 1): string {
	return (meters / 1000).toFixed(digits);
}

/** min:sec per km */
export function pace(meters: number, seconds: number): string {
	if (meters <= 0) return '–';
	const secPerKm = seconds / (meters / 1000);
	const m = Math.floor(secPerKm / 60);
	const s = Math.round(secPerKm % 60);
	return s === 60 ? `${m + 1}:00` : `${m}:${String(s).padStart(2, '0')}`;
}

const dayFmt = new Intl.DateTimeFormat('en-GB', {
	weekday: 'short',
	day: 'numeric',
	month: 'short',
	timeZone: 'UTC'
});
const shortFmt = new Intl.DateTimeFormat('en-GB', {
	day: 'numeric',
	month: 'short',
	timeZone: 'UTC'
});

/** 'YYYY-MM-DD…' → 'Fri 6 Nov' */
export function dayLabel(isoDay: string): string {
	return dayFmt.format(new Date(`${isoDay.slice(0, 10)}T00:00:00Z`));
}

/** 'YYYY-MM-DD' → '6 Nov' */
export function shortDay(isoDay: string): string {
	return shortFmt.format(new Date(`${isoDay.slice(0, 10)}T00:00:00Z`));
}

export function timeOfDay(startDateLocal: string): string {
	return startDateLocal.slice(11, 16);
}

export function relativeTime(iso: string | null): string {
	if (!iso) return 'never';
	const mins = Math.round((Date.now() - Date.parse(iso)) / 60000);
	if (mins < 1) return 'just now';
	if (mins < 60) return `${mins} min ago`;
	const h = Math.round(mins / 60);
	if (h < 24) return `${h} h ago`;
	return `${Math.round(h / 24)} d ago`;
}

export const PACE_SPORTS = new Set(['Run', 'TrailRun', 'VirtualRun', 'Walk', 'Hike']);
