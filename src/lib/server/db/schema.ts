import { sql } from 'drizzle-orm';
import type { ImageMarkupObject } from '$lib/client/markup/types';
import { USER_PLANS } from '$lib/billing/plans';
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

export const userPlan = pgEnum('user_plan', USER_PLANS);
export const todoStatus = pgEnum('todo_status', ['active', 'closed']);
export const todoBlockType = pgEnum('todo_block_type', ['text', 'image']);
export const workerState = pgEnum('worker_state', ['doing', 'done']);
export const messageType = pgEnum('message_type', ['user', 'system']);
export const accessRequestStatus = pgEnum('access_request_status', [
	'pending',
	'approved',
	'rejected'
]);
export const friendRequestStatus = pgEnum('friend_request_status', [
	'pending',
	'accepted',
	'rejected',
	'cancelled'
]);
export const subscriptionPlan = pgEnum('subscription_plan', ['cloud', 'join', 'share', 'group']);
export const subscriptionStatus = pgEnum('subscription_status', [
	'active',
	'past_due',
	'canceled',
	'expired'
]);
export const recurringFrequency = pgEnum('recurring_frequency', [
	'daily',
	'weekdays',
	'interval_days',
	'interval_weeks',
	'monthly'
]);
export const recurringOccurrenceStatus = pgEnum('recurring_occurrence_status', [
	'processing',
	'created',
	'skipped',
	'failed'
]);

export type NotificationPayload = Record<string, string | number | boolean | null>;

