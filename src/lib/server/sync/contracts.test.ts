import { describe, expect, it } from 'vitest';
import { putTodoSchema } from './contracts';

const id = '11111111-1111-4111-8111-111111111111';
describe('sync contract', () => {
	it('accepts metadata but rejects binary-like fields', () => {
		const input = {
			id,
			baseRevision: 0,
			status: 'active',
			blocks: [
				{
					id: '22222222-2222-4222-8222-222222222222',
					type: 'image',
					position: 0,
					imageId: '33333333-3333-4333-8333-333333333333'
				}
			],
			images: [
				{
					id: '33333333-3333-4333-8333-333333333333',
					storageKey: `users/${id}/images/33333333-3333-4333-8333-333333333333`,
					mimeType: 'image/png',
					width: 10,
					height: 10,
					sizeBytes: 100,
					markup: null
				}
			]
		};
		expect(putTodoSchema.safeParse(input).success).toBe(true);
		expect(
			putTodoSchema.safeParse({
				...input,
				images: [{ ...input.images[0], dataUrl: 'data:image/png;base64,AA==' }]
			}).success
		).toBe(false);
	});
});
