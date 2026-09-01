export class SyncError extends Error {
	constructor(
		public readonly code: 'NOT_FOUND' | 'REVISION_CONFLICT' | 'INVALID_STORAGE_KEY',
		public readonly serverRevision?: number
	) {
		super(code);
	}
}
