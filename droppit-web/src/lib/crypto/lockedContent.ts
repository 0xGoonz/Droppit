import crypto from 'crypto';

/**
 * Interface representing the encrypted structure stored in the database.
 */
export interface EncryptedLockedContent {
    encrypted: true;
    version: 'v1';
    ciphertext: string;
    iv: string;
    authTag: string;
}

const ALGORITHM = 'aes-256-gcm';

/**
 * Retrieves the encryption key from environment variables.
 * It must be a 64-character (32-byte) hex string.
 */
function getEncryptionKey(): Buffer {
    const keyString = process.env.LOCKED_CONTENT_ENCRYPTION_KEY;
    if (!keyString) {
        throw new Error('LOCKED_CONTENT_ENCRYPTION_KEY environment variable is missing.');
    }

    const key = Buffer.from(keyString, 'hex');
    if (key.length !== 32) {
        throw new Error('LOCKED_CONTENT_ENCRYPTION_KEY must be a 32-byte (64-character) hex string.');
    }

    return key;
}

/**
 * Encrypts a plaintext string into a structured EncryptedLockedContent JSON-ready object.
 */
export function encryptLockedContent(plaintext: string): EncryptedLockedContent {
    const key = getEncryptionKey();

    // Generate a random 12-byte initialization vector (IV) recommended for GCM
    const iv = crypto.randomBytes(12);

    // Create the cipher
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    // Encrypt the plaintext (UTF-8) -> (Hex)
    let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
    ciphertext += cipher.final('hex');

    // Get the auth tag (16-bytes) for authentication in GCM -> (Hex)
    const authTag = cipher.getAuthTag().toString('hex');

    return {
        encrypted: true,
        version: 'v1',
        ciphertext,
        iv: iv.toString('hex'),
        authTag
    };
}

/**
 * Decrypts an EncryptedLockedContent object back into a plaintext string.
 */
export function decryptLockedContent(encryptedData: EncryptedLockedContent): string {
    if (!encryptedData.encrypted || encryptedData.version !== 'v1') {
        throw new Error('Invalid or unsupported encrypted content format.');
    }

    const key = getEncryptionKey();
    const iv = Buffer.from(encryptedData.iv, 'hex');
    const authTag = Buffer.from(encryptedData.authTag, 'hex');

    // Create the decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    // Decrypt the ciphertext (Hex) -> (UTF-8)
    let plaintext = decipher.update(encryptedData.ciphertext, 'hex', 'utf8');
    plaintext += decipher.final('utf8');

    return plaintext;
}
