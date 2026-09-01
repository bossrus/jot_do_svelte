<script lang="ts">
	import type { FriendGroup } from '$lib/friends/contracts';
	import { m } from '$lib/paraglide/messages';
	import { localeVersion } from '$lib/client/locale';
	$localeVersion;
	let {
		groups,
		selected,
		onchange,
		legend = m.add_to_groups()
	}: {
		groups: FriendGroup[];
		selected: string[];
		onchange: (ids: string[]) => void;
		legend?: string;
	} = $props();
	function toggle(id: string) {
		onchange(selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id]);
	}
</script>

{#if groups.length}
	<fieldset>
		<legend>{legend}</legend>
		<div>
			{#each groups as group (group.id)}<label
					><input
						type="checkbox"
						checked={selected.includes(group.id)}
						onchange={() => toggle(group.id)}
					/>{group.name}</label
				>{/each}
		</div>
	</fieldset>
{/if}

<style>
	fieldset {
		margin: 0.35rem 0 0;
		border: 0;
		padding: 0;
	}
	legend {
		color: #59665d;
		font-size: 0.76rem;
		font-weight: 650;
	}
	div {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem 0.7rem;
		margin-top: 0.35rem;
	}
	label {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		color: #465149;
		font-size: 0.78rem;
		font-weight: 500;
	}
	input {
		margin: 0;
		accent-color: #326a4b;
	}
</style>
