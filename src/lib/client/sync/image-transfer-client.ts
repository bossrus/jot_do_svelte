export type TransferImage = {
	id: string;
	blob: Blob;
	mimeType: string;
	sizeBytes: number;
};

export class ImageTransferError extends Error {
	constructor(
		public readonly code: string,
		public readonly status?: number
	) {
		super(code);
	}
}

type ImageTransferClientOptions = { fetch?: typeof globalThis.fetch };

async function errorFrom(response: Response, fallback: string) {
	let code = fallback;
	try {
		const body = (await response.json()) as { code?: unknown };
		if (typeof body.code === 'string') code = body.code;
	} catch {
		// The status and fallback code are sufficient diagnostics for a non-JSON response.
	}
	return new ImageTransferError(code, response.status);
}

export function createImageTransferClient(options: ImageTransferClientOptions = {}) {
	const fetchRequest = options.fetch ?? globalThis.fetch.bind(globalThis);

	async function appJson(url: string, init: RequestInit, fallback: string) {
		let response: Response;
		try {
			response = await fetchRequest(url, init);
		} catch {
			throw new ImageTransferError('NETWORK_ERROR');
		}
		if (!response.ok) throw await errorFrom(response, fallback);
		try {
			return (await response.json()) as Record<string, unknown>;
		} catch {
			throw new ImageTransferError('INVALID_RESPONSE', response.status);
		}
	}

	async function confirm(image: TransferImage & { storageKey: string }): Promise<string> {
		const confirmed = await appJson(
			'/api/sync/images/confirm-upload',
			{
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					imageId: image.id,
					storageKey: image.storageKey,
					mimeType: image.mimeType,
					sizeBytes: image.sizeBytes
				})
			},
			'CONFIRM_UPLOAD_FAILED'
		);
		if (confirmed.storageKey !== image.storageKey)
			throw new ImageTransferError('UPLOAD_METADATA_MISMATCH');
		return image.storageKey;
	}

	return {
		confirm,
		async upload(image: TransferImage): Promise<string> {
			const prepared = await appJson(
				'/api/sync/images/prepare-upload',
				{
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						imageId: image.id,
						mimeType: image.mimeType,
						sizeBytes: image.sizeBytes
					})
				},
				'PREPARE_UPLOAD_FAILED'
			);
			const storageKey = prepared.storageKey;
			const uploadUrl = prepared.uploadUrl;
			const requiredHeaders = prepared.requiredHeaders;
			if (
				typeof storageKey !== 'string' ||
				typeof uploadUrl !== 'string' ||
				!requiredHeaders ||
				typeof requiredHeaders !== 'object' ||
				(requiredHeaders as Record<string, unknown>)['Content-Type'] !== image.mimeType
			)
				throw new ImageTransferError('INVALID_RESPONSE');
			let upload: Response | undefined;
			try {
				upload = await fetchRequest(uploadUrl, {
					method: 'PUT',
					headers: requiredHeaders as Record<string, string>,
					body: image.blob
				});
			} catch {
				// R2 buckets without browser CORS support use the authenticated same-origin fallback.
			}
			if (!upload?.ok) {
				let fallback: Response;
				try {
					fallback = await fetchRequest(
						`/api/sync/images/upload?imageId=${encodeURIComponent(image.id)}&sizeBytes=${image.sizeBytes}`,
						{
							method: 'POST',
							headers: { 'content-type': image.mimeType },
							body: image.blob
						}
					);
				} catch {
					throw new ImageTransferError('R2_UPLOAD_FAILED');
				}
				if (!fallback.ok) throw await errorFrom(fallback, 'R2_UPLOAD_FAILED');
				let fallbackBody: { storageKey?: unknown };
				try {
					fallbackBody = (await fallback.json()) as { storageKey?: unknown };
				} catch {
					throw new ImageTransferError('INVALID_RESPONSE', fallback.status);
				}
				if (fallbackBody.storageKey !== storageKey)
					throw new ImageTransferError('UPLOAD_METADATA_MISMATCH');
			}
			return confirm({ ...image, storageKey });
		},

		async download(image: { id: string; mimeType: string; sizeBytes: number }): Promise<Blob> {
			const prepared = await appJson(
				`/api/sync/images/${encodeURIComponent(image.id)}/download`,
				{ method: 'GET' },
				'DOWNLOAD_PREPARE_FAILED'
			);
			if (typeof prepared.downloadUrl !== 'string')
				throw new ImageTransferError('INVALID_RESPONSE');
			let response: Response | undefined;
			try {
				response = await fetchRequest(prepared.downloadUrl, { method: 'GET' });
			} catch {
				// R2 buckets without browser CORS support use the authenticated same-origin fallback.
			}
			if (!response?.ok) {
				try {
					response = await fetchRequest(
						`/api/sync/images/${encodeURIComponent(image.id)}/download?proxy=1`,
						{ method: 'GET' }
					);
				} catch {
					throw new ImageTransferError('R2_DOWNLOAD_FAILED');
				}
			}
			if (!response.ok) throw new ImageTransferError('R2_DOWNLOAD_FAILED', response.status);
			const blob = await response.blob();
			if (blob.size !== image.sizeBytes) throw new ImageTransferError('IMAGE_SIZE_MISMATCH');
			if (blob.type !== image.mimeType) throw new ImageTransferError('IMAGE_MIME_MISMATCH');
			return blob;
		}
	};
}

export type ImageTransferClient = ReturnType<typeof createImageTransferClient>;
