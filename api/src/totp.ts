import { createHmac, randomBytes } from "node:crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const BASE32_LOOKUP: Record<string, number> = Object.fromEntries(
  BASE32_ALPHABET.split("").map((c, i) => [c, i])
);

function cleanBase32(input: string): string {
  return String(input || "")
    .toUpperCase()
    .replace(/[^A-Z2-7]/g, "");
}

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31]!;
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31]!;
  }
  return output;
}

export function base32Decode(input: string): Buffer {
  const s = cleanBase32(input);
  let bits = 0;
  let value = 0;
  const out: number[] = [];

  for (const ch of s) {
    const v = BASE32_LOOKUP[ch];
    if (v === undefined) continue;
    value = (value << 5) | v;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function generateTotpSecretBase32(bytes = 20): string {
  return base32Encode(randomBytes(bytes));
}

export function buildOtpAuthUri(args: { issuer: string; accountName: string; secretBase32: string; digits?: number; period?: number }): string {
  const issuer = String(args.issuer || "").trim() || "DingitalPay";
  const accountName = String(args.accountName || "").trim();
  const secretBase32 = cleanBase32(args.secretBase32);
  const digits = args.digits ?? 6;
  const period = args.period ?? 30;

  const label = encodeURIComponent(`${issuer}:${accountName || "user"}`);
  const issuerEnc = encodeURIComponent(issuer);
  return `otpauth://totp/${label}?secret=${secretBase32}&issuer=${issuerEnc}&algorithm=SHA1&digits=${digits}&period=${period}`;
}

export function totpAt(secretBase32: string, timestampMs: number, args?: { digits?: number; period?: number }): string {
  const digits = args?.digits ?? 6;
  const period = args?.period ?? 30;
  const secret = base32Decode(secretBase32);

  const counter = Math.floor(Math.floor(timestampMs / 1000) / period);
  const msg = Buffer.alloc(8);
  msg.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  msg.writeUInt32BE(counter & 0xffffffff, 4);

  const hmac = createHmac("sha1", secret).update(msg).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const code =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);

  const mod = 10 ** digits;
  const token = String(code % mod).padStart(digits, "0");
  return token;
}

export function verifyTotp(token: string, secretBase32: string, args?: { window?: number; digits?: number; period?: number; nowMs?: number }): boolean {
  const t = String(token || "").trim().replace(/\s+/g, "");
  if (!/^\d{6,8}$/.test(t)) return false;
  const window = Math.max(0, Math.min(10, args?.window ?? 1));
  const now = args?.nowMs ?? Date.now();
  const period = args?.period ?? 30;
  const digits = args?.digits ?? 6;

  for (let w = -window; w <= window; w++) {
    const candidate = totpAt(secretBase32, now + w * period * 1000, { period, digits });
    if (candidate === t) return true;
  }
  return false;
}
