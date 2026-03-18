import { z } from "zod";

function boolFromEnv(defaultValue: boolean) {
  return z.preprocess((v) => {
    if (v === undefined || v === null) return undefined;
    if (typeof v === "boolean") return v;
    const s = String(v).trim().toLowerCase();
    if (!s) return undefined;
    if (["1", "true", "yes", "y", "on"].includes(s)) return true;
    if (["0", "false", "no", "n", "off"].includes(s)) return false;
    return v;
  }, z.boolean().default(defaultValue));
}

function optionalStringMin(minLen: number) {
  return z.preprocess((v) => {
    if (v === undefined || v === null) return undefined;
    const s = String(v).trim();
    if (!s) return undefined;
    return s;
  }, z.string().min(minLen).optional());
}

const envSchema = z.object({
  NODE_ENV: z.string().optional(),
  PORT: z.coerce.number().default(4000),
  // Prefer PG* vars (avoid URL-encoding issues with passwords). DATABASE_URL is supported as an alternative.
  DATABASE_URL: z.string().min(1).optional(),
  PGHOST: z.string().min(1).optional(),
  PGPORT: z.coerce.number().optional(),
  PGUSER: z.string().min(1).optional(),
  PGPASSWORD: z.string().min(1).optional(),
  PGDATABASE: z.string().min(1).optional(),
  PUBLIC_BASE_URL: z.string().url(),
  COOKIE_NAME: z.string().default("dingitalpay_session"),
  COOKIE_SECURE: boolFromEnv(true),
  COOKIE_SAMESITE: z.enum(["lax", "strict", "none"]).default("lax"),
  SESSION_DAYS: z.coerce.number().int().positive().default(30),
  MASTER_KEY: z.string().min(16), // base64 or any string; we derive a key via SHA-256
  INTERNAL_WEBHOOK_TOKEN: z.string().min(16).optional(),
  DEMO_OPEN_ACCESS: boolFromEnv(false),
  // Optional: when set, API demo will require this header for write actions (insert/update/upsert/delete)
  // executed under demo open access (no-cookie) mode. Intended to be injected by Nginx for demo only.
  DEMO_WRITE_TOKEN: z.string().min(16).optional(),
  // Demo hardening: basic per-IP rate limit for /db/query when running in DEMO_OPEN_ACCESS mode.
  DEMO_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(240),
  // /db/query hardening
  DB_QUERY_STRICT_ALLOWLIST: boolFromEnv(false),
  // When strict allowlist is enabled, audit-only will log would-be blocks but keep allowing (safe rollout).
  DB_QUERY_AUDIT_ONLY: boolFromEnv(false),
  // Basic per-IP rate limit for /db/query (0 disables). Recommended for production.
  DB_QUERY_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().nonnegative().default(0),
  EMAIL_WORKER_ENABLED: boolFromEnv(true),
  EMAIL_DAILY_LIMIT: z.coerce.number().int().positive().default(5000),
  EMAIL_MAX_PER_MINUTE: z.coerce.number().int().positive().default(120),
  // Signup hardening
  SIGNUP_DISABLED: boolFromEnv(false),
  RATE_LIMIT_SIGNUP_PER_MINUTE: z.coerce.number().int().nonnegative().default(0),
  RATE_LIMIT_SIGNUP_PER_HOUR: z.coerce.number().int().nonnegative().default(0),
  RATE_LIMIT_RESET_PASSWORD_PER_MINUTE: z.coerce.number().int().nonnegative().default(0),
  RATE_LIMIT_RESET_PASSWORD_PER_HOUR: z.coerce.number().int().nonnegative().default(0),
  RATE_LIMIT_CHECK_EMAIL_PER_MINUTE: z.coerce.number().int().nonnegative().default(0),
  // Turnstile (anti-bot)
  TURNSTILE_SECRET_KEY: optionalStringMin(10),
  SIGNUP_TURNSTILE_REQUIRED: boolFromEnv(false),
  SIGNUP_TURNSTILE_AUDIT_ONLY: boolFromEnv(true),
  // Global API rate limits (0 disables each bucket)
  RATE_LIMIT_AUTH_PER_MINUTE: z.coerce.number().int().nonnegative().default(0),
  RATE_LIMIT_CHECKOUT_PER_MINUTE: z.coerce.number().int().nonnegative().default(0),
  RATE_LIMIT_WEBHOOKS_PER_MINUTE: z.coerce.number().int().nonnegative().default(0),
  RATE_LIMIT_CAPI_PER_MINUTE: z.coerce.number().int().nonnegative().default(0),
  // CORS allowlist (comma-separated origins). In production, requests with Origin not in the list are blocked.
  CORS_ALLOWED_ORIGINS: z.string().optional(),
  // Public storage buckets allowlist (comma-separated). Buckets not in the list are not served under /storage/public/*.
  PUBLIC_STORAGE_BUCKETS: z.string().optional(),
  // Storage hardening (authenticated upload/list/remove)
  STORAGE_STRICT_AUTHZ: boolFromEnv(false),
  STORAGE_AUDIT_ONLY: boolFromEnv(false),
  // SSRF hardening for real webhook/zapier dispatch
  WEBHOOK_SSRF_GUARD: boolFromEnv(false),
  WEBHOOK_SSRF_AUDIT_ONLY: boolFromEnv(false),
  // SMTP hardening
  SMTP_ALLOW_INSECURE_TLS: boolFromEnv(false),
  // Provisioning (onboarding) base URL used by /admin/updates to check updates
  PROVISIONING_BASE_URL: z.string().url().optional(),
  // Internal provisioning API (used by onboarding admin panel for license sync)
  PROVISIONING_INTERNAL_BASE_URL: z.string().url().optional(),
  PROVISIONING_INTERNAL_API_TOKEN: z.string().min(16).optional(),
  // Optional: also store the updates token in a local file (root-only). Intended for host-level updater usage.
  UPDATES_TOKEN_FILE: z.string().optional(),
  // Updates runner (server-side apply). Disabled by default (safe rollout).
  UPDATES_RUNNER_ENABLED: boolFromEnv(false),
  UPDATES_RUNNER_BIN: z.string().default("dingitalpay-updater"),
  UPDATES_RUNNER_INSTALL_ROOT: z.string().default("/opt/dingitalpay"),
  UPDATES_RUNNER_PRODUCT_KEY: z.string().default("dingitalpay-platform"),
  UPDATES_RUNNER_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(60 * 45),
  // MFA policy (2FA)
  // By default, MFA is OPTIONAL for all roles (safe rollout).
  // When MFA_ENFORCE=true, roles listed in MFA_REQUIRED_ROLES will be forced to configure 2FA.
  MFA_ENFORCE: boolFromEnv(false),
  MFA_REQUIRED_ROLES: z.string().optional()
}).superRefine((env, ctx) => {
  const hasPg =
    Boolean(env.PGHOST) &&
    Boolean(env.PGUSER) &&
    Boolean(env.PGPASSWORD) &&
    Boolean(env.PGDATABASE);
  const hasUrl = Boolean(env.DATABASE_URL);
  if (!hasPg && !hasUrl) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["DATABASE_URL"],
      message: "Provide DATABASE_URL or PGHOST/PGUSER/PGPASSWORD/PGDATABASE."
    });
  }
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error(parsed.error.flatten().fieldErrors);
    throw new Error("Invalid environment variables for API");
  }
  return parsed.data;
}
