<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { USER_PLANS, PLAN_DEFINITIONS, type UserPlan } from '$lib/billing/plans';
	import UserAvatar from '$lib/components/UserAvatar.svelte';
	import Input from '$lib/components/Input.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import ContentViewer from '$lib/components/ContentViewer.svelte';
	import { isImportableImage } from '$lib/client/images';
	import type { ImageMarkupObject } from '$lib/client/markup/types';
	import { IconMessages, IconMessageExclamation } from '@tabler/icons-svelte-runes';

	type AdminUser = {
		id: string;
		publicId: string;
		email: string;
		displayName: string;
		emailVerified: boolean;
		image: string | null;
		plan: UserPlan;
		planExpiresAt: string | null;
		billingPeriod: string | null;
		deletedAt: string | null;
		hardDeleteAfter: string | null;
		createdAt: string;
		updatedAt: string;
		directTodos: number;
		sharedTodos: number;
		supportRequests: number;
		supportUnread: number;
		latestSupportAt: string | null;
	};
	type SupportRequest = {
		id: string;
		createdAt: string;
		readAt: string | null;
		content: {
			blocks: Array<
				{ id: string; type: 'text'; text: string } | { id: string; type: 'image'; imageId: string }
			>;
			images: Array<{
				id: string;
				fileName: string;
				blob: Blob;
				width: number | null;
				height: number | null;
				markup: ImageMarkupObject[];
			}>;
		};
	};

	let loading = $state(true);
	let saving = $state(false);
	let avatarPending = $state(false);
	let avatarPicker = $state<HTMLInputElement>();
	let errorMessage = $state('');
	let notice = $state('');
	let users = $state<AdminUser[]>([]);
	let selected = $state<AdminUser | null>(null);
	let search = $state('');
	let registeredFrom = $state('');
	let registeredTo = $state('');
	let withSupport = $state(false);
	let withUnreadSupport = $state(false);
	let supportUser = $state<AdminUser | null>(null);
	let supportItems = $state<SupportRequest[]>([]);
	let supportLoading = $state(false);
	let supportError = $state('');
	let page = $state(1);
	let pages = $state(1);
	let total = $state(0);
	type SortField =
		'displayName' | 'plan' | 'directTodos' | 'sharedTodos' | 'supportRequests' | 'createdAt';
	let sort = $state<SortField>('supportRequests');
	let direction = $state<'asc' | 'desc'>('desc');
	const pageSize = 20;

	function localDateTime(value: string | null) {
		if (!value) return '';
		const date = new Date(value);
		const offset = date.getTimezoneOffset() * 60_000;
		return new Date(date.getTime() - offset).toISOString().slice(0, 16);
	}
	function iso(value: string | null) {
		return value ? new Date(value).toISOString() : null;
	}
	async function request(input: RequestInfo | URL, init?: RequestInit) {
		const response = await fetch(input, init);
		if (response.status === 401 || response.status === 403) {
			await goto(resolve('/app'), { replaceState: true });
			throw new Error('Доступ запрещён');
		}
		return response;
	}
	async function loadUsers() {
		loading = true;
		errorMessage = '';
		const params = new URLSearchParams({
			page: String(page),
			pageSize: String(pageSize),
			sort,
			direction
		});
		if (search.trim()) params.set('search', search.trim());
		if (registeredFrom) params.set('registeredFrom', registeredFrom);
		if (registeredTo) params.set('registeredTo', registeredTo);
		if (withSupport) params.set('withSupport', 'true');
		if (withUnreadSupport) params.set('withUnreadSupport', 'true');
		try {
			const response = await request(`/api/admin/users?${params}`);
			if (!response.ok) throw new Error('Не удалось загрузить пользователей');
			const data = await response.json();
			users = data.users;
			pages = data.pages;
			total = data.total;
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Ошибка загрузки';
		} finally {
			loading = false;
		}
	}
	async function openSupport(user: AdminUser) {
		if (!user.supportRequests) return;
		supportUser = user;
		supportItems = [];
		supportError = '';
		supportLoading = true;
		try {
			const response = await request(`/api/admin/users/${encodeURIComponent(user.id)}/support`);
			const body = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(body.message || 'Не удалось загрузить обращения');
			supportItems = await Promise.all(
				body.requests.map(
					async (
						item: Omit<SupportRequest, 'content'> & {
							content: {
								blocks: SupportRequest['content']['blocks'];
								images: Array<{
									id: string;
									fileName: string;
									url: string;
									markup: ImageMarkupObject[];
								}>;
							};
						}
					) => ({
						...item,
						content: {
							blocks: item.content.blocks,
							images: await Promise.all(
								item.content.images.map(async (image) => {
									const imageResponse = await request(image.url);
									if (!imageResponse.ok)
										throw new Error('Не удалось загрузить изображение обращения');
									const blob = await imageResponse.blob();
									let width: number | null = null;
									let height: number | null = null;
									try {
										const bitmap = await createImageBitmap(blob);
										width = bitmap.width;
										height = bitmap.height;
										bitmap.close();
									} catch {
										// Метаданные необязательны для показа исходного изображения.
									}
									return { ...image, blob, width, height };
								})
							)
						}
					})
				)
			);
			users = users.map((item) => (item.id === user.id ? { ...item, supportUnread: 0 } : item));
		} catch (error) {
			supportError = error instanceof Error ? error.message : 'Ошибка загрузки';
		} finally {
			supportLoading = false;
		}
	}
	function closeSupport() {
		supportUser = null;
		supportItems = [];
		void loadUsers();
	}
	function applyFilters() {
		page = 1;
		void loadUsers();
	}
	function changeSort(field: SortField) {
		if (sort === field) direction = direction === 'asc' ? 'desc' : 'asc';
		else {
			sort = field;
			direction = 'asc';
		}
		page = 1;
		void loadUsers();
	}
	function sortMark(field: SortField) {
		return sort === field ? (direction === 'asc' ? ' ↑' : ' ↓') : '';
	}
	function edit(user: AdminUser) {
		selected = { ...user };
		notice = '';
		errorMessage = '';
	}
	function replaceUserImage(userId: string, image: string | null) {
		users = users.map((user) => (user.id === userId ? { ...user, image } : user));
		if (selected?.id === userId) selected.image = image;
	}
	async function uploadAvatar(file: File) {
		if (!selected || avatarPending) return;
		if (!isImportableImage(file)) {
			errorMessage = 'Поддерживаются JPEG, PNG и WebP.';
			return;
		}
		avatarPending = true;
		errorMessage = '';
		try {
			const response = await request(`/api/admin/users/${encodeURIComponent(selected.id)}/avatar`, {
				method: 'POST',
				headers: { 'content-type': file.type },
				body: file
			});
			const body = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(body.message || 'Не удалось загрузить аватар');
			replaceUserImage(selected.id, body.image);
			notice = 'Аватар обновлён';
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Ошибка загрузки аватара';
		} finally {
			avatarPending = false;
			if (avatarPicker) avatarPicker.value = '';
		}
	}
	async function removeAvatar() {
		if (!selected || avatarPending) return;
		avatarPending = true;
		errorMessage = '';
		try {
			const response = await request(`/api/admin/users/${encodeURIComponent(selected.id)}/avatar`, {
				method: 'DELETE'
			});
			if (!response.ok) throw new Error('Не удалось удалить аватар');
			replaceUserImage(selected.id, null);
			notice = 'Аватар удалён';
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Ошибка удаления аватара';
		} finally {
			avatarPending = false;
		}
	}
	async function save() {
		if (!selected || saving) return;
		saving = true;
		errorMessage = '';
		notice = '';
		try {
			const response = await request('/api/admin/users', {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					...selected,
					image: selected.image || null,
					billingPeriod: selected.billingPeriod || null,
					planExpiresAt: iso(selected.planExpiresAt),
					deletedAt: iso(selected.deletedAt),
					hardDeleteAfter: iso(selected.hardDeleteAfter)
				})
			});
			const body = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(body.message || 'Не удалось сохранить');
			notice = 'Изменения сохранены';
			await loadUsers();
			const refreshed = users.find((user) => user.id === selected?.id);
			if (refreshed) selected = { ...refreshed };
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Ошибка сохранения';
		} finally {
			saving = false;
		}
	}

	onMount(loadUsers);
