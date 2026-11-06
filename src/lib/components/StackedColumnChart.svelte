<script lang="ts">
	import { niceTicks, type Series, type StackItem } from './chart';

	let {
		series,
		items,
		label,
		format = (v: number) => v.toFixed(1),
		unit = '',
		minMax = 1
	}: {
		/** bottom to top */
		series: Series[];
		items: StackItem[];
		label: string;
		format?: (v: number) => string;
		unit?: string;
		/** smallest y-axis maximum, e.g. 4 for session counts so ticks stay whole */
		minMax?: number;
	} = $props();

	let width = $state(640);
	const height = 200;
	const m = { top: 18, right: 8, bottom: 24, left: 36 };
	const innerH = height - m.top - m.bottom;
	const GAP = 2;

	const total = (it: StackItem) => series.reduce((s, se) => s + (it.values[se.key] ?? 0), 0);

	let ticks = $derived(niceTicks(Math.max(minMax, ...items.map(total))));
	let yMax = $derived(ticks.at(-1)!);
	let innerW = $derived(Math.max(10, width - m.left - m.right));
	let band = $derived(innerW / Math.max(1, items.length));
	let barW = $derived(Math.max(2, Math.min(24, band - 2)));
	let labelEvery = $derived(
		Math.max(1, Math.ceil(items.length / Math.max(1, Math.floor(innerW / 56))))
	);
	const y = (v: number) => m.top + innerH - (v / yMax) * innerH;

	/** Segments with a 2px surface gap between them; the top one gets a 4px rounded end. */
	function segments(it: StackItem) {
		let acc = 0;
		const segs = series
			.map((s) => {
				const v = it.values[s.key] ?? 0;
				const seg = { s, v, y0: y(acc), y1: y(acc + v) };
				acc += v;
				return seg;
			})
			.filter((seg) => seg.v > 0);
		return segs.map((seg, i) => ({
			...seg,
			top: i === segs.length - 1,
			h: Math.max(0, seg.y0 - seg.y1 - (i === 0 ? 0 : GAP))
		}));
	}

	function segPath(x: number, yTop: number, w: number, h: number, rounded: boolean) {
		if (h <= 0) return '';
		const r = rounded ? Math.min(4, w / 2, h) : 0;
		return `M${x},${yTop + h}V${yTop + r}Q${x},${yTop} ${x + r},${yTop}H${x + w - r}Q${x + w},${yTop} ${x + w},${yTop + r}V${yTop + h}Z`;
	}

	let hover = $state<number | null>(null);
</script>

<div class="chart" bind:clientWidth={width}>
	<div class="legend small secondary" aria-hidden="true">
		{#each series as s (s.key)}
			<span><i style:background={s.color}></i>{s.label}</span>
		{/each}
	</div>

	<svg {width} {height} role="list" aria-label={label}>
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

		{#each items as it, i (it.key)}
			{@const x0 = m.left + band * i + (band - barW) / 2}
			<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
			<g
				role="listitem"
				tabindex="0"
				aria-label="{it.heading}: {series
					.map((s) => `${s.label} ${format(it.values[s.key] ?? 0)}${unit}`)
					.join(', ')}"
				onpointerenter={() => (hover = i)}
				onpointerleave={() => (hover = null)}
				onfocus={() => (hover = i)}
				onblur={() => (hover = null)}
				opacity={hover == null || hover === i ? 1 : 0.55}
			>
				<rect x={m.left + band * i} y={m.top} width={band} height={innerH} fill="transparent" />
				{#each segments(it) as seg (seg.s.key)}
					<path d={segPath(x0, seg.y1, barW, seg.h, seg.top)} fill={seg.s.color} />
				{/each}
				{#if (items.length - 1 - i) % labelEvery === 0}
					<text x={x0 + barW / 2} y={height - 6} text-anchor="middle" class="tick">{it.label}</text>
				{/if}
			</g>
		{/each}
	</svg>

	{#if hover != null}
		{@const it = items[hover]}
		<div class="tooltip" style:left="{Math.min(m.left + band * hover + band, width - 180)}px">
			<div class="small muted">{it.heading}</div>
			{#each series.toReversed() as s (s.key)}
				{#if it.values[s.key]}
					<div>
						<i style:background={s.color}></i><strong>{format(it.values[s.key])}{unit}</strong>
						<span class="secondary">{s.label}</span>
					</div>
				{/if}
			{/each}
			<div class="total">
				<strong>{format(total(it))}{unit}</strong> <span class="secondary">total</span>
			</div>
		</div>
	{/if}

	<details>
		<summary>Show as table</summary>
		<div class="table-wrap">
			<table>
				<thead>
					<tr>
						<th></th>
						{#each series as s (s.key)}<th class="num">{s.label}</th>{/each}
						<th class="num">Total</th>
					</tr>
				</thead>
				<tbody>
					{#each items.toReversed() as it (it.key)}
						<tr>
							<td>{it.heading}</td>
							{#each series as s (s.key)}<td class="num">{format(it.values[s.key] ?? 0)}</td>{/each}
							<td class="num">{format(total(it))}</td>
						</tr>
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
	}
	g {
		outline: none;
	}
	g:focus-visible rect {
		stroke: var(--ink);
	}
	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 1rem;
		margin-bottom: 0.25rem;
	}
	.legend i,
	.tooltip i {
		display: inline-block;
		width: 10px;
		height: 10px;
		border-radius: 2px;
		vertical-align: -1px;
		margin-right: 6px;
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
	.total {
		border-top: 1px solid var(--grid);
		margin-top: 0.2rem;
		padding-top: 0.2rem;
		padding-left: 16px;
	}
	.tooltip {
		position: absolute;
		top: 1.5rem;
		pointer-events: none;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 0.4rem 0.6rem;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
		font-size: 0.85rem;
		min-width: 160px;
	}
	.table-wrap {
		overflow-x: auto;
	}
</style>
