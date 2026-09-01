<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { resolve } from '$app/paths';
	import type { TodoContentBlock } from '$lib/client/content-blocks';
	import {
		isTodoOwner,
		type LocalTodoStatus,
		type LocalTodoWithImages
	} from '$lib/client/db/database';
	import type { NewTodoImage } from '$lib/client/db/todo-service';
	import { todoService } from '$lib/client/db/todo-service';
	import TodoContentEditor from '$lib/components/TodoContentEditor.svelte';
	import TodoItem from '$lib/components/TodoItem.svelte';
	import TodoViewModal from '$lib/components/TodoViewModal.svelte';
	import AlertMessages, { type AlertMessage } from '$lib/components/AlertMessages.svelte';
	import AuthModal from '$lib/components/AuthModal.svelte';
	import NotificationCenter from '$lib/components/NotificationCenter.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import FriendsModal from '$lib/components/FriendsModal.svelte';
	import GroupsModal from '$lib/components/GroupsModal.svelte';
	import { notificationsApi, notificationsState } from '$lib/client/notifications';
	import { authService, session } from '$lib/client/auth';
	import { syncLifecycle } from '$lib/client/sync';
	import { getPlanCapabilities, isUserPlan, PLAN_DEFINITIONS } from '$lib/billing/plans';
	import PlanSelector from '$lib/components/PlanSelector.svelte';
	import { messageService } from '$lib/client/db/message-service';
	import { mutateTodoWorker } from '$lib/client/todo-workers';
	import RecurringTodoModal from '$lib/components/RecurringTodoModal.svelte';
	import RecurringTodosModal from '$lib/components/RecurringTodosModal.svelte';
	import TodoSettingsModal from '$lib/components/TodoSettingsModal.svelte';
	import TodoAccessRequestsModal from '$lib/components/TodoAccessRequestsModal.svelte';
	import SettingsModal from '$lib/components/SettingsModal.svelte';
	import AboutModal from '$lib/components/AboutModal.svelte';
	import SupportModal from '$lib/components/SupportModal.svelte';
	import Input from '$lib/components/Input.svelte';
	import ContactGroupsDropdown from '$lib/components/ContactGroupsDropdown.svelte';
	import type { FriendGroup } from '$lib/friends/contracts';
	import { getTodoPreviewText } from '$lib/client/todo-preview';
	import { todoAccessListSchema, type TodoAccessParticipant } from '$lib/todos/access-contracts';
	import { friendsApi } from '$lib/client/friends';
	import { todoInvitesApi } from '$lib/client/todo-invites';
	import { m } from '$lib/paraglide/messages';
	import { localeState, localeVersion, type AppLocale } from '$lib/client/locale';
	import {
		IconBell,
		IconAdjustmentsHorizontal,
		IconInfoCircle,
		IconHeadset,
		IconCreditCard,
		IconDoorExit,
		IconFriends,
		IconMailExclamation,
		IconRefresh,
		IconSearch,
		IconSettings,
		IconUsersGroup,
		IconUserCog,
		IconX
	} from '@tabler/icons-svelte-runes';
	$localeVersion;
	function t<I extends object>(
		message: (inputs: I, options?: { locale?: AppLocale }) => string,
		inputs = {} as I
	) {
		return message(inputs, { locale: $localeState });
	}

	let selectedStatus = $state<LocalTodoStatus>('active');
	let supportOpen = $state(false);
	let isAdmin = $state(false);
	$effect(() => {
		if (!$session.data?.user) {
			isAdmin = false;
			return;
		}
		const controller = new AbortController();
		void fetch('/api/admin/access', { signal: controller.signal }).then((response) => {
			isAdmin = response.ok;
		});
		return () => controller.abort();
	});
	let searchQuery = $state('');
	let filtersOpen = $state(false);
	let selectedGroupId = $state('');
	let openedFrom = $state('');
	let openedTo = $state('');
	let closedFrom = $state('');
	let closedTo = $state('');
	let closedPage = $state(1);
	let pageInput = $state<string | number>(1);
	const closedPageSize = 10;
	type FilterGroup = { id: string; name: string; ownerId: string; todoIds: string[] };
	let filterGroups = $state<FilterGroup[]>([]);
	let dropdownGroups = $derived<FriendGroup[]>(
		filterGroups.map((group) => ({
			id: group.id,
			ownerId: group.ownerId,
			name: `${group.name}${group.ownerId !== currentUserId ? ` (${t(m.foreign_group_suffix)})` : ''}`,
			memberUserIds: [],
			createdAt: '',
			updatedAt: ''
		}))
	);
	let commentSearchText = $state(new Map<string, string>());
	let warnings = $state<AlertMessage[]>([]);
	let selectedRows = $state(new Set<string>());
	let selectAllCheckbox = $state<HTMLInputElement>();
	let todos = $state<LocalTodoWithImages[]>([]);
	let isLoading = $state(true);
	let isInitialSyncing = $state(true);
	let initialSyncGeneration = 0;
	let todoObservationGeneration = $state(0);
	let accessSummaryGeneration = $state(0);
	let sessionRestored = $state(false);
	let preparedSessionKey = '';
	let errorMessage = $state('');
	let editingId = $state<string | null>(null);
	let viewingId = $state<string | null>(null);
	let authOpen = $state(false);
	let composerEditor: TodoContentEditor;
	let notificationsOpen = $state(false);
	let verificationOpen = $state(false);
	let resendPending = $state(false);
	let resendMessage = $state('');
	let contactsOpen = $state(false);
	let groupsOpen = $state(false);
	let plansOpen = $state(false);
	let appSettingsOpen = $state(false);
	let aboutOpen = $state(false);
	let recurringId = $state<string | null>(null);
	let recurringOpen = $state(false);
	let accessRequestsOpen = $state(false);
	let accessRequestCount = $state(0);
	let settingsId = $state<string | null>(null);
	let bulkSettingsOpen = $state(false);
	let recurringTodo = $derived(todos.find((todo) => todo.id === recurringId));
	let settingsTodo = $derived(todos.find((todo) => todo.id === settingsId));
	let viewingTodo = $derived(todos.find((todo) => todo.id === viewingId));
	let selectedTodoNames = $derived(
		todos.filter((todo) => selectedRows.has(todo.id)).map((todo) => getTodoPreviewText(todo.blocks))
	);
	let selectedTodos = $derived(todos.filter((todo) => selectedRows.has(todo.id)));
	let currentUserId = $derived($session.data?.user.id ?? null);
	let requestedTodoId = $state<string | null>(null);
	let unreadCounts = $state(new Map<string, number>());
	type TodoAccessSummary = { participants: TodoAccessParticipant[]; groupNames: string[] };
	let accessSummaries = $state(new Map<string, TodoAccessSummary>());
	async function closeAuth() {
		authOpen = false;
		await tick();
		await composerEditor?.focus();
	}
	let filteredTodos = $derived.by(() => {
		const query = searchQuery.trim().toLocaleLowerCase();
		const selectedGroup = filterGroups.find((group) => group.id === selectedGroupId);
		const groupTodoIds = selectedGroup ? new Set(selectedGroup.todoIds) : null;
		const fromDay = (value: string) => (value ? new Date(`${value}T00:00:00`).getTime() : null);
		const throughDay = (value: string) =>
			value ? new Date(`${value}T23:59:59.999`).getTime() : null;
		const openedStart = fromDay(openedFrom);
		const openedEnd = throughDay(openedTo);
		const closedStart = fromDay(closedFrom);
		const closedEnd = throughDay(closedTo);
		return todos.filter((todo) => {
			if (groupTodoIds && !groupTodoIds.has(todo.id)) return false;
			if (openedStart !== null && todo.createdAt < openedStart) return false;
			if (openedEnd !== null && todo.createdAt > openedEnd) return false;
			if (
				selectedStatus === 'closed' &&
				closedStart !== null &&
				(todo.closedAt === null || todo.closedAt < closedStart)
			)
				return false;
			if (
				selectedStatus === 'closed' &&
				closedEnd !== null &&
				(todo.closedAt === null || todo.closedAt > closedEnd)
			)
				return false;
			if (!query) return true;
			const taskText = todo.blocks
				.flatMap((block) => (block.type === 'text' ? [block.text] : []))
				.join(' ');
			return `${taskText} ${commentSearchText.get(todo.id) ?? ''}`
				.toLocaleLowerCase()
				.includes(query);
		});
	});
	let closedPageCount = $derived(Math.max(1, Math.ceil(filteredTodos.length / closedPageSize)));
	let visibleTodos = $derived(
		selectedStatus === 'closed'
			? filteredTodos.slice((closedPage - 1) * closedPageSize, closedPage * closedPageSize)
			: filteredTodos
	);
	let selectableVisibleTodos = $derived(
		visibleTodos.filter((todo) => todo.ownerId === null || isTodoOwner(todo, currentUserId))
	);
	let selectedVisibleCount = $derived(
		selectableVisibleTodos.filter((todo) => selectedRows.has(todo.id)).length
	);
	let allVisibleSelected = $derived(
		selectableVisibleTodos.length > 0 && selectedVisibleCount === selectableVisibleTodos.length
	);
	$effect(() => {
		if (selectAllCheckbox)
			selectAllCheckbox.indeterminate = selectedVisibleCount > 0 && !allVisibleSelected;
	});
	let canJoinChat = $derived(
		Boolean(
			$session.data?.user &&
			isUserPlan($session.data.user.plan) &&
			getPlanCapabilities($session.data.user.plan).canJoinSharedTodo
		)
	);
	let canShareTodo = $derived(
		Boolean(
			$session.data?.user &&
			isUserPlan($session.data.user.plan) &&
			getPlanCapabilities($session.data.user.plan).canShareTodo
		)
	);
	let canUseRecurringTodos = $derived(
		Boolean(
			$session.data?.user &&
			isUserPlan($session.data.user.plan) &&
			getPlanCapabilities($session.data.user.plan).canUseRecurringTodos
		)
	);
	onMount(() => {
		const subscription = messageService
			.observeUnread()
			.subscribe((value) => (unreadCounts = value));
		const openTodo = (event: Event) => {
			requestedTodoId = (event as CustomEvent<string>).detail;
		};
		window.addEventListener('notification.open-todo', openTodo);
		return () => {
			subscription.unsubscribe();
			window.removeEventListener('notification.open-todo', openTodo);
		};
	});
	async function refreshAccessRequests() {
		if (!canShareTodo) {
			accessRequestCount = 0;
			return;
		}
		try {
			accessRequestCount = (await todoInvitesApi.pending()).requests.length;
		} catch {
			accessRequestCount = 0;
		}
	}
	onMount(() => {
		const refresh = () => void refreshAccessRequests();
		window.addEventListener('todo-access-request.changed', refresh);
		window.addEventListener('focus', refresh);
		return () => {
			window.removeEventListener('todo-access-request.changed', refresh);
			window.removeEventListener('focus', refresh);
		};
	});
	$effect(() => {
		canShareTodo;
		void refreshAccessRequests();
	});
	onMount(() => {
		const subscription = messageService
			.observeSearchText()
			.subscribe((value) => (commentSearchText = value));
		return () => subscription.unsubscribe();
	});

	async function prepareAndActivateSync(user?: {
		id: string;
		emailVerified: boolean;
		plan: unknown;
	}) {
		const sessionKey = user ? `${user.id}:${String(user.plan)}:${user.emailVerified}` : 'anonymous';
		if (sessionKey === preparedSessionKey) return;
		preparedSessionKey = sessionKey;
		const generation = ++initialSyncGeneration;
		isInitialSyncing = true;
		todos = [];
		viewingId = null;

		const plan = user && isUserPlan(user.plan) ? user.plan : null;
		const capabilities = plan ? getPlanCapabilities(plan) : null;
		const canSync = Boolean(user?.emailVerified && capabilities?.canSync);
		const canJoinSharedTodo = Boolean(user?.emailVerified && capabilities?.canJoinSharedTodo);

		try {
			let accessibleTodoIds: string[] = [];
			if (user && canSync && canJoinSharedTodo) {
				const response = await fetch('/api/sync/todos', {
					headers: { 'x-sync-include-content': '0' }
				});
				if (response.ok) {
					const payload = (await response.json()) as { todos?: Array<{ id?: unknown }> };
					accessibleTodoIds = (payload.todos ?? []).flatMap((todo) =>
						typeof todo.id === 'string' ? [todo.id] : []
					);
				}
			}
			if (generation !== initialSyncGeneration) return;

			// Anonymous drafts have ownerId === null and remain local. Every task owned by another
			// account must be proven accessible by the server before it can remain in IndexedDB.
			await todoService.removeInaccessibleSharedTodos(
				user?.id ?? '__anonymous_session__',
				accessibleTodoIds
			);
			if (generation !== initialSyncGeneration) return;

			const sync = syncLifecycle.setAuthenticatedUser(user?.id ?? null, canSync);
			if (sync) await sync;
		} catch (error) {
			console.error('Failed to validate local todos for the current session', error);
			syncLifecycle.setAuthenticatedUser(user?.id ?? null, false);
		} finally {
			if (generation === initialSyncGeneration) {
				isInitialSyncing = false;
				todoObservationGeneration++;
			}
		}
	}

	onMount(() => {
		requestedTodoId = new URL(window.location.href).searchParams.get('todo');
		// Better Auth's store can start without fetching an existing cookie session.
		// An explicit refetch guarantees the null -> user transition that starts initial sync.
		void authService
			.refreshSession()
			.catch((error) => {
				console.error('Failed to restore the session for initial sync', error);
			})
			.finally(() => {
				sessionRestored = true;
			});
	});
	$effect(() => {
		if (requestedTodoId && todos.some((todo) => todo.id === requestedTodoId)) {
			viewingId = requestedTodoId;
			requestedTodoId = null;
		}
	});

	$effect(() => {
		if (!sessionRestored) return;
		void prepareAndActivateSync($session.data?.user);
	});
	$effect(() => {
		const user = $session.data?.user;
		accessSummaryGeneration;
		todos.map((todo) => `${todo.id}:${todo.updatedAt}`).join('|');
		if (!user?.emailVerified) {
			filterGroups = [];
			selectedGroupId = '';
			return;
		}
		let cancelled = false;
		void fetch('/api/todo-filter-groups')
			.then((response) => (response.ok ? response.json() : { groups: [] }))
			.then((value: { groups?: FilterGroup[] }) => {
				if (!cancelled) filterGroups = value.groups ?? [];
			})
			.catch(() => {
				if (!cancelled) filterGroups = [];
			});
		return () => {
			cancelled = true;
		};
	});
	$effect(() => {
		searchQuery;
		selectedGroupId;
		openedFrom;
		openedTo;
		closedFrom;
		closedTo;
		selectedStatus;
		closedPage = 1;
	});
	$effect(() => {
		if (closedPage > closedPageCount) closedPage = closedPageCount;
	});
	$effect(() => {
		pageInput = closedPage;
	});
	function applyPageInput() {
		const value = Math.trunc(Number(pageInput));
		closedPage = Number.isFinite(value) ? Math.min(closedPageCount, Math.max(1, value)) : 1;
		pageInput = closedPage;
	}
	function sanitizePageInput(event: Event & { currentTarget: HTMLInputElement }) {
		const digits = event.currentTarget.value.replace(/\D/g, '');
		event.currentTarget.value = digits;
		pageInput = digits;
	}
	$effect(() => {
		const user = $session.data?.user;
		accessSummaryGeneration;
		const ownedTodoIds = todos
			.filter((todo) => todo.ownerId !== null && todo.ownerId === user?.id)
			.map((todo) => todo.id);
		if (!user?.emailVerified || ownedTodoIds.length === 0) {
			accessSummaries = new Map();
			return;
		}
		let cancelled = false;
		void Promise.all([
			friendsApi.listGroups().catch(() => ({ groups: [] })),
			Promise.all(
				ownedTodoIds.map(async (todoId) => {
					const response = await fetch(`/api/todos/${encodeURIComponent(todoId)}/access`);
					if (response.status === 404) return null;
					if (!response.ok) throw new Error('Failed to load todo access');
					return [todoId, todoAccessListSchema.parse(await response.json())] as const;
				})
			)
		])
			.then(([groupList, accessLists]) => {
				if (cancelled) return;
				const groupNames = new Map(groupList.groups.map((group) => [group.id, group.name]));
				accessSummaries = new Map(
					accessLists
						.filter((item) => item !== null)
						.map(([todoId, access]) => [
							todoId,
							{
								participants: access.effectiveParticipants,
								groupNames: access.groupIds
									.map((id) => groupNames.get(id))
									.filter((name): name is string => Boolean(name))
							}
						])
				);
			})
			.catch((error) => console.error('Failed to load todo access summaries', error));
		return () => {
			cancelled = true;
		};
	});
	$effect(() => {
		if ($session.data) void notificationsApi.refresh();
		else notificationsApi.clear();
	});
	onMount(() => {
		const refreshNotifications = () => {
			if ($session.data) void notificationsApi.refresh();
		};
		window.addEventListener('notifications.changed', refreshNotifications);
		window.addEventListener('online', refreshNotifications);
		return () => {
			window.removeEventListener('notifications.changed', refreshNotifications);
			window.removeEventListener('online', refreshNotifications);
		};
	});

	function reportDatabaseError(error: unknown) {
		console.error('IndexedDB operation failed', error);
		errorMessage = t(m.save_draft_failed);
	}
	async function persist(action: () => Promise<unknown>): Promise<boolean> {
		errorMessage = '';
		try {
			await action();
			return true;
		} catch (error) {
			reportDatabaseError(error);
			return false;
		}
	}

	$effect(() => {
		const status = selectedStatus;
		todoObservationGeneration;
		isLoading = true;
		todos = [];
		viewingId = null;
		const subscription = todoService.observeTodos(status).subscribe({
			next(value) {
				todos = value;
				isLoading = false;
			},
			error(error) {
				isLoading = false;
				reportDatabaseError(error);
			}
		});
		return () => subscription.unsubscribe();
	});

	async function createTodo(blocks: TodoContentBlock[], images: NewTodoImage[]) {
		let created: LocalTodoWithImages | null = null;
		const saved = await persist(async () => {
			created = await todoService.createTodo(blocks, images, currentUserId);
		});
		const createdTodo = created as LocalTodoWithImages | null;
		if (!saved || !createdTodo || !currentUserId) return saved;
		try {
			const stored = localStorage.getItem('todo-access-defaults');
			if (!stored) return true;
			const defaults = JSON.parse(stored) as { userIds?: unknown; groupIds?: unknown };
			const userIds = Array.isArray(defaults.userIds)
				? defaults.userIds.filter((id): id is string => typeof id === 'string')
				: [];
			const groupIds = Array.isArray(defaults.groupIds)
				? defaults.groupIds.filter((id): id is string => typeof id === 'string')
				: [];
			if (!userIds.length && !groupIds.length) return true;
			await syncLifecycle.flushTodoPush(createdTodo.id);
			const response = await fetch(`/api/todos/${encodeURIComponent(createdTodo.id)}/access`, {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ userIds, groupIds })
			});
			if (!response.ok) throw await response.json().catch(() => null);
			accessSummaryGeneration++;
		} catch (error) {
			console.error('Failed to apply default task access', error);
			showAlert('error', t(m.default_access_apply_failed));
		}
		return true;
	}
	async function saveEdit(id: string, blocks: TodoContentBlock[], images: NewTodoImage[]) {
		const saved = await persist(async () => {
			if (!(await todoService.updateTodo(id, blocks, images)))
				throw new Error('Todo cannot be empty');
		});
		if (saved) editingId = null;
		return saved;
	}
	async function workerAction(todoId: string, action: 'join' | 'complete' | 'resume' | 'leave') {
		return persist(() => mutateTodoWorker(todoId, action));
	}
	async function leaveAndCloseTodo(todoId: string) {
		if (await workerAction(todoId, 'leave')) {
			await persist(() => todoService.closeTodo(todoId));
		}
	}
	function selectStatus(status: LocalTodoStatus) {
		selectedStatus = status;
		editingId = null;
		viewingId = null;
	}
	function toggleRow(id: string) {
		const next = new Set(selectedRows);
		next.has(id) ? next.delete(id) : next.add(id);
		selectedRows = next;
	}
	function toggleAllVisible() {
		const next = new Set(selectedRows);
		if (allVisibleSelected) selectableVisibleTodos.forEach((todo) => next.delete(todo.id));
		else selectableVisibleTodos.forEach((todo) => next.add(todo.id));
		selectedRows = next;
	}
	function closeAlert(id: number) {
		warnings = warnings.filter((warning) => warning.id !== id);
	}
	function showAlert(type: AlertMessage['type'], message: string) {
		warnings = [...warnings, { id: Date.now() + Math.random(), type, message }];
	}
	async function resendVerification() {
		const email = $session.data?.user.email;
		if (!email || resendPending) return;
		resendPending = true;
		resendMessage = '';
		const result = await authService.resendVerification(email);
		resendPending = false;
		resendMessage = result.error ? t(m.mail_failed) : t(m.mail_sent);
	}
