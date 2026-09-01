<script lang="ts">
	import { onMount } from 'svelte';
	import { IconCheck, IconCopy, IconEdit, IconPlus, IconTrash } from '@tabler/icons-svelte-runes';
	import { friendsApi, friendErrorMessage } from '$lib/client/friends';
	import type { Friend, FriendGroup } from '$lib/friends/contracts';
	import AlertMessages, { type AlertMessage } from './AlertMessages.svelte';
	import ContactMembersDropdown from './ContactMembersDropdown.svelte';
	import IconButton from './IconButton.svelte';
	import Input from './Input.svelte';
	import Modal from './Modal.svelte';
	import { session } from '$lib/client/auth';
	import { getPlanCapabilities, isUserPlan } from '$lib/billing/plans';
	import { m } from '$lib/paraglide/messages';
	import { localeVersion } from '$lib/client/locale';
	$localeVersion;
	let { onclose }: { onclose: () => void } = $props();
	let groups = $state<FriendGroup[]>([]),
		friends = $state<Friend[]>([]),
		query = $state(''),
		loading = $state(true),
		pending = $state(false);
	let editingId = $state<string | null>(null),
		editingName = $state(''),
		alerts = $state<AlertMessage[]>([]),
		nextAlertId = 1;
	let emailVerified = $derived(Boolean($session.data?.user.emailVerified));
	let canManageGroups = $derived(
		isUserPlan($session.data?.user.plan) &&
			getPlanCapabilities($session.data.user.plan).canManageGroups
	);
	let unavailableMessage = $derived(
		!emailVerified ? m.groups_email_required() : !canManageGroups ? m.groups_plan_required() : ''
	);
	let filtered = $derived(
		groups.filter((group) =>
			group.name.toLocaleLowerCase('ru').includes(query.trim().toLocaleLowerCase('ru'))
		)
	);
	onMount(() => {
		if (emailVerified && canManageGroups) void load();
		else loading = false;
	});
	function alert(type: AlertMessage['type'], message: string) {
		alerts = [...alerts, { id: nextAlertId++, type, message }];
	}
	async function load() {
		try {
			const [groupList, friendList] = await Promise.all([
				friendsApi.listGroups(),
				friendsApi.list()
			]);
			groups = groupList.groups;
			friends = friendList.friends;
		} catch {
			alert('error', m.groups_load_failed());
		} finally {
			loading = false;
		}
	}
	async function create() {
		const name = query.trim();
		if (!name || pending) return;
		pending = true;
		try {
			groups = [...groups, await friendsApi.createGroup(name)].sort((a, b) =>
				a.name.localeCompare(b.name, 'ru')
			);
			query = '';
			alert('success', m.group_added());
		} catch (e) {
			alert('error', friendErrorMessage(e));
		} finally {
			pending = false;
		}
	}
	async function rename(group: FriendGroup) {
		const name = editingName.trim();
		if (!name || pending) return;
		pending = true;
		try {
			const updated = await friendsApi.renameGroup(group.id, name);
			groups = groups.map((item) => (item.id === group.id ? updated : item));
			editingId = null;
			alert('success', m.group_name_saved());
		} catch (e) {
			alert('error', friendErrorMessage(e));
		} finally {
			pending = false;
		}
	}
	async function remove(group: FriendGroup) {
		if (pending || !confirm(m.delete_group_confirm({ name: group.name }))) return;
		pending = true;
		try {
			await friendsApi.removeGroup(group.id);
			groups = groups.filter((item) => item.id !== group.id);
			alert('success', m.group_deleted());
		} catch (e) {
			alert('error', friendErrorMessage(e));
		} finally {
			pending = false;
		}
	}
	async function setMembers(group: FriendGroup, userIds: string[]) {
		if (pending) return;
		pending = true;
		try {
			const before = new Set(group.memberUserIds),
				after = new Set(userIds);
			const changed = friends.filter(
				(friend) => before.has(friend.userId) !== after.has(friend.userId)
			);
			await Promise.all(
				changed.map((friend) => {
					const current = groups
						.filter((item) => item.memberUserIds.includes(friend.userId))
						.map((item) => item.id);
					const next = after.has(friend.userId)
						? [...new Set([...current, group.id])]
						: current.filter((id) => id !== group.id);
					return friendsApi.setFriendGroups(friend.userId, next);
				})
			);
			groups = groups.map((item) =>
				item.id === group.id ? { ...item, memberUserIds: [...userIds] } : item
			);
			alert('success', m.group_contacts_saved());
		} catch (e) {
			alert('error', friendErrorMessage(e));
		} finally {
			pending = false;
		}
	}
	async function copy(group: FriendGroup) {
		const name = prompt(m.copy_group_name(), `${group.name} — ${m.copy_suffix()}`)?.trim();
		if (!name || pending) return;
		pending = true;
		try {
			const created = await friendsApi.createGroup(name);
			await Promise.all(
				group.memberUserIds.map((userId) => {
					const current = groups
						.filter((item) => item.memberUserIds.includes(userId))
						.map((item) => item.id);
					return friendsApi.setFriendGroups(userId, [...current, created.id]);
				})
			);
			groups = [...groups, { ...created, memberUserIds: [...group.memberUserIds] }].sort((a, b) =>
				a.name.localeCompare(b.name, 'ru')
			);
			alert('success', m.group_copied());
		} catch (e) {
			alert('error', friendErrorMessage(e));
		} finally {
			pending = false;
		}
	}
	async function removeContact(friend: Friend) {
		if (pending) return;
		pending = true;
		try {
			await friendsApi.remove(friend.userId);
			friends = friends.filter((item) => item.userId !== friend.userId);
			groups = groups.map((item) => ({
				...item,
				memberUserIds: item.memberUserIds.filter((id) => id !== friend.userId)
			}));
			alert('success', m.contact_removed());
		} catch {
			alert('error', m.contact_remove_failed());
		} finally {
			pending = false;
		}
	}
