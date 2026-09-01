import { json } from '@sveltejs/kit';
import { and, eq, isNull, or, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	contactGroupMembers,
	contactGroups,
	todoGroupAccess,
	todoUserAccess,
	todos
} from '$lib/server/db/schema';
import { requireSyncUser } from '$lib/server/sync/http';

export async function GET(event) {
	const user = requireSyncUser(event);
	const rows = await db
		.selectDistinct({
			id: contactGroups.id,
			name: contactGroups.name,
			ownerId: contactGroups.ownerId,
			todoId: todoGroupAccess.todoId,
			status: todos.status
		})
		.from(todos)
		.innerJoin(todoGroupAccess, eq(todoGroupAccess.todoId, todos.id))
		.innerJoin(contactGroups, eq(contactGroups.id, todoGroupAccess.groupId))
		.where(
			and(
				isNull(todos.deletedAt),
				or(
					eq(todos.ownerId, user.id),
					sql`exists (select 1 from ${todoUserAccess} where ${todoUserAccess.todoId} = ${todos.id} and ${todoUserAccess.userId} = ${user.id})`,
					sql`exists (select 1 from ${todoGroupAccess} accessible_group join ${contactGroupMembers} on ${contactGroupMembers.groupId} = accessible_group.group_id where accessible_group.todo_id = ${todos.id} and ${contactGroupMembers.userId} = ${user.id})`
				)
			)
		);

	const groups = new Map<
		string,
		{ id: string; name: string; ownerId: string; todoIds: string[] }
	>();
	for (const row of rows) {
		const group = groups.get(row.id) ?? {
			id: row.id,
			name: row.name,
			ownerId: row.ownerId,
			todoIds: []
		};
		group.todoIds.push(row.todoId);
		groups.set(row.id, group);
	}
	return json({ groups: [...groups.values()].sort((a, b) => a.name.localeCompare(b.name)) });
}
