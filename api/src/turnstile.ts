import type { FastifyRequest } from "fastify";
import type { Env } from "./env.js";

function getClientIp(req: FastifyRequest): string | null {
  const headers: any = (req as any).headers || {};
  const realIp = String(headers["x-real-ip"] || "").trim();
  if (realIp) return realIp;
  const ip = String((req as any).ip || "").trim();
  return ip || null;
}

export async function verifyTurnstile(req: FastifyRequest, env: Env, token: string): Promise<{ ok: boolean; errorCodes: string[] }> {
  const secret = String(env.TURNSTILE_SECRET_KEY || "").trim();
  if (!secret) return { ok: true, errorCodes: [] };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3_500);
  try {
    const params = new URLSearchParams();
    params.set("secret", secret);
    params.set("response", token);
    const ip = getClientIp(req);
    if (ip) params.set("remoteip", ip);

    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: params,
      signal: controller.signal,
    });
    const json: any = await res.json().catch(() => ({}));
    const ok = Boolean(json?.success);
    const errorCodes = Array.isArray(json?.["error-codes"]) ? json["error-codes"].map(String) : [];
    return { ok, errorCodes };
  } catch {
    return { ok: false, errorCodes: ["request_failed"] };
  } finally {
    clearTimeout(timeout);
  }
}

