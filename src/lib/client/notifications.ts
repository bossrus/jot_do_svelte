import { writable } from 'svelte/store';
import { m } from '$lib/paraglide/messages';
export type LocalNotification = {
	id: string;
	type: string;
	actorUserId: string | null;
	actorName: string | null;
	todoId: string | null;
	groupId: string | null;
	friendRequestId: string | null;
	payload: Record<string, string | number | boolean | null>;
	createdAt: number;
	readAt: number | null;
};

type State = { items: LocalNotification[]; unreadCount: number; loading: boolean };
export const notificationsState = writable<State>({ items: [], unreadCount: 0, loading: false });

type ServerNotification = Omit<LocalNotification, 'createdAt' | 'readAt'> & {
	createdAt: string | number | Date;
	readAt: string | number | Date | null;
};

function fromServer(row: ServerNotification): LocalNotification {
	return {
		...row,
		createdAt: new Date(row.createdAt).getTime(),
		readAt: row.readAt ? new Date(row.readAt).getTime() : null
	};
}
export const notificationsApi = {
	async refresh() {
		notificationsState.update((state) => ({ ...state, loading: true }));
		const response = await fetch('/api/notifications');
		if (!response.ok) throw new Error(m.notifications_load_failed());
		const body = await response.json();
		const items = body.notifications.map(fromServer) as LocalNotification[];
		notificationsState.set({ items, unreadCount: body.unreadCount, loading: false });
	},
	async markRead(ids?: string[]) {
		const response = await fetch('/api/notifications', {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(ids ? { ids } : {})
		});
		if (!response.ok) throw new Error(m.notifications_mark_read_failed());
		await this.refresh();
	},
	clear() {
		notificationsState.set({ items: [], unreadCount: 0, loading: false });
	}
};
