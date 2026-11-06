<script lang="ts">
	import ColumnChart from '#lib/components/ColumnChart.svelte';
	import StackedColumnChart from '#lib/components/StackedColumnChart.svelte';
	import { monthLabel, monthYearLabel, paceStr, shortDay } from '#lib/format.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// Colors follow the sport's slot in this page's fixed order, never a re-ranking.
	const SLOT_COLORS = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)'];

	let sportSeries = $derived(
		data.monthly.sports.map((s, i) => ({
			key: s,
			label: s === 'WeightTraining' ? 'Weights' : s,
			color: s === 'Other' ? 'var(--series-other)' : SLOT_COLORS[i]
		}))
	);
	let monthItems = $derived(
		data.monthly.months.map((m, i) => ({
			key: m,
			label: monthLabel(m),
			heading: monthYearLabel(m),
			values: data.monthly.hours[i]
		}))
	);

	const intensitySeries = [
		{ key: 'easy', label: 'Easy', color: 'var(--ramp-1)' },
		{ key: 'moderate', label: 'Moderate', color: 'var(--ramp-2)' },
		{ key: 'hard', label: 'Hard', color: 'var(--ramp-3)' }
	];
	let intensityItems = $derived(
		(data.intensity?.weeks ?? []).map((w) => ({
			key: w.week,
			label: shortDay(w.week),
			heading: `Week of ${shortDay(w.week)}`,
			values: { easy: w.easy, moderate: w.moderate, hard: w.hard }
		}))
	);

	let maxLoad = $derived(Math.max(1, ...data.loadBySport.map((s) => s.load)));

	const pct = (x: number | null) => (x == null ? '–' : `${Math.round(x * 100)}%`);
</script>

<h1>Insights</h1>

<section class="card">
	<h2>Hours per month by sport</h2>
	<StackedColumnChart
		series={sportSeries}
		items={monthItems}
		label="Hours per month by sport, last 12 months"
		unit=" h"
	/>
</section>

{#if data.intensity}
	{@const i = data.intensity}
	<section class="card">
		<h2>Running intensity</h2>
		<p class="small muted">
			Runs are classified by average heart rate: easy ≤ {i.easyMaxHr ?? '–'} bpm (zone 1–2), moderate
			≤
			{i.moderateMaxHr ?? '–'} (zone 3), hard above.
			{#if i.bands}
				On road runs with laps, any lap at threshold pace ({paceStr(i.bands.threshold)}/km) or
				faster counts as hard, so interval reps show up even when the average heart rate looks easy.
			{/if}
		</p>
		<div class="mix">
			{#each [{ label: 'Last 4 weeks', s: i.last4 }, { label: 'Last 12 weeks', s: i.last12 }] as row (row.label)}
				<div class="mix-row">
					<div class="small secondary">{row.label}</div>
					{#if row.s.total > 0}
						<div
							class="bar"
							role="img"
							aria-label="{row.label}: {pct(row.s.easy / row.s.total)} easy, {pct(
								row.s.moderate / row.s.total
							)} moderate, {pct(row.s.hard / row.s.total)} hard"
						>
							{#each intensitySeries as s (s.key)}
								{@const v = row.s[s.key as 'easy' | 'moderate' | 'hard']}
								{#if v > 0}<span style:flex-grow={v} style:background={s.color}></span>{/if}
							{/each}
						</div>
						<div class="small">
							<strong>{pct(row.s.easyShare)} easy</strong>
							<span class="muted"
								>· {pct(row.s.moderate / row.s.total)} moderate · {pct(row.s.hard / row.s.total)} hard
								· {Math.round(row.s.total / 60)} h</span
							>
						</div>
					{:else}
						<div class="small muted">No runs with heart rate.</div>
					{/if}
				</div>
			{/each}
		</div>
		<p class="small muted">
			Many coaches aim for roughly 80% easy. Well above that is fine in base building; well below it
			over several weeks often means easy days are run too hard.
		</p>
		<StackedColumnChart
			series={intensitySeries}
			items={intensityItems}
			label="Running minutes per week by intensity, last 12 weeks"
			format={(v) => String(Math.round(v))}
			unit=" min"
		/>
	</section>
{/if}

<section class="card">
	<h2>Longest run per week (km)</h2>
	<ColumnChart
		items={data.longRuns.map((w) => ({
			key: w.week,
			label: shortDay(w.week),
			value: w.km,
			tooltip: [`Week of ${shortDay(w.week)}`, `${w.km.toFixed(1)} km`, ...(w.name ? [w.name] : [])]
		}))}
		label="Longest run per week, last 16 weeks"
		tableHeaders={['Week', 'km']}
		format={(v) => v.toFixed(1)}
	/>
</section>

<section class="card">
	<h2>Training load by sport, last 4 weeks</h2>
	{#if data.loadBySport.length}
		<table>
			<thead
				><tr
					><th>Sport</th><th class="num">Sessions</th><th class="num">Hours</th><th class="num"
						>Load</th
					><th class="bar-col"></th></tr
				></thead
			>
			<tbody>
				{#each data.loadBySport as s (s.sport)}
					<tr>
						<td>{s.sport === 'WeightTraining' ? 'Weights' : s.sport}</td>
						<td class="num">{s.count}</td>
						<td class="num">{s.hours.toFixed(1)}</td>
						<td class="num">{Math.round(s.load)}</td>
						<td class="bar-col"
							><span class="hbar" style:width="{(s.load / maxLoad) * 100}%"></span></td
						>
					</tr>
				{/each}
			</tbody>
		</table>
	{:else}
		<p class="small muted">No activities in the last 4 weeks.</p>
	{/if}
</section>

<style>
	h1 {
		font-size: 1.4rem;
	}
	section {
		margin-bottom: 1rem;
	}
	.mix {
		display: grid;
		gap: 0.75rem;
		margin: 0.75rem 0;
	}
	.mix-row {
		display: grid;
		gap: 0.25rem;
	}
	.bar {
		display: flex;
		gap: 2px;
		height: 12px;
	}
	.bar span {
		flex-basis: 0;
		min-width: 2px;
	}
	.bar span:first-child {
		border-radius: 4px 0 0 4px;
	}
	.bar span:last-child {
		border-radius: 0 4px 4px 0;
	}
	.bar span:only-child {
		border-radius: 4px;
	}
	.bar-col {
		width: 40%;
	}
	.hbar {
		display: block;
		height: 10px;
		background: var(--series-1);
		border-radius: 0 4px 4px 0;
		min-width: 2px;
	}
</style>
