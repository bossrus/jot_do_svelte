import { sql } from 'drizzle-orm';
import {
	bigint,
	boolean,
	check,
	foreignKey,
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	primaryKey,
	text,
	timestamp,
	unique,
	uniqueIndex,
	uuid
} from 'drizzle-orm/pg-core';

export const userPlan = pgEnum('user_plan', ['free', 'sync', 'shared', 'group']);
export const todoStatus = pgEnum('todo_status', ['active', 'closed']);
export const workerState = pgEnum('worker_state', ['doing', 'done']);
export const messageType = pgEnum('message_type', ['user', 'system']);
export const accessRequestStatus = pgEnum('access_request_status', [
	'pending',
	'approved',
	'rejected'
]);
export const subscriptionPlan = pgEnum('subscription_plan', ['sync', 'shared', 'group']);
export const subscriptionStatus = pgEnum('subscription_status', [
	'active',
	'past_due',
	'canceled',
	'expired'
]);

export const users = pgTable(
	'users',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		publicId: text('public_id').notNull().unique(),
		email: text('email').notNull().unique(),
		passwordHash: text('password_hash'),
		displayName: text('display_name').notNull(),
		plan: userPlan('plan').default('free').notNull(),
		planExpiresAt: timestamp('plan_expires_at', { withTimezone: true }),
		deletedAt: timestamp('deleted_at', { withTimezone: true }),
		hardDeleteAfter: timestamp('hard_delete_after', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
	},
	(table) => [
		check(
			'users_hard_delete_schedule_check',
			sql`(${table.deletedAt} is null and ${table.hardDeleteAfter} is null) or (${table.deletedAt} is not null and ${table.hardDeleteAfter} >= ${table.deletedAt})`
		)
	]
);

export const todos = pgTable(
	'todos',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		ownerId: uuid('owner_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		text: text('text').notNull(),
		status: todoStatus('status').default('active').notNull(),
		isShared: boolean('is_shared').default(false).notNull(),
		isAutomatic: boolean('is_automatic').default(false).notNull(),
		userMessageCount: integer('user_message_count').default(0).notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
		closedAt: timestamp('closed_at', { withTimezone: true }),
		reopenedAt: timestamp('reopened_at', { withTimezone: true }),
		deletedAt: timestamp('deleted_at', { withTimezone: true })
	},
	(table) => [
		index('todos_owner_status_idx').on(table.ownerId, table.status),
		check('todos_text_not_empty_check', sql`char_length(btrim(${table.text})) > 0`),
		check('todos_user_message_count_check', sql`${table.userMessageCount} >= 0`)
	]
);

export const todoImages = pgTable(
	'todo_images',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		todoId: uuid('todo_id')
			.notNull()
			.references(() => todos.id, { onDelete: 'cascade' }),
		storageKey: text('storage_key').notNull().unique(),
		width: integer('width').notNull(),
		height: integer('height').notNull(),
		mimeType: text('mime_type').notNull(),
		sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
		sortOrder: integer('sort_order').default(0).notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
	},
	(table) => [
		index('todo_images_todo_sort_idx').on(table.todoId, table.sortOrder),
		check('todo_images_width_check', sql`${table.width} > 0`),
		check('todo_images_height_check', sql`${table.height} > 0`),
		check('todo_images_size_check', sql`${table.sizeBytes} > 0`),
		check('todo_images_sort_order_check', sql`${table.sortOrder} >= 0`),
		check('todo_images_mime_type_check', sql`char_length(btrim(${table.mimeType})) > 0`)
	]
);

export const todoImageMarkups = pgTable(
	'todo_image_markups',
	{
		imageId: uuid('image_id')
			.primaryKey()
			.references(() => todoImages.id, { onDelete: 'cascade' }),
		data: jsonb('data').$type<Record<string, unknown>>().notNull(),
		version: integer('version').default(1).notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
	},
	(table) => [check('todo_image_markups_version_check', sql`${table.version} > 0`)]
);

