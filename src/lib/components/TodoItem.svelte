<script lang="ts">
	import type { TodoContentBlock } from '$lib/client/content-blocks';
	import type { LocalTodoStatus } from '$lib/client/db/database';
	import type { TodoAccessParticipant } from '$lib/todos/access-contracts';
	import {
		getTodoHoverText,
		getTodoImageCount,
		getTodoPreviewText
	} from '$lib/client/todo-preview';
	import {
		IconCircleCheck,
		IconCircleX,
		IconMessage,
		IconPencil,
		IconPhoto,
		IconPlayerPlay,
		IconLogout,
		IconRotateClockwise,
		IconRepeat,
		IconTrash,
		IconDots
	} from '@tabler/icons-svelte-runes';
	import IconButton from './IconButton.svelte';
	import { m } from '$lib/paraglide/messages';
	import { localeVersion } from '$lib/client/locale';
	$localeVersion;

	let {
		blocks,
		status,
		unreadMessageCount = 0,
		canEdit = false,
		canClose = false,
		canTake = false,
		canFinish = false,
		isCurrentUserWorking = false,
		isCurrentUserDone = false,
		workerNames = [],
		accessParticipants = [],
		accessGroupNames = [],
		authorName = null,
		showAccessDetails = false,
		joinLabel = m.start_work(),
		onedit,
		onclose,
		onreopen,
		ondelete,
		ontake,
		onfinish,
		onresume,
		onleave,
		onleaveandclose,
		onopen,
		onrepeat,
		onsettings,
		isAutomatic = false
	}: {
		blocks: TodoContentBlock[];
		status: LocalTodoStatus;
		unreadMessageCount?: number;
		canEdit?: boolean;
		canClose?: boolean;
		canTake?: boolean;
		canFinish?: boolean;
		isCurrentUserWorking?: boolean;
		isCurrentUserDone?: boolean;
		workerNames?: string[];
		accessParticipants?: TodoAccessParticipant[];
		accessGroupNames?: string[];
		authorName?: string | null;
		showAccessDetails?: boolean;
		joinLabel?: string;
		onedit?: () => void;
		onclose?: () => void;
		onreopen?: () => void;
		ondelete?: () => void;
		ontake?: () => void;
		onfinish?: () => void;
		onresume?: () => void;
		onleave?: () => void;
		onleaveandclose?: () => void;
		onopen?: () => void;
		onrepeat?: () => void;
		onsettings?: () => void;
		isAutomatic?: boolean;
	} = $props();

	let previewText = $derived(getTodoPreviewText(blocks));
	let hoverText = $derived(getTodoHoverText(blocks));
	let imageCount = $derived(getTodoImageCount(blocks));
	let isOnlyWorker = $derived(workerNames.length === 1);
	let accessiblePeople = $derived([
		...(authorName ? [{ userId: 'author', email: '', name: authorName, isAuthor: true }] : []),
		...accessParticipants.map((participant) => ({ ...participant, isAuthor: false }))
	]);
	function participantName(participant: TodoAccessParticipant) {
		return participant.name?.trim() || participant.email;
	}
	function initial(name: string) {
		return name.trim().charAt(0).toLocaleUpperCase('ru') || '?';
	}
	let showLeaveAndClose = $derived(
		Boolean(
			onleaveandclose && canClose && isOnlyWorker && (isCurrentUserWorking || isCurrentUserDone)
		)
	);
</script>

