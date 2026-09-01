import { z } from 'zod';

export const inviteStateSchema = z.enum([
	'invalid',
	'loginRequired',
	'canRequest',
	'pending',
	'rejected',
	'hasAccess',
	'owner'
]);

export const todoInvitePreviewSchema = z.strictObject({
	state: inviteStateSchema,
	owner: z.strictObject({ name: z.string().nullable() }).nullable(),
	todoId: z.uuid().nullable()
});

export const todoShareLinkSchema = z.strictObject({
	active: z.boolean(),
	url: z.string().optional()
});

export const todoAccessRequestSchema = z.strictObject({
	id: z.uuid(),
	todoId: z.uuid(),
	requester: z.strictObject({
		userId: z.uuid(),
		email: z.email(),
		name: z.string().nullable(),
		plan: z.enum(['free', 'cloud', 'join', 'share', 'group'])
	}),
	requesterIsFriend: z.boolean(),
	createdAt: z.coerce.string()
});

export const todoAccessRequestsSchema = z.strictObject({
	requests: z.array(todoAccessRequestSchema)
});

export const resolveTodoAccessRequestInputSchema = z.strictObject({
	addFriend: z.boolean().default(false),
	groupIds: z.array(z.uuid()).default([])
});

export type TodoInvitePreview = z.infer<typeof todoInvitePreviewSchema>;
export type TodoAccessRequest = z.infer<typeof todoAccessRequestSchema>;
