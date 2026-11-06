<script lang="ts">
	import { enhance } from '$app/forms';
	import ProgressBar from '#lib/components/ProgressBar.svelte';
	import StackedColumnChart from '#lib/components/StackedColumnChart.svelte';
	import { dayLabel, duration, shortDay, timeOfDay } from '#lib/format.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const SPLITS = [
		{ key: 'push', label: 'Push', color: 'var(--series-1)' },
		{ key: 'pull', label: 'Pull', color: 'var(--series-2)' },
		{ key: 'legs', label: 'Legs', color: 'var(--series-3)' },
		{ key: 'full', label: 'Full body', color: 'var(--series-4)' }
	];
	const CATEGORIES = [
		{ key: 'pull', label: 'Pull' },
		{ key: 'push', label: 'Push' },
		{ key: 'legs', label: 'Legs' },
		{ key: 'core', label: 'Core' },
		{ key: 'body', label: 'Body' }
	] as const;

	let thisWeek = $derived(data.weeks.at(-1)!);
	let doneThisWeek = $derived(
		thisWeek.push + thisWeek.pull + thisWeek.legs + thisWeek.full + thisWeek.untagged
	);
	let untagged = $derived(data.sessions.filter((s) => !s.strengthSplit).length);

	const fmt = (v: number | null, unit: string) => {
		if (v == null) return '–';
		if (unit === 's' && v >= 60)
			return `${Math.floor(v / 60)}:${String(Math.round(v % 60)).padStart(2, '0')}`;
		return `${Number.isInteger(v) ? v : v.toFixed(1)}${unit === 'reps' ? '' : ` ${unit}`}`;
	};
	const unitLabel = (unit: string) => (unit === 's' ? 'seconds (or m:ss)' : unit);
	const trendText = (b: { trendPerWeek: number | null; unit: string; better: string }) => {
		if (b.trendPerWeek == null || Math.abs(b.trendPerWeek) < 0.01) return null;
		const good = b.better === 'higher' ? b.trendPerWeek > 0 : b.trendPerWeek < 0;
		const v = Math.abs(b.trendPerWeek);
		return `${b.trendPerWeek > 0 ? '+' : '−'}${v < 1 ? v.toFixed(2) : v.toFixed(1)} ${b.unit}/week${good ? '' : ' (wrong way)'}`;
	};

	let today = $derived(data.today);

	/** Keep the form's values after saving (they come back from the server). */
	const keep =
		() =>
		async ({ update }: { update: (o?: { reset?: boolean }) => Promise<void> }) =>
			update({ reset: false });
</script>

<h1>Strength</h1>

