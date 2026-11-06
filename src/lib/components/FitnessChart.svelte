<script lang="ts">
	import { niceTicks } from './chart';
	import { shortDay, dayLabel } from '#lib/format.ts';

	interface Point {
		day: string;
		ctl: number;
		atl: number;
		load: number;
	}

	let { points }: { points: Point[] } = $props();

	let width = $state(640);
	const height = 220;
	const m = { top: 12, right: 72, bottom: 24, left: 36 };

	const series = [
		{ key: 'ctl', label: 'Fitness', window: '42-day', color: 'var(--series-1)' },
		{ key: 'atl', label: 'Fatigue', window: '7-day', color: 'var(--series-2)' }
	] as const;

	let ticks = $derived(niceTicks(Math.max(1, ...points.flatMap((p) => [p.ctl, p.atl]))));
	let yMax = $derived(ticks.at(-1)!);
	let innerW = $derived(Math.max(10, width - m.left - m.right));
	const innerH = height - m.top - m.bottom;

	const x = (i: number) => m.left + (points.length > 1 ? (i / (points.length - 1)) * innerW : 0);
	const y = (v: number) => m.top + innerH - (v / yMax) * innerH;

	let paths = $derived(
		series.map((s) =>
			points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p[s.key]).toFixed(1)}`).join('')
		)
	);

	/** Month starts for the x-axis */
	let xLabels = $derived(
		points.map((p, i) => ({ i, day: p.day })).filter(({ day }, i) => day.endsWith('-01') && i > 3)
	);

	let hover = $state<number | null>(null);

	function onMove(e: PointerEvent) {
		const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
		const px = e.clientX - rect.left - m.left;
		hover = Math.round(Math.min(Math.max(px / innerW, 0), 1) * (points.length - 1));
	}

	function onKey(e: KeyboardEvent) {
		if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
		e.preventDefault();
		const cur = hover ?? points.length - 1;
		hover = Math.min(Math.max(cur + (e.key === 'ArrowLeft' ? -1 : 1), 0), points.length - 1);
	}

	let last = $derived(points.at(-1));
	// Keep end labels from overlapping when the lines converge.
	let endLabels = $derived.by(() => {
		if (!last) return [];
		const ys = series.map((s) => ({ ...s, value: last![s.key], y: y(last![s.key]) }));
		ys.sort((a, b) => a.y - b.y);
		if (ys.length === 2 && ys[1].y - ys[0].y < 14) {
			const mid = (ys[0].y + ys[1].y) / 2;
			ys[0].y = mid - 7;
			ys[1].y = mid + 7;
		}
		return ys;
	});
</script>

<div class="chart" bind:clientWidth={width}>
	<div class="legend small secondary" aria-hidden="true">
		{#each series as s (s.key)}
			<span><i style:background={s.color}></i>{s.label} ({s.window})</span>
		{/each}
	</div>

	<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
	<svg
		{width}
		{height}
		role="img"
		aria-label="Fitness and fatigue over the last {points.length} days. Use arrow keys to inspect days."
		tabindex="0"
		onpointermove={onMove}
		onpointerleave={() => (hover = null)}
		onkeydown={onKey}
		onblur={() => (hover = null)}
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
		{#each xLabels as l (l.day)}
			<text x={x(l.i)} y={height - 6} text-anchor="middle" class="tick">{shortDay(l.day)}</text>
		{/each}

		<path d="{paths[0]}L{x(points.length - 1)},{y(0)}L{x(0)},{y(0)}Z" fill="var(--series-1-wash)" />
		{#each series as s, i (s.key)}
			<path
				d={paths[i]}
				fill="none"
				stroke={s.color}
				stroke-width="2"
				stroke-linejoin="round"
				stroke-linecap="round"
			/>
		{/each}

		{#if last}
			{#each series as s (s.key)}
				<circle
					cx={x(points.length - 1)}
					cy={y(last[s.key])}
					r="4"
					fill={s.color}
					stroke="var(--surface)"
					stroke-width="2"
				/>
			{/each}
			{#each endLabels as l (l.key)}
				<text x={x(points.length - 1) + 10} y={l.y} dy="0.32em" class="end">
					<tspan class="end-value">{Math.round(l.value)}</tspan>
					<tspan class="end-label" dx="4">{l.label}</tspan>
				</text>
			{/each}
		{/if}

		{#if hover != null}
			<line x1={x(hover)} x2={x(hover)} y1={m.top} y2={m.top + innerH} class="crosshair" />
			{#each series as s (s.key)}
				<circle
					cx={x(hover)}
					cy={y(points[hover][s.key])}
					r="4"
					fill={s.color}
					stroke="var(--surface)"
					stroke-width="2"
				/>
			{/each}
		{/if}
	</svg>

	{#if hover != null}
		{@const p = points[hover]}
		<div class="tooltip" style:left="{Math.min(x(hover) + 12, width - 160)}px">
			<div class="small muted">{dayLabel(p.day)}</div>
			{#each series as s (s.key)}
				<div>
					<i style:background={s.color}></i><strong>{Math.round(p[s.key])}</strong>
					<span class="secondary">{s.label}</span>
				</div>
			{/each}
			<div>
				<i class="blank"></i><strong>{Math.round(p.load)}</strong>
				<span class="secondary">Load that day</span>
			</div>
		</div>
	{/if}

	<details>
		<summary>Show as table</summary>
		<div class="table-wrap">
			<table>
				<thead
					><tr
						><th>Day</th><th class="num">Load</th><th class="num">Fitness</th><th class="num"
							>Fatigue</th
						></tr
					></thead
				>
				<tbody>
					{#each points.toReversed() as p (p.day)}
						<tr
							><td>{dayLabel(p.day)}</td><td class="num">{Math.round(p.load)}</td><td class="num"
								>{Math.round(p.ctl)}</td
							><td class="num">{Math.round(p.atl)}</td></tr
						>
					{/each}
				</tbody>
			</table>
		</div>
	</details>
</div>

<style>
	.chart {
		position: relative;
	}
	svg {
		display: block;
		touch-action: pan-y;
		outline: none;
	}
	svg:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
		border-radius: 4px;
	}
	.legend {
		display: flex;
		gap: 1rem;
		margin-bottom: 0.25rem;
	}
	.legend i,
	.tooltip i {
		display: inline-block;
		width: 12px;
		height: 2px;
		vertical-align: middle;
		margin-right: 6px;
		border-radius: 1px;
	}
	.tooltip i.blank {
		background: none;
	}
	.grid {
		stroke: var(--grid);
		stroke-width: 1;
	}
	.base {
		stroke: var(--axis);
		stroke-width: 1;
	}
	.crosshair {
		stroke: var(--axis);
		stroke-width: 1;
	}
	.tick {
		fill: var(--muted);
		font-size: 11px;
		font-variant-numeric: tabular-nums;
	}
	.end-value {
		fill: var(--ink);
		font-weight: 600;
		font-size: 12px;
	}
	.end-label {
		fill: var(--ink-2);
		font-size: 11px;
	}
	.tooltip {
		position: absolute;
		top: 2rem;
		pointer-events: none;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 0.4rem 0.6rem;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
		font-size: 0.85rem;
		min-width: 140px;
	}
	.table-wrap {
		max-height: 240px;
		overflow: auto;
	}
</style>
