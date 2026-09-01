<script lang="ts">
	import { onMount } from 'svelte';
	import type { LocalTodoWithImages } from '$lib/client/db/database';
	import TodoContentEditor from './TodoContentEditor.svelte';
	import type { TodoContentBlock } from '$lib/client/content-blocks';
	import type { NewTodoImage } from '$lib/client/db/todo-service';
	import { createImageTransferClient } from '$lib/client/sync/image-transfer-client';
	import { friendsApi, friendErrorMessage } from '$lib/client/friends';
	import type { Friend, FriendGroup } from '$lib/friends/contracts';
	import { IconDeviceFloppy } from '@tabler/icons-svelte-runes';
	import ContactMembersDropdown from './ContactMembersDropdown.svelte';
	import ContactGroupsDropdown from './ContactGroupsDropdown.svelte';
	import IconButton from './IconButton.svelte';
	import Input from './Input.svelte';
	import Select from './Select.svelte';
	import Modal from './Modal.svelte';
	import { m } from '$lib/paraglide/messages';
	import { localeVersion } from '$lib/client/locale';
	import SectionHeader from './primitives/SectionHeader.svelte';
	$localeVersion;
	type RecurringTemplateView = {
		id: string;
		enabled: boolean;
		frequency: string;
		interval: number;
		weekdays: number[];
		monthDay: number | null;
		localTime: string;
		timezone: string;
		settingsSnapshot?: { userIds: string[]; groupIds: string[] };
		contentSnapshot: {
			blocks: Array<
				| { id: string; type: 'text'; position: number; text: string }
				| { id: string; type: 'image'; position: number; imageId: string }
			>;
			images: Array<{
				id: string;
				storageKey: string;
				mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
				width: number;
				height: number;
				sizeBytes: number;
				markup: { version: 1; objects: NewTodoImage['markup'] } | null;
			}>;
		};
	};
	let {
		todo,
		templateId,
		onclose,
		onsaved
	}: {
		todo?: LocalTodoWithImages;
		templateId?: string;
		onclose: () => void;
		onsaved?: () => void;
	} = $props();
	let template = $state<RecurringTemplateView | null>(null),
		loading = $state(true),
		notice = $state('');
	let enabled = $state(true),
		frequency = $state('daily'),
		interval = $state(1),
		weekdays = $state<number[]>([1]),
		monthDay = $state(1),
		localTime = $state('09:00'),
		timezone = $state(Math.min(14, Math.max(-12, -new Date().getTimezoneOffset() / 60)));
	let friends = $state<Friend[]>([]),
		groups = $state<FriendGroup[]>([]),
		selectedUsers = $state<string[]>([]),
		selectedGroups = $state<string[]>([]);
	let draftBlocks = $state<TodoContentBlock[]>([]),
		draftImages = $state<NewTodoImage[]>([]),
		saving = $state(false),
		groupPending = $state(false);
	function timezoneOffset(zone: string) {
		if (/^-?\d+(?:\.\d+)?$/.test(zone)) return Math.min(14, Math.max(-12, Number(zone)));
		const name = new Intl.DateTimeFormat('en', { timeZone: zone, timeZoneName: 'longOffset' })
			.formatToParts(new Date())
			.find((part) => part.type === 'timeZoneName')?.value;
		const match = name?.match(/GMT([+-])(\d{2})(?::(\d{2}))?/);
		const offset = match
			? (match[1] === '-' ? -1 : 1) * (Number(match[2]) + Number(match[3] ?? 0) / 60)
			: 0;
		return Math.min(14, Math.max(-12, offset));
	}
	function fixedTimezone(offset: number) {
		const value = Number(offset);
		if (!value) return 'UTC';
		if (Number.isInteger(value)) return `Etc/GMT${value > 0 ? '-' : '+'}${Math.abs(value)}`;
		return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
	}
	onMount(async () => {
		draftBlocks = todo?.blocks ?? [];
		draftImages = todo?.images ?? [];
		const [response, friendList, groupList] = await Promise.all([
			fetch(templateId ? `/api/recurring/${templateId}` : `/api/recurring/by-todo/${todo!.id}`),
			friendsApi.list(),
			friendsApi.listGroups().catch(() => ({ groups: [] }))
		]);
		friends = friendList.friends;
		groups = groupList.groups;
		if (response.ok) {
			template = await response.json();
			if (template) {
				enabled = template.enabled;
				frequency = template.frequency;
				interval = template.interval;
				weekdays = template.weekdays;
				monthDay = template.monthDay ?? 1;
				localTime = template.localTime;
				timezone = timezoneOffset(template.timezone);
				selectedUsers = template.settingsSnapshot?.userIds ?? [];
				selectedGroups = template.settingsSnapshot?.groupIds ?? [];
				const transfers = createImageTransferClient();
				draftBlocks = template.contentSnapshot.blocks.map((block) =>
					block.type === 'text'
						? { id: block.id, type: 'text', text: block.text }
						: { id: block.id, type: 'image', imageId: block.imageId }
				);
				draftImages = await Promise.all(
					template.contentSnapshot.images.map(async (image) => ({
						id: image.id,
						blob: await transfers.download(image),
						storageKey: image.storageKey,
						mimeType: image.mimeType,
						width: image.width,
						height: image.height,
						sizeBytes: image.sizeBytes,
						markup: image.markup?.objects ?? undefined
					}))
				);
			}
		}
		loading = false;
	});
	function schedule() {
		const common = { localTime, timezone: fixedTimezone(timezone) };
		if (frequency === 'weekdays') return { frequency, weekdays, ...common };
		if (frequency === 'monthly') return { frequency, monthDay, ...common };
		if (frequency === 'interval_days' || frequency === 'interval_weeks')
			return { frequency, interval, ...common };
		return { frequency: 'daily', ...common };
	}
	async function save() {
		if (saving) return;
		saving = true;
		notice = '';
		const scheduleResponse = await fetch(
			template ? `/api/recurring/${template.id}` : '/api/recurring',
			{
				method: template ? 'PUT' : 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					todoId: todo?.id,
					enabled,
					schedule: schedule(),
					userIds: selectedUsers,
					groupIds: selectedGroups
				})
			}
		);
		if (!scheduleResponse.ok) {
			const problem = (await scheduleResponse.json().catch(() => null)) as {
				message?: string;
			} | null;
			notice =
				problem?.message === 'PARTICIPANT_PLAN_REQUIRED'
					? m.recurring_user_plan_required()
					: scheduleResponse.status === 403
						? m.recurring_access_plan_required()
						: m.recurring_save_failed();
			saving = false;
			return;
		}
		const savedTemplate: RecurringTemplateView = await scheduleResponse.json();
		template = savedTemplate;
		const transfers = createImageTransferClient();
		const uploaded = await Promise.all(
			draftImages.map(async (image) => ({
				id: image.id,
				storageKey:
					image.storageKey ??
					(await transfers.upload({
						id: image.id,
						blob: image.blob,
						mimeType: image.mimeType,
						sizeBytes: image.sizeBytes
					})),
				mimeType: image.mimeType,
				width: image.width,
				height: image.height,
				sizeBytes: image.sizeBytes,
				markup: image.markup ? { version: 1, objects: image.markup } : null
			}))
		);
		if (uploaded.some((image) => !image.width || !image.height)) {
			notice = m.image_dimensions_failed();
			saving = false;
			return;
		}
		const contentResponse = await fetch(`/api/recurring/${savedTemplate.id}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				content: {
					blocks: draftBlocks.map((block, position) => ({ ...block, position })),
					images: uploaded
				}
			})
		});
		notice = contentResponse.ok ? m.recurring_saved() : m.recurring_content_save_failed();
		saving = false;
		if (contentResponse.ok) onsaved?.();
	}
	async function saveSafely() {
		try {
			await save();
		} catch (error) {
			console.error('Failed to save recurring template', error);
			notice = m.recurring_save_failed();
			saving = false;
		}
	}
	async function remove() {
		if (!template) return;
		if ((await fetch(`/api/recurring/${template.id}`, { method: 'DELETE' })).ok) {
			onsaved?.();
			onclose();
		} else notice = m.recurring_delete_failed();
	}
	function toggle(day: number) {
		weekdays = weekdays.includes(day)
			? weekdays.filter((x) => x !== day)
			: [...weekdays, day].sort();
	}
	function componentMessage(_type: 'success' | 'error', message: string) {
		notice = message;
	}
	async function createGroup(name: string) {
		groupPending = true;
		try {
			groups = [...groups, await friendsApi.createGroup(name)];
		} catch (error) {
			notice = friendErrorMessage(error);
		} finally {
			groupPending = false;
		}
	}
	async function renameGroup(group: FriendGroup, name: string) {
		groupPending = true;
		try {
			const updated = await friendsApi.renameGroup(group.id, name);
			groups = groups.map((item) => (item.id === group.id ? updated : item));
		} catch (error) {
			notice = friendErrorMessage(error);
		} finally {
			groupPending = false;
		}
	}
	async function removeGroup(group: FriendGroup) {
		if (!confirm(m.delete_group_confirm({ name: group.name }))) return;
		groupPending = true;
		try {
			await friendsApi.removeGroup(group.id);
			groups = groups.filter((item) => item.id !== group.id);
			selectedGroups = selectedGroups.filter((id) => id !== group.id);
		} catch (error) {
			notice = friendErrorMessage(error);
		} finally {
			groupPending = false;
		}
	}
	async function copyGroup(group: FriendGroup, name: string) {
		groupPending = true;
		try {
			const created = await friendsApi.createGroup(name);
			groups = [...groups, { ...created, memberUserIds: [...group.memberUserIds] }];
		} catch (error) {
			notice = friendErrorMessage(error);
		} finally {
			groupPending = false;
		}
	}
</script>

<Modal title={m.recurring_template_title()} {onclose} width="760px" maxHeight="92dvh">
	{#snippet footer()}{#if !loading}<div class="footer-actions">
				{#if template}<button class="delete" type="button" onclick={() => void remove()}
						>{m.delete_recurring()}</button
					>{/if}
				<IconButton
					icon={IconDeviceFloppy}
					label={saving ? m.saving() : m.save()}
					disabled={saving}
					onclick={() => void saveSafely()}
				/>
			</div>{/if}{/snippet}
	{#if loading}<p>{m.loading()}</p>{:else}<section>
			<SectionHeader title={m.future_todo_content()} description={m.future_todo_content_hint()} />
			<TodoContentEditor
				initialBlocks={draftBlocks}
				initialImages={draftImages}
				submitOnEnter={false}
				onchange={(blocks, images) => {
					draftBlocks = blocks;
					draftImages = images;
				}}
			/>
		</section>
		<section>
			<SectionHeader title={m.future_todo_access()} />
			<div class="pickers">
				<ContactMembersDropdown
					{friends}
					selected={selectedUsers}
					label={m.friends()}
					showContactActions={false}
					onapply={async (ids) => {
						selectedUsers = ids;
					}}
					onremove={async () => {}}
					onmessage={componentMessage}
				/>
				<ContactGroupsDropdown
					{groups}
					{friends}
					selectedFriendIds={friends.map((friend) => friend.userId)}
					initialSelectedGroupIds={selectedGroups}
					label={m.groups()}
					requireSelectedFriends={false}
					pending={groupPending}
					oncreate={createGroup}
					onrename={renameGroup}
					onremove={removeGroup}
					oncopy={copyGroup}
					onapply={async (ids) => {
						selectedGroups = ids;
					}}
				/>
			</div>
			<p>{m.group_access_hint()}</p>
		</section>
		<section>
			<SectionHeader title={m.schedule()} />
			<label><input type="checkbox" bind:checked={enabled} /> {m.enabled()}</label>
			<Select
				ariaLabel={m.repeat_frequency()}
				bind:value={frequency}
				options={[
					{ value: 'daily', label: m.repeat_daily() },
					{ value: 'weekdays', label: m.repeat_weekdays() },
					{ value: 'interval_days', label: m.repeat_interval_days() },
					{ value: 'interval_weeks', label: m.repeat_interval_weeks() },
					{ value: 'monthly', label: m.repeat_monthly() }
				]}
			/>
			{#if frequency === 'weekdays'}<div class="days">
					{#each [m.weekday_mon(), m.weekday_tue(), m.weekday_wed(), m.weekday_thu(), m.weekday_fri(), m.weekday_sat(), m.weekday_sun()] as day, i (day)}<button
							type="button"
							class:chosen={weekdays.includes(i + 1)}
							onclick={() => toggle(i + 1)}>{day}</button
						>{/each}
				</div>{/if}{#if frequency === 'interval_days' || frequency === 'interval_weeks'}<label
					>{m.interval()} <input type="number" min="1" bind:value={interval} /></label
				>{/if}{#if frequency === 'monthly'}<label
					>{m.month_day()} <input type="number" min="1" max="31" bind:value={monthDay} /></label
				>{/if}<Input type="time" required placeholder={m.local_time()} bind:value={localTime} />
			<Input
				type="number"
				min="-12"
				max="14"
				step="1"
				required
				placeholder={m.timezone()}
				bind:value={timezone}
				onblur={() => (timezone = Math.min(14, Math.max(-12, Number(timezone) || 0)))}
			/>
		</section>
		{#if notice}<p class="notice" role="status">{notice}</p>{/if}{/if}
</Modal>

<style>
	section {
		display: grid;
		gap: 0.8rem;
		padding: 1.2rem;
		border-bottom: 1px solid #dce1dc;
	}
	.notice {
		padding: 0 1.2rem 1rem;
	}
	label {
		display: flex;
		align-items: center;
		gap: 0.6rem;
	}
	.days {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}
	.pickers {
		display: grid;
		gap: 0.6rem;
	}
	.pickers :global(.dropdown),
	.pickers :global(.group-dropdown) {
		display: flex;
		width: 100%;
	}
	.pickers :global(.trigger) {
		width: 100%;
	}
	.footer-actions {
		display: flex;
		width: 100%;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}
	.footer-actions :global(.icon-button-wrap) {
		margin-left: auto;
	}
	.delete {
		border: 1px solid var(--color-border);
		border-radius: 0.45rem;
		background: white;
		padding: 0.55rem 0.8rem;
		color: var(--color-danger);
		font: inherit;
		cursor: pointer;
	}
	.chosen {
		background: #326a4b;
		color: #fff;
	}
	p {
		margin: 0;
		color: #68746b;
		font-size: 0.85rem;
	}
	button,
	input {
		font: inherit;
	}
</style>
