import { describe, expect, it } from 'vitest';
import { createTodoInviteToken, hashTodoInviteToken } from './invite-service';

describe('todo invite tokens', () => {
	it('creates long URL-safe cryptographically random tokens', () => {
		const tokens = new Set(Array.from({ length: 100 }, createTodoInviteToken));
		expect(tokens.size).toBe(100);
		for (const token of tokens) {
			expect(token.length).toBeGreaterThanOrEqual(40);
			expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
		}
	});

	it('stores a deterministic SHA-256 hash instead of the plaintext token', () => {
		const token = createTodoInviteToken();
		const hash = hashTodoInviteToken(token);
		expect(hash).toMatch(/^[a-f0-9]{64}$/);
		expect(hash).not.toContain(token);
		expect(hashTodoInviteToken(token)).toBe(hash);
		expect(hashTodoInviteToken(`${token}x`)).not.toBe(hash);
	});
});