</script>

<svelte:head
	><title>Админка · JotDO</title><meta name="robots" content="noindex, nofollow" /></svelte:head
>

<main class="admin-shell">
	<header>
		<div>
			<a href={resolve('/app')}>← К задачам</a>
			<h1>Админка</h1>
			<p>Пользователей: {total}</p>
		</div>
	</header>
	<form
		class="filters"
		onsubmit={(event) => {
			event.preventDefault();
			applyFilters();
		}}
	>
		<div class="search-with-support-filters">
			<Input bind:value={search} placeholder="Поиск: имя, email, ID, тариф…" />
			<label
				class:active={withSupport}
				class="icon-filter"
				title="Только пользователи с обращениями"
			>
				<input
					type="checkbox"
					checked={withSupport}
					onchange={(event) => {
						withSupport = event.currentTarget.checked;
						applyFilters();
					}}
				/>
				<IconMessages size={21} aria-hidden="true" />
				<span class="sr-only">С обращениями</span>
			</label>
			<label
				class:active={withUnreadSupport}
				class="icon-filter"
				title="Только пользователи с непрочитанными обращениями"
			>
				<input
					type="checkbox"
					checked={withUnreadSupport}
					onchange={(event) => {
						withUnreadSupport = event.currentTarget.checked;
						applyFilters();
					}}
				/>
				<IconMessageExclamation size={21} aria-hidden="true" />
				<span class="sr-only">С непрочитанными обращениями</span>
			</label>
		</div>
		<Input type="date" bind:value={registeredFrom} placeholder="Регистрация с" />
		<Input type="date" bind:value={registeredTo} placeholder="Регистрация по" />
		<button type="submit">Найти</button>
	</form>

	{#if loading}<div class="loading" role="status"><span></span>Загрузка пользователей…</div>
	{:else if errorMessage && !selected}<p class="error" role="alert">{errorMessage}</p>
	{:else}
		<div class="table-wrap">
			<table>
				<thead
					><tr
						><th
							><button class="sort" onclick={() => changeSort('displayName')}
								>Пользователь{sortMark('displayName')}</button
							></th
						><th
							><button class="sort" onclick={() => changeSort('plan')}
								>Тариф{sortMark('plan')}</button
							></th
						><th
							><button class="sort" onclick={() => changeSort('directTodos')}
								>Прямые{sortMark('directTodos')}</button
							></th
						><th
							><button class="sort" onclick={() => changeSort('sharedTodos')}
								>По шарингу{sortMark('sharedTodos')}</button
							></th
						><th
							><button class="sort" onclick={() => changeSort('supportRequests')}
								>Обращения{sortMark('supportRequests')}</button
							></th
						><th
							><button class="sort" onclick={() => changeSort('createdAt')}
								>Регистрация{sortMark('createdAt')}</button
							></th
						><th></th></tr
					></thead
				>
				<tbody
					>{#each users as user (user.id)}<tr>
							<td
								><div class="identity">
									<UserAvatar name={user.displayName} image={user.image} size={42} />
									<div>
										<strong>{user.displayName}</strong><small>{user.email}</small><small
											>{user.publicId}</small
										>
									</div>
								</div></td
							>
							<td
								><strong>{PLAN_DEFINITIONS[user.plan].label}</strong><small
									>{user.planExpiresAt
										? `до ${new Date(user.planExpiresAt).toLocaleDateString()}`
										: 'без срока'}</small
								></td
							>
							<td>{user.directTodos}</td><td>{user.sharedTodos}</td><td>
								<button
									class:unread={user.supportUnread > 0}
									class="support-count"
									disabled={!user.supportRequests}
									title={user.supportRequests ? 'Открыть обращения' : 'Обращений нет'}
									onclick={() => openSupport(user)}>{user.supportRequests}</button
								></td
							>
							<td>{new Date(user.createdAt).toLocaleString()}</td><td
								><button class="secondary" onclick={() => edit(user)}>Изменить</button></td
							>
						</tr>{/each}</tbody
				>
			</table>
		</div>
		{#if !users.length}<p class="empty">Ничего не найдено</p>{/if}
		<nav class="pagination">
			<button
				disabled={page <= 1}
				onclick={() => {
					page--;
					void loadUsers();
				}}>Назад</button
			><span>{page} / {pages}</span><button
				disabled={page >= pages}
				onclick={() => {
					page++;
					void loadUsers();
				}}>Вперёд</button
			>
		</nav>
	{/if}
</main>

{#if supportUser}
	<Modal
		title={`Обращения · ${supportUser.displayName}`}
		onclose={closeSupport}
		width="48rem"
		height="min(46rem, calc(100dvh - 2rem))"
		showFooter={false}
	>
		<div class="support-modal-content">
			{#if supportLoading}<div class="support-loading" role="status">Загрузка обращений…</div>
			{:else if supportError}<p class="error" role="alert">{supportError}</p>
			{:else if !supportItems.length}<p class="empty">Обращений нет</p>
			{:else}<ol class="support-list">
					{#each supportItems as item (item.id)}
						<li class:was-unread={!item.readAt}>
							<header>
								<time datetime={new Date(item.createdAt).toISOString()}
									>{new Date(item.createdAt).toLocaleString()}</time
								>{#if !item.readAt}<span>Новое</span>{/if}
							</header>
							<div class="support-message">
								<ContentViewer
									blocks={item.content.blocks}
									images={item.content.images}
									imageViewerMode="view"
								/>
							</div>
						</li>
					{/each}
				</ol>{/if}
		</div>
	</Modal>
{/if}

{#if selected}<div
		class="backdrop"
		role="presentation"
		onclick={(event) => {
			if (event.target === event.currentTarget) selected = null;
		}}
	>
		<div class="editor" role="dialog" aria-modal="true" aria-label="Редактирование пользователя">
			<header>
				<div>
					<h2>{selected.displayName}</h2>
					<small>{selected.id}</small>
				</div>
				<button class="close" onclick={() => (selected = null)}>×</button>
			</header>
			<div class="stats">
				<strong>{selected.directTodos}<small>прямых задач</small></strong><strong
					>{selected.sharedTodos}<small>по шарингу</small></strong
				>
			</div>
			<div class="avatar-editor">
				<UserAvatar name={selected.displayName} image={selected.image} size={72} />
				<div>
					<strong>Аватар</strong>
					<input
						class="avatar-picker"
						bind:this={avatarPicker}
						type="file"
						accept="image/jpeg,image/png,image/webp"
						onchange={(event) => {
							const file = event.currentTarget.files?.[0];
							if (file) void uploadAvatar(file);
						}}
					/>
					<div class="avatar-actions">
						<button class="secondary" disabled={avatarPending} onclick={() => avatarPicker?.click()}
							>{avatarPending ? 'Загрузка…' : 'Сменить'}</button
						>
						{#if selected.image}<button
								class="danger"
								disabled={avatarPending}
								onclick={removeAvatar}>Удалить</button
							>{/if}
					</div>
				</div>
			</div>
			<div class="fields">
				<Input bind:value={selected.displayName} placeholder="Имя" />
				<Input type="email" bind:value={selected.email} placeholder="Email" />
				<Input bind:value={selected.publicId} placeholder="Публичный ID" />
				<Input
					value={selected.image ?? ''}
					placeholder="Аватар (URL)"
					oninput={(event) => selected && (selected.image = event.currentTarget.value || null)}
				/>
				<label
					>Тариф<select bind:value={selected.plan}
						>{#each USER_PLANS as plan (plan)}<option value={plan}
								>{PLAN_DEFINITIONS[plan].label}</option
							>{/each}</select
					></label
				>
				<Input
					type="datetime-local"
					value={localDateTime(selected.planExpiresAt)}
					placeholder="Тариф действует до"
					oninput={(e) => selected && (selected.planExpiresAt = e.currentTarget.value || null)}
				/>
				<Input
					value={selected.billingPeriod ?? ''}
					placeholder="Период биллинга"
					oninput={(event) =>
						selected && (selected.billingPeriod = event.currentTarget.value || null)}
				/>
				<label class="check"
					><input type="checkbox" bind:checked={selected.emailVerified} /> Email подтверждён</label
				>
				<Input
					type="datetime-local"
					value={localDateTime(selected.deletedAt)}
					placeholder="Удалён"
					oninput={(e) => selected && (selected.deletedAt = e.currentTarget.value || null)}
				/>
				<Input
					type="datetime-local"
					value={localDateTime(selected.hardDeleteAfter)}
					placeholder="Полное удаление после"
					oninput={(e) => selected && (selected.hardDeleteAfter = e.currentTarget.value || null)}
				/>
			</div>
			{#if errorMessage}<p class="error" role="alert">{errorMessage}</p>{/if}{#if notice}<p
					class="notice"
					role="status"
				>
					{notice}
				</p>{/if}
			<footer>
				<button class="secondary" onclick={() => (selected = null)}>Отмена</button><button
					disabled={saving}
					onclick={save}>{saving ? 'Сохраняем…' : 'Сохранить'}</button
				>
			</footer>
		</div>
	</div>{/if}

<style>
	:global(body) {
		margin: 0;
		background: #f4f7f5;
		color: #17211b;
		font-family: Inter, system-ui, sans-serif;
	}
	.admin-shell {
		max-width: 1180px;
		margin: auto;
		padding: 32px 20px 60px;
	}
	.admin-shell > header {
		display: flex;
		justify-content: space-between;
		align-items: end;
		margin-bottom: 24px;
	}
	h1,
	h2,
	p {
		margin: 0;
	}
	h1 {
		font-size: 2rem;
		margin-top: 8px;
	}
	a {
		color: #27734c;
	}
	.filters {
		display: grid;
		grid-template-columns: 2fr 1fr 1fr auto;
		gap: 12px;
		align-items: end;
		padding: 18px;
		background: white;
		border: 1px solid #dce5df;
		border-radius: 16px;
		margin-bottom: 18px;
	}
	.search-with-support-filters {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto auto;
		gap: 8px;
		align-items: end;
	}
	.icon-filter {
		display: grid;
		width: 42px;
		height: 42px;
		place-items: center;
		box-sizing: border-box;
		border: 1px solid #cbd8d0;
		border-radius: 9px;
		background: #fff;
		color: #526159;
		cursor: pointer;
	}
	.icon-filter.active {
		border-color: #26754c;
		background: #e8f1eb;
		color: #205f40;
	}
	.icon-filter input,
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
	}
	label {
		display: grid;
		gap: 6px;
		font-size: 0.82rem;
		font-weight: 700;
	}
	select {
		box-sizing: border-box;
		width: 100%;
		border: 1px solid #cbd8d0;
		border-radius: 9px;
		padding: 10px;
		background: #fff;
		color: inherit;
	}
	.sort {
		padding: 0;
		background: transparent;
		color: inherit;
		font-size: inherit;
		text-transform: inherit;
		white-space: nowrap;
	}
	button {
		border: 0;
		border-radius: 9px;
		padding: 11px 16px;
		background: #26754c;
		color: white;
		font-weight: 750;
		cursor: pointer;
	}
	button:disabled {
		opacity: 0.45;
		cursor: default;
	}
	.secondary {
		background: #e8f1eb;
		color: #205f40;
	}
	.support-count {
		min-width: 2.5rem;
		padding: 7px 10px;
		background: transparent;
		color: #26754c;
		font-weight: 500;
		text-decoration: underline;
	}
	.support-count.unread {
		font-weight: 850;
	}
	.support-count:disabled {
		color: #78827c;
		text-decoration: none;
	}
	.danger {
		background: #fbe9e7;
		color: #a52b24;
	}
	.avatar-editor {
		display: flex;
		align-items: center;
		gap: 1rem;
		margin-bottom: 1rem;
	}
	.avatar-editor > div {
		display: grid;
		gap: 0.5rem;
	}
	.avatar-picker {
		display: none;
	}
	.avatar-actions {
		display: flex;
		gap: 0.5rem;
	}
	.table-wrap {
		overflow: auto;
		background: white;
		border: 1px solid #dce5df;
		border-radius: 16px;
	}
	table {
		width: 100%;
		border-collapse: collapse;
	}
	th,
	td {
		text-align: left;
		padding: 14px;
		border-bottom: 1px solid #e8eeea;
		vertical-align: middle;
	}
	th {
		font-size: 0.75rem;
		text-transform: uppercase;
		color: #69766e;
	}
	.identity {
		display: flex;
		gap: 10px;
		align-items: center;
	}
	td small {
		display: block;
		color: #66736b;
		margin-top: 3px;
	}
	.pagination {
		display: flex;
		justify-content: center;
		align-items: center;
		gap: 14px;
		margin-top: 18px;
	}
	.loading {
		min-height: 320px;
		display: grid;
		place-content: center;
		justify-items: center;
		gap: 12px;
	}
	.loading span {
		width: 38px;
		height: 38px;
		border: 4px solid #cfddd4;
		border-top-color: #26754c;
		border-radius: 50%;
		animation: spin 0.7s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	.empty {
		text-align: center;
		padding: 45px;
	}
	.backdrop {
		position: fixed;
		inset: 0;
		background: #10201899;
		display: grid;
		place-items: center;
		padding: 18px;
		z-index: 20;
	}
	.editor {
		width: min(720px, 100%);
		max-height: 92vh;
		overflow: auto;
		background: white;
		border-radius: 18px;
		padding: 22px;
		box-sizing: border-box;
	}
	.editor header,
	.editor footer {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
	}
	.close {
		background: transparent;
		color: #34483b;
		font-size: 1.8rem;
		padding: 0 8px;
	}
	.stats {
		display: flex;
		gap: 10px;
		margin: 18px 0;
	}
	.stats strong {
		flex: 1;
		padding: 14px;
		background: #edf5f0;
		border-radius: 12px;
		font-size: 1.35rem;
	}
	.stats small {
		display: block;
		font-size: 0.75rem;
		color: #637168;
	}
	.fields {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 14px;
	}
	.check {
		display: flex;
		align-items: center;
		align-self: end;
		padding: 10px 0;
	}
	.check input {
		width: auto;
	}
	.editor footer {
		justify-content: flex-end;
		margin-top: 18px;
	}
	.error {
		color: #a62d2d;
		margin: 12px 0;
	}
	.notice {
		color: #26754c;
		margin: 12px 0;
	}
	.support-modal-content {
		min-height: 100%;
		padding: 1rem;
		box-sizing: border-box;
	}
	.support-loading {
		display: grid;
		min-height: 12rem;
		place-items: center;
	}
	.support-list {
		display: grid;
		gap: 0.9rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.support-list > li {
		border: 1px solid #dce5df;
		border-radius: 12px;
		background: white;
		overflow: hidden;
	}
	.support-list > li.was-unread {
		border-color: #7aad91;
	}
	.support-list header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.65rem 0.85rem;
		border-bottom: 1px solid #e8eeea;
		color: #66736b;
		font-size: 0.78rem;
	}
	.support-list header span {
		border-radius: 999px;
		background: #e5f3e9;
		padding: 0.2rem 0.5rem;
		color: #205f40;
		font-weight: 800;
	}
	.support-message {
		display: grid;
		gap: 0.6rem;
		padding: 0.9rem;
	}
	@media (max-width: 760px) {
		.filters,
		.fields {
			grid-template-columns: 1fr;
		}
		.admin-shell {
			padding: 18px 10px;
		}
		th:nth-child(4),
		td:nth-child(4) {
			display: none;
		}
	}
</style>
