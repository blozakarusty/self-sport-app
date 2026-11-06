<script lang="ts">
	/**
	 * A meter from `min` to `max` with the current value filled and an optional
	 * "expected by now" marker. Works for lower-is-better values via `invert`.
	 */
	let {
		min,
		max,
		value,
		expected = null,
		label,
		invert = false
	}: {
		min: number;
		max: number;
		value: number | null;
		expected?: number | null;
		label: string;
		invert?: boolean;
	} = $props();

	const share = (v: number) => {
		if (max === min) return v >= max ? 100 : 0;
		const t = invert ? (min - v) / (min - max) : (v - min) / (max - min);
		return Math.min(Math.max(t, 0), 1) * 100;
	};
</script>

<div
	class="meter"
	role="meter"
	aria-label={label}
	aria-valuemin={Math.min(min, max)}
	aria-valuemax={Math.max(min, max)}
	aria-valuenow={value ?? undefined}
>
	{#if value != null}<div class="fill" style:width="{Math.max(share(value), 1.5)}%"></div>{/if}
	{#if expected != null}<div
			class="expected"
			style:left="{share(expected)}%"
			title="Expected by now"
		></div>{/if}
</div>

<style>
	.meter {
		position: relative;
		height: 10px;
		border-radius: 5px;
		background: var(--series-1-wash);
		margin: 0.3rem 0;
	}
	.fill {
		height: 100%;
		border-radius: 5px;
		background: var(--series-1);
	}
	.expected {
		position: absolute;
		top: -4px;
		bottom: -4px;
		width: 2px;
		margin-left: -1px;
		background: var(--ink);
	}
</style>
