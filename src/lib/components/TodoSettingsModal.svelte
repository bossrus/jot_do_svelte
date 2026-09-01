<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import { localeVersion } from '$lib/client/locale';
	$localeVersion;
	import type { LocalTodoWithImages, LocalTodoWorker } from '$lib/client/db/database';
	import { mutateTodoWorker } from '$lib/client/todo-workers';
	import {
		setTodoAccessResultSchema,
		todoAccessListSchema,
		type TodoAccessParticipant
	} from '$lib/todos/access-contracts';
	import type { Friend } from '$lib/friends/contracts';
	import { friendsApi } from '$lib/client/friends';
	import Modal from './Modal.svelte';
	import TodoAccessManager from './TodoAccessManager.svelte';
	import ContactMembersDropdown from './ContactMembersDropdown.svelte';
	import { session } from '$lib/client/auth';
	import { getPlanCapabilities, isUserPlan } from '$lib/billing/plans';

	let {
		todo,
		todoName,
		bulkTodos = [],
		bulkNames = [],
		onaccesssaved = () => {},
		onclose,
		onalert = () => {}
	}: {
		todo: LocalTodoWithImages;
		todoName: string;
		bulkTodos?: LocalTodoWithImages[];
		bulkNames?: string[];
		onaccesssaved?: () => void;
		onclose: () => void;
		onalert?: (type: 'success' | 'error', message: string) => void;
	} = $props();
	let targetTodos = $derived(bulkTodos.length ? bulkTodos : [todo]);
	let targetTodoIds = $derived(targetTodos.map((item) => item.id));
	let isBulk = $derived(bulkTodos.length > 0);
	let participants = $state<TodoAccessParticipant[]>([]);
	let workerContacts = $state<Friend[]>([]);
	let directAccessIds = $state<string[]>([]);
	let accessGroupIds = $state<string[]>([]);
	let workers = $state<LocalTodoWorker[]>([]);
	let workerPending = $state(false);
	let workerError = $state('');
	let emailVerified = $derived(Boolean($session.data?.user.emailVerified));
	let canShareTodo = $derived(
		isUserPlan($session.data?.user.plan) &&
			getPlanCapabilities($session.data.user.plan).canShareTodo
	);
	let workerDisabledMessage = $derived(
		!emailVerified ? m.email_required() : !canShareTodo ? m.share_worker_required() : ''
	);

	$effect(() => {
		workers = todo.workers;
	});

	$effect(() => {
		if (!emailVerified || !canShareTodo) {
			participants = [];
			workerContacts = [];
			return;
		}
		void Promise.all([
			fetch(`/api/todos/${encodeURIComponent(todo.id)}/access`).then(async (response) =>
				todoAccessListSchema.parse(await response.json())
			),
			friendsApi.list()
		])
			.then(([access, contacts]) => {
				participants = access.effectiveParticipants;
				directAccessIds = access.directParticipants.map((item) => item.userId);
				accessGroupIds = access.groupIds;
				workerContacts = contacts.friends;
			})
			.catch(() => reportWorkerError(m.workers_load_failed()));
	});

	function reportWorkerError(message: string) {
		workerError = message;
		onalert('error', message);
	}

	async function updateWorkers(ids: string[]) {
		if (workerPending) return;
		workerPending = true;
		workerError = '';
		try {
			const missingAccessIds = ids.filter(
				(id) => !participants.some((participant) => participant.userId === id)
			);
			if (missingAccessIds.length) {
				await Promise.all(
					targetTodos.map(async (target) => {
						const response = await fetch(`/api/todos/${encodeURIComponent(target.id)}/access`, {
							method: 'PUT',
							headers: { 'content-type': 'application/json' },
							body: JSON.stringify({
								userIds: [...new Set([...directAccessIds, ...missingAccessIds])],
								groupIds: accessGroupIds
							})
						});
						const body: unknown = await response.json().catch(() => null);
						if (!response.ok) throw body;
						setTodoAccessResultSchema.parse(body);
					})
				);
				directAccessIds = [...new Set([...directAccessIds, ...missingAccessIds])];
			}
			for (const target of targetTodos) {
				const targetIds = target.workers.map((worker) => worker.userId);
				for (const id of ids.filter((id) => !targetIds.includes(id)))
					await mutateTodoWorker(target.id, 'assign', id);
				for (const id of targetIds.filter((id) => !ids.includes(id)))
					await mutateTodoWorker(target.id, 'remove', id);
			}
			workers = ids.map((id) => {
				const old = workers.find((worker) => worker.userId === id);
				const contact = workerContacts.find((item) => item.userId === id);
				return (
					old ?? {
						id,
						todoId: todo.id,
						userId: id,
						name: contact?.name || contact?.email || m.worker_fallback(),
						state: 'doing',
						startedAt: Date.now(),
						finishedAt: null
					}
				);
			});
			onalert('success', m.workers_saved());
		} catch {
			reportWorkerError(m.workers_save_failed());
		} finally {
			workerPending = false;
		}
	}
