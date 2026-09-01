import {
	createFriendRequestResultSchema,
	friendRequestActionResultSchema,
	friendGroupSchema,
	friendGroupsListSchema,
	incomingFriendRequestsSchema,
	outgoingFriendRequestsSchema,
	formerFriendsListSchema,
	friendsListSchema,
	removeFriendResultSchema
} from '$lib/friends/contracts';
import { m } from '$lib/paraglide/messages';

export class FriendsApiError extends Error {
	constructor(readonly code?: string) {
		super(code ?? 'FRIENDS_API_ERROR');
	}
}

async function readJson(response: Response): Promise<unknown> {
	const payload: unknown = await response.json().catch(() => null);
	if (!response.ok) {
		const code =
			payload &&
			typeof payload === 'object' &&
			'code' in payload &&
			typeof payload.code === 'string'
				? payload.code
				: undefined;
		throw new FriendsApiError(code);
	}
	return payload;
}

export const friendsApi = {
	async list() {
		return friendsListSchema.parse(await readJson(await fetch('/api/friends')));
	},
	async listFormer() {
		return formerFriendsListSchema.parse(await readJson(await fetch('/api/friends/former')));
	},
	async sendRequest(email: string, groupIds: string[] = []) {
		return createFriendRequestResultSchema.parse(
			await readJson(
				await fetch('/api/friend-requests', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ email: email.trim(), groupIds })
				})
			)
		);
	},
	async listIncoming() {
		return incomingFriendRequestsSchema.parse(
			await readJson(await fetch('/api/friend-requests/incoming', { cache: 'no-store' }))
		);
	},
	async listOutgoing() {
		return outgoingFriendRequestsSchema.parse(
			await readJson(await fetch('/api/friend-requests/outgoing', { cache: 'no-store' }))
		);
	},
	async accept(id: string, addSenderToMyFriends: boolean, groupIds: string[] = []) {
		return friendRequestActionResultSchema.parse(
			await readJson(
				await fetch(`/api/friend-requests/${encodeURIComponent(id)}/accept`, {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ addSenderToMyFriends, groupIds })
				})
			)
		);
	},
	async reject(id: string) {
		return friendRequestActionResultSchema.parse(
			await readJson(
				await fetch(`/api/friend-requests/${encodeURIComponent(id)}/reject`, { method: 'POST' })
			)
		);
	},
	async cancel(id: string) {
		return friendRequestActionResultSchema.parse(
			await readJson(
				await fetch(`/api/friend-requests/${encodeURIComponent(id)}/cancel`, { method: 'POST' })
			)
		);
	},
	async remove(userId: string, reason?: string) {
		return removeFriendResultSchema.parse(
			await readJson(
				await fetch(`/api/friends/${encodeURIComponent(userId)}`, {
					method: 'DELETE',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ reason: reason?.trim() || undefined })
				})
			)
		);
	},
	async listGroups() {
		return friendGroupsListSchema.parse(await readJson(await fetch('/api/friend-groups')));
	},
	async createGroup(name: string) {
		return friendGroupSchema.parse(
			await readJson(
				await fetch('/api/friend-groups', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ name: name.trim() })
				})
			)
		);
	},
	async renameGroup(id: string, name: string) {
		return friendGroupSchema.parse(
			await readJson(
				await fetch(`/api/friend-groups/${encodeURIComponent(id)}`, {
					method: 'PATCH',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ name: name.trim() })
				})
			)
		);
	},
	async removeGroup(id: string) {
		await readJson(
			await fetch(`/api/friend-groups/${encodeURIComponent(id)}`, { method: 'DELETE' })
		);
	},
	async setFriendGroups(userId: string, groupIds: string[]) {
		await readJson(
			await fetch(`/api/friends/${encodeURIComponent(userId)}/groups`, {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ groupIds })
			})
		);
	}
};

export function friendErrorMessage(error: unknown): string {
	if (error instanceof FriendsApiError) {
		if (error.code === 'USER_NOT_FOUND') return m.friend_user_not_found();
		if (error.code === 'CANNOT_ADD_SELF') return m.friend_cannot_self();
		if (error.code === 'VALIDATION_ERROR') return m.email_invalid();
		if (error.code === 'REQUEST_NOT_PENDING') return m.request_already_processed();
		if (error.code === 'GROUP_NAME_TAKEN') return m.group_name_taken();
		if (error.code === 'INVALID_GROUPS') return m.invalid_groups();
	}
	return m.friend_request_failed();
}
