import { describe, expect, it } from 'vitest';
import { recurringCreateSchema, recurringMutationSchema } from './contracts';

describe('recurring contracts', () => {
	it('accepts todoId in create payload while keeping update payload strict', () => {
		const payload = {
			todoId: '2d185810-395a-45e7-9828-a23071dda023',
			enabled: true,
			userIds: [],
			groupIds: ['34142e56-cfd8-4bdb-8f8f-ff97c9c9995a'],
			schedule: { frequency: 'daily', localTime: '09:00', timezone: 'Asia/Bishkek' }
		};

		expect(recurringCreateSchema.safeParse(payload).success).toBe(true);
		expect(recurringMutationSchema.safeParse(payload).success).toBe(false);
	});
});
