import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "./db.js";
import { requireAuth, requireAdmin } from "./auth.js";
import { enqueueTemplatedEmail } from "./emailQueue.js";
import { queueProfileUpdatedEmail, queueRewardSentEmail } from "./emailEventTriggers.js";
import { getJsonColumns, normalizeJsonColsInRecord, normalizeJsonColsInRows } from "./dbQueryJson.js";
import { mapDbErrorToHttp } from "./dbQueryErrors.js";
import type { Env } from "./env.js";
import { logSecurityEvent } from "./securityAudit.js";
import { encryptSmtpPassword } from "./smtpCrypto.js";
import {
  mergeSmtpGuardState,
  readSmtpGuardState,
  smtpGuardHasRequiredFields,
  smtpGuardReadyForEmailVerification,
} from "./smtpGuard.js";
import {
  assertOwnedBySellerViaCourseId,
  assertOwnedBySellerViaModuleId,
  assertOwnedBySellerViaProductsJoin,
  assertOwnedCourseLesson,
  assertOwnedCourseModule,
  getEqFilterValue,
} from "./dbOwnership.js";

const identifier = z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/);

const filterSchema = z.object({
  op: z.enum(["eq", "in", "lt", "lte", "gt", "gte", "neq", "is"]),
  column: identifier,
  value: z.any().optional()
});

const querySchema = z.object({
  table: identifier,
  action: z.enum(["select", "insert", "update", "delete", "upsert"]),
  select: z.string().optional(),
  returning: z.string().optional(),
  filters: z.array(filterSchema).optional(),
  order: z.object({ column: identifier, ascending: z.boolean().default(true) }).optional(),
  limit: z.number().int().positive().optional(),
  single: z.boolean().optional(),
  maybeSingle: z.boolean().optional(),
  count: z.enum(["exact"]).optional(),
  head: z.boolean().optional(),
  values: z.record(z.any()).optional(),
  rows: z.array(z.record(z.any())).optional(),
  onConflict: z.string().optional()
});

const TABLES = new Set([
  "profiles",
  "user_roles",
  "notifications",
  "products",
  "product_offers",
  "product_pixels",
  "product_domains",
  "product_checkout_config",
  "product_coupons",
  "product_upsell_config",
  "product_delivery_config",
  "orders",
  "order_items",
  "rewards",
  "reward_claims",
  "platform_settings",
  "platform_updates",
  "platform_fees",
  "platform_fee_logs",
  "smtp_config",
  "smtp_dns_records",
  "email_templates",
  "email_campaigns",
  "email_outbox",
  "email_logs",
  "payment_method_acquirers",
  "acquirer_configs",
  "webhook_endpoints",
  "webhook_logs",
  "zapier_integrations",
  "zapier_logs",
  "whatsapp_instances",
  "withdrawals",
  "withdrawal_status_history",
  "courses",
  "course_modules",
  "course_lessons",
  "course_progress",
  "security_events"
]);

type DbAction = z.infer<typeof querySchema>["action"];
type DbRole = "buyer" | "seller" | "admin";

const ROLE_ALLOWLIST: Record<Exclude<DbRole, "admin">, Record<string, ReadonlySet<DbAction>>> = {
  buyer: {
    profiles: new Set<DbAction>(["select", "insert", "update", "upsert"]),
    notifications: new Set<DbAction>(["select", "update"]),
    products: new Set<DbAction>(["select"]),
    product_offers: new Set<DbAction>(["select"]),
    platform_settings: new Set<DbAction>(["select"]),
    orders: new Set<DbAction>(["select"]),
    order_items: new Set<DbAction>(["select"])
  },
  seller: {
    profiles: new Set<DbAction>(["select", "insert", "update", "upsert"]),
    notifications: new Set<DbAction>(["select", "update"]),
    products: new Set<DbAction>(["select", "insert", "update", "delete", "upsert"]),
    product_offers: new Set<DbAction>(["select"]),
    product_pixels: new Set<DbAction>(["select"]),
    product_domains: new Set<DbAction>(["select"]),
    product_checkout_config: new Set<DbAction>(["select"]),
    product_coupons: new Set<DbAction>(["select"]),
    product_upsell_config: new Set<DbAction>(["select"]),
    product_delivery_config: new Set<DbAction>(["select"]),
    platform_settings: new Set<DbAction>(["select"]),
    rewards: new Set<DbAction>(["select"]),
    reward_claims: new Set<DbAction>(["select"]),
    platform_fee_logs: new Set<DbAction>(["select"]),
    orders: new Set<DbAction>(["select"]),
    order_items: new Set<DbAction>(["select"]),
    withdrawals: new Set<DbAction>(["select"]),
    withdrawal_status_history: new Set<DbAction>(["select"]),
    webhook_endpoints: new Set<DbAction>(["select"]),
    webhook_logs: new Set<DbAction>(["select"]),
    zapier_integrations: new Set<DbAction>(["select"]),
    zapier_logs: new Set<DbAction>(["select"]),
    whatsapp_instances: new Set<DbAction>(["select"]),
    courses: new Set<DbAction>(["select"]),
    course_modules: new Set<DbAction>(["select"]),
    course_lessons: new Set<DbAction>(["select"])
  }
};

function parseSelect(select?: string): { columnsSql: string; includeRewards?: boolean } {
  const raw = (select || "*").trim();
  if (raw === "*" || raw === "") return { columnsSql: "*" };

  // Special case: reward_claims join used by admin screen
  if (/rewards\s*\(/i.test(raw)) {
    return { columnsSql: "*", includeRewards: true };
  }

  const parts = raw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => p === "*" ? "*" : p);

  if (parts.includes("*")) return { columnsSql: "*" };

  // allow only identifiers
  const cols = parts.filter((p) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(p));
  return { columnsSql: cols.length ? cols.map((c) => `"${c}"`).join(", ") : "*" };
}

