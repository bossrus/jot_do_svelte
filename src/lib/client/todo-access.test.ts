import { describe, expect, it } from 'vitest';
import { todoAccessErrorMessage } from './todo-access';

describe('todoAccessErrorMessage', () => {
	it.each([
		['USER_NOT_FOUND', 'User not found.'],
		['CANNOT_SHARE_WITH_SELF', 'You cannot grant access to yourself.'],
		['INVALID_PARTICIPANTS', 'New access can only be granted to current contacts.'],
		['VALIDATION_ERROR', 'Enter a valid email address']
	])('maps %s to a localized message', (code, message) => {
		expect(todoAccessErrorMessage(code, 'grant')).toBe(message);
	});

	it('uses an action-specific fallback', () => {
		expect(todoAccessErrorMessage('UNKNOWN', 'revoke')).toBe('Could not revoke access.');
	});
});
