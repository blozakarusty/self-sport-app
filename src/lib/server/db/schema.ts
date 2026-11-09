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
	/** Manual training pace overrides in seconds per km, keyed by pace name. */
	paceOverrides: text('pace_overrides', { mode: 'json' }).$type<PaceOverrides>(),
	/** Heart rate used for the "pace at easy HR" trend; null = derived from zones. */
	refHr: integer('ref_hr'),
	/** Planner preferences: long-run day, optional extra run */
	planPrefs: text('plan_prefs', { mode: 'json' }).$type<PlanPrefs>(),
	...timestamps
});

export interface PlanPrefs {
	longRunDay: 'sat' | 'sun';
	/** Show an optional easy run on the free weekend day in build and peak */
	optionalExtraRun: boolean;
}

export const STRENGTH_SPLITS = ['push', 'pull', 'legs', 'full'] as const;
export type StrengthSplit = (typeof STRENGTH_SPLITS)[number];

export type PaceName = 'easy' | 'marathon' | 'threshold' | 'interval' | 'repetition';
export type PaceOverrides = Partial<Record<PaceName, number>>;

export interface Split {
	distance: number; // m
	movingTime: number; // s
	elapsedTime: number; // s
	elevationDifference: number | null; // m
	avgHr: number | null;
}

export interface Lap extends Split {
	name: string;
}

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
		/** Set once the detailed activity (splits, laps, best efforts) has been fetched. */
		detailFetchedAt: integer('detail_fetched_at', { mode: 'timestamp' }),
		splits: text('splits', { mode: 'json' }).$type<Split[]>(),
		laps: text('laps', { mode: 'json' }).$type<Lap[]>(),
		/** Your tags on strength sessions; kept across Strava re-syncs. */
		strengthSplit: text('strength_split', { enum: STRENGTH_SPLITS }),
		/** Session effort, 1–10; turns strength sessions into session-RPE load. */
		rpe: integer('rpe'),
		...timestamps
	},
	(t) => [
		uniqueIndex('activity_source_idx').on(t.source, t.sourceId),
		index('activity_athlete_start_idx').on(t.athleteId, t.startDate)
	]
);

/** Fastest segments within a run (Strava "best efforts": 1k, 5k, half marathon, ...). */
export const bestEffort = sqliteTable(
	'best_effort',
	{
		id: text('id').primaryKey(), // `${source}:${effortId}`
		activityId: text('activity_id')
			.notNull()
			.references(() => activity.id, { onDelete: 'cascade' }),
		athleteId: integer('athlete_id')
			.notNull()
			.references(() => athlete.id, { onDelete: 'cascade' }),
		name: text('name').notNull(), // '5k', 'Half-Marathon', ...
		distance: real('distance').notNull(), // m
		elapsedTime: integer('elapsed_time').notNull(), // s
		startDateLocal: text('start_date_local').notNull()
	},
	(t) => [index('best_effort_athlete_name_idx').on(t.athleteId, t.name)]
);

/** Race or time-trial results entered by hand; they take part in the fitness estimate. */
export const performance = sqliteTable('performance', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	athleteId: integer('athlete_id')
		.notNull()
		.references(() => athlete.id, { onDelete: 'cascade' }),
	date: text('date').notNull(), // YYYY-MM-DD
	name: text('name').notNull(),
	distance: real('distance').notNull(), // m
	time: integer('time').notNull(), // s
	...timestamps
});

/** A race you're training for. One active goal drives the phases and readiness view. */
export const goal = sqliteTable('goal', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	athleteId: integer('athlete_id')
		.notNull()
		.references(() => athlete.id, { onDelete: 'cascade' }),
	name: text('name').notNull(),
	distance: real('distance').notNull(), // m
	elevationGain: real('elevation_gain').notNull().default(0), // m
	date: text('date').notNull(), // race day, YYYY-MM-DD
	targetTime: integer('target_time').notNull(), // s
	/** When training toward this goal began, and the VDOT at that moment */
	startDate: text('start_date').notNull(),
	startVdot: real('start_vdot'),
	active: integer('active', { mode: 'boolean' }).notNull().default(true),
	...timestamps
});

/** A repeatable test (max pull-ups, plank hold, body weight) with an optional target. */
export const benchmark = sqliteTable('benchmark', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	athleteId: integer('athlete_id')
		.notNull()
		.references(() => athlete.id, { onDelete: 'cascade' }),
	/** Library key for suggested benchmarks; null for your own */
	key: text('key'),
	name: text('name').notNull(),
	category: text('category', { enum: ['push', 'pull', 'legs', 'core', 'body'] }).notNull(),
	unit: text('unit').notNull(), // 'reps', 's', 'kg', ...
	better: text('better', { enum: ['higher', 'lower'] }).notNull(),
	target: real('target'),
	...timestamps
});

export const benchmarkResult = sqliteTable(
	'benchmark_result',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		benchmarkId: integer('benchmark_id')
			.notNull()
			.references(() => benchmark.id, { onDelete: 'cascade' }),
		date: text('date').notNull(),
		value: real('value').notNull(),
		...timestamps
	},
	(t) => [index('benchmark_result_idx').on(t.benchmarkId, t.date)]
);

