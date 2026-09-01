const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export function generatePublicId(
	randomBytes: (size: number) => Uint8Array = (size) => crypto.getRandomValues(new Uint8Array(size))
) {
	const bytes = randomBytes(8);
	return `QT-${Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join('')}`;
}
