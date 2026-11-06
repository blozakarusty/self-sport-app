<script lang="ts">
	import type { Snippet } from 'svelte';
	import { duration } from '#lib/format.ts';

	// Shape produced by getWeek() in src/lib/server/plan.ts
	interface ResolvedStep {
		label: string;
		pace: string | null;
		reps?: number;
		children?: ResolvedStep[];
	}
	interface Session {
		id: number;
		kind: string;
		type: string;
		title: string;
		optional: boolean;
		key: boolean;
		skipped: boolean;
		moved: boolean;
		status: 'done' | 'skipped' | 'missed' | 'planned' | 'today';
		activity: { id: string; name: string; km: number; movingTime: number } | null;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		details: any;
	}

	let { s, open = false, actions }: { s: Session; open?: boolean; actions?: Snippet } = $props();

	const STATUS = {
		done: { label: 'Done', icon: '✓', cls: 'good' },
		missed: { label: 'Missed', icon: '!', cls: 'warning' },
		skipped: { label: 'Skipped', icon: '–', cls: 'neutral' },
		today: { label: 'Today', icon: '●', cls: 'accent' },
		planned: null
	} as const;

	let st = $derived(STATUS[s.status]);
	let showTip = $state<string | null>(null);
</script>

{#snippet steps(list: ResolvedStep[])}
	<ul class="steps">
		{#each list as step, i (i)}
			<li>
				{#if step.children}
					<span class="secondary">{step.label}</span>
					{@render steps(step.children)}
				{:else}
					{step.label}{#if step.pace}{' · '}<span class="pace">{step.pace}</span>{/if}
				{/if}
			</li>
		{/each}
	</ul>
{/snippet}

<details
	class="session {s.kind}"
	class:optional={s.optional}
	class:muted-card={s.skipped || (s.optional && s.status === 'missed')}
	{open}
>
	<summary>
		<span class="title">
			{s.title}
			{#if s.key}<span class="tag key">key</span>{/if}
			{#if s.optional}<span class="tag">optional</span>{/if}
			{#if s.moved}<span class="tag">moved</span>{/if}
		</span>
		{#if st && !(s.optional && s.status === 'missed')}
			<span class="status {st.cls}"><b>{st.icon}</b> {st.label}</span>
		{/if}
	</summary>

	<div class="body">
		{#if s.activity}
			<p class="small">
				<a href="/activities/{encodeURIComponent(s.activity.id)}">{s.activity.name}</a>
				<span class="muted"
					>· {s.activity.km > 0 ? `${s.activity.km.toFixed(1)} km · ` : ''}{duration(
						s.activity.movingTime
					)}</span
				>
			</p>
		{/if}

		{#if s.details.kind === 'run'}
			<p class="small secondary">{s.details.purpose}</p>
			{@render steps(s.details.resolved)}
			<p class="small muted">
				≈ {s.details.km} km{#if s.details.progression}
					· {s.details.progression}{/if}
			</p>
		{:else if s.details.kind === 'strength'}
			{#if s.details.test?.length}
				<p class="small test">
					Test day: do the benchmark tests first (fresh), log them on Strength, then a lighter
					version of this session.
				</p>
			{/if}
			<div class="focus">
				{#each s.details.focusInfo as f (f.key)}
					<button
						type="button"
						class="focus-tag {f.key}"
						aria-expanded={showTip === f.key}
						onclick={() => (showTip = showTip === f.key ? null : f.key)}
					>
						{f.label} ⓘ
					</button>
				{/each}
				<span class="small muted">~{s.details.minutes} min</span>
			</div>
			{#if showTip}
				{@const f = s.details.focusInfo.find((x: { key: string }) => x.key === showTip)}
				<p class="small tip">{f.label}: {f.tip}</p>
			{/if}
			<table class="exercises">
				<tbody>
					{#each s.details.exercises as e (e.key)}
						<tr>
							<td>
								<span title={e.cue}>{e.name}</span>
								{#if e.note}<div class="small muted">{e.note}</div>{/if}
							</td>
							<td class="num">{e.sets} × {e.reps}</td>
							<td class="num"
								>{e.kg ? `${e.kg} kg` : 'BW'}{#if e.kg && e.loadNote}<div class="small muted">
										{e.loadNote}
									</div>{/if}</td
							>
							<td
								><span class="focus-dot {e.focus}" title="{e.focusLabel}: {e.focusTip}"
									>{e.focusLabel}</span
								></td
							>
						</tr>
					{/each}
				</tbody>
			</table>
			<p class="small muted">
				Go up a bell when you hit the top of the rep range in every set. Hover an exercise for a
				cue.
			</p>
		{:else if s.details.kind === 'gtg'}
			<p class="small">{s.details.note}</p>
			<p class="small muted">
				Grease the groove: frequent easy sets train the movement without tiring you, so your max
				climbs.
			</p>
		{:else if s.details.kind === 'leisure'}
			<p class="small muted">{s.details.note}</p>
		{/if}

		{#if actions}<div class="actions">{@render actions()}</div>{/if}
	</div>
</details>

<style>
	.session {
		border: 1px solid var(--border);
		border-left: 3px solid var(--border);
		border-radius: 0 8px 8px 0;
		padding: 0.4rem 0.6rem;
		background: var(--surface);
	}
	.session.run {
		border-left-color: var(--series-1);
	}
	.session.strength {
		border-left-color: var(--series-3);
	}
	.session.gtg {
		border-left-color: var(--series-2);
	}
	.session.leisure {
		border-left-color: var(--axis);
	}
	.muted-card {
		opacity: 0.6;
	}
	summary {
		display: flex;
		justify-content: space-between;
		gap: 0.5rem;
		cursor: pointer;
		list-style: none;
		align-items: baseline;
	}
	summary::-webkit-details-marker {
		display: none;
	}
	.title {
		font-weight: 500;
		font-size: 0.9rem;
	}
	.session.gtg .title,
	.session.leisure .title {
		font-weight: 400;
		color: var(--ink-2);
	}
	.tag {
		font-size: 0.65rem;
		border: 1px solid var(--border);
		border-radius: 4px;
		padding: 0 4px;
		color: var(--ink-2);
		font-weight: 400;
		vertical-align: 1px;
	}
	.tag.key {
		border-color: var(--accent);
		color: var(--accent);
	}
	.status {
		font-size: 0.75rem;
		white-space: nowrap;
		color: var(--ink-2);
	}
	.status b {
		display: inline-grid;
		place-items: center;
		width: 14px;
		height: 14px;
		border-radius: 7px;
		font-size: 9px;
		color: #0b0b0b;
		background: var(--grid);
	}
	.status.good b {
		background: var(--good);
	}
	.status.warning b {
		background: var(--warning);
	}
	.status.accent b {
		background: var(--accent);
		color: #fff;
	}
	.body {
		margin-top: 0.4rem;
	}
	.body p {
		margin: 0.25rem 0;
	}
	.steps {
		margin: 0.25rem 0;
		padding-left: 1.1rem;
		font-size: 0.85rem;
	}
	.steps .steps {
		margin: 0;
	}
	.pace {
		color: var(--ink);
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}
	.focus {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
		align-items: center;
	}
	.focus-tag {
		font-size: 0.75rem;
		padding: 0.05rem 0.45rem;
		border-radius: 10px;
	}
	.tip {
		background: var(--page);
		border-radius: 6px;
		padding: 0.35rem 0.5rem;
	}
	.test {
		color: var(--ink);
		background: var(--series-1-wash);
		border-radius: 6px;
		padding: 0.35rem 0.5rem;
	}
	.exercises td {
		font-size: 0.85rem;
		padding: 0.3rem 0.35rem;
		white-space: normal;
		vertical-align: top;
	}
	.exercises td:first-child {
		min-width: 9rem;
	}
	.focus-dot {
		font-size: 0.7rem;
		color: var(--ink-2);
		white-space: nowrap;
		cursor: help;
		border-bottom: 1px dotted var(--muted);
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin-top: 0.5rem;
		align-items: center;
	}
</style>
