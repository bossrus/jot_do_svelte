<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import { localeVersion } from '$lib/client/locale';
	$localeVersion;
	import { onMount } from 'svelte';
	import type { LocalTodoWithImages } from '$lib/client/db/database';
	import ContentViewer from './ContentViewer.svelte';
	import Modal from './Modal.svelte';
	import TodoContentEditor from './TodoContentEditor.svelte';
	import { messageService, type LocalMessageWithContent } from '$lib/client/db/message-service';
	import type { TodoContentBlock } from '$lib/client/content-blocks';
	import type { NewTodoImage } from '$lib/client/db/todo-service';
	import { syncMessages } from '$lib/client/sync/message-sync';

	let {
		todo,
		isShared = false,
		canEditImages = false,
		canSyncMessages = false,
		canSendMessages = false,
		currentUserId = null,
		currentUserName = '',
		onclose,
		onedit = async () => false
	}: {
		todo: LocalTodoWithImages;
		isShared?: boolean;
		canEditImages?: boolean;
		canSyncMessages?: boolean;
		canSendMessages?: boolean;
		currentUserId?: string | null;
		currentUserName?: string;
		onclose: () => void;
		onedit?: (blocks: TodoContentBlock[], images: NewTodoImage[]) => Promise<boolean>;
	} = $props();
	let dialog = $state<HTMLDivElement>();
	let sendNotice = $state('');
	let chatMessages = $state<LocalMessageWithContent[]>([]);
	let chatLoading = $state(true);

	onMount(() => {
		const previousOverflow = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		dialog?.querySelector<HTMLElement>('button')?.focus();
		return () => {
			document.body.style.overflow = previousOverflow;
		};
	});
	$effect(() => {
		if (!isShared) return;
		chatLoading = true;
		const subscription = messageService.observe(todo.id).subscribe({
			next(value) {
				chatMessages = value;
				chatLoading = false;
			},
			error() {
				chatLoading = false;
				sendNotice = m.local_history_failed();
			}
		});
		let catchUpTimer: ReturnType<typeof setInterval> | undefined;
		if (canSyncMessages && currentUserId) {
			let catchUpRunning = false;
			const catchUp = () => {
				if (catchUpRunning) return;
				catchUpRunning = true;
				void syncMessages(todo.id)
					.then(() => messageService.markRead(todo.id))
					.catch((error) => {
						console.warn('Open chat catch-up failed', error);
					})
					.finally(() => (catchUpRunning = false));
			};
			catchUp();
			catchUpTimer = setInterval(catchUp, 3_000);
		}
		void messageService.markRead(todo.id);
		return () => {
			subscription.unsubscribe();
			if (catchUpTimer) clearInterval(catchUpTimer);
		};
	});

	function keydown(event: KeyboardEvent) {
		if (event.defaultPrevented) return;
		if (event.key === 'Escape') {
			event.preventDefault();
			onclose();
			return;
		}
		if (event.key !== 'Tab' || !dialog) return;
		const focusable = [
			...dialog.querySelectorAll<HTMLElement>(
				'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
			)
		];
		if (!focusable.length) return;
		const first = focusable[0];
		const last = focusable.at(-1)!;
		if (event.shiftKey && document.activeElement === first) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault();
			first.focus();
		}
	}

	async function send(blocks: TodoContentBlock[], images: NewTodoImage[]) {
		if (!canSendMessages) {
			sendNotice = m.send_unavailable();
			return false;
		}
		const created = await messageService.create(
			todo.id,
			currentUserId,
			currentUserName || m.you(),
			blocks,
			images
		);
		sendNotice = created ? m.message_saved() : '';
		return Boolean(created);
	}
</script>

<svelte:window onkeydown={keydown} />
<Modal
	title={m.todo()}
	{onclose}
	bind:dialog
	showFooter={isShared}
	width="920px"
	height="min(90dvh, 920px)"
	zIndex={500}
>
	{#snippet footer()}
		<div aria-label={m.new_message()}>
			{#if canSendMessages}<TodoContentEditor
					editorLabel={m.new_message_editor()}
					submitLabel={m.send()}
					iconSubmit
					onsubmit={send}
				/>{:else}<p class="readonly">{m.chat_readonly()}</p>{/if}
			{#if sendNotice}<p class="notice" role="status">{sendNotice}</p>{/if}
		</div>
	{/snippet}
	<div class="scroll-area">
		<section class="todo-content" aria-label={m.todo_content()}>
			{#if !isShared && canEditImages}<TodoContentEditor
					initialBlocks={todo.blocks}
					initialImages={todo.images}
					submitLabel={m.save_changes()}
					onsubmit={onedit}
				/>{:else}<ContentViewer
					blocks={todo.blocks}
					images={todo.images}
					imageViewerMode={!isShared && canEditImages ? 'edit' : 'view'}
				/>{/if}
		</section>
		{#if isShared}<section class="dialog-section" aria-labelledby="dialog-title">
				<h3 id="dialog-title">{m.dialog()}</h3>
				{#if chatLoading}<p>{m.loading_history()}</p>
				{:else if !chatMessages.length}<p>{m.no_messages()}</p>
				{:else}<ol class="messages">
						{#each chatMessages as message (message.id)}<li
								class:own={message.authorId === currentUserId}
								class:system={message.type === 'system'}
							>
								<div class="meta">
									<strong>{message.type === 'system' ? m.system() : message.authorName}</strong
									><time datetime={new Date(message.createdAt).toISOString()}
										>{new Date(message.createdAt).toLocaleString()}</time
									>
								</div>
								{#if message.type === 'system'}<p>{message.eventType}</p>{:else}<ContentViewer
										blocks={message.blocks}
										images={message.images}
										imageViewerMode={message.authorId === currentUserId ? 'edit' : 'view'}
									/>{/if}
							</li>{/each}
					</ol>{/if}
			</section>{/if}
	</div>
</Modal>

<style>
	h3 {
		margin: 0;
	}
	h3 {
		font-size: 0.88rem;
	}
	.scroll-area {
		min-height: 0;
	}
	.todo-content {
		padding: clamp(1rem, 3vw, 2rem);
	}
	.dialog-section {
		min-height: 9rem;
		border-top: 1px solid #dce1dc;
		padding: 1.2rem clamp(1rem, 3vw, 2rem);
	}
	.dialog-section p {
		margin: 1rem 0 0;
		color: #7a857d;
	}
	.messages {
		display: grid;
		gap: 0.75rem;
		margin: 1rem 0 0;
		padding: 0;
		list-style: none;
	}
	.messages li {
		max-width: 82%;
		border: 1px solid #dce1dc;
		border-radius: 0.7rem;
		background: #fff;
		padding: 0.65rem 0.75rem;
	}
	.messages li.own {
		margin-left: auto;
		background: #eef7f1;
	}
	.messages li.system {
		max-width: 100%;
		background: transparent;
		border-style: dashed;
		color: #68746b;
	}
	.meta {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 0.35rem;
		font-size: 0.75rem;
	}
	.meta time {
		color: #7a857d;
	}
	.readonly {
		margin: 0;
		color: #68746b;
		text-align: center;
		font-size: 0.82rem;
	}
	.notice {
		margin: 0.45rem 0 0;
		color: #68746b;
		font-size: 0.78rem;
		text-align: right;
	}
	@media (max-width: 620px) {
		.todo-content {
			padding: 1rem;
		}
	}
</style>