<section class="card week">
	<div>
		<h2>This week</h2>
		<p class="small secondary">
			{doneThisWeek} of {data.recommendedPerWeek} sessions
			{#if data.phase}({data.phase.label} phase: {data.phase.strengthPerWeek}× per week){:else}(3×
				per week until you set a race goal){/if}
		</p>
		<div class="ticks">
			{#each ['push', 'pull', 'legs'] as k (k)}
				{@const n = thisWeek[k as 'push' | 'pull' | 'legs']}
				<span class="tick" class:done={n > 0}
					>{n > 0 ? '✓' : '○'} {k[0].toUpperCase() + k.slice(1)}</span
				>
			{/each}
		</div>
	</div>
	{#if data.nextTestWeek}
		<p class="small next-test">
			Next benchmark test: <strong>week of {shortDay(data.nextTestWeek)}</strong>
			<span class="muted">(end of a training phase)</span>
		</p>
	{/if}
</section>

<section class="card">
	<h2>Sessions per week</h2>
	<StackedColumnChart
		series={SPLITS}
		items={data.weeks.map((w) => ({
			key: w.week,
			label: shortDay(w.week),
			heading: `Week of ${shortDay(w.week)}`,
			values: { push: w.push, pull: w.pull, legs: w.legs, full: w.full }
		}))}
		label="Strength sessions per week by type, last 12 weeks"
		minMax={4}
		format={(v) => String(Math.round(v))}
	/>
	{#if untagged}<p class="small muted">
			{untagged} untagged sessions aren't in this chart; tag them below.
		</p>{/if}
</section>

<section class="card">
	<h2>Benchmarks</h2>
	<p class="small muted">
		Test these every 4–6 weeks (the end of each phase works well) and log the result. The bar runs
		from your first result to the target.
	</p>
	{#if form?.error}<p class="small error">{form.error}</p>{/if}

	{#each CATEGORIES as cat (cat.key)}
		{@const items = data.benchmarks.filter((b) => b.category === cat.key)}
		{#if items.length}
			<h3 class="cat">{cat.label}</h3>
			<div class="benchmarks">
				{#each items as b (b.id)}
					<div class="bm">
						<div class="bm-head">
							<strong>{b.name}</strong>
							<span>
								<strong>{fmt(b.latest, b.unit)}</strong>
								<span class="muted">{b.target != null ? `/ ${fmt(b.target, b.unit)}` : ''}</span>
							</span>
						</div>
						{#if b.baseline != null && b.target != null}
							<ProgressBar
								min={b.baseline}
								max={b.target}
								value={b.latest}
								invert={b.better === 'lower'}
								label="{b.name}: {fmt(b.latest, b.unit)} toward {fmt(b.target, b.unit)}"
							/>
						{/if}
						<div class="small muted">
							{#if b.lastTested}
								Last tested {dayLabel(b.lastTested)}{#if b.baseline != null && b.results.length > 1}
									· started at {fmt(b.baseline, b.unit)}{/if}{#if trendText(b)}
									· {trendText(b)}{/if}
							{:else}
								Not tested yet.
							{/if}
							{#if b.key === 'body-weight' && !b.results.length && data.stravaWeightKg}
								Strava profile says {data.stravaWeightKg} kg.
							{/if}
						</div>
						<form method="POST" action="?/addResult" use:enhance class="inline">
							<input type="hidden" name="benchmarkId" value={b.id} />
							<input type="date" name="date" value={today} max={today} aria-label="Date" />
							<input
								name="value"
								inputmode="decimal"
								placeholder={unitLabel(b.unit)}
								aria-label="{b.name} result in {unitLabel(b.unit)}"
								required
							/>
							<button class="small">Log</button>
						</form>
						<details>
							<summary>How to test · target · history</summary>
							{#if b.how}<p class="small secondary">{b.how}</p>{/if}
							<form method="POST" action="?/setTarget" use:enhance={keep} class="inline">
								<input type="hidden" name="benchmarkId" value={b.id} />
								<label class="small secondary"
									>Target <input
										name="target"
										inputmode="decimal"
										value={b.target ?? ''}
										placeholder={unitLabel(b.unit)}
									/></label
								>
								<button class="small">Save target</button>
							</form>
							{#if b.results.length}
								<table>
									<tbody>
										{#each b.results.toReversed() as r (r.id)}
											<tr>
												<td>{dayLabel(r.date)} {r.date.slice(0, 4)}</td>
												<td class="num">{fmt(r.value, b.unit)}</td>
												<td class="num">
													<form method="POST" action="?/deleteResult" use:enhance>
														<input type="hidden" name="benchmarkId" value={b.id} />
														<input type="hidden" name="resultId" value={r.id} />
														<button class="small link" aria-label="Delete result from {r.date}"
															>Delete</button
														>
													</form>
												</td>
											</tr>
										{/each}
									</tbody>
								</table>
							{/if}
							<form method="POST" action="?/removeBenchmark" use:enhance>
								<input type="hidden" name="benchmarkId" value={b.id} />
								<button class="small link danger">Remove benchmark</button>
							</form>
						</details>
					</div>
				{/each}
			</div>
		{/if}
	{/each}

	{#if data.library.length}
		<form method="POST" action="?/addBenchmark" use:enhance class="inline add">
			<select name="key" aria-label="Benchmark to add">
				{#each data.library as l (l.key)}<option value={l.key}>{l.name} ({l.category})</option
					>{/each}
			</select>
			<button class="small">Add benchmark</button>
		</form>
	{/if}
</section>

<section class="card">
	<h2>Working weights</h2>
	<p class="small muted">
		The bell you use for each exercise; the plan uses these. Go up one bell when you hit the top of
		the rep range in every set. Saving rebuilds your upcoming sessions.
	</p>
	<form method="POST" action="?/weights" use:enhance={keep} class="weights">
		{#each data.workingWeights as w (w.key)}
			<label class="small">
				<span
					>{w.name}{#if w.loadNote}
						<span class="muted">({w.loadNote})</span>{/if}</span
				>
				<select name={w.key} value={w.kg}>
					{#each data.bells as b (b)}<option value={b}>{b} kg</option>{/each}
				</select>
			</label>
		{/each}
		<div>
			<button class="small">Save weights</button>{#if form?.weightsSaved}
				<span class="small secondary">Saved; plan updated.</span>{/if}
		</div>
	</form>
</section>

<section class="card">
	<h2>Sessions</h2>
	<p class="small muted">
		Your strength sessions from Strava, last 12 weeks. Tag each as push, pull or legs and rate the
		effort (1 = very easy, 10 = max); the effort turns into training load, which heart rate badly
		underestimates for lifting.
	</p>
	{#if data.sessions.length}
		<div class="sessions">
			{#each data.sessions as s (s.id)}
				<form method="POST" action="?/tag" use:enhance={keep} class="session">
					<input type="hidden" name="id" value={s.id} />
					<div class="s-info">
						<a href="/activities/{encodeURIComponent(s.id)}">{dayLabel(s.startDateLocal)}</a>
						<span class="small muted"
							>{timeOfDay(s.startDateLocal)} · {duration(s.movingTime)} · load {Math.round(
								s.load
							)}{s.method === 'srpe' ? '' : '*'}</span
						>
					</div>
					<select name="split" aria-label="Session type" value={s.strengthSplit ?? ''}>
						<option value="">Type…</option>
						{#each SPLITS as sp (sp.key)}<option value={sp.key}>{sp.label}</option>{/each}
					</select>
					<select name="rpe" aria-label="Effort 1 to 10" value={s.rpe ?? ''}>
						<option value="">Effort…</option>
						{#each Array.from({ length: 10 }, (_, i) => i + 1) as n (n)}<option value={n}
								>{n}</option
							>{/each}
					</select>
					<button class="small">{form?.tagged === s.id ? 'Saved' : 'Save'}</button>
				</form>
			{/each}
		</div>
		<p class="small muted">* load from heart rate; rate the effort for a truer number.</p>
	{:else}
		<p class="small muted">No strength sessions on Strava in the last 12 weeks.</p>
	{/if}
</section>

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
	.week {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
		align-items: flex-end;
	}
	.ticks {
		display: flex;
		gap: 0.5rem;
		margin-top: 0.4rem;
	}
	.tick {
		border: 1px solid var(--border);
		border-radius: 6px;
		padding: 0.15rem 0.6rem;
		font-size: 0.9rem;
		color: var(--ink-2);
	}
	.tick.done {
		color: var(--ink);
		border-color: var(--good);
	}
	.cat {
		font-size: 0.85rem;
		color: var(--ink-2);
		margin: 1rem 0 0.4rem;
	}
	.benchmarks {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
		gap: 0.75rem;
	}
	.bm {
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 0.6rem 0.75rem;
		display: grid;
		gap: 0.3rem;
		align-content: start;
	}
	.bm-head {
		display: flex;
		justify-content: space-between;
		gap: 0.5rem;
	}
	.inline {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		align-items: center;
		margin: 0.25rem 0;
	}
	.inline input[name='value'],
	.inline input[name='target'] {
		width: 8rem;
	}
	.inline input[type='date'] {
		width: 9.5rem;
	}
	.add {
		margin-top: 1rem;
	}
	button.link {
		border: none;
		background: none;
		padding: 0;
		color: var(--accent);
	}
	button.danger {
		color: var(--critical);
		margin-top: 0.4rem;
	}
	.sessions {
		display: grid;
		gap: 0.4rem;
	}
	.session {
		display: grid;
		grid-template-columns: minmax(140px, 1fr) auto auto auto;
		gap: 0.4rem;
		align-items: center;
		border-bottom: 1px solid var(--grid);
		padding-bottom: 0.4rem;
	}
	.s-info {
		display: grid;
	}
	.s-info a {
		color: var(--ink);
		font-weight: 500;
	}
	@media (max-width: 520px) {
		.session {
			grid-template-columns: 1fr 1fr auto;
		}
		.s-info {
			grid-column: 1 / -1;
		}
	}
	.weights {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
		gap: 0.5rem 1rem;
		align-items: end;
	}
	.weights label {
		display: flex;
		justify-content: space-between;
		gap: 0.5rem;
		align-items: center;
	}
	.error {
		color: var(--critical);
	}
</style>
