<script lang="ts">
	import { friendsApi, friendErrorMessage } from '$lib/client/friends';
	import { IconDeviceFloppy } from '@tabler/icons-svelte-runes';
	import { todoAccessErrorMessage } from '$lib/client/todo-access';
	import {
		setTodoAccessResultSchema,
		todoAccessListSchema,
		type TodoAccessParticipant
	} from '$lib/todos/access-contracts';
	import type { Friend, FriendGroup } from '$lib/friends/contracts';
	import TodoSharingLink from './TodoSharingLink.svelte';
	import { session } from '$lib/client/auth';
	import { getPlanCapabilities, isUserPlan } from '$lib/billing/plans';
	import ContactMembersDropdown from './ContactMembersDropdown.svelte';
	import ContactGroupsDropdown from './ContactGroupsDropdown.svelte';
	import IconButton from './IconButton.svelte';
	import { m } from '$lib/paraglide/messages';
	import { localeVersion } from '$lib/client/locale';
	$localeVersion;
	let {
		todoId,
		todoIds = [todoId],
		hideSharingLink = false,
		onsaved = () => {},
		onalert = () => {}
	}: {
		todoId: string;
		todoIds?: string[];
		hideSharingLink?: boolean;
		onsaved?: () => void;
		onalert?: (type: 'success' | 'error', message: string) => void;
	} = $props();
	let directParticipants = $state<TodoAccessParticipant[]>([]),
		effectiveParticipants = $state<TodoAccessParticipant[]>([]),
		knownParticipants = $state<TodoAccessParticipant[]>([]),
		friends = $state<Friend[]>([]),
		groups = $state<FriendGroup[]>([]),
		selectedUsers = $state<string[]>([]),
		selectedGroups = $state<string[]>([]);
	let availableParticipants = $derived([
		...new Map(
			[...knownParticipants, ...effectiveParticipants, ...directParticipants].map((participant) => [
				participant.userId,
				participant
			])
		).values()
	]);
	let effectiveUserIds = $derived([
		...new Set([
			...selectedUsers,
			...groups
				.filter((group) => selectedGroups.includes(group.id))
				.flatMap((group) => group.memberUserIds)
		])
	]);
	let capabilities = $derived(
		isUserPlan($session.data?.user.plan)
			? getPlanCapabilities($session.data.user.plan)
			: getPlanCapabilities('free')
	);
	let emailVerified = $derived(Boolean($session.data?.user.emailVerified));
	let canLoadContacts = $derived(emailVerified && capabilities.canShareTodo);
	let loading = $state(true),
		saving = $state(false),
		saveAsDefault = $state(false),
		errorMessage = $state(''),
		groupPending = $state(false);
	$effect(() => {
		const ids = [...new Set(todoIds)];
		if (!canLoadContacts) {
			loading = false;
			friends = [];
			groups = [];
			return;
		}
		loading = true;
		void Promise.all([
			Promise.all(
				ids.map((id) =>
					fetch(`/api/todos/${encodeURIComponent(id)}/access`).then(async (response) => {
						const body: unknown = await response.json().catch(() => null);
						if (!response.ok) throw body;
						return todoAccessListSchema.parse(body);
					})
				)
			),
			friendsApi.list(),
			capabilities.canManageGroups ? friendsApi.listGroups() : Promise.resolve({ groups: [] })
		])
			.then(([accessLists, friendList, groupList]) => {
				const mergeParticipants = (participants: TodoAccessParticipant[]) => [
					...new Map(participants.map((participant) => [participant.userId, participant])).values()
				];
				directParticipants = mergeParticipants(
					accessLists.flatMap((access) => access.directParticipants)
				);
				effectiveParticipants = mergeParticipants(
					accessLists.flatMap((access) => access.effectiveParticipants)
				);
				knownParticipants = mergeParticipants(
					accessLists.flatMap((access) => access.availableParticipants)
				);
				friends = friendList.friends;
				groups = groupList.groups;
				selectedUsers = [...new Set(directParticipants.map((item) => item.userId))];
				selectedGroups = [...new Set(accessLists.flatMap((access) => access.groupIds))];
			})
			.catch((error: unknown) => reportError(todoAccessErrorMessage(errorCode(error), 'load')))
			.finally(() => (loading = false));
	});
	function errorCode(value: unknown): unknown {
		return typeof value === 'object' && value !== null && 'code' in value ? value.code : undefined;
	}
	function componentMessage(type: 'success' | 'error', message: string) {
		if (type === 'success') onalert('success', message);
		else reportError(message);
	}
	function reportError(message: string) {
		errorMessage = message;
		onalert('error', message);
	}
	async function removeFriend(friend: Friend) {
		try {
			await friendsApi.remove(friend.userId);
			friends = friends.filter((item) => item.userId !== friend.userId);
			selectedUsers = selectedUsers.filter((id) => id !== friend.userId);
			onalert('success', m.contact_removed());
		} catch (error) {
			reportError(friendErrorMessage(error));
		}
	}
	async function createGroup(name: string) {
		groupPending = true;
		try {
			const group = await friendsApi.createGroup(name);
			groups = [...groups, group];
			onalert('success', m.group_added());
		} catch (error) {
			reportError(friendErrorMessage(error));
		} finally {
			groupPending = false;
		}
	}
	async function renameGroup(group: FriendGroup, name: string) {
		groupPending = true;
		try {
			const updated = await friendsApi.renameGroup(group.id, name);
			groups = groups.map((item) => (item.id === group.id ? updated : item));
			onalert('success', m.group_name_saved());
		} catch (error) {
			reportError(friendErrorMessage(error));
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
			onalert('success', m.group_deleted());
		} catch (error) {
			reportError(friendErrorMessage(error));
		} finally {
			groupPending = false;
		}
	}
	async function copyGroup(group: FriendGroup, name: string) {
		groupPending = true;
		try {
			const created = await friendsApi.createGroup(name);
			for (const userId of group.memberUserIds)
				await friendsApi.setFriendGroups(userId, [
					...groups.filter((item) => item.memberUserIds.includes(userId)).map((item) => item.id),
					created.id
				]);
			groups = [...groups, { ...created, memberUserIds: [...group.memberUserIds] }];
			onalert('success', m.group_copied());
		} catch (error) {
			reportError(friendErrorMessage(error));
		} finally {
			groupPending = false;
		}
	}
	function label(userId: string) {
		const friend = friends.find((item) => item.userId === userId);
		const participant = availableParticipants.find((item) => item.userId === userId);
		return friend?.name || participant?.name || friend?.email || participant?.email || userId;
	}
	function sources(userId: string) {
		const result: string[] = [];
		if (selectedUsers.includes(userId)) result.push(m.personal_access());
		result.push(
			...groups
				.filter(
					(group) => selectedGroups.includes(group.id) && group.memberUserIds.includes(userId)
				)
				.map((group) => group.name)
		);
		return result.join(', ');
	}
	async function save() {
		if (saving) return;
		saving = true;
		errorMessage = '';
		try {
			await Promise.all(
				todoIds.map(async (id) => {
					const response = await fetch(`/api/todos/${encodeURIComponent(id)}/access`, {
						method: 'PUT',
						headers: { 'content-type': 'application/json' },
						body: JSON.stringify({ userIds: selectedUsers, groupIds: selectedGroups })
					});
					const body: unknown = await response.json().catch(() => null);
					if (!response.ok) throw body;
					setTodoAccessResultSchema.parse(body);
				})
			);
			if (saveAsDefault)
				localStorage.setItem(
					'todo-access-defaults',
					JSON.stringify({ userIds: selectedUsers, groupIds: selectedGroups })
				);
			directParticipants = selectedUsers.map((userId) => {
				const friend = friends.find((item) => item.userId === userId);
				const old = directParticipants.find((item) => item.userId === userId);
				return {
					userId,
					email: friend?.email ?? old!.email,
					name: friend?.name ?? old?.name ?? null
				};
			});
			onalert('success', m.access_saved());
			onsaved();
		} catch (error: unknown) {
			reportError(todoAccessErrorMessage(errorCode(error), 'grant'));
		} finally {
			saving = false;
		}
	}
