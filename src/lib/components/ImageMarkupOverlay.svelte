<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import { localeVersion } from '$lib/client/locale';
	$localeVersion;
	import { tick } from 'svelte';
	import {
		applyMove,
		applyRotation,
		applyScale,
		calculateRotation,
		calculateScale,
		getPathBounds,
		objectCenter
	} from '$lib/client/markup/geometry';
	import type {
		ImageMarkupObject,
		MarkupPoint,
		PathMarkup,
		TextMarkup
	} from '$lib/client/markup/types';
	import { cloneObjects } from '$lib/client/markup/state';
	import MarkupSelection from './MarkupSelection.svelte';

	let {
		objects,
		selectedId,
		tool,
		color,
		pencilWidth,
		imageWidth,
		imageHeight,
		onselect,
		oncreate,
		ontransform,
		ontransformstart,
		ontransformend,
		ontextend
	}: {
		objects: ImageMarkupObject[];
		selectedId: string | null;
		tool: 'pencil' | 'text' | 'hand';
		color: string;
		pencilWidth: number;
		imageWidth: number;
		imageHeight: number;
		onselect: (id: string | null) => void;
		oncreate: (object: ImageMarkupObject) => void;
		ontransform: (object: ImageMarkupObject) => void;
		ontransformstart: () => void;
		ontransformend: () => void;
		ontextend: () => void;
	} = $props();
	let svg = $state<SVGSVGElement>();
	let cssWidth = $state(1);
	let cssHeight = $state(1);
	let draft = $state<MarkupPoint[]>([]);
	let drawingPointer: number | null = null;
	let editingId = $state<string | null>(null);
	let textEditor = $state<HTMLInputElement>();
	let lastTextPointerDown: { id: string; at: number } | null = null;
	let gesture: {
		kind: 'move' | 'scale' | 'rotate';
		pointerId: number;
		original: ImageMarkupObject;
		start: MarkupPoint;
		center: MarkupPoint;
		startDistance: number;
	} | null = null;
	let selected = $derived(objects.find((object) => object.id === selectedId) ?? null);
	let editingObject = $derived(
		objects.find(
			(object): object is TextMarkup => object.id === editingId && object.type === 'text'
		) ?? null
	);
	let workspaceCursor = $derived.by(() => {
		if (tool === 'hand') return 'grab';
		if (tool === 'text') return 'text';
		const diameter = Math.max(2, pencilWidth);
		const size = diameter + 4;
		const center = size / 2;
		const cursorSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${center}" cy="${center}" r="${diameter / 2}" fill="${color}" stroke="white" stroke-width="1"/></svg>`;
		return `url("data:image/svg+xml,${encodeURIComponent(cursorSvg)}") ${center} ${center}, crosshair`;
	});

	$effect(() => {
		if (!svg) return;
		const observer = new ResizeObserver(() => {
			const rect = svg?.getBoundingClientRect();
			cssWidth = rect?.width ?? 1;
			cssHeight = rect?.height ?? 1;
		});
		observer.observe(svg);
		return () => observer.disconnect();
	});

	function point(event: PointerEvent): MarkupPoint {
		const rect = svg!.getBoundingClientRect();
		return {
			x: (event.clientX - rect.left) / rect.width,
			y: (event.clientY - rect.top) / rect.height
		};
	}
	function pixelPoint(value: MarkupPoint) {
		return { x: value.x * imageWidth, y: value.y * imageHeight };
	}
	function pathData(points: MarkupPoint[], offset: MarkupPoint = { x: 0, y: 0 }) {
		return points
			.map(
				(p, index) =>
					`${index ? 'L' : 'M'} ${(p.x + offset.x) * imageWidth} ${(p.y + offset.y) * imageHeight}`
			)
			.join(' ');
	}
	function transform(object: ImageMarkupObject) {
		const center = objectCenter(object);
		return `translate(${center.x * imageWidth} ${center.y * imageHeight}) rotate(${object.transform.rotation}) scale(${object.transform.scale}) translate(${-center.x * imageWidth} ${-center.y * imageHeight})`;
	}
	function backgroundDown(event: PointerEvent) {
		if (event.button !== 0) return;
		if (tool === 'hand') return;
		onselect(null);
		if (tool === 'text') {
			createText(point(event));
			return;
		}
		drawingPointer = event.pointerId;
		svg?.setPointerCapture(event.pointerId);
		draft = [point(event)];
		event.preventDefault();
	}
	function pointerMove(event: PointerEvent) {
		if (drawingPointer === event.pointerId) {
			draft = [...draft, point(event)];
			event.preventDefault();
			return;
		}
		if (!gesture || gesture.pointerId !== event.pointerId) return;
		const current = point(event);
		if (gesture.kind === 'move')
			ontransform(
				applyMove(gesture.original, current.x - gesture.start.x, current.y - gesture.start.y)
			);
		else if (gesture.kind === 'scale')
			ontransform(
				applyScale(
					gesture.original,
					calculateScale(
						gesture.original.transform.scale,
						gesture.startDistance,
						Math.hypot(
							(current.x - gesture.center.x) * imageWidth,
							(current.y - gesture.center.y) * imageHeight
						)
					)
				)
			);
		else
			ontransform(
				applyRotation(
					gesture.original,
					calculateRotation(
						gesture.original.transform.rotation,
						pixelPoint(gesture.center),
						pixelPoint(gesture.start),
						pixelPoint(current)
					)
				)
			);
		event.preventDefault();
	}
	function pointerUp(event: PointerEvent) {
		if (drawingPointer === event.pointerId) {
			drawingPointer = null;
			const global =
				draft.length === 1 ? [draft[0], { x: draft[0].x + 0.0001, y: draft[0].y + 0.0001 }] : draft;
			const bounds = getPathBounds(global);
			const object: PathMarkup = {
				id: crypto.randomUUID(),
				type: 'path',
				transform: { x: bounds.x, y: bounds.y, scale: 1, rotation: 0 },
				points: global.map((p) => ({ x: p.x - bounds.x, y: p.y - bounds.y })),
				bounds: { width: Math.max(bounds.width, 0.0001), height: Math.max(bounds.height, 0.0001) },
				color,
				width: pencilWidth / Math.min(cssWidth, cssHeight)
			};
			draft = [];
			oncreate(object);
			onselect(object.id);
		}
		if (gesture?.pointerId === event.pointerId) {
			gesture = null;
			ontransformend();
		}
	}
	async function createText(at: MarkupPoint) {
		const object: TextMarkup = {
			id: crypto.randomUUID(),
			type: 'text',
			transform: { x: at.x, y: at.y, scale: 1, rotation: 0 },
			text: m.markup_text(),
			bounds: { width: 0.18, height: 0.06 },
			color
		};
		oncreate(object);
		onselect(object.id);
	}
	async function editText(event: MouseEvent, object: TextMarkup) {
		event.stopPropagation();
		event.preventDefault();
		onselect(object.id);
		editingId = object.id;
		await tick();
		window.setTimeout(() => {
			if (editingId !== object.id) return;
			textEditor?.focus();
			textEditor?.select();
		}, 50);
	}
	function objectDown(event: PointerEvent, object: ImageMarkupObject) {
		if (editingId) {
			event.stopPropagation();
			return;
		}
		event.stopPropagation();
		onselect(object.id);
		beginGesture('move', event, object);
	}
	function beginGesture(
		kind: 'move' | 'scale' | 'rotate',
		event: PointerEvent,
		object = selected!
	) {
		if (kind === 'move' && object.type === 'text') {
			const now = performance.now();
			if (lastTextPointerDown?.id === object.id && now - lastTextPointerDown.at < 500) {
				lastTextPointerDown = null;
				void editText(event, object);
				return;
			}
			lastTextPointerDown = { id: object.id, at: now };
		}
		event.stopPropagation();
		event.preventDefault();
		ontransformstart();
		svg?.setPointerCapture(event.pointerId);
		const start = point(event);
		const center = objectCenter(object);
		gesture = {
			kind,
			pointerId: event.pointerId,
			original: cloneObjects([object])[0],
			start,
			center,
			startDistance: Math.hypot(
				(start.x - center.x) * imageWidth,
				(start.y - center.y) * imageHeight
			)
		};
	}
	function updateText(id: string, value: string) {
		const object = objects.find(
			(item): item is TextMarkup => item.id === id && item.type === 'text'
		);
		if (!object) return;
		const font = 0.045 * Math.min(imageWidth, imageHeight);
		ontransform({
			...object,
			text: value,
			bounds: {
				width: Math.max(0.08, (value.length * font * 0.62) / imageWidth),
				height: (font * 1.35) / imageHeight
			}
		});
	}
