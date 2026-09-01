import { z } from 'zod';

const uuid = z.uuid();
const finiteNumber = z.number().finite();
const transform = z.strictObject({
	x: finiteNumber,
	y: finiteNumber,
	scale: finiteNumber.positive(),
	rotation: finiteNumber
});
const bounds = z.strictObject({
	width: finiteNumber.nonnegative(),
	height: finiteNumber.nonnegative()
});
const point = z.strictObject({ x: finiteNumber, y: finiteNumber });
const pathMarkup = z.strictObject({
	id: uuid,
	type: z.literal('path'),
	transform,
	points: z.array(point).max(10_000),
	bounds,
	color: z.string().min(1).max(64),
	width: finiteNumber.positive()
});
const textMarkup = z.strictObject({
	id: uuid,
	type: z.literal('text'),
	transform,
	text: z.string().max(20_000),
	bounds,
	color: z.string().min(1).max(64)
});
export const imageMarkupObjectSchema = z.discriminatedUnion('type', [pathMarkup, textMarkup]);
export const imageMarkupSchema = z.strictObject({
	version: z.literal(1),
	objects: z.array(imageMarkupObjectSchema).max(10_000)
});

export const textBlock = z.strictObject({
	id: uuid,
	type: z.literal('text'),
	position: z.int().nonnegative(),
	text: z.string().max(100_000)
});
export const imageBlock = z.strictObject({
	id: uuid,
	type: z.literal('image'),
	position: z.int().nonnegative(),
	imageId: uuid
});
export const syncBlockSchema = z.discriminatedUnion('type', [textBlock, imageBlock]);
export const syncImageSchema = z.strictObject({
	id: uuid,
	storageKey: z.string().min(1).max(1024),
	mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
	width: z.int().positive(),
	height: z.int().positive(),
	sizeBytes: z.int().positive().max(Number.MAX_SAFE_INTEGER),
	markup: imageMarkupSchema.nullable().default(null)
});
export const putTodoSchema = z
	.strictObject({
		id: uuid,
		baseRevision: z.int().nonnegative(),
		status: z.enum(['active', 'closed']),
		blocks: z.array(syncBlockSchema).min(1).max(10_000),
		images: z.array(syncImageSchema).max(1_000),
		localUpdatedAt: z.number().finite().optional()
	})
	.superRefine((value, context) => {
		if (new Set(value.blocks.map((block) => block.id)).size !== value.blocks.length)
			context.addIssue({ code: 'custom', message: 'Block IDs must be unique', path: ['blocks'] });
		if (
			new Set(value.blocks.map((block) => block.position)).size !== value.blocks.length ||
			value.blocks.some((block, index) => block.position !== index)
		)
			context.addIssue({
				code: 'custom',
				message: 'Block positions must be contiguous from zero',
				path: ['blocks']
			});
		const imageIds = new Set(value.images.map((image) => image.id));
		if (imageIds.size !== value.images.length)
			context.addIssue({ code: 'custom', message: 'Image IDs must be unique', path: ['images'] });
		for (const [index, block] of value.blocks.entries())
			if (block.type === 'image' && !imageIds.has(block.imageId))
				context.addIssue({
					code: 'custom',
					message: 'Image block references missing metadata',
					path: ['blocks', index, 'imageId']
				});
		const referenced = new Set(
			value.blocks.flatMap((block) => (block.type === 'image' ? [block.imageId] : []))
		);
		for (const [index, image] of value.images.entries())
			if (!referenced.has(image.id))
				context.addIssue({
					code: 'custom',
					message: 'Unreferenced image metadata',
					path: ['images', index, 'id']
				});
	});

export const deleteTodoSchema = z.strictObject({ baseRevision: z.int().positive() });
export type PutTodoInput = z.infer<typeof putTodoSchema>;
export type DeleteTodoInput = z.infer<typeof deleteTodoSchema>;
