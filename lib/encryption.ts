import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

// AES-256-GCM needs a 32-byte key - derived from the env secret via scrypt rather than used
// directly, so the actual key is never simply "whatever string happened to be typed into the
// env var", and a short or low-entropy INTEGRATION_ENCRYPTION_KEY still produces a
// full-strength 256-bit key. The salt here is fixed and public (not a secret in itself) -
// its only job is to make this derivation specific to this one purpose, not to add secrecy
// beyond what the env var itself already provides.
const SCRYPT_SALT = "proptmate-integration-credentials-v1";

function getKey(): Buffer {
  const secret = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error(
      "INTEGRATION_ENCRYPTION_KEY is not set - required before any CRM integration credentials can be stored. Generate one with `openssl rand -base64 32` and add it to the environment."
    );
  }
  return scryptSync(secret, SCRYPT_SALT, 32);
}

// Encrypts a plaintext string (typically a JSON-stringified credentials object) into a
// single, self-contained string safe to store in a database column - the IV and auth tag
// are bundled alongside the ciphertext itself, since GCM decryption needs both and storing
// them separately would just be extra columns holding pieces of the same secret.
export function encrypt(plaintext: string): string {
  const iv = randomBytes(12); // 96-bit IV is GCM's own recommended size, not an arbitrary choice
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // iv : authTag : ciphertext, each base64, colon-joined - simple to split back apart, and
  // none of the three parts can themselves contain a colon since base64 doesn't use one.
  return `${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decrypt(stored: string): string {
  const parts = stored.split(":");
  if (parts.length !== 3) {
    throw new Error("Malformed encrypted value - expected iv:authTag:ciphertext");
  }
  const [ivB64, authTagB64, ciphertextB64] = parts;
  const decipher = createDecipheriv("aes-256-gcm", getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(ciphertextB64, "base64")), decipher.final()]);
  return decrypted.toString("utf8");
}