</script>

<Modal title={m.groups()} {onclose} width="42rem"
	><form
		onsubmit={(event) => {
			event.preventDefault();
			void create();
		}}
	>
		<Input
			placeholder={unavailableMessage || m.find_or_add_group()}
			bind:value={query}
			readonly={Boolean(unavailableMessage)}
			>{#snippet after()}<IconButton
					icon={IconPlus}
					label={m.add_group()}
					disabled={!query.trim() || pending}
					onclick={() => void create()}
				/>{/snippet}</Input
		>
	</form>
	<div class="list" aria-busy={loading}>
		{#if loading}<p>
				{m.loading_groups()}
			</p>{:else if !unavailableMessage && filtered.length === 0}<p>
				{query ? m.nothing_found() : m.no_groups()}
			</p>{:else}<ul>
				{#each filtered as group (group.id)}<li>
						{#if editingId === group.id}<form
								class="rename"
								onsubmit={(event) => {
									event.preventDefault();
									void rename(group);
								}}
							>
								<input bind:value={editingName} aria-label={m.group_name()} /><IconButton
									icon={IconCheck}
									label={m.save()}
									disabled={!editingName.trim() || pending}
									onclick={() => void rename(group)}
								/>
							</form>{:else}<strong>{group.name}</strong>
							<div class="actions">
								<ContactMembersDropdown
									{friends}
									selected={group.memberUserIds}
									groupId={group.id}
									compact
									{pending}
									onapply={(ids) => setMembers(group, ids)}
									onremove={removeContact}
									onmessage={alert}
								/><IconButton
									icon={IconEdit}
									label={m.rename_named({ name: group.name })}
									onclick={() => {
										editingId = group.id;
										editingName = group.name;
									}}
								/><IconButton
									icon={IconCopy}
									label={m.copy_named({ name: group.name })}
									disabled={pending}
									onclick={() => void copy(group)}
								/><IconButton
									icon={IconTrash}
									label={m.delete_named({ name: group.name })}
									disabled={pending}
									onclick={() => void remove(group)}
								/>
							</div>{/if}
					</li>{/each}
			</ul>{/if}
	</div></Modal
>
<AlertMessages {alerts} onclose={(id) => (alerts = alerts.filter((item) => item.id !== id))} />

<style>
	:global(.modal-body) {
		padding: 1.5rem;
	}
	.list {
		margin-top: 1rem;
	}
	.list > p {
		color: #7a857d;
		text-align: center;
	}
	ul {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	li {
		display: flex;
		min-height: 3.4rem;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		border-bottom: 1px solid #e0e4e0;
	}
	li > strong {
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.actions {
		display: flex;
		align-items: center;
		gap: 0.35rem;
	}
	.rename {
		display: flex;
		width: 100%;
		gap: 0.35rem;
	}
	.rename input {
		min-width: 0;
		flex: 1;
		border: 1px solid #cbd3cd;
		border-radius: 0.45rem;
		padding: 0.6rem;
	}
	@media (max-width: 600px) {
		li {
			align-items: flex-start;
			flex-direction: column;
			padding: 0.65rem 0;
		}
		.actions {
			width: 100%;
			flex-wrap: wrap;
		}
	}
</style>
