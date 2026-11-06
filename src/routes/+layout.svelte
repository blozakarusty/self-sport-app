<script lang="ts">
	import '../app.css';
	import favicon from '#lib/assets/favicon.svg';
	import { page } from '$app/state';
	import type { LayoutProps } from './$types';

	let { children, data }: LayoutProps = $props();

	const nav = [
		{ href: '/', label: 'Today' },
		{ href: '/activities', label: 'Activities' },
		{ href: '/settings', label: 'Settings' }
	];
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	<title>Self-Sport</title>
</svelte:head>

<header>
	<a class="brand" href="/">Self-Sport</a>
	{#if data.athlete}
		<nav>
			{#each nav as item (item.href)}
				<a href={item.href} aria-current={page.url.pathname === item.href ? 'page' : undefined}
					>{item.label}</a
				>
			{/each}
		</nav>
		<form method="POST" action="/auth/logout">
			<button class="small">Log out</button>
		</form>
	{/if}
</header>

<main>
	{@render children()}
</main>

<style>
	header {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0.75rem 1rem;
		border-bottom: 1px solid var(--border);
		background: var(--surface);
		flex-wrap: wrap;
	}
	.brand {
		font-weight: 700;
		color: var(--ink);
		text-decoration: none;
	}
	nav {
		display: flex;
		gap: 0.25rem;
		flex: 1;
	}
	nav a {
		color: var(--ink-2);
		text-decoration: none;
		padding: 0.3rem 0.6rem;
		border-radius: 6px;
	}
	nav a[aria-current='page'] {
		color: var(--ink);
		background: var(--page);
		font-weight: 600;
	}
	form {
		margin: 0;
	}
	main {
		max-width: 960px;
		margin: 0 auto;
		padding: 1rem;
	}
</style>
