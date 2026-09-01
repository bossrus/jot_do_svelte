<script lang="ts">
	import { onMount, tick, untrack } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import { IconCornerDownLeft, IconPhoto } from '@tabler/icons-svelte-runes';
	import {
		adjacentTextPosition,
		cloneBlocks,
		emptyContent,
		insertImageBlocks,
		insertTextLines,
		isTodoContentEmpty,
		moveBlock,
		removeBlock,
		splitTextBlock,
		type TextBlock,
		type TodoContentBlock
	} from '$lib/client/content-blocks';
	import type { NewTodoImage } from '$lib/client/db/todo-service';
	import type { ImageMarkupObject } from '$lib/client/markup/types';
	import { imageFromFile, isImportableImage } from '$lib/client/images';
	import TodoImagePreview from './TodoImagePreview.svelte';
	import { m } from '$lib/paraglide/messages';
	import { localeVersion } from '$lib/client/locale';
	$localeVersion;

	let {
		initialBlocks = emptyContent(),
		initialImages = [],
		submitLabel = '',
		iconSubmit = false,
		autofocus = false,
		editorLabel = m.editor_label(),
		placeholder = '',
		onsubmit,
		onchange,
		submitOnEnter = true,
		oncancel
	}: {
		initialBlocks?: TodoContentBlock[];
		initialImages?: NewTodoImage[];
		submitLabel?: string;
		iconSubmit?: boolean;
		autofocus?: boolean;
		editorLabel?: string;
		placeholder?: string;
		onsubmit?: (blocks: TodoContentBlock[], images: NewTodoImage[]) => Promise<boolean>;
		onchange?: (blocks: TodoContentBlock[], images: NewTodoImage[]) => void;
		submitOnEnter?: boolean;
		oncancel?: () => void;
	} = $props();
	let blocks = $state<TodoContentBlock[]>(untrack(() => cloneBlocks(initialBlocks)));
	let images = $state<NewTodoImage[]>(untrack(() => [...initialImages]));
	let activeId = $state(
		untrack(() => initialBlocks.find((block) => block.type === 'text')?.id ?? '')
	);
	let activeOffset = $state(0);
	let picker = $state<HTMLInputElement>();
	let busy = $state(false);
	let dragging = $state(false);
	let message = $state('');
	let draggedImageBlockId: string | null = null;
	const editors = new SvelteMap<string, HTMLTextAreaElement>();
	let imageMap = $derived(new Map(images.map((image) => [image.id, image])));
	$effect(() => onchange?.(cloneBlocks(blocks), [...images]));
	function registerEditor(node: HTMLTextAreaElement, id: string) {
		editors.set(id, node);
		resize(node);
		return {
			destroy() {
				editors.delete(id);
			}
		};
	}

	async function focusAt(id: string, offset: number) {
		await tick();
		const editor = editors.get(id);
		if (!editor) return;
		editor.focus();
		editor.setSelectionRange(offset, offset);
		activeId = id;
		activeOffset = offset;
	}

	export function focus() {
		return focusAt(activeId, activeOffset);
	}

	function resize(editor: HTMLTextAreaElement) {
		editor.style.height = '0';
		editor.style.height = `${editor.scrollHeight}px`;
	}
	function remember(editor: HTMLTextAreaElement, id: string) {
		activeId = id;
		activeOffset = editor.selectionStart ?? 0;
	}
	function updateText(id: string, value: string) {
		blocks = blocks.map((block) =>
			block.id === id ? ({ ...block, text: value } as TextBlock) : block
		);
	}

	function updateImageMarkup(imageId: string, markup: ImageMarkupObject[]) {
		images = images.map((image) => (image.id === imageId ? { ...image, markup } : image));
	}

	onMount(() => {
		for (const editor of editors.values()) resize(editor);
		if (autofocus) void focusAt(activeId, 0);
	});

	async function addFiles(
		files: File[],
		targetId: string | null = activeId,
		offset = activeOffset
	) {
		message = '';
		const results = await Promise.allSettled(files.map(imageFromFile));
		const added = results
			.filter(
				(result): result is PromiseFulfilledResult<NewTodoImage> => result.status === 'fulfilled'
			)
			.map((result) => result.value);
		if (added.length) {
			images = [...images, ...added];
			const result = insertImageBlocks(
				blocks,
				targetId || null,
				offset,
				added.map((image) => image.id)
			);
			blocks = result.blocks;
			await focusAt(result.focusId, result.focusOffset);
		}
		const failed = results.length - added.length;
		if (failed) message = m.files_failed({ count: failed });
	}

	function keydown(event: KeyboardEvent, block: TextBlock) {
		const editor = event.currentTarget as HTMLTextAreaElement;
		remember(editor, block.id);
		if ((event.key === 'ArrowUp' || event.key === 'ArrowDown') && !event.shiftKey) {
			event.preventDefault();
			const direction = event.key === 'ArrowUp' ? -1 : 1;
			const offset = direction === -1 ? editor.selectionStart : editor.selectionEnd;
			const target = adjacentTextPosition(blocks, block.id, direction, offset);
			void focusAt(target.focusId, target.focusOffset);
		} else if (event.key === 'Enter' && !event.isComposing && submitOnEnter) {
			event.preventDefault();
			if (event.shiftKey) {
				const result = splitTextBlock(blocks, block.id, editor.selectionStart);
				blocks = result.blocks;
				void focusAt(result.focusId, result.focusOffset);
			} else void submit();
		} else if (event.key === 'Escape' && oncancel) {
			event.preventDefault();
			oncancel();
		}
	}

	function paste(event: ClipboardEvent, block: TextBlock) {
		event.preventDefault();
		const editor = event.currentTarget as HTMLTextAreaElement;
		let targetId = block.id;
		let offset = editor.selectionStart;
		const text = event.clipboardData?.getData('text/plain') ?? '';
		if (text) {
			const result = insertTextLines(
				blocks,
				block.id,
				editor.selectionStart,
				editor.selectionEnd,
				text
			);
			blocks = result.blocks;
			targetId = result.focusId;
			offset = result.focusOffset;
			void focusAt(targetId, offset);
		}
		const files = [...(event.clipboardData?.items ?? [])]
			.filter((item) => item.kind === 'file')
			.map((item) => item.getAsFile())
			.filter((file): file is File => file !== null && isImportableImage(file));
		if (files.length) void addFiles(files, targetId, offset);
	}

	async function submit() {
		if (!onsubmit || busy || isTodoContentEmpty(blocks)) return;
		busy = true;
		message = '';
		try {
			if (await onsubmit(blocks, images)) {
				blocks = emptyContent();
				images = [];
				activeId = (blocks[0] as TextBlock).id;
				await focusAt(activeId, 0);
			}
		} catch (error) {
			console.error('IndexedDB operation failed', error);
			message = m.content_save_failed();
		} finally {
			busy = false;
		}
	}

	function drop(event: DragEvent) {
		event.preventDefault();
		dragging = false;
		const element = (event.target as Element).closest<HTMLElement>('[data-block-index]');
		const targetIndex = element ? Number(element.dataset.blockIndex) : blocks.length;
		if (draggedImageBlockId) {
			blocks = moveBlock(blocks, draggedImageBlockId, targetIndex);
			draggedImageBlockId = null;
			return;
		}
		const files = [...(event.dataTransfer?.files ?? [])].filter(isImportableImage);
		if (!files.length) return;
		const target = blocks[targetIndex];
		if (target?.type === 'text') {
			const rect = element!.getBoundingClientRect();
			const offset = event.clientY < rect.top + rect.height / 2 ? 0 : target.text.length;
			void addFiles(files, target.id, offset);
		} else {
			const nearbyText = [...blocks.slice(0, targetIndex)]
				.reverse()
				.find((block) => block.type === 'text');
			void addFiles(
				files,
				nearbyText?.id ?? null,
				nearbyText?.type === 'text' ? nearbyText.text.length : 0
			);
		}
	}
