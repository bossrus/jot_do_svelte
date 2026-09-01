<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import { localeVersion } from '$lib/client/locale';
	$localeVersion;
	import { onMount, tick, untrack } from 'svelte';
	import { imageMarkupService } from '$lib/client/markup/markup-service';
	import {
		addObject,
		cloneObjects,
		createMarkupState,
		deleteObject,
		undo,
		type MarkupState
	} from '$lib/client/markup/state';
	import type { ImageMarkupObject } from '$lib/client/markup/types';
	import ImageMarkupOverlay from './ImageMarkupOverlay.svelte';
	import ImageMarkupPreview from './ImageMarkupPreview.svelte';
	import Modal from './Modal.svelte';
	import ImageMarkupToolbar from './ImageMarkupToolbar.svelte';

	let {
		imageId,
		blob,
		width,
		height,
		mode = 'edit',
		onclose,
		onmarkupchange,
		initialObjects,
		onpersist
	}: {
		imageId: string;
		blob: Blob;
		width: number | null;
		height: number | null;
		mode?: 'view' | 'edit';
		onclose: () => void;
		onmarkupchange?: (objects: ImageMarkupObject[]) => void;
		initialObjects?: ImageMarkupObject[];
		onpersist?: (objects: ImageMarkupObject[]) => Promise<void>;
	} = $props();
	let url = $state('');
	let imageWidth = $state(1);
	let imageHeight = $state(1);
	let markupState = $state<MarkupState>(createMarkupState());
	let selectedId = $state<string | null>(null);
	let tool = $state<'pencil' | 'text' | 'hand'>(
		untrack(() => (mode === 'view' ? 'hand' : 'pencil'))
	);
	let color = $state('#e03131');
	let pencilWidth = $state(4);
	let zoom = $state(1);
	let fitWidth = $state(1);
	let fitHeight = $state(1);
	let imageReady = $state(false);
	let imageLoaded = $state(false);
	let loading = $state(true);
	let error = $state('');
	let gestureBefore: ImageMarkupObject[] | null = null;
	let propertyBefore: ImageMarkupObject[] | null = null;
	let imageElement = $state<HTMLImageElement>();
	let backdropElement = $state<HTMLDivElement>();
	let stageElement = $state<HTMLDivElement>();
	let displayedImageMin = $state(1);
	let panGesture = $state<{
		pointerId: number;
		startX: number;
		startY: number;
		scrollLeft: number;
		scrollTop: number;
	} | null>(null);

	$effect(() => {
		const objects = cloneObjects(markupState.objects);
		if (mode === 'edit') untrack(() => onmarkupchange?.(objects));
	});
	function updateFitSize() {
		if (!stageElement || !imageLoaded || imageWidth <= 0 || imageHeight <= 0) return false;
		const stageRect = stageElement.getBoundingClientRect();
		const availableWidth = Math.max(
			16,
			(stageRect.width >= 16 ? stageRect.width : window.innerWidth) - 8
		);
		const availableHeight = Math.max(
			16,
			(stageRect.height >= 16 ? stageRect.height : window.innerHeight - 88) - 8
		);
		const fitScale = Math.min(availableWidth / imageWidth, availableHeight / imageHeight, 1);
		fitWidth = imageWidth * fitScale;
		fitHeight = imageHeight * fitScale;
		imageReady = true;
		return true;
	}
	$effect(() => {
		if (!stageElement) return;
		const observer = new ResizeObserver(updateFitSize);
		observer.observe(stageElement);
		updateFitSize();
		return () => observer.disconnect();
	});

	$effect(() => {
		if (!imageElement) return;
		const update = () => {
			const rect = imageElement?.getBoundingClientRect();
			displayedImageMin = Math.max(1, Math.min(rect?.width ?? 1, rect?.height ?? 1));
		};
		const observer = new ResizeObserver(update);
		observer.observe(imageElement);
		update();
		return () => observer.disconnect();
	});

	onMount(() => {
		const previousOverflow = document.body.style.overflow;
		const draggableAncestor = backdropElement?.closest<HTMLElement>('[draggable="true"]');
		const originalDraggable = draggableAncestor?.getAttribute('draggable');
		if (draggableAncestor) draggableAncestor.draggable = false;
		imageWidth = width ?? 1;
		imageHeight = height ?? 1;
		url = URL.createObjectURL(blob);
		document.body.style.overflow = 'hidden';
		void (
			initialObjects
				? Promise.resolve(cloneObjects(initialObjects))
				: imageMarkupService.load(imageId)
		)
			.then((objects) => (markupState = createMarkupState(objects)))
			.catch(report)
			.finally(() => (loading = false));
		return () => {
			if (draggableAncestor && typeof originalDraggable === 'string')
				draggableAncestor.setAttribute('draggable', originalDraggable);
			URL.revokeObjectURL(url);
			document.body.style.overflow = previousOverflow;
		};
	});
	function report(reason: unknown) {
		console.error('Image markup IndexedDB operation failed', reason);
		error = m.markup_save_failed();
	}
	async function save() {
		error = '';
		try {
			if (onpersist) await onpersist(cloneObjects(markupState.objects));
			else await imageMarkupService.save(imageId, markupState.objects);
		} catch (reason) {
			report(reason);
		}
	}
	function closeEditor() {
		if (mode === 'edit') void save();
		onclose();
	}
	function create(object: ImageMarkupObject) {
		markupState = addObject(markupState, object);
		void save();
	}
	function preview(object: ImageMarkupObject) {
		markupState = {
			...markupState,
			objects: markupState.objects.map((item) => (item.id === object.id ? object : item))
		};
	}
	function beginTransform() {
		gestureBefore = cloneObjects(markupState.objects);
	}
	function endTransform() {
		if (gestureBefore) {
			markupState = {
				objects: markupState.objects,
				history: [...markupState.history, gestureBefore]
			};
			gestureBefore = null;
			void save();
		}
	}
	function previewSelectedProperty(update: (object: ImageMarkupObject) => ImageMarkupObject) {
		if (!selectedId) return;
		propertyBefore ??= cloneObjects(markupState.objects);
		markupState = {
			...markupState,
			objects: markupState.objects.map((object) =>
				object.id === selectedId ? update(object) : object
			)
		};
	}
	function changeColor(value: string) {
		color = value;
		previewSelectedProperty((object) => ({ ...object, color: value }));
	}
	function changePencilWidth(value: number) {
		pencilWidth = value;
		const selected = markupState.objects.find((object) => object.id === selectedId);
		if (selected?.type !== 'path') return;
		previewSelectedProperty((object) =>
			object.type === 'path' ? { ...object, width: value / displayedImageMin } : object
		);
	}
	function commitSelectedProperty() {
		if (!propertyBefore) return;
		markupState = {
			objects: markupState.objects,
			history: [...markupState.history, propertyBefore]
		};
		propertyBefore = null;
		void save();
	}
	async function setZoom(nextZoom: number) {
		const next = Math.min(4, Math.max(0.25, nextZoom));
		if (next === zoom) return;
		const stage = stageElement;
		const oldWidth = fitWidth * zoom;
		const oldHeight = fitHeight * zoom;
		const centerX =
			stage && oldWidth > stage.clientWidth
				? (stage.scrollLeft + stage.clientWidth / 2) / oldWidth
				: 0.5;
		const centerY =
			stage && oldHeight > stage.clientHeight
				? (stage.scrollTop + stage.clientHeight / 2) / oldHeight
				: 0.5;
		zoom = next;
		await tick();
		requestAnimationFrame(() => {
			if (!stage) return;
			const nextWidth = fitWidth * next;
			const nextHeight = fitHeight * next;
			stage.scrollLeft =
				nextWidth > stage.clientWidth ? centerX * nextWidth - stage.clientWidth / 2 : 0;
			stage.scrollTop =
				nextHeight > stage.clientHeight ? centerY * nextHeight - stage.clientHeight / 2 : 0;
		});
	}
	function changeZoom(delta: number) {
		return setZoom(Math.round((zoom + delta) * 10) / 10);
	}
	function beginPan(event: PointerEvent) {
		if (tool !== 'hand' || event.button !== 0) return;
		const stage = event.currentTarget as HTMLDivElement;
		stage.setPointerCapture(event.pointerId);
		panGesture = {
			pointerId: event.pointerId,
			startX: event.clientX,
			startY: event.clientY,
			scrollLeft: stage.scrollLeft,
			scrollTop: stage.scrollTop
		};
		event.preventDefault();
	}
	function movePan(event: PointerEvent) {
		if (!panGesture || panGesture.pointerId !== event.pointerId) return;
		const stage = event.currentTarget as HTMLDivElement;
		stage.scrollLeft = panGesture.scrollLeft - (event.clientX - panGesture.startX);
		stage.scrollTop = panGesture.scrollTop - (event.clientY - panGesture.startY);
		event.preventDefault();
	}
	function endPan(event: PointerEvent) {
		if (panGesture?.pointerId !== event.pointerId) return;
		panGesture = null;
	}
	function remove() {
		if (!selectedId) return;
		markupState = deleteObject(markupState, selectedId);
		selectedId = null;
		void save();
	}
	function undoLast() {
		markupState = undo(markupState);
		selectedId = null;
		void save();
	}
	function keydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopImmediatePropagation();
			closeEditor();
			return;
		}
		const target = event.target as HTMLElement;
		if (target.matches('input,textarea,[contenteditable="true"]')) return;
		if (event.key === '+' || event.key === '=') {
			event.preventDefault();
			void changeZoom(0.1);
			return;
		}
		if (event.key === '-') {
			event.preventDefault();
			void changeZoom(-0.1);
			return;
		}
		if (mode === 'edit' && (event.key === 'Delete' || event.key === 'Backspace') && selectedId) {
			event.preventDefault();
			remove();
		}
	}
