import { error, json } from '@sveltejs/kit';
import {
	applyProposal,
	chatEnabled,
	chatHistory,
	ChatError,
	declineProposal,
	sendChat,
	undoProposal
} from '#lib/server/chat.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ locals }) => {
	if (!locals.athlete) error(401, 'Sign in first.');
	return json({ enabled: chatEnabled, messages: chatHistory(locals.athlete.id) });
};

export const POST: RequestHandler = async ({ locals, request }) => {
	const a = locals.athlete;
	if (!a) error(401, 'Sign in first.');
	const body = await request.json().catch(() => null);
	try {
		if (body?.action === 'send') {
			const text = String(body.text ?? '').trim();
			if (!text || text.length > 2000)
				return json({ error: 'Write a message of up to 2000 characters.' }, { status: 400 });
			await sendChat(a, text);
		} else if (body?.action === 'apply') applyProposal(a, Number(body.id));
		else if (body?.action === 'decline') declineProposal(a.id, Number(body.id));
		else if (body?.action === 'undo') undoProposal(a.id, Number(body.id));
		else return json({ error: 'Unknown action.' }, { status: 400 });
	} catch (e) {
		if (e instanceof ChatError) return json({ error: e.message }, { status: 400 });
		throw e;
	}
	return json({ enabled: chatEnabled, messages: chatHistory(a.id) });
};
