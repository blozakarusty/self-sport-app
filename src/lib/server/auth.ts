import { createHash, randomBytes } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import type { Cookies } from '@sveltejs/kit';
import { ALLOWED_ATHLETE_IDS } from '$app/env/private';
import { db } from './db';
import { athlete, session } from './db/schema';

export const SESSION_COOKIE = 'ss_session';
const SESSION_DAYS = 30;

const hash = (token: string) => createHash('sha256').update(token).digest('hex');

export function randomToken() {
	return randomBytes(32).toString('base64url');
}

/**
 * Single-user gate: either the athlete is on ALLOWED_ATHLETE_IDS, or (when that
 * is empty) they are the first/only athlete in the database.
 */
export function isAllowedAthlete(athleteId: number): boolean {
	if (ALLOWED_ATHLETE_IDS.length > 0) return ALLOWED_ATHLETE_IDS.includes(athleteId);
	const others = db
		.select({ n: sql<number>`count(*)` })
		.from(athlete)
		.where(sql`${athlete.id} != ${athleteId}`)
		.get();
	return (others?.n ?? 0) === 0;
}

export function createSession(cookies: Cookies, athleteId: number, secure: boolean) {
	const token = randomToken();
	const expiresAt = new Date(Date.now() + SESSION_DAYS * 864e5);
	db.insert(session)
		.values({ id: hash(token), athleteId, expiresAt })
		.run();
	cookies.set(SESSION_COOKIE, token, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure,
		expires: expiresAt
	});
}

export function validateSession(token: string | undefined) {
	if (!token) return null;
	const row = db
		.select({ athlete, expiresAt: session.expiresAt })
		.from(session)
		.innerJoin(athlete, eq(session.athleteId, athlete.id))
		.where(eq(session.id, hash(token)))
		.get();
	if (!row) return null;
	if (row.expiresAt.getTime() < Date.now()) {
		db.delete(session)
			.where(eq(session.id, hash(token)))
			.run();
		return null;
	}
	return row.athlete;
}

export function destroySession(cookies: Cookies) {
	const token = cookies.get(SESSION_COOKIE);
	if (token)
		db.delete(session)
			.where(eq(session.id, hash(token)))
			.run();
	cookies.delete(SESSION_COOKIE, { path: '/' });
}
