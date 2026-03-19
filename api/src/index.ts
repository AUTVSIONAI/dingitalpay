import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { ZodError } from "zod";
import { loadEnv } from "./env.js";
import { createPool } from "./db.js";
import { registerAuth } from "./auth.js";
import { registerDbRoutes } from "./dbRoutes.js";
import { registerStorageRoutes } from "./storageRoutes.js";
import { registerFunctions } from "./functions.js";
import { registerPublicRoutes } from "./publicRoutes.js";
import { registerLegalRoutes } from "./legalRoutes.js";
import { registerUpdatesRoutes } from "./updatesRoutes.js";
import { registerAdminOnboardingRoutes } from "./adminOnboardingRoutes.js";
import { registerPlatformAuthSettingsRoutes } from "./platformAuthSettingsRoutes.js";
import { registerMemberRoutes } from "./memberRoutes.js";
import { registerSellerDashboardRoutes } from "./sellerDashboardRoutes.js";
import { registerSellerSalesRoutes } from "./sellerSalesRoutes.js";
import { registerSellerProductRoutes } from "./sellerProductRoutes.js";
import { registerSellerIntegrationRoutes } from "./sellerIntegrationRoutes.js";
import { registerAdminDashboardRoutes } from "./adminDashboardRoutes.js";
import { registerAdminReportsRoutes } from "./adminReportsRoutes.js";
import { registerAdminOperationsRoutes } from "./adminOperationsRoutes.js";
import { registerFinanceWithdrawalRoutes } from "./financeWithdrawalRoutes.js";
import { registerAffiliateRoutes } from "./affiliateRoutes.js";
import { createFixedWindowRateLimiter } from "./rateLimit.js";
import { logSecurityEvent } from "./securityAudit.js";
import { ensureSmtpPasswordEncrypted } from "./smtpCrypto.js";

const env = loadEnv();
const isProd = String(env.NODE_ENV || "production").toLowerCase() === "production";

function parseAllowedOrigins(raw: string | undefined, fallbackOrigin: string): Set<string> {
  const baseOrigin = new URL(fallbackOrigin).origin;
  const list = String(raw || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const out = new Set<string>(list.length ? list : [baseOrigin]);
  // Convenience: allow www. variant for host-based deployments.
  for (const o of Array.from(out)) {
    try {
      const u = new URL(o);
      if (u.hostname && !u.hostname.startsWith("www.")) {
        out.add(`${u.protocol}//www.${u.hostname}`);
      }
    } catch {
      // ignore
    }
  }
  return out;
}

const allowedOrigins = parseAllowedOrigins(env.CORS_ALLOWED_ORIGINS, env.PUBLIC_BASE_URL);
const db = createPool({
  connectionString: env.DATABASE_URL,
  host: env.PGHOST,
  port: env.PGPORT,
  user: env.PGUSER,
  password: env.PGPASSWORD,
  database: env.PGDATABASE
});

// One-time hardening bootstrap (safe, non-breaking). Keep it tiny to avoid delaying startup.
try {
  const smtpRes = await db.query<any>("select * from public.smtp_config limit 1");
  if (smtpRes.rows[0]) await ensureSmtpPasswordEncrypted(db, env, smtpRes.rows[0]);
} catch {
  // ignore (migration may not be applied yet)
}

const app = Fastify({
  logger: true,
  trustProxy: true,
  maxParamLength: 1024
});

app.setErrorHandler((err, _req, reply) => {
  // If a handler already sent a response (e.g. requireAuth), keep it.
  if ((reply as any).sent) return;

  if (err instanceof ZodError) {
    return reply.code(422).send({
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid request",
        issues: err.issues,
      },
    });
  }

  // Fallback: avoid leaking internals. Fastify will log the full error.
  const statusCode = typeof (err as any)?.statusCode === "number" ? (err as any).statusCode : 500;
  const safeMessage = statusCode >= 500 ? "Internal Server Error" : String((err as any)?.message || "Request failed");
  return reply.code(statusCode).send({
    error: {
      code: "INTERNAL_ERROR",
      message: safeMessage,
    },
  });
});

