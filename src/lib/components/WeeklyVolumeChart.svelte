<script lang="ts">
	import { columnPath, niceTicks } from './chart';
	import { shortDay } from '#lib/format.ts';

	interface Week {
		week: string;
		runKm: number;
		runCount: number;
		runElevation: number;
	}

	let { weeks }: { weeks: Week[] } = $props();

	let width = $state(640);
	const height = 180;
	const m = { top: 18, right: 8, bottom: 24, left: 36 };
	const innerH = height - m.top - m.bottom;

	let ticks = $derived(niceTicks(Math.max(1, ...weeks.map((w) => w.runKm))));
	let yMax = $derived(ticks.at(-1)!);
	let innerW = $derived(Math.max(10, width - m.left - m.right));
	let band = $derived(innerW / weeks.length);
	let barW = $derived(Math.min(24, band - 2));

	const y = (v: number) => m.top + innerH - (v / yMax) * innerH;

	let maxIdx = $derived(weeks.reduce((best, w, i) => (w.runKm > weeks[best].runKm ? i : best), 0));
	/** Label only the current week and the biggest week. */
	let labelled = $derived(new Set([weeks.length - 1, maxIdx]));

	let hover = $state<number | null>(null);
</script>

<div class="chart" bind:clientWidth={width}>
	<svg
		{width}
		{height}
		role="list"
		aria-label="Running kilometres per week, last {weeks.length} weeks"
	>
		{#each ticks as t (t)}
			<line
				x1={m.left}
				x2={m.left + innerW}
				y1={y(t)}
				y2={y(t)}
				class={t === 0 ? 'base' : 'grid'}
			/>
			<text x={m.left - 6} y={y(t)} dy="0.32em" text-anchor="end" class="tick">{t}</text>
		{/each}

		{#each weeks as w, i (w.week)}
			{@const cx = m.left + band * i + band / 2}
			{@const h = y(0) - y(w.runKm)}
			<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
			<g
				role="listitem"
				tabindex="0"
				aria-label="Week of {shortDay(w.week)}: {w.runKm.toFixed(1)} km in {w.runCount} runs"
				onpointerenter={() => (hover = i)}
				onpointerleave={() => (hover = null)}
				onfocus={() => (hover = i)}
				onblur={() => (hover = null)}
			>
				<rect x={m.left + band * i} y={m.top} width={band} height={innerH} fill="transparent" />
				<path
					d={columnPath(cx - barW / 2, y(w.runKm), barW, h)}
					fill="var(--series-1)"
					opacity={hover == null || hover === i ? 1 : 0.55}
				/>
				{#if labelled.has(i) && w.runKm > 0}
					<text x={cx} y={y(w.runKm) - 5} text-anchor="middle" class="value"
						>{Math.round(w.runKm)}</text
					>
				{/if}
				{#if i % 2 === (weeks.length - 1) % 2}
					<text x={cx} y={height - 6} text-anchor="middle" class="tick">{shortDay(w.week)}</text>
				{/if}
			</g>
		{/each}
	</svg>

	{#if hover != null}
		{@const w = weeks[hover]}
		<div class="tooltip" style:left="{Math.min(m.left + band * hover + band, width - 170)}px">
			<div class="small muted">Week of {shortDay(w.week)}</div>
			<div>
				<strong>{w.runKm.toFixed(1)} km</strong> <span class="secondary">{w.runCount} runs</span>
			</div>
			<div>
				<strong>{Math.round(w.runElevation)} m</strong> <span class="secondary">elevation</span>
			</div>
		</div>
	{/if}

	<details>
		<summary>Show as table</summary>
		<table>
			<thead
				><tr
					><th>Week of</th><th class="num">Runs</th><th class="num">km</th><th class="num"
						>Elevation (m)</th
					></tr
				></thead
			>
			<tbody>
				{#each weeks.toReversed() as w (w.week)}
					<tr
						><td>{shortDay(w.week)}</td><td class="num">{w.runCount}</td><td class="num"
							>{w.runKm.toFixed(1)}</td
						><td class="num">{Math.round(w.runElevation)}</td></tr
					>
				{/each}
			</tbody>
		</table>
	</details>
</div>

<style>
	.chart {
		position: relative;
	}
	svg {
		display: block;
	}
	g {
		outline: none;
	}
	g:focus-visible path {
		stroke: var(--ink);
		stroke-width: 1;
	}
	.grid {
		stroke: var(--grid);
	}
	.base {
		stroke: var(--axis);
	}
	.tick {
		fill: var(--muted);
		font-size: 11px;
		font-variant-numeric: tabular-nums;
	}
	.value {
		fill: var(--ink);
		font-size: 11px;
		font-weight: 600;
	}
	.tooltip {
		position: absolute;
		top: 0;
		pointer-events: none;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 0.4rem 0.6rem;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
		font-size: 0.85rem;
		min-width: 150px;
	}
</style>
