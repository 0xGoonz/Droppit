import crypto from "crypto";

/**
 * AES-256-GCM encryption utilities for securing sensitive data at rest.
 * Used primarily for encrypting staged frame secrets (locked_content_draft)
 * before persisting to the database.
 *
 * Requires LOCKED_CONTENT_ENCRYPTION_KEY env var (64-char hex = 32 bytes).
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit IV recommended for GCM
const AUTH_TAG_LENGTH = 16;

function getKey(): Buffer {
    const hex = process.env.LOCKED_CONTENT_ENCRYPTION_KEY;
    if (!hex || hex.length !== 64) {
        throw new Error(
            "LOCKED_CONTENT_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)."
        );
    }
    return Buffer.from(hex, "hex");
}

/**
 * Encrypt plaintext → Base64 string containing IV + ciphertext + auth tag.
 * Output format: base64( IV[12] || ciphertext[n] || authTag[16] )
 */
export function encryptSecret(plaintext: string): string {
    const key = getKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
        authTagLength: AUTH_TAG_LENGTH,
    });

    const encrypted = Buffer.concat([
        cipher.update(plaintext, "utf8"),
        cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    // IV || ciphertext || authTag
    const combined = Buffer.concat([iv, encrypted, authTag]);
    return combined.toString("base64");
}

/**
 * Decrypt a Base64 string produced by encryptSecret() back to plaintext.
 */
export function decryptSecret(encryptedBase64: string): string {
    const key = getKey();
    const combined = Buffer.from(encryptedBase64, "base64");

    if (combined.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
        throw new Error("Encrypted payload is too short to be valid.");
    }

    const iv = combined.subarray(0, IV_LENGTH);
    const authTag = combined.subarray(combined.length - AUTH_TAG_LENGTH);
    const ciphertext = combined.subarray(
        IV_LENGTH,
        combined.length - AUTH_TAG_LENGTH
    );

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
        authTagLength: AUTH_TAG_LENGTH,
    });
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
    ]);
    return decrypted.toString("utf8");
}
