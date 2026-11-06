import { error, redirect } from '@sveltejs/kit';
import { STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET } from '$app/env/private';
import { createSession, isAllowedAthlete } from '#lib/server/auth.ts';
import { exchangeToken, REQUIRED_SCOPES } from '#lib/server/sources/strava/api.ts';
import { saveTokens, upsertAthleteFromStrava } from '#lib/server/sources/strava/index.ts';
import { syncAthlete } from '#lib/server/jobs/sync.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, cookies }) => {
	const state = url.searchParams.get('state');
	const expected = cookies.get('strava_oauth_state');
	cookies.delete('strava_oauth_state', { path: '/auth/strava' });
	if (!state || state !== expected) error(400, 'Invalid OAuth state, please try connecting again.');

	if (url.searchParams.get('error')) redirect(303, '/?auth=denied');

	const code = url.searchParams.get('code');
	if (!code) error(400, 'Missing authorization code');

	const granted = (url.searchParams.get('scope') ?? '').split(',');
	const missing = REQUIRED_SCOPES.filter((s) => !granted.includes(s));
	if (missing.length) redirect(303, `/?auth=scopes&missing=${missing.join(',')}`);

	const tokens = await exchangeToken({
		client_id: STRAVA_CLIENT_ID,
		client_secret: STRAVA_CLIENT_SECRET,
		grant_type: 'authorization_code',
		code
	});
	if (!tokens.athlete) error(502, 'Strava did not return an athlete');
	if (!isAllowedAthlete(tokens.athlete.id)) error(403, 'This Strava account is not allowed here.');

	upsertAthleteFromStrava(tokens.athlete);
	saveTokens(tokens.athlete.id, tokens, granted.join(','));
	createSession(cookies, tokens.athlete.id, url.protocol === 'https:');

	// Kick off the first backfill without blocking the redirect.
	syncAthlete(tokens.athlete.id).catch((e) => console.error('[sync]', e));

	redirect(303, '/');
};
