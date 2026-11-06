import type { Handle, ServerInit } from '@sveltejs/kit/hooks';
import { building } from '$app/env';
import { SYNC_INTERVAL_MINUTES } from '$app/env/private';
import { SESSION_COOKIE, validateSession } from '#lib/server/auth.ts';
import { syncAll } from '#lib/server/jobs/sync.ts';

export const init: ServerInit = () => {
	if (building || SYNC_INTERVAL_MINUTES === 0) return;
	const run = () => syncAll().catch((e) => console.error('[sync]', e));
	setTimeout(run, 10_000);
	setInterval(run, SYNC_INTERVAL_MINUTES * 60_000).unref();
};

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.athlete = validateSession(event.cookies.get(SESSION_COOKIE));
	return resolve(event);
};
