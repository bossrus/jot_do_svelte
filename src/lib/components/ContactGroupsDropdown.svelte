<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import { localeVersion } from '$lib/client/locale';
	$localeVersion;
	import {
		IconCheck,
		IconChevronDown,
		IconCopy,
		IconEdit,
		IconPlus,
		IconTrash,
		IconUsersGroup
	} from '@tabler/icons-svelte-runes';
	import type { Friend, FriendGroup } from '$lib/friends/contracts';
	import IconButton from './IconButton.svelte';
	import Input from './Input.svelte';
	type Placement =
		| 'bottom-left'
		| 'bottom-right'
		| 'top-left'
		| 'top-right'
		| 'left-top'
		| 'left-bottom'
		| 'right-top'
		| 'right-bottom';

	let {
		groups,
		friends,
		selectedFriendIds,
		initialSelectedGroupIds = [],
		compact = false,
		placement = 'bottom-left',
		pending = false,
		disabled = false,
		requireSelectedFriends = true,
		readOnly = false,
		singleSelect = false,
		label = m.choose_groups(),
		oncreate,
		onrename,
		onremove,
		oncopy,
		onapply
	}: {
		groups: FriendGroup[];
		friends: Friend[];
		selectedFriendIds: string[];
		initialSelectedGroupIds?: string[];
		compact?: boolean;
		placement?: Placement;
		pending?: boolean;
		disabled?: boolean;
		requireSelectedFriends?: boolean;
		readOnly?: boolean;
		singleSelect?: boolean;
		label?: string;
		oncreate: (name: string) => Promise<void>;
		onrename: (group: FriendGroup, name: string) => Promise<void>;
		onremove: (group: FriendGroup) => Promise<void>;
		oncopy: (group: FriendGroup, name: string) => Promise<void>;
		onapply: (groupIds: string[]) => Promise<void>;
	} = $props();

	let open = $state(false);
	let query = $state('');
	let selectedGroupIds = $state<string[]>([]);
	let editingId = $state<string | null>(null);
	let editingName = $state('');
	let root = $state<HTMLDivElement>();
	let menuElement = $state<HTMLDivElement>();
	let menuTop = $state(0);
	let menuLeft = $state(0);
	let menuWidth = $state(0);
	let menuTransform = $state('');

	function portal(node: HTMLElement) {
		document.body.appendChild(node);
		requestAnimationFrame(positionMenu);
		return { destroy: () => node.remove() };
	}
	function positionMenu() {
		if (!root) return;
		const rect = root.getBoundingClientRect();
		const gap = 6;
		const padding = 8;
		menuWidth = compact
			? Math.min(512, window.innerWidth - padding * 2)
			: Math.min(rect.width, window.innerWidth - padding * 2);
		const isRightAligned = placement.endsWith('right');
		const isLeftSide = placement.startsWith('left-');
		const isRightSide = placement.startsWith('right-');
		menuLeft = isLeftSide
			? rect.left - gap - menuWidth
			: isRightSide
				? rect.right + gap
				: isRightAligned
					? rect.right - menuWidth
					: rect.left;
		menuTop = placement.startsWith('bottom-')
			? rect.bottom + gap
			: placement.startsWith('top-')
				? rect.top - gap
				: placement.endsWith('-bottom')
					? rect.bottom
					: rect.top;
		menuTransform = [
			placement.startsWith('top-') || placement.endsWith('-bottom') ? 'translateY(-100%)' : ''
		]
			.filter(Boolean)
			.join(' ');
		menuLeft = Math.min(Math.max(padding, menuLeft), window.innerWidth - menuWidth - padding);
	}

	let filteredGroups = $derived(
		groups.filter((group) =>
			group.name.toLocaleLowerCase('ru').includes(query.trim().toLocaleLowerCase('ru'))
		)
	);
	let allFilteredGroupsSelected = $derived(
		filteredGroups.length > 0 &&
			filteredGroups.every((group) => selectedGroupIds.includes(group.id))
	);

	function toggleGroup(id: string) {
		if (singleSelect) {
			selectedGroupIds = selectedGroupIds.includes(id) ? [] : [id];
			return;
		}
		selectedGroupIds = selectedGroupIds.includes(id)
			? selectedGroupIds.filter((value) => value !== id)
			: [...selectedGroupIds, id];
	}

	function toggleAllGroups() {
		const filteredIds = new Set(filteredGroups.map((group) => group.id));
		selectedGroupIds = allFilteredGroupsSelected
			? selectedGroupIds.filter((id) => !filteredIds.has(id))
			: [...new Set([...selectedGroupIds, ...filteredIds])];
	}

	function memberNames(group: FriendGroup) {
		return group.memberUserIds
			.map((id) => friends.find((friend) => friend.userId === id))
			.filter((friend): friend is Friend => Boolean(friend))
			.map((friend) => friend.name || friend.email)
			.join(', ');
	}

	async function create() {
		const name = query.trim();
		if (!name || pending) return;
		await oncreate(name);
		query = '';
	}

	async function copy(group: FriendGroup) {
		const name = window.prompt(m.copy_group_name(), `${group.name} — ${m.copy_suffix()}`)?.trim();
		if (name) await oncopy(group, name);
	}
	function toggleOpen() {
		if (disabled) return;
		if (!open) selectedGroupIds = [...initialSelectedGroupIds];
		open = !open;
		if (open) positionMenu();
	}
	async function apply() {
		await onapply(selectedGroupIds);
		selectedGroupIds = [];
		open = false;
	}
	$effect(() => {
		if (!open) return;
		window.addEventListener('resize', positionMenu);
		window.addEventListener('scroll', positionMenu, true);
		return () => {
			window.removeEventListener('resize', positionMenu);
			window.removeEventListener('scroll', positionMenu, true);
		};
	});
