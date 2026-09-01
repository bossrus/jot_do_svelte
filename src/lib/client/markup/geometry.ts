import type { ImageMarkupObject, MarkupPoint } from './types';

export const MIN_SCALE = 0.15;
export const MAX_SCALE = 8;

export function normalizePoint(point: MarkupPoint, width: number, height: number): MarkupPoint {
	return { x: point.x / width, y: point.y / height };
}

export function denormalizePoint(point: MarkupPoint, width: number, height: number): MarkupPoint {
	return { x: point.x * width, y: point.y * height };
}

export function getPathBounds(points: MarkupPoint[]) {
	if (!points.length) return { x: 0, y: 0, width: 0, height: 0 };
	const xs = points.map((point) => point.x);
	const ys = points.map((point) => point.y);
	const x = Math.min(...xs);
	const y = Math.min(...ys);
	return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

export function localizePathPoints(points: MarkupPoint[]) {
	const bounds = getPathBounds(points);
	return {
		points: points.map((point) => ({ x: point.x - bounds.x, y: point.y - bounds.y })),
		bounds
	};
}

export function distance(a: MarkupPoint, b: MarkupPoint): number {
	return Math.hypot(b.x - a.x, b.y - a.y);
}

export function angle(center: MarkupPoint, point: MarkupPoint): number {
	return (Math.atan2(point.y - center.y, point.x - center.x) * 180) / Math.PI;
}

export function applyMove(object: ImageMarkupObject, dx: number, dy: number): ImageMarkupObject {
	return {
		...object,
		transform: { ...object.transform, x: object.transform.x + dx, y: object.transform.y + dy }
	};
}

export function calculateScale(startScale: number, startDistance: number, nextDistance: number) {
	if (startDistance <= 0) return startScale;
	return Math.min(MAX_SCALE, Math.max(MIN_SCALE, startScale * (nextDistance / startDistance)));
}

export function applyScale(object: ImageMarkupObject, scale: number): ImageMarkupObject {
	return { ...object, transform: { ...object.transform, scale } };
}

export function calculateRotation(
	startRotation: number,
	center: MarkupPoint,
	startPointer: MarkupPoint,
	currentPointer: MarkupPoint
) {
	return startRotation + angle(center, currentPointer) - angle(center, startPointer);
}

export function applyRotation(object: ImageMarkupObject, rotation: number): ImageMarkupObject {
	return { ...object, transform: { ...object.transform, rotation } };
}

export function objectCenter(object: ImageMarkupObject): MarkupPoint {
	return {
		x: object.transform.x + object.bounds.width / 2,
		y: object.transform.y + object.bounds.height / 2
	};
}

export function objectTransform(object: ImageMarkupObject): string {
	const center = objectCenter(object);
	return `translate(${center.x} ${center.y}) rotate(${object.transform.rotation}) scale(${object.transform.scale}) translate(${-center.x} ${-center.y})`;
}
