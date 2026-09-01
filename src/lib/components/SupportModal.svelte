<script lang="ts">
	import Modal from './Modal.svelte';
	import TodoContentEditor from './TodoContentEditor.svelte';
	import type { TodoContentBlock } from '$lib/client/content-blocks';
	import type { NewTodoImage } from '$lib/client/db/todo-service';
	import { session } from '$lib/client/auth';
	import { m } from '$lib/paraglide/messages';
	import { localeVersion } from '$lib/client/locale';
	$localeVersion;

	let { onclose }: { onclose: () => void } = $props();
	let notice = $state('');
	let sent = $state(false);

	async function send(blocks: TodoContentBlock[], images: NewTodoImage[]) {
		notice = '';
		if (!$session.data?.user) {
			notice = m.support_auth_required();
			return false;
		}
		const form = new FormData();
		form.set(
			'payload',
			JSON.stringify({
				blocks: blocks.map((block) =>
					block.type === 'text'
						? { type: 'text', text: block.text }
						: { type: 'image', imageId: block.imageId }
				),
				images: images.map((image) => ({
					id: image.id,
					fileName: image.fileName,
					markup: image.markup
				}))
			})
		);
		for (const image of images)
			form.set(`image:${image.id}`, image.blob, image.fileName || `screenshot-${image.id}`);
		const response = await fetch('/api/support', { method: 'POST', body: form });
		const body = await response.json().catch(() => ({}));
		if (!response.ok) {
			notice =
				body.code === 'SUPPORT_EMAIL_UNAVAILABLE'
					? m.support_email_unavailable()
					: body.message || m.support_send_failed();
			return false;
		}
		sent = true;
		notice = m.support_sent();
		return true;
	}
</script>

<Modal title={m.support_title()} {onclose} width="48rem" zIndex={1200}>
	<div class="support-content">
		<p>{m.support_intro()}</p>
		{#if sent}<div class="success" role="status">{notice}</div>
		{:else}
			<TodoContentEditor
				editorLabel={m.support_editor_label()}
				placeholder={m.support_placeholder()}
				submitLabel={m.send()}
				iconSubmit
				submitOnEnter={false}
				showSubmitHint={false}
				autofocus
				onsubmit={send}
			/>
			{#if notice}<p class="error" role="alert">{notice}</p>{/if}
		{/if}
	</div>
</Modal>

<style>
	.support-content {
		display: grid;
		gap: 1rem;
		padding: clamp(1rem, 3vw, 1.5rem);
	}
	p {
		margin: 0;
		color: var(--color-text-muted);
		line-height: 1.55;
	}
	.error {
		color: var(--color-danger);
	}
	.success {
		border-radius: var(--radius-md);
		background: var(--color-success-soft, #e8f5ec);
		padding: 1rem;
		color: var(--color-accent);
		font-weight: 700;
	}
</style>