export const contacts = pgTable(
	'contacts',
	{
		ownerId: uuid('owner_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		contactId: uuid('contact_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
	},
	(table) => [
		primaryKey({ columns: [table.ownerId, table.contactId] }),
		index('contacts_owner_idx').on(table.ownerId),
		index('contacts_contact_idx').on(table.contactId),
		check('contacts_not_self_check', sql`${table.ownerId} <> ${table.contactId}`)
	]
);

export const removedContacts = pgTable(
	'removed_contacts',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		ownerId: uuid('owner_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		reason: text('reason').notNull(),
		removedAt: timestamp('removed_at', { withTimezone: true }).defaultNow().notNull()
	},
	(table) => [
		index('removed_contacts_history_idx').on(table.ownerId, table.userId, table.removedAt.desc()),
		check('removed_contacts_not_self_check', sql`${table.ownerId} <> ${table.userId}`)
	]
);

export const contactGroups = pgTable(
	'contact_groups',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		ownerId: uuid('owner_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
	},
	(table) => [
		index('contact_groups_owner_idx').on(table.ownerId),
		unique('contact_groups_owner_id_unique').on(table.ownerId, table.id),
		check('contact_groups_name_not_empty_check', sql`char_length(btrim(${table.name})) > 0`)
	]
);

export const contactGroupMembers = pgTable(
	'contact_group_members',
	{
		groupId: uuid('group_id')
			.notNull()
			.references(() => contactGroups.id, { onDelete: 'cascade' }),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
	},
	(table) => [
		primaryKey({ columns: [table.groupId, table.userId] }),
		index('contact_group_members_user_group_idx').on(table.userId, table.groupId)
	]
);

export const todoUserAccess = pgTable(
	'todo_user_access',
	{
		todoId: uuid('todo_id')
			.notNull()
			.references(() => todos.id, { onDelete: 'cascade' }),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		grantedBy: uuid('granted_by').references(() => users.id, { onDelete: 'set null' }),
		grantedAt: timestamp('granted_at', { withTimezone: true }).defaultNow().notNull()
	},
	(table) => [
		primaryKey({ columns: [table.todoId, table.userId] }),
		index('todo_user_access_user_todo_idx').on(table.userId, table.todoId)
	]
);

export const todoGroupAccess = pgTable(
	'todo_group_access',
	{
		todoId: uuid('todo_id')
			.notNull()
			.references(() => todos.id, { onDelete: 'cascade' }),
		groupId: uuid('group_id')
			.notNull()
			.references(() => contactGroups.id, { onDelete: 'cascade' }),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
	},
	(table) => [
		primaryKey({ columns: [table.todoId, table.groupId] }),
		index('todo_group_access_group_todo_idx').on(table.groupId, table.todoId)
	]
);

export const todoWorkers = pgTable(
	'todo_workers',
	{
		todoId: uuid('todo_id')
			.notNull()
			.references(() => todos.id, { onDelete: 'cascade' }),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		state: workerState('state').default('doing').notNull(),
		startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
		finishedAt: timestamp('finished_at', { withTimezone: true })
	},
	(table) => [
		primaryKey({ columns: [table.todoId, table.userId] }),
		index('todo_workers_todo_idx').on(table.todoId),
		check(
			'todo_workers_finished_state_check',
			sql`(${table.state} = 'doing' and ${table.finishedAt} is null) or (${table.state} = 'done' and ${table.finishedAt} is not null)`
		)
	]
);

export const messages = pgTable(
	'messages',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		todoId: uuid('todo_id')
			.notNull()
			.references(() => todos.id, { onDelete: 'cascade' }),
		authorId: uuid('author_id').references(() => users.id, { onDelete: 'set null' }),
		type: messageType('type').notNull(),
		text: text('text'),
		eventType: text('event_type'),
		eventData: jsonb('event_data').$type<Record<string, unknown>>(),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
		deletedAt: timestamp('deleted_at', { withTimezone: true })
	},
	(table) => [
		index('messages_todo_created_idx').on(table.todoId, table.createdAt),
		check(
			'messages_payload_by_type_check',
			sql`(${table.type} = 'user' and ${table.text} is not null and char_length(btrim(${table.text})) > 0 and ${table.eventType} is null and ${table.eventData} is null) or (${table.type} = 'system' and ${table.eventType} is not null and char_length(btrim(${table.eventType})) > 0)`
		)
	]
);

export const messageImages = pgTable(
	'message_images',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		messageId: uuid('message_id')
			.notNull()
			.references(() => messages.id, { onDelete: 'cascade' }),
		storageKey: text('storage_key').notNull().unique(),
		width: integer('width').notNull(),
		height: integer('height').notNull(),
		mimeType: text('mime_type').notNull(),
		sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
		sortOrder: integer('sort_order').default(0).notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
	},
	(table) => [
		index('message_images_message_sort_idx').on(table.messageId, table.sortOrder),
		check('message_images_width_check', sql`${table.width} > 0`),
		check('message_images_height_check', sql`${table.height} > 0`),
		check('message_images_size_check', sql`${table.sizeBytes} > 0`),
		check('message_images_sort_order_check', sql`${table.sortOrder} >= 0`),
		check('message_images_mime_type_check', sql`char_length(btrim(${table.mimeType})) > 0`)
	]
);

export const messageImageMarkups = pgTable(
	'message_image_markups',
	{
		imageId: uuid('image_id')
			.primaryKey()
			.references(() => messageImages.id, { onDelete: 'cascade' }),
		data: jsonb('data').$type<Record<string, unknown>>().notNull(),
		version: integer('version').default(1).notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
	},
	(table) => [check('message_image_markups_version_check', sql`${table.version} > 0`)]
);

