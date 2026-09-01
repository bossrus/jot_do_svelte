<script lang="ts">
	import type { ImageMarkupObject } from '$lib/client/markup/types';

	let {
		object,
		imageWidth,
		imageHeight,
		cssWidth,
		ongesture,
		onedit
	}: {
		object: ImageMarkupObject;
		imageWidth: number;
		imageHeight: number;
		cssWidth: number;
		ongesture: (kind: 'move' | 'scale' | 'rotate', event: PointerEvent) => void;
		onedit?: (event: MouseEvent) => void;
	} = $props();
	let cx = $derived((object.transform.x + object.bounds.width / 2) * imageWidth);
	let cy = $derived((object.transform.y + object.bounds.height / 2) * imageHeight);
	let width = $derived(object.bounds.width * imageWidth * object.transform.scale);
	let height = $derived(object.bounds.height * imageHeight * object.transform.scale);
	let unit = $derived(imageWidth / Math.max(cssWidth, 1));
	let handleRadius = $derived(7 * unit);
	let hitRadius = $derived(18 * unit);
	let rotationOffset = $derived(30 * unit);
</script>

<g transform={`translate(${cx} ${cy}) rotate(${object.transform.rotation})`} class="selection">
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<rect
		class="move"
		x={-width / 2}
		y={-height / 2}
		{width}
		{height}
		onpointerdown={(event) => ongesture('move', event)}
		ondblclick={(event) => onedit?.(event)}
	/>
	<line x1="0" y1={-height / 2} x2="0" y2={-height / 2 - rotationOffset} />
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<circle
		class="hit"
		cx={width / 2}
		cy={height / 2}
		r={hitRadius}
		onpointerdown={(event) => ongesture('scale', event)}
	/>
	<circle class="handle scale" cx={width / 2} cy={height / 2} r={handleRadius} />
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<circle
		class="hit"
		cx="0"
		cy={-height / 2 - rotationOffset}
		r={hitRadius}
		onpointerdown={(event) => ongesture('rotate', event)}
	/>
	<circle class="handle" cx="0" cy={-height / 2 - rotationOffset} r={handleRadius} />
</g>

<style>
	.selection {
		touch-action: none;
	}
	.selection rect,
	.selection line {
		fill: rgb(255 255 255 / 5%);
		stroke: var(--color-accent);
		stroke-width: 1.5;
		vector-effect: non-scaling-stroke;
	}
	.move {
		cursor: move;
	}
	.handle {
		fill: #fff;
		stroke: var(--color-accent);
		stroke-width: 2;
		vector-effect: non-scaling-stroke;
		pointer-events: none;
	}
	.handle.scale {
		fill: var(--color-accent);
	}
	.hit {
		fill: transparent;
		stroke: none;
		cursor: grab;
	}
</style>
