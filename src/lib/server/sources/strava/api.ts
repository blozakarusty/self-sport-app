/** Minimal typed subset of the Strava v3 API we use. */

export interface StravaTokenResponse {
	access_token: string;
	refresh_token: string;
	expires_at: number;
	athlete?: StravaAthlete;
}

export interface StravaAthlete {
	id: number;
	firstname?: string;
	lastname?: string;
	weight?: number | null;
	measurement_preference?: 'meters' | 'feet';
}

export interface StravaZones {
	heart_rate?: { custom_zones: boolean; zones: { min: number; max: number }[] };
}

export interface StravaSummaryActivity {
	id: number;
	name: string;
	sport_type: string;
	type?: string;
	start_date: string;
	start_date_local: string;
	timezone?: string;
	moving_time: number;
	elapsed_time: number;
	distance: number;
	total_elevation_gain: number;
	has_heartrate?: boolean;
	average_heartrate?: number;
	max_heartrate?: number;
	suffer_score?: number | null;
	workout_type?: number | null;
	trainer?: boolean;
	[key: string]: unknown;
}

const BASE = 'https://www.strava.com';

export class StravaRateLimitError extends Error {
	constructor(public usage: string | null) {
		super(`Strava rate limit reached (usage ${usage ?? 'unknown'}). Sync will resume later.`);
	}
}

export class StravaAuthError extends Error {}

export async function exchangeToken(
	params: { client_id: string; client_secret: string } & (
		| { grant_type: 'authorization_code'; code: string }
		| { grant_type: 'refresh_token'; refresh_token: string }
	)
): Promise<StravaTokenResponse> {
	const res = await fetch(`${BASE}/oauth/token`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(params)
	});
	if (!res.ok) throw new StravaAuthError(`Strava token exchange failed: ${res.status}`);
	return res.json();
}

export async function stravaGet<T>(
	accessToken: string,
	path: string,
	query: Record<string, string | number> = {}
): Promise<T> {
	const url = new URL(`${BASE}/api/v3${path}`);
	for (const [k, v] of Object.entries(query)) url.searchParams.set(k, String(v));
	const res = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` } });
	if (res.status === 429) throw new StravaRateLimitError(res.headers.get('x-ratelimit-usage'));
	if (res.status === 401) throw new StravaAuthError('Strava rejected the access token');
	if (!res.ok) throw new Error(`Strava GET ${path} failed: ${res.status}`);
	return res.json() as Promise<T>;
}

export function authorizeUrl(clientId: string, redirectUri: string, state: string) {
	const url = new URL(`${BASE}/oauth/authorize`);
	url.searchParams.set('client_id', clientId);
	url.searchParams.set('redirect_uri', redirectUri);
	url.searchParams.set('response_type', 'code');
	url.searchParams.set('approval_prompt', 'auto');
	url.searchParams.set('scope', REQUIRED_SCOPES.join(','));
	url.searchParams.set('state', state);
	return url.toString();
}

/** activity:read_all includes private activities; profile:read_all is needed for HR zones. */
export const REQUIRED_SCOPES = ['read', 'activity:read_all', 'profile:read_all'];
