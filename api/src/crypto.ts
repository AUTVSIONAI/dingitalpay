import { createHash, randomBytes, createCipheriv, createDecipheriv } from "node:crypto";

function sha256(data: string | Buffer): Buffer {
  return createHash("sha256").update(data).digest();
}

export function deriveKey(masterKey: string): Buffer {
  return sha256(masterKey);
}

export function encryptJson(masterKey: string, value: unknown): { ciphertext: string; iv: string; tag: string } {
  const key = deriveKey(masterKey);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(value), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64")
  };
}

export function decryptJson(masterKey: string, payload: { ciphertext: string; iv: string; tag: string } | null): any {
  if (!payload) return null;
  const key = deriveKey(masterKey);
  const iv = Buffer.from(payload.iv, "base64");
  const tag = Buffer.from(payload.tag, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const ciphertext = Buffer.from(payload.ciphertext, "base64");
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  return JSON.parse(plaintext);
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

