import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { messages, users } from '$lib/server/db/schema';

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function addSystemMessage(
	tx: Transaction,
	input: { todoId: string; actorId: string; text: (actorName: string) => string }
) {
	const [actor] = await tx
		.select({ displayName: users.displayName })
		.from(users)
		.where(eq(users.id, input.actorId))
		.limit(1);
	if (!actor) return;
	await tx.insert(messages).values({
		todoId: input.todoId,
		authorId: input.actorId,
		type: 'system',
		eventType: input.text(actor.displayName),
		eventData: {}
	});
}
