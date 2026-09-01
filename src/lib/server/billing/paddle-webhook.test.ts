import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyPaddleSignature } from './paddle-webhook';

describe('Paddle webhook signature verification', () => {
	it('accepts a current valid signature', () => {
		const timestamp = '1787817600';
		const rawBody = '{"event_id":"evt_test"}';
		const signature = createHmac('sha256', 'pdl_ntfset_test')
			.update(`${timestamp}:${rawBody}`)
			.digest('hex');
		expect(
			verifyPaddleSignature(
				rawBody,
				`ts=${timestamp};h1=${signature}`,
				Number(timestamp) * 1000,
				'pdl_ntfset_test'
			)
		).toBe(true);
	});

	it('rejects changed payloads and stale signatures', () => {
		const timestamp = '1787817600';
		const signature = createHmac('sha256', 'pdl_ntfset_test')
			.update(`${timestamp}:original`)
			.digest('hex');
		expect(
			verifyPaddleSignature(
				'changed',
				`ts=${timestamp};h1=${signature}`,
				Number(timestamp) * 1000,
				'pdl_ntfset_test'
			)
		).toBe(false);
		expect(
			verifyPaddleSignature(
				'original',
				`ts=${timestamp};h1=${signature}`,
				Number(timestamp) * 1000 + 6000,
				'pdl_ntfset_test'
			)
		).toBe(false);
	});
});
