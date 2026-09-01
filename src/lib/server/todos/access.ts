import { and, eq, or, sql } from 'drizzle-orm';
import { db as defaultDb } from '$lib/server/db';
import { contactGroupMembers, todoGroupAccess, todoUserAccess, todos } from '$lib/server/db/schema';

type Database = typeof defaultDb;

export function createTodoAccessHelpers(database: Database = defaultDb) {
	return {
		async isTodoOwner(userId: string, todoId: string): Promise<boolean> {
			const [todo] = await database
				.select({ id: todos.id })
				.from(todos)
				.where(and(eq(todos.id, todoId), eq(todos.ownerId, userId)))
				.limit(1);
			return Boolean(todo);
		},
		async canViewTodo(userId: string, todoId: string): Promise<boolean> {
			const [todo] = await database
				.select({ id: todos.id })
				.from(todos)
				.where(
					and(
						eq(todos.id, todoId),
						or(
							eq(todos.ownerId, userId),
							sql`exists (select 1 from ${todoUserAccess} where ${todoUserAccess.todoId} = ${todos.id} and ${todoUserAccess.userId} = ${userId})`,
							sql`exists (select 1 from ${todoGroupAccess} join ${contactGroupMembers} on ${contactGroupMembers.groupId} = ${todoGroupAccess.groupId} where ${todoGroupAccess.todoId} = ${todos.id} and ${contactGroupMembers.userId} = ${userId})`
						)
					)
				)
				.limit(1);
			return Boolean(todo);
		},
		async getTodoAccessUserIds(todoId: string): Promise<string[]> {
			const [todo, direct, grouped] = await Promise.all([
				database
					.select({ ownerId: todos.ownerId })
					.from(todos)
					.where(eq(todos.id, todoId))
					.limit(1),
				database
					.select({ userId: todoUserAccess.userId })
					.from(todoUserAccess)
					.where(eq(todoUserAccess.todoId, todoId)),
				database
					.selectDistinct({ userId: contactGroupMembers.userId })
					.from(todoGroupAccess)
					.innerJoin(contactGroupMembers, eq(contactGroupMembers.groupId, todoGroupAccess.groupId))
					.where(eq(todoGroupAccess.todoId, todoId))
			]);
			return todo[0]
				? [
						...new Set([
							todo[0].ownerId,
							...direct.map((row) => row.userId),
							...grouped.map((row) => row.userId)
						])
					]
				: [];
		}
	};
}

export const todoAccess = createTodoAccessHelpers();
