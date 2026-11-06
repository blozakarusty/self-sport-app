import { error, redirect } from '@sveltejs/kit';
import { STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET } from '$app/env/private';
import { randomToken } from '#lib/server/auth.ts';
import { authorizeUrl } from '#lib/server/sources/strava/api.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ url, cookies }) => {
	if (!STRAVA_CLIENT_ID || !STRAVA_CLIENT_SECRET) {
		error(500, 'Strava is not configured: set STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET in .env');
	}
	const state = randomToken();
	cookies.set('strava_oauth_state', state, {
		path: '/auth/strava',
		httpOnly: true,
		sameSite: 'lax',
		secure: url.protocol === 'https:',
		maxAge: 600
	});
	redirect(302, authorizeUrl(STRAVA_CLIENT_ID, `${url.origin}/auth/strava/callback`, state), {
		external: ['https://www.strava.com']
	});
};
