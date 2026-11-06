<script lang="ts">
	import { dayLabel, shortDay } from '#lib/format.ts';

	interface Point {
		day: string;
		actual: number | null;
		target: number | null;
	}

	let { points, today, goalVdot }: { points: Point[]; today: string; goalVdot: number } = $props();

	let width = $state(640);
	const height = 200;
	const m = { top: 14, right: 88, bottom: 24, left: 36 };
	const innerH = height - m.top - m.bottom;
	let innerW = $derived(Math.max(10, width - m.left - m.right));

	const series = [
		{ key: 'actual', label: 'Your VDOT', color: 'var(--series-1)' },
		{ key: 'target', label: 'Target path', color: 'var(--series-2)' }
	] as const;

	let values = $derived(
		points.flatMap((p) => [p.actual, p.target]).filter((v): v is number => v != null)
	);
	let domain = $derived.by(() => {
		const lo = Math.floor(Math.min(...values, goalVdot) - 1);
		const hi = Math.ceil(Math.max(...values, goalVdot) + 1);
		return [lo, hi];
	});
	let ticks = $derived.by(() => {
		const [lo, hi] = domain;
		const step = Math.max(1, Math.round((hi - lo) / 4));
		const out = [];
		for (let v = lo; v <= hi; v += step) out.push(v);
		return out;
	});

	const x = (i: number) => m.left + (points.length > 1 ? (i / (points.length - 1)) * innerW : 0);
	const y = (v: number) => m.top + innerH - ((v - domain[0]) / (domain[1] - domain[0])) * innerH;

	function pathFor(key: 'actual' | 'target') {
		return points
			.map((p, i) => {
				const v = p[key];
				if (v == null) return '';
				return `${points[i - 1]?.[key] == null ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
			})
			.join('');
	}

	let todayIdx = $derived(
		Math.max(
			0,
			points.findIndex((p) => p.day >= today)
		)
	);
	let lastActual = $derived(points.findLastIndex((p) => p.actual != null));
	let xLabels = $derived(
		points
			.map((p, i) => ({ i, day: p.day }))
			.filter((_, i, arr) => i % Math.ceil(arr.length / 7) === 0)
	);

	let hover = $state<number | null>(null);
	function onMove(e: PointerEvent) {
		const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
		hover = Math.round(
			Math.min(Math.max((e.clientX - rect.left - m.left) / innerW, 0), 1) * (points.length - 1)
		);
	}
	function onKey(e: KeyboardEvent) {
		if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
		e.preventDefault();
		hover = Math.min(
			Math.max((hover ?? todayIdx) + (e.key === 'ArrowLeft' ? -1 : 1), 0),
			points.length - 1
		);
	}
</script>

<div class="chart" bind:clientWidth={width}>
	<div class="legend small secondary" aria-hidden="true">
		{#each series as s (s.key)}<span><i style:background={s.color}></i>{s.label}</span>{/each}
	</div>
	<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
	<svg
		{width}
		{height}
		role="img"
		aria-label="Your weekly VDOT and the target path to {goalVdot.toFixed(
			1
		)} by race day. Use arrow keys to inspect weeks."
		tabindex="0"
		onpointermove={onMove}
		onpointerleave={() => (hover = null)}
		onkeydown={onKey}
		onblur={() => (hover = null)}
	>
		{#each ticks as t (t)}
			<line x1={m.left} x2={m.left + innerW} y1={y(t)} y2={y(t)} class="grid" />
			<text x={m.left - 6} y={y(t)} dy="0.32em" text-anchor="end" class="tick">{t}</text>
		{/each}
		<line x1={m.left} x2={m.left + innerW} y1={m.top + innerH} y2={m.top + innerH} class="base" />
		{#each xLabels as l (l.day)}
			<text x={x(l.i)} y={height - 6} text-anchor="middle" class="tick">{shortDay(l.day)}</text>
		{/each}

		<line x1={x(todayIdx)} x2={x(todayIdx)} y1={m.top} y2={m.top + innerH} class="marker" />
		<text x={x(todayIdx)} y={m.top - 3} text-anchor="middle" class="marker-label">Today</text>

		{#each series as s (s.key)}
			<path
				d={pathFor(s.key)}
				fill="none"
				stroke={s.color}
				stroke-width="2"
				stroke-linejoin="round"
				stroke-linecap="round"
			/>
		{/each}

		{#if lastActual >= 0}
			<circle
				cx={x(lastActual)}
				cy={y(points[lastActual].actual!)}
				r="4"
				fill="var(--series-1)"
				stroke="var(--surface)"
				stroke-width="2"
			/>
		{/if}
		{#if points.at(-1)?.target != null}
			{@const last = points.length - 1}
			<circle
				cx={x(last)}
				cy={y(points[last].target!)}
				r="4"
				fill="var(--series-2)"
				stroke="var(--surface)"
				stroke-width="2"
			/>
			<text x={x(last) + 10} y={y(points[last].target!)} dy="0.32em" class="end">
				<tspan class="end-value">{points[last].target!.toFixed(1)}</tspan><tspan
					class="end-label"
					dx="4">race day</tspan
				>
			</text>
		{/if}

		{#if hover != null}
			<line x1={x(hover)} x2={x(hover)} y1={m.top} y2={m.top + innerH} class="crosshair" />
		{/if}
	</svg>

	{#if hover != null}
		{@const p = points[hover]}
		<div class="tooltip" style:left="{Math.min(x(hover) + 12, width - 170)}px">
			<div class="small muted">Week to {dayLabel(p.day)}</div>
			{#each series as s (s.key)}
				{#if p[s.key] != null}
					<div>
						<i style:background={s.color}></i><strong>{p[s.key]!.toFixed(1)}</strong>
						<span class="secondary">{s.label}</span>
					</div>
				{/if}
			{/each}
		</div>
	{/if}

	<details>
		<summary>Show as table</summary>
		<div class="table-wrap">
			<table>
				<thead
					><tr><th>Week to</th><th class="num">Your VDOT</th><th class="num">Target path</th></tr
					></thead
				>
				<tbody>
					{#each points as p (p.day)}
						<tr
							><td>{dayLabel(p.day)}</td><td class="num">{p.actual?.toFixed(1) ?? '–'}</td><td
								class="num">{p.target?.toFixed(1) ?? '–'}</td
							></tr
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
		outline: none;
		touch-action: pan-y;
	}
	svg:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
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
	}
	.grid {
		stroke: var(--grid);
	}
	.base,
	.crosshair {
		stroke: var(--axis);
	}
	.marker {
		stroke: var(--ink-2);
		stroke-width: 1;
	}
	.marker-label {
		fill: var(--ink-2);
		font-size: 11px;
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
		top: 1.5rem;
		pointer-events: none;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 0.4rem 0.6rem;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
		font-size: 0.85rem;
		min-width: 150px;
	}
	.table-wrap {
		max-height: 240px;
		overflow: auto;
	}
</style>
