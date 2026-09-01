<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import { localeVersion } from '$lib/client/locale';
	$localeVersion;
	import {
		IconArrowBackUp,
		IconHandGrab,
		IconPencil,
		IconTrash,
		IconTypography,
		IconZoomIn,
		IconZoomOut
	} from '@tabler/icons-svelte-runes';

	let {
		tool,
		color,
		width,
		canDelete,
		canUndo,
		zoom,
		ontool,
		oncolor,
		oncolorcommit,
		onwidth,
		onwidthcommit,
		ondelete,
		onundo,
		onzoomout,
		onzoomin,
		onzoomchange
	}: {
		tool: 'pencil' | 'text' | 'hand';
		color: string;
		width: number;
		canDelete: boolean;
		canUndo: boolean;
		zoom: number;
		ontool: (tool: 'pencil' | 'text' | 'hand') => void;
		oncolor: (color: string) => void;
		oncolorcommit: () => void;
		onwidth: (width: number) => void;
		onwidthcommit: () => void;
		ondelete: () => void;
		onundo: () => void;
		onzoomout: () => void;
		onzoomin: () => void;
		onzoomchange: (percent: number) => void;
	} = $props();
</script>

<div class="toolbar" role="toolbar" aria-label={m.markup_tools()}>
	<div class="tool-group modes">
		<button
			type="button"
			class:active={tool === 'pencil'}
			aria-pressed={tool === 'pencil'}
			onclick={() => ontool('pencil')}><IconPencil size={19} /><span>{m.pencil()}</span></button
		>
		<button
			type="button"
			class:active={tool === 'text'}
			aria-pressed={tool === 'text'}
			onclick={() => ontool('text')}
			><IconTypography size={19} /><span>{m.markup_text()}</span></button
		>
		<button
			type="button"
			class:active={tool === 'hand'}
			aria-pressed={tool === 'hand'}
			onclick={() => ontool('hand')}><IconHandGrab size={19} /><span>{m.hand()}</span></button
		>
	</div>
	<div class="divider"></div>
	<div class="tool-group history">
		<button
			type="button"
			aria-label={m.undo()}
			title={m.undo()}
			disabled={!canUndo}
			onclick={onundo}><IconArrowBackUp size={19} /></button
		>
		<button
			type="button"
			class="danger"
			aria-label={m.delete_selected()}
			title={m.delete_selected()}
			disabled={!canDelete}
			onclick={ondelete}><IconTrash size={19} /></button
		>
	</div>
	<div class="zoom-control">
		<button type="button" aria-label={m.zoom_out()} disabled={zoom <= 0.25} onclick={onzoomout}
			><IconZoomOut size={18} /></button
		>
		<label class="zoom-value">
			<span>{m.zoom()}</span>
			<input
				aria-label={m.zoom_percent()}
				type="number"
				min="25"
				max="400"
				step="10"
				value={Math.round(zoom * 100)}
				onchange={(event) => onzoomchange(Number(event.currentTarget.value))}
			/>
			<small>%</small>
		</label>
		<button type="button" aria-label={m.zoom_in()} disabled={zoom >= 4} onclick={onzoomin}
			><IconZoomIn size={18} /></button
		>
	</div>
	<div class="brush-settings">
		<label class="color" title={m.pencil_color()}
			><span>{m.color()}</span><input
				aria-label={m.pencil_color()}
				type="color"
				value={color}
				oninput={(event) => oncolor(event.currentTarget.value)}
				onchange={oncolorcommit}
			/></label
		>
		<label class="width"
			><span>{m.thickness()}</span><input
				aria-label={m.pencil_thickness()}
				type="range"
				min="1"
				max="48"
				step="1"
				value={width}
				oninput={(event) => onwidth(Number(event.currentTarget.value))}
				onchange={onwidthcommit}
				onpointerdown={(event) => event.stopPropagation()}
			/><output aria-live="polite">{width}px</output></label
		>
	</div>
</div>

<style>
	.toolbar {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		min-width: 0;
		overflow-x: auto;
		padding: 0.2rem 0.25rem;
		scrollbar-width: thin;
	}
	.tool-group,
	.zoom-control,
	.brush-settings {
		display: flex;
		flex: none;
		align-items: center;
		gap: 0.25rem;
		padding: 0.25rem;
		border: 1px solid #dbe3ee;
		border-radius: 11px;
		background: #f7f9fc;
	}
	button {
		display: flex;
		height: 36px;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		border: 0;
		border-radius: 8px;
		background: transparent;
		padding: 0 0.65rem;
		color: #4b5563;
		cursor: pointer;
		white-space: nowrap;
	}
	button:hover {
		background: #fff;
		color: var(--color-accent);
	}
	button.active {
		background: var(--color-accent);
		color: #fff;
		box-shadow: 0 3px 9px rgb(8 102 237 / 22%);
	}
	button:disabled {
		cursor: not-allowed;
		opacity: 0.38;
	}
	.history button {
		width: 36px;
		padding: 0;
	}
	.history .danger:hover {
		color: #e5484d;
	}
	.divider {
		width: 1px;
		height: 28px;
		flex: none;
		background: #e2e8f0;
	}
	.zoom-control {
		gap: 0;
		background: #fff;
	}
	.zoom-control > button {
		width: 34px;
		padding: 0;
	}
	.brush-settings {
		background: #fff;
	}
	label {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		color: #59665d;
		font-size: 0.72rem;
	}
	.color span {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
	}
	.color input {
		width: 2.1rem;
		height: 2.1rem;
		border: 0;
		background: transparent;
		padding: 0.2rem;
		cursor: pointer;
	}
	.width input {
		width: clamp(7rem, 18vw, 11rem);
		accent-color: var(--color-accent);
		touch-action: none;
		cursor: pointer;
	}
	.width output {
		width: 2.6rem;
		font-variant-numeric: tabular-nums;
		text-align: right;
	}
	.zoom-value {
		display: flex;
		width: 4rem;
		gap: 0.1rem;
		color: #59665d;
		font-size: 0.72rem;
		font-variant-numeric: tabular-nums;
	}
	.zoom-value > span {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
	}
	.zoom-value input {
		width: 2.9rem;
		border: 0;
		border-radius: 0.3rem;
		padding: 0.25rem 0.15rem;
		color: inherit;
		font: inherit;
		text-align: right;
	}
	.zoom-value small {
		font-size: inherit;
	}
	@media (max-width: 520px) {
		.toolbar {
			width: 100%;
			justify-content: flex-start;
		}
		.modes button span {
			display: none;
		}
		.modes button {
			width: 38px;
			padding: 0;
		}
		.width span {
			display: none;
		}
		.width input {
			width: 6rem;
		}
		.width output {
			width: 2.35rem;
		}
	}
</style>
