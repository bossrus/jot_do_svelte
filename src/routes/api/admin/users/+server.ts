import { json } from '@sveltejs/kit';
import { and, asc, count, desc, eq, gte, ilike, isNull, lte, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '$lib/server/db';
import { supportRequests, todoUserAccess, todos, users } from '$lib/server/db/schema';
import { requireAdmin } from '$lib/server/admin/auth';
import { USER_PLANS } from '$lib/billing/plans';

const updateSchema = z
	.object({
		id: z.uuid(),
		publicId: z.string().trim().min(1).max(100),
		email: z.email(),
		displayName: z.string().trim().min(1).max(200),
		emailVerified: z.boolean(),
		image: z.string().trim().max(4000).nullable(),
		plan: z.enum(USER_PLANS),
		planExpiresAt: z.iso.datetime().nullable(),
		billingPeriod: z.string().trim().max(100).nullable(),
		deletedAt: z.iso.datetime().nullable(),
		hardDeleteAfter: z.iso.datetime().nullable()
	})
	.refine((value) => value.plan === 'free' || value.planExpiresAt !== null, {
		message: 'Для платного тарифа укажите срок действия',
		path: ['planExpiresAt']
	});

function optionalDate(value: string | null) {
	return value ? new Date(value) : null;
}

export async function GET(event) {
	requireAdmin(event);
	const page = Math.max(1, Number(event.url.searchParams.get('page')) || 1);
	const pageSize = Math.min(100, Math.max(1, Number(event.url.searchParams.get('pageSize')) || 20));
	const search = event.url.searchParams.get('search')?.trim();
	const registeredFrom = event.url.searchParams.get('registeredFrom');
	const registeredTo = event.url.searchParams.get('registeredTo');
	const withSupport = event.url.searchParams.get('withSupport') === 'true';
	const withUnreadSupport = event.url.searchParams.get('withUnreadSupport') === 'true';
	const sort = event.url.searchParams.get('sort') ?? 'supportRequests';
	const direction = event.url.searchParams.get('direction') === 'asc' ? 'asc' : 'desc';
	const conditions = [];
	if (search) {
		const term = `%${search}%`;
		conditions.push(
			or(
				ilike(sql`${users.id}::text`, term),
				ilike(users.publicId, term),
				ilike(users.email, term),
				ilike(users.displayName, term),
				ilike(sql`coalesce(${users.image}, '')`, term),
				ilike(sql`${users.plan}::text`, term),
				ilike(sql`coalesce(${users.billingPeriod}, '')`, term),
				ilike(sql`${users.emailVerified}::text`, term),
				ilike(sql`${users.createdAt}::text`, term),
				ilike(sql`${users.updatedAt}::text`, term)
			)
		);
	}
	if (registeredFrom) conditions.push(gte(users.createdAt, new Date(`${registeredFrom}T00:00:00`)));
	if (registeredTo) conditions.push(lte(users.createdAt, new Date(`${registeredTo}T23:59:59.999`)));
	if (withSupport)
		conditions.push(
			sql`exists (select 1 from ${supportRequests} where ${supportRequests.userId} = ${users.id})`
		);
	if (withUnreadSupport)
		conditions.push(
			sql`exists (select 1 from ${supportRequests} where ${supportRequests.userId} = ${users.id} and ${supportRequests.readAt} is null)`
		);
	const where = conditions.length ? and(...conditions) : undefined;
	const [{ total }] = await db.select({ total: count() }).from(users).where(where);
	const directCounts = db
		.select({ userId: todos.ownerId, value: count().as('direct_value') })
		.from(todos)
		.where(isNull(todos.deletedAt))
		.groupBy(todos.ownerId)
		.as('direct_counts');
	const sharedCounts = db
		.select({ userId: todoUserAccess.userId, value: count().as('shared_value') })
		.from(todoUserAccess)
		.innerJoin(todos, eq(todos.id, todoUserAccess.todoId))
		.where(isNull(todos.deletedAt))
		.groupBy(todoUserAccess.userId)
		.as('shared_counts');
	const supportCounts = db
		.select({
			userId: supportRequests.userId,
			value: count().as('support_value'),
			unread: sql<number>`count(*) filter (where ${supportRequests.readAt} is null)`.as(
				'support_unread'
			),
			latestAt: sql<Date>`max(${supportRequests.createdAt})`.as('support_latest_at')
		})
		.from(supportRequests)
		.groupBy(supportRequests.userId)
		.as('support_counts');
	const directValue = sql<number>`coalesce(${directCounts.value}, 0)`;
	const sharedValue = sql<number>`coalesce(${sharedCounts.value}, 0)`;
	const supportValue = sql<number>`coalesce(${supportCounts.value}, 0)`;
	const supportUnreadValue = sql<number>`coalesce(${supportCounts.unread}, 0)`;
	const sortColumns = {
		displayName: users.displayName,
		plan: users.plan,
		directTodos: directValue,
		sharedTodos: sharedValue,
		supportRequests: supportCounts.latestAt,
		createdAt: users.createdAt
	} as const;
	const sortColumn = sortColumns[sort as keyof typeof sortColumns] ?? users.createdAt;
	const rawRows = await db
		.select({
			id: users.id,
			publicId: users.publicId,
			email: users.email,
			displayName: users.displayName,
			emailVerified: users.emailVerified,
			image: users.image,
			plan: users.plan,
			planExpiresAt: users.planExpiresAt,
			billingPeriod: users.billingPeriod,
			deletedAt: users.deletedAt,
			hardDeleteAfter: users.hardDeleteAfter,
			createdAt: users.createdAt,
			updatedAt: users.updatedAt,
			directTodos: directValue,
			sharedTodos: sharedValue,
			supportRequests: supportValue,
			supportUnread: supportUnreadValue,
			latestSupportAt: supportCounts.latestAt
		})
		.from(users)
		.leftJoin(directCounts, eq(directCounts.userId, users.id))
		.leftJoin(sharedCounts, eq(sharedCounts.userId, users.id))
		.leftJoin(supportCounts, eq(supportCounts.userId, users.id))
		.where(where)
		.orderBy(
			sort === 'supportRequests'
				? direction === 'asc'
					? sql`${sortColumn} asc nulls last`
					: sql`${sortColumn} desc nulls last`
				: direction === 'asc'
					? asc(sortColumn)
					: desc(sortColumn),
			asc(users.id)
		)
		.limit(pageSize)
		.offset((page - 1) * pageSize);
	const rows = rawRows.map((user) => ({
		...user,
		directTodos: Number(user.directTodos),
		sharedTodos: Number(user.sharedTodos),
		supportRequests: Number(user.supportRequests),
		supportUnread: Number(user.supportUnread)
	}));
	return json({
		users: rows,
		page,
		pageSize,
		total,
		pages: Math.max(1, Math.ceil(total / pageSize))
	});
}

export async function PUT(event) {
	requireAdmin(event);
	const parsed = updateSchema.safeParse(await event.request.json().catch(() => null));
	if (!parsed.success)
		return json(
			{ message: parsed.error.issues[0]?.message ?? 'Некорректные данные' },
			{ status: 400 }
		);
	const value = parsed.data;
	try {
		const [updated] = await db
			.update(users)
			.set({
				publicId: value.publicId,
				email: value.email.trim().toLowerCase(),
				displayName: value.displayName,
				emailVerified: value.emailVerified,
				image: value.image || null,
				plan: value.plan,
				planExpiresAt: value.plan === 'free' ? null : optionalDate(value.planExpiresAt),
				billingPeriod: value.billingPeriod || null,
				deletedAt: optionalDate(value.deletedAt),
				hardDeleteAfter: optionalDate(value.hardDeleteAfter),
				updatedAt: new Date()
			})
			.where(eq(users.id, value.id))
			.returning({ id: users.id });
		if (!updated) return json({ message: 'Пользователь не найден' }, { status: 404 });
		return json({ ok: true });
	} catch (error) {
		if (typeof error === 'object' && error && 'code' in error && error.code === '23505')
			return json({ message: 'Email или публичный ID уже используется' }, { status: 409 });
		throw error;
	}
}
