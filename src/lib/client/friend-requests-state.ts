import { writable } from 'svelte/store';
import { friendsApi } from './friends';
import type { IncomingFriendRequest, OutgoingFriendRequest } from '$lib/friends/contracts';

type State = {
	incoming: IncomingFriendRequest[];
	outgoing: OutgoingFriendRequest[];
	loading: boolean;
	error: boolean;
};

const initial: State = { incoming: [], outgoing: [], loading: false, error: false };
const store = writable<State>(initial);
let generation = 0;

async function refresh() {
	const current = ++generation;
	store.update((state) => ({ ...state, loading: true, error: false }));
	try {
		const [incoming, outgoing] = await Promise.all([
			friendsApi.listIncoming(),
			friendsApi.listOutgoing()
		]);
		if (current === generation)
			store.set({
				incoming: incoming.requests,
				outgoing: outgoing.requests,
				loading: false,
				error: false
			});
	} catch {
		if (current === generation)
			store.update((state) => ({ ...state, loading: false, error: true }));
	}
}

function clear() {
	generation++;
	store.set(initial);
}

export const friendRequestsState = { subscribe: store.subscribe, refresh, clear };
