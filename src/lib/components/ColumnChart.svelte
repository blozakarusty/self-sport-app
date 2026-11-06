<script lang="ts">
	import { columnPath, niceTicks, type ColumnItem } from './chart';

	let {
		items,
		label,
		format = (v: number) => String(Math.round(v)),
		tableHeaders
	}: {
		items: ColumnItem[];
		/** accessible name */
		label: string;
		format?: (v: number) => string;
		tableHeaders: [string, string];
	} = $props();

	let width = $state(640);
	const height = 180;
	const m = { top: 18, right: 8, bottom: 24, left: 36 };
	const innerH = height - m.top - m.bottom;

	let ticks = $derived(niceTicks(Math.max(1, ...items.map((i) => i.value))));
	let yMax = $derived(ticks.at(-1)!);
	let innerW = $derived(Math.max(10, width - m.left - m.right));
	let band = $derived(innerW / Math.max(1, items.length));
	let barW = $derived(Math.max(2, Math.min(24, band - 2)));
	let labelEvery = $derived(
		Math.max(1, Math.ceil(items.length / Math.max(1, Math.floor(innerW / 56))))
	);

	const y = (v: number) => m.top + innerH - (v / yMax) * innerH;

	let maxIdx = $derived(items.reduce((best, w, i) => (w.value > items[best].value ? i : best), 0));
	/** Label only the latest and the biggest column. */
	let labelled = $derived(new Set([items.length - 1, maxIdx]));

	let hover = $state<number | null>(null);
</script>

<div class="chart" bind:clientWidth={width}>
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

		{#each items as item, i (item.key)}
			{@const cx = m.left + band * i + band / 2}
			<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
			<g
				role="listitem"
				tabindex="0"
				aria-label={item.tooltip.join(', ')}
				onpointerenter={() => (hover = i)}
				onpointerleave={() => (hover = null)}
				onfocus={() => (hover = i)}
				onblur={() => (hover = null)}
			>
				<rect x={m.left + band * i} y={m.top} width={band} height={innerH} fill="transparent" />
				<path
					d={columnPath(cx - barW / 2, y(item.value), barW, y(0) - y(item.value))}
					fill="var(--series-1)"
					opacity={hover == null || hover === i ? 1 : 0.55}
				/>
				{#if labelled.has(i) && item.value > 0}
					<text x={cx} y={y(item.value) - 5} text-anchor="middle" class="value"
						>{format(item.value)}</text
					>
				{/if}
				{#if (items.length - 1 - i) % labelEvery === 0}
					<text x={cx} y={height - 6} text-anchor="middle" class="tick">{item.label}</text>
				{/if}
			</g>
		{/each}
	</svg>

	{#if hover != null}
		{@const item = items[hover]}
		<div class="tooltip" style:left="{Math.min(m.left + band * hover + band, width - 170)}px">
			<div class="small muted">{item.tooltip[0]}</div>
			{#each item.tooltip.slice(1) as line, i (i)}
				<div class={i === 0 ? 'strong' : 'secondary'}>{line}</div>
			{/each}
		</div>
	{/if}

	<details>
		<summary>Show as table</summary>
		<table>
			<thead><tr><th>{tableHeaders[0]}</th><th class="num">{tableHeaders[1]}</th></tr></thead>
			<tbody>
				{#each items.toReversed() as item (item.key)}
					<tr><td>{item.tooltip[0]}</td><td class="num">{format(item.value)}</td></tr>
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
	.strong {
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
