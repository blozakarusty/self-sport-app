<script lang="ts">
	import { goto } from '$app/navigation';
	import { dayLabel, duration, km, pace, PACE_SPORTS, timeOfDay } from '#lib/format.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	function href(page: number, sport = data.sport) {
		const p = new URLSearchParams();
		if (sport) p.set('sport', sport);
		if (page > 1) p.set('page', String(page));
		const q = p.toString();
		return q ? `?${q}` : '/activities';
	}
</script>

<div class="head">
	<h1>Activities</h1>
	<label class="small secondary">
		Sport
		<select
			value={data.sport ?? ''}
			onchange={(e) => goto(href(1, e.currentTarget.value || undefined))}
		>
			<option value="">All</option>
			{#each data.sports as s (s)}<option value={s}>{s}</option>{/each}
		</select>
	</label>
</div>

<div class="card scroll">
	<table>
		<thead>
			<tr>
				<th>Date</th>
				<th>Activity</th>
				<th class="num">Distance</th>
				<th class="num">Time</th>
				<th class="num">Pace</th>
				<th class="num">Elev.</th>
				<th class="num">Avg HR</th>
				<th class="num">Load</th>
			</tr>
		</thead>
		<tbody>
			{#each data.activities as a (a.id)}
				<tr>
					<td
						>{dayLabel(a.startDateLocal)}
						<span class="muted small">{timeOfDay(a.startDateLocal)}</span></td
					>
					<td class="name">
						<a href="/activities/{encodeURIComponent(a.id)}">{a.name}</a>
						<div class="small muted">{a.sportType}</div>
					</td>
					<td class="num">{a.distance > 0 ? `${km(a.distance, 2)} km` : '–'}</td>
					<td class="num">{duration(a.movingTime)}</td>
					<td class="num"
						>{PACE_SPORTS.has(a.sportType) ? `${pace(a.distance, a.movingTime)} /km` : '–'}</td
					>
					<td class="num">{a.elevationGain > 0 ? `${Math.round(a.elevationGain)} m` : '–'}</td>
					<td class="num">{a.avgHr ? Math.round(a.avgHr) : '–'}</td>
					<td
						class="num"
						title={a.loadMethod === 'trimp' ? 'From heart rate' : 'Estimated from duration'}
					>
						{Math.round(a.load)}{a.loadMethod === 'estimate' ? '*' : ''}
					</td>
				</tr>
			{:else}
				<tr
					><td colspan="8" class="muted"
						>No activities yet. They appear here after the first sync.</td
					></tr
				>
			{/each}
		</tbody>
	</table>
</div>
<p class="small muted">* load estimated from duration (no heart rate)</p>

<nav class="pager">
	{#if data.page > 1}<a class="button" href={href(data.page - 1)}>← Newer</a>{/if}
	{#if data.hasMore}<a class="button" href={href(data.page + 1)}>Older →</a>{/if}
</nav>

<style>
	.head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.75rem;
	}
	.head h1 {
		font-size: 1.4rem;
		margin: 0;
	}
	.scroll {
		overflow-x: auto;
		padding: 0.25rem 0.5rem;
	}
	.name {
		white-space: normal;
		min-width: 180px;
	}
	.name a {
		color: var(--ink);
		text-decoration: none;
		font-weight: 500;
	}
	.name a:hover {
		text-decoration: underline;
	}
	.pager {
		display: flex;
		gap: 0.5rem;
		justify-content: center;
	}
</style>
