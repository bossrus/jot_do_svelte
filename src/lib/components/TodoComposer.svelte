<script lang="ts">
	import { onMount, tick, untrack } from 'svelte';
	import type { NewTodoImage } from '$lib/client/db/todo-service';
	import { imageFromFile } from '$lib/client/images';
	import TodoImageList from './TodoImageList.svelte';

	let {
		initialText = '',
		initialImages = [],
		submitLabel = '',
		autofocus = false,
		onsubmit,
		oncancel
	}: {
		initialText?: string;
		initialImages?: NewTodoImage[];
		submitLabel?: string;
		autofocus?: boolean;
		onsubmit: (text: string, images: NewTodoImage[]) => Promise<boolean>;
		oncancel?: () => void;
	} = $props();
	let text = $state(untrack(() => initialText));
	let images = $state<NewTodoImage[]>(untrack(() => [...initialImages]));
	let editor = $state<HTMLTextAreaElement>();
	let picker = $state<HTMLInputElement>();
	let dragging = $state(false);
	let busy = $state(false);
	let message = $state('');
	let dragDepth = 0;

	onMount(() => {
		if (autofocus) editor?.focus();
	});

	async function addFiles(files: File[]) {
		message = '';
		const results = await Promise.allSettled(files.map(imageFromFile));
		images = [
			...images,
			...results
				.filter((r): r is PromiseFulfilledResult<NewTodoImage> => r.status === 'fulfilled')
				.map((r) => r.value)
		];
		const failures = results.filter((r) => r.status === 'rejected');
		if (failures.length)
			message =
				failures.length === 1
					? 'Не удалось добавить один файл.'
					: `Не удалось добавить файлов: ${failures.length}.`;
		await tick();
		editor?.focus();
	}

	function paste(event: ClipboardEvent) {
		const files = [...(event.clipboardData?.items ?? [])]
			.filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
			.map((item) => item.getAsFile())
			.filter((file): file is File => Boolean(file));
		if (files.length) void addFiles(files); // Do not preventDefault: clipboard text must still reach the textarea.
	}

	async function submit() {
		if (busy || (!text.trim() && images.length === 0)) return;
		busy = true;
		message = '';
		try {
			if (await onsubmit(text, images)) {
				text = '';
				images = [];
				await tick();
				editor?.focus();
			}
		} catch {
			message = 'Не удалось сохранить задачу. Черновик не удалён.';
		} finally {
			busy = false;
		}
	}

	function keydown(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
			event.preventDefault();
			void submit();
		} else if (event.key === 'Escape' && oncancel) {
			event.preventDefault();
			oncancel();
		}
	}

	function drop(event: DragEvent) {
		event.preventDefault();
		dragDepth = 0;
		dragging = false;
		void addFiles(
			[...(event.dataTransfer?.files ?? [])].filter((file) => file.type.startsWith('image/'))
		);
	}
</script>

<div
	role="group"
	aria-label="Редактор задачи"
	class:dragging
	class="composer"
	ondragenter={(e) => {
		e.preventDefault();
		dragDepth++;
		dragging = true;
	}}
	ondragover={(e) => e.preventDefault()}
	ondragleave={() => {
		dragDepth--;
		if (dragDepth <= 0) dragging = false;
	}}
	ondrop={drop}
>
	{#if dragging}<div class="drop-message">Перетащите изображения сюда</div>{/if}
	<textarea
		bind:this={editor}
		bind:value={text}
		onkeydown={keydown}
		onpaste={paste}
		placeholder="Что нужно сделать?"
		aria-label="Текст задачи"
		rows="2"></textarea>
	<TodoImageList
		{images}
		removable
		onremove={(id) => (images = images.filter((image) => image.id !== id))}
	/>
	<div class="toolbar">
		<input
			bind:this={picker}
			type="file"
			accept="image/*"
			multiple
			onchange={(event) => {
				const input = event.currentTarget;
				void addFiles([...(input.files ?? [])]);
				input.value = '';
			}}
		/>
		<button
			class="add"
			type="button"
			aria-label="Добавить изображение"
			title="Добавить изображение"
			onclick={() => picker?.click()}>+</button
		>
		<span>Enter — сохранить · Shift+Enter — новая строка</span>
		{#if submitLabel}<button
				class="submit"
				type="button"
				disabled={busy || (!text.trim() && images.length === 0)}
				onclick={submit}>{submitLabel}</button
			>{/if}
		{#if oncancel}<button class="cancel" type="button" onclick={oncancel}>Отмена</button>{/if}
	</div>
	{#if message}<p class="error" role="alert">{message}</p>{/if}
</div>

<style>
	.composer {
		position: relative;
		display: grid;
		gap: 0.7rem;
		border: 1px solid #c9d0ca;
		border-radius: 0.8rem;
		background: #fff;
		padding: 0.8rem;
		box-shadow: 0 8px 30px rgb(28 36 31 / 6%);
		transition:
			border-color 120ms,
			box-shadow 120ms;
	}
	.composer:focus-within,
	.composer.dragging {
		border-color: #326a4b;
		box-shadow: 0 0 0 3px rgb(50 106 75 / 14%);
	}
	textarea {
		width: 100%;
		min-height: 3.5rem;
		resize: vertical;
		border: 0;
		outline: 0;
		background: transparent;
		color: inherit;
		font: inherit;
		font-size: 1.05rem;
		line-height: 1.45;
	}
	.toolbar {
		display: flex;
		align-items: center;
		gap: 0.45rem;
	}
	input {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
		pointer-events: none;
	}
	button {
		font: inherit;
		cursor: pointer;
	}
	.add {
		display: grid;
		width: 2rem;
		height: 2rem;
		flex: none;
		place-items: center;
		border: 1px solid #cbd2cc;
		border-radius: 0.45rem;
		background: #f5f7f5;
		color: #315d43;
		font-size: 1.25rem;
	}
	.toolbar span {
		flex: 1;
		color: #7d887f;
		font-size: 0.72rem;
		text-align: right;
	}
	.submit,
	.cancel {
		border: 0;
		border-radius: 0.4rem;
		padding: 0.45rem 0.65rem;
	}
	.submit {
		background: #326a4b;
		color: white;
	}
	.submit:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.cancel {
		background: #e9ece9;
		color: #39443c;
	}
	.drop-message {
		position: absolute;
		inset: 0.35rem;
		z-index: 2;
		display: grid;
		place-items: center;
		border-radius: 0.55rem;
		background: rgb(236 246 239 / 94%);
		color: #28563c;
		font-weight: 700;
		pointer-events: none;
	}
	.error {
		margin: 0;
		color: #a12d2d;
		font-size: 0.8rem;
	}
	@media (max-width: 520px) {
		.toolbar {
			flex-wrap: wrap;
		}
		.toolbar span {
			min-width: calc(100% - 2.5rem);
		}
	}
</style>
