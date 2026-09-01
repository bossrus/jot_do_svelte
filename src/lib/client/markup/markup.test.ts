import { describe, expect, it } from 'vitest';
import {
	applyMove,
	applyRotation,
	applyScale,
	calculateRotation,
	calculateScale,
	denormalizePoint,
	getPathBounds,
	localizePathPoints,
	normalizePoint
} from './geometry';
import {
	addObject,
	cloneObjects,
	createMarkupState,
	deleteObject,
	deserializeMarkup,
	serializeMarkup,
	undo
} from './state';
import type { PathMarkup } from './types';

const path: PathMarkup = {
	id: 'path',
	type: 'path',
	transform: { x: 0.1, y: 0.2, scale: 1, rotation: 0 },
	points: [
		{ x: 0, y: 0 },
		{ x: 0.2, y: 0.1 }
	],
	bounds: { width: 0.2, height: 0.1 },
	color: '#000000',
	width: 0.01
};

describe('normalized markup geometry', () => {
	it('normalizes and denormalizes image points', () => {
		expect(normalizePoint({ x: 200, y: 100 }, 400, 200)).toEqual({ x: 0.5, y: 0.5 });
		expect(denormalizePoint({ x: 0.5, y: 0.25 }, 400, 200)).toEqual({ x: 200, y: 50 });
	});
	it('gets bounds and localizes finished path points', () => {
		const points = [
			{ x: 0.2, y: 0.4 },
			{ x: 0.5, y: 0.1 },
			{ x: 0.3, y: 0.2 }
		];
		expect(getPathBounds(points)).toEqual({
			x: 0.2,
			y: 0.1,
			width: 0.3,
			height: 0.30000000000000004
		});
		const localized = localizePathPoints(points);
		expect(localized.points[0]).toEqual({ x: 0, y: 0.30000000000000004 });
		expect(localized.bounds.x).toBe(0.2);
	});
	it('moves without changing local points', () => {
		const moved = applyMove(path, 0.2, -0.1) as PathMarkup;
		expect(moved.transform.x).toBeCloseTo(0.3);
		expect(moved.transform.y).toBeCloseTo(0.1);
		expect(moved.points).toEqual(path.points);
	});
	it('calculates and applies uniform scale with limits', () => {
		expect(calculateScale(2, 10, 15)).toBe(3);
		expect(applyScale(path, 3).transform.scale).toBe(3);
		expect(calculateScale(1, 10, 0)).toBe(0.15);
	});
	it('calculates and applies free rotation around the center', () => {
		const rotation = calculateRotation(10, { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 });
		expect(rotation).toBe(100);
		expect(applyRotation(path, rotation).transform.rotation).toBe(100);
	});
});

describe('markup state and undo', () => {
	it('clones reactive proxy objects without structuredClone DataCloneError', () => {
		const proxied = new Proxy([path], {});
		expect(cloneObjects(proxied)).toEqual([path]);
		expect(() =>
			addObject({ objects: proxied, history: [] }, { ...path, id: 'next' })
		).not.toThrow();
	});
	it('adds, deletes and undoes create/delete', () => {
		const added = addObject(createMarkupState(), path);
		expect(added.objects).toHaveLength(1);
		expect(undo(added).objects).toHaveLength(0);
		const deleted = deleteObject(added, path.id);
		expect(deleted.objects).toHaveLength(0);
		expect(undo(deleted).objects).toEqual([path]);
	});
	it.each([
		['move', applyMove(path, 0.1, 0.1)],
		['scale', applyScale(path, 2)],
		['rotation', applyRotation(path, 42)]
	])('undoes %s snapshots', (_name, changed) => {
		const initial = addObject(createMarkupState(), path);
		const state = { objects: [changed], history: [...initial.history, [path]] };
		expect(undo(state).objects[0].transform).toEqual(path.transform);
	});
	it('serializes and deserializes version 1 structured objects', () => {
		expect(deserializeMarkup(serializeMarkup([path]))).toEqual([path]);
	});
});
