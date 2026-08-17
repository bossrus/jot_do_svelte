<script lang="ts">
	import type { LocalTodoStatus, LocalTodoWithImages } from '$lib/client/db/database';
	import type { NewTodoImage } from '$lib/client/db/todo-service';
	import { todoService } from '$lib/client/db/todo-service';
	import TodoComposer from '$lib/components/TodoComposer.svelte';
	import TodoImageList from '$lib/components/TodoImageList.svelte';

	let selectedStatus = $state<LocalTodoStatus>('active');
	let todos = $state<LocalTodoWithImages[]>([]);
	let isLoading = $state(true);
	let errorMessage = $state('');
	let openMenuId = $state<string | null>(null);
	let editingId = $state<string | null>(null);

	function reportDatabaseError(error: unknown) {
		console.error('IndexedDB operation failed', error);
		errorMessage = 'Не удалось сохранить изменения. Черновик и данные оставлены без изменений.';
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
		isLoading = true;
		todos = [];
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

	async function createTodo(text: string, images: NewTodoImage[]) {
		return persist(() => todoService.createTodo(text, images));
	}
	async function saveEdit(id: string, text: string, images: NewTodoImage[]) {
		const saved = await persist(async () => {
			if (!(await todoService.updateTodo(id, text, images)))
				throw new Error('Todo cannot be empty');
		});
		if (saved) editingId = null;
		return saved;
	}
	function selectStatus(status: LocalTodoStatus) {
		selectedStatus = status;
		openMenuId = null;
		editingId = null;
	}
</script>

<svelte:head
	><title>Quick Todo</title><meta
		name="description"
		content="Быстрые локальные задачи без регистрации."
	/></svelte:head
>

<main class="app-shell">
	<header>
		<p class="eyebrow">LOCAL-FIRST</p>
		<h1>Quick Todo</h1>
	</header>
	<section aria-label="Создать задачу"><TodoComposer autofocus onsubmit={createTodo} /></section>
	{#if errorMessage}<div class="error" role="alert">{errorMessage}</div>{/if}
	<nav class="tabs" aria-label="Состояние задач">
		<button
			type="button"
			class:active={selectedStatus === 'active'}
			aria-pressed={selectedStatus === 'active'}
			onclick={() => selectStatus('active')}>Активные</button
		>
		<button
			type="button"
			class:active={selectedStatus === 'closed'}
			aria-pressed={selectedStatus === 'closed'}
			onclick={() => selectStatus('closed')}>Закрытые</button
		>
	</nav>
	<section class="todo-list" aria-live="polite" aria-busy={isLoading}>
		{#if isLoading}<p class="empty">Загружаем локальные задачи…</p>
		{:else if todos.length === 0}<p class="empty">
				{selectedStatus === 'active' ? 'Здесь появятся ваши задачи.' : 'Закрытых задач пока нет.'}
			</p>
		{:else}<ul>
				{#each todos as todo (todo.id)}
					<li class:closed={todo.status === 'closed'}>
						<button
							type="button"
							class:reopen={todo.status === 'closed'}
							class="state-button"
							aria-label={todo.status === 'active' ? 'Завершить задачу' : 'Вернуть задачу в работу'}
							onclick={() =>
								void persist(() =>
									todo.status === 'active'
										? todoService.closeTodo(todo.id)
										: todoService.reopenTodo(todo.id)
								)}>{todo.status === 'closed' ? '✓' : ''}</button
						>
						<div class="todo-content">
							{#if editingId === todo.id}
								<TodoComposer
									initialText={todo.text}
									initialImages={todo.images}
									submitLabel="Сохранить"
									onsubmit={(text, images) => saveEdit(todo.id, text, images)}
									oncancel={() => (editingId = null)}
								/>
							{:else}
								<button
									class="todo-body"
									type="button"
									title="Редактировать"
									onclick={() => (editingId = todo.id)}
								>
									{#if todo.text}<span class="todo-text">{todo.text}</span>{/if}<TodoImageList
										images={todo.images}
									/>
								</button>
							{/if}
						</div>
						<div class="menu-wrap">
							<button
								type="button"
								class="menu-trigger"
								aria-label="Действия задачи"
								aria-haspopup="menu"
								aria-expanded={openMenuId === todo.id}
								onclick={() => (openMenuId = openMenuId === todo.id ? null : todo.id)}>•••</button
							>
							{#if openMenuId === todo.id}<div class="action-menu" role="menu">
									<button
										type="button"
										role="menuitem"
										onclick={() => {
											editingId = todo.id;
											openMenuId = null;
										}}>Редактировать</button
									>
									{#if todo.status === 'active'}<button
											type="button"
											role="menuitem"
											onclick={() => void persist(() => todoService.closeTodo(todo.id))}
											>Закрыть</button
										>
									{:else}<button
											type="button"
											role="menuitem"
											onclick={() => void persist(() => todoService.reopenTodo(todo.id))}
											>Вернуть в работу</button
										><button
											type="button"
											role="menuitem"
											class="danger"
											onclick={() => void persist(() => todoService.deleteTodo(todo.id))}
											>Удалить</button
										>{/if}
								</div>{/if}
						</div>
					</li>
				{/each}
			</ul>{/if}
	</section>
</main>

<style>
	:global(*) {
		box-sizing: border-box;
	}
	:global(body) {
		margin: 0;
		background: #f6f7f4;
		color: #1c241f;
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
		width: min(100% - 2rem, 720px);
		margin: 0 auto;
		padding: clamp(2rem, 7vw, 5rem) 0 4rem;
	}
	header {
		margin-bottom: 1.75rem;
	}
	.eyebrow {
		margin: 0 0 0.3rem;
		color: #647168;
		font-size: 0.68rem;
		font-weight: 750;
		letter-spacing: 0.14em;
	}
	h1 {
		margin: 0;
		font-size: clamp(1.8rem, 6vw, 2.5rem);
		letter-spacing: -0.045em;
	}
	.error {
		margin-top: 1rem;
		border: 1px solid #e6b9b9;
		border-radius: 0.55rem;
		background: #fff2f2;
		padding: 0.75rem 0.9rem;
		color: #8a2626;
	}
	.tabs {
		display: flex;
		gap: 1.25rem;
		margin-top: 2rem;
		border-bottom: 1px solid #d9ded9;
	}
	.tabs button {
		border: 0;
		border-bottom: 2px solid transparent;
		background: transparent;
		padding: 0.65rem 0.1rem;
		color: #69746c;
		font-weight: 650;
		cursor: pointer;
	}
	.tabs button.active {
		border-bottom-color: #326a4b;
		color: #234e37;
	}
	.todo-list {
		padding-top: 0.75rem;
	}
	.empty {
		margin: 2.5rem 0;
		color: #7a857d;
		text-align: center;
	}
	ul {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	li {
		position: relative;
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		align-items: start;
		gap: 0.75rem;
		border-bottom: 1px solid #e0e4e0;
		padding: 0.85rem 0.15rem;
	}
	.state-button {
		display: grid;
		width: 1.45rem;
		height: 1.45rem;
		margin-top: 0.1rem;
		place-items: center;
		border: 1.5px solid #a7b0a9;
		border-radius: 50%;
		background: #fff;
		color: #fff;
		cursor: pointer;
	}
	.state-button:hover {
		border-color: #326a4b;
		background: #e5f1e9;
	}
	.state-button.reopen {
		border-color: #326a4b;
		background: #326a4b;
	}
	.todo-content {
		min-width: 0;
	}
	.todo-body {
		display: grid;
		width: 100%;
		gap: 0.65rem;
		border: 0;
		background: transparent;
		padding: 0.05rem 0;
		color: inherit;
		text-align: left;
		cursor: text;
	}
	.todo-text {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		line-height: 1.4;
	}
	.closed .todo-text {
		color: #768078;
		text-decoration: line-through;
	}
	.menu-wrap {
		position: relative;
	}
	.menu-trigger {
		border: 0;
		border-radius: 0.35rem;
		background: transparent;
		padding: 0.2rem 0.4rem;
		color: #6d786f;
		font-weight: 750;
		cursor: pointer;
	}
	.menu-trigger:hover {
		background: #e7ebe7;
	}
	.action-menu {
		position: absolute;
		top: calc(100% + 0.25rem);
		right: 0;
		z-index: 10;
		width: max-content;
		min-width: 10rem;
		border: 1px solid #d4d9d5;
		border-radius: 0.55rem;
		background: #fff;
		padding: 0.3rem;
		box-shadow: 0 12px 30px rgb(28 36 31 / 14%);
	}
	.action-menu button {
		display: block;
		width: 100%;
		border: 0;
		border-radius: 0.35rem;
		background: transparent;
		padding: 0.5rem 0.65rem;
		text-align: left;
		cursor: pointer;
	}
	.action-menu button:hover {
		background: #eef1ee;
	}
	.action-menu .danger {
		color: #a02c2c;
	}
	button:focus-visible {
		outline: 3px solid rgb(50 106 75 / 28%);
		outline-offset: 2px;
	}
	@media (max-width: 520px) {
		.app-shell {
			width: min(100% - 1.25rem, 720px);
			padding-top: 1.5rem;
		}
		li {
			gap: 0.5rem;
		}
	}
</style>
