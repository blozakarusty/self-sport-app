<script lang="ts">
	import { enhance } from '$app/forms';
	import GoalPathChart from '#lib/components/GoalPathChart.svelte';
	import PhaseTimeline from '#lib/components/PhaseTimeline.svelte';
	import ProgressBar from '#lib/components/ProgressBar.svelte';
	import { dayLabel, paceStr, raceTime, shortDay } from '#lib/format.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let v = $derived(data.view);
	let editing = $state(false);

	const KINDS = [
		{ value: '5k', label: '5K', distance: 5000 },
		{ value: '10k', label: '10K', distance: 10000 },
		{ value: 'half', label: 'Half marathon', distance: 21097.5 },
		{ value: 'marathon', label: 'Marathon', distance: 42195 },
		{ value: 'custom', label: 'Other distance', distance: 0 }
	];
	let initialKind = $derived(
		v ? (KINDS.find((k) => k.distance === v.goal.distance)?.value ?? 'custom') : 'marathon'
	);
	let kind = $state('marathon');
	$effect(() => {
		kind = initialKind;
	});

	const STATUS = {
		ahead: { label: 'Ahead of the path', cls: 'good', icon: '↑' },
		'on-track': { label: 'On track', cls: 'good', icon: '✓' },
		behind: { label: 'Behind the path', cls: 'warning', icon: '!' }
	} as const;

	const fmtKm = (km: number) => (km >= 10 ? Math.round(km).toString() : km.toFixed(1));
	$effect(() => {
		if (form?.saved) editing = false;
	});
</script>

<h1>Goals</h1>

