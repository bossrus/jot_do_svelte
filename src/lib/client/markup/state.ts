import type { ImageMarkupObject } from './types';

export type MarkupState = { objects: ImageMarkupObject[]; history: ImageMarkupObject[][] };

export function cloneObjects(objects: ImageMarkupObject[]): ImageMarkupObject[] {
	return objects.map((object) => ({
		...object,
		transform: { ...object.transform },
		bounds: { ...object.bounds },
		...(object.type === 'path' ? { points: object.points.map((point) => ({ ...point })) } : {})
	})) as ImageMarkupObject[];
}

export function createMarkupState(objects: ImageMarkupObject[] = []): MarkupState {
	return { objects: cloneObjects(objects), history: [] };
}

export function commitObjects(state: MarkupState, objects: ImageMarkupObject[]): MarkupState {
	return {
		objects: cloneObjects(objects),
		history: [...state.history, cloneObjects(state.objects)]
	};
}

export function addObject(state: MarkupState, object: ImageMarkupObject): MarkupState {
	return commitObjects(state, [...state.objects, object]);
}

export function deleteObject(state: MarkupState, id: string): MarkupState {
	return commitObjects(
		state,
		state.objects.filter((object) => object.id !== id)
	);
}

export function undo(state: MarkupState): MarkupState {
	const previous = state.history.at(-1);
	if (!previous) return state;
	return { objects: cloneObjects(previous), history: state.history.slice(0, -1) };
}

export function serializeMarkup(objects: ImageMarkupObject[]): string {
	return JSON.stringify({ version: 1, objects });
}

export function deserializeMarkup(value: string): ImageMarkupObject[] {
	const parsed: unknown = JSON.parse(value);
	if (!parsed || typeof parsed !== 'object' || !('version' in parsed) || !('objects' in parsed))
		throw new Error('Invalid markup data');
	const record = parsed as { version: unknown; objects: unknown };
	if (record.version !== 1 || !Array.isArray(record.objects)) throw new Error('Unsupported markup');
	return cloneObjects(record.objects as ImageMarkupObject[]);
}
