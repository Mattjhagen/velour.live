import crypto from "crypto";

function parseKey(hex: string): Buffer {
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error("Encryption key must be a 64-char hex string (32 bytes)");
  }
  return Buffer.from(hex, "hex");
}

function currentKey(): Buffer {
  const hex = process.env.VELOUR_ENCRYPTION_KEY;
  if (!hex) throw new Error("VELOUR_ENCRYPTION_KEY is not set");
  return parseKey(hex);
}

export function encrypt(plaintext: string): string {
  return encryptWithKey(plaintext, currentKey());
}

export function decrypt(ciphertext: string): string {
  return decryptWithKey(ciphertext, currentKey());
}

export function encryptWithKey(plaintext: string, key: Buffer): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptWithKey(ciphertext: string, key: Buffer): string {
  const buf = Buffer.from(ciphertext, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(data).toString("utf8") + decipher.final("utf8");
}

export function validateKeyHex(hex: string): { valid: boolean; error?: string } {
  if (!hex?.trim()) return { valid: false, error: "Key is required" };
  if (!/^[0-9a-fA-F]{64}$/.test(hex.trim())) {
    return { valid: false, error: "Key must be exactly 64 hex characters (generate with: openssl rand -hex 32)" };
  }
  if (hex.trim().toLowerCase() === process.env.VELOUR_ENCRYPTION_KEY?.toLowerCase()) {
    return { valid: false, error: "New key is the same as the current key — nothing to rotate" };
  }
  return { valid: true };
}