</script>

<svelte:head>
	<title>{t(m.app_title)}</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<main class="app-shell">
	<aside class="sidebar">
		<div class="brand">Jot<span>DO</span></div>
		<div class="sidebar-content">
			<nav class="side-nav" aria-label={t(m.main_menu)}>
				<button onclick={() => (contactsOpen = true)} aria-expanded={contactsOpen}
					><IconFriends size={25} /><span>{t(m.friends)}</span></button
				>
				<button onclick={() => (groupsOpen = true)} aria-expanded={groupsOpen}
					><IconUsersGroup size={25} /><span>{t(m.groups)}</span></button
				>
				<button onclick={() => (recurringOpen = true)} aria-expanded={recurringOpen}
					><IconRefresh size={25} /><span>{t(m.recurring)}</span></button
				>
				<button
					onclick={() => (notificationsOpen = !notificationsOpen)}
					aria-expanded={notificationsOpen}
					><IconBell size={25} /><span>{t(m.notifications)}</span
					>{#if $notificationsState.unreadCount}<b>{$notificationsState.unreadCount}</b
						>{/if}</button
				>
				{#if canShareTodo}<button
						onclick={() => (accessRequestsOpen = true)}
						aria-expanded={accessRequestsOpen}
						><IconMailExclamation size={25} /><span>{t(m.access_requests)}</span
						>{#if accessRequestCount}<b>{accessRequestCount}</b>{/if}</button
					>{/if}
			</nav>
			<div class="sidebar-bottom">
				<div class="profile">
					<div class="avatar">{$session.data?.user.name?.charAt(0) ?? 'J'}</div>
					<div>
						<strong>{$session.data?.user.name ?? t(m.anonymous)}</strong><span
							>{isUserPlan($session.data?.user.plan)
								? PLAN_DEFINITIONS[$session.data.user.plan].label
								: 'Free'}</span
						>
					</div>
				</div>
				<nav class="side-nav bottom">
					{#if isAdmin}<a href={resolve('/admin')}><IconUserCog size={24} /><span>Админка</span></a
						>{/if}
					<button onclick={() => (plansOpen = true)} aria-expanded={plansOpen}
						><IconCreditCard size={24} /><span>{t(m.plan)}</span></button
					>
					<button onclick={() => (appSettingsOpen = true)} aria-expanded={appSettingsOpen}
						><IconSettings size={24} /><span>{t(m.settings)}</span></button
					>
					<button onclick={() => (aboutOpen = true)} aria-expanded={aboutOpen}
						><IconInfoCircle size={24} /><span>{t(m.about)}</span></button
					>
					<button
						onclick={() => (supportOpen = true)}
						aria-expanded={supportOpen}
						title={t(m.support_title)}
						><IconHeadset size={24} /><span>{t(m.support_title)}</span></button
					>
					<button onclick={() => ($session.data ? void authService.signOut() : (authOpen = true))}
						><IconDoorExit size={24} /><span>{$session.data ? t(m.logout) : t(m.login)}</span
						></button
					>
				</nav>
			</div>
		</div>
	</aside>
	<section class="workspace">
		<div class="topbar">
			<div class="notification-anchor">
				<button
					aria-label={t(m.notifications)}
					aria-expanded={notificationsOpen}
					onclick={() => (notificationsOpen = !notificationsOpen)}
					><IconBell size={25} />{#if $notificationsState.unreadCount}<b
							>{$notificationsState.unreadCount}</b
						>{/if}</button
				><NotificationCenter bind:open={notificationsOpen} showTrigger={false} />
			</div>
			{#if $session.data && !$session.data.user.emailVerified}
				<button
					class="verification-reminder"
					type="button"
					aria-label="{t(m.email_unverified)}. {t(m.open_email_verification)}"
					title={t(m.email_unverified)}
					onclick={() => (verificationOpen = true)}
				>
					<IconMailExclamation size={22} />
					<span aria-hidden="true">!</span>
				</button>
			{/if}
		</div>
		<section class="composer" aria-label={t(m.create_todo)}>
			<TodoContentEditor
				bind:this={composerEditor}
				autofocus
				iconSubmit
				placeholder={t(m.todo_placeholder)}
				submitLabel={t(m.add)}
				onsubmit={createTodo}
			/>
		</section>
		{#if errorMessage}<div class="error" role="alert">{errorMessage}</div>{/if}
		<div class="list-toolbar">
			<div class="status-tabs" role="tablist" aria-label={t(m.todo_status)}>
				<button class:active={selectedStatus === 'active'} onclick={() => selectStatus('active')}
					>{t(m.open_todos)}</button
				>
				<button class:active={selectedStatus === 'closed'} onclick={() => selectStatus('closed')}
					>{t(m.closed_todos)}</button
				>
			</div>
			<div class="search-tools">
				<button
					class="bulk-settings-button"
					disabled={selectedRows.size === 0}
					title={t(m.bulk_settings)}
					aria-label={t(m.bulk_settings)}
					onclick={() => (bulkSettingsOpen = true)}
					><IconUserCog size={22} /><span>{selectedRows.size}</span></button
				>
				<div class="search-input">
					<Input bind:value={searchQuery} placeholder={t(m.search_todos)}>
						{#snippet before()}<IconSearch size={22} />{/snippet}
					</Input>
				</div>
				<button
					class:active={filtersOpen}
					aria-expanded={filtersOpen}
					onclick={() => (filtersOpen = !filtersOpen)}
					><IconAdjustmentsHorizontal size={22} />{t(m.filters)}</button
				>
			</div>
		</div>
		<div class="list-layout" class:with-filters={filtersOpen}>
			<div class="list-column">
				<label class="select-all">
					<input
						bind:this={selectAllCheckbox}
						type="checkbox"
						checked={allVisibleSelected}
						disabled={selectableVisibleTodos.length === 0}
						onchange={toggleAllVisible}
					/>
					<span>{t(m.select_all)}</span>
				</label>
				<section class="todo-list" aria-live="polite" aria-busy={isLoading || isInitialSyncing}>
					{#if isLoading || isInitialSyncing}
						<div class="initial-loader">
							<span class="spinner" aria-hidden="true"></span>
							<span>{t(m.loading_todos)}</span>
						</div>
					{:else if filteredTodos.length === 0}
						<p class="empty">
							{selectedStatus === 'active' ? t(m.empty_active) : t(m.empty_closed)}
						</p>
					{:else}
						<ul>
							{#each visibleTodos as todo (todo.id)}
								{@const canMutate = todo.ownerId === null || isTodoOwner(todo, currentUserId)}
								{@const ownWorker = todo.workers.find((worker) => worker.userId === currentUserId)}
								{@const canParticipate =
									Boolean(currentUserId) &&
									todo.status === 'active' &&
									(isTodoOwner(todo, currentUserId) || canJoinChat)}
								{@const accessSummary = accessSummaries.get(todo.id)}
								<li>
									{#if canMutate}
										<button
											class:checked={selectedRows.has(todo.id)}
											class="row-check"
											title={selectedRows.has(todo.id) ? t(m.unselect_todo) : t(m.select_todo)}
											aria-label={t(m.select_todo)}
											onclick={() => toggleRow(todo.id)}
											>{#if selectedRows.has(todo.id)}✓{/if}</button
										>
									{:else}<span class="row-check-spacer" aria-hidden="true"></span>
									{/if}
									{#if editingId === todo.id && canMutate}
										<div class="edit-row">
											<TodoContentEditor
												autofocus
												initialBlocks={todo.blocks}
												initialImages={todo.images}
												submitLabel={t(m.save_changes)}
												onsubmit={(blocks, images) => saveEdit(todo.id, blocks, images)}
												oncancel={() => (editingId = null)}
											/>
										</div>
									{:else}
										<TodoItem
											blocks={todo.blocks}
											isAutomatic={todo.isAutomatic}
											status={todo.status}
											unreadMessageCount={unreadCounts.get(todo.id) ?? 0}
											workerNames={todo.workers.map(
												(worker) => `${worker.name}${worker.state === 'done' ? ' ✓' : ''}`
											)}
											accessParticipants={accessSummary?.participants ?? []}
											accessGroupNames={accessSummary?.groupNames ?? []}
											authorName={isTodoOwner(todo, currentUserId)
												? $session.data?.user.name || $session.data?.user.email || t(m.author)
												: todo.ownerName}
											showAccessDetails={isTodoOwner(todo, currentUserId)}
											joinLabel={todo.workers.length ? t(m.join_too) : t(m.start_work)}
											canTake={canParticipate}
											canFinish={canParticipate}
											isCurrentUserWorking={ownWorker?.state === 'doing'}
											isCurrentUserDone={ownWorker?.state === 'done'}
											ontake={() => void workerAction(todo.id, 'join')}
											onfinish={() => void workerAction(todo.id, 'complete')}
											onresume={() => void workerAction(todo.id, 'resume')}
											onleave={() => void workerAction(todo.id, 'leave')}
											onleaveandclose={() => void leaveAndCloseTodo(todo.id)}
											canEdit={canMutate && todo.status === 'active'}
											canClose={canMutate && todo.status === 'active'}
											onopen={() => (viewingId = todo.id)}
											onsettings={canMutate ? () => (settingsId = todo.id) : undefined}
											onedit={() => (editingId = todo.id)}
											onrepeat={canMutate && Boolean(currentUserId)
												? () => (recurringId = todo.id)
												: undefined}
											onclose={() => void persist(() => todoService.closeTodo(todo.id))}
											onreopen={canMutate && todo.status === 'closed'
												? () => void persist(() => todoService.reopenTodo(todo.id))
												: undefined}
											ondelete={canMutate && todo.status === 'closed'
												? () => void persist(() => todoService.deleteTodo(todo.id))
												: undefined}
										/>
									{/if}
								</li>
							{/each}
						</ul>
					{/if}
				</section>
				{#if selectedStatus === 'closed' && filteredTodos.length > 0}
					<nav class="pagination" aria-label={t(m.closed_pages)}>
						<button disabled={closedPage === 1} onclick={() => closedPage--}>‹</button>
						<div class="page-input">
							<Input
								type="text"
								placeholder={t(m.page)}
								bind:value={pageInput}
								oninput={sanitizePageInput}
								onblur={applyPageInput}
								onkeydown={(event) => {
									if (event.key === 'Enter') {
										event.preventDefault();
										applyPageInput();
										event.currentTarget.blur();
									}
								}}
							/>
						</div>
						<span>{t(m.of_pages, { count: closedPageCount })}</span>
						<button disabled={closedPage === closedPageCount} onclick={() => closedPage++}>›</button
						>
					</nav>
				{/if}
			</div>
			{#if filtersOpen}<aside class="filter-panel" aria-label={t(m.filters)}>
					<div class="filter-heading">
						<strong>{t(m.filters)}</strong><button
							aria-label={t(m.close_filters)}
							onclick={() => (filtersOpen = false)}><IconX size={20} /></button
						>
					</div>
					<label>
						<span>{t(m.groups)}</span>
						<ContactGroupsDropdown
							groups={dropdownGroups}
							friends={[]}
							selectedFriendIds={[]}
							initialSelectedGroupIds={selectedGroupId ? [selectedGroupId] : []}
							label={selectedGroupId
								? (dropdownGroups.find((group) => group.id === selectedGroupId)?.name ??
									t(m.all_groups))
								: t(m.all_groups)}
							requireSelectedFriends={false}
							readOnly
							singleSelect
							oncreate={async () => {}}
							onrename={async () => {}}
							onremove={async () => {}}
							oncopy={async () => {}}
							onapply={async (ids) => {
								selectedGroupId = ids[0] ?? '';
							}}
						/>
					</label>
					<fieldset>
						<legend>{t(m.opened_range)}</legend>
						<div class="date-range">
							<input type="date" bind:value={openedFrom} aria-label={t(m.opened_from)} /><input
								type="date"
								bind:value={openedTo}
								aria-label={t(m.opened_to)}
							/>
						</div>
					</fieldset>
					<fieldset>
						<legend>{t(m.closed_range)}</legend>
						<div class="date-range">
							<input type="date" bind:value={closedFrom} aria-label={t(m.closed_from)} /><input
								type="date"
								bind:value={closedTo}
								aria-label={t(m.closed_to)}
							/>
						</div>
					</fieldset>
					<button
						class="reset-filters"
						onclick={() => {
							selectedGroupId = '';
							openedFrom = '';
							openedTo = '';
							closedFrom = '';
							closedTo = '';
						}}>{t(m.reset)}</button
					>
				</aside>{/if}
		</div>
	</section>
</main>
<AlertMessages alerts={warnings} onclose={closeAlert} />
{#if viewingTodo}<TodoViewModal
		todo={viewingTodo}
		isShared={(viewingTodo.ownerId !== null && viewingTodo.ownerId !== currentUserId) ||
			Boolean(accessSummaries.get(viewingTodo.id)?.participants.length) ||
			Boolean(accessSummaries.get(viewingTodo.id)?.groupNames.length)}
		canEditImages={viewingTodo.ownerId === null || isTodoOwner(viewingTodo, currentUserId)}
		canSyncMessages={Boolean(currentUserId) &&
			(isTodoOwner(viewingTodo, currentUserId) || canJoinChat)}
		canSendMessages={viewingTodo.status === 'active' &&
			Boolean(currentUserId) &&
			(isTodoOwner(viewingTodo, currentUserId) || canJoinChat)}
		{currentUserId}
		currentUserName={$session.data?.user.name ?? ''}
		onedit={(blocks, images) => saveEdit(viewingTodo.id, blocks, images)}
		onclose={() => (viewingId = null)}
	/>{/if}
{#if authOpen}<AuthModal onclose={closeAuth} />{/if}
{#if verificationOpen && $session.data && !$session.data.user.emailVerified}
	<Modal
		title={t(m.verify_email_title)}
		onclose={() => (verificationOpen = false)}
		width="30rem"
		zIndex={700}
	>
		<div class="verification-modal">
			<span class="verification-icon"><IconMailExclamation size={42} aria-hidden="true" /></span>
			<p>{t(m.verify_email_text, { email: $session.data.user.email })}</p>
			<button type="button" disabled={resendPending} onclick={() => void resendVerification()}>
				{resendPending ? t(m.sending) : t(m.send_again)}
			</button>
			{#if resendMessage}<p class="resend-status" role="status">{resendMessage}</p>{/if}
		</div>
	</Modal>
{/if}
{#if contactsOpen}<FriendsModal onclose={() => (contactsOpen = false)} />{/if}
{#if groupsOpen}<GroupsModal onclose={() => (groupsOpen = false)} />{/if}
{#if plansOpen}<PlanSelector onclose={() => (plansOpen = false)} />{/if}
{#if appSettingsOpen}<SettingsModal onclose={() => (appSettingsOpen = false)} />{/if}
{#if aboutOpen}<AboutModal onclose={() => (aboutOpen = false)} />{/if}
{#if supportOpen}<SupportModal onclose={() => (supportOpen = false)} />{/if}
{#if recurringTodo}<RecurringTodoModal
		todo={recurringTodo}
		onclose={() => (recurringId = null)}
	/>{/if}
{#if recurringOpen}<RecurringTodosModal
		available={canUseRecurringTodos}
		onclose={() => (recurringOpen = false)}
	/>{/if}
{#if accessRequestsOpen}<TodoAccessRequestsModal
		onclose={() => (accessRequestsOpen = false)}
		onchange={refreshAccessRequests}
	/>{/if}
{#if settingsTodo}<TodoSettingsModal
		todo={settingsTodo}
		todoName={getTodoPreviewText(settingsTodo.blocks)}
		onalert={showAlert}
		onaccesssaved={() => {
			selectedRows = new Set();
			accessSummaryGeneration++;
		}}
		onclose={() => (settingsId = null)}
	/>{/if}
{#if bulkSettingsOpen && selectedTodos.length}<TodoSettingsModal
		todo={selectedTodos[0]}
		todoName={selectedTodoNames[0]}
		bulkTodos={selectedTodos}
		bulkNames={selectedTodoNames}
		onalert={showAlert}
		onaccesssaved={() => {
			selectedRows = new Set();
			accessSummaryGeneration++;
			bulkSettingsOpen = false;
		}}
		onclose={() => (bulkSettingsOpen = false)}
	/>{/if}

<style>
	:global(*) {
		box-sizing: border-box;
	}
	:global(body) {
		margin: 0;
		background: var(--color-bg);
		color: var(--color-text);
		font-family:
			Inter,
			ui-sans-serif,
			system-ui,
			-apple-system,
			sans-serif;
	}
	:global(button) {
		font: inherit;
	}
	.app-shell {
		min-height: 100vh;
		display: grid;
		grid-template-columns: 276px minmax(0, 1fr);
		background: #fff;
		color: #111827;
	}
	.sidebar {
		position: fixed;
		inset: 0 auto 0 0;
		display: flex;
		flex-direction: column;
		width: 276px;
		border-right: 1px solid #e3e8ef;
		padding: 36px 23px;
		background: #fff;
	}
	.brand {
		margin: 0 24px 46px;
		color: #050505;
		font-size: 40px;
		font-weight: 800;
		letter-spacing: -2.5px;
	}
	.brand span {
		color: var(--color-accent);
	}
	.sidebar-content {
		display: flex;
		min-height: 0;
		flex: 1;
		flex-direction: column;
		justify-content: space-between;
	}
	.sidebar-bottom {
		flex: none;
	}
	.side-nav {
		display: grid;
		gap: 13px;
	}
	.side-nav button,
	.side-nav a {
		position: relative;
		display: grid;
		grid-template-columns: 40px 1fr auto;
		align-items: center;
		width: 100%;
		min-height: 58px;
		border: 0;
		border-radius: 12px;
		background: transparent;
		padding: 0 17px;
		color: #111;
		text-align: left;
		cursor: pointer;
		font-size: 18px;
		text-decoration: none;
	}
	.side-nav button b,
	.topbar b {
		display: grid;
		place-items: center;
		min-width: 24px;
		height: 24px;
		border-radius: 20px;
		background: var(--color-accent);
		color: #fff;
		font-size: 13px;
	}
	.profile {
		display: flex;
		align-items: center;
		gap: 14px;
		margin: 0 0 15px;
		border-top: 1px solid #e6eaf0;
		padding: 28px 13px 0;
	}
	.profile .avatar {
		display: grid;
		width: 55px;
		height: 55px;
		place-items: center;
		border-radius: 50%;
		background: linear-gradient(145deg, #d8b29b, #72503f);
		color: white;
		font-weight: 700;
	}
	.profile div:last-child {
		display: grid;
		gap: 3px;
	}
	.profile strong {
		font-size: 18px;
	}
	.profile span {
		color: #77808f;
	}
	.bottom {
		gap: 8px;
	}
	.workspace {
		grid-column: 2;
		min-width: 0;
		padding: 0 42px 70px 32px;
	}
	.topbar {
		height: 84px;
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 6px;
	}
	.notification-anchor {
		position: relative;
	}
	.topbar button {
		position: relative;
		border: 0;
		background: transparent;
		padding: 8px;
		cursor: pointer;
	}
	.topbar b {
		position: absolute;
		right: -3px;
		top: 0;
	}
	.verification-reminder {
		position: relative;
		display: grid;
		width: 40px;
		height: 40px;
		place-items: center;
		border: 0;
		border-radius: 10px;
		background: #fff7e6;
		color: #b45309;
		cursor: pointer;
	}
	.verification-reminder span {
		position: absolute;
		right: -2px;
		top: -3px;
		display: grid;
		width: 18px;
		height: 18px;
		place-items: center;
		border: 2px solid #fff;
		border-radius: 50%;
		background: #dc2626;
		color: #fff;
		font-size: 11px;
		font-weight: 800;
	}
	.verification-modal {
		display: grid;
		justify-items: center;
		gap: 1rem;
		padding: 1.5rem;
		color: #59665d;
		text-align: center;
	}
	.verification-icon {
		display: grid;
		place-items: center;
		color: #b45309;
	}
	.verification-modal p {
		margin: 0;
		line-height: 1.55;
	}
	.verification-modal button {
		border: 0;
		border-radius: 0.55rem;
		background: var(--color-accent);
		padding: 0.7rem 1rem;
		color: #fff;
		font-weight: 700;
		cursor: pointer;
	}
	.verification-modal button:disabled {
		cursor: wait;
		opacity: 0.6;
	}
	.verification-modal .resend-status {
		font-size: 0.85rem;
	}
	.composer {
		margin-bottom: 27px;
	}
	.composer :global(.editor) {
		min-height: 180px;
		border-color: #d7dee8;
		border-radius: 14px;
		box-shadow: none;
		padding: 27px 32px 25px;
	}
	.composer :global(textarea) {
		font-size: 20px;
		color: #4b5563;
	}
	.composer :global(.toolbar span) {
		display: none;
	}
	.composer :global(.toolbar) {
		margin-top: auto;
		justify-content: space-between;
	}
	.composer :global(.image-button) {
		width: 54px;
		height: 50px;
	}
	.composer :global(.add-button) {
		width: 64px;
		height: 54px;
		border-radius: 12px;
	}
	.list-toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		margin-bottom: 23px;
	}
	.status-tabs {
		display: flex;
		align-self: stretch;
		gap: 24px;
	}
	.status-tabs button {
		border: 0;
		border-bottom: 3px solid transparent;
		background: transparent;
		padding: 0 2px;
		color: #667085;
		font-size: 17px;
		font-weight: 600;
		cursor: pointer;
	}
	.status-tabs button.active {
		border-bottom-color: var(--color-accent);
		color: var(--color-accent);
	}
	.search-tools {
		display: flex;
		gap: 12px;
		margin-left: auto;
	}
	.search-tools > button {
		display: flex;
		align-items: center;
		gap: 10px;
		height: 2.65rem;
		border: 1px solid #d7dee8;
		border-radius: 11px;
		background: #fff;
		padding: 0 22px;
		font-size: 16px;
	}
	.search-tools > button {
		cursor: pointer;
	}
	.search-tools > button.active {
		border-color: var(--color-accent);
		background: #edf5ff;
		color: var(--color-accent);
	}
	.search-tools > button:disabled {
		cursor: not-allowed;
		opacity: 0.48;
	}
	.bulk-settings-button {
		min-width: 4rem;
		justify-content: center;
		padding-inline: 0.85rem !important;
	}
	.bulk-settings-button span {
		min-width: 1ch;
		font-weight: 700;
	}
	.search-input {
		width: 286px;
	}
	.list-layout {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		align-items: start;
		gap: 20px;
	}
	.list-layout.with-filters {
		grid-template-columns: minmax(0, 1fr) 330px;
	}
	.list-column {
		min-width: 0;
	}
	.filter-panel {
		position: sticky;
		top: 20px;
		display: grid;
		gap: 20px;
		border: 1px solid #d7dee8;
		border-radius: 13px;
		background: #fff;
		padding: 20px 24px;
	}
	.filter-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		font-size: 18px;
	}
	.filter-heading button {
		display: grid;
		place-items: center;
		border: 0;
		background: transparent;
		cursor: pointer;
	}
	.filter-panel > label,
	.filter-panel fieldset {
		display: grid;
		gap: 8px;
		margin: 0;
		border: 0;
		padding: 0;
	}
	.filter-panel > label :global(.group-dropdown),
	.filter-panel > label :global(.group-dropdown .trigger) {
		width: 100%;
	}
	.filter-panel label > span,
	.filter-panel legend {
		padding: 0;
		color: #475467;
		font-size: 14px;
		font-weight: 600;
	}
	.filter-panel input {
		width: 100%;
		height: 42px;
		border: 1px solid #d7dee8;
		border-radius: 8px;
		background: #fff;
		padding: 0 10px;
		font: inherit;
	}
	.date-range {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
	}
	.reset-filters {
		height: 42px;
		border: 1px solid #cbd5e1;
		border-radius: 8px;
		background: #fff;
		cursor: pointer;
	}
	.pagination {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		margin-top: 18px;
	}
	.pagination button {
		min-width: 38px;
		height: 38px;
		border: 1px solid #d7dee8;
		border-radius: 8px;
		background: #fff;
		cursor: pointer;
	}
	.pagination button:disabled {
		cursor: default;
		opacity: 0.45;
	}
	.page-input {
		width: 92px;
	}
	.pagination > span {
		color: #667085;
		white-space: nowrap;
	}
	.select-all {
		display: inline-flex;
		align-items: center;
		gap: 0.55rem;
		min-height: 2.5rem;
		margin: 0 0 0.55rem 0.2rem;
		color: #475467;
		font-size: 0.9rem;
		font-weight: 600;
		cursor: pointer;
	}
	.select-all input {
		width: 1.05rem;
		height: 1.05rem;
		accent-color: var(--color-accent);
		cursor: pointer;
	}
	.select-all:has(input:disabled) {
		cursor: default;
		opacity: 0.55;
	}
	.error {
		margin-top: 1rem;
		border: 1px solid #e6b9b9;
		border-radius: 0.55rem;
		background: #fff2f2;
		padding: 0.75rem 0.9rem;
		color: #8a2626;
	}
	.todo-list {
		position: relative;
		border: 1px solid #d7dee8;
		border-radius: 13px;
		overflow: visible;
	}
	.empty {
		margin: 2.5rem 0;
		color: var(--color-text-muted);
		text-align: center;
	}
	.initial-loader {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.7rem;
		min-height: 9rem;
		color: var(--color-text-muted);
	}
	.spinner {
		width: 1.25rem;
		height: 1.25rem;
		border: 2px solid #d7dee8;
		border-top-color: currentColor;
		border-radius: 50%;
		animation: spin 0.7s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	ul {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	li {
		position: relative;
		display: grid;
		grid-template-columns: 56px minmax(0, 1fr);
		align-items: center;
		min-width: 0;
		min-height: 86px;
		padding-left: 16px;
		border-bottom: 1px solid #e5e9ef;
	}
	li:last-child {
		border-bottom: 0;
	}
	.row-check {
		display: grid;
		width: 24px;
		height: 24px;
		place-items: center;
		border: 1.5px solid #cbd5e1;
		border-radius: 5px;
		background: #fff;
		color: #fff;
		font-size: 17px;
	}
	.row-check.checked {
		border-color: var(--color-accent);
		background: var(--color-accent);
	}
	.row-check-spacer {
		display: block;
		width: 1.35rem;
		height: 1.35rem;
	}
	.edit-row {
		border-bottom: 1px solid #e0e4e0;
		padding: 0.65rem 0.15rem;
	}
	button:focus-visible {
		outline: 3px solid rgb(50 106 75 / 28%);
		outline-offset: 2px;
	}
	@media (max-width: 900px) {
		.app-shell {
			grid-template-columns: 76px minmax(0, 1fr);
		}
		.sidebar {
			width: 76px;
			padding-inline: 10px;
		}
		.brand {
			font-size: 0;
			margin: 15px 0 35px;
			text-align: center;
		}
		.brand span {
			font-size: 23px;
		}
		.side-nav button,
		.side-nav a {
			grid-template-columns: 1fr;
			padding: 0;
			place-items: center;
		}
		.side-nav button span,
		.side-nav a span,
		.side-nav button b,
		.profile div:last-child {
			display: none;
		}
		.profile {
			padding-inline: 0;
			justify-content: center;
		}
		.profile .avatar {
			width: 42px;
			height: 42px;
		}
		.workspace {
			grid-column: 2;
			padding-inline: 18px;
		}
		.list-toolbar {
			align-items: stretch;
			flex-direction: column;
		}
		.status-tabs {
			min-height: 46px;
		}
		.search-tools {
			width: 100%;
			margin-left: 0;
		}
		.search-input {
			width: auto;
			flex: 1;
		}
		.list-layout.with-filters {
			grid-template-columns: minmax(0, 1fr);
		}
		.filter-panel {
			position: static;
			grid-row: 1;
		}
	}
	@media (max-width: 600px) {
		.app-shell {
			display: block;
			min-height: 100dvh;
		}
		.sidebar {
			position: fixed;
			z-index: 500;
			inset: auto 0 0;
			width: 100%;
			height: 4.35rem;
			overflow: hidden;
			border-right: 0;
			border-top: 1px solid var(--color-border);
			background: var(--color-surface);
			padding: 0.35rem;
			box-shadow: 0 -8px 28px var(--color-shadow);
		}
		.sidebar::after {
			content: '';
			position: absolute;
			right: 0;
			top: 0;
			bottom: 0;
			width: 1rem;
			background: linear-gradient(90deg, transparent, var(--color-surface));
			pointer-events: none;
		}
		.brand,
		.profile {
			display: none;
		}
		.sidebar-content {
			display: flex;
			height: 100%;
			flex-direction: row;
			justify-content: flex-start;
			gap: 0.25rem;
			overflow-x: auto;
			scrollbar-width: none;
		}
		.sidebar-content::-webkit-scrollbar {
			display: none;
		}
		.side-nav,
		.side-nav.bottom {
			display: flex;
			flex: none;
			flex-direction: row;
			gap: 0.25rem;
		}
		.side-nav button,
		.side-nav a {
			width: 3.25rem;
			min-width: 3.25rem;
			height: 3.25rem;
			min-height: 3.25rem;
			border-radius: var(--radius-md);
		}
		.sidebar-bottom {
			display: flex;
			flex: none;
		}
		.workspace {
			padding: 0 0.75rem 5.5rem;
		}
		.topbar {
			height: 3.5rem;
		}
		.search-tools {
			flex-wrap: wrap;
		}
		.search-input {
			min-width: 12rem;
		}
		.status-tabs button {
			padding-inline: 0.7rem;
			font-size: 0.8rem;
		}
		.todo-list li {
			grid-template-columns: 1.4rem minmax(0, 1fr);
		}
	}
</style>
