<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import '../app.css';
	import { onMount } from 'svelte';
	import { initializeLocale, localeState } from '$lib/client/locale';
	import { initializeTheme } from '$lib/client/theme';

	let { children } = $props();
	$localeState;
	onMount(() => {
		document.getElementById('spa-loader')?.remove();
		initializeLocale();
		return initializeTheme();
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}
