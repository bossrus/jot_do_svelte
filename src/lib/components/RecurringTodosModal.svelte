<script lang="ts">
	import { onMount } from 'svelte';
	import { IconEdit, IconTrash } from '@tabler/icons-svelte-runes';
	import IconButton from './IconButton.svelte';
	import RecurringTodoModal from './RecurringTodoModal.svelte';
	import Modal from './Modal.svelte';
	import { m } from '$lib/paraglide/messages';
	import { currentLocale, localeVersion } from '$lib/client/locale';
	$localeVersion;

	type TemplateListItem = {
		id: string;
		enabled: boolean;
		frequency: string;
		localTime: string;
		timezone: string;
		nextRunAt: string;
		contentSnapshot: { blocks: Array<{ type: string; text?: string }> };
	};
	let { available, onclose }: { available: boolean; onclose: () => void } = $props();
	let templates = $state<TemplateListItem[]>([]),
		loading = $state(true),
		error = $state('');
	let editingId = $state<string | null>(null);

	async function load() {
		if (!available) {
			loading = false;
			return;
		}
		loading = true;
		error = '';
		const response = await fetch('/api/recurring');
		if (response.ok) templates = await response.json();
		else error = m.recurring_load_failed();
		loading = false;
	}
	onMount(load);
	function title(item: TemplateListItem) {
		return (
			item.contentSnapshot.blocks
				.find((block) => block.type === 'text' && block.text?.trim())
				?.text?.trim() || m.untitled_todo()
		);
	}
	async function remove(item: TemplateListItem) {
		if (!confirm(m.delete_recurring_confirm({ title: title(item) }))) return;
		const response = await fetch(`/api/recurring/${item.id}`, { method: 'DELETE' });
		if (response.ok) templates = templates.filter((template) => template.id !== item.id);
		else error = m.recurring_delete_failed();
	}
</script>

{#if editingId}
	<RecurringTodoModal templateId={editingId} onclose={() => (editingId = null)} onsaved={load} />
{:else}
	<Modal title={m.recurring()} {onclose} width="620px" zIndex={590}>
		{#if !available}<p class="state">{m.recurring_paid_only()}</p>
		{:else if loading}<p class="state">{m.loading()}</p>
		{:else if error}<p class="state error" role="alert">{error}</p>
		{:else if !templates.length}<p class="state">{m.no_recurring()}</p>
		{:else}<ul>
				{#each templates as item (item.id)}<li>
						<div>
							<strong>{title(item)}</strong><small
								>{item.enabled
									? m.next_run({ date: new Date(item.nextRunAt).toLocaleString(currentLocale()) })
									: m.paused()} · {item.localTime} · {item.timezone}</small
							>
						</div>
						<IconButton
							icon={IconEdit}
							label={m.edit_recurring()}
							onclick={() => (editingId = item.id)}
						/>
						<IconButton
							icon={IconTrash}
							label={m.delete_recurring()}
							onclick={() => void remove(item)}
						/>
					</li>{/each}
			</ul>{/if}
	</Modal>
{/if}

<style>
	ul {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	li {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.85rem 1.2rem;
		border-bottom: 1px solid #dce1dc;
	}
	li div {
		display: grid;
		flex: 1;
		min-width: 0;
		gap: 0.2rem;
	}
	strong {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	small {
		color: #68746b;
	}
	.state {
		margin: 0;
		padding: 1.5rem 1.2rem;
		color: #68746b;
	}
	.error {
		color: #9b2424;
	}
</style>
