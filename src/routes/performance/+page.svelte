<script lang="ts">
	import { enhance } from '$app/forms';
	import TrendChart from '#lib/components/TrendChart.svelte';
	import { dayLabel, paceStr, raceTime } from '#lib/format.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let paceChange = $derived(
		data.efficiency?.recent && data.efficiency?.earlier
			? data.efficiency.recent.pace - data.efficiency.earlier.pace
			: null
	);
</script>

<h1>Performance</h1>

{#if data.detailsPending > 0}
	<p class="small notice-info">
		Importing run details from Strava: {data.detailsPending} runs to go (about 40 per sync, newest first).
		Estimates and records fill in as they arrive; use <a href="/">Sync now</a> to speed it up.
	</p>
{/if}

<section class="tiles">
	<div class="card tile">
		<div class="label secondary">Running fitness (VDOT)</div>
		{#if data.estimate}
			<div class="value">{data.estimate.value.toFixed(1)}</div>
			<div class="small muted">
				From {data.estimate.effort.label}, {dayLabel(data.estimate.effort.date)}
				{#if data.estimate.raw - data.estimate.value > 0.05}
					({data.estimate.raw.toFixed(1)} on the day, adjusted for age)
				{/if}
			</div>
		{:else}
			<div class="value">–</div>
			<div class="small muted">No efforts ≥ 1.5 km in the last 120 days yet.</div>
		{/if}
	</div>
	<div class="card tile">
		<div class="label secondary">Pace at {data.efficiency?.refHr ?? '–'} bpm</div>
		{#if data.efficiency?.recent}
			<div class="value">{paceStr(data.efficiency.recent.pace)} <span class="unit">/km</span></div>
			<div class="small muted">
				Last 4 weeks, {data.efficiency.recent.runs} flat runs.
				{#if paceChange != null}
					{Math.abs(paceChange) < 1
						? 'Same as 2 months ago.'
						: `${paceStr(Math.abs(paceChange))} ${paceChange < 0 ? 'faster' : 'slower'} than 2 months ago.`}
				{/if}
			</div>
		{:else}
			<div class="value">–</div>
			<div class="small muted">Needs flat runs of 5 km+ with heart rate.</div>
		{/if}
	</div>
</section>

{#if data.paces}
	<section class="card">
		<h2>Training paces</h2>
		<p class="small muted">From your VDOT using Daniels' formulas. Override any pace below.</p>
		<table>
			<thead><tr><th>Pace</th><th class="num">Per km</th><th>Used for</th></tr></thead>
			<tbody>
				{#each data.paces as p (p.name)}
					<tr>
						<td
							><strong>{p.label}</strong>{#if p.overridden}
								<span class="tag">manual</span>{/if}</td
						>
						<td class="num">
							{p.range ? `${paceStr(p.range[0])}–${paceStr(p.range[1])}` : paceStr(p.value)}
						</td>
						<td class="secondary wrap">{p.purpose}</td>
					</tr>
				{/each}
			</tbody>
		</table>
		<details open={!!form?.paceError}>
			<summary>Override paces</summary>
			<form method="POST" action="?/paces" use:enhance class="inline-form">
				{#each data.paces as p (p.name)}
					<label>
						{p.label}
						<input
							name={p.name}
							inputmode="numeric"
							placeholder="m:ss"
							value={data.paceOverrides[p.name] ? paceStr(data.paceOverrides[p.name]!) : ''}
						/>
					</label>
				{/each}
				<button>Save</button>
			</form>
			<p class="small muted">Leave a field empty to use the calculated pace.</p>
			{#if form?.paceError}<p class="small error">{form.paceError}</p>{/if}
		</details>
	</section>
{/if}

{#if data.predictions}
	<section class="card">
		<h2>Race predictions</h2>
		<table>
			<thead><tr><th>Race</th><th class="num">Time</th><th class="num">Pace</th></tr></thead>
			<tbody>
				{#each data.predictions as r (r.name)}
					<tr class:rough={r.rough}>
						<td
							>{r.name}{#if r.rough}
								<span class="tag">rough</span>{/if}</td
						>
						<td class="num">{raceTime(r.time)}</td>
						<td class="num">{paceStr(r.time / (r.distance / 1000))} /km</td>
					</tr>
				{/each}
			</tbody>
		</table>
		<p class="small muted">
			Assumes training for the distance. Ultra and trail times are a rule of thumb (Riegel + 1 km
			per 100 m of climb), not a reliable prediction.
		</p>
	</section>
{/if}

<section class="card">
	<h2>Running fitness (VDOT), last 12 months</h2>
	<TrendChart
		points={data.vdotTrend}
		format={(v) => v.toFixed(1)}
		label="Weekly VDOT estimate over the last 12 months"
		tableLabel="VDOT"
	/>
</section>

{#if data.efficiency}
	<section class="card">
		<h2>Pace at {data.efficiency.refHr} bpm per week</h2>
		<p class="small muted">
			Flat road runs of 5 km+, scaled to {data.efficiency.refHr} bpm ({data.efficiency
				.refHrSource === 'user'
				? 'your setting'
				: 'middle of your zone 2'}). Higher on the chart is faster. Heat and wind add noise.
		</p>
		<TrendChart
			points={data.efficiency.trend.map((w) => ({ day: w.week, value: w.pace }))}
			format={paceStr}
			invert
			label="Pace at {data.efficiency.refHr} bpm per week, last 26 weeks"
			tableLabel="Pace /km"
		/>
	</section>
{/if}

<section class="card">
	<h2>Personal records</h2>
	{#if data.records.length}
		<div class="scroll">
			<table>
				<thead>
					<tr>
						<th>Distance</th>
						<th class="num">All-time</th>
						<th>When</th>
						{#each data.years as y (y)}<th class="num">{y}</th>{/each}
					</tr>
				</thead>
				<tbody>
					{#each data.records as r (r.name)}
						<tr>
							<td><strong>{r.label}</strong></td>
							<td class="num">
								<a href="/activities/{encodeURIComponent(r.best.activityId)}"
									>{raceTime(r.best.time)}</a
								>
								{#if r.best.insideLongerRun}<span class="tag" title="Split from inside a longer run"
										>split</span
									>{/if}
							</td>
							<td class="secondary small">{dayLabel(r.best.date)} {r.best.date.slice(0, 4)}</td>
							{#each data.years as y (y)}
								{@const e = r.byYear[y]}
								<td class="num">
									{#if e}<a href="/activities/{encodeURIComponent(e.activityId)}"
											>{raceTime(e.time)}</a
										>{:else}–{/if}
								</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		<p class="small muted">
			From Strava's best efforts within your runs ({data.effortCount} so far). “split” marks a time set
			inside a much longer run, such as an ultra; it doesn't count as a race result.
		</p>
	{:else}
		<p class="small muted">No best efforts imported yet.</p>
	{/if}
</section>

<section class="card">
	<h2>Race results &amp; time trials</h2>
	<p class="small muted">
		Add an all-out effort that isn't in Strava's best efforts (e.g. a trail race or track session).
		It counts toward your VDOT for 120 days.
	</p>
	{#if data.manual.length}
		<table>
			<thead
				><tr
					><th>Date</th><th>Name</th><th class="num">Distance</th><th class="num">Time</th><th
					></th></tr
				></thead
			>
			<tbody>
				{#each data.manual.toReversed() as m (m.id)}
					<tr>
						<td>{dayLabel(m.date)} {m.date.slice(0, 4)}</td>
						<td>{m.name}</td>
						<td class="num">{(m.distance / 1000).toFixed(2)} km</td>
						<td class="num">{raceTime(m.time)}</td>
						<td>
							<form method="POST" action="?/deleteResult" use:enhance>
								<input type="hidden" name="id" value={m.id} />
								<button class="small" aria-label="Delete {m.name}">Delete</button>
							</form>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
	<form method="POST" action="?/addResult" use:enhance class="inline-form">
		<label>Date <input type="date" name="date" max={data.today} required /></label>
		<label>Name <input name="name" placeholder="Parkrun" /></label>
		<label>Distance (km) <input name="km" inputmode="decimal" placeholder="5" required /></label>
		<label>Time <input name="time" placeholder="19:58" required /></label>
		<button>Add</button>
	</form>
	{#if form?.resultError}<p class="small error">{form.resultError}</p>{/if}
</section>

<style>
	h1 {
		font-size: 1.4rem;
	}
	section {
		margin-bottom: 1rem;
	}
	.tiles {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
		gap: 0.75rem;
	}
	.tile .label {
		font-size: 0.85rem;
	}
	.tile .value {
		font-size: 1.8rem;
		font-weight: 600;
		line-height: 1.2;
	}
	.unit {
		font-size: 0.9rem;
		font-weight: 400;
		color: var(--ink-2);
	}
	.tag {
		font-size: 0.7rem;
		border: 1px solid var(--border);
		border-radius: 4px;
		padding: 0 4px;
		color: var(--ink-2);
		font-weight: 400;
	}
	.wrap {
		white-space: normal;
	}
	.rough td {
		color: var(--ink-2);
	}
	.scroll {
		overflow-x: auto;
	}
	.inline-form {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: flex-end;
		margin-top: 0.75rem;
	}
	.inline-form label {
		display: grid;
		gap: 0.2rem;
		font-size: 0.8rem;
		color: var(--ink-2);
	}
	.inline-form input {
		width: 7.5rem;
	}
	.notice-info {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 0.5rem 0.75rem;
	}
	.error {
		color: var(--critical);
	}
	td a {
		color: var(--ink);
	}
</style>
