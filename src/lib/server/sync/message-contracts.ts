import { z } from 'zod';
import { syncBlockSchema, syncImageSchema } from './contracts';
export const putMessageSchema = z
	.strictObject({
		id: z.uuid(),
		blocks: z.array(syncBlockSchema).min(1).max(10000),
		images: z.array(syncImageSchema).max(1000)
	})
	.superRefine((v, c) => {
		const ids = new Set(v.images.map((i) => i.id));
		v.blocks.forEach((b, n) => {
			if (b.position !== n)
				c.addIssue({
					code: 'custom',
					message: 'Positions must be contiguous',
					path: ['blocks', n]
				});
			if (b.type === 'image' && !ids.has(b.imageId))
				c.addIssue({ code: 'custom', message: 'Missing image metadata', path: ['blocks', n] });
		});
	});
export type PutMessageInput = z.infer<typeof putMessageSchema>;
