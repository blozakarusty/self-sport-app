<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { onMount, tick } from 'svelte';

	interface Message {
		id: number;
		role: 'user' | 'assistant';
		content: string;
		proposal: { summary: string; changes: string[]; warnings: string[] } | null;
		status: string | null;
	}

	let enabled = $state(true);
	let messages = $state<Message[]>([]);
	let text = $state('');
	let busy = $state(false);
	let error = $state('');
	let log = $state<HTMLDivElement>();

	const STATUS: Record<string, string> = {
		applied: 'Applied',
		declined: 'Declined',
		undone: 'Undone',
		expired: 'Replaced by a newer proposal'
	};
	const EXAMPLES = [
		'Why is there no tempo run this week?',
		"I'm away next weekend, what should I do?"
	];

	async function scrollDown() {
		await tick();
		if (log) log.scrollTop = log.scrollHeight;
	}

	onMount(async () => {
		const r = await fetch('/api/chat');
		if (!r.ok) return;
		const d = await r.json();
		enabled = d.enabled;
		messages = d.messages;
		scrollDown();
	});

	async function post(body: object) {
		busy = true;
		error = '';
		try {
			const r = await fetch('/api/chat', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body)
			});
			const d = await r.json().catch(() => ({}));
			if (!r.ok) {
				error = d.error ?? 'Something went wrong. Try again.';
				return false;
			}
			messages = d.messages;
			await invalidateAll();
			scrollDown();
			return true;
		} catch {
			error = 'Could not reach the app. Is it running?';
			return false;
		} finally {
			busy = false;
		}
	}

	async function send(e?: SubmitEvent) {
		e?.preventDefault();
		const value = text.trim();
		if (!value || busy) return;
		// show the question straight away; the answer can take a little while
		messages = [
			...messages,
			{ id: -Date.now(), role: 'user', content: value, proposal: null, status: null }
		];
		text = '';
		scrollDown();
		if (!(await post({ action: 'send', text: value }))) {
			messages = messages.slice(0, -1);
			text = value;
		}
	}

	function onKey(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			send();
		}
	}
</script>

<section class="card coach">
	<h2>Ask your coach</h2>
	{#if !enabled}
		<p class="small muted">The coach is off. Add ANTHROPIC_API_KEY to .env to turn it on.</p>
	{:else}
		{#if messages.length}
			<div class="log" bind:this={log} aria-live="polite">
				{#each messages as m (m.id)}
					<div class="msg {m.role}">
						<p>{m.content}</p>
						{#if m.proposal}
							<div class="proposal">
								<strong class="small">{m.proposal.summary}</strong>
								<ul class="small">
									{#each m.proposal.changes as c, i (i)}<li>{c}</li>{/each}
								</ul>
								{#each m.proposal.warnings as w, i (i)}<p class="small warn">⚠ {w}</p>{/each}
								{#if m.status === 'pending'}
									<div class="row">
										<button
											class="small"
											disabled={busy}
											onclick={() => post({ action: 'apply', id: m.id })}>Apply</button
										>
										<button
											class="small"
											disabled={busy}
											onclick={() => post({ action: 'decline', id: m.id })}>Decline</button
										>
									</div>
								{:else if m.status === 'applied'}
									<div class="row">
										<span class="small muted">Applied</span>
										<button
											class="small"
											disabled={busy}
											onclick={() => post({ action: 'undo', id: m.id })}>Undo</button
										>
									</div>
								{:else if m.status}
									<span class="small muted">{STATUS[m.status]}</span>
								{/if}
							</div>
						{/if}
					</div>
				{/each}
				{#if busy}<p class="small muted">Thinking…</p>{/if}
			</div>
		{:else}
			<p class="small muted">
				Ask about your plan or ask for a change. Changes only happen when you click Apply.
			</p>
			<div class="row">
				{#each EXAMPLES as ex (ex)}
					<button class="small" type="button" onclick={() => (text = ex)}>{ex}</button>
				{/each}
			</div>
		{/if}
		<form onsubmit={send}>
			<textarea
				bind:value={text}
				onkeydown={onKey}
				rows="2"
				maxlength="2000"
				placeholder="Message your coach"
				aria-label="Message your coach"></textarea>
			<button class="small" disabled={busy || !text.trim()}>{busy ? 'Thinking…' : 'Send'}</button>
		</form>
		{#if error}<p class="small err">{error}</p>{/if}
	{/if}
</section>

<style>
	.coach {
		margin-bottom: 1rem;
	}
	.log {
		display: grid;
		gap: 0.5rem;
		max-height: 360px;
		overflow-y: auto;
		margin-bottom: 0.5rem;
	}
	.msg p {
		margin: 0;
		white-space: pre-line;
		font-size: 0.9rem;
	}
	.msg.user {
		justify-self: end;
		max-width: 85%;
		background: var(--series-1-wash);
		border-radius: 10px;
		padding: 0.35rem 0.6rem;
	}
	.proposal {
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 0.5rem 0.6rem;
		margin-top: 0.35rem;
	}
	.proposal ul {
		margin: 0.25rem 0;
		padding-left: 1.1rem;
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		align-items: center;
		margin-top: 0.3rem;
	}
	form {
		display: flex;
		gap: 0.4rem;
		align-items: flex-end;
		margin-top: 0.5rem;
	}
	textarea {
		flex: 1;
		font: inherit;
		color: inherit;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 0.4rem 0.6rem;
		resize: vertical;
	}
	.err {
		color: var(--critical);
	}
	.warn {
		color: var(--ink-2);
	}
</style>
