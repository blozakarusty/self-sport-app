import { defineEnvVars } from '@sveltejs/kit/env';

const optional = (value: string | undefined) => (value ? value : undefined);

export const variables = defineEnvVars({
	DATABASE_URL: { description: 'Path to the SQLite database file, e.g. data/self-sport.db.' },
	STRAVA_CLIENT_ID: { description: 'Client ID of your Strava API application.' },
	STRAVA_CLIENT_SECRET: { description: 'Client secret of your Strava API application.' },
	ALLOWED_ATHLETE_IDS: {
		description:
			'Comma-separated Strava athlete IDs allowed to sign in. If empty, the first athlete to connect becomes the only allowed one.',
		schema: (value) =>
			(value ?? '')
				.split(',')
				.map((s) => s.trim())
				.filter(Boolean)
				.map(Number)
	},
	ANTHROPIC_API_KEY: {
		description: 'Optional. Turns on the Claude coach in weekly reviews.',
		schema: optional
	},
	SYNC_INTERVAL_MINUTES: {
		description: 'How often to sync Strava in the background. 0 disables it. Default 60.',
		schema: (value) => {
			const n = Number(optional(value) ?? 60);
			if (!Number.isFinite(n) || n < 0) throw new Error('SYNC_INTERVAL_MINUTES must be >= 0');
			return n;
		}
	}
});
