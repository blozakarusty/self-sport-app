<script lang="ts">
	import { enhance } from '$app/forms';
	import {
		dayLabel,
		effortLabel,
		duration,
		km,
		pace,
		paceStr,
		PACE_SPORTS,
		raceTime,
		timeOfDay
	} from '#lib/format.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let a = $derived(data.activity);
	let showPace = $derived(PACE_SPORTS.has(a.sportType));
	let fetching = $state(false);
</script>

<p class="small"><a href="/activities">← Activities</a></p>

<header class="head">
	<div>
		<h1>{a.name}</h1>
		<p class="small muted">
			{a.sportType} · {dayLabel(a.startDateLocal)}
			{a.startDateLocal.slice(0, 4)}, {timeOfDay(a.startDateLocal)}
			{#if a.source === 'strava'}
				· <a href="https://www.strava.com/activities/{a.sourceId}" target="_blank" rel="noopener"
					>View on Strava</a
				>
			{/if}
		</p>
		{#if a.description}<p class="secondary description">{a.description}</p>{/if}
	</div>
</header>

<section class="stats card">
	{#if a.distance > 0}
		<div>
			<div class="label">Distance</div>
			<div class="value">{km(a.distance, 2)} km</div>
		</div>
	{/if}
	<div>
		<div class="label">Moving time</div>
		<div class="value">{duration(a.movingTime)}</div>
	</div>
	{#if showPace && a.distance > 0}
		<div>
			<div class="label">Pace</div>
			<div class="value">{pace(a.distance, a.movingTime)} /km</div>
		</div>
	{/if}
	{#if a.elevationGain > 0}
		<div>
			<div class="label">Elevation</div>
			<div class="value">{Math.round(a.elevationGain)} m</div>
		</div>
	{/if}
	{#if a.avgHr}
		<div>
			<div class="label">Avg HR</div>
			<div class="value">{Math.round(a.avgHr)}</div>
			{#if data.zone}<div class="small muted">
					Zone {data.zone}{data.intensity ? ` · ${data.intensity}` : ''}
				</div>{/if}
		</div>
	{/if}
	<div>
		<div class="label">Load</div>
		<div class="value">{Math.round(data.load)}</div>
		<div class="small muted">
			{data.loadMethod === 'trimp'
				? `TRIMP, max HR ${data.hr?.maxHr}, rest ${data.hr?.restHr}`
				: 'Estimated from duration'}
		</div>
	</div>
</section>

{#if !a.detailFetchedAt && a.source === 'strava'}
	<section class="card">
		<p class="small secondary">
			Splits, laps and best efforts haven't been imported for this activity yet.
		</p>
		<form
			method="POST"
			action="?/fetchDetail"
			use:enhance={() => {
				fetching = true;
				return async ({ update }) => {
					await update();
					fetching = false;
				};
			}}
		>
			<button disabled={fetching}>{fetching ? 'Fetching…' : 'Fetch details from Strava'}</button>
		</form>
		{#if form?.error}<p class="small error">{form.error}</p>{/if}
	</section>
{/if}

{#if data.bestEfforts.length}
	<section class="card">
		<h2>Best efforts</h2>
		<table>
			<thead><tr><th>Distance</th><th class="num">Time</th><th class="num">Pace</th></tr></thead>
			<tbody>
				{#each data.bestEfforts as e (e.id)}
					<tr>
						<td>{effortLabel(e.name)}</td>
						<td class="num">{raceTime(e.elapsedTime)}</td>
						<td class="num">{paceStr(e.elapsedTime / (e.distance / 1000))} /km</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</section>
{/if}

{#if a.laps && a.laps.length > 1}
	<section class="card scroll">
		<h2>Laps</h2>
		<table>
			<thead
				><tr
					><th>Lap</th><th class="num">Distance</th><th class="num">Time</th>{#if showPace}<th
							class="num">Pace</th
						>{/if}<th class="num">Avg HR</th></tr
				></thead
			>
			<tbody>
				{#each a.laps as l, i (i)}
					<tr>
						<td>{l.name}</td>
						<td class="num">{km(l.distance, 2)} km</td>
						<td class="num">{duration(l.movingTime)}</td>
						{#if showPace}<td class="num">{pace(l.distance, l.movingTime)}</td>{/if}
						<td class="num">{l.avgHr ? Math.round(l.avgHr) : '–'}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</section>
{/if}

{#if a.splits && a.splits.length > 1}
	<section class="card scroll">
		<h2>Splits per km</h2>
		<table>
			<thead
				><tr
					><th>Km</th><th class="num">Pace</th><th class="num">Elev.</th><th class="num">Avg HR</th
					></tr
				></thead
			>
			<tbody>
				{#each a.splits as s, i (i)}
					<tr>
						<td>{i + 1}{s.distance < 950 ? ` (${Math.round(s.distance)} m)` : ''}</td>
						<td class="num">{pace(s.distance, s.movingTime)}</td>
						<td class="num"
							>{s.elevationDifference == null
								? '–'
								: `${s.elevationDifference > 0 ? '+' : ''}${Math.round(s.elevationDifference)} m`}</td
						>
						<td class="num">{s.avgHr ? Math.round(s.avgHr) : '–'}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</section>
{/if}

<style>
	h1 {
		font-size: 1.4rem;
		margin: 0;
	}
	.head p {
		margin: 0.2rem 0 0;
	}
	.description {
		white-space: pre-line;
	}
	section {
		margin-top: 1rem;
	}
	.stats {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
		gap: 0.75rem;
	}
	.stats .label {
		font-size: 0.8rem;
		color: var(--ink-2);
	}
	.stats .value {
		font-size: 1.3rem;
		font-weight: 600;
	}
	.scroll {
		overflow-x: auto;
	}
	.error {
		color: var(--critical);
	}
</style>
