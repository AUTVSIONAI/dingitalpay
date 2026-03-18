import type { Env } from "./env.js";
import { decryptJson, encryptJson } from "./crypto.js";
import type { Db } from "./db.js";

export type EncryptedPayload = { ciphertext: string; iv: string; tag: string };

export function decryptSmtpPassword(env: Env, row: any): string {
  const ciphertext = String(row?.password_ciphertext || "").trim();
  const iv = String(row?.password_iv || "").trim();
  const tag = String(row?.password_tag || "").trim();
  if (ciphertext && iv && tag) {
    try {
      const value = decryptJson(env.MASTER_KEY, { ciphertext, iv, tag } as EncryptedPayload);
      if (typeof value === "string") return value;
      if (value && typeof value === "object" && typeof (value as any).password === "string") return String((value as any).password);
    } catch {
      // fall back to plaintext below
    }
  }
  return String(row?.password || "").trim();
}

export function encryptSmtpPassword(env: Env, password: string): EncryptedPayload {
  // Store as a plain JSON string for simplicity.
  return encryptJson(env.MASTER_KEY, String(password || ""));
}

export async function ensureSmtpPasswordEncrypted(db: Db, env: Env, row: any): Promise<void> {
  const hasCipher =
    String(row?.password_ciphertext || "").trim() &&
    String(row?.password_iv || "").trim() &&
    String(row?.password_tag || "").trim();
  const plaintext = String(row?.password || "").trim();
  const id = String(row?.id || "").trim();
  if (hasCipher) return;
  if (!plaintext) return;
  if (!id) return;
  const enc = encryptSmtpPassword(env, plaintext);
  await db.query(
    "update public.smtp_config set password = '', password_ciphertext = $2, password_iv = $3, password_tag = $4, updated_at = now() where id = $1",
    [id, enc.ciphertext, enc.iv, enc.tag]
  ).catch(() => {});
}
