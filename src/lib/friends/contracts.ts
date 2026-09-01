import { z } from 'zod';

export const friendSchema = z.strictObject({
	userId: z.uuid(),
	email: z.email(),
	name: z.string().nullable(),
	plan: z.enum(['free', 'cloud', 'join', 'share', 'group']).optional(),
	createdAt: z.iso.datetime()
});

export const formerFriendSchema = z.strictObject({
	userId: z.uuid(),
	email: z.email(),
	name: z.string().nullable(),
	removedAt: z.iso.datetime(),
	reason: z.string().nullable()
});

export const friendsListSchema = z.strictObject({ friends: z.array(friendSchema) });
export const friendGroupSchema = z.strictObject({
	id: z.uuid(),
	ownerId: z.uuid(),
	name: z.string(),
	memberUserIds: z.array(z.uuid()),
	createdAt: z.iso.datetime(),
	updatedAt: z.iso.datetime()
});
export const friendGroupsListSchema = z.strictObject({ groups: z.array(friendGroupSchema) });
export const createFriendGroupInputSchema = z.strictObject({
	name: z.string().trim().min(1).max(120)
});
export const updateFriendGroupInputSchema = createFriendGroupInputSchema;
export const setFriendGroupsInputSchema = z.strictObject({ groupIds: z.array(z.uuid()).max(100) });
export const formerFriendsListSchema = z.strictObject({
	formerFriends: z.array(formerFriendSchema)
});
export const addFriendInputSchema = z.strictObject({ email: z.string().trim().email().max(320) });
export const addFriendResultSchema = z.strictObject({
	friend: friendSchema,
	created: z.boolean()
});
export const removeFriendInputSchema = z.strictObject({
	reason: z.string().trim().max(500).optional()
});
export const removeFriendResultSchema = z.strictObject({
	userId: z.uuid(),
	removed: z.boolean()
});

const requestUserSchema = z.strictObject({
	userId: z.uuid(),
	email: z.email(),
	name: z.string().nullable()
});
export const incomingFriendRequestSchema = z.strictObject({
	id: z.uuid(),
	sender: requestUserSchema,
	createdAt: z.iso.datetime()
});
export const outgoingFriendRequestSchema = z.strictObject({
	id: z.uuid(),
	recipient: requestUserSchema,
	createdAt: z.iso.datetime()
});
export const incomingFriendRequestsSchema = z.strictObject({
	requests: z.array(incomingFriendRequestSchema)
});
export const outgoingFriendRequestsSchema = z.strictObject({
	requests: z.array(outgoingFriendRequestSchema)
});
export const createFriendRequestInputSchema = addFriendInputSchema.extend({
	groupIds: z.array(z.uuid()).max(100).optional().default([])
});
export const createFriendRequestResultSchema = z.discriminatedUnion('result', [
	z.strictObject({ result: z.literal('created'), request: outgoingFriendRequestSchema }),
	z.strictObject({ result: z.literal('alreadyPending'), request: outgoingFriendRequestSchema }),
	z.strictObject({ result: z.literal('alreadyFriend') })
]);
export const acceptFriendRequestInputSchema = z.strictObject({
	addSenderToMyFriends: z.boolean(),
	groupIds: z.array(z.uuid()).max(100).optional().default([])
});
export const friendRequestActionResultSchema = z.strictObject({
	id: z.uuid(),
	status: z.enum(['accepted', 'rejected', 'cancelled'])
});

export type Friend = z.infer<typeof friendSchema>;
export type FormerFriend = z.infer<typeof formerFriendSchema>;
export type FriendGroup = z.infer<typeof friendGroupSchema>;
export type FriendsList = z.infer<typeof friendsListSchema>;
export type FormerFriendsList = z.infer<typeof formerFriendsListSchema>;
export type IncomingFriendRequest = z.infer<typeof incomingFriendRequestSchema>;
export type OutgoingFriendRequest = z.infer<typeof outgoingFriendRequestSchema>;
