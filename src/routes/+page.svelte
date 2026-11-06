<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import FitnessChart from '#lib/components/FitnessChart.svelte';
	import WeeklyVolumeChart from '#lib/components/WeeklyVolumeChart.svelte';
	import { dayLabel, relativeTime } from '#lib/format.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let syncing = $state(false);

	const acwrInfo = {
		low: { label: 'Below usual load', status: 'warning', icon: '↓' },
		optimal: { label: 'In usual range', status: 'good', icon: '✓' },
		caution: { label: 'Ramping fast', status: 'serious', icon: '!' },
		high: { label: 'Big spike', status: 'critical', icon: '!!' }
	} as const;

	function formLabel(tsb: number) {
		if (tsb > 5) return 'Fresh';
		if (tsb >= -10) return 'Neutral';
		if (tsb >= -30) return 'Training';
		return 'Very fatigued';
	}

	// While the first backfill runs in the background, poll until it finishes.
	$effect(() => {
		if (data.dashboard && !data.dashboard.sync?.backfillComplete) {
			const t = setInterval(() => invalidateAll(), 4000);
			return () => clearInterval(t);
		}
	});
</script>

{#if !data.dashboard}
	<section class="hero card">
		<h1>Your training, your plan</h1>
		<p class="secondary">
			Connect Strava to import your activities and see your fitness, fatigue and weekly volume.
			Plans and strength training come next.
		</p>
		{#if data.authError === 'scopes'}
			<p class="notice">
				Please allow all requested permissions; missing: <code>{data.missingScopes}</code>. Private
				activities and HR zones are needed for accurate load.
			</p>
		{:else if data.authError === 'denied'}
			<p class="notice">Strava access was not granted.</p>
		{/if}
		<a class="button primary" href="/auth/strava">Connect with Strava</a>
	</section>
{:else}
	{@const d = data.dashboard}
	<section class="head">
		<div>
			<h1>{dayLabel(d.today)}</h1>
			<p class="small muted">
				{data.activityCount} activities · synced {relativeTime(d.sync?.lastSyncAt ?? null)}
				{#if d.sync && !d.sync.backfillComplete}· importing history…{/if}
			</p>
			{#if d.sync?.lastError}<p class="small notice">Last sync: {d.sync.lastError}</p>{/if}
			{#if form?.error}<p class="small notice">{form.error}</p>{/if}
		</div>
		<form
			method="POST"
			action="?/sync"
			use:enhance={() => {
				syncing = true;
				return async ({ update }) => {
					await update();
					syncing = false;
				};
			}}
		>
			<button disabled={syncing}>{syncing ? 'Syncing…' : 'Sync now'}</button>
		</form>
	</section>

	<section class="tiles">
		<div class="card tile">
			<div class="label secondary">Fitness</div>
			<div class="value">{Math.round(d.current.ctl)}</div>
			<div class="small muted">
				{d.current.ctlDelta >= 0 ? '+' : ''}{d.current.ctlDelta.toFixed(1)} vs last week
			</div>
		</div>
		<div class="card tile">
			<div class="label secondary">Fatigue</div>
			<div class="value">{Math.round(d.current.atl)}</div>
			<div class="small muted">{Math.round(d.current.last7)} load in last 7 days</div>
		</div>
		<div class="card tile">
			<div class="label secondary">Form</div>
			<div class="value">{d.current.tsb > 0 ? '+' : ''}{Math.round(d.current.tsb)}</div>
			<div class="small muted">{formLabel(d.current.tsb)}</div>
		</div>
		<div class="card tile">
			<div class="label secondary">Acute : chronic</div>
			{#if d.current.acwr != null && d.current.acwrZone}
				{@const info = acwrInfo[d.current.acwrZone]}
				<div class="value">{d.current.acwr.toFixed(2)}</div>
				<div class="small status">
					<span class="badge" style:background="var(--{info.status})">{info.icon}</span>
					{info.label}
				</div>
			{:else}
				<div class="value">–</div>
				<div class="small muted">Not enough history yet</div>
			{/if}
		</div>
	</section>

	<section class="card">
		<h2>Fitness &amp; fatigue</h2>
		<p class="small muted">
			Daily load from {d.hr ? 'heart rate (TRIMP)' : 'duration estimates'}; fitness and fatigue are
			42- and 7-day weighted averages.
			{#if d.hr}Max HR {d.hr.maxHr} ({d.hr.maxHrSource}), rest HR {d.hr.restHr}.{/if}
			<a href="/settings">Adjust</a>
		</p>
		<FitnessChart points={d.chart} />
	</section>

	<section class="card">
		<h2>Running volume per week (km)</h2>
		<WeeklyVolumeChart weeks={d.weeks} />
	</section>
{/if}

<style>
	section {
		margin-bottom: 1rem;
	}
	.hero {
		max-width: 520px;
		margin: 3rem auto;
		text-align: center;
		padding: 2rem;
	}
	.head {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 1rem;
	}
	.head h1 {
		font-size: 1.4rem;
		margin: 0;
	}
	.head p {
		margin: 0.2rem 0 0;
	}
	.tiles {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
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
	.status {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		color: var(--ink-2);
	}
	.badge {
		display: inline-grid;
		place-items: center;
		min-width: 18px;
		height: 18px;
		padding: 0 4px;
		border-radius: 9px;
		color: #0b0b0b;
		font-size: 11px;
		font-weight: 700;
	}
	.notice {
		color: var(--critical);
	}
</style>
