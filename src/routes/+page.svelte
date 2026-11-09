<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import FitnessChart from '#lib/components/FitnessChart.svelte';
	import CoachChat from '#lib/components/CoachChat.svelte';
	import ColumnChart from '#lib/components/ColumnChart.svelte';
	import ProgressBar from '#lib/components/ProgressBar.svelte';
	import SessionCard from '#lib/components/SessionCard.svelte';
	import { dayLabel, paceStr, raceTime, relativeTime, shortDay } from '#lib/format.ts';
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
			{#if d.sync?.lastError?.includes('rate limit')}
				<p class="small muted">
					Paused at Strava's rate limit; the import resumes on the next sync.
				</p>
			{:else if d.sync?.lastError}
				<p class="small notice">Last sync: {d.sync.lastError}</p>
			{/if}
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

	{#if data.upcoming}
		{@const u = data.upcoming}
		<section class="card plan-today">
			<div class="pt-head">
				<h2>Today's plan</h2>
				<a class="small" href="/plan">Full week →</a>
			</div>
			{#each u.today.sessions as s (s.id)}
				<SessionCard {s} open={s.kind === 'run' || s.kind === 'strength'} />
			{:else}
				<p class="small muted">Rest day.</p>
			{/each}
			{#each u.today.unplanned as x (x.id)}
				<p class="small muted">+ {x.name} ({x.sportType}, not in plan)</p>
			{/each}
			<h3 class="small secondary tomorrow">Tomorrow</h3>
			{#each u.tomorrow.sessions.filter((s) => s.kind !== 'gtg') as s (s.id)}
				<SessionCard {s} />
			{:else}
				<p class="small muted">Rest day.</p>
			{/each}
		</section>
	{/if}

	{#if data.feedback.length}
		<section class="card notes">
			<h2>Coach feedback</h2>
			{#each data.feedback as f (f.id)}
				<div>
					<a class="small" href="/activities/{encodeURIComponent(f.id)}"
						>{dayLabel(f.startDateLocal)} · {f.sportType === 'WeightTraining'
							? 'Strength'
							: f.sportType}</a
					>
					<p class="small">{f.text}</p>
				</div>
			{/each}
		</section>
	{/if}

	<CoachChat />

	{#if data.goal}
		{@const g = data.goal}
		<a class="card goal" href="/goals">
			<div class="goal-row">
				<span
					><strong>{g.name}</strong>
					<span class="secondary">· goal {raceTime(g.targetTime)} · {dayLabel(g.date)}</span></span
				>
				<span class="small secondary">
					{Math.floor(g.daysToGo / 7)} weeks to go{#if g.phase}
						· {g.phase.label} phase, week {g.week} of {g.totalWeeks}{/if}
				</span>
			</div>
			{#if g.fitness.start != null}
				<ProgressBar
					min={Math.min(g.fitness.start, g.fitness.current ?? g.fitness.start)}
					max={g.fitness.target}
					value={g.fitness.current}
					expected={g.fitness.expected}
					label="Running fitness toward goal"
				/>
				<div class="goal-row small muted">
					<span>VDOT {g.fitness.current?.toFixed(1) ?? '–'} of {g.fitness.target.toFixed(1)}</span>
					<span>
						{#if g.fitness.status === 'behind'}Behind the path{:else if g.fitness.status === 'ahead'}Ahead
							of the path{:else if g.fitness.status}On track{/if}
						· Goals →
					</span>
				</div>
			{/if}
		</a>
	{:else}
		<a class="card running" href="/goals"
			><span class="secondary">No race goal yet.</span><span class="go">Set a goal →</span></a
		>
	{/if}

	{#if data.strengthWeek}
		{@const w = data.strengthWeek}
		<a class="card running" href="/strength">
			<span class="secondary">Strength this week</span>
			{#each ['push', 'pull', 'legs'] as k (k)}
				{@const n = w[k as 'push' | 'pull' | 'legs']}
				<span class:done={n > 0} class="ppl"
					>{n > 0 ? '✓' : '○'} {k[0].toUpperCase() + k.slice(1)}</span
				>
			{/each}
			{#if w.untagged}<span class="small muted">{w.untagged} untagged</span>{/if}
			<span class="go">Strength →</span>
		</a>
	{/if}

	<a class="card running" href="/performance">
		{#if data.vdot}
			<span
				><span class="secondary">Running fitness</span>
				<strong>VDOT {data.vdot.value.toFixed(1)}</strong></span
			>
			<span class="secondary">5K ≈ {raceTime(data.vdot.fiveK)}</span>
			<span class="secondary">Threshold {paceStr(data.vdot.threshold)} /km</span>
		{:else}
			<span class="secondary">Running fitness appears once run details are imported.</span>
		{/if}
		<span class="go">Performance →</span>
	</a>

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
		<ColumnChart
			items={d.weeks.map((w) => ({
				key: w.week,
				label: shortDay(w.week),
				value: w.runKm,
				tooltip: [
					`Week of ${shortDay(w.week)}`,
					`${w.runKm.toFixed(1)} km`,
					`${w.runCount} runs · ${Math.round(w.runElevation)} m climb`
				]
			}))}
			label="Running kilometres per week, last {d.weeks.length} weeks"
			tableHeaders={['Week', 'km']}
		/>
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
	.running {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 1.25rem;
		align-items: baseline;
		color: var(--ink);
		text-decoration: none;
		margin-bottom: 1rem;
	}
	.notes {
		display: grid;
		gap: 0.5rem;
		margin-bottom: 1rem;
	}
	.notes h2,
	.notes p {
		margin: 0;
	}
	.plan-today {
		display: grid;
		gap: 0.4rem;
		margin-bottom: 1rem;
	}
	.pt-head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
	}
	.pt-head h2 {
		margin: 0;
	}
	.tomorrow {
		margin: 0.5rem 0 0;
	}
	.goal {
		display: block;
		color: var(--ink);
		text-decoration: none;
		margin-bottom: 1rem;
	}
	.goal-row {
		display: flex;
		justify-content: space-between;
		gap: 0.25rem 1rem;
		flex-wrap: wrap;
	}
	.ppl {
		color: var(--muted);
	}
	.ppl.done {
		color: var(--ink);
	}
	.running .go {
		margin-left: auto;
		color: var(--accent);
		font-size: 0.9rem;
	}
	.notice {
		color: var(--critical);
	}
</style>
