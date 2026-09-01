export type MarkupTransform = {
	x: number;
	y: number;
	scale: number;
	rotation: number;
};

export type MarkupBounds = { width: number; height: number };
export type MarkupPoint = { x: number; y: number };

export type PathMarkup = {
	id: string;
	type: 'path';
	transform: MarkupTransform;
	points: MarkupPoint[];
	bounds: MarkupBounds;
	color: string;
	width: number;
};

export type TextMarkup = {
	id: string;
	type: 'text';
	transform: MarkupTransform;
	text: string;
	bounds: MarkupBounds;
	color: string;
};

export type ImageMarkupObject = PathMarkup | TextMarkup;

export type StoredImageMarkup = {
	imageId: string;
	objects: ImageMarkupObject[];
	version: 1;
	updatedAt: number;
};
