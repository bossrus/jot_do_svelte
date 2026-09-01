import { afterEach, describe, expect, it, vi } from 'vitest';
import { friendErrorMessage, FriendsApiError, friendsApi } from './friends';

afterEach(() => vi.unstubAllGlobals());

describe('friends client', () => {
	it('trims the email and sends a pending request instead of adding directly', async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(
				JSON.stringify({
					result: 'created',
					request: {
						id: '10f61bd5-1bca-40a0-a454-82f36e78fd89',
						recipient: {
							userId: 'bdb6cb00-8308-4f16-b78b-df39d172e18e',
							email: 'friend@example.com',
							name: 'Friend'
						},
						createdAt: '2026-08-20T10:00:00.000Z'
					}
				}),
				{ status: 201, headers: { 'content-type': 'application/json' } }
			)
		);
		vi.stubGlobal('fetch', fetchMock);

		await friendsApi.sendRequest('  friend@example.com  ');

		expect(fetchMock).toHaveBeenCalledWith(
			'/api/friend-requests',
			expect.objectContaining({
				body: JSON.stringify({ email: 'friend@example.com', groupIds: [] })
			})
		);
	});

	it('maps typed errors to localized messages', () => {
		expect(friendErrorMessage(new FriendsApiError('USER_NOT_FOUND'))).toBe('User not found');
		expect(friendErrorMessage(new FriendsApiError('CANNOT_ADD_SELF'))).toBe(
			'You cannot add yourself'
		);
		expect(friendErrorMessage(new FriendsApiError('VALIDATION_ERROR'))).toBe(
			'Enter a valid email address'
		);
	});
});
