import { z } from 'zod';

export const todoAccessParticipantSchema = z.strictObject({
	userId: z.uuid(),
	email: z.email(),
	name: z.string().nullable()
});

export const todoAccessListSchema = z.strictObject({
	directParticipants: z.array(todoAccessParticipantSchema),
	groupIds: z.array(z.uuid()),
	effectiveParticipants: z.array(todoAccessParticipantSchema),
	availableParticipants: z.array(todoAccessParticipantSchema)
});

export const setTodoAccessInputSchema = z.strictObject({
	userIds: z.array(z.uuid()).max(1000),
	groupIds: z.array(z.uuid()).max(1000)
});

export const setTodoAccessResultSchema = z.strictObject({
	todoId: z.uuid(),
	userIds: z.array(z.uuid()),
	groupIds: z.array(z.uuid())
});

export type TodoAccessParticipant = z.infer<typeof todoAccessParticipantSchema>;
export type TodoAccessList = z.infer<typeof todoAccessListSchema>;
