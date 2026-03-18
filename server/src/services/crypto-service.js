/**
 * Credential encryption — AES-256-GCM
 *
 * Encrypts WooCommerce consumer keys/secrets at rest in SQLite.
 * Format: iv:authTag:ciphertext (all hex)
 */

const crypto = require("crypto");

const ALGO = "aes-256-gcm";
const KEY_ENV = "CREDENTIAL_KEY"; // 64-char hex string (32 bytes)

// Cache derived key to avoid repeated Buffer.from on every encrypt/decrypt call
let _cachedKey = null;
let _cachedKeyEnv = null;

function getKey() {
  const hex = process.env[KEY_ENV];
  if (!hex) return null;
  if (hex.length !== 64) {
    console.error(`[Crypto] ${KEY_ENV} must be 64 hex chars (32 bytes). Encryption disabled.`);
    return null;
  }
  // Return cached key if env hasn't changed
  if (_cachedKey && _cachedKeyEnv === hex) return _cachedKey;
  _cachedKey = Buffer.from(hex, "hex");
  _cachedKeyEnv = hex;
  return _cachedKey;
}

function encrypt(plaintext) {
  const key = getKey();
  if (!key || !plaintext) return plaintext;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

function decrypt(stored) {
  const key = getKey();
  if (!key || !stored) return stored;

  // Not encrypted (no colons = plaintext from before encryption was enabled)
  if (!stored.includes(":")) return stored;

  const parts = stored.split(":");
  if (parts.length !== 3) return stored; // not our format

  const [ivHex, authTagHex, ciphertextHex] = parts;
  try {
    const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
    const decrypted = Buffer.concat([decipher.update(Buffer.from(ciphertextHex, "hex")), decipher.final()]);
    return decrypted.toString("utf8");
  } catch (err) {
    // Decryption failed — might be plaintext from before encryption
    console.error("[Crypto] Decryption failed, returning raw value:", err.message);
    return stored;
  }
}

function isEnabled() {
  return !!getKey();
}

module.exports = { encrypt, decrypt, isEnabled };
