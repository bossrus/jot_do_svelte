<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import { localeVersion } from '$lib/client/locale';
	$localeVersion;
	import { objectCenter } from '$lib/client/markup/geometry';
	import type { ImageMarkupObject, MarkupPoint } from '$lib/client/markup/types';

	let {
		objects,
		imageWidth,
		imageHeight
	}: { objects: ImageMarkupObject[]; imageWidth: number; imageHeight: number } = $props();

	function pathData(points: MarkupPoint[], offset: MarkupPoint) {
		return points
			.map(
				(point, index) =>
					`${index ? 'L' : 'M'} ${(point.x + offset.x) * imageWidth} ${(point.y + offset.y) * imageHeight}`
			)
			.join(' ');
	}

	function transform(object: ImageMarkupObject) {
		const center = objectCenter(object);
		return `translate(${center.x * imageWidth} ${center.y * imageHeight}) rotate(${object.transform.rotation}) scale(${object.transform.scale}) translate(${-center.x * imageWidth} ${-center.y * imageHeight})`;
	}
</script>

{#if objects.length && imageWidth > 0 && imageHeight > 0}
	<svg
		viewBox={`0 0 ${imageWidth} ${imageHeight}`}
		preserveAspectRatio="xMidYMid meet"
		aria-hidden="true"
	>
		{#each objects as object (object.id)}
			<g transform={transform(object)}>
				{#if object.type === 'path'}
					<path
						d={pathData(object.points, {
							x: object.transform.x,
							y: object.transform.y
						})}
						stroke={object.color}
						stroke-width={object.width * Math.min(imageWidth, imageHeight)}
					/>
				{:else}
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
	</svg>
{/if}

<style>
	svg {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
	}
	path {
		fill: none;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	text {
		font-family: Inter, ui-sans-serif, system-ui, sans-serif;
		pointer-events: none;
		user-select: none;
	}
</style>