export const dialogReadState = pgTable(
	'dialog_read_state',
	{
		todoId: uuid('todo_id')
			.notNull()
			.references(() => todos.id, { onDelete: 'cascade' }),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		readUserMessagesCount: integer('read_user_messages_count').default(0).notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
	},
	(table) => [
		primaryKey({ columns: [table.todoId, table.userId] }),
		index('dialog_read_state_user_idx').on(table.userId),
		check('dialog_read_state_count_check', sql`${table.readUserMessagesCount} >= 0`)
	]
);

export const todoShareLinks = pgTable(
	'todo_share_links',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		todoId: uuid('todo_id')
			.notNull()
			.unique()
			.references(() => todos.id, { onDelete: 'cascade' }),
		tokenHash: text('token_hash').notNull().unique(),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
	},
	(table) => [check('todo_share_links_token_hash_check', sql`char_length(${table.tokenHash}) > 0`)]
);

export const todoAccessRequests = pgTable(
	'todo_access_requests',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		todoId: uuid('todo_id')
			.notNull()
			.references(() => todos.id, { onDelete: 'cascade' }),
		requesterId: uuid('requester_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		status: accessRequestStatus('status').default('pending').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
		resolvedAt: timestamp('resolved_at', { withTimezone: true })
	},
	(table) => [
		uniqueIndex('todo_access_requests_pending_unique')
			.on(table.todoId, table.requesterId)
			.where(sql`${table.status} = 'pending'`),
		index('todo_access_requests_todo_status_idx').on(table.todoId, table.status),
		index('todo_access_requests_requester_status_idx').on(table.requesterId, table.status),
		check(
			'todo_access_requests_resolution_check',
			sql`(${table.status} = 'pending' and ${table.resolvedAt} is null) or (${table.status} <> 'pending' and ${table.resolvedAt} is not null)`
		)
	]
);

export const defaultShareUsers = pgTable(
	'default_share_users',
	{
		ownerId: uuid('owner_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' })
	},
	(table) => [
		primaryKey({ columns: [table.ownerId, table.userId] }),
		check('default_share_users_not_self_check', sql`${table.ownerId} <> ${table.userId}`)
	]
);

export const defaultShareGroups = pgTable(
	'default_share_groups',
	{
		ownerId: uuid('owner_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		groupId: uuid('group_id').notNull()
	},
	(table) => [
		primaryKey({ columns: [table.ownerId, table.groupId] }),
		foreignKey({
			columns: [table.ownerId, table.groupId],
			foreignColumns: [contactGroups.ownerId, contactGroups.id],
			name: 'default_share_groups_owned_group_fk'
		}).onDelete('cascade')
	]
);

export const subscriptions = pgTable(
	'subscriptions',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		plan: subscriptionPlan('plan').notNull(),
		status: subscriptionStatus('status').notNull(),
		currentPeriodStart: timestamp('current_period_start', { withTimezone: true }).notNull(),
		currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }).notNull(),
		provider: text('provider').notNull(),
		providerSubscriptionId: text('provider_subscription_id').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
	},
	(table) => [
		index('subscriptions_user_status_idx').on(table.userId, table.status),
		uniqueIndex('subscriptions_provider_id_unique').on(
			table.provider,
			table.providerSubscriptionId
		),
		check(
			'subscriptions_period_check',
			sql`${table.currentPeriodEnd} > ${table.currentPeriodStart}`
		),
		check('subscriptions_provider_check', sql`char_length(btrim(${table.provider})) > 0`),
		check(
			'subscriptions_provider_subscription_id_check',
			sql`char_length(btrim(${table.providerSubscriptionId})) > 0`
		)
	]
);

export const sponsoredSubscriptions = pgTable(
	'sponsored_subscriptions',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		payerId: uuid('payer_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		beneficiaryId: uuid('beneficiary_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		subscriptionId: uuid('subscription_id')
			.notNull()
			.unique()
			.references(() => subscriptions.id, { onDelete: 'cascade' }),
		autoRenew: boolean('auto_renew').default(false).notNull(),
		active: boolean('active').default(true).notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
		stoppedAt: timestamp('stopped_at', { withTimezone: true })
	},
	(table) => [
		index('sponsored_subscriptions_payer_active_idx').on(table.payerId, table.active),
		index('sponsored_subscriptions_beneficiary_active_idx').on(table.beneficiaryId, table.active),
		check(
			'sponsored_subscriptions_not_self_check',
			sql`${table.payerId} <> ${table.beneficiaryId}`
		),
		check(
			'sponsored_subscriptions_active_check',
			sql`(${table.active} and ${table.stoppedAt} is null) or (not ${table.active} and ${table.stoppedAt} is not null)`
		)
	]
);
