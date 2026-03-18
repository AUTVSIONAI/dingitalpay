import { createHmac } from "node:crypto";
import { deriveKey } from "./crypto.js";

function toBase64Url(input: Buffer | string): string {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input, "utf8");
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(input: string): Buffer {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = normalized.length % 4 ? "=".repeat(4 - (normalized.length % 4)) : "";
  return Buffer.from(normalized + pad, "base64");
}

export type TrackingPayload =
  | { t: "open"; id: string; iat: number; exp: number }
  | { t: "click"; id: string; u: string; iat: number; exp: number };

export function signTrackingToken(masterKey: string, payload: TrackingPayload): string {
  const body = toBase64Url(JSON.stringify(payload));
  const mac = createHmac("sha256", deriveKey(masterKey)).update(body).digest();
  const sig = toBase64Url(mac);
  return `${body}.${sig}`;
}

export function verifyTrackingToken(masterKey: string, token: string): TrackingPayload | null {
  const raw = String(token || "").trim();
  const [body, sig] = raw.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", deriveKey(masterKey)).update(body).digest();
  const expectedSig = toBase64Url(expected);
  // timing-safe compare
  const a = Buffer.from(expectedSig, "utf8");
  const b = Buffer.from(sig, "utf8");
  if (a.length !== b.length) return null;
  let ok = 0;
  for (let i = 0; i < a.length; i++) ok |= a[i]! ^ b[i]!;
  if (ok !== 0) return null;

  let payload: any = null;
  try {
    payload = JSON.parse(fromBase64Url(body).toString("utf8"));
  } catch {
    return null;
  }
  if (!payload || (payload.t !== "open" && payload.t !== "click")) return null;
  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === "number" && payload.exp < now) return null;
  if (typeof payload.iat === "number" && payload.iat > now + 60) return null;
  return payload as TrackingPayload;
}

