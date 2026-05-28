import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/**
 * Get the encryption key from environment variable
 * @returns Buffer containing the encryption key
 * @throws Error if TOKEN_SECRET is not set or invalid
 */
function getEncryptionKey(): Buffer {
  const secret = process.env.TOKEN_SECRET;

  if (!secret) {
    throw new Error('TOKEN_SECRET environment variable is not set');
  }

  // Convert hex string to buffer (expecting 64 hex chars = 32 bytes = 256 bits)
  if (secret.length !== 64) {
    throw new Error('TOKEN_SECRET must be 64 hexadecimal characters (32 bytes)');
  }

  return Buffer.from(secret, 'hex');
}

/**
 * Encrypt a token using AES-256-GCM
 * @param plaintext The token to encrypt
 * @returns Encrypted token in format: iv:authTag:encryptedData (all hex encoded)
 */
export function encryptToken(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  // Format: iv:authTag:encryptedData (all hex encoded)
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt a token using AES-256-GCM
 * @param ciphertext Encrypted token in format: iv:authTag:encryptedData (all hex encoded)
 * @returns Decrypted token
 * @throws Error if decryption fails (wrong key, tampered data, etc.)
 */
export function decryptToken(ciphertext: string): string {
  const key = getEncryptionKey();

  // Split the encrypted data
  const parts = ciphertext.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted token format');
  }

  const [ivHex, authTagHex, encryptedHex] = parts;

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, undefined, 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
