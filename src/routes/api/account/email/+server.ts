import { json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { requireAuthenticatedUser } from '$lib/server/friends/http';

const requestSchema = z.object({ email: z.email() });

export async function PUT(event) {
	const user = requireAuthenticatedUser(event);
	const parsed = requestSchema.safeParse(await event.request.json().catch(() => null));
	if (!parsed.success) return json({ message: 'Введите корректный email.' }, { status: 400 });

	const email = parsed.data.email.trim().toLowerCase();
	try {
		await db
			.update(users)
			.set({ email, emailVerified: false, updatedAt: new Date() })
			.where(eq(users.id, user.id));
	} catch (error) {
		if (typeof error === 'object' && error && 'code' in error && error.code === '23505')
			return json({ message: 'Этот email уже используется.' }, { status: 409 });
		throw error;
	}

	return json({ email, emailVerified: false });
}