function buildWhere(filters: Array<z.infer<typeof filterSchema>> | undefined, params: any[]): string {
  if (!filters || filters.length === 0) return "";
  const clauses: string[] = [];
  for (const f of filters) {
    const col = `"${f.column}"`;
    switch (f.op) {
      case "eq":
        params.push(f.value);
        clauses.push(`${col} = $${params.length}`);
        break;
      case "neq":
        params.push(f.value);
        clauses.push(`${col} <> $${params.length}`);
        break;
      case "lt":
        params.push(f.value);
        clauses.push(`${col} < $${params.length}`);
        break;
      case "lte":
        params.push(f.value);
        clauses.push(`${col} <= $${params.length}`);
        break;
      case "gt":
        params.push(f.value);
        clauses.push(`${col} > $${params.length}`);
        break;
      case "gte":
        params.push(f.value);
        clauses.push(`${col} >= $${params.length}`);
        break;
      case "in":
        if (!Array.isArray(f.value)) throw new Error("in filter requires array");
        params.push(f.value);
        clauses.push(`${col} = ANY($${params.length})`);
        break;
      case "is":
        if (f.value === null) clauses.push(`${col} IS NULL`);
        else if (f.value === true) clauses.push(`${col} IS TRUE`);
        else if (f.value === false) clauses.push(`${col} IS FALSE`);
        else clauses.push(`${col} IS NOT NULL`);
        break;
    }
  }
  return clauses.length ? `where ${clauses.join(" and ")}` : "";
}

function error(code: string, message: string) {
  return { error: { code, message } };
}

function hasFilter(filters: Array<z.infer<typeof filterSchema>> | undefined, column: string, op: string): boolean {
  return !!filters?.some((f) => f.column === column && f.op === op);
}

function getFilterValues(filters: Array<z.infer<typeof filterSchema>> | undefined, column: string): any[] {
  const values: any[] = [];
  for (const f of filters || []) {
    if (f.column !== column) continue;
    if (f.op === "eq") values.push(f.value);
    if (f.op === "in" && Array.isArray(f.value)) values.push(...f.value);
  }
  return values.filter((v) => v !== undefined && v !== null);
}

type RateBucket = { resetAt: number; count: number };
const demoRateBuckets = new Map<string, RateBucket>();
const dbQueryRateBuckets = new Map<string, RateBucket>();

