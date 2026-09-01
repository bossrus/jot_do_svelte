import { z } from 'zod';

export const workerActionSchema = z
	.strictObject({
		action: z.enum(['join', 'complete', 'resume', 'leave', 'assign', 'remove']),
		targetUserId: z.uuid().optional()
	})
	.superRefine((value, context) => {
		const authorAction = value.action === 'assign' || value.action === 'remove';
		if (authorAction !== Boolean(value.targetUserId))
			context.addIssue({
				code: 'custom',
				message: authorAction ? 'targetUserId is required' : 'targetUserId is not allowed'
			});
	});

export type WorkerAction = z.infer<typeof workerActionSchema>;
