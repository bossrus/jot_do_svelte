<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { m } from '$lib/paraglide/messages';
	import { localeVersion } from '$lib/client/locale';
	import Stack from '$lib/components/primitives/Stack.svelte';
	import Surface from '$lib/components/primitives/Surface.svelte';
	$localeVersion;
	onMount(() => {
		void goto(resolve('/app'), { replaceState: true });
	});
</script>

<svelte:head>
	<title>{m.seo_title()}</title>
	<meta name="description" content={m.seo_description()} />
	<meta name="robots" content="index, follow" />
	<link rel="canonical" href={`${page.url.origin}/about`} />
	<link rel="alternate" hreflang="en" href={`${page.url.origin}/about`} /><link
		rel="alternate"
		hreflang="ru"
		href={`${page.url.origin}/ru/about`}
	/><link rel="alternate" hreflang="es" href={`${page.url.origin}/es/about`} /><link
		rel="alternate"
		hreflang="x-default"
		href={`${page.url.origin}/about`}
	/>
</svelte:head>
<main class="root-loader">
	<Stack align="center" gap="var(--space-3)">
		<Surface padding="0" elevated>
			<a href={resolve('/about')} aria-label={m.root_loading_hint()}
				><span class="spinner" aria-hidden="true"></span><strong>Jot<em>DO</em></strong><small
					>{m.loading_app()}</small
				><u>{m.root_loading_hint()}</u></a
			>
		</Surface>
		<nav aria-label={m.about_languages()}>
			<a href={resolve('/about')}>English</a><a href={resolve('/ru/about')}>Русский</a><a
				href={resolve('/es/about')}>Español</a
			>
		</nav>
	</Stack>
</main>

<style>
	.root-loader {
		position: fixed;
		inset: 0;
		display: grid;
		place-content: center;
		justify-items: center;
		background: var(--color-bg);
		font-family: Inter, ui-sans-serif, system-ui, sans-serif;
	}
	.root-loader :global(.surface > a) {
		display: grid;
		justify-items: center;
		gap: var(--space-2);
		border-radius: var(--radius-lg);
		padding: var(--space-6);
		color: var(--color-text);
		text-decoration: none;
	}
	.spinner {
		width: 2.4rem;
		height: 2.4rem;
		border: 0.22rem solid var(--color-border);
		border-top-color: var(--color-accent);
		border-radius: 50%;
		animation: spin 0.75s linear infinite;
	}
	.root-loader strong {
		font-size: 1.65rem;
		letter-spacing: -0.06em;
	}
	.root-loader em {
		color: var(--color-accent);
		font-style: normal;
	}
	.root-loader small {
		color: var(--color-text-muted);
	}
	.root-loader u {
		color: var(--color-accent);
		font-size: var(--text-sm);
		text-underline-offset: 0.2rem;
	}
	nav {
		display: flex;
		gap: var(--space-3);
	}
	nav a {
		color: var(--color-text-muted);
		font-size: 0.75rem;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
