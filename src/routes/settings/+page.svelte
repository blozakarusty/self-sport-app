<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<h1>Settings</h1>

<section class="card">
	<h2>Heart rate</h2>
	<p class="small secondary">
		Used to compute training load (TRIMP). Leave empty to use defaults: max HR = highest recorded in
		the last year, rest HR = 55.
	</p>
	<form method="POST" use:enhance>
		<label>
			Max HR
			<input
				name="maxHr"
				type="number"
				inputmode="numeric"
				value={data.maxHr ?? ''}
				placeholder={String(data.hr?.maxHr ?? '')}
			/>
		</label>
		<label>
			Rest HR
			<input
				name="restHr"
				type="number"
				inputmode="numeric"
				value={data.restHr ?? ''}
				placeholder={String(data.hr?.restHr ?? 55)}
			/>
		</label>
		<button>Save</button>
	</form>
	{#if form?.error}<p class="small error">{form.error}</p>{/if}
	{#if form?.saved}<p class="small secondary">Saved.</p>{/if}

	{#if data.hrZones?.length}
		<h3 class="small">Strava HR zones</h3>
		<table>
			<thead><tr><th>Zone</th><th class="num">From</th><th class="num">To</th></tr></thead>
			<tbody>
				{#each data.hrZones as z, i (i)}
					<tr
						><td>Z{i + 1}</td><td class="num">{z.min}</td><td class="num"
							>{z.max > 0 ? z.max : '–'}</td
						></tr
					>
				{/each}
			</tbody>
		</table>
	{/if}
</section>

<section class="card">
	<h2>Profile (from Strava)</h2>
	<p class="small secondary">
		Weight: {data.weightKg ? `${data.weightKg} kg` : 'not set'} · Units: {data.units}
	</p>
</section>

<style>
	h1 {
		font-size: 1.4rem;
	}
	section {
		margin-bottom: 1rem;
	}
	form {
		display: flex;
		gap: 0.75rem;
		align-items: flex-end;
		flex-wrap: wrap;
	}
	label {
		display: grid;
		gap: 0.2rem;
		font-size: 0.85rem;
		color: var(--ink-2);
	}
	input {
		width: 7rem;
	}
	h3 {
		margin-top: 1rem;
	}
	table {
		max-width: 280px;
	}
	.error {
		color: var(--critical);
	}
</style>
