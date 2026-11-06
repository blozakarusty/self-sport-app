<script lang="ts">
	import { shortDay } from '#lib/format.ts';

	interface Phase {
		name: string;
		label: string;
		start: string;
		end: string;
		weeks: number;
		recoveryWeeks: string[];
		testWeek: string | null;
	}

	let { phases, today, raceDay }: { phases: Phase[]; today: string; raceDay: string } = $props();

	const COLORS: Record<string, string> = {
		base: 'var(--series-1)',
		build: 'var(--series-2)',
		peak: 'var(--series-3)',
		taper: 'var(--series-4)'
	};

	let first = $derived(phases[0]?.start ?? today);
	let span = $derived(Date.parse(raceDay) + 864e5 - Date.parse(first));
	const pos = (day: string) =>
		Math.min(Math.max(((Date.parse(day) - Date.parse(first)) / span) * 100, 0), 100);
</script>

<div
	class="timeline"
	role="img"
	aria-label="Training phases: {phases
		.map((p) => `${p.label} ${p.weeks} weeks from ${shortDay(p.start)}`)
		.join(', ')}. Today is {shortDay(today)}."
>
	<div class="bar">
		{#each phases as p (p.name)}
			<div class="seg" style:flex-grow={p.weeks} style:background={COLORS[p.name]}></div>
		{/each}
		<div class="today" style:left="{pos(today)}%"><span>Today</span></div>
		{#each phases as p (p.name)}
			{#each p.recoveryWeeks as w (w)}
				<div
					class="recovery"
					style:left="{pos(w)}%"
					style:width="{(7 * 864e5 * 100) / span}%"
					title="Recovery week of {shortDay(w)}"
				></div>
			{/each}
			{#if p.testWeek}
				<div
					class="test"
					style:left="{pos(p.testWeek) + (3.5 * 864e5 * 100) / span}%"
					title="Benchmark test, week of {shortDay(p.testWeek)}"
				></div>
			{/if}
		{/each}
	</div>
	<div class="labels">
		{#each phases as p (p.name)}
			<div style:flex-grow={p.weeks}>
				<strong>{p.label}</strong>
				<span class="muted">{p.weeks} wk · {shortDay(p.start)}</span>
			</div>
		{/each}
	</div>
	<div class="key small muted">
		<span><i class="k-test"></i>Benchmark test week</span>
		<span><i class="k-rec"></i>Lighter recovery week</span>
	</div>
</div>

<style>
	.timeline {
		margin: 0.5rem 0 0.25rem;
	}
	.bar {
		position: relative;
		display: flex;
		gap: 2px;
		height: 20px;
		margin-top: 1.25rem;
	}
	.seg:first-child {
		border-radius: 4px 0 0 4px;
	}
	.seg:last-of-type {
		border-radius: 0 4px 4px 0;
	}
	.seg {
		flex-basis: 0;
	}
	.recovery {
		position: absolute;
		top: 0;
		bottom: 0;
		background: repeating-linear-gradient(
			45deg,
			rgba(255, 255, 255, 0.45) 0 2px,
			transparent 2px 6px
		);
		pointer-events: auto;
	}
	.test {
		position: absolute;
		top: 50%;
		width: 8px;
		height: 8px;
		margin: -4px 0 0 -4px;
		border-radius: 50%;
		background: var(--ink);
		border: 2px solid var(--surface);
		box-sizing: content-box;
	}
	.today {
		position: absolute;
		top: -6px;
		bottom: -6px;
		width: 2px;
		margin-left: -1px;
		background: var(--ink);
	}
	.today span {
		position: absolute;
		bottom: 100%;
		left: 50%;
		transform: translateX(-50%);
		font-size: 11px;
		color: var(--ink);
		white-space: nowrap;
	}
	.labels {
		display: flex;
		gap: 2px;
		margin-top: 0.35rem;
		font-size: 0.8rem;
	}
	.labels div {
		flex-basis: 0;
		min-width: 0;
		display: grid;
	}
	.labels span {
		font-size: 0.75rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.key {
		display: flex;
		gap: 1rem;
		margin-top: 0.5rem;
	}
	.key i {
		display: inline-block;
		vertical-align: -1px;
		margin-right: 5px;
	}
	.k-test {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--ink);
	}
	.k-rec {
		width: 14px;
		height: 10px;
		border-radius: 2px;
		background:
			repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.45) 0 2px, transparent 2px 6px),
			var(--series-1);
	}
</style>
