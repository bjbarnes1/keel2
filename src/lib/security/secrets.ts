import { createDecipheriv, createCipheriv, hkdfSync, randomBytes } from "node:crypto";

// Fix #19: HKDF replaces bare SHA-256 so short passphrases get proper key stretching.
function getKeyBytes(): Buffer | null {
  const raw = (process.env.BANK_ENCRYPTION_KEY ?? "").trim();
  if (!raw) return null;
  return Buffer.from(
    hkdfSync("sha256", Buffer.from(raw, "utf8"), "keel-bank-enc", "", 32),
  );
}

export function encryptBankSecret(plaintext: string) {
  const key = getKeyBytes();
  if (!key) {
    throw new Error("BANK_ENCRYPTION_KEY is required to store bank account numbers.");
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    enc: Buffer.concat([ciphertext, tag]).toString("base64"),
    iv: iv.toString("base64"),
  };
}

export function decryptBankSecret(encBase64: string, ivBase64: string) {
  const key = getKeyBytes();
  if (!key) {
    throw new Error("BANK_ENCRYPTION_KEY is required to decrypt bank account numbers.");
  }

  const raw = Buffer.from(encBase64, "base64");
  const iv = Buffer.from(ivBase64, "base64");
  if (raw.length < 16) {
    throw new Error("Encrypted payload is invalid.");
  }

  const ciphertext = raw.subarray(0, raw.length - 16);
  const tag = raw.subarray(raw.length - 16);

  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

export function maskBankAccount(lastFour: string | null | undefined) {
  if (!lastFour) return "";
  const safe = lastFour.replace(/\D/g, "").slice(-4);
  return safe ? `•••• ${safe}` : "";
}