/**
 * One planned item on one day: a run, a strength session, grease-the-groove
 * practice or a leisure block. `details` holds the structure (see engine/plan).
 */
export const planSession = sqliteTable(
	'plan_session',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		athleteId: integer('athlete_id')
			.notNull()
			.references(() => athlete.id, { onDelete: 'cascade' }),
		goalId: integer('goal_id')
			.notNull()
			.references(() => goal.id, { onDelete: 'cascade' }),
		date: text('date').notNull(),
		/** run | strength | gtg | leisure */
		kind: text('kind').notNull(),
		/** easy, long, quality, upper, legs, ... */
		type: text('type').notNull(),
		title: text('title').notNull(),
		optional: integer('optional', { mode: 'boolean' }).notNull().default(false),
		/** key sessions (quality, long) matter most for compliance */
		key: integer('key', { mode: 'boolean' }).notNull().default(false),
		details: text('details', { mode: 'json' }).notNull(),
		phase: text('phase').notNull(),
		week: integer('week').notNull(),
		/** set when you moved it to another day; regeneration keeps it */
		moved: integer('moved', { mode: 'boolean' }).notNull().default(false),
		skipped: integer('skipped', { mode: 'boolean' }).notNull().default(false),
		...timestamps
	},
	(t) => [index('plan_session_athlete_date_idx').on(t.athleteId, t.date)]
);

/** One weekly review: what was decided, why, and how to undo it. */
export const planRevision = sqliteTable(
	'plan_revision',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		athleteId: integer('athlete_id')
			.notNull()
			.references(() => athlete.id, { onDelete: 'cascade' }),
		goalId: integer('goal_id')
			.notNull()
			.references(() => goal.id, { onDelete: 'cascade' }),
		/** Monday of the week that was reviewed */
		reviewedWeek: text('reviewed_week').notNull(),
		decision: text('decision').notNull(),
		factor: real('factor').notNull(),
		reasons: text('reasons', { mode: 'json' }).notNull().$type<string[]>(),
		metrics: text('metrics', { mode: 'json' })
			.notNull()
			.$type<{ plannedKm: number; actualKm: number; keyDone: number; keyTotal: number }>(),
		changes: text('changes', { mode: 'json' }).notNull().$type<string[]>(),
		/** Sessions as they were; null once undone or after a plan rebuild */
		before: text('before', { mode: 'json' }).$type<
			{ id: number; title: string; details: unknown }[]
		>(),
		explanation: text('explanation').notNull(),
		tips: text('tips', { mode: 'json' }).notNull().$type<string[]>(),
		/** 'claude' | 'rules' */
		source: text('source').notNull(),
		undone: integer('undone', { mode: 'boolean' }).notNull().default(false),
		...timestamps
	},
	(t) => [uniqueIndex('plan_revision_week_idx').on(t.athleteId, t.reviewedWeek)]
);

/** The coach's short note on one activity. Empty text means no note could be written. */
export const activityFeedback = sqliteTable('activity_feedback', {
	activityId: text('activity_id')
		.primaryKey()
		.references(() => activity.id, { onDelete: 'cascade' }),
	athleteId: integer('athlete_id')
		.notNull()
		.references(() => athlete.id, { onDelete: 'cascade' }),
	text: text('text').notNull(),
	...timestamps
});

/** Coach chat. A message can carry a plan change you apply or decline. */
export const chatMessage = sqliteTable(
	'chat_message',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		athleteId: integer('athlete_id')
			.notNull()
			.references(() => athlete.id, { onDelete: 'cascade' }),
		role: text('role', { enum: ['user', 'assistant'] }).notNull(),
		content: text('content').notNull(),
		proposal: text('proposal', { mode: 'json' }).$type<ChatProposal>(),
		/** pending | applied | declined | undone | expired */
		proposalStatus: text('proposal_status'),
		before: text('before', { mode: 'json' }).$type<Record<string, unknown>[]>(),
		...timestamps
	},
	(t) => [index('chat_message_athlete_idx').on(t.athleteId, t.id)]
);

export interface ChatProposal {
	summary: string;
	ops: unknown[];
	changes: string[];
	warnings: string[];
}

/** Your current working weight per strength exercise (kg). */
export const workingWeight = sqliteTable(
	'working_weight',
	{
		athleteId: integer('athlete_id')
			.notNull()
			.references(() => athlete.id, { onDelete: 'cascade' }),
		exercise: text('exercise').notNull(),
		kg: real('kg').notNull(),
		...timestamps
	},
	(t) => [uniqueIndex('working_weight_idx').on(t.athleteId, t.exercise)]
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
export type BestEffort = typeof bestEffort.$inferSelect;
export type Performance = typeof performance.$inferSelect;
export type Goal = typeof goal.$inferSelect;
export type Benchmark = typeof benchmark.$inferSelect;
export type BenchmarkResult = typeof benchmarkResult.$inferSelect;
export type PlanSession = typeof planSession.$inferSelect;
