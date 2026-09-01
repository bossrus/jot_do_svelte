import { randomUUID } from 'node:crypto';
import { and, asc, eq, inArray, lte, sql } from 'drizzle-orm';
import { db as defaultDb } from '$lib/server/db';
import {
	contactGroupMembers,
	contactGroups,
	contacts,
	recurringOccurrences,
	recurringTemplates,
	todoBlocks,
	todoGroupAccess,
	todoImageMarkups,
	todoImages,
	todoUserAccess,
	todos,
	users,
	type RecurringContentSnapshot
} from '$lib/server/db/schema';
import { hasPlanCapability } from '$lib/server/permissions/plans';
import { createR2ObjectStorage, type ObjectStorage } from '$lib/server/storage';
import { publishServerEvent, type PublishServerEvent } from '$lib/server/sync/events';
import type { RecurringSchedule } from '$lib/recurring/contracts';
import { nextRunAt, selectMissedOccurrence } from './schedule';

type Database = typeof defaultDb;
function fields(schedule: RecurringSchedule) {
	return {
		frequency: schedule.frequency,
		interval: 'interval' in schedule ? schedule.interval : 1,
		weekdays: 'weekdays' in schedule ? [...new Set(schedule.weekdays)].sort() : [],
		monthDay: 'monthDay' in schedule ? schedule.monthDay : null,
		localTime: schedule.localTime,
		timezone: schedule.timezone
	};
}
function scheduleOf(row: typeof recurringTemplates.$inferSelect): RecurringSchedule {
	const common = { localTime: row.localTime, timezone: row.timezone };
	if (row.frequency === 'weekdays')
		return { frequency: row.frequency, weekdays: row.weekdays, ...common };
	if (row.frequency === 'monthly')
		return { frequency: row.frequency, monthDay: row.monthDay!, ...common };
	if (row.frequency === 'interval_days' || row.frequency === 'interval_weeks')
		return { frequency: row.frequency, interval: row.interval, ...common };
	return { frequency: 'daily', ...common };
}
export function createRecurringService(
	database: Database = defaultDb,
	publish: PublishServerEvent = publishServerEvent,
	storageFactory: () => ObjectStorage = createR2ObjectStorage
) {
	async function snapshotTodo(
		ownerId: string,
		todoId: string
	): Promise<{
		content: RecurringContentSnapshot;
		settings: typeof recurringTemplates.$inferInsert.settingsSnapshot;
	}> {
		const [todo] = await database
			.select()
			.from(todos)
			.where(and(eq(todos.id, todoId), eq(todos.ownerId, ownerId), sql`${todos.deletedAt} is null`))
			.limit(1);
		if (!todo) throw new Error('NOT_FOUND');
		const blocks = await database
			.select()
			.from(todoBlocks)
			.where(eq(todoBlocks.todoId, todoId))
			.orderBy(asc(todoBlocks.position));
		const images = await database
			.select({
				id: todoImages.id,
				storageKey: todoImages.storageKey,
				mimeType: todoImages.mimeType,
				width: todoImages.width,
				height: todoImages.height,
				sizeBytes: todoImages.sizeBytes,
				markupVersion: todoImageMarkups.version,
				markupObjects: todoImageMarkups.data
			})
			.from(todoImages)
			.leftJoin(todoImageMarkups, eq(todoImages.id, todoImageMarkups.imageId))
			.where(eq(todoImages.todoId, todoId));
		const userAccess = await database
			.select({ id: todoUserAccess.userId })
			.from(todoUserAccess)
			.where(eq(todoUserAccess.todoId, todoId));
		const groupAccess = await database
			.select({ id: todoGroupAccess.groupId })
			.from(todoGroupAccess)
			.where(eq(todoGroupAccess.todoId, todoId));
		return {
			content: {
				blocks: blocks.map((b) =>
					b.type === 'text'
						? { id: b.id, type: 'text' as const, position: b.position, text: b.text ?? '' }
						: { id: b.id, type: 'image' as const, position: b.position, imageId: b.imageId! }
				),
				images: images.map((i) => ({
					id: i.id,
					storageKey: i.storageKey,
					mimeType: i.mimeType as 'image/jpeg' | 'image/png' | 'image/webp',
					width: i.width,
					height: i.height,
					sizeBytes: i.sizeBytes,
					markup: i.markupVersion ? { version: 1 as const, objects: i.markupObjects ?? [] } : null
				}))
			},
			settings: {
				isShared: todo.isShared,
				userIds: userAccess.map((x) => x.id),
				groupIds: groupAccess.map((x) => x.id)
			}
		};
	}
	async function validatedSettings(ownerId: string, userIds: string[], groupIds: string[]) {
		const requestedUsers = [...new Set(userIds)];
		const requestedGroups = [...new Set(groupIds)];
		const [owner] = await database
			.select({ plan: users.plan })
			.from(users)
			.where(eq(users.id, ownerId))
			.limit(1);
		if (!owner || !hasPlanCapability(owner.plan, 'canUseRecurringTodos'))
			throw new Error('PLAN_REQUIRED');
		if (
			(requestedUsers.length || requestedGroups.length) &&
			!hasPlanCapability(owner.plan, 'canShareTodo')
		)
			throw new Error('PLAN_REQUIRED');
		if (requestedGroups.length && !hasPlanCapability(owner.plan, 'canManageGroups'))
			throw new Error('PLAN_REQUIRED');
		const validUsers = requestedUsers.length
			? await database
					.select({ id: contacts.contactId })
					.from(contacts)
					.where(and(eq(contacts.ownerId, ownerId), inArray(contacts.contactId, requestedUsers)))
			: [];
		const validGroups = requestedGroups.length
			? await database
					.select({ id: contactGroups.id })
					.from(contactGroups)
					.where(
						and(eq(contactGroups.ownerId, ownerId), inArray(contactGroups.id, requestedGroups))
					)
			: [];
		if (
			validUsers.length !== requestedUsers.length ||
			validGroups.length !== requestedGroups.length
		)
			throw new Error('ACCESS_INVALID');
		if (requestedUsers.length) {
			const participants = await database
				.select({ plan: users.plan })
				.from(users)
				.where(inArray(users.id, requestedUsers));
			if (
				participants.length !== requestedUsers.length ||
				participants.some(
					(participant) => !hasPlanCapability(participant.plan, 'canJoinSharedTodo')
				)
			)
				throw new Error('PARTICIPANT_PLAN_REQUIRED');
		}
		return {
			isShared: Boolean(requestedUsers.length || requestedGroups.length),
			userIds: requestedUsers,
			groupIds: requestedGroups
		};
	}
	async function requireOwner(ownerId: string, id: string) {
		const [row] = await database
			.select()
			.from(recurringTemplates)
			.where(and(eq(recurringTemplates.id, id), eq(recurringTemplates.ownerId, ownerId)))
			.limit(1);
		if (!row) throw new Error('NOT_FOUND');
		return row;
	}
	const service = {
		async list(ownerId: string) {
			return database
				.select()
				.from(recurringTemplates)
				.where(eq(recurringTemplates.ownerId, ownerId))
				.orderBy(asc(recurringTemplates.nextRunAt));
		},
		async getByTodo(ownerId: string, todoId: string) {
			return (
				(
					await database
						.select()
						.from(recurringTemplates)
						.where(
							and(
								eq(recurringTemplates.ownerId, ownerId),
								sql`${recurringTemplates.contentSnapshot}->>'sourceTodoId' = ${todoId}`
							)
						)
						.limit(1)
				)[0] ?? null
			);
		},
		async get(ownerId: string, id: string) {
			return requireOwner(ownerId, id);
		},
		async createFromTodo(
			ownerId: string,
			todoId: string,
			schedule: RecurringSchedule,
			enabled = true,
			userIds?: string[],
			groupIds?: string[]
		) {
			const [owner] = await database
				.select({ plan: users.plan })
				.from(users)
				.where(eq(users.id, ownerId))
				.limit(1);
			if (!owner || !hasPlanCapability(owner.plan, 'canUseRecurringTodos'))
				throw new Error('PLAN_REQUIRED');
			const snap = await snapshotTodo(ownerId, todoId);
			const settings =
				userIds || groupIds
					? await validatedSettings(ownerId, userIds ?? [], groupIds ?? [])
					: await validatedSettings(ownerId, snap.settings.userIds, snap.settings.groupIds);
			const now = new Date();
			const [row] = await database
				.insert(recurringTemplates)
				.values({
					ownerId,
					enabled,
					...fields(schedule),
					contentSnapshot: { ...snap.content, sourceTodoId: todoId } as RecurringContentSnapshot,
					settingsSnapshot: settings,
					nextRunAt: nextRunAt(schedule, now),
					createdAt: now,
					updatedAt: now
				})
				.returning();
			return row;
		},
		async update(
			ownerId: string,
			id: string,
			schedule: RecurringSchedule,
			enabled: boolean,
			userIds?: string[],
			groupIds?: string[]
		) {
			const existing = await requireOwner(ownerId, id);
			const settings = await validatedSettings(
				ownerId,
				userIds ?? existing.settingsSnapshot.userIds,
				groupIds ?? existing.settingsSnapshot.groupIds
			);
			const now = new Date();
			const [row] = await database
				.update(recurringTemplates)
				.set({
					enabled,
					...fields(schedule),
					nextRunAt: nextRunAt(schedule, now),
					lastError: null,
					settingsSnapshot: settings,
					updatedAt: now
				})
				.where(eq(recurringTemplates.id, id))
				.returning();
			return row;
		},
		async refreshContent(ownerId: string, id: string, todoId: string) {
			await requireOwner(ownerId, id);
			const snap = await snapshotTodo(ownerId, todoId);
			await database
				.update(recurringTemplates)
				.set({
					contentSnapshot: { ...snap.content, sourceTodoId: todoId } as RecurringContentSnapshot,
					updatedAt: new Date()
				})
				.where(eq(recurringTemplates.id, id));
		},
		async updateContent(ownerId: string, id: string, content: RecurringContentSnapshot) {
			const existing = await requireOwner(ownerId, id);
			if (
				!Array.isArray(content.blocks) ||
				!content.blocks.length ||
				!Array.isArray(content.images)
			)
				throw new Error('INVALID_CONTENT');
			if (content.images.some((image) => !image.storageKey.startsWith(`users/${ownerId}/images/`)))
				throw new Error('INVALID_CONTENT');
			const imageIds = new Set(content.images.map((image) => image.id));
			if (
				content.blocks.some(
					(block, index) =>
						block.position !== index || (block.type === 'image' && !imageIds.has(block.imageId))
				)
			)
				throw new Error('INVALID_CONTENT');
			await database
				.update(recurringTemplates)
				.set({
					contentSnapshot: {
						...content,
						sourceTodoId: (
							existing.contentSnapshot as RecurringContentSnapshot & { sourceTodoId?: string }
						).sourceTodoId
					} as RecurringContentSnapshot,
					updatedAt: new Date()
				})
				.where(eq(recurringTemplates.id, id));
		},
		async remove(ownerId: string, id: string) {
			await requireOwner(ownerId, id);
			await database.delete(recurringTemplates).where(eq(recurringTemplates.id, id));
		},
		async runDue(now = new Date(), limit = 25): Promise<{ created: number; processed: number }> {
			const emitted: Array<{ ownerId: string; todoId: string }> = [];
			let processed = 0;
			await database.transaction(async (tx) => {
				const due = await tx
					.select()
					.from(recurringTemplates)
					.where(and(eq(recurringTemplates.enabled, true), lte(recurringTemplates.nextRunAt, now)))
					.orderBy(asc(recurringTemplates.nextRunAt))
					.limit(limit)
					.for('update', { skipLocked: true });
				for (const raw of due as unknown as Array<typeof recurringTemplates.$inferSelect>) {
					processed++;
					const rawRecord = raw as typeof raw & {
						owner_id?: string;
						next_run_at?: Date | string;
						content_snapshot?: typeof raw.contentSnapshot;
						settings_snapshot?: typeof raw.settingsSnapshot;
						local_time?: string;
						month_day?: number | null;
					};
					const row = {
						...raw,
						ownerId: rawRecord.owner_id ?? raw.ownerId,
						nextRunAt: new Date(rawRecord.next_run_at ?? raw.nextRunAt),
						contentSnapshot: rawRecord.content_snapshot ?? raw.contentSnapshot,
						settingsSnapshot: rawRecord.settings_snapshot ?? raw.settingsSnapshot,
						localTime: rawRecord.local_time ?? raw.localTime,
						monthDay: rawRecord.month_day ?? raw.monthDay
					};
					const { scheduledFor, nextAfter } = selectMissedOccurrence(row.nextRunAt, now);
					const schedule = scheduleOf(row);
					const future = nextRunAt(schedule, nextAfter);
					const [owner] = await tx
						.select({ plan: users.plan })
						.from(users)
						.where(eq(users.id, row.ownerId))
						.limit(1);
					if (
						!owner ||
						!hasPlanCapability(owner.plan, 'canUseRecurringTodos') ||
						(row.settingsSnapshot.isShared && !hasPlanCapability(owner.plan, 'canShareTodo')) ||
						(row.settingsSnapshot.groupIds.length > 0 &&
							!hasPlanCapability(owner.plan, 'canManageGroups'))
					) {
						await tx
							.insert(recurringOccurrences)
							.values({
								templateId: row.id,
								scheduledFor,
								status: 'skipped',
								error: 'PLAN_REQUIRED'
							})
							.onConflictDoNothing();
						await tx
							.update(recurringTemplates)
							.set({
								lastRunAt: scheduledFor,
								nextRunAt: future,
								lastError: 'PLAN_REQUIRED',
								updatedAt: now
							})
							.where(eq(recurringTemplates.id, row.id));
						continue;
					}
					const validUsers = row.settingsSnapshot.userIds.length
						? await tx
								.select({ id: contacts.contactId })
								.from(contacts)
								.where(
									and(
										eq(contacts.ownerId, row.ownerId),
										inArray(contacts.contactId, row.settingsSnapshot.userIds)
									)
								)
						: [];
					const validGroups = row.settingsSnapshot.groupIds.length
						? await tx
								.select({ id: contactGroups.id })
								.from(contactGroups)
								.where(
									and(
										eq(contactGroups.ownerId, row.ownerId),
										inArray(contactGroups.id, row.settingsSnapshot.groupIds)
									)
								)
						: [];
					if (
						validUsers.length !== row.settingsSnapshot.userIds.length ||
						validGroups.length !== row.settingsSnapshot.groupIds.length
					) {
						await tx
							.insert(recurringOccurrences)
							.values({
								templateId: row.id,
								scheduledFor,
								status: 'skipped',
								error: 'ACCESS_INVALID'
							})
							.onConflictDoNothing();
						await tx
							.update(recurringTemplates)
							.set({
								lastRunAt: scheduledFor,
								nextRunAt: future,
								lastError: 'ACCESS_INVALID',
								updatedAt: now
							})
							.where(eq(recurringTemplates.id, row.id));
						continue;
					}
					const participants = row.settingsSnapshot.userIds.length
						? await tx
								.select({ plan: users.plan })
								.from(users)
								.where(inArray(users.id, row.settingsSnapshot.userIds))
						: [];
					if (
						participants.length !== row.settingsSnapshot.userIds.length ||
						participants.some(
							(participant) => !hasPlanCapability(participant.plan, 'canJoinSharedTodo')
						)
					) {
						await tx
							.insert(recurringOccurrences)
							.values({
								templateId: row.id,
								scheduledFor,
								status: 'skipped',
								error: 'PLAN_REQUIRED'
							})
							.onConflictDoNothing();
						await tx
							.update(recurringTemplates)
							.set({
								lastRunAt: scheduledFor,
								nextRunAt: future,
								lastError: 'PLAN_REQUIRED',
								updatedAt: now
							})
							.where(eq(recurringTemplates.id, row.id));
						continue;
					}
					const occurrenceId = randomUUID();
					const todoId = randomUUID();
					const inserted = await tx
						.insert(recurringOccurrences)
						.values({ id: occurrenceId, templateId: row.id, scheduledFor, status: 'processing' })
						.onConflictDoNothing()
						.returning({ id: recurringOccurrences.id });
					if (!inserted.length) {
						await tx
							.update(recurringTemplates)
							.set({ lastRunAt: scheduledFor, nextRunAt: future, updatedAt: now })
							.where(eq(recurringTemplates.id, row.id));
						continue;
					}
					await tx.insert(todos).values({
						id: todoId,
						ownerId: row.ownerId,
						status: 'active',
						revision: 1,
						isShared: row.settingsSnapshot.isShared,
						isAutomatic: true,
						recurringTemplateId: row.id,
						createdAt: now,
						updatedAt: now
					});
					// Text-only recurring todos do not use object storage. Creating the R2
					// client eagerly made every lazy scheduler check require R2 credentials,
					// even when the due template contained no images.
					const storage = row.contentSnapshot.images.length ? storageFactory() : null;
					const imageIds = new Map<string, string>();
					for (const image of row.contentSnapshot.images) {
						const newId = randomUUID();
						imageIds.set(image.id, newId);
						const ext =
							image.mimeType === 'image/jpeg'
								? 'jpg'
								: image.mimeType === 'image/png'
									? 'png'
									: 'webp';
						const key = `users/${row.ownerId}/images/${newId}.${ext}`;
						const data = await storage!.get(image.storageKey);
						if (!data) throw new Error(`SOURCE_IMAGE_MISSING:${image.id}`);
						await storage!.put(key, data, image.mimeType);
						await tx.insert(todoImages).values({
							id: newId,
							todoId,
							storageKey: key,
							mimeType: image.mimeType,
							width: image.width,
							height: image.height,
							sizeBytes: image.sizeBytes,
							sortOrder: 0,
							createdAt: now,
							updatedAt: now
						});
						if (image.markup)
							await tx.insert(todoImageMarkups).values({
								imageId: newId,
								data: image.markup.objects,
								version: image.markup.version,
								updatedAt: now
							});
					}
					if (row.contentSnapshot.blocks.length)
						await tx.insert(todoBlocks).values(
							row.contentSnapshot.blocks.map((b: RecurringContentSnapshot['blocks'][number]) => ({
								id: randomUUID(),
								todoId,
								type: b.type,
								position: b.position,
								text: b.type === 'text' ? b.text : null,
								imageId: b.type === 'image' ? imageIds.get(b.imageId)! : null
							}))
						);
					if (row.settingsSnapshot.userIds.length)
						await tx.insert(todoUserAccess).values(
							row.settingsSnapshot.userIds.map((userId: string) => ({
								todoId,
								userId,
								grantedBy: row.ownerId
							}))
						);
					if (row.settingsSnapshot.groupIds.length)
						await tx
							.insert(todoGroupAccess)
							.values(
								row.settingsSnapshot.groupIds.map((groupId: string) => ({ todoId, groupId }))
							);
					await tx
						.update(recurringOccurrences)
						.set({ status: 'created', todoId, updatedAt: now })
						.where(eq(recurringOccurrences.id, occurrenceId));
					await tx
						.update(recurringTemplates)
						.set({ lastRunAt: scheduledFor, nextRunAt: future, lastError: null, updatedAt: now })
						.where(eq(recurringTemplates.id, row.id));
					emitted.push({ ownerId: row.ownerId, todoId });
				}
			});
			for (const item of emitted) {
				const recipients = await database
					.select({ id: todoUserAccess.userId })
					.from(todoUserAccess)
					.where(eq(todoUserAccess.todoId, item.todoId));
				const groupRecipients = await database
					.select({ id: contactGroupMembers.userId })
					.from(todoGroupAccess)
					.innerJoin(contactGroupMembers, eq(contactGroupMembers.groupId, todoGroupAccess.groupId))
					.where(eq(todoGroupAccess.todoId, item.todoId));
				for (const userId of new Set([
					item.ownerId,
					...recipients.map((x) => x.id),
					...groupRecipients.map((x) => x.id)
				]))
					await publish(userId, { type: 'todo.changed', todoId: item.todoId, revision: 1 });
			}
			if (processed > 0) {
				const more: { created: number; processed: number } = await service.runDue(now, limit);
				return { created: emitted.length + more.created, processed: processed + more.processed };
			}
			return { created: emitted.length, processed };
		}
	};
	return service;
}
export const recurringService = createRecurringService();
