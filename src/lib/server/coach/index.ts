import Anthropic from '@anthropic-ai/sdk';
import { ANTHROPIC_API_KEY } from '$app/env/private';
import {
	COACH_SCHEMA,
	COACH_SYSTEM,
	coachPrompt,
	parseCoachReply,
	type CoachContext,
	type CoachReply
} from './parse';

export const coachEnabled = !!ANTHROPIC_API_KEY;

/**
 * Ask Claude to explain the week. Returns null when the coach is off or the
 * call fails, so the plan always works without it.
 */
export async function askCoach(context: CoachContext): Promise<CoachReply | null> {
	if (!ANTHROPIC_API_KEY) return null;
	const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY, timeout: 90_000 });
	try {
		const response = await client.beta.messages.create({
			model: 'claude-opus-5-5',
			max_tokens: 16000,
			betas: ['server-side-fallback-2026-07-01'],
			fallbacks: 'default',
			system: COACH_SYSTEM,
			output_config: {
				effort: 'medium',
				format: { type: 'json_schema', schema: COACH_SCHEMA as unknown as Record<string, unknown> }
			},
			messages: [{ role: 'user', content: coachPrompt(context) }]
		});
		if (response.stop_reason === 'refusal' || response.stop_reason === 'max_tokens') {
			console.warn(`[coach] no usable reply: ${response.stop_reason}`);
			return null;
		}
		const text = response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
		const reply = parseCoachReply(text);
		if (!reply) console.warn('[coach] reply did not match the expected shape');
		return reply;
	} catch (e) {
		if (e instanceof Anthropic.AuthenticationError) console.warn('[coach] invalid API key');
		else if (e instanceof Anthropic.RateLimitError) console.warn('[coach] rate limited');
		else if (e instanceof Anthropic.APIError) console.warn(`[coach] API error ${e.status}`);
		else console.warn('[coach] request failed');
		return null;
	}
}
