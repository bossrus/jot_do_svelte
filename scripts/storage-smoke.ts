import 'dotenv/config';
import { createStorageKey } from '../src/lib/server/storage/keys.js';
import { createR2ObjectStorage } from '../src/lib/server/storage/r2.js';

const content = 'Quick Todo R2 smoke test';
const contentType = 'text/plain';
const directKey = createStorageKey('smoke-tests', 'txt');
const presignedPutKey = createStorageKey('smoke-tests', 'txt');
const storage = createR2ObjectStorage();
const uploadedKeys = new Set<string>();

async function cleanup(): Promise<void> {
	for (const key of uploadedKeys) {
		try {
			await storage.delete(key);
			uploadedKeys.delete(key);
		} catch {
			console.error(`Cleanup failed for test object: ${key}`);
		}
	}
}

try {
	await storage.put(directKey, new TextEncoder().encode(content), contentType);
	uploadedKeys.add(directKey);
	console.log('Upload: OK');

	if (!(await storage.exists(directKey))) throw new Error('Uploaded object does not exist');
	console.log('Head/exists: OK');

	const metadata = await storage.getMetadata(directKey);
	if (!metadata || metadata.contentType !== contentType || metadata.size !== content.length) {
		throw new Error('Uploaded object metadata does not match');
	}
	console.log('Metadata: OK');

	const getUrl = await storage.createPresignedGetUrl(directKey);
	const getResponse = await fetch(getUrl);
	if (!getResponse.ok || (await getResponse.text()) !== content) {
		throw new Error(`Presigned GET failed with status ${getResponse.status}`);
	}
	console.log('Presigned GET: OK');

	const putUrl = await storage.createPresignedPutUrl(presignedPutKey, contentType);
	const putResponse = await fetch(putUrl, {
		method: 'PUT',
		headers: { 'content-type': contentType },
		body: content
	});
	if (!putResponse.ok) throw new Error(`Presigned PUT failed with status ${putResponse.status}`);
	uploadedKeys.add(presignedPutKey);
	if (!(await storage.exists(presignedPutKey)))
		throw new Error('Presigned PUT object does not exist');
	console.log('Presigned PUT: OK');

	await storage.delete(directKey);
	uploadedKeys.delete(directKey);
	if (await storage.exists(directKey)) throw new Error('Deleted object still exists');
	console.log('Delete/confirm missing: OK');

	await storage.delete(presignedPutKey);
	uploadedKeys.delete(presignedPutKey);
	if (await storage.exists(presignedPutKey))
		throw new Error('Deleted presigned PUT object still exists');
	console.log('Cleanup verification: OK');
} finally {
	await cleanup();
}
