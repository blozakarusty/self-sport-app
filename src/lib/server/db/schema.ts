import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

const timestamps = {
	createdAt: integer('created_at', { mode: 'timestamp' })
		.notNull()
		.$defaultFn(() => new Date()),
	updatedAt: integer('updated_at', { mode: 'timestamp' })
		.notNull()
		.$defaultFn(() => new Date())
		.$onUpdateFn(() => new Date())
};

/** The athlete (single user, but keyed so multi-user stays possible). */
export const athlete = sqliteTable('athlete', {
	id: integer('id').primaryKey(), // Strava athlete id
	firstName: text('first_name'),
	lastName: text('last_name'),
	weightKg: real('weight_kg'),
	units: text('units', { enum: ['metric', 'imperial'] })
		.notNull()
		.default('metric'),
	/** User overrides; when null the engine derives them from activity data. */
	maxHr: integer('max_hr'),
	restHr: integer('rest_hr'),
	/** Strava HR zones as [{min,max}] */
	hrZones: text('hr_zones', { mode: 'json' }).$type<{ min: number; max: number }[]>(),
	...timestamps
});

export const stravaToken = sqliteTable('strava_token', {
	athleteId: integer('athlete_id')
		.primaryKey()
		.references(() => athlete.id, { onDelete: 'cascade' }),
	accessToken: text('access_token').notNull(),
	refreshToken: text('refresh_token').notNull(),
	/** unix seconds */
	expiresAt: integer('expires_at').notNull(),
	scope: text('scope').notNull(),
	...timestamps
});

export const session = sqliteTable('session', {
	/** sha256 of the cookie token, so a DB leak doesn't leak live sessions */
	id: text('id').primaryKey(),
	athleteId: integer('athlete_id')
		.notNull()
		.references(() => athlete.id, { onDelete: 'cascade' }),
	expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull()
});

/**
 * Normalized activities from any source. `raw` keeps the original payload so
 * new fields can be backfilled without re-fetching.
 */
export const activity = sqliteTable(
	'activity',
	{
		id: text('id').primaryKey(), // `${source}:${sourceId}`
		source: text('source').notNull(), // 'strava' | 'app' | ...
		sourceId: text('source_id').notNull(),
		athleteId: integer('athlete_id')
			.notNull()
			.references(() => athlete.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		sportType: text('sport_type').notNull(),
		/** UTC ISO string */
		startDate: text('start_date').notNull(),
		/** Local wall-clock ISO string (no offset); its date part is the training day */
		startDateLocal: text('start_date_local').notNull(),
		movingTime: integer('moving_time').notNull(), // s
		elapsedTime: integer('elapsed_time').notNull(), // s
		distance: real('distance').notNull().default(0), // m
		elevationGain: real('elevation_gain').notNull().default(0), // m
		avgHr: real('avg_hr'),
		maxHr: real('max_hr'),
		relativeEffort: integer('relative_effort'),
		workoutType: integer('workout_type'),
		trainer: integer('trainer', { mode: 'boolean' }).notNull().default(false),
		raw: text('raw', { mode: 'json' }),
		...timestamps
	},
	(t) => [
		uniqueIndex('activity_source_idx').on(t.source, t.sourceId),
		index('activity_athlete_start_idx').on(t.athleteId, t.startDate)
	]
);

export const syncState = sqliteTable('sync_state', {
	athleteId: integer('athlete_id')
		.primaryKey()
		.references(() => athlete.id, { onDelete: 'cascade' }),
	/** unix seconds of the newest activity start seen */
	cursor: integer('cursor').notNull().default(0),
	lastSyncAt: integer('last_sync_at', { mode: 'timestamp' }),
	lastError: text('last_error'),
	backfillComplete: integer('backfill_complete', { mode: 'boolean' }).notNull().default(false)
});

export type Athlete = typeof athlete.$inferSelect;
export type Activity = typeof activity.$inferSelect;
export type NewActivity = typeof activity.$inferInsert;
