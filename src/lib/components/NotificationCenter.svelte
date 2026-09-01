<script lang="ts">
	import { IconBell, IconChecks } from '@tabler/icons-svelte-runes';
	import { notificationsApi, notificationsState } from '$lib/client/notifications';
	import Modal from './Modal.svelte';
	import { m } from '$lib/paraglide/messages';
	import { currentLocale, localeVersion } from '$lib/client/locale';
	$localeVersion;
	let { open = $bindable(false), showTrigger = true }: { open?: boolean; showTrigger?: boolean } =
		$props();
	function text(item: (typeof $notificationsState.items)[number]) {
		const actor = item.actorName ?? m.user();
		const title = String(item.payload.todoTitle ?? m.todo_fallback());
		const group = String(item.payload.groupName ?? m.group_fallback());
		const texts: Record<string, string> = {
			'friend.requested': m.notification_friend_requested({ actor }),
			'friend.accepted': m.notification_friend_accepted({ actor }),
			'friend.rejected': m.notification_friend_rejected({ actor }),
			'todo.access-granted': m.notification_access_granted({ actor, title }),
			'todo.access-revoked': m.notification_access_revoked({ actor, title }),
			'group.added': m.notification_group_added({ actor, group }),
			'group.removed': m.notification_group_removed({ actor, group }),
			'worker.assigned': m.notification_worker_assigned({ actor, title }),
			'worker.removed': m.notification_worker_removed({ actor, title }),
			'worker.started': m.notification_worker_started({ actor, title }),
			'worker.completed': m.notification_worker_completed({ actor, title }),
			'worker.left': m.notification_worker_left({ actor, title })
		};
		return texts[item.type] ?? m.notification_changed();
	}
	async function activate(item: (typeof $notificationsState.items)[number]) {
		if (!item.readAt) await notificationsApi.markRead([item.id]);
		if (item.todoId)
			window.dispatchEvent(new CustomEvent('notification.open-todo', { detail: item.todoId }));
		else if (item.friendRequestId)
			window.dispatchEvent(new CustomEvent('notification.open-friends'));
		open = false;
	}
</script>

<div class="center">
	{#if showTrigger}<button
			class="bell"
			type="button"
			aria-label={m.notifications()}
			aria-expanded={open}
			onclick={() => (open = !open)}><IconBell size={20} /></button
		>
		{#if $notificationsState.unreadCount}<span class="badge">{$notificationsState.unreadCount}</span
			>{/if}{/if}
	{#if open}<Modal
			title={m.notifications()}
			onclose={() => (open = false)}
			width="36rem"
			maxHeight="min(42rem, calc(100dvh - 2rem))"
		>
			<div class="notifications">
				{#if $notificationsState.unreadCount}<div class="read-toolbar">
						<button type="button" onclick={() => void notificationsApi.markRead()}
							><IconChecks size={18} />{m.mark_all_read()}</button
						>
					</div>{/if}
				{#if !$notificationsState.items.length}<p>{m.no_notifications()}</p>{:else}<ul>
						{#each $notificationsState.items as item (item.id)}<li class:unread={!item.readAt}>
								<button type="button" onclick={() => void activate(item)}
									><span>{text(item)}</span><small
										>{new Date(item.createdAt).toLocaleString(currentLocale())}</small
									></button
								>
							</li>{/each}
					</ul>{/if}
			</div>
		</Modal>{/if}
</div>

<style>
	.center {
		position: relative;
	}
	.bell {
		display: grid;
		place-items: center;
		width: 2.1rem;
		height: 2.1rem;
		border: 0;
		border-radius: 0.45rem;
		background: transparent;
		cursor: pointer;
	}
	.badge {
		position: absolute;
		right: -0.2rem;
		top: -0.3rem;
		min-width: 1.1rem;
		height: 1.1rem;
		display: grid;
		place-items: center;
		border: 2px solid #f6f7f4;
		border-radius: 999px;
		background: #b42318;
		color: #fff;
		font-size: 0.62rem;
		font-weight: 800;
		padding: 0 0.2rem;
	}
	.notifications {
		min-height: 8rem;
	}
	.read-toolbar {
		display: flex;
		justify-content: flex-end;
		border-bottom: 1px solid #edf0ed;
		padding: 0.65rem 0.8rem;
	}
	.read-toolbar button {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		border: 0;
		background: transparent;
		color: var(--color-accent);
		cursor: pointer;
	}
	ul {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	li {
		border-bottom: 1px solid #edf0ed;
	}
	li:last-child {
		border-bottom: 0;
	}
	li.unread {
		background: #f0f7f2;
	}
	li button {
		display: grid;
		width: 100%;
		gap: 0.25rem;
		border: 0;
		background: transparent;
		padding: 0.9rem 1rem;
		text-align: left;
		cursor: pointer;
	}
	small,
	p {
		color: #758078;
		font-size: 0.72rem;
	}
	p {
		padding: 1.5rem;
		text-align: center;
	}
</style>