</script>

<section aria-labelledby="todo-access-title">
	<h3 id="todo-access-title">{m.access()}</h3>
	{#if !hideSharingLink}<TodoSharingLink
			{todoId}
			disabled={!canLoadContacts}
			disabledTitle={!emailVerified ? m.share_email_required() : m.share_plan_required()}
			onsuccess={(message) => onalert('success', message)}
			onerror={reportError}
		/>{/if}
	{#if loading}<p class="muted">{m.loading_contacts_groups()}</p>{:else}
		<div class="pickers">
			<ContactMembersDropdown
				{friends}
			accessParticipants={availableParticipants}
				selected={selectedUsers}
				label={canLoadContacts
					? m.friends()
					: !emailVerified
						? m.verify_email_required()
						: m.share_worker_required()}
				disabled={!canLoadContacts}
				pending={saving}
				onapply={async (ids) => {
					selectedUsers = ids;
				}}
				onremove={removeFriend}
				onmessage={componentMessage}
			/>
			<ContactGroupsDropdown
				{groups}
				{friends}
				selectedFriendIds={friends.map((friend) => friend.userId)}
				initialSelectedGroupIds={selectedGroups}
				label={emailVerified && capabilities.canManageGroups
					? m.groups()
					: !emailVerified
						? m.verify_email_required()
						: m.group_plan_required()}
				disabled={!emailVerified || !capabilities.canManageGroups}
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
		{#if canLoadContacts}
			<p class="summary">
				<strong>{m.effective_access()}</strong>
				{effectiveUserIds.length
					? effectiveUserIds.map((id) => `${label(id)} (${sources(id)})`).join(', ')
					: m.owner_only()}
			</p>
			<div class="save-row">
				<label class="default-option" title={m.save_access_defaults_hint()}
					><input type="checkbox" bind:checked={saveAsDefault} /> {m.save_as_default()}</label
				>
				<IconButton
					icon={IconDeviceFloppy}
					label={saving ? m.saving_access() : m.save_access()}
					disabled={saving}
					onclick={() => void save()}
				/>
			</div>
		{/if}
	{/if}
	{#if errorMessage}<p class="error" role="alert">{errorMessage}</p>{/if}
</section>

<style>
	section {
		/*border-top: 1px solid #dce1dc;*/
		padding: 1.2rem clamp(1rem, 3vw, 2rem);
	}
	h3 {
		margin: 0 0 0.85rem;
		font-size: 0.88rem;
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
	.save-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		margin-top: 0.8rem;
	}
	.default-option {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		margin: 0;
		font-size: 0.84rem;
		cursor: pointer;
	}
	.muted {
		color: #7a857d;
	}
	.muted {
		margin: 0;
		font-size: 0.82rem;
	}
	.summary {
		margin: 0.85rem 0;
		font-size: 0.82rem;
		line-height: 1.45;
	}
	.error {
		margin: 0.55rem 0 0;
		font-size: 0.8rem;
		color: #8a2626;
	}
</style>