await app.register(cors, {
  origin: (origin, cb) => {
    // Allow non-browser and same-origin calls (no Origin header)
    if (!origin) return cb(null, true);

    // In dev, keep it permissive
    if (!isProd) return cb(null, true);

    return cb(null, allowedOrigins.has(origin));
  },
  credentials: true
});

await app.register(cookie);
await app.register(multipart, {
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

// All routes live under /api (so we can reverse-proxy from the main domain)
await app.register(async (api) => {
  const minuteLimiter = createFixedWindowRateLimiter({ windowMs: 60_000 });
  const hourLimiter = createFixedWindowRateLimiter({ windowMs: 60 * 60_000 });

  api.addHook("onRequest", async (req, reply) => {
    if (!isProd) return;
    const path = String(req.raw.url || req.url || "").split("?")[0] || "";
    const ip = String(req.ip || "unknown");

    // Route-specific hardening (more strict than the generic buckets below)
    const signupPerMin = Number(env.RATE_LIMIT_SIGNUP_PER_MINUTE || 0);
    const signupPerHour = Number(env.RATE_LIMIT_SIGNUP_PER_HOUR || 0);
    const resetPerMin = Number(env.RATE_LIMIT_RESET_PASSWORD_PER_MINUTE || 0);
    const resetPerHour = Number(env.RATE_LIMIT_RESET_PASSWORD_PER_HOUR || 0);
    const checkEmailPerMin = Number(env.RATE_LIMIT_CHECK_EMAIL_PER_MINUTE || 0);

    const hitWindow = (window: "minute" | "hour", key: string, limit: number) => {
      if (!limit) return { ok: true as const };
      const limiter = window === "hour" ? hourLimiter : minuteLimiter;
      const hit = limiter.hit(key, limit);
      return hit.ok ? { ok: true as const } : { ok: false as const, resetAt: hit.resetAt, remaining: hit.remaining };
    };

    const blockRateLimited = (eventType: string, meta: Record<string, any>) => {
      logSecurityEvent(db, env, req, {
        route: path,
        eventType,
        code: "RATE_LIMITED",
        meta,
      }).catch(() => {});
      return reply.code(429).send({ error: { code: "RATE_LIMITED", message: "Too Many Requests" } });
    };

    if (path === "/api/auth/sign-up" && (signupPerMin || signupPerHour)) {
      const m = hitWindow("minute", `signup:m:${ip}`, signupPerMin);
      if (!m.ok) return blockRateLimited("signup_rate_limited", { window: "minute", limit: signupPerMin });
      const h = hitWindow("hour", `signup:h:${ip}`, signupPerHour);
      if (!h.ok) return blockRateLimited("signup_rate_limited", { window: "hour", limit: signupPerHour });
    }

    if (path === "/api/auth/reset-password-for-email" && (resetPerMin || resetPerHour)) {
      const m = hitWindow("minute", `resetpw:m:${ip}`, resetPerMin);
      if (!m.ok) return blockRateLimited("resetpw_rate_limited", { window: "minute", limit: resetPerMin });
      const h = hitWindow("hour", `resetpw:h:${ip}`, resetPerHour);
      if (!h.ok) return blockRateLimited("resetpw_rate_limited", { window: "hour", limit: resetPerHour });
    }

    if (path === "/api/functions/check-email-exists" && checkEmailPerMin) {
      const m = hitWindow("minute", `checkemail:m:${ip}`, checkEmailPerMin);
      if (!m.ok) return blockRateLimited("check_email_rate_limited", { window: "minute", limit: checkEmailPerMin });
    }

    const authLimit = Number(env.RATE_LIMIT_AUTH_PER_MINUTE || 0);
    const checkoutLimit = Number(env.RATE_LIMIT_CHECKOUT_PER_MINUTE || 0);
    const webhookLimit = Number(env.RATE_LIMIT_WEBHOOKS_PER_MINUTE || 0);
    const capiLimit = Number(env.RATE_LIMIT_CAPI_PER_MINUTE || 0);

    let bucketKey = "";
    let limit = 0;

    if (authLimit > 0 && (path.startsWith("/api/auth/") || path.startsWith("/api/functions/check-email-exists"))) {
      bucketKey = `auth:${ip}`;
      limit = authLimit;
    } else if (checkoutLimit > 0 && (path.startsWith("/api/functions/create-order") || path.startsWith("/api/functions/create-payment"))) {
      bucketKey = `checkout:${ip}`;
      limit = checkoutLimit;
    } else if (webhookLimit > 0 && (path.startsWith("/api/functions/mp-webhook") || path.startsWith("/api/functions/kipay-webhook"))) {
      bucketKey = `webhooks:${ip}`;
      limit = webhookLimit;
    } else if (capiLimit > 0 && path.startsWith("/api/functions/track-conversion")) {
      bucketKey = `capi:${ip}`;
      limit = capiLimit;
    }

    if (!bucketKey || !limit) return;
    const hit = minuteLimiter.hit(bucketKey, limit);
    if (!hit.ok) {
      const bucket = bucketKey.split(":")[0] || "unknown";
      logSecurityEvent(db, env, req, {
        route: path,
        eventType: "rate_limited",
        code: "RATE_LIMITED",
        // Do not store raw IPs in logs/DB. The request IP is already captured as `ip_hash`.
        meta: { bucket, limitPerMinute: limit },
      }).catch(() => {});
      return reply.code(429).send({ error: { code: "RATE_LIMITED", message: "Too Many Requests" } });
    }
  });

  api.get("/health", async () => ({ ok: true }));
  await registerAuth(api, db, env);

  // CSRF hardening for cookie-auth flows: block cross-site state changes.
  api.addHook("preHandler", async (req, reply) => {
    if (!isProd) return;
    if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return;
    if (!req.auth) return;
    if (req.auth.sessionId === "demo-open-access") return;

    const origin = String(req.headers.origin || "").trim();
    if (!origin) {
      logSecurityEvent(db, env, req, {
        route: String(req.raw.url || req.url || ""),
        eventType: "csrf_blocked",
        code: "CSRF_NO_ORIGIN",
      }).catch(() => {});
      return reply.code(403).send({ error: { code: "CSRF_BLOCKED", message: "Forbidden" } });
    }
    if (!allowedOrigins.has(origin)) {
      logSecurityEvent(db, env, req, {
        route: String(req.raw.url || req.url || ""),
        eventType: "csrf_blocked",
        code: "CSRF_BAD_ORIGIN",
        meta: { origin },
      }).catch(() => {});
      return reply.code(403).send({ error: { code: "CSRF_BLOCKED", message: "Forbidden" } });
    }
	  });

	  await registerPublicRoutes(api, db);
	  await registerLegalRoutes(api, db, env);
	  await registerPlatformAuthSettingsRoutes(api, db, env);
	  await registerUpdatesRoutes(api, db, env);
	  await registerAdminOnboardingRoutes(api, db, env);
  await registerMemberRoutes(api, db);
  await registerAdminDashboardRoutes(api, db);
  await registerAdminReportsRoutes(api, db);
  await registerAdminOperationsRoutes(api, db, env);
  await registerFinanceWithdrawalRoutes(api, db);
  await registerSellerDashboardRoutes(api, db);
  await registerSellerSalesRoutes(api, db);
  await registerSellerProductRoutes(api, db);
  await registerSellerIntegrationRoutes(api, db, env);
  await registerAffiliateRoutes(api, db, env);
	  await registerDbRoutes(api, db, env);
	  await registerStorageRoutes(api, db, env);
	  await registerFunctions(api, db, env);
	}, { prefix: "/api" });

app.addHook("onClose", async () => {
  await db.end();
});

await app.listen({ port: env.PORT, host: "0.0.0.0" });