</script>

<div class="overlay" style:pointer-events={tool === 'hand' ? 'none' : 'auto'}>
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<svg
		bind:this={svg}
		viewBox={`0 0 ${imageWidth} ${imageHeight}`}
		preserveAspectRatio="none"
		aria-label={m.image_markup()}
		style:cursor={workspaceCursor}
		onpointerdown={backgroundDown}
		onpointermove={pointerMove}
		onpointerup={pointerUp}
		onpointercancel={pointerUp}
	>
		{#each objects as object (object.id)}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<g
				transform={transform(object)}
				class="object"
				onpointerdown={(event) => objectDown(event, object)}
				ondblclick={(event) => object.type === 'text' && editText(event, object)}
			>
				{#if object.type === 'path'}
					<path
						class="path-hit"
						d={pathData(object.points, { x: object.transform.x, y: object.transform.y })}
						stroke-width={Math.max(
							object.width * Math.min(imageWidth, imageHeight),
							(18 * imageWidth) / cssWidth
						)}
					/>
					<path
						d={pathData(object.points, { x: object.transform.x, y: object.transform.y })}
						stroke={object.color}
						stroke-width={object.width * Math.min(imageWidth, imageHeight)}
					/>
				{:else if editingId !== object.id}
					<text
						x={object.transform.x * imageWidth}
						y={(object.transform.y + object.bounds.height * 0.8) * imageHeight}
						fill={object.color}
						font-size={0.045 * Math.min(imageWidth, imageHeight)}
						>{object.text || m.markup_text()}</text
					>
				{/if}
			</g>
		{/each}
		{#if draft.length}<path
				d={pathData(draft)}
				stroke={color}
				stroke-width={(pencilWidth * imageWidth) / cssWidth}
			/>{/if}
		{#if selected && editingId !== selected.id}<MarkupSelection
				object={selected}
				{imageWidth}
				{imageHeight}
				{cssWidth}
				ongesture={beginGesture}
				onedit={(event) => selected.type === 'text' && editText(event, selected)}
			/>{/if}
	</svg>
	{#if editingObject}
		<input
			bind:this={textEditor}
			class="text-editor"
			value={editingObject.text}
			aria-label={m.edit_markup_text()}
			style={`left:${editingObject.transform.x * 100}%;top:${editingObject.transform.y * 100}%;width:${Math.max(editingObject.bounds.width * cssWidth, 100)}px;color:${editingObject.color};font-size:${0.045 * Math.min(cssWidth, cssHeight)}px;transform:rotate(${editingObject.transform.rotation}deg) scale(${editingObject.transform.scale})`}
			oninput={(event) => updateText(editingObject.id, event.currentTarget.value)}
			onpointerdown={(event) => event.stopPropagation()}
			onclick={(event) => event.stopPropagation()}
			onkeydown={(event) => {
				if (event.key === 'Enter') {
					event.preventDefault();
					event.currentTarget.blur();
				}
			}}
			onblur={() => {
				editingId = null;
				ontextend();
			}}
		/>
	{/if}
</div>

<style>
	.overlay {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
	}
	svg {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		overflow: visible;
		touch-action: none;
		user-select: none;
	}
	path {
		fill: none;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.path-hit {
		stroke: transparent;
	}
	.object {
		cursor: move;
	}
	.text-editor {
		position: absolute;
		z-index: 2;
		min-width: 100px;
		border: 1px solid var(--color-accent);
		background: rgb(255 255 255 / 92%);
		outline: 0;
		font-family: Inter, system-ui, sans-serif;
		transform-origin: center;
	}
</style>
