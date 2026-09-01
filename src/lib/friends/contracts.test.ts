import { describe, expect, it } from 'vitest';
import {
	addFriendInputSchema,
	createFriendGroupInputSchema,
	createFriendRequestInputSchema,
	removeFriendInputSchema
} from './contracts';

describe('friend contracts', () => {
	it('trims and validates an email', () => {
		expect(addFriendInputSchema.parse({ email: '  Friend@example.com ' })).toEqual({
			email: 'Friend@example.com'
		});
	});

	it('rejects unknown fields and malformed emails', () => {
		expect(addFriendInputSchema.safeParse({ email: 'nope', ownerId: 'someone-else' }).success).toBe(
			false
		);
	});

	it('allows removal without a reason', () => {
		expect(removeFriendInputSchema.parse({})).toEqual({});
	});

	it('normalizes a group name and defaults request groups to empty', () => {
		expect(createFriendGroupInputSchema.parse({ name: '  Семья  ' })).toEqual({ name: 'Семья' });
		expect(createFriendRequestInputSchema.parse({ email: 'friend@example.com' }).groupIds).toEqual(
			[]
		);
	});

	it('rejects an empty group name', () => {
		expect(createFriendGroupInputSchema.safeParse({ name: '   ' }).success).toBe(false);
	});
});