</script>

<svelte:window
	onclick={(event) =>
		open &&
		root &&
		!root.contains(event.target as Node) &&
		!menuElement?.contains(event.target as Node) &&
		(open = false)}
/>
<div class="group-dropdown" class:compact class:open bind:this={root}>
	<button
		class="trigger"
		class:compact-trigger={compact}
		type="button"
		aria-haspopup="dialog"
		aria-expanded={open}
		title={m.choose_contact_groups()}
		disabled={disabled || (requireSelectedFriends && selectedFriendIds.length === 0)}
		onclick={toggleOpen}
	>
		{#if compact}<IconUsersGroup size={20} /><b>{initialSelectedGroupIds.length}</b><span
				class="group-tooltip"
				>{initialSelectedGroupIds.length
					? groups
							.filter((group) => initialSelectedGroupIds.includes(group.id))
							.map((group) => group.name)
							.join(', ')
					: m.contact_no_groups()}</span
			>
		{:else}<IconUsersGroup size={20} /><span class="trigger-label">{label}</span><span
				class="count-wrap"
				><b>{initialSelectedGroupIds.length}</b><span class="selection-tooltip" role="tooltip"
					>{initialSelectedGroupIds.length
						? groups
								.filter((group) => initialSelectedGroupIds.includes(group.id))
								.map((group) => group.name)
								.join(', ')
						: m.groups_not_selected()}</span
				></span
			><IconChevronDown class="chevron" size={17} stroke={1.8} aria-hidden="true" />{/if}
	</button>
	{#if !compact && requireSelectedFriends && selectedFriendIds.length === 0}<small class="hint"
			>{m.select_contacts_first()}</small
		>{/if}

	{#if open}
		<div
			class="menu"
			role="dialog"
			aria-label={m.manage_groups()}
			bind:this={menuElement}
			use:portal
			style:top={`${menuTop}px`}
			style:left={`${menuLeft}px`}
			style:width={`${menuWidth}px`}
			style:transform={menuTransform || undefined}
		>
			<form
				class="search-row"
				onsubmit={(event) => {
					event.preventDefault();
					void create();
				}}
			>
				{#if readOnly}
					<Input placeholder={m.find_group()} bind:value={query} />
				{:else}
					<Input placeholder={m.find_or_create_group()} bind:value={query}>
						{#snippet after()}<IconButton
								icon={IconPlus}
								label={m.create_group()}
								disabled={!query.trim() || pending}
								onclick={() => void create()}
							/>{/snippet}
					</Input>
				{/if}
			</form>

			{#if !singleSelect && filteredGroups.length > 0}
				<label class="select-all">
					<input type="checkbox" checked={allFilteredGroupsSelected} onchange={toggleAllGroups} />
					<span>{m.select_all()}</span>
				</label>
			{/if}
			<div class="groups">
				{#if filteredGroups.length === 0}
					<p>{groups.length ? m.nothing_found() : m.no_groups()}</p>
				{:else}
					{#each filteredGroups as group (group.id)}
						<div class="group-row">
							{#if editingId === group.id}
								<form
									class="rename-form"
									onsubmit={(event) => {
										event.preventDefault();
										if (editingName.trim())
											void onrename(group, editingName.trim()).then(() => (editingId = null));
									}}
								>
									<input aria-label={m.new_group_name()} bind:value={editingName} />
									<IconButton
										icon={IconCheck}
										label={m.save_name()}
										disabled={!editingName.trim() || pending}
										onclick={() =>
											void onrename(group, editingName.trim()).then(() => (editingId = null))}
									/>
								</form>
							{:else}
								<label class="group-label">
									<input
										type="checkbox"
										checked={selectedGroupIds.includes(group.id)}
										onchange={() => toggleGroup(group.id)}
									/>
									<span>{group.name}</span>
								</label>
								{#if !readOnly}<span class="count" title={memberNames(group) || m.empty_group()}
										>{group.memberUserIds.length}</span
									>{/if}
								{#if !readOnly}<div class="actions">
										<IconButton
											icon={IconEdit}
											label={m.rename_named({ name: group.name })}
											onclick={() => {
												editingId = group.id;
												editingName = group.name;
											}}
										/>
										<IconButton
											icon={IconCopy}
											label={m.copy_named({ name: group.name })}
											disabled={pending}
											onclick={() => void copy(group)}
										/>
										<IconButton
											icon={IconTrash}
											label={m.delete_named({ name: group.name })}
											disabled={pending}
											onclick={() => void onremove(group)}
										/>
									</div>{/if}
							{/if}
						</div>
					{/each}
				{/if}
			</div>

			<button
				class="apply"
				type="button"
				aria-label={m.confirm_group_selection()}
				title={m.ok()}
				disabled={pending}
				onclick={() => void apply()}
			>
				<IconCheck size={21} stroke={2.2} />
			</button>
		</div>
	{/if}
</div>

<style>
	.group-dropdown {
		position: relative;
		display: flex;
		align-items: center;
		gap: 0.55rem;
	}
	.trigger {
		display: flex;
		min-width: 12.5rem;
		height: 2.55rem;
		align-items: center;
		gap: 0.4rem;
		border: 1px solid #d4ddd6;
		border-radius: 0.5rem;
		background: #f7faf8;
		padding: 0 0.6rem;
		color: #326a4b;
		cursor: pointer;
		font: inherit;
	}
	.trigger-label {
		min-width: 0;
		flex: 1;
		text-align: left;
	}
	.trigger b {
		display: grid;
		min-width: 1.3rem;
		height: 1.3rem;
		place-items: center;
		border-radius: 99px;
		background: #e2ece5;
		font-size: 0.7rem;
	}
	:global(.trigger .chevron) {
		margin-left: auto;
	}
	.count-wrap {
		position: relative;
		display: inline-flex;
		flex: none;
	}
	.selection-tooltip {
		position: absolute;
		right: 0;
		bottom: calc(100% + 0.45rem);
		z-index: 90;
		width: max-content;
		max-width: 20rem;
		border-radius: 0.45rem;
		background: #18212f;
		padding: 0.45rem 0.6rem;
		color: #fff;
		font-size: 0.75rem;
		font-weight: 400;
		line-height: 1.4;
		opacity: 0;
		pointer-events: none;
		transform: translateY(0.2rem);
		transition: 0.12s;
	}
	.count-wrap:hover .selection-tooltip,
	.count-wrap:focus-within .selection-tooltip {
		opacity: 1;
		transform: none;
	}
	.group-dropdown.open .selection-tooltip {
		display: none;
	}
	.trigger:disabled {
		cursor: not-allowed;
		opacity: 0.55;
	}
	.compact {
		display: inline-flex;
	}
	.compact-trigger {
		position: relative;
		min-width: 0;
		width: 54px;
		height: 42px;
		justify-content: center;
		padding: 0;
		color: var(--color-accent);
		background: #edf5ff;
	}
	.compact-trigger b {
		position: absolute;
		right: 3px;
		top: 2px;
		display: grid;
		min-width: 17px;
		height: 17px;
		place-items: center;
		border-radius: 99px;
		background: var(--color-accent);
		color: #fff;
		font-size: 10px;
	}
	.group-tooltip {
		position: absolute;
		right: 0;
		bottom: calc(100% + 7px);
		z-index: 60;
		width: max-content;
		max-width: 220px;
		border-radius: 0.4rem;
		background: #18212f;
		padding: 0.4rem 0.55rem;
		color: #fff;
		font-size: 0.72rem;
		font-weight: 500;
		line-height: 1.3;
		opacity: 0;
		pointer-events: none;
		transform: translateY(3px);
		transition: 0.12s;
	}
	.compact-trigger:hover .group-tooltip,
	.compact-trigger:focus-visible .group-tooltip {
		opacity: 1;
		transform: none;
	}
	.hint {
		color: #7a857d;
		font-size: 0.72rem;
	}
	.menu {
		position: fixed;
		z-index: 1000;
		display: grid;
		grid-template-rows: auto auto minmax(0, 1fr) auto;
		width: min(32rem, calc(100vw - 4rem));
		overflow: visible;
		border: 1px solid #d4dbd6;
		border-radius: 0.7rem;
		background: white;
		padding: 0.7rem;
		box-shadow: 0 12px 32px rgb(31 45 36 / 18%);
	}
	.search-row {
		position: relative;
		z-index: 2;
		display: block;
	}
	input {
		min-width: 0;
		border: 1px solid #cbd3cd;
		border-radius: 0.45rem;
		padding: 0.58rem 0.65rem;
		font: inherit;
	}
	.rename-form {
		display: flex;
		min-width: 0;
		gap: 0.25rem;
	}
	.rename-form input {
		min-width: 0;
		flex: 1;
	}
	.groups {
		min-height: 0;
		max-height: 200px;
		overflow-y: auto;
		overscroll-behavior: contain;
		border-block: 1px solid #e3e7e4;
		padding-inline: 0.35rem;
	}
	.groups p {
		color: #7a857d;
		font-size: 0.8rem;
		text-align: center;
	}
	.group-row {
		display: flex;
		min-height: 2.8rem;
		align-items: center;
		gap: 0.4rem;
		border-bottom: 1px solid #edf0ed;
	}
	.select-all {
		display: flex;
		min-height: 2.55rem;
		align-items: center;
		gap: 0.5rem;
		border-block: 1px solid #dfe5e0;
		padding-inline: 0.35rem;
		color: #326a4b;
		font-size: 0.82rem;
		font-weight: 700;
		cursor: pointer;
	}
	.select-all input {
		flex: none;
		margin: 0;
		accent-color: #326a4b;
	}
	.group-row:last-child {
		border-bottom: 0;
	}
	.group-label {
		display: flex;
		min-width: 0;
		flex: 1;
		align-items: center;
		gap: 0.5rem;
		color: #465149;
		font-size: 0.82rem;
	}
	.group-label span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.group-label input {
		flex: none;
		margin: 0;
		accent-color: #326a4b;
	}
	.count {
		min-width: 1.7rem;
		border-radius: 999px;
		background: #edf2ee;
		padding: 0.12rem 0.4rem;
		color: #59665d;
		font-size: 0.72rem;
		text-align: center;
		cursor: help;
	}
	.actions {
		display: flex;
	}
	.rename-form {
		width: 100%;
	}
	.apply {
		display: grid;
		width: 2.7rem;
		height: 2.7rem;
		place-items: center;
		margin: 0.65rem 0 0 auto;
		border: 0;
		border-radius: 0.65rem;
		background: var(--color-accent);
		padding: 0;
		color: white;
		cursor: pointer;
	}
	.apply:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}
	@media (max-width: 540px) {
		.group-dropdown {
			align-items: flex-start;
			flex-direction: column;
		}
		.menu {
			width: min(25rem, calc(100vw - 3rem));
		}
		.search-row {
			grid-template-columns: 1fr;
		}
	}
</style>
