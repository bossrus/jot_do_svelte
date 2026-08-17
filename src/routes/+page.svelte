<script lang="ts">
	import { resolve } from '$app/paths';
</script>

<svelte:head>
	<title>Quick Todo</title>
	<meta
		name="description"
		content="Quick Todo is a local-first app for capturing tasks without friction."
	/>
</svelte:head>

<main>
	<h1>Quick Todo</h1>
	<p>A local-first todo app built for speed.</p>
	<a href={resolve('/app')}>Open app</a>
</main>