<div class:closed={status === 'closed'} class="todo-item">
	<span class="status" aria-label={status === 'active' ? m.active_todo() : m.closed_todo()}></span>
	<button class="main" type="button" title={m.open_todo()} disabled={!onopen} onclick={onopen}>
		<span class="preview-wrap">
			<span class="preview">{previewText}</span>
			{#if hoverText}<span class="hover-preview" role="tooltip">{hoverText}</span>{/if}
		</span>
		{#if imageCount > 0}<span class="indicator" aria-label={m.image_count({ count: imageCount })}
				><IconPhoto size={17} stroke={1.8} aria-hidden="true" /><span>{imageCount}</span></span
			>{/if}
		{#if unreadMessageCount > 0}<span
				class="indicator"
				aria-label={m.unread_count({ count: unreadMessageCount })}
				><IconMessage size={17} stroke={1.8} aria-hidden="true" /><span>{unreadMessageCount}</span
				></span
			>{/if}
		{#if isAutomatic}<span class="automatic" title={m.created_automatically()}
				>{m.automatic_short()}</span
			>{/if}
	</button>
	<div class="actions" aria-label={m.todo_actions()}>
		{#if status === 'active'}
			{#if canTake && !isCurrentUserWorking && !isCurrentUserDone}<IconButton
					icon={IconPlayerPlay}
					label={joinLabel}
					onclick={() => ontake?.()}
				/>{/if}
			{#if canFinish && isCurrentUserWorking && !isCurrentUserDone}<IconButton
					icon={IconCircleCheck}
					label={m.done_by_me()}
					onclick={() => onfinish?.()}
				/>{/if}
			{#if canFinish && isCurrentUserDone}<IconButton
					icon={IconRotateClockwise}
					label={m.return()}
					onclick={() => onresume?.()}
				/>{/if}
			{#if canFinish && (isCurrentUserWorking || isCurrentUserDone)}<IconButton
					icon={IconLogout}
					label={m.leave_todo()}
					onclick={() => onleave?.()}
				/>{/if}
			{#if canEdit}<IconButton icon={IconPencil} label={m.edit()} onclick={() => onedit?.()} />{/if}
			{#if canClose}<IconButton
					icon={IconCircleX}
					label={m.close()}
					onclick={() => onclose?.()}
				/>{/if}
		{:else}
			{#if onreopen}<IconButton
					icon={IconRotateClockwise}
					label={m.reopen()}
					onclick={() => onreopen?.()}
				/>{/if}
			{#if ondelete}<IconButton
					icon={IconTrash}
					label={m.delete()}
					onclick={() => ondelete?.()}
				/>{/if}
		{/if}
		{#if onrepeat}
			<button
				class="design-action repeat"
				type="button"
				title={m.repeat()}
				aria-label={m.repeat()}
				onclick={() => onrepeat?.()}><IconRepeat size={23} /></button
			>
		{/if}
		{#if canTake && !isCurrentUserWorking && !isCurrentUserDone}
			<button
				class="design-action play"
				type="button"
				title={joinLabel}
				aria-label={joinLabel}
				onclick={() => ontake?.()}><IconPlayerPlay size={23} /></button
			>
		{/if}
		{#if canFinish && isCurrentUserDone}
			<button
				class="design-action play"
				type="button"
				title={m.reopen()}
				aria-label={m.reopen()}
				onclick={() => onresume?.()}><IconPlayerPlay size={23} /></button
			>
		{/if}
		{#if canFinish && isCurrentUserWorking}
			<button
				class="design-action done"
				type="button"
				title={m.finished_my_part()}
				aria-label={m.finished_my_part()}
				onclick={() => onfinish?.()}><IconCircleCheck size={23} /></button
			>
		{/if}
		{#if showLeaveAndClose}
			<button
				class="design-action leave"
				type="button"
				title={m.leave_and_close()}
				aria-label={m.leave_and_close()}
				onclick={() => onleaveandclose?.()}><IconCircleX size={23} /></button
			>
		{:else if canFinish && (isCurrentUserWorking || isCurrentUserDone)}
			<button
				class="design-action leave"
				type="button"
				title={m.leave_work()}
				aria-label={m.leave_work()}
				onclick={() => onleave?.()}><IconLogout size={23} /></button
			>
		{/if}
		{#if canClose && !showLeaveAndClose}
			<button
				class="design-action close"
				type="button"
				title={m.close_todo()}
				aria-label={m.close_todo()}
				onclick={() => onclose?.()}><IconCircleX size={23} /></button
			>
		{/if}
		<span class="access-wrap">
			<button
				class="access-button"
				type="button"
				title={m.todo_settings()}
				aria-label={m.todo_settings()}
				disabled={!onsettings}
				onclick={() => onsettings?.()}><IconDots size={22} /></button
			>
			<span class="access-card" role="tooltip">
				<strong>{m.todo_access()}</strong><small>{m.workers()}</small>
				{#if workerNames.length}
					<span class="people">
						{#each workerNames as worker, index (index)}<span class="person"
								><i>{initial(worker)}</i>{worker}</span
							>{/each}
					</span>
				{:else}<span class="empty-access">—</span>{/if}
				{#if showAccessDetails}
					<small>{m.has_access()}</small>
					{#each accessiblePeople as participant (participant.userId)}
						<span class="access-user"
							><i>{initial(participant.name || participant.email)}</i><span
								>{participant.isAuthor
									? participant.name
									: participantName(participant)}{#if participant.isAuthor}<small
										>{m.author()}</small
									>{/if}</span
							></span
						>
					{:else}<span class="empty-access">—</span>{/each}
					<hr />
					<small>{m.groups()}</small>
					{#each accessGroupNames as group, index (index)}<span class="group">♙ {group}</span
						>{:else}<span class="empty-access">—</span>{/each}
				{:else}
					<small>{m.author()}</small>
					{#if authorName}<span class="access-user"
							><i>{initial(authorName)}</i><span>{authorName}</span></span
						>{:else}<span class="empty-access">—</span>{/if}
				{/if}
			</span>
		</span>
	</div>
</div>

<style>
	.todo-item {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
		gap: 0.55rem;
		min-height: 84px;
		padding: 8px 26px 8px 0;
	}
	.status {
		display: none;
	}
	.closed .status {
		border-color: #326a4b;
		background: #326a4b;
		box-shadow: inset 0 0 0 2px #f6f7f4;
	}
	.main {
		display: flex;
		min-width: 0;
		align-items: center;
		gap: 0.75rem;
		border: 0;
		background: transparent;
		padding: 0.35rem 0;
		color: inherit;
		text-align: left;
	}
	.main:disabled {
		cursor: default;
		opacity: 1;
	}
	.preview-wrap {
		position: relative;
		min-width: 0;
		flex: 1;
	}
	.preview {
		display: block;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
		font-size: 18px;
		color: #171717;
	}
	.closed .preview {
		color: #778179;
		text-decoration: line-through;
	}
	.hover-preview {
		position: absolute;
		top: calc(100% + 0.55rem);
		left: 0;
		z-index: 20;
		width: max-content;
		max-width: min(28rem, calc(100vw - 5rem));
		max-height: min(22rem, 60vh);
		overflow: auto;
		border: 1px solid #d4d9d5;
		border-radius: 0.55rem;
		background: #fff;
		padding: 0.7rem 0.8rem;
		box-shadow: 0 12px 30px rgb(28 36 31 / 16%);
		color: #253029;
		font-size: 0.85rem;
		line-height: 1.45;
		opacity: 0;
		pointer-events: none;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		transform: translateY(-0.2rem);
		transition:
			opacity 100ms,
			transform 100ms;
	}
	.preview-wrap:hover .hover-preview,
	.main:focus-visible .hover-preview {
		opacity: 1;
		transform: translateY(0);
	}
	.indicator {
		display: inline-flex;
		flex: none;
		align-items: center;
		gap: 0.22rem;
		color: #68746b;
		font-size: 0.78rem;
		font-variant-numeric: tabular-nums;
	}
	.automatic {
		border-radius: 1rem;
		background: #e7efe9;
		padding: 0.15rem 0.4rem;
		color: #326a4b;
		font-size: 0.7rem;
	}
	.actions {
		display: flex;
		flex: none;
		align-items: center;
		gap: 18px;
	}
	.actions :global(.icon-button-wrap) {
		display: none;
	}
	.design-action,
	.access-button {
		display: grid;
		place-items: center;
		width: 54px;
		height: 50px;
		border: 1px solid #dbe3ee;
		border-radius: 11px;
		background: #f4f8ff;
		color: var(--color-accent);
		cursor: pointer;
	}
	.access-button:disabled {
		cursor: default;
	}
	.design-action.done {
		background: #effaf5;
		color: #00a66a;
		border-color: #e0f4e9;
	}
	.design-action.leave {
		background: #fff4f3;
		color: #d43a31;
		border-color: #ffebe9;
	}
	.design-action.close {
		background: #fff4f3;
		color: #d43a31;
		border-color: #ffebe9;
	}
	.design-action:disabled {
		cursor: not-allowed;
		opacity: 0.42;
	}
	.access-wrap {
		position: relative;
		display: inline-flex;
	}
	.access-button {
		display: grid;
		place-items: center;
		background: #fafbfc !important;
		color: #111 !important;
		cursor: pointer;
	}
	.access-card {
		position: absolute;
		z-index: 50;
		right: -12px;
		top: calc(100% + 12px);
		display: grid;
		width: 234px;
		gap: 9px;
		border: 1px solid #dbe1e8;
		border-radius: 12px;
		background: #fff;
		padding: 18px 20px;
		box-shadow: 0 12px 30px rgb(15 23 42 / 14%);
		font-size: 13px;
		opacity: 0;
		pointer-events: none;
		transform: translateY(-5px);
		transition: 0.14s;
	}
	.access-card:before {
		content: '';
		position: absolute;
		right: 25px;
		top: -7px;
		width: 12px;
		height: 12px;
		border-left: 1px solid #dbe1e8;
		border-top: 1px solid #dbe1e8;
		background: white;
		transform: rotate(45deg);
	}
	.access-wrap:hover .access-card,
	.access-button:focus-visible + .access-card {
		opacity: 1;
		transform: none;
	}
	.access-card strong {
		font-size: 14px;
	}
	.access-card small {
		color: #647184;
	}
	.people {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 7px;
	}
	.person {
		display: inline-flex;
		align-items: center;
		gap: 5px;
	}
	.empty-access {
		color: #8993a2;
		font-size: 12px;
	}
	.access-card i {
		display: grid;
		width: 31px;
		height: 31px;
		place-items: center;
		border-radius: 50%;
		background: #c68b69;
		color: white;
		font-style: normal;
		font-size: 11px;
	}
	.access-user {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.access-user > span {
		display: grid;
	}
	.access-user small {
		font-size: 10px;
	}
	.access-card hr {
		width: 100%;
		border: 0;
		border-top: 1px solid #e4e8ee;
		margin: 2px 0;
	}
	.group {
		color: #171717;
	}
	.group:first-letter {
		color: var(--color-accent);
	}
	.main:focus-visible {
		border-radius: 0.3rem;
		outline: 3px solid rgb(50 106 75 / 28%);
		outline-offset: 1px;
	}
	@media (hover: none) {
		.hover-preview {
			display: none;
		}
	}
	@media (max-width: 520px) {
		.todo-item {
			grid-template-columns: minmax(0, 1fr) auto;
			gap: 0.4rem;
			padding: 0.4rem 0.65rem 0.4rem 0;
		}
		.main {
			gap: 0.45rem;
		}
		.actions {
			grid-column: 2;
			gap: 0.4rem;
			justify-self: end;
			margin-top: -0.15rem;
		}
		.design-action,
		.access-button {
			width: 2.75rem;
			height: 2.75rem;
		}
	}
</style>
