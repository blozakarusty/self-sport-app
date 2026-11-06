<script lang="ts">
	import { shortDay, dayLabel } from '#lib/format.ts';

	interface Point {
		day: string;
		value: number | null;
	}

	let {
		points,
		format,
		label,
		invert = false,
		tableLabel = 'Value'
	}: {
		points: Point[];
		format: (v: number) => string;
		/** accessible name of the chart */
		label: string;
		/** draw lower values higher (for paces, where lower is better) */
		invert?: boolean;
		tableLabel?: string;
	} = $props();

	let width = $state(640);
	const height = 180;
	const m = { top: 14, right: 60, bottom: 24, left: 48 };
	const innerH = height - m.top - m.bottom;
	let innerW = $derived(Math.max(10, width - m.left - m.right));

	let values = $derived(points.map((p) => p.value).filter((v): v is number => v != null));
	let domain = $derived.by(() => {
		if (!values.length) return [0, 1];
		const lo = Math.min(...values);
		const hi = Math.max(...values);
		const pad = Math.max((hi - lo) * 0.15, Math.abs(hi) * 0.01, 0.5);
		return [lo - pad, hi + pad];
	});
	let ticks = $derived.by(() => {
		const [lo, hi] = domain;
		return [0, 1, 2, 3].map((i) => lo + ((hi - lo) * (i + 0.5)) / 4);
	});

	const x = (i: number) =>
		m.left + (points.length > 1 ? (i / (points.length - 1)) * innerW : innerW / 2);
	const y = (v: number) => {
		const t = (v - domain[0]) / (domain[1] - domain[0]);
		return m.top + (invert ? t : 1 - t) * innerH;
	};

	/** Path with gaps where values are missing. */
	let path = $derived(
		points
			.map((p, i) => {
				if (p.value == null) return '';
				const prev = points[i - 1];
				return `${prev?.value == null ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`;
			})
			.join('')
	);
	/** Isolated points (no neighbours) need a dot to be visible. */
	let isolated = $derived(
		points
			.map((p, i) => ({ p, i }))
			.filter(
				({ p, i }) =>
					p.value != null && points[i - 1]?.value == null && points[i + 1]?.value == null
			)
	);
	let lastIdx = $derived(points.findLastIndex((p) => p.value != null));
	let xLabels = $derived(
		points
			.map((p, i) => ({ i, day: p.day }))
			.filter((_, i, arr) => i % Math.ceil(arr.length / 6) === 0 && i > 0)
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
</script>

<div class="chart" bind:clientWidth={width}>
	{#if !values.length}
		<p class="small muted">Not enough data yet.</p>
	{:else}
		<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
		<svg
			{width}
			{height}
			role="img"
			aria-label="{label}. Use arrow keys to inspect points."
			tabindex="0"
			onpointermove={onMove}
			onpointerleave={() => (hover = null)}
			onkeydown={onKey}
			onblur={() => (hover = null)}
		>
			{#each ticks as t (t)}
				<line x1={m.left} x2={m.left + innerW} y1={y(t)} y2={y(t)} class="grid" />
				<text x={m.left - 6} y={y(t)} dy="0.32em" text-anchor="end" class="tick">{format(t)}</text>
			{/each}
			<line x1={m.left} x2={m.left + innerW} y1={m.top + innerH} y2={m.top + innerH} class="base" />
			{#each xLabels as l (l.day)}
				<text x={x(l.i)} y={height - 6} text-anchor="middle" class="tick">{shortDay(l.day)}</text>
			{/each}

			<path
				d={path}
				fill="none"
				stroke="var(--series-1)"
				stroke-width="2"
				stroke-linejoin="round"
				stroke-linecap="round"
			/>
			{#each isolated as { p, i } (i)}
				<circle
					cx={x(i)}
					cy={y(p.value!)}
					r="4"
					fill="var(--series-1)"
					stroke="var(--surface)"
					stroke-width="2"
				/>
			{/each}
			{#if lastIdx >= 0}
				{@const v = points[lastIdx].value!}
				<circle
					cx={x(lastIdx)}
					cy={y(v)}
					r="4"
					fill="var(--series-1)"
					stroke="var(--surface)"
					stroke-width="2"
				/>
				<text x={x(lastIdx) + 10} y={y(v)} dy="0.32em" class="end">{format(v)}</text>
			{/if}

			{#if hover != null}
				<line x1={x(hover)} x2={x(hover)} y1={m.top} y2={m.top + innerH} class="crosshair" />
				{#if points[hover].value != null}
					<circle
						cx={x(hover)}
						cy={y(points[hover].value!)}
						r="4"
						fill="var(--series-1)"
						stroke="var(--surface)"
						stroke-width="2"
					/>
				{/if}
			{/if}
		</svg>

		{#if hover != null}
			{@const p = points[hover]}
			<div class="tooltip" style:left="{Math.min(x(hover) + 12, width - 150)}px">
				<div class="small muted">{dayLabel(p.day)}</div>
				<strong>{p.value == null ? 'No data' : format(p.value)}</strong>
			</div>
		{/if}

		<details>
			<summary>Show as table</summary>
			<div class="table-wrap">
				<table>
					<thead><tr><th>Date</th><th class="num">{tableLabel}</th></tr></thead>
					<tbody>
						{#each points.toReversed() as p (p.day)}
							<tr
								><td>{dayLabel(p.day)}</td><td class="num"
									>{p.value == null ? '–' : format(p.value)}</td
								></tr
							>
						{/each}
					</tbody>
				</table>
			</div>
		</details>
	{/if}
</div>

<style>
	.chart {
		position: relative;
	}
	svg {
		display: block;
		outline: none;
		touch-action: pan-y;
	}
	svg:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
		border-radius: 4px;
	}
	.grid {
		stroke: var(--grid);
	}
	.base,
	.crosshair {
		stroke: var(--axis);
	}
	.tick {
		fill: var(--muted);
		font-size: 11px;
		font-variant-numeric: tabular-nums;
	}
	.end {
		fill: var(--ink);
		font-size: 12px;
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
		min-width: 120px;
	}
	.table-wrap {
		max-height: 240px;
		overflow: auto;
	}
</style>