export const users = pgTable(
	'users',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		publicId: text('public_id').notNull().unique(),
		email: text('email').notNull().unique(),
		passwordHash: text('password_hash'),
		displayName: text('display_name').notNull(),
		emailVerified: boolean('email_verified').default(false).notNull(),
		image: text('image'),
		plan: userPlan('plan').default('free').notNull(),
		planExpiresAt: timestamp('plan_expires_at', { withTimezone: true }),
		billingPeriod: text('billing_period'),
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

export const sessions = pgTable(
	'sessions',
	{
		id: text('id').primaryKey(),
		expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
		token: text('token').notNull().unique(),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
		ipAddress: text('ip_address'),
		userAgent: text('user_agent'),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' })
	},
	(table) => [index('sessions_user_id_idx').on(table.userId)]
);

export const accounts = pgTable(
	'accounts',
	{
		id: text('id').primaryKey(),
		accountId: text('account_id').notNull(),
		providerId: text('provider_id').notNull(),
		issuer: text('issuer').notNull(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		accessToken: text('access_token'),
		refreshToken: text('refresh_token'),
		idToken: text('id_token'),
		accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
		refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
		scope: text('scope'),
		password: text('password'),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
	},
	(table) => [index('accounts_user_id_idx').on(table.userId)]
);

export const verifications = pgTable(
	'verifications',
	{
		id: text('id').primaryKey(),
		identifier: text('identifier').notNull(),
		value: text('value').notNull(),
		expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow()
	},
	(table) => [index('verifications_identifier_idx').on(table.identifier)]
);

export const todos = pgTable(
	'todos',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		ownerId: uuid('owner_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		// Deprecated: block rows are the source of truth for todo content.
		text: text('text'),
		status: todoStatus('status').default('active').notNull(),
		revision: integer('revision').default(1).notNull(),
		isShared: boolean('is_shared').default(false).notNull(),
		isAutomatic: boolean('is_automatic').default(false).notNull(),
		recurringTemplateId: uuid('recurring_template_id'),
		userMessageCount: integer('user_message_count').default(0).notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
		closedAt: timestamp('closed_at', { withTimezone: true }),
		reopenedAt: timestamp('reopened_at', { withTimezone: true }),
		deletedAt: timestamp('deleted_at', { withTimezone: true })
	},
	(table) => [
		index('todos_owner_status_idx').on(table.ownerId, table.status),
		index('todos_owner_updated_idx').on(table.ownerId, table.updatedAt),
		index('todos_owner_deleted_idx').on(table.ownerId, table.deletedAt),
		check('todos_revision_check', sql`${table.revision} > 0`),
		check(
			'todos_text_not_empty_check',
			sql`${table.text} is null or char_length(btrim(${table.text})) > 0`
		),
		check('todos_user_message_count_check', sql`${table.userMessageCount} >= 0`)
	]
);

export type RecurringContentSnapshot = {
	blocks: Array<
		| { id: string; type: 'text'; position: number; text: string }
		| { id: string; type: 'image'; position: number; imageId: string }
	>;
	images: Array<{
		id: string;
		storageKey: string;
		mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
		width: number;
		height: number;
		sizeBytes: number;
		markup: { version: 1; objects: ImageMarkupObject[] } | null;
	}>;
};
export type RecurringSettingsSnapshot = {
	isShared: boolean;
	userIds: string[];
	groupIds: string[];
};

export const recurringTemplates = pgTable(
	'recurring_templates',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		ownerId: uuid('owner_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		enabled: boolean('enabled').default(true).notNull(),
		frequency: recurringFrequency('frequency').notNull(),
		interval: integer('interval').default(1).notNull(),
		weekdays: integer('weekdays')
			.array()
			.default(sql`'{}'::integer[]`)
			.notNull(),
		monthDay: integer('month_day'),
		localTime: text('local_time').notNull(),
		timezone: text('timezone').notNull(),
		contentSnapshot: jsonb('content_snapshot').$type<RecurringContentSnapshot>().notNull(),
		settingsSnapshot: jsonb('settings_snapshot').$type<RecurringSettingsSnapshot>().notNull(),
		nextRunAt: timestamp('next_run_at', { withTimezone: true }).notNull(),
		lastRunAt: timestamp('last_run_at', { withTimezone: true }),
		lastError: text('last_error'),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
	},
	(table) => [
		index('recurring_templates_due_idx').on(table.enabled, table.nextRunAt),
		check('recurring_templates_interval_check', sql`${table.interval} > 0`)
	]
);

export const recurringOccurrences = pgTable(
	'recurring_occurrences',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		templateId: uuid('template_id')
			.notNull()
			.references(() => recurringTemplates.id, { onDelete: 'cascade' }),
		scheduledFor: timestamp('scheduled_for', { withTimezone: true }).notNull(),
		status: recurringOccurrenceStatus('status').notNull(),
		todoId: uuid('todo_id').references(() => todos.id, { onDelete: 'set null' }),
		error: text('error'),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
	},
	(table) => [
		unique('recurring_occurrences_template_scheduled_unique').on(
			table.templateId,
			table.scheduledFor
		)
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
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
	},
	(table) => [
		index('todo_images_todo_sort_idx').on(table.todoId, table.sortOrder),
		unique('todo_images_todo_id_id_unique').on(table.todoId, table.id),
		check('todo_images_width_check', sql`${table.width} > 0`),
		check('todo_images_height_check', sql`${table.height} > 0`),
		check('todo_images_size_check', sql`${table.sizeBytes} > 0`),
		check('todo_images_sort_order_check', sql`${table.sortOrder} >= 0`),
		check('todo_images_mime_type_check', sql`char_length(btrim(${table.mimeType})) > 0`)
	]
);

export const todoBlocks = pgTable(
	'todo_blocks',
	{
		id: uuid('id').primaryKey(),
		todoId: uuid('todo_id')
			.notNull()
			.references(() => todos.id, { onDelete: 'cascade' }),
		type: todoBlockType('type').notNull(),
		position: integer('position').notNull(),
		text: text('text'),
		imageId: uuid('image_id')
	},
	(table) => [
		unique('todo_blocks_todo_position_unique').on(table.todoId, table.position),
		index('todo_blocks_todo_position_idx').on(table.todoId, table.position),
		foreignKey({
			columns: [table.todoId, table.imageId],
			foreignColumns: [todoImages.todoId, todoImages.id],
			name: 'todo_blocks_owned_image_fk'
		}).onDelete('cascade'),
		check('todo_blocks_position_check', sql`${table.position} >= 0`),
		check(
			'todo_blocks_payload_check',
			sql`(${table.type} = 'text' and ${table.text} is not null and ${table.imageId} is null) or (${table.type} = 'image' and ${table.text} is null and ${table.imageId} is not null)`
		)
	]
);

export const todoImageMarkups = pgTable(
	'todo_image_markups',
	{
		imageId: uuid('image_id')
			.primaryKey()
			.references(() => todoImages.id, { onDelete: 'cascade' }),
		data: jsonb('data').$type<ImageMarkupObject[]>().notNull(),
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
		reason: text('reason'),
		removedAt: timestamp('removed_at', { withTimezone: true }).defaultNow().notNull()
	},
	(table) => [
		unique('removed_contacts_owner_user_unique').on(table.ownerId, table.userId),
		index('removed_contacts_history_idx').on(table.ownerId, table.userId, table.removedAt.desc()),
		check('removed_contacts_not_self_check', sql`${table.ownerId} <> ${table.userId}`)
	]
);

export const friendRequests = pgTable(
	'friend_requests',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		senderUserId: uuid('sender_user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		recipientUserId: uuid('recipient_user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		status: friendRequestStatus('status').default('pending').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
	},
	(table) => [
		uniqueIndex('friend_requests_pending_sender_recipient_unique')
			.on(table.senderUserId, table.recipientUserId)
			.where(sql`${table.status} = 'pending'`),
		index('friend_requests_recipient_status_idx').on(table.recipientUserId, table.status),
		index('friend_requests_sender_status_idx').on(table.senderUserId, table.status),
		check('friend_requests_not_self_check', sql`${table.senderUserId} <> ${table.recipientUserId}`)
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
		uniqueIndex('contact_groups_owner_name_unique').on(
			table.ownerId,
			sql`lower(btrim(${table.name}))`
		),
		check('contact_groups_name_not_empty_check', sql`char_length(btrim(${table.name})) > 0`)
	]
);

export const contactGroupMembers = pgTable(
	'contact_group_members',
	{
		ownerId: uuid('owner_id').notNull(),
		groupId: uuid('group_id').notNull(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
	},
	(table) => [
		primaryKey({ columns: [table.groupId, table.userId] }),
		index('contact_group_members_user_group_idx').on(table.userId, table.groupId),
		index('contact_group_members_owner_user_idx').on(table.ownerId, table.userId),
		foreignKey({
			columns: [table.ownerId, table.groupId],
			foreignColumns: [contactGroups.ownerId, contactGroups.id],
			name: 'contact_group_members_owned_group_fk'
		}).onDelete('cascade'),
		foreignKey({
			columns: [table.ownerId, table.userId],
			foreignColumns: [contacts.ownerId, contacts.contactId],
			name: 'contact_group_members_contact_fk'
		}).onDelete('cascade')
	]
);

export const friendRequestGroups = pgTable(
	'friend_request_groups',
	{
		requestId: uuid('request_id')
			.notNull()
			.references(() => friendRequests.id, { onDelete: 'cascade' }),
		groupId: uuid('group_id')
			.notNull()
			.references(() => contactGroups.id, { onDelete: 'cascade' })
	},
	(table) => [
		primaryKey({ columns: [table.requestId, table.groupId] }),
		index('friend_request_groups_group_idx').on(table.groupId)
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
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
	},
	(table) => [
		primaryKey({ columns: [table.todoId, table.userId] }),
		index('todo_user_access_user_todo_idx').on(table.userId, table.todoId)
	]
);

export const todoAccessRevocations = pgTable(
	'todo_access_revocations',
	{
		todoId: uuid('todo_id')
			.notNull()
			.references(() => todos.id, { onDelete: 'cascade' }),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		revokedAt: timestamp('revoked_at', { withTimezone: true }).defaultNow().notNull()
	},
	(table) => [
		primaryKey({ columns: [table.todoId, table.userId] }),
		index('todo_access_revocations_user_idx').on(table.userId, table.revokedAt)
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

export const notifications = pgTable(
	'notifications',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		type: text('type').notNull(),
		actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
		todoId: uuid('todo_id').references(() => todos.id, { onDelete: 'set null' }),
		groupId: uuid('group_id').references(() => contactGroups.id, { onDelete: 'set null' }),
		friendRequestId: uuid('friend_request_id').references(() => friendRequests.id, {
			onDelete: 'set null'
		}),
		payload: jsonb('payload').$type<NotificationPayload>().default({}).notNull(),
		dedupeKey: text('dedupe_key'),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
		readAt: timestamp('read_at', { withTimezone: true })
	},
	(table) => [
		index('notifications_user_created_idx').on(table.userId, table.createdAt.desc()),
		index('notifications_user_unread_idx').on(table.userId, table.readAt, table.createdAt.desc()),
		uniqueIndex('notifications_user_dedupe_unique')
			.on(table.userId, table.dedupeKey)
			.where(sql`${table.dedupeKey} is not null`)
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
		revision: integer('revision').default(1).notNull(),
		text: text('text'),
		eventType: text('event_type'),
		eventData: jsonb('event_data').$type<Record<string, unknown>>(),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
		deletedAt: timestamp('deleted_at', { withTimezone: true })
	},
	(table) => [
		index('messages_todo_created_idx').on(table.todoId, table.createdAt),
		check('messages_revision_check', sql`${table.revision} > 0`),
		check(
			'messages_payload_by_type_check',
			sql`(${table.type} = 'user' and ${table.eventType} is null and ${table.eventData} is null) or (${table.type} = 'system' and ${table.eventType} is not null and char_length(btrim(${table.eventType})) > 0)`
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
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
	},
	(table) => [
		index('message_images_message_sort_idx').on(table.messageId, table.sortOrder),
		unique('message_images_message_id_id_unique').on(table.messageId, table.id),
		check('message_images_width_check', sql`${table.width} > 0`),
		check('message_images_height_check', sql`${table.height} > 0`),
		check('message_images_size_check', sql`${table.sizeBytes} > 0`),
		check('message_images_sort_order_check', sql`${table.sortOrder} >= 0`),
		check('message_images_mime_type_check', sql`char_length(btrim(${table.mimeType})) > 0`)
	]
);

export const messageBlocks = pgTable(
	'message_blocks',
	{
		id: uuid('id').primaryKey(),
		messageId: uuid('message_id')
			.notNull()
			.references(() => messages.id, { onDelete: 'cascade' }),
		type: todoBlockType('type').notNull(),
		position: integer('position').notNull(),
		text: text('text'),
		imageId: uuid('image_id')
	},
	(table) => [
		unique('message_blocks_message_position_unique').on(table.messageId, table.position),
		index('message_blocks_message_position_idx').on(table.messageId, table.position),
		foreignKey({
			columns: [table.messageId, table.imageId],
			foreignColumns: [messageImages.messageId, messageImages.id],
			name: 'message_blocks_owned_image_fk'
		}).onDelete('cascade'),
		check('message_blocks_position_check', sql`${table.position} >= 0`),
		check(
			'message_blocks_payload_check',
			sql`(${table.type} = 'text' and ${table.text} is not null and ${table.imageId} is null) or (${table.type} = 'image' and ${table.text} is null and ${table.imageId} is not null)`
		)
	]
);

export const messageImageMarkups = pgTable(
	'message_image_markups',
	{
		imageId: uuid('image_id')
			.primaryKey()
			.references(() => messageImages.id, { onDelete: 'cascade' }),
		data: jsonb('data').$type<ImageMarkupObject[]>().notNull(),
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

export const billingWebhookEvents = pgTable('billing_webhook_events', {
	eventId: text('event_id').primaryKey(),
	eventType: text('event_type').notNull(),
	occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
	processedAt: timestamp('processed_at', { withTimezone: true }).defaultNow().notNull()
});

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
