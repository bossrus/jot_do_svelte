import {
	todoAccessRequestsSchema,
	todoInvitePreviewSchema,
	todoShareLinkSchema
} from '$lib/todos/invite-contracts';

async function read(response: Response) {
	const body: unknown = await response.json().catch(() => null);
	if (!response.ok) throw body;
	return body;
}

export const todoInvitesApi = {
	async preview(token: string) {
		return todoInvitePreviewSchema.parse(
			await read(await fetch(`/api/todo-invites/${encodeURIComponent(token)}`))
		);
	},
	async request(token: string) {
		return read(await fetch(`/api/todo-invites/${encodeURIComponent(token)}`, { method: 'POST' }));
	},
	async link(todoId: string) {
		return todoShareLinkSchema.parse(
			await read(await fetch(`/api/todos/${encodeURIComponent(todoId)}/share-link`))
		);
	},
	async rotate(todoId: string) {
		return todoShareLinkSchema.parse(
			await read(
				await fetch(`/api/todos/${encodeURIComponent(todoId)}/share-link`, { method: 'POST' })
			)
		);
	},
	async disable(todoId: string) {
		return todoShareLinkSchema.parse(
			await read(
				await fetch(`/api/todos/${encodeURIComponent(todoId)}/share-link`, { method: 'DELETE' })
			)
		);
	},
	async pending() {
		return todoAccessRequestsSchema.parse(await read(await fetch('/api/todo-access-requests')));
	},
	async accept(id: string, addFriend = false, groupIds: string[] = []) {
		return read(
			await fetch(`/api/todo-access-requests/${encodeURIComponent(id)}/accept`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ addFriend, groupIds })
			})
		);
	},
	async reject(id: string) {
		return read(
			await fetch(`/api/todo-access-requests/${encodeURIComponent(id)}/reject`, { method: 'POST' })
		);
	}
};