</script>

<Modal
	title={isBulk ? m.todo_settings_plural() : m.todo_settings_named({ name: todoName })}
	{onclose}
	width="38rem"
>
	{#snippet header()}
		{#if isBulk}<div class="bulk-title">
				<span>{bulkNames.join(', ')}</span>
				<div class="bulk-title-tooltip" role="tooltip">
					{#each bulkNames as name, index (`${name}-${index}`)}<span>{name}</span>{/each}
				</div>
			</div>{/if}
	{/snippet}
	<div class="settings">
		<TodoAccessManager
			todoId={todo.id}
			todoIds={targetTodoIds}
			hideSharingLink={isBulk}
			onsaved={onaccesssaved}
			{onalert}
		/>
		<section aria-labelledby="worker-title">
			<h3 id="worker-title">{m.worker()}</h3>
			<div class="worker-dropdown">
				<ContactMembersDropdown
					friends={workerContacts}
					selected={workers.map((worker) => worker.userId)}
					label={workerDisabledMessage || m.friends()}
					disabled={Boolean(workerDisabledMessage)}
					showContactActions={false}
					pending={workerPending}
					onapply={updateWorkers}
					onremove={async () => {}}
					onmessage={(type, message) =>
						type === 'success' ? onalert('success', message) : reportWorkerError(message)}
				/>
			</div>
			{#if workerError}<p class="error" role="alert">{workerError}</p>{/if}
		</section>
	</div>
</Modal>

<style>
	.settings {
		max-height: min(72dvh, 44rem);
		overflow: auto;
	}

	section {
		border-top: 1px solid #dce1dc;
		padding: 1.2rem clamp(1rem, 3vw, 2rem);
	}

	h3 {
		margin: 0 0 0.85rem;
		font-size: 0.88rem;
	}

	.worker-dropdown,
	.worker-dropdown :global(.dropdown),
	.worker-dropdown :global(.trigger) {
		width: 100%;
	}

	.error {
		margin: 0.6rem 0 0;
		color: #8a2626;
		font-size: 0.8rem;
	}

	.bulk-title {
		position: relative;
		min-width: 0;
		max-width: 100%;
	}
	.bulk-title > span {
		display: block;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.bulk-title-tooltip {
		position: absolute;
		z-index: 10;
		top: calc(100% + 0.7rem);
		left: 0;
		display: none;
		min-width: 18rem;
		max-width: min(32rem, 70vw);
		gap: 0.3rem;
		border: 1px solid var(--color-border, #dce1dc);
		border-radius: 0.55rem;
		background: var(--color-surface, #fff);
		padding: 0.7rem 0.85rem;
		box-shadow: 0 10px 28px var(--color-shadow, rgb(10 15 11 / 20%));
		font-size: 0.82rem;
		font-weight: 500;
	}
	.bulk-title:hover .bulk-title-tooltip {
		display: grid;
	}
</style>
