/** Prompt for the short note after a session. No I/O; names and GPS never go in. */

export const FEEDBACK_SYSTEM = `You are the coach inside a personal running and strength training app. An athlete just finished a session. Write them a short note: 2 or 3 sentences, plain text with no markdown, under 450 characters.

Be specific and honest, using only the numbers you are given: how it compared with what was planned, what stood out, and one practical thing for what comes next. Skip praise that the numbers don't support, and don't scold.

The prescribed paces come from a fitness estimate that may be too conservative, so judge effort mainly by heart rate zone. If laps are given, use them to judge an interval session. Strength sessions have little data, so keep those notes brief, and if no effort rating is given you may suggest adding one. Give training guidance only; never diagnose pain or illness.`;

export interface FeedbackFacts {
	session: {
		date: string;
		sport: string;
		km: number | null;
		minutes: number;
		pace_per_km: string | null;
		avg_hr: number | null;
		hr_zone: number | null;
		elevation_m: number | null;
		load: number;
		strength_type: string | null;
		effort_1_to_10: number | null;
	};
	laps: { km: number; pace_per_km: string; avg_hr: number | null }[];
	planned: { title: string; purpose: string | null; km: number | null; structure: string[] } | null;
	week: {
		planned_km: number;
		run_km: number;
		key_done: number;
		key_total: number;
		phase: string | null;
	};
	goal: { name: string; target: string; weeks_to_go: number } | null;
	next_session: string | null;
}

/** Trim a reply to a sensible note; empty when there is nothing usable. */
export function cleanFeedback(text: string): string {
	const t = text.trim();
	return t.length > 800 ? `${t.slice(0, 797).trimEnd()}…` : t;
}