export async function registerDbRoutes(app: FastifyInstance, db: Db, env: Env) {
  async function denyStatefulOrderMutation(req: any, reply: any, table: "orders" | "order_items", action: DbAction) {
    await logSecurityEvent(db, env, req, {
      route: "/api/db/query",
      eventType: "db_forbidden_order_mutation",
      code: "DB_FORBIDDEN_ORDER_MUTATION",
      meta: { table, action },
    }).catch(() => {});
    return reply.code(403).send(error("DB_FORBIDDEN", "Forbidden"));
  }

  function applySmtpConfigWriteHardening(record: Record<string, any>): Record<string, any> {
    // Admin-only table. Store SMTP password encrypted-at-rest when provided.
    const password = String(record.password ?? "").trim();
    if (!("password" in record)) return record;
    if (!password) {
      // UI often sends empty string; treat it as "keep existing password".
      const { password: _drop, ...rest } = record;
      return rest;
    }
    const enc = encryptSmtpPassword(env, password);
    return {
      ...record,
      password: "",
      password_ciphertext: enc.ciphertext,
      password_iv: enc.iv,
      password_tag: enc.tag,
    };
  }

  async function isEmailVerificationRequired(): Promise<boolean> {
    const res = await db.query<{ email_verification: boolean }>(
      "select email_verification from public.platform_settings order by created_at asc limit 1"
    );
    return res.rows[0]?.email_verification ?? false;
  }

  async function assertSmtpConfigWriteAllowed(nextPatch: Record<string, any>, reply: any): Promise<boolean> {
    const emailVerificationRequired = await isEmailVerificationRequired().catch(() => true);
    if (!emailVerificationRequired) return true;

    const current = await readSmtpGuardState(db).catch(() => null);
    const next = mergeSmtpGuardState(
      current ?? {
        enabled: false,
        host: "",
        port: "",
        username: "",
        fromEmail: "",
        hasPassword: false,
        lastTest: null,
      },
      nextPatch
    );

    if (!next.enabled) {
      reply.code(400).send(
        error(
          "SMTP_REQUIRED_WHILE_EMAIL_VERIFICATION_ENABLED",
          "Nao e possivel desativar o SMTP enquanto a verificacao obrigatoria de e-mail estiver ativa."
        )
      );
      return false;
    }

    if (!smtpGuardHasRequiredFields(next)) {
      reply.code(400).send(
        error(
          "SMTP_INCOMPLETE_WHILE_EMAIL_VERIFICATION_ENABLED",
          "Nao e possivel salvar um SMTP incompleto enquanto a verificacao obrigatoria de e-mail estiver ativa."
        )
      );
      return false;
    }

    return true;
  }

  async function disableSmtpDependentFlagsIfUnavailable(nextPatch: Record<string, any>) {
    const current = await readSmtpGuardState(db).catch(() => null);
    const next = mergeSmtpGuardState(
      current ?? {
        enabled: false,
        host: "",
        port: "",
        username: "",
        fromEmail: "",
        hasPassword: false,
        lastTest: null,
      },
      nextPatch
    );

    if (!smtpGuardReadyForEmailVerification(next)) {
      await db.query("update public.profiles set email_notifications = false where coalesce(email_notifications, false) = true");
      await db.query("update public.email_templates set enabled = false where coalesce(enabled, false) = true");
    }
  }

  app.post("/db/query", async (req, reply) => {
    const q = querySchema.parse(req.body);
    if (!TABLES.has(q.table)) return reply.code(400).send(error("DB_TABLE_NOT_ALLOWED", "Tabela não permitida."));

    const isAuthed = !!req.auth;
    const role = req.auth?.role ?? null;
    const userId = req.auth?.user.id ?? null;
    const userEmail = req.auth?.user.email ?? null;

    // Security hardening: authenticated sessions must always resolve a role.
    // If a user has a session but no role row, deny /db/query to prevent accidental privilege leaks.
    if (isAuthed && !role) {
      logSecurityEvent(db, env, req, {
        route: "/api/db/query",
        eventType: "auth_role_missing",
        code: "AUTH_ROLE_MISSING",
      }).catch(() => {});
      return reply.code(403).send(error("AUTH_ROLE_MISSING", "Acesso negado: role ausente. Contate o suporte."));
    }

    // DEMO vitrine hardening: when using demo open access (no cookie), optionally require a server-side token for writes.
    // The token is intended to be injected by Nginx only for the demo domain.
    const isDemoOpenAccess = env.DEMO_OPEN_ACCESS && req.auth?.sessionId === "demo-open-access";
    if (isDemoOpenAccess) {
      const key = String(req.ip || "unknown");
      const now = Date.now();
      const windowMs = 60_000;
      const limit = Math.max(1, Number(env.DEMO_RATE_LIMIT_PER_MINUTE || 240));
      const b = demoRateBuckets.get(key);
      if (!b || now >= b.resetAt) {
        demoRateBuckets.set(key, { resetAt: now + windowMs, count: 1 });
      } else {
        b.count += 1;
        if (b.count > limit) {
          logSecurityEvent(db, env, req, {
            route: "/api/db/query",
            eventType: "rate_limited",
            code: "DEMO_RATE_LIMITED",
            meta: { limitPerMinute: limit },
          }).catch(() => {});
          return reply.code(429).send(error("RATE_LIMITED", "Too Many Requests"));
        }
      }

      // best-effort cleanup (avoid unbounded growth)
      if (demoRateBuckets.size > 5000) {
        for (const [k, v] of demoRateBuckets) {
          if (now >= v.resetAt) demoRateBuckets.delete(k);
        }
      }
    }

    // Optional per-IP rate limit for /db/query (recommended for production hardening).
    if (env.DB_QUERY_RATE_LIMIT_PER_MINUTE && env.DB_QUERY_RATE_LIMIT_PER_MINUTE > 0) {
      const key = String(req.ip || "unknown");
      const now = Date.now();
      const windowMs = 60_000;
      const limit = Math.max(1, Number(env.DB_QUERY_RATE_LIMIT_PER_MINUTE));
      const b = dbQueryRateBuckets.get(key);
      if (!b || now >= b.resetAt) {
        dbQueryRateBuckets.set(key, { resetAt: now + windowMs, count: 1 });
      } else {
        b.count += 1;
        if (b.count > limit) {
          logSecurityEvent(db, env, req, {
            route: "/api/db/query",
            eventType: "rate_limited",
            code: "DB_QUERY_RATE_LIMITED",
            meta: { limitPerMinute: limit },
          }).catch(() => {});
          return reply.code(429).send(error("RATE_LIMITED", "Too Many Requests"));
        }
      }

      // best-effort cleanup (avoid unbounded growth)
      if (dbQueryRateBuckets.size > 10000) {
        for (const [k, v] of dbQueryRateBuckets) {
          if (now >= v.resetAt) dbQueryRateBuckets.delete(k);
        }
      }
    }

    if (isDemoOpenAccess && q.action !== "select" && env.DEMO_WRITE_TOKEN) {
      const token = String((req.headers as any)["x-demo-write-token"] || "").trim();
      if (!token || token !== env.DEMO_WRITE_TOKEN) {
        return reply.code(403).send(error("DEMO_WRITE_FORBIDDEN", "Write action not allowed."));
      }
    }

    // Public reads: enforce safe subset
    if (!isAuthed && q.action !== "select") {
      return reply.code(401).send(error("AUTH_UNAUTHORIZED", "Unauthorized"));
    }

    if (!isAuthed && q.action === "select") {
      // Allow only these tables publicly
      const publicTables = new Set(["product_offers", "products", "product_checkout_config", "product_pixels", "orders"]);
      if (!publicTables.has(q.table)) return reply.code(401).send(error("AUTH_UNAUTHORIZED", "Unauthorized"));

      // Enforce public constraints
      if (q.table === "orders") {
        // Only allow selecting status by id
        if ((q.select || "").trim() !== "status") return reply.code(403).send(error("DB_FORBIDDEN", "Forbidden"));
        if (!hasFilter(q.filters, "id", "eq")) return reply.code(400).send(error("DB_BAD_REQUEST", "Filtro id obrigatório."));
      }
      if (q.table === "products") {
        // Only active products
        q.filters = [...(q.filters || []), { op: "eq", column: "status", value: "active" }];
      }
      if (q.table === "product_offers") {
        q.filters = [...(q.filters || []), { op: "eq", column: "active", value: true }];
      }
      if (q.table === "product_checkout_config") {
        // Public can read checkout config by product_id only; further restrictions happen in the UI.
        if (!hasFilter(q.filters, "product_id", "eq")) return reply.code(400).send(error("DB_BAD_REQUEST", "Filtro product_id obrigatório."));
      }
      if (q.table === "product_pixels") {
        // Public pixel lookup is allowed ONLY by product_id, with a fixed safe projection (no access_token).
        if (!hasFilter(q.filters, "product_id", "eq")) return reply.code(400).send(error("DB_BAD_REQUEST", "Filtro product_id obrigatório."));
        // Force safe select, ignoring any client-provided columns.
        q.select = "id, product_id, pixel_id, platform, active, created_at";
        // Enforce only active pixels publicly
        q.filters = [...(q.filters || []), { op: "eq", column: "active", value: true }];
        // Safety: never allow huge scans
        q.limit = Math.min(Number(q.limit || 50), 50);
      }
    }

    // Strict allowlist: prevent "power user" client access to tables/actions not explicitly allowed.
    // In production, this is enforced regardless of DB_QUERY_STRICT_ALLOWLIST (safety-by-default).
    const strictAllowlistEnabled = isAuthed && role !== "admin" && (env.DB_QUERY_STRICT_ALLOWLIST || String(env.NODE_ENV || "").toLowerCase() === "production");
    if (strictAllowlistEnabled) {
      const allowed = ROLE_ALLOWLIST[role as Exclude<DbRole, "admin">]?.[q.table]?.has(q.action) ?? false;
      if (!allowed) {
        if (env.DB_QUERY_AUDIT_ONLY) {
          req.log.warn({ table: q.table, action: q.action, role }, "db.query would be forbidden (audit-only)");
        } else {
          logSecurityEvent(db, env, req, {
            route: "/api/db/query",
            eventType: "db_forbidden",
            code: "DB_FORBIDDEN",
            meta: { table: q.table, action: q.action, role },
          }).catch(() => {});
          return reply.code(403).send(error("DB_FORBIDDEN", "Forbidden"));
        }
      }
    }

    // Authenticated authorization (simple per-table rules)
    if (isAuthed && role !== "admin") {
      if (q.table === "user_roles") {
        if (q.action !== "select") return reply.code(403).send(error("DB_FORBIDDEN", "Forbidden"));
        q.filters = [...(q.filters || []), { op: "eq", column: "user_id", value: userId }];
      } else if (q.table === "products") {
        if (role === "buyer" && q.action !== "select") return reply.code(403).send(error("DB_FORBIDDEN", "Forbidden"));
        if (role === "seller") q.filters = [...(q.filters || []), { op: "eq", column: "seller_id", value: userId }];
        if (role === "seller" && q.action === "insert" && Array.isArray(q.rows)) {
          q.rows = q.rows.map((r) => ({ ...r, seller_id: userId }));
        }
      } else
      // buyer/seller rules
      if (q.table === "profiles") {
        if (q.action === "delete") {
          return reply.code(403).send(error("DB_FORBIDDEN", "Forbidden"));
        }
        if (q.action === "select" || q.action === "update") {
          q.filters = [...(q.filters || []), { op: "eq", column: "user_id", value: userId }];
        }
        if (q.action === "insert" || q.action === "upsert") {
          if (!Array.isArray(q.rows) || q.rows.length === 0) {
            return reply.code(400).send(error("DB_BAD_REQUEST", "rows obrigatório."));
          }
          q.rows = q.rows.map((row) => {
            const nextRow = { ...row, user_id: userId };
            delete (nextRow as any).id;
            return nextRow;
          });
          if (q.action === "upsert" && !String(q.onConflict || "").trim()) {
            q.onConflict = "user_id";
          }
        }
        if ((q.action === "update" || q.action === "insert" || q.action === "upsert") && q.values) {
          // Never allow changing identity columns from the client
          delete (q.values as any).user_id;
          delete (q.values as any).id;
        }
      } else if (q.table === "notifications") {
        if (q.action === "insert" || q.action === "upsert" || q.action === "delete") {
          return reply.code(403).send(error("DB_FORBIDDEN", "Forbidden"));
        }
        q.filters = [...(q.filters || []), { op: "eq", column: "user_id", value: userId }];
      } else if (q.table === "orders") {
        // Orders are stateful and must never be writable by buyer/seller via /db/query.
        // Checkout flow uses /functions/create-order and /functions/create-payment; status changes come from webhooks.
        if (q.action !== "select") return denyStatefulOrderMutation(req, reply, "orders", q.action);
        if (role === "seller") {
          q.filters = [...(q.filters || []), { op: "eq", column: "seller_id", value: userId }];
          q.limit = Math.min(Number(q.limit || 50), 100);
          if (!q.order) q.order = { column: "created_at", ascending: false };
        }
        if (role === "buyer") {
          q.filters = [...(q.filters || []), { op: "eq", column: "buyer_email", value: userEmail }];
          q.limit = Math.min(Number(q.limit || 50), 100);
          if (!q.order) q.order = { column: "created_at", ascending: false };
        }
      } else if (q.table === "order_items") {
        // Order items can be read only by referencing an order the user owns.
        if (q.action !== "select") return denyStatefulOrderMutation(req, reply, "order_items", q.action);
        const orderId = String(getEqFilterValue(q.filters, "order_id") || "").trim();
        if (!orderId) return reply.code(400).send(error("DB_BAD_REQUEST", "Filtro order_id obrigatório."));
        const ownsRes = await db.query<any>(
          "select 1 from public.orders where id = $1 and (seller_id = $2 or buyer_email = $3) limit 1",
          [orderId, userId, userEmail]
        );
        if (!ownsRes.rows[0]) return reply.code(404).send(error("DB_NOT_FOUND", "Registro não encontrado."));
        q.order = q.order || { column: "created_at", ascending: true };
      } else if (q.table === "reward_claims") {
        if (q.action !== "select") return reply.code(403).send(error("DB_FORBIDDEN", "Forbidden"));
        if (role === "seller") q.filters = [...(q.filters || []), { op: "eq", column: "seller_id", value: userId }];
      } else if (q.table === "platform_fee_logs") {
        if (role === "seller") q.filters = [...(q.filters || []), { op: "eq", column: "seller_id", value: userId }];
      } else if (q.table === "platform_settings") {
        // Settings are readable for all authenticated users (terms, fees, branding).
        if (q.action !== "select") return reply.code(403).send(error("DB_FORBIDDEN", "Forbidden"));
        q.limit = Math.min(Number(q.limit || 1), 1);
      } else if (["smtp_config", "smtp_dns_records", "email_templates", "email_campaigns", "email_outbox", "email_logs", "platform_fees", "payment_method_acquirers", "acquirer_configs", "platform_updates"].includes(q.table)) {
        return reply.code(403).send(error("DB_FORBIDDEN", "Forbidden"));
      } else if (q.table === "webhook_endpoints") {
        if (q.action !== "select") return reply.code(403).send(error("DB_FORBIDDEN", "Forbidden"));
        q.filters = [...(q.filters || []), { op: "eq", column: "seller_id", value: userId }];
      } else if (q.table === "webhook_logs") {
        if (q.action !== "select") return reply.code(403).send(error("DB_FORBIDDEN", "Forbidden"));
        if (role !== "seller") return reply.code(403).send(error("DB_FORBIDDEN", "Forbidden"));
        const endpointIds = getFilterValues(q.filters, "endpoint_id").map((v) => String(v || "").trim()).filter(Boolean);
        if (endpointIds.length === 0) return reply.code(400).send(error("DB_BAD_REQUEST", "Filtro endpoint_id obrigatório."));
        const owned = await db.query<any>(
          "select id from public.webhook_endpoints where id = any($1) and seller_id = $2",
          [endpointIds, userId]
        );
        const ownedSet = new Set(owned.rows.map((r: any) => String(r.id)));
        if (endpointIds.some((id) => !ownedSet.has(id))) return reply.code(403).send(error("DB_FORBIDDEN", "Forbidden"));
      } else if (q.table === "zapier_integrations") {
        if (q.action !== "select") return reply.code(403).send(error("DB_FORBIDDEN", "Forbidden"));
        q.filters = [...(q.filters || []), { op: "eq", column: "seller_id", value: userId }];
      } else if (q.table === "zapier_logs") {
        if (q.action !== "select") return reply.code(403).send(error("DB_FORBIDDEN", "Forbidden"));
        if (role !== "seller") return reply.code(403).send(error("DB_FORBIDDEN", "Forbidden"));
        const integrationIds = getFilterValues(q.filters, "integration_id").map((v) => String(v || "").trim()).filter(Boolean);
        if (integrationIds.length === 0) return reply.code(400).send(error("DB_BAD_REQUEST", "Filtro integration_id obrigatório."));
        const owned = await db.query<any>(
          "select id from public.zapier_integrations where id = any($1) and seller_id = $2",
          [integrationIds, userId]
        );
        const ownedSet = new Set(owned.rows.map((r: any) => String(r.id)));
        if (integrationIds.some((id) => !ownedSet.has(id))) return reply.code(403).send(error("DB_FORBIDDEN", "Forbidden"));
      } else if (q.table === "whatsapp_instances") {
        if (q.action !== "select") return reply.code(403).send(error("DB_FORBIDDEN", "Forbidden"));
        q.filters = [...(q.filters || []), { op: "eq", column: "seller_id", value: userId }];
      } else if (q.table === "withdrawals") {
        if (q.action !== "select") return reply.code(403).send(error("DB_FORBIDDEN", "Forbidden"));
        q.filters = [...(q.filters || []), { op: "eq", column: "seller_id", value: userId }];
      } else if (q.table === "withdrawal_status_history") {
        if (q.action !== "select") return reply.code(403).send(error("DB_FORBIDDEN", "Forbidden"));
        const withdrawalIds = getFilterValues(q.filters, "withdrawal_id");
        const ids = withdrawalIds.map((v) => String(v || "").trim()).filter(Boolean);
        if (ids.length === 0) return reply.code(400).send(error("DB_BAD_REQUEST", "Filtro withdrawal_id obrigatório."));
        const owned = await db.query<any>(
          "select id from public.withdrawals where id = any($1) and seller_id = $2",
          [ids, userId]
        );
        const ownedSet = new Set(owned.rows.map((r: any) => String(r.id)));
        if (ids.some((id) => !ownedSet.has(id))) return reply.code(403).send(error("DB_FORBIDDEN", "Forbidden"));
      } else if (role === "buyer" && ["courses", "course_modules", "course_lessons", "course_progress"].includes(q.table)) {
        logSecurityEvent(db, env, req, {
          route: "/api/db/query",
          eventType: "db_forbidden_member_content",
          code: "DB_FORBIDDEN_MEMBER_CONTENT",
          meta: { table: q.table, action: q.action, role },
        }).catch(() => {});
        return reply.code(403).send(error("DB_FORBIDDEN", "Forbidden"));
      } else if (["product_offers", "product_pixels", "product_domains", "product_checkout_config", "product_coupons", "product_upsell_config", "product_delivery_config", "courses"].includes(q.table)) {
        if (q.action !== "select") return reply.code(403).send(error("DB_FORBIDDEN", "Forbidden"));
      } else if (["course_modules", "course_lessons"].includes(q.table)) {
        if (q.action !== "select") return reply.code(403).send(error("DB_FORBIDDEN", "Forbidden"));
      } else if (q.table === "course_progress") {
        // Buyers can only read/write their own progress; sellers don't operate course_progress via /db/query.
        if (role === "seller") return reply.code(403).send(error("DB_FORBIDDEN", "Forbidden"));
        if (q.action === "select") {
          q.filters = [...(q.filters || []), { op: "eq", column: "user_id", value: userId }];
        } else if (q.action === "insert" || q.action === "upsert") {
          if (Array.isArray(q.rows)) {
            q.rows = q.rows.map((r) => ({ ...r, user_id: userId }));
          }
          if (q.values) (q.values as any).user_id = userId;
          q.filters = [...(q.filters || []), { op: "eq", column: "user_id", value: userId }];
        } else if (q.action === "update" || q.action === "delete") {
          q.filters = [...(q.filters || []), { op: "eq", column: "user_id", value: userId }];
        } else {
          return reply.code(403).send(error("DB_FORBIDDEN", "Forbidden"));
        }
      }
    }

    const params: any[] = [];
    const where = buildWhere(q.filters, params);
    const orderSql = q.order ? `order by "${q.order.column}" ${q.order.ascending ? "asc" : "desc"}` : "";
    const limitSql = q.limit ? `limit ${Number(q.limit)}` : "";

    const jsonCols = q.action === "select" ? new Set<string>() : await getJsonColumns(db, q.table);

    try {
      if (q.action === "select") {
        const { columnsSql, includeRewards } = parseSelect(q.select);

        if (q.count === "exact") {
          const countRes = await db.query<{ count: string }>(`select count(*)::text as count from public."${q.table}" ${where}`, params);
          const count = Number(countRes.rows[0]?.count || 0);
          if (q.head) return reply.send({ data: null, count, error: null });
          // Continue to fetch rows with the same filters
          const dataRes = await db.query(`select ${columnsSql} from public."${q.table}" ${where} ${orderSql} ${limitSql}`, params);
          return reply.send({ data: dataRes.rows, count, error: null });
        }

        if (includeRewards && q.table === "reward_claims") {
          const sql = `
            select rc.*, r.name as reward_name, r.image_url as reward_image_url
            from public.reward_claims rc
            left join public.rewards r on r.id = rc.reward_id
            ${where.replace(/public\."reward_claims"/g, "rc").replace(/"reward_claims"/g, "rc")}
            ${orderSql.replace(/public\."reward_claims"\./g, "rc.")}
            ${limitSql}
          `;
          const dataRes = await db.query(sql, params);
          const mapped = dataRes.rows.map((row: any) => {
            const { reward_name, reward_image_url, ...rest } = row;
            return { ...rest, rewards: { name: reward_name, image_url: reward_image_url } };
          });
          if (q.single || q.maybeSingle) {
            const first = mapped[0] ?? null;
            if (!first && q.single) return reply.code(406).send({ data: null, error: { code: "PGRST116", message: "No rows" } });
            return reply.send({ data: first, error: null });
          }
          return reply.send({ data: mapped, error: null });
        }

        const dataRes = await db.query(`select ${columnsSql} from public."${q.table}" ${where} ${orderSql} ${limitSql}`, params);
        const rows = dataRes.rows;
        if (q.single || q.maybeSingle) {
          const first = rows[0] ?? null;
          if (!first && q.single) return reply.code(406).send({ data: null, error: { code: "PGRST116", message: "No rows" } });
          return reply.send({ data: first, error: null });
        }
        return reply.send({ data: rows, error: null });
      }

      if (q.action === "insert") {
        if (!q.rows || q.rows.length === 0) return reply.code(400).send(error("DB_BAD_REQUEST", "rows obrigatório."));
        if (!req.auth) return reply.code(401).send(error("AUTH_UNAUTHORIZED", "Unauthorized"));

        if (req.auth.role === "admin" && q.table === "payment_method_acquirers") {
          return reply.code(403).send(error("DB_FORBIDDEN", "Use /functions/admin-payment-method-acquirers."));
        }
        if (req.auth.role === "admin" && q.table === "smtp_config") {
          q.rows = q.rows.map((r) => applySmtpConfigWriteHardening(r));
          for (const row of q.rows) {
            const ok = await assertSmtpConfigWriteAllowed(row, reply);
            if (!ok) return;
          }
        }
        if (q.table === "email_templates") {
          for (const row of q.rows) {
            if (row?.enabled === true) {
              const smtpState = await readSmtpGuardState(db).catch(() => null);
              if (!smtpState || !smtpGuardReadyForEmailVerification(smtpState)) {
                return reply.code(400).send(
                  error(
                    "SMTP_REQUIRED_FOR_EMAIL_TEMPLATES",
                    "Para ativar templates de e-mail, o SMTP precisa estar ativo, configurado e com teste de conexao concluido com sucesso."
                  )
                );
              }
            }
          }
        }

        q.rows = normalizeJsonColsInRows(q.rows, jsonCols);
        const columns = Object.keys(q.rows[0] || {}).filter((c) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(c));
        if (columns.length === 0) return reply.code(400).send(error("DB_BAD_REQUEST", "Sem colunas."));

        const values: any[] = [];
        const rowsSql = q.rows
          .map((r) => {
            const placeholders = columns.map((c) => {
              values.push((r as any)[c]);
              return `$${values.length}`;
            });
            return `(${placeholders.join(", ")})`;
          })
          .join(", ");

        const returning = q.returning ? parseSelect(q.returning).columnsSql : "";
        const sql = `insert into public."${q.table}" (${columns.map((c) => `"${c}"`).join(", ")}) values ${rowsSql} ${returning ? `returning ${returning}` : ""}`;
        const res = await db.query(sql, values);
        if (req.auth.role === "admin" && q.table === "smtp_config") {
          for (const row of q.rows) {
            await disableSmtpDependentFlagsIfUnavailable(row).catch(() => {});
          }
        }
        const data = returning ? res.rows : null;
        if (
          q.table === "profiles" &&
          req.auth.user.email &&
          String((q.rows[0] as any)?.user_id || req.auth.user.id || "").trim() === String(req.auth.user.id || "").trim()
        ) {
          const profileRow = q.rows[0] as any;
          await queueProfileUpdatedEmail(db, {
            userEmail: String(req.auth.user.email || "").trim(),
            userName: String(profileRow?.name || req.auth.user.user_metadata?.name || "").trim(),
          }).catch(() => {});
        }
        return reply.send({ data: q.single || q.maybeSingle ? (data?.[0] ?? null) : data, error: null });
      }

      if (q.action === "upsert") {
        if (!q.rows || q.rows.length === 0) return reply.code(400).send(error("DB_BAD_REQUEST", "rows obrigatório."));
        requireAuth(req, reply);
        if (req.auth.role === "admin" && q.table === "payment_method_acquirers") {
          return reply.code(403).send(error("DB_FORBIDDEN", "Use /functions/admin-payment-method-acquirers."));
        }
        if (!q.onConflict) return reply.code(400).send(error("DB_BAD_REQUEST", "onConflict obrigatório."));
        if (req.auth.role === "admin" && q.table === "smtp_config") {
          q.rows = q.rows.map((r) => applySmtpConfigWriteHardening(r));
          for (const row of q.rows) {
            const ok = await assertSmtpConfigWriteAllowed(row, reply);
            if (!ok) return;
          }
        }
        if (q.table === "email_templates") {
          for (const row of q.rows) {
            if (row?.enabled === true) {
              const smtpState = await readSmtpGuardState(db).catch(() => null);
              if (!smtpState || !smtpGuardReadyForEmailVerification(smtpState)) {
                return reply.code(400).send(
                  error(
                    "SMTP_REQUIRED_FOR_EMAIL_TEMPLATES",
                    "Para ativar templates de e-mail, o SMTP precisa estar ativo, configurado e com teste de conexao concluido com sucesso."
                  )
                );
              }
            }
          }
        }

        const conflictCols = q.onConflict.split(",").map((s) => s.trim()).filter(Boolean);
        if (conflictCols.length === 0) return reply.code(400).send(error("DB_BAD_REQUEST", "onConflict inválido."));
        for (const c of conflictCols) {
          if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(c)) return reply.code(400).send(error("DB_BAD_REQUEST", "onConflict inválido."));
        }

        q.rows = normalizeJsonColsInRows(q.rows, jsonCols);
        const columns = Object.keys(q.rows[0] || {}).filter((c) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(c));
        if (columns.length === 0) return reply.code(400).send(error("DB_BAD_REQUEST", "Sem colunas."));

        const values: any[] = [];
        const rowsSql = q.rows
          .map((r) => {
            const placeholders = columns.map((c) => {
              values.push((r as any)[c]);
              return `$${values.length}`;
            });
            return `(${placeholders.join(", ")})`;
          })
          .join(", ");

        const updateCols = columns.filter((c) => !conflictCols.includes(c));
        const setSql = updateCols.length
          ? updateCols.map((c) => `"${c}" = EXCLUDED."${c}"`).join(", ")
          : conflictCols.map((c) => `"${c}" = EXCLUDED."${c}"`).join(", ");

        const returning = q.returning ? parseSelect(q.returning).columnsSql : "";
        const sql = `
          insert into public."${q.table}" (${columns.map((c) => `"${c}"`).join(", ")})
          values ${rowsSql}
          on conflict (${conflictCols.map((c) => `"${c}"`).join(", ")})
          do update set ${setSql}
          ${returning ? `returning ${returning}` : ""}
        `;
        const res = await db.query(sql, values);
        if (req.auth.role === "admin" && q.table === "smtp_config") {
          for (const row of q.rows) {
            await disableSmtpDependentFlagsIfUnavailable(row).catch(() => {});
          }
        }
        const data = returning ? res.rows : null;
        if (
          q.table === "profiles" &&
          req.auth.user.email &&
          String((q.rows[0] as any)?.user_id || req.auth.user.id || "").trim() === String(req.auth.user.id || "").trim()
        ) {
          const profileRow = q.rows[0] as any;
          await queueProfileUpdatedEmail(db, {
            userEmail: String(req.auth.user.email || "").trim(),
            userName: String(profileRow?.name || req.auth.user.user_metadata?.name || "").trim(),
          }).catch(() => {});
        }
        return reply.send({ data: q.single || q.maybeSingle ? (data?.[0] ?? null) : data, error: null });
      }

      if (q.action === "update") {
        if (!q.values) return reply.code(400).send(error("DB_BAD_REQUEST", "values obrigatório."));
        requireAuth(req, reply);
        if (req.auth.role === "admin" && q.table === "payment_method_acquirers") {
          return reply.code(403).send(error("DB_FORBIDDEN", "Use /functions/admin-payment-method-acquirers."));
        }
        if (req.auth.role === "admin" && q.table === "smtp_config") {
          q.values = applySmtpConfigWriteHardening(q.values as any);
          const ok = await assertSmtpConfigWriteAllowed(q.values as any, reply);
          if (!ok) return;
        }
        if (q.table === "email_templates" && (q.values as any)?.enabled === true) {
          const smtpState = await readSmtpGuardState(db).catch(() => null);
          if (!smtpState || !smtpGuardReadyForEmailVerification(smtpState)) {
            return reply.code(400).send(
              error(
                "SMTP_REQUIRED_FOR_EMAIL_TEMPLATES",
                "Para ativar templates de e-mail, o SMTP precisa estar ativo, configurado e com teste de conexao concluido com sucesso."
              )
            );
          }
        }
        if (q.table === "profiles" && (q.values as any)?.email_notifications === true) {
          const targetUserId = String(getEqFilterValue(q.filters, "user_id") || req.auth.user.id || "").trim();
          if (targetUserId) {
            const currentProfileRes = await db.query<{ email_notifications: boolean | null }>(
              "select email_notifications from public.profiles where user_id = $1 limit 1",
              [targetUserId]
            );
            const currentEmailNotifications = Boolean(currentProfileRes.rows[0]?.email_notifications);
            if (!currentEmailNotifications) {
              const smtpState = await readSmtpGuardState(db).catch(() => null);
              if (!smtpState || !smtpGuardReadyForEmailVerification(smtpState)) {
                return reply.code(400).send(
                  error(
                    "SMTP_REQUIRED_FOR_EMAIL_NOTIFICATIONS",
                    "Para ativar notificacoes por e-mail, o SMTP precisa estar ativo, configurado e com teste de conexao concluido com sucesso."
                  )
                );
              }
            }
          }
        }

        q.values = normalizeJsonColsInRecord(q.values as any, jsonCols);

      // Preload data for special-case side-effects (admin withdrawal/reward statuses -> email)
      const isAdmin = req.auth.role === "admin";
      const isWithdrawals = q.table === "withdrawals";
      const isRewardClaims = q.table === "reward_claims";
      const nextWithdrawalStatus = isWithdrawals ? (q.values as any)?.status : undefined;
      const withdrawalIdFilter = isWithdrawals
        ? q.filters?.find((f) => f.op === "eq" && f.column === "id")
        : undefined;
      const withdrawalId = isWithdrawals ? String(withdrawalIdFilter?.value || "").trim() : "";
      let prevWithdrawal: any | null = null;
      if (isAdmin && isWithdrawals && withdrawalId && typeof nextWithdrawalStatus === "string") {
        const prevRes = await db.query<any>("select id, status, seller_id, net_amount, rejection_reason from public.withdrawals where id = $1 limit 1", [withdrawalId]);
        prevWithdrawal = prevRes.rows[0] ?? null;
      }
      const nextRewardClaimStatus = isRewardClaims ? String((q.values as any)?.status || "").trim() : "";
      const rewardClaimIdFilter = isRewardClaims
        ? q.filters?.find((f) => f.op === "eq" && f.column === "id")
        : undefined;
      const rewardClaimId = isRewardClaims ? String(rewardClaimIdFilter?.value || "").trim() : "";
      let prevRewardClaim: any | null = null;
      if (isAdmin && isRewardClaims && rewardClaimId && nextRewardClaimStatus) {
        const prevRes = await db.query<any>(
          "select id, status from public.reward_claims where id = $1 limit 1",
          [rewardClaimId]
        );
        prevRewardClaim = prevRes.rows[0] ?? null;
      }

      const columns = Object.keys(q.values).filter((c) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(c));
      if (columns.length === 0) return reply.code(400).send(error("DB_BAD_REQUEST", "Sem colunas."));

      const values: any[] = [];
      const sets = columns.map((c) => {
        values.push((q.values as any)[c]);
        return `"${c}" = $${values.length}`;
      });

      const whereParams: any[] = [];
      const whereSql = buildWhere(q.filters, whereParams);
      const combinedParams = [...values, ...whereParams];
      const whereWithShift = whereSql.replace(/\$(\d+)/g, (_m, n) => `$${Number(n) + values.length}`);

      const returning = q.returning ? parseSelect(q.returning).columnsSql : "";
      const sql = `update public."${q.table}" set ${sets.join(", ")} ${whereWithShift} ${returning ? `returning ${returning}` : ""}`;
      const res = await db.query(sql, combinedParams);
      if (req.auth.role === "admin" && q.table === "smtp_config") {
        await disableSmtpDependentFlagsIfUnavailable(q.values as any).catch(() => {});
      }
      const data = returning ? res.rows : null;

      // Post-update side-effects
      if (isAdmin && isWithdrawals && prevWithdrawal && typeof nextWithdrawalStatus === "string") {
        const prevStatus = String(prevWithdrawal.status || "");
        const nextStatus = String(nextWithdrawalStatus || "");
        if (prevStatus !== nextStatus && (nextStatus === "approved" || nextStatus === "rejected")) {
          const sellerId = String(prevWithdrawal.seller_id || "").trim();
          if (sellerId) {
            const sellerRes = await db.query<any>(
              "select u.email, coalesce(p.name,'') as name from public.users u left join public.profiles p on p.user_id = u.id where u.id = $1 limit 1",
              [sellerId]
            );
            const seller = sellerRes.rows[0];
            const sellerEmail = String(seller?.email || "").trim();
            const sellerName = String(seller?.name || "").trim() || "Vendedor";
            const amount = String(prevWithdrawal.net_amount != null ? prevWithdrawal.net_amount : "");
            const reason = String((q.values as any)?.rejection_reason || prevWithdrawal.rejection_reason || "").trim();

            if (sellerEmail) {
              const eventKey = nextStatus === "approved" ? "withdrawal_approved" : "withdrawal_rejected";
              const dedupeKey = `withdrawal:${eventKey}:${withdrawalId}:${sellerEmail}`;
              await enqueueTemplatedEmail(db, {
                to: sellerEmail,
                eventKey,
                dedupeKey,
                vars: {
                  seller_name: sellerName,
                  amount,
                  reason,
                },
              }).catch(() => {});
            }
          }
        }
      }
      if (isAdmin && isRewardClaims && prevRewardClaim && nextRewardClaimStatus) {
        const prevStatus = String(prevRewardClaim.status || "");
        if (prevStatus !== nextRewardClaimStatus && nextRewardClaimStatus === "sent") {
          await queueRewardSentEmail(db, { claimId: rewardClaimId }).catch(() => {});
        }
      }
      if (q.table === "profiles" && req.auth.user.email) {
        const targetUserId = String(getEqFilterValue(q.filters, "user_id") || req.auth.user.id || "").trim();
        if (targetUserId === String(req.auth.user.id || "").trim()) {
          await queueProfileUpdatedEmail(db, {
            userEmail: String(req.auth.user.email || "").trim(),
            userName: String((q.values as any)?.name || req.auth.user.user_metadata?.name || "").trim(),
          }).catch(() => {});
        }
      }

        return reply.send({ data: q.single || q.maybeSingle ? (data?.[0] ?? null) : data, error: null });
      }

      if (q.action === "delete") {
        requireAuth(req, reply);
        if (req.auth.role === "admin" && q.table === "payment_method_acquirers") {
          return reply.code(403).send(error("DB_FORBIDDEN", "Use /functions/admin-payment-method-acquirers."));
        }
        const whereParams: any[] = [];
        const whereSql = buildWhere(q.filters, whereParams);
        const returning = q.returning ? parseSelect(q.returning).columnsSql : "";
        const sql = `delete from public."${q.table}" ${whereSql} ${returning ? `returning ${returning}` : ""}`;
        const res = await db.query(sql, whereParams);
        const data = returning ? res.rows : null;
        return reply.send({ data: q.single || q.maybeSingle ? (data?.[0] ?? null) : data, error: null });
      }

      return reply.code(400).send(error("DB_BAD_REQUEST", "Ação inválida."));
    } catch (err: any) {
      const mapped = mapDbErrorToHttp(err, { table: q.table, action: q.action });
      (req as any).log?.error?.({ pgCode: err?.code, constraint: err?.constraint, table: q.table, action: q.action }, "db/query failed");
      return reply.code(mapped.httpStatus).send({ error: { code: mapped.code, message: mapped.message } });
    }
  });

  // Minimal RPCs used by the frontend
  app.post("/rpc/get_user_role", async (req, reply) => {
    const body = z.object({ _user_id: z.string().uuid() }).parse(req.body);
    requireAuth(req, reply);
    // Users can only request their own role; admins can request any.
    if (req.auth.role !== "admin" && body._user_id !== req.auth.user.id) {
      return reply.code(403).send(error("RPC_FORBIDDEN", "Forbidden"));
    }
    const res = await db.query<{ role: string }>("select public.get_user_role($1) as role", [body._user_id]);
    return reply.send({ data: res.rows[0]?.role ?? null, error: null });
  });

  app.post("/rpc/admin_delete_user_cascade", async (req, reply) => {
    const body = z.object({ _user_id: z.string().uuid() }).parse(req.body);
    await requireAdmin(db, req, reply);
    await db.query("select public.admin_delete_user_cascade($1)", [body._user_id]);
    return reply.send({ data: null, error: null });
  });
}
