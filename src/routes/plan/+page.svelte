<script lang="ts">
	import { enhance } from '$app/forms';
	import CoachChat from '#lib/components/CoachChat.svelte';
	import SessionCard from '#lib/components/SessionCard.svelte';
	import { dayLabel, shortDay } from '#lib/format.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const keep =
		() =>
		async ({ update }: { update: (o?: { reset?: boolean }) => Promise<void> }) =>
			update({ reset: false });

	const PHASE_COLOR: Record<string, string> = {
		base: 'var(--series-1)',
		build: 'var(--series-2)',
		peak: 'var(--series-3)',
		taper: 'var(--series-4)'
	};
	const DECISIONS: Record<string, string> = {
		progress: 'Keep going',
		hold: 'Hold steady',
		reduce: 'Lighter week',
		recover: 'Recovery focus'
	};
	let maxKm = $derived(
		data.season ? Math.max(...data.season.map((w) => Math.max(w.plannedKm, w.actualKm ?? 0))) : 1
	);
</script>

<h1>Plan</h1>

{#if !data.goal}
	<section class="card">
		<p>Set a race goal first; the plan is built around it.</p>
		<a class="button" href="/goals">Set a goal</a>
	</section>
{:else}
	{@const w = data.week}
	<nav class="weeknav">
		<a class="button" href="?week={data.prev}" aria-label="Previous week">←</a>
		<div>
			<strong>Week of {shortDay(w.monday)}</strong>
			{#if w.week}<span class="secondary"> · week {w.week}</span>{/if}
			{#if w.phase}
				<span class="phase" style:--c={PHASE_COLOR[w.phase.name]}
					>{w.phase.label}{w.phase.recovery ? ' · recovery week' : ''}{w.phase.test
						? ' · test week'
						: ''}</span
				>
			{/if}
		</div>
		<a class="button" href="?week={data.next}" aria-label="Next week">→</a>
		{#if w.monday !== data.thisMonday}<a class="small" href="/plan">This week</a>{/if}
	</nav>

	<section class="summary card">
		<div>
			<span class="secondary small">Running</span> <strong>{w.summary.actualKm}</strong>
			<span class="muted">of {w.summary.plannedKm} km</span>
		</div>
		<div>
			<span class="secondary small">Key sessions</span> <strong>{w.summary.keyDone}</strong>
			<span class="muted">of {w.summary.keyTotal}</span>
		</div>
		<div>
			<span class="secondary small">Sessions done</span> <strong>{w.summary.requiredDone}</strong>
			<span class="muted">of {w.summary.required} required</span>
		</div>
	</section>

	{#if w.warnings.length}
		<section class="card warnings">
			{#each w.warnings as msg, i (i)}<p class="small">⚠ {msg}</p>{/each}
		</section>
	{/if}

	<section class="card review">
		<div class="review-head">
			<h2>Weekly review</h2>
			{#if data.revision}<span class="small muted"
					>Week of {shortDay(data.revision.reviewedWeek)} · {data.revision.source === 'claude'
						? 'Claude coach'
						: 'rules'}</span
				>{/if}
		</div>
		{#if data.revision}
			{@const r = data.revision}
			<p class="decision">
				<strong>{DECISIONS[r.decision]}</strong>{#if r.undone}
					<span class="small muted">(undone)</span>{/if}
			</p>
			<p class="small">{r.explanation}</p>
			{#if r.tips.length}<ul class="small">
					{#each r.tips as t, i (i)}<li>{t}</li>{/each}
				</ul>{/if}
			<p class="small muted">
				{r.metrics.actualKm} of {r.metrics.plannedKm} km · {r.metrics.keyDone} of {r.metrics
					.keyTotal} key sessions
			</p>
			{#if r.changes.length}
				<details class="small">
					<summary>{r.changes.length} sessions changed</summary>
					<ul>
						{#each r.changes as c, i (i)}<li>{c}</li>{/each}
					</ul>
				</details>
			{/if}
			<div class="review-actions">
				{#if r.canUndo}
					<form method="POST" action="?week={w.monday}&/undoReview" use:enhance={keep}>
						<input type="hidden" name="id" value={r.id} />
						<button class="small">Undo changes</button>
					</form>
				{/if}
				{#if r.undone}
					<form method="POST" action="?week={w.monday}&/review" use:enhance={keep}>
						<button class="small">Review again</button>
					</form>
				{/if}
			</div>
		{:else}
			<p class="small muted">
				Each Monday the app compares last week with the plan and adjusts what's ahead. Nothing to
				show yet.
			</p>
			<form method="POST" action="?week={w.monday}&/review" use:enhance={keep}>
				<button class="small">Review last week now</button>
			</form>
		{/if}
		{#if form?.reviewMessage}<p class="small secondary">{form.reviewMessage}</p>{/if}
		{#if !data.coachEnabled}<p class="small muted">
				Claude coach is off; the rules still adapt your plan. Add ANTHROPIC_API_KEY to .env to turn
				it on.
			</p>{/if}
	</section>

	<CoachChat />

	<section class="days">
		{#each w.days as d (d.date)}
			<div class="day" class:today={d.date === w.today} class:past={d.date < w.today}>
				<div class="day-head">
					<strong>{dayLabel(d.date)}</strong>
					{#if d.date === w.today}<span class="now">today</span>{/if}
				</div>
				{#each d.sessions as s (s.id)}
					<SessionCard {s} open={d.date === w.today && s.kind !== 'gtg' && s.kind !== 'leisure'}>
						{#snippet actions()}
							{#if s.status !== 'done'}
								<form
									method="POST"
									action="?week={w.monday}&/move"
									use:enhance={keep}
									class="inline"
								>
									<input type="hidden" name="id" value={s.id} />
									<select name="date" aria-label="Move {s.title} to">
										{#each w.days as opt (opt.date)}
											<option value={opt.date} selected={opt.date === d.date}
												>{dayLabel(opt.date)}</option
											>
										{/each}
									</select>
									<button class="small">Move</button>
								</form>
								<form method="POST" action="?week={w.monday}&/skip" use:enhance={keep}>
									<input type="hidden" name="id" value={s.id} />
									<button class="small">{s.skipped ? 'Unskip' : 'Skip'}</button>
								</form>
							{/if}
						{/snippet}
					</SessionCard>
				{:else}
					<p class="small muted rest">
						{d.date < data.goal.startDate ? 'Before your plan started' : 'Rest'}
					</p>
				{/each}
				{#each d.unplanned as u (u.id)}
					<p class="small unplanned">
						+ <a href="/activities/{encodeURIComponent(u.id)}">{u.name}</a>
						<span class="muted"
							>({u.sportType}{u.km > 0 ? `, ${u.km.toFixed(1)} km` : ''}, not in plan)</span
						>
					</p>
				{/each}
			</div>
		{/each}
	</section>

	{#if w.phase}
		<section class="card">
			<h2>{w.phase.label} phase focus</h2>
			<p class="small"><span class="secondary">Run:</span> {w.phase.run}</p>
			<p class="small"><span class="secondary">Strength:</span> {w.phase.strength}</p>
		</section>
	{/if}

	{#if data.season}
		<section class="card">
			<h2>Season: weekly km, planned vs run</h2>
			<div class="season" role="table" aria-label="Weekly planned and actual running km">
				{#each data.season as s (s.week)}
					<a class="srow" role="row" href="?week={s.monday}" class:current={s.monday === w.monday}>
						<span role="cell" class="sw">{s.week}</span>
						<span role="cell" class="sd">{shortDay(s.monday)}</span>
						<span role="cell" class="sp"
							><i style:background={PHASE_COLOR[s.phase]}></i>{s.phase}{s.recovery
								? ' R'
								: ''}</span
						>
						<span role="cell" class="sbar">
							<span class="planned" style:width="{(s.plannedKm / maxKm) * 100}%"></span>
							{#if s.actualKm != null}<span
									class="actual"
									style:width="{(s.actualKm / maxKm) * 100}%"
								></span>{/if}
						</span>
						<span role="cell" class="skm"
							>{s.actualKm != null ? `${Math.round(s.actualKm)} / ` : ''}{s.plannedKm} km</span
						>
						<span role="cell" class="slong muted">long {s.longKm || '–'}</span>
					</a>
				{/each}
			</div>
			<p class="small muted">
				Light bar: planned; dark bar: what you ran. R = recovery week. Click a week to open it.
			</p>
		</section>
	{/if}

	<section class="card">
		<h2>Preferences</h2>
		<form method="POST" action="?/prefs" use:enhance={keep} class="inline">
			<label class="small">
				Long run on
				<select name="longRunDay" value={data.prefs.longRunDay}>
					<option value="sun">Sunday</option>
					<option value="sat">Saturday</option>
				</select>
			</label>
			<label class="small"
				><input type="checkbox" name="optionalExtraRun" checked={data.prefs.optionalExtraRun} /> Optional
				extra easy run (build and peak)</label
			>
			<button class="small">Save and rebuild plan</button>
		</form>
		<form method="POST" action="?/regenerate" use:enhance class="inline">
			<button class="small">Rebuild remaining weeks</button>
			<span class="small muted"
				>Uses your latest fitness, volume, pull-up max and working weights. Moved and skipped
				sessions are kept.</span
			>
		</form>
		{#if form?.regenerated || form?.prefsSaved}<p class="small secondary">Plan rebuilt.</p>{/if}
	</section>
{/if}

<style>
	h1 {
		font-size: 1.4rem;
	}
	section {
		margin-bottom: 1rem;
	}
	.weeknav {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex-wrap: wrap;
		margin-bottom: 0.75rem;
	}
	.phase {
		font-size: 0.8rem;
		margin-left: 0.4rem;
		padding: 0.05rem 0.45rem;
		border-radius: 4px;
		border: 1px solid var(--c);
	}
	.review p {
		margin: 0.25rem 0;
	}
	.review ul {
		margin: 0.25rem 0;
		padding-left: 1.1rem;
	}
	.review-head {
		display: flex;
		justify-content: space-between;
		gap: 0.5rem;
		align-items: baseline;
	}
	.review-head h2 {
		margin: 0;
	}
	.review-actions {
		display: flex;
		gap: 0.4rem;
		margin-top: 0.4rem;
	}
	.summary {
		display: flex;
		gap: 1.5rem;
		flex-wrap: wrap;
	}
	.warnings p {
		margin: 0.2rem 0;
	}
	.days {
		display: grid;
		gap: 0.6rem;
	}
	.day {
		display: grid;
		gap: 0.35rem;
	}
	.day-head {
		display: flex;
		gap: 0.5rem;
		align-items: baseline;
		font-size: 0.9rem;
	}
	.day.past .day-head {
		color: var(--ink-2);
	}
	.now {
		font-size: 0.7rem;
		background: var(--accent);
		color: #fff;
		border-radius: 4px;
		padding: 0 5px;
	}
	.rest {
		margin: 0;
		padding-left: 0.6rem;
	}
	.unplanned {
		margin: 0;
		padding-left: 0.6rem;
	}
	.inline {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		align-items: center;
		margin: 0.25rem 0;
	}
	.season {
		display: grid;
		gap: 2px;
		font-size: 0.8rem;
	}
	.srow {
		display: grid;
		grid-template-columns: 1.6rem 3.6rem 4.4rem 1fr 5.5rem 4rem;
		gap: 0.5rem;
		align-items: center;
		color: var(--ink);
		text-decoration: none;
		padding: 2px 4px;
		border-radius: 4px;
		font-variant-numeric: tabular-nums;
	}
	.srow:hover,
	.srow.current {
		background: var(--page);
	}
	.sp i {
		display: inline-block;
		width: 8px;
		height: 8px;
		border-radius: 2px;
		margin-right: 4px;
	}
	.sbar {
		position: relative;
		height: 10px;
	}
	.sbar .planned,
	.sbar .actual {
		position: absolute;
		left: 0;
		top: 0;
		bottom: 0;
		border-radius: 0 3px 3px 0;
	}
	.sbar .planned {
		background: var(--series-1-wash);
		outline: 1px solid var(--series-1);
		outline-offset: -1px;
	}
	.sbar .actual {
		background: var(--series-1);
		top: 2px;
		bottom: 2px;
	}
	.skm {
		text-align: right;
	}
	@media (max-width: 560px) {
		.srow {
			grid-template-columns: 1.4rem 3.4rem 1fr 4.8rem;
		}
		.sp,
		.slong {
			display: none;
		}
	}
</style>