</script>

<svelte:window onkeydown={keydown} />
<Modal
	title={mode === 'view' ? m.image_viewer() : m.image_editor()}
	onclose={closeEditor}
	bind:dialog={backdropElement}
	width="100%"
	height="calc(100dvh - 2rem)"
	maxHeight="calc(100dvh - 2rem)"
	zIndex={1000}
>
	{#snippet header()}
		{#if mode === 'edit'}<ImageMarkupToolbar
				{tool}
				{color}
				width={pencilWidth}
				canDelete={Boolean(selectedId)}
				canUndo={markupState.history.length > 0}
				{zoom}
				ontool={(value) => (tool = value)}
				oncolor={changeColor}
				oncolorcommit={commitSelectedProperty}
				onwidth={changePencilWidth}
				onwidthcommit={commitSelectedProperty}
				ondelete={remove}
				onundo={undoLast}
				onzoomout={() => void changeZoom(-0.1)}
				onzoomin={() => void changeZoom(0.1)}
				onzoomchange={(percent) => void setZoom(percent / 100)}
			/>
		{:else}<div class="view-toolbar" aria-label={m.image_zoom()}>
				<button
					type="button"
					disabled={zoom <= 0.25}
					onclick={() => void changeZoom(-0.1)}
					aria-label={m.zoom_out()}>−</button
				>
				<label class="view-zoom-value">
					<span>{m.zoom()}</span>
					<input
						aria-label={m.zoom_percent()}
						type="number"
						min="25"
						max="400"
						step="10"
						value={Math.round(zoom * 100)}
						onchange={(event) => void setZoom(Number(event.currentTarget.value) / 100)}
					/>
					<small>%</small>
				</label>
				<button
					type="button"
					disabled={zoom >= 4}
					onclick={() => void changeZoom(0.1)}
					aria-label={m.zoom_in()}>+</button
				>
			</div>{/if}
	{/snippet}
	{#if error}<p class="error" role="alert">{error}</p>{/if}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="stage"
		class:panning={Boolean(panGesture)}
		class:hand={tool === 'hand'}
		bind:this={stageElement}
		onpointerdown={beginPan}
		onpointermove={movePan}
		onpointerup={endPan}
		onpointercancel={endPan}
	>
		{#if url}<div
				class="image-wrap"
				class:ready={imageReady}
				style={`width:${fitWidth * zoom}px;height:${fitHeight * zoom}px`}
			>
				<img
					bind:this={imageElement}
					src={url}
					alt={m.edited_image()}
					onload={(event) => {
						imageWidth = (event.currentTarget as HTMLImageElement).naturalWidth;
						imageHeight = (event.currentTarget as HTMLImageElement).naturalHeight;
						imageLoaded = true;
						updateFitSize();
					}}
				/>
				{#if !loading && mode === 'edit'}<ImageMarkupOverlay
						objects={markupState.objects}
						{selectedId}
						{tool}
						{color}
						{pencilWidth}
						{imageWidth}
						{imageHeight}
						onselect={(id) => (selectedId = id)}
						oncreate={create}
						ontransform={preview}
						ontransformstart={beginTransform}
						ontransformend={endTransform}
						ontextend={save}
					/>
				{:else if !loading}<ImageMarkupPreview
						objects={markupState.objects}
						{imageWidth}
						{imageHeight}
					/>{/if}
			</div>{/if}
	</div>
</Modal>

<style>
	:global(.modal-header-content) {
		display: flex;
		justify-content: center;
	}
	.view-toolbar {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		border-radius: 0.55rem;
		background: #fff;
		padding: 0.25rem;
	}
	.view-toolbar button {
		width: 2rem;
		height: 2rem;
		border: 0;
		border-radius: 0.35rem;
		background: #e9eeea;
		cursor: pointer;
	}
	.view-toolbar button:disabled {
		cursor: not-allowed;
		opacity: 0.45;
	}
	.view-zoom-value {
		display: flex;
		align-items: center;
		gap: 0.1rem;
		color: #59665d;
		font-size: 0.8rem;
		font-variant-numeric: tabular-nums;
	}
	.view-zoom-value > span {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
	}
	.view-zoom-value input {
		width: 3.25rem;
		border: 1px solid #d2dad4;
		border-radius: 0.3rem;
		padding: 0.25rem 0.15rem;
		color: inherit;
		font: inherit;
		text-align: right;
	}
	.view-zoom-value small {
		font-size: inherit;
	}
	.stage {
		display: flex;
		flex: 1 1 0;
		min-height: 0;
		min-width: 0;
		width: 100%;
		height: 100%;
		max-width: 100%;
		align-items: safe center;
		justify-content: safe center;
		overflow: auto;
		scroll-behavior: auto;
		padding: 0.35rem;
	}
	.stage.hand {
		touch-action: none;
		cursor: grab;
	}
	.stage.panning {
		cursor: grabbing;
		user-select: none;
	}
	.image-wrap {
		position: relative;
		display: inline-flex;
		flex: none;
		visibility: hidden;
		transition: none;
	}
	.image-wrap.ready {
		visibility: visible;
	}
	img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: contain;
		user-select: none;
		transition: none;
	}
	.error {
		z-index: 3;
		justify-self: center;
		margin: 0.2rem;
		border-radius: 0.4rem;
		background: #fff2f2;
		padding: 0.5rem 0.7rem;
		color: #8a2626;
		font-size: 0.82rem;
	}
	@media (max-width: 520px) {
		.stage {
			padding: 0.2rem;
		}
	}
</style>