</script>

<div
	class:dragging
	class="editor"
	role="group"
	aria-label={editorLabel}
	ondragover={(event) => {
		event.preventDefault();
		dragging = true;
	}}
	ondragleave={(event) => {
		if (!event.currentTarget.contains(event.relatedTarget as Node)) dragging = false;
	}}
	ondrop={drop}
>
	<div class="blocks">
		{#each blocks as block, index (block.id)}
			<div class="block" data-block-index={index}>
				{#if block.type === 'text'}
					<textarea
						{placeholder}
						rows="1"
						value={block.text}
						aria-label={m.text_line({ count: index + 1 })}
						use:registerEditor={block.id}
						onfocus={(event) => remember(event.currentTarget, block.id)}
						onclick={(event) => remember(event.currentTarget, block.id)}
						onkeyup={(event) => remember(event.currentTarget, block.id)}
						oninput={(event) => {
							updateText(block.id, event.currentTarget.value);
							resize(event.currentTarget);
							remember(event.currentTarget, block.id);
						}}
						onkeydown={(event) => keydown(event, block)}
						onpaste={(event) => paste(event, block)}></textarea>
				{:else if imageMap.get(block.imageId)}
					<div class="image-block" role="group" aria-label={m.image_block()}>
						<span
							class="handle"
							role="button"
							tabindex="0"
							draggable="true"
							aria-label={m.reorder_image()}
							ondragstart={() => (draggedImageBlockId = block.id)}
							ondragend={() => {
								draggedImageBlockId = null;
								dragging = false;
							}}>⋮⋮</span
						><TodoImagePreview
							blob={imageMap.get(block.imageId)!.blob}
							imageId={block.imageId}
							width={imageMap.get(block.imageId)!.width}
							height={imageMap.get(block.imageId)!.height}
							initialMarkup={imageMap.get(block.imageId)!.markup}
							onmarkupchange={(objects) => updateImageMarkup(block.imageId, objects)}
							alt={m.attached_image()}
						/>
						<button
							type="button"
							class="remove"
							aria-label={m.remove_image()}
							onclick={() => {
								blocks = removeBlock(blocks, block.id);
								images = images.filter((image) => image.id !== block.imageId);
							}}>×</button
						>
					</div>
				{/if}
			</div>
		{/each}
	</div>
	<div class="toolbar">
		<input
			bind:this={picker}
			class="file-input"
			type="file"
			accept="image/jpeg,image/png,image/webp"
			multiple
			onchange={(event) => {
				const input = event.currentTarget;
				void addFiles([...(input.files ?? [])]);
				input.value = '';
			}}
		/>
		<button
			class="tool-icon image-button"
			type="button"
			aria-label={m.add_image()}
			title={m.add_image()}
			onclick={() => picker?.click()}><IconPhoto size={23} stroke={1.8} /></button
		>
		<span>{submitOnEnter ? m.enter_save_hint() : m.enter_line_hint()}</span>
		{#if submitLabel}
			{#if iconSubmit}
				<button
					class="tool-icon add-button"
					type="button"
					aria-label={submitLabel}
					title={submitLabel}
					disabled={busy || isTodoContentEmpty(blocks)}
					onclick={submit}><IconCornerDownLeft size={25} stroke={2} /></button
				>
			{:else}<button
					class="submit"
					type="button"
					disabled={busy || isTodoContentEmpty(blocks)}
					onclick={submit}>{submitLabel}</button
				>{/if}
		{/if}
		{#if oncancel}<button class="cancel" type="button" onclick={oncancel}>{m.cancel()}</button>{/if}
	</div>
	{#if message}<p class="error" role="alert">{message}</p>{/if}
</div>

<style>
	.editor {
		display: grid;
		gap: 0.65rem;
		border: 1px solid #c9d0ca;
		border-radius: 0.8rem;
		background: #fff;
		padding: 0.75rem;
		box-shadow: 0 8px 30px rgb(28 36 31 / 6%);
		transition:
			border-color 120ms,
			box-shadow 120ms;
	}
	.editor:focus-within,
	.editor.dragging {
		border-color: #326a4b;
		box-shadow: 0 0 0 3px rgb(50 106 75 / 14%);
	}
	.editor.dragging {
		background: #f3faf5;
	}
	.blocks {
		display: grid;
		gap: 0.3rem;
	}
	textarea {
		display: block;
		width: 100%;
		min-height: 1.7rem;
		overflow: hidden;
		resize: none;
		border: 0;
		outline: 0;
		background: transparent;
		color: inherit;
		font: inherit;
		line-height: 1.45;
	}
	.image-block {
		position: relative;
		display: grid;
		grid-template-columns: auto minmax(0, 300px);
		gap: 0.35rem;
		width: fit-content;
		max-width: 100%;
	}
	.handle {
		align-self: center;
		color: #829087;
		cursor: grab;
		user-select: none;
	}
	.remove {
		position: absolute;
		top: 0.25rem;
		right: 0.25rem;
		display: grid;
		width: 1.55rem;
		height: 1.55rem;
		place-items: center;
		border: 0;
		border-radius: 50%;
		background: rgb(20 27 22 / 78%);
		color: white;
		font-size: 1.1rem;
		cursor: pointer;
	}
	.toolbar {
		display: flex;
		align-items: center;
		gap: 0.45rem;
	}
	.file-input {
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
	.tool-icon {
		display: grid;
		width: 54px;
		height: 50px;
		flex: none;
		place-items: center;
		border: 1px solid #dbe3ee;
		border-radius: 11px;
		padding: 0;
	}
	.image-button {
		background: #fff;
		color: #111827;
	}
	.add-button {
		margin-left: auto;
		background: var(--color-accent);
		color: #fff;
	}
	.tool-icon:hover {
		border-color: #b8c6d8;
	}
	.tool-icon:disabled {
		cursor: not-allowed;
		opacity: 0.45;
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
	}
	.cancel {
		background: #e9ece9;
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
