import type { FastifyRequest } from "fastify";
import type { Db } from "./db.js";
import type { Env } from "./env.js";
import { hashToken } from "./crypto.js";

function getClientIp(req: FastifyRequest): string {
  const headers: any = (req as any).headers || {};
  // Prefer server-set headers (Nginx overwrites these). Do not trust arbitrary XFF from the client.
  const realIp = String(headers["x-real-ip"] || "").trim();
  if (realIp) return realIp;
  return String((req as any).ip || "").trim();
}

export async function logSecurityEvent(
  db: Db,
  env: Env,
  req: FastifyRequest,
  ev: {
    eventType: string;
    code?: string | null;
    route: string;
    meta?: Record<string, any>;
  }
) {
  const ip = getClientIp(req);
  const ipHash = hashToken(`${ip}|${env.MASTER_KEY}`);
  const userId = (req as any).auth?.user?.id ?? null;
  const role = (req as any).auth?.role ?? null;
  const route = String(ev.route || "");
  const eventType = String(ev.eventType || "");
  const code = ev.code ? String(ev.code) : null;
  const meta = ev.meta ? JSON.stringify(ev.meta) : JSON.stringify({});

  await db.query(
    "insert into public.security_events(ip_hash, user_id, role, route, event_type, code, meta) values ($1,$2,$3,$4,$5,$6,$7::jsonb)",
    [ipHash, userId, role, route, eventType, code, meta]
  );
}