{#if v && !editing}
	{@const f = v.fitness}
	<section class="card">
		<div class="goal-head">
			<div>
				<p class="small secondary">
					{v.goal.name} · {(v.goal.distance / 1000).toFixed(v.goal.distance % 1000 ? 1 : 0)} km
					{#if v.goal.elevationGain}· {Math.round(v.goal.elevationGain)} m climb{/if}
					· {dayLabel(v.goal.date)}
					{v.goal.date.slice(0, 4)}
				</p>
				<p class="goal-time">
					Goal {raceTime(v.goal.targetTime)}
					<span class="secondary">{paceStr(v.goalPace)} /km</span>
				</p>
			</div>
			<div class="head-right">
				{#if f.status}
					{@const s = STATUS[f.status]}
					<span class="status {s.cls}"><b>{s.icon}</b> {s.label}</span>
				{/if}
				<span class="small secondary">
					{Math.floor(v.daysToGo / 7)} weeks {v.daysToGo % 7 ? `${v.daysToGo % 7} days` : ''} to go
					{#if v.week}· week {v.week} of {v.totalWeeks}{/if}
				</span>
			</div>
		</div>

		<div class="fitness">
			<div class="row small">
				<span class="secondary">Running fitness (VDOT)</span>
				<span>
					{#if f.current != null}<strong>{f.current.toFixed(1)}</strong>{:else}–{/if}
					<span class="muted">of {f.target.toFixed(1)} needed</span>
				</span>
			</div>
			{#if f.start != null}
				<ProgressBar
					min={Math.min(f.start, f.current ?? f.start)}
					max={f.target}
					value={f.current}
					expected={f.expected}
					label="VDOT {f.current?.toFixed(1) ?? 'unknown'} toward {f.target.toFixed(1)}"
				/>
				<div class="row small muted">
					<span>Start {f.start.toFixed(1)}</span>
					{#if f.expected != null}<span
							>Expected today {f.expected.toFixed(1)} <i class="tick-key"></i></span
						>{/if}
					<span>Target {f.target.toFixed(1)}</span>
				</div>
			{/if}
			{#if f.predicted}
				<p class="small secondary">
					At your current fitness you'd run about <strong>{raceTime(f.predicted)}</strong>; the goal
					needs
					{raceTime(f.predicted - v.goal.targetTime)} less. VDOT comes from your recent best efforts.
					If it looks low, add a recent race or time trial on
					<a href="/performance">Performance</a>.
				</p>
			{/if}
		</div>

		<GoalPathChart points={v.path} today={v.today} goalVdot={f.target} />
	</section>

	<section class="card">
		<h2>Readiness</h2>
		<p class="small muted">
			The other things a {v.goal.name.toLowerCase()} needs, against common guidelines for your goal. The
			marker shows where you'd typically be by now.
		</p>
		<div class="readiness">
			{#each v.readiness as r (r.key)}
				<div>
					<div class="row small">
						<span>{r.label}</span>
						<span
							><strong>{fmtKm(r.value)}</strong>
							<span class="muted">of {r.target} {r.unit}</span></span
						>
					</div>
					<ProgressBar
						min={0}
						max={r.target}
						value={r.value}
						expected={r.expected || null}
						label="{r.label}: {fmtKm(r.value)} of {r.target} {r.unit}"
					/>
					<div class="small muted">{r.note}</div>
				</div>
			{/each}
		</div>
	</section>

	<section class="card">
		<h2>Macro phases</h2>
		<PhaseTimeline phases={v.phases} today={v.today} raceDay={v.goal.date} />
		<div class="phases">
			{#each v.phases as p (p.name)}
				<div class="phase" class:current={v.current?.name === p.name}>
					<div class="phase-head">
						<strong>{p.label}</strong>
						{#if v.current?.name === p.name}<span class="now">now</span>{/if}
						<span class="small muted">{shortDay(p.start)} – {shortDay(p.end)} · {p.weeks} wk</span>
					</div>
					<p class="small"><span class="secondary">Run:</span> {p.run}</p>
					<p class="small">
						<span class="secondary">Strength ({p.strengthPerWeek}×/week):</span>
						{p.strength}
					</p>
					{#if p.testWeek}<p class="small muted">
							Benchmark test: week of {shortDay(p.testWeek)}
						</p>{/if}
				</div>
			{/each}
		</div>
		<p class="small muted">
			The week-by-week sessions come with the planner in the next milestone.
		</p>
	</section>

	<div class="actions">
		<button onclick={() => (editing = true)}>Edit goal</button>
		<form method="POST" action="?/end" use:enhance>
			<button class="small">End goal</button>
		</form>
	</div>
{:else}
	<section class="card">
		<h2>{v ? 'Edit goal' : 'Set a race goal'}</h2>
		<form method="POST" action="?/save" use:enhance class="goal-form">
			<label>
				Distance
				<select name="kind" bind:value={kind}>
					{#each KINDS as k (k.value)}<option value={k.value}>{k.label}</option>{/each}
				</select>
			</label>
			{#if kind === 'custom'}
				<label
					>Km <input
						name="km"
						inputmode="decimal"
						value={v ? v.goal.distance / 1000 : ''}
						required
					/></label
				>
			{/if}
			<label
				>Race date <input
					type="date"
					name="date"
					min={data.today}
					value={v?.goal.date ?? ''}
					required
				/></label
			>
			<label
				>Target time <input
					name="time"
					placeholder="3:20:00"
					value={v ? raceTime(v.goal.targetTime) : ''}
					required
				/></label
			>
			<label
				>Climb (m) <input
					name="elevation"
					inputmode="numeric"
					placeholder="0"
					value={v?.goal.elevationGain || ''}
				/></label
			>
			<label class="wide"
				>Name <input
					name="name"
					placeholder="Rotterdam Marathon"
					value={v?.goal.name ?? ''}
				/></label
			>
			<div class="buttons">
				<button>{v ? 'Save' : 'Set goal'}</button>
				{#if v}<button type="button" onclick={() => (editing = false)}>Cancel</button>{/if}
			</div>
		</form>
		{#if form?.error}<p class="small error">{form.error}</p>{/if}
		{#if !v}
			<p class="small muted">
				The app splits the time until race day into base, build, peak and taper phases, and tracks
				your fitness against what the goal needs.
			</p>
		{/if}
	</section>
{/if}

<style>
	h1 {
		font-size: 1.4rem;
	}
	section {
		margin-bottom: 1rem;
	}
	p {
		margin: 0.25rem 0;
	}
	.goal-head {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
	}
	.goal-time {
		font-size: 1.5rem;
		font-weight: 600;
		margin: 0;
	}
	.goal-time span {
		font-size: 0.95rem;
		font-weight: 400;
	}
	.head-right {
		display: grid;
		justify-items: end;
		gap: 0.25rem;
		align-content: start;
	}
	.status {
		font-size: 0.85rem;
		border-radius: 6px;
		padding: 0.15rem 0.5rem;
		border: 1px solid var(--border);
	}
	.status b {
		display: inline-grid;
		place-items: center;
		width: 16px;
		height: 16px;
		border-radius: 8px;
		font-size: 10px;
		color: #0b0b0b;
		margin-right: 2px;
	}
	.status.good b {
		background: var(--good);
	}
	.status.warning b {
		background: var(--warning);
	}
	.fitness {
		margin: 1rem 0;
	}
	.row {
		display: flex;
		justify-content: space-between;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.tick-key {
		display: inline-block;
		width: 2px;
		height: 10px;
		background: var(--ink);
		vertical-align: -1px;
		margin-left: 2px;
	}
	.readiness {
		display: grid;
		gap: 0.9rem;
		margin-top: 0.5rem;
	}
	.phases {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 0.75rem;
		margin-top: 1rem;
	}
	.phase {
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 0.6rem 0.75rem;
	}
	.phase.current {
		border-color: var(--accent);
		box-shadow: inset 0 0 0 1px var(--accent);
	}
	.phase-head {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 0.5rem;
		align-items: baseline;
	}
	.now {
		font-size: 0.7rem;
		background: var(--accent);
		color: #fff;
		border-radius: 4px;
		padding: 0 5px;
	}
	.actions {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}
	.actions form {
		margin: 0;
	}
	.goal-form {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
		align-items: flex-end;
	}
	.goal-form label {
		display: grid;
		gap: 0.2rem;
		font-size: 0.8rem;
		color: var(--ink-2);
	}
	.goal-form input {
		width: 9rem;
	}
	.goal-form .wide input {
		width: 14rem;
	}
	.buttons {
		display: flex;
		gap: 0.5rem;
	}
	.error {
		color: var(--critical);
	}
</style>
