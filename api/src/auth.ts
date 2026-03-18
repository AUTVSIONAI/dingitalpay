import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import type { Db } from "./db.js";
import type { Env } from "./env.js";
import { decryptJson, encryptJson, hashToken } from "./crypto.js";
import { enqueueTemplatedEmail } from "./emailQueue.js";
import { queueAccountCreatedEmail } from "./emailEventTriggers.js";
import { logSecurityEvent } from "./securityAudit.js";
import { verifyTurnstile } from "./turnstile.js";
import { base32Encode, buildOtpAuthUri, generateTotpSecretBase32, verifyTotp } from "./totp.js";
import { attachProductEntitlementsToUser } from "./productEntitlements.js";

export type AuthUser = {
  id: string;
  email: string;
  user_metadata: Record<string, any>;
};

export type Session = {
  access_token: string;
  user: AuthUser;
  expires_at: number; // unix seconds
};

const DEMO_ROLES = ["admin", "seller", "buyer"] as const;
type DemoRole = (typeof DEMO_ROLES)[number];
const demoUserCache = new Map<DemoRole, { userId: string }>();

const MFA_TRUST_COOKIE = "dingitalpay_mfa_trust";
const MFA_TRUST_DAYS = 30;
const MFA_ISSUER = "DingitalPay";
const PLATFORM_AUTH_POLICY_TTL_MS = 15_000;
const PLATFORM_REQUIRED_TWO_FACTOR_ROLES = new Set(["seller", "buyer"]);

type PlatformAuthPolicy = {
  emailVerificationRequired: boolean;
  twoFactorRequired: boolean;
};

let platformAuthPolicyCache:
  | {
      value: PlatformAuthPolicy;
      expiresAt: number;
    }
  | null = null;

export function invalidatePlatformAuthPolicyCache(): void {
  platformAuthPolicyCache = null;
}

declare module "fastify" {
  interface FastifyRequest {
    auth?: {
      user: AuthUser;
      role: "admin" | "seller" | "buyer" | null;
      sessionId: string;
      mfa: { pending: boolean; setupRequired: boolean };
    };
  }
}

async function getUserRole(db: Db, userId: string): Promise<"admin" | "seller" | "buyer" | null> {
  const res = await db.query<{ role: "admin" | "seller" | "buyer" }>(
    "select role from public.user_roles where user_id = $1 order by role asc limit 1",
    [userId]
  );
  return res.rows[0]?.role ?? null;
}

async function getUserByEmail(db: Db, email: string): Promise<{ id: string; email: string; password_hash: string; disabled: boolean; email_verified: boolean; raw_user_meta_data: any } | null> {
  const res = await db.query(
    "select id, email, password_hash, disabled, email_verified, raw_user_meta_data from public.users where lower(email) = lower($1) limit 1",
    [email]
  );
  return (res.rows[0] as any) ?? null;
}

async function getUserById(db: Db, userId: string): Promise<{ id: string; email: string; disabled: boolean; raw_user_meta_data: any } | null> {
  const res = await db.query(
    "select id, email, disabled, raw_user_meta_data from public.users where id = $1 limit 1",
    [userId]
  );
  return (res.rows[0] as any) ?? null;
}

async function getOrCreateDemoUser(db: Db, role: "admin" | "seller" | "buyer") {
  const email = `demo-${role}@dingitalpay.com`;
  const name = role === "admin" ? "Demo Admin" : role === "seller" ? "Demo Vendedor" : "Demo Comprador";
  const meta = { name, role, demo: true };

  const existing = await getUserByEmail(db, email);
  let userId: string;

  if (!existing) {
    const passwordHash = await bcrypt.hash(nanoid(32), 10);
    const insert = await db.query<{ id: string }>(
      "insert into public.users(email, password_hash, email_verified, raw_user_meta_data) values ($1, $2, true, $3) returning id",
      [email, passwordHash, JSON.stringify(meta)]
    );
    userId = insert.rows[0]!.id;
  } else {
    userId = existing.id;
    await db.query(
      "update public.users set disabled = false, email_verified = true, raw_user_meta_data = $2 where id = $1",
      [userId, JSON.stringify(meta)]
    );
  }

  await db.query(
    "insert into public.profiles(user_id, name) values ($1, $2) on conflict (user_id) do update set name = excluded.name",
    [userId, name]
  );

  // Keep a single role for demo users to avoid ambiguity in get_user_role().
  await db.query("delete from public.user_roles where user_id = $1", [userId]);
  await db.query("insert into public.user_roles(user_id, role) values ($1, $2)", [userId, role]);

  return { userId, email, name };
}

function toAuthUser(row: { id: string; email: string; raw_user_meta_data: any }): AuthUser {
  return {
    id: row.id,
    email: row.email,
    user_metadata: row.raw_user_meta_data || {}
  };
}

async function getPlatformAuthPolicy(db: Db): Promise<PlatformAuthPolicy> {
  if (platformAuthPolicyCache && platformAuthPolicyCache.expiresAt > Date.now()) {
    return platformAuthPolicyCache.value;
  }

  const res = await db.query<{ email_verification: boolean; two_factor: boolean }>(
    "select email_verification, two_factor from public.platform_settings order by created_at asc limit 1"
  );
  const value: PlatformAuthPolicy = {
    emailVerificationRequired: res.rows[0]?.email_verification ?? false,
    twoFactorRequired: res.rows[0]?.two_factor ?? false,
  };
  platformAuthPolicyCache = {
    value,
    expiresAt: Date.now() + PLATFORM_AUTH_POLICY_TTL_MS,
  };
  return value;
}

function requiredTwoFactorRoles(env: Env): string[] {
  const required = String(env.MFA_REQUIRED_ROLES || "admin,seller")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return required;
}

function isTwoFactorMandatory(
  env: Env,
  role: "admin" | "seller" | "buyer" | null,
  policy: PlatformAuthPolicy
): boolean {
  if (!role) return false;
  const normalizedRole = String(role).toLowerCase();
  const required = requiredTwoFactorRoles(env);
  if (policy.twoFactorRequired && PLATFORM_REQUIRED_TWO_FACTOR_ROLES.has(normalizedRole)) return true;
  if (!env.MFA_ENFORCE) return false;
  return required.includes(normalizedRole);
}

export async function revokeSessionsMissingRequiredTwoFactor(db: Db): Promise<number> {
  const res = await db.query<{ count: string }>(
    `
      with revoked as (
        update public.sessions s
        set revoked_at = now()
        where s.revoked_at is null
          and exists (
            select 1
            from public.user_roles ur
            where ur.user_id = s.user_id
              and ur.role::text in ('seller', 'buyer')
          )
          and not exists (
            select 1
            from public.user_two_factor utf
            where utf.user_id = s.user_id
              and utf.enabled = true
          )
        returning s.id
      )
      select count(*)::text as count from revoked
    `
  );
  return Number(res.rows[0]?.count || 0);
}

type TwoFactorRow = {
  enabled: boolean;
  secret_ciphertext: string | null;
  secret_iv: string | null;
  secret_tag: string | null;
  pending_secret_ciphertext: string | null;
  pending_secret_iv: string | null;
  pending_secret_tag: string | null;
  pending_created_at: string | null;
};

async function getTwoFactorRow(db: Db, userId: string): Promise<TwoFactorRow | null> {
  const res = await db.query<TwoFactorRow>(
    `select
      enabled,
      secret_ciphertext, secret_iv, secret_tag,
      pending_secret_ciphertext, pending_secret_iv, pending_secret_tag,
      pending_created_at
    from public.user_two_factor
    where user_id = $1
    limit 1`,
    [userId]
  );
  return res.rows[0] ?? null;
}

async function ensureTwoFactorRow(db: Db, userId: string): Promise<void> {
  await db.query("insert into public.user_two_factor(user_id) values ($1) on conflict (user_id) do nothing", [userId]);
}

function normalizeRecoveryCode(raw: string): string {
  return String(raw || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function hashRecoveryCode(env: Env, raw: string): string {
  const normalized = normalizeRecoveryCode(raw);
  return hashToken(`${env.MASTER_KEY}:recovery:${normalized}`);
}

function generateRecoveryCodes(count = 10): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const raw = base32Encode(Buffer.from(nanoid(32))).replace(/[^A-Z2-7]/g, "").slice(0, 12);
    const parts = raw.match(/.{1,4}/g) || [raw];
    out.push(parts.join("-"));
  }
  return out;
}

async function getTrustedDeviceId(db: Db, userId: string, trustToken: string): Promise<string | null> {
  const token = String(trustToken || "").trim();
  if (!token) return null;
  const tokenHash = hashToken(token);
  const res = await db.query<{ id: string }>(
    "select id from public.user_two_factor_trusted_devices where user_id = $1 and token_hash = $2 and expires_at > now() limit 1",
    [userId, tokenHash]
  );
  const row = res.rows[0];
  if (!row) return null;
  await db.query("update public.user_two_factor_trusted_devices set last_used_at = now() where id = $1", [row.id]).catch(() => {});
  return row.id;
}

function setMfaTrustCookie(reply: FastifyReply, env: Env, token: string) {
  reply.setCookie(MFA_TRUST_COOKIE, token, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SAMESITE,
    path: "/",
    maxAge: MFA_TRUST_DAYS * 24 * 60 * 60,
  });
}

async function createTrustedDevice(db: Db, env: Env, req: FastifyRequest, userId: string): Promise<{ token: string; id: string }> {
  const token = nanoid(48);
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + MFA_TRUST_DAYS * 24 * 60 * 60 * 1000);
  const ua = String((req.headers as any)["user-agent"] || "").slice(0, 512);
  const ip = String(req.ip || "").slice(0, 128);
  const insert = await db.query<{ id: string }>(
    "insert into public.user_two_factor_trusted_devices(user_id, token_hash, expires_at, user_agent, ip) values ($1, $2, $3, $4, $5) returning id",
    [userId, tokenHash, expiresAt.toISOString(), ua, ip]
  );
  return { token, id: insert.rows[0]!.id };
}

async function markSessionMfaVerified(db: Db, sessionId: string): Promise<void> {
  await db.query("update public.sessions set mfa_pending = false, mfa_setup_required = false, mfa_verified_at = now() where id = $1", [sessionId]);
}

function getTurnstileToken(body: Record<string, any>): string {
  return String((body as any)["cf-turnstile-response"] || (body as any).turnstile_token || "").trim();
}

async function verifyTurnstileOrReject(
  req: FastifyRequest,
  reply: FastifyReply,
  db: Db,
  env: Env,
  route: string,
  eventType: string,
  token: string
) {
  if (!env.TURNSTILE_SECRET_KEY) return;

  const out = token ? await verifyTurnstile(req, env, token) : { ok: false, errorCodes: ["missing_token"] };
  if (out.ok) return;

  logSecurityEvent(db, env, req, {
    route,
    eventType,
    code: "TURNSTILE_FAILED",
    meta: { errorCodes: out.errorCodes },
  }).catch(() => {});

  return reply.code(403).send({ error: { message: "Verificação anti-bot necessária.", code: "TURNSTILE_REQUIRED" } });
}

function safeRedirectUrl(redirectTo: string | undefined, publicBaseUrl: string): string | null {
  const raw = String(redirectTo || "").trim();
  if (!raw) return null;
  try {
    const base = new URL(publicBaseUrl);
    const url = raw.startsWith("/") ? new URL(raw, base) : new URL(raw);
    if (url.origin !== base.origin) return null;
    // only allow known auth pages
    const allowedPrefixes = ["/auth/", "/buyer/"];
    if (!allowedPrefixes.some((p) => url.pathname.startsWith(p))) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function defaultEmailVerifiedRedirect(publicBaseUrl: string, role: "admin" | "seller" | "buyer" | null): string {
  const loginPath = role === "buyer" ? "/buyer/login" : "/auth/login";
  return `${publicBaseUrl.replace(/\/+$/, "")}/auth/email-verified?login=${encodeURIComponent(loginPath)}`;
}

async function createSession(
  db: Db,
  env: Env,
  userId: string,
  opts?: { mfaPending?: boolean; mfaSetupRequired?: boolean; mfaVerifiedAt?: Date | null }
): Promise<{ session: Session & { mfa_pending?: boolean; mfa_setup_required?: boolean }; cookieToken: string; sessionId: string }> {
  const token = nanoid(48);
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + env.SESSION_DAYS * 24 * 60 * 60 * 1000);
  const mfaPending = Boolean(opts?.mfaPending);
  const mfaSetupRequired = Boolean(opts?.mfaSetupRequired);
  const mfaVerifiedAt = opts?.mfaVerifiedAt ?? (!mfaPending ? new Date() : null);
  const insert = await db.query<{ id: string }>(
    "insert into public.sessions(user_id, token_hash, expires_at, mfa_pending, mfa_setup_required, mfa_verified_at) values ($1, $2, $3, $4, $5, $6) returning id",
    [userId, tokenHash, expiresAt.toISOString(), mfaPending, mfaSetupRequired, mfaVerifiedAt ? mfaVerifiedAt.toISOString() : null]
  );
  const user = await getUserById(db, userId);
  if (!user) throw new Error("User not found after session creation");
  const session: Session & { mfa_pending?: boolean; mfa_setup_required?: boolean } = {
    access_token: token,
    user: toAuthUser(user as any),
    expires_at: Math.floor(expiresAt.getTime() / 1000),
    mfa_pending: mfaPending,
    mfa_setup_required: mfaSetupRequired,
  };
  return { session, cookieToken: token, sessionId: insert.rows[0]!.id };
}

async function deleteSessionByToken(db: Db, token: string): Promise<void> {
  const tokenHash = hashToken(token);
  await db.query("update public.sessions set revoked_at = now() where token_hash = $1 and revoked_at is null", [tokenHash]);
}

async function loadSession(
  db: Db,
  env: Env,
  token: string,
  trustToken?: string
): Promise<{ sessionId: string; user: AuthUser; role: any; expiresAtIso: string; mfa: { pending: boolean; setupRequired: boolean } } | null> {
  const tokenHash = hashToken(token);
  const res = await db.query<{ id: string; user_id: string; expires_at: string; revoked_at: string | null; mfa_pending: boolean; mfa_setup_required: boolean; mfa_verified_at: string | null }>(
    "select id, user_id, expires_at, revoked_at, mfa_pending, mfa_setup_required, mfa_verified_at from public.sessions where token_hash = $1 limit 1",
    [tokenHash]
  );
  const row = res.rows[0];
  if (!row) return null;
  if (row.revoked_at) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;
  const userRow = await getUserById(db, row.user_id);
  if (!userRow || (userRow as any).disabled) return null;
  const role = await getUserRole(db, row.user_id);
  const policy = await getPlatformAuthPolicy(db).catch(() => ({
    emailVerificationRequired: true,
    twoFactorRequired: false,
  }));

  // Compute MFA policy (optional by default; can be enforced by env flags)
  const twoFactor = await getTwoFactorRow(db, row.user_id).catch(() => null);
  const enabled = Boolean(twoFactor?.enabled);
  const mandatory = isTwoFactorMandatory(env, role, policy);
  const setupRequired = mandatory && !enabled;

  let pending = false;
  if (enabled) pending = !row.mfa_verified_at;
  else if (setupRequired) pending = true;

  // Important: trusted-device cookie must NOT auto-bypass MFA here.
  // Bypass is handled only at sign-in, when the user explicitly opts-in ("remember this device").

  const desiredPending = pending;
  const desiredSetupRequired = setupRequired && desiredPending;

  if (row.mfa_pending !== desiredPending || row.mfa_setup_required !== desiredSetupRequired) {
    await db.query(
      "update public.sessions set mfa_pending = $2, mfa_setup_required = $3, mfa_verified_at = $4 where id = $1",
      [row.id, desiredPending, desiredSetupRequired, desiredPending ? null : (row.mfa_verified_at || new Date().toISOString())]
    ).catch(() => {});
  }

  // Keep profiles.two_factor_enabled in sync with real 2FA state.
  await db
    .query(
      "update public.profiles set two_factor_enabled = $2 where user_id = $1 and coalesce(two_factor_enabled, false) <> $2",
      [row.user_id, enabled]
    )
    .catch(() => {});

  return {
    sessionId: row.id,
    user: toAuthUser(userRow as any),
    role,
    expiresAtIso: row.expires_at,
    mfa: { pending: desiredPending, setupRequired: desiredSetupRequired },
  };
}

function setSessionCookie(reply: FastifyReply, env: Env, token: string) {
  reply.setCookie(env.COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SAMESITE,
    path: "/",
    maxAge: env.SESSION_DAYS * 24 * 60 * 60
  });
}

function clearSessionCookie(reply: FastifyReply, env: Env) {
  reply.clearCookie(env.COOKIE_NAME, { path: "/" });
}

export async function registerAuth(app: FastifyInstance, db: Db, env: Env) {
  // Attach auth context (if cookie present)
  app.addHook("preHandler", async (req, reply) => {
    const token = (req.cookies as any)?.[env.COOKIE_NAME];
    if (token) {
      // Supabase recovery flow compatibility: if URL hash is used, frontend will call updateUser with a recovery token.
      const trustToken = String((req.cookies as any)?.[MFA_TRUST_COOKIE] || "");
      const loaded = await loadSession(db, env, String(token), trustToken);
      if (loaded) {
        req.auth = {
          user: loaded.user,
          role: loaded.role,
          sessionId: loaded.sessionId,
          mfa: loaded.mfa,
        };
      }
    }

    // Demo open access (no cookie): treat requests as authenticated based on the requested role.
    // This is enabled ONLY in api_demo via env.DEMO_OPEN_ACCESS.
    if (!req.auth) {
      if (!env.DEMO_OPEN_ACCESS) return;
    // Hard safety: even if someone misconfigures DEMO_OPEN_ACCESS, never enable it on prod DB/base URL.
    const dbName = String(env.PGDATABASE || process.env.PGDATABASE || "").toLowerCase();
    const baseHost = (() => {
      try { return new URL(env.PUBLIC_BASE_URL).hostname.toLowerCase(); } catch { return ""; }
    })();
    const safeDemoContext = dbName.includes("demo") || baseHost.startsWith("demo.");
      if (!safeDemoContext) return;
    const header = String((req.headers as any)["x-demo-role"] || "").trim().toLowerCase();
      if (!DEMO_ROLES.includes(header as any)) return;
    const role = header as DemoRole;

    let cached = demoUserCache.get(role);
    if (!cached) {
      const { userId } = await getOrCreateDemoUser(db, role);
      cached = { userId };
      demoUserCache.set(role, cached);
    }

    const userRow = await getUserById(db, cached.userId);
      if (!userRow) return;
      req.auth = {
        user: toAuthUser(userRow as any),
        role,
        sessionId: "demo-open-access",
        mfa: { pending: false, setupRequired: false },
      };
      return;
    }

    // Enforce MFA for cookie-based sessions (server-side, no bypass)
    if (req.auth?.sessionId !== "demo-open-access" && req.auth?.mfa?.pending) {
      const raw = String(req.raw.url || req.url || "");
      const path = (raw.split("?")[0] || "").trim();
      const p = path.startsWith("/api") ? path.slice(4) : path;
      const allow =
        p === "/auth/session" ||
        p === "/auth/user" ||
        p === "/auth/sign-out" ||
        p === "/onboarding/member/access" ||
        p.startsWith("/auth/2fa");
      if (!allow) {
        const setup = Boolean(req.auth.mfa.setupRequired);
        return reply.code(403).send({
          error: {
            code: setup ? "AUTH_MFA_SETUP_REQUIRED" : "AUTH_MFA_REQUIRED",
            message: setup ? "Ative a autenticação de 2 fatores para continuar." : "Confirme seu código de 2 fatores para continuar.",
            setup_required: setup,
          }
        });
      }
    }
  });

  app.post("/auth/sign-up", async (req, reply) => {
    const body = z.object({
      email: z.string().email(),
      password: z.string().min(6),
      ["cf-turnstile-response"]: z.string().optional(),
      turnstile_token: z.string().optional(),
      options: z
        .object({
          data: z.object({ name: z.string().optional(), role: z.enum(["admin", "seller", "buyer"]).optional() }).optional(),
          emailRedirectTo: z.string().optional()
        })
        .optional()
    }).parse(req.body);
    await verifyTurnstileOrReject(
      req,
      reply,
      db,
      env,
      "/api/auth/sign-up",
      "signup_turnstile_failed",
      getTurnstileToken(body)
    );
    if (reply.sent) return;

    if (env.SIGNUP_DISABLED) {
      return reply.code(503).send({ error: { message: "Cadastro temporariamente indisponível. Tente novamente em alguns minutos.", code: "SIGNUP_DISABLED" } });
    }

    const email = body.email.trim().toLowerCase();
    const passwordHash = await bcrypt.hash(body.password, 10);
    const name = String(body.options?.data?.name ?? "").trim();
    if (name.length < 2 || name.length > 80) {
      logSecurityEvent(db, env, req, {
        route: "/api/auth/sign-up",
        eventType: "signup_invalid_name",
        code: "SIGNUP_INVALID_NAME",
        meta: { nameLength: name.length },
      }).catch(() => {});
      return reply.code(422).send({ error: { message: "Nome é obrigatório (mín. 2 caracteres).", code: "AUTH_NAME_REQUIRED" } });
    }
    const authPolicy = await getPlatformAuthPolicy(db).catch(() => ({
      emailVerificationRequired: true,
      twoFactorRequired: false,
    }));

    // Hardening: when email verification is mandatory, seller sign-up is staged as buyer
    // until the e-mail is confirmed. If verification is disabled, requested seller can
    // be provisioned directly.
    const requestedRole = body.options?.data?.role;
    const requestedSeller = requestedRole === "seller";
    const role: "buyer" | "seller" =
      requestedSeller && !authPolicy.emailVerificationRequired ? "seller" : "buyer";
    if (requestedRole && requestedRole !== "buyer" && role !== "seller") {
      logSecurityEvent(db, env, req, {
        route: "/api/auth/sign-up",
        eventType: "signup_role_ignored",
        code: "SIGNUP_ROLE_IGNORED",
        meta: { requestedRole },
      }).catch(() => {});
    }

    const existing = await getUserByEmail(db, email);
    if (existing) {
      return reply.code(400).send({ error: { message: "E-mail já cadastrado.", code: "AUTH_EMAIL_EXISTS" } });
    }

    const rawMeta: any = { name, role };
    if (requestedSeller && authPolicy.emailVerificationRequired) rawMeta.requested_role = "seller";

    const insert = await db.query<{ id: string }>(
      "insert into public.users(email, password_hash, email_verified, raw_user_meta_data) values ($1, $2, $3, $4) returning id",
      [email, passwordHash, authPolicy.emailVerificationRequired ? false : true, JSON.stringify(rawMeta)]
    );
    const userId = insert.rows[0]!.id;

    await db.query(
      "insert into public.profiles(user_id, name) values ($1, $2) on conflict (user_id) do update set name = excluded.name",
      [userId, name]
    );
    await db.query("insert into public.user_roles(user_id, role) values ($1, $2) on conflict do nothing", [userId, role]);
    await attachProductEntitlementsToUser(db, userId, email).catch(() => {});
    await queueAccountCreatedEmail(db, {
      userId,
      email,
      userName: name,
    });

    if (authPolicy.emailVerificationRequired) {
      // Email verification (token + outbox job)
      const verificationToken = nanoid(48);
      const verificationTokenHash = hashToken(verificationToken);
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h
      await db.query(
        "insert into public.email_verification_tokens(user_id, token_hash, expires_at) values ($1, $2, $3)",
        [userId, verificationTokenHash, expiresAt.toISOString()]
      );

      const redirectTo =
        safeRedirectUrl(body.options?.emailRedirectTo, env.PUBLIC_BASE_URL) ||
        defaultEmailVerifiedRedirect(env.PUBLIC_BASE_URL, requestedSeller ? "seller" : role);
      const verifyLink = `${env.PUBLIC_BASE_URL.replace(/\/+$/, "")}/api/auth/verify-email?token=${encodeURIComponent(verificationToken)}&redirectTo=${encodeURIComponent(redirectTo)}`;

      const queued = await enqueueTemplatedEmail(db, {
        to: email,
        eventKey: "email_verification",
        vars: { user_name: name || "usuário", verify_link: verifyLink },
        dedupeKey: `email_verification:${userId}:${email}`,
        campaignId: null,
      });

      if (!queued.ok || (queued.ok && queued.queued === false)) {
        // Keep the system consistent: if we can't queue the verification email, delete the user we just created.
        await db.query("delete from public.users where id = $1", [userId]).catch(() => {});
        const reason = queued.ok ? queued.reason : queued.error;
        return reply.code(400).send({ error: { message: `Não foi possível enviar e-mail de verificação (${reason}).`, code: "EMAIL_VERIFICATION_NOT_SENT" } });
      }
    }

    // Supabase signUp does not auto-login by default; keep the same behavior.
    return reply.send({
      data: {
        user: { id: userId, email, user_metadata: { name, role } },
        requires_email_verification: authPolicy.emailVerificationRequired,
      },
      error: null,
    });
  });

  // Public: verify email via token, then redirect to a safe URL.
  app.get("/auth/verify-email", async (req, reply) => {
    const q = z.object({
      token: z.string().min(10),
      redirectTo: z.string().optional(),
    }).parse(req.query);

    const tokenHash = hashToken(q.token);
    const res = await db.query<{ user_id: string; expires_at: string; used_at: string | null }>(
      "select user_id, expires_at, used_at from public.email_verification_tokens where token_hash = $1 limit 1",
      [tokenHash]
    );
    const row = res.rows[0];
    if (!row || row.used_at || new Date(row.expires_at).getTime() < Date.now()) {
      return reply.code(400).send({ error: { message: "Link inválido ou expirado.", code: "AUTH_EMAIL_VERIFY_INVALID" } });
    }

    await db.query("update public.users set email_verified = true where id = $1", [row.user_id]);
    await db.query("update public.email_verification_tokens set used_at = now() where token_hash = $1", [tokenHash]);
    const verifiedUser = await getUserById(db, row.user_id);
    if (verifiedUser) {
      await attachProductEntitlementsToUser(db, row.user_id, verifiedUser.email).catch(() => {});
    }

    // Optional: if the user requested seller role at signup, promote now (verified email is required).
    try {
      const userRes = await db.query<{ raw_user_meta_data: any }>(
        "select raw_user_meta_data from public.users where id = $1 limit 1",
        [row.user_id]
      );
      const meta = (userRes.rows[0] as any)?.raw_user_meta_data || {};
      const wantsSeller = String((meta as any)?.requested_role || "") === "seller";
      const currentRole = await getUserRole(db, row.user_id);
      if (wantsSeller && currentRole !== "admin") {
        await db.query("delete from public.user_roles where user_id = $1", [row.user_id]);
        await db.query("insert into public.user_roles(user_id, role) values ($1, 'seller')", [row.user_id]);
        const nextMeta = { ...(meta || {}), role: "seller" };
        delete (nextMeta as any).requested_role;
        await db.query("update public.users set raw_user_meta_data = $2 where id = $1", [row.user_id, JSON.stringify(nextMeta)]);
      }
    } catch {
      // ignore - promotion is best-effort
    }

    const redirect = safeRedirectUrl(q.redirectTo, env.PUBLIC_BASE_URL) || defaultEmailVerifiedRedirect(env.PUBLIC_BASE_URL, null);
    return reply.redirect(redirect);
  });

  // Authenticated: upgrade current user to seller (requires verified email).
  app.post("/auth/become-seller", async (req, reply) => {
    requireAuth(req, reply);
    const userId = req.auth.user.id;
    const authPolicy = await getPlatformAuthPolicy(db).catch(() => ({
      emailVerificationRequired: true,
      twoFactorRequired: false,
    }));

    const res = await db.query<{ email_verified: boolean; raw_user_meta_data: any }>(
      "select email_verified, raw_user_meta_data from public.users where id = $1 limit 1",
      [userId]
    );
    const row = res.rows[0];
    if (!row) return reply.code(404).send({ error: { message: "Usuário não encontrado.", code: "AUTH_USER_NOT_FOUND" } });
    if (authPolicy.emailVerificationRequired && !row.email_verified) {
      return reply.code(403).send({ error: { message: "Confirme seu e-mail antes de virar vendedor.", code: "AUTH_EMAIL_NOT_VERIFIED" } });
    }

    const currentRole = await getUserRole(db, userId);
    if (currentRole === "admin") return reply.code(403).send({ error: { message: "Operação não permitida.", code: "FORBIDDEN" } });
    if (currentRole === "seller") return reply.send({ data: { ok: true, role: "seller" }, error: null });

    await db.query("delete from public.user_roles where user_id = $1", [userId]);
    await db.query("insert into public.user_roles(user_id, role) values ($1, 'seller')", [userId]);

    const meta = row.raw_user_meta_data || {};
    const nextMeta = { ...(meta || {}), role: "seller" };
    delete (nextMeta as any).requested_role;
    await db.query("update public.users set raw_user_meta_data = $2 where id = $1", [userId, JSON.stringify(nextMeta)]);

    return reply.send({ data: { ok: true, role: "seller" }, error: null });
  });

  app.post("/auth/sign-in-with-password", async (req, reply) => {
    const body = z.object({
      email: z.string().email(),
      password: z.string().min(1),
      use_trusted_device: z.boolean().optional(),
      ["cf-turnstile-response"]: z.string().optional(),
      turnstile_token: z.string().optional(),
    }).parse(req.body);
    await verifyTurnstileOrReject(
      req,
      reply,
      db,
      env,
      "/api/auth/sign-in-with-password",
      "signin_turnstile_failed",
      getTurnstileToken(body)
    );
    if (reply.sent) return;

    const email = body.email.trim().toLowerCase();

    const user = await getUserByEmail(db, email);
    if (!user || user.disabled) {
      return reply.code(400).send({ error: { message: "Credenciais inválidas.", code: "AUTH_INVALID" } });
    }
    const authPolicy = await getPlatformAuthPolicy(db).catch(() => ({
      emailVerificationRequired: true,
      twoFactorRequired: false,
    }));

    // Enforce email verification for non-admin users.
    if (authPolicy.emailVerificationRequired && !user.email_verified) {
      const role = await getUserRole(db, user.id);
      if (role !== "admin") {
        return reply.code(403).send({ error: { message: "Confirme seu e-mail antes de fazer login.", code: "AUTH_EMAIL_NOT_VERIFIED" } });
      }
    }

    const ok = await bcrypt.compare(body.password, user.password_hash);
    if (!ok) {
      return reply.code(400).send({ error: { message: "Credenciais inválidas.", code: "AUTH_INVALID" } });
    }

    const role = await getUserRole(db, user.id);
    await attachProductEntitlementsToUser(db, user.id, email).catch(() => {});
    const trustToken = String((req.cookies as any)?.[MFA_TRUST_COOKIE] || "");
    const twoFactor = await getTwoFactorRow(db, user.id).catch(() => null);
    const enabled = Boolean(twoFactor?.enabled);
    const mandatory = isTwoFactorMandatory(env, role, authPolicy);
    const setupRequired = mandatory && !enabled;
    let pending = false;
    if (enabled) pending = true;
    else if (setupRequired) pending = true;
    // Trusted-device bypass happens ONLY when user opts-in at login.
    if (pending && enabled && trustToken && body.use_trusted_device) {
      const trustedId = await getTrustedDeviceId(db, user.id, trustToken).catch(() => null);
      if (trustedId) pending = false;
    }

    await db
      .query(
        "update public.profiles set two_factor_enabled = $2 where user_id = $1 and coalesce(two_factor_enabled, false) <> $2",
        [user.id, enabled]
      )
      .catch(() => {});

    const { session, cookieToken } = await createSession(db, env, user.id, {
      mfaPending: pending,
      mfaSetupRequired: setupRequired && pending,
      mfaVerifiedAt: pending ? null : new Date(),
    });
    setSessionCookie(reply, env, cookieToken);
    return reply.send({ data: { session }, error: null });
  });

  app.post("/auth/sign-out", async (req, reply) => {
    const token = (req.cookies as any)?.[env.COOKIE_NAME];
    if (token) await deleteSessionByToken(db, String(token));
    clearSessionCookie(reply, env);
    return reply.send({ data: {}, error: null });
  });

  // Authenticated: start 2FA setup (generates pending secret and returns otpauth URI).
  app.post("/auth/2fa/setup/start", async (req, reply) => {
    requireAuth(req, reply);
    if (req.auth.sessionId === "demo-open-access") return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Not found" } });

    const userId = req.auth.user.id;
    const email = String(req.auth.user.email || "").trim();
    await ensureTwoFactorRow(db, userId);

    const current = await getTwoFactorRow(db, userId);
    // Safety: don't rotate secrets automatically if 2FA is already enabled.
    if (current?.enabled && !current.pending_secret_ciphertext) {
      return reply.code(409).send({ error: { code: "MFA_ALREADY_ENABLED", message: "2FA já está ativo para esta conta." } });
    }
    // If there is an existing pending secret, reuse it (avoid accidental churn).
    if (current?.pending_secret_ciphertext && current.pending_secret_iv && current.pending_secret_tag) {
      const pending = decryptJson(env.MASTER_KEY, {
        ciphertext: current.pending_secret_ciphertext,
        iv: current.pending_secret_iv,
        tag: current.pending_secret_tag,
      });
      const secretBase32 = String(pending?.secret_base32 || "").trim();
      if (secretBase32) {
        const otpauth = buildOtpAuthUri({ issuer: MFA_ISSUER, accountName: email, secretBase32 });
        return reply.send({ data: { otpauth_uri: otpauth, secret_base32: secretBase32, issuer: MFA_ISSUER, account_name: email }, error: null });
      }
    }

    const secretBase32 = generateTotpSecretBase32(20);
    const enc = encryptJson(env.MASTER_KEY, { secret_base32: secretBase32 });
    await db.query(
      `update public.user_two_factor
       set pending_secret_ciphertext = $2, pending_secret_iv = $3, pending_secret_tag = $4, pending_created_at = now()
       where user_id = $1`,
      [userId, enc.ciphertext, enc.iv, enc.tag]
    );

    const otpauth = buildOtpAuthUri({ issuer: MFA_ISSUER, accountName: email, secretBase32 });
    return reply.send({ data: { otpauth_uri: otpauth, secret_base32: secretBase32, issuer: MFA_ISSUER, account_name: email }, error: null });
  });

  // Authenticated: confirm 2FA setup (verifies code, enables 2FA, returns recovery codes once).
  app.post("/auth/2fa/setup/confirm", async (req, reply) => {
    requireAuth(req, reply);
    if (req.auth.sessionId === "demo-open-access") return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Not found" } });

    const body = z.object({
      code: z.string().min(6),
      remember_device: z.boolean().optional(),
    }).parse(req.body);

    const userId = req.auth.user.id;
    const tf = await getTwoFactorRow(db, userId);
    if (!tf || !tf.pending_secret_ciphertext || !tf.pending_secret_iv || !tf.pending_secret_tag) {
      return reply.code(400).send({ error: { code: "MFA_SETUP_NOT_STARTED", message: "Inicie a configuração do 2FA primeiro." } });
    }
    const pending = decryptJson(env.MASTER_KEY, { ciphertext: tf.pending_secret_ciphertext, iv: tf.pending_secret_iv, tag: tf.pending_secret_tag });
    const secretBase32 = String(pending?.secret_base32 || "").trim();
    if (!secretBase32) {
      return reply.code(400).send({ error: { code: "MFA_SETUP_INVALID", message: "Configuração inválida. Gere um novo QR Code." } });
    }

    const ok = verifyTotp(body.code, secretBase32, { window: 1 });
    if (!ok) {
      return reply.code(400).send({ error: { code: "MFA_INVALID_CODE", message: "Código inválido." } });
    }

    // Enable 2FA: move pending secret to active secret
    await db.query(
      `update public.user_two_factor
       set enabled = true,
           secret_ciphertext = pending_secret_ciphertext,
           secret_iv = pending_secret_iv,
           secret_tag = pending_secret_tag,
           pending_secret_ciphertext = null,
           pending_secret_iv = null,
           pending_secret_tag = null,
           pending_created_at = null,
           enabled_at = now(),
           last_verified_at = now()
       where user_id = $1`,
      [userId]
    );
    await db.query("update public.profiles set two_factor_enabled = true where user_id = $1", [userId]).catch(() => {});

    // Regenerate recovery codes
    await db.query("delete from public.user_two_factor_recovery_codes where user_id = $1", [userId]).catch(() => {});
    const recoveryCodes = generateRecoveryCodes(10);
    for (const c of recoveryCodes) {
      const h = hashRecoveryCode(env, c);
      await db.query("insert into public.user_two_factor_recovery_codes(user_id, code_hash) values ($1, $2) on conflict do nothing", [userId, h]);
    }

    // Mark current session as verified
    await markSessionMfaVerified(db, req.auth.sessionId);

    if (body.remember_device) {
      const device = await createTrustedDevice(db, env, req, userId);
      setMfaTrustCookie(reply, env, device.token);
    }

    return reply.send({ data: { ok: true, recovery_codes: recoveryCodes }, error: null });
  });

  // Authenticated: verify 2FA challenge for the current session.
  app.post("/auth/2fa/verify", async (req, reply) => {
    requireAuth(req, reply);
    if (req.auth.sessionId === "demo-open-access") return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Not found" } });

    const body = z.object({
      code: z.string().optional(),
      recovery_code: z.string().optional(),
      remember_device: z.boolean().optional(),
    }).parse(req.body);

    const userId = req.auth.user.id;
    const tf = await getTwoFactorRow(db, userId);
    if (!tf || !tf.enabled || !tf.secret_ciphertext || !tf.secret_iv || !tf.secret_tag) {
      return reply.code(400).send({ error: { code: "MFA_NOT_ENABLED", message: "2FA não está ativo para esta conta." } });
    }

    const active = decryptJson(env.MASTER_KEY, { ciphertext: tf.secret_ciphertext, iv: tf.secret_iv, tag: tf.secret_tag });
    const secretBase32 = String(active?.secret_base32 || "").trim();
    if (!secretBase32) {
      return reply.code(400).send({ error: { code: "MFA_INVALID_STATE", message: "2FA inválido. Reconfigure o autenticador." } });
    }

    const code = String(body.code || "").trim();
    const recovery = String(body.recovery_code || "").trim();
    let verified = false;

    if (code) {
      verified = verifyTotp(code, secretBase32, { window: 1 });
    } else if (recovery) {
      const h = hashRecoveryCode(env, recovery);
      const used = await db.query<{ id: string }>(
        "update public.user_two_factor_recovery_codes set used_at = now() where user_id = $1 and code_hash = $2 and used_at is null returning id",
        [userId, h]
      );
      verified = !!used.rows[0];
    }

    if (!verified) {
      return reply.code(400).send({ error: { code: "MFA_INVALID_CODE", message: "Código inválido." } });
    }

    await markSessionMfaVerified(db, req.auth.sessionId);
    await db.query("update public.user_two_factor set last_verified_at = now() where user_id = $1", [userId]).catch(() => {});

    if (body.remember_device) {
      const device = await createTrustedDevice(db, env, req, userId);
      setMfaTrustCookie(reply, env, device.token);
    }

    return reply.send({ data: { ok: true }, error: null });
  });

  // Authenticated: regenerate recovery codes (requires a valid TOTP code).
  app.post("/auth/2fa/recovery/regenerate", async (req, reply) => {
    requireAuth(req, reply);
    if (req.auth.sessionId === "demo-open-access") return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Not found" } });

    const body = z.object({ code: z.string().min(6) }).parse(req.body);
    const userId = req.auth.user.id;
    const tf = await getTwoFactorRow(db, userId);
    if (!tf || !tf.enabled || !tf.secret_ciphertext || !tf.secret_iv || !tf.secret_tag) {
      return reply.code(400).send({ error: { code: "MFA_NOT_ENABLED", message: "2FA não está ativo para esta conta." } });
    }
    const active = decryptJson(env.MASTER_KEY, { ciphertext: tf.secret_ciphertext, iv: tf.secret_iv, tag: tf.secret_tag });
    const secretBase32 = String(active?.secret_base32 || "").trim();
    if (!secretBase32) return reply.code(400).send({ error: { code: "MFA_INVALID_STATE", message: "2FA inválido." } });
    if (!verifyTotp(body.code, secretBase32, { window: 1 })) {
      return reply.code(400).send({ error: { code: "MFA_INVALID_CODE", message: "Código inválido." } });
    }

    await db.query("delete from public.user_two_factor_recovery_codes where user_id = $1", [userId]).catch(() => {});
    const recoveryCodes = generateRecoveryCodes(10);
    for (const c of recoveryCodes) {
      const h = hashRecoveryCode(env, c);
      await db.query("insert into public.user_two_factor_recovery_codes(user_id, code_hash) values ($1, $2) on conflict do nothing", [userId, h]);
    }
    await db.query("update public.user_two_factor set last_verified_at = now() where user_id = $1", [userId]).catch(() => {});
    return reply.send({ data: { recovery_codes: recoveryCodes }, error: null });
  });

  // Authenticated: disable 2FA (optional by default; enforcement can be turned on via env).
  app.post("/auth/2fa/disable", async (req, reply) => {
    requireAuth(req, reply);
    if (req.auth.sessionId === "demo-open-access") return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Not found" } });

    const body = z.object({ code: z.string().optional(), recovery_code: z.string().optional() }).parse(req.body);
    const userId = req.auth.user.id;
    const tf = await getTwoFactorRow(db, userId);
    if (!tf || !tf.enabled || !tf.secret_ciphertext || !tf.secret_iv || !tf.secret_tag) {
      return reply.code(400).send({ error: { code: "MFA_NOT_ENABLED", message: "2FA não está ativo." } });
    }
    const active = decryptJson(env.MASTER_KEY, { ciphertext: tf.secret_ciphertext, iv: tf.secret_iv, tag: tf.secret_tag });
    const secretBase32 = String(active?.secret_base32 || "").trim();
    if (!secretBase32) return reply.code(400).send({ error: { code: "MFA_INVALID_STATE", message: "2FA inválido." } });

    const code = String(body.code || "").trim();
    const recovery = String(body.recovery_code || "").trim();
    let verified = false;
    if (code) verified = verifyTotp(code, secretBase32, { window: 1 });
    else if (recovery) {
      const h = hashRecoveryCode(env, recovery);
      const used = await db.query<{ id: string }>(
        "update public.user_two_factor_recovery_codes set used_at = now() where user_id = $1 and code_hash = $2 and used_at is null returning id",
        [userId, h]
      );
      verified = !!used.rows[0];
    }
    if (!verified) return reply.code(400).send({ error: { code: "MFA_INVALID_CODE", message: "Código inválido." } });

    await db.query(
      `update public.user_two_factor
       set enabled = false,
           secret_ciphertext = null, secret_iv = null, secret_tag = null,
           pending_secret_ciphertext = null, pending_secret_iv = null, pending_secret_tag = null,
           pending_created_at = null
       where user_id = $1`,
      [userId]
    );
    await db.query("delete from public.user_two_factor_recovery_codes where user_id = $1", [userId]).catch(() => {});
    await db.query("delete from public.user_two_factor_trusted_devices where user_id = $1", [userId]).catch(() => {});
    await db.query("update public.profiles set two_factor_enabled = false where user_id = $1", [userId]).catch(() => {});
    await db.query("update public.sessions set mfa_pending = false, mfa_setup_required = false where user_id = $1 and revoked_at is null", [userId]).catch(() => {});

    return reply.send({ data: { ok: true }, error: null });
  });

  // Demo-only: create a session for a deterministic demo user (role-based), without requiring a password.
  // Guarded by env flag so it can never be enabled accidentally in production.
  app.post("/auth/demo-session", async (req, reply) => {
    if (!env.DEMO_OPEN_ACCESS) {
      return reply.code(404).send({ error: { message: "Not found", code: "NOT_FOUND" } });
    }
    const dbName = String(env.PGDATABASE || process.env.PGDATABASE || "").toLowerCase();
    const baseHost = (() => {
      try { return new URL(env.PUBLIC_BASE_URL).hostname.toLowerCase(); } catch { return ""; }
    })();
    const safeDemoContext = dbName.includes("demo") || baseHost.startsWith("demo.");
    if (!safeDemoContext) return reply.code(404).send({ error: { message: "Not found", code: "NOT_FOUND" } });

    const body = z.object({ role: z.enum(["admin", "seller", "buyer"]) }).parse(req.body);
    const role = body.role;

    const { userId } = await getOrCreateDemoUser(db, role);

    // Revoke any previous active sessions for this demo user to keep the demo DB clean.
    await db.query("update public.sessions set revoked_at = now() where user_id = $1 and revoked_at is null", [userId]);

    const { session, cookieToken } = await createSession(db, env, userId);
    setSessionCookie(reply, env, cookieToken);
    return reply.send({ data: { session }, error: null });
  });

  // Demo-only: return the identity of the deterministic demo user for a given role (no cookie/session required).
  app.post("/auth/demo-identity", async (req, reply) => {
    if (!env.DEMO_OPEN_ACCESS) {
      return reply.code(404).send({ error: { message: "Not found", code: "NOT_FOUND" } });
    }

    const body = z.object({ role: z.enum(["admin", "seller", "buyer"]) }).parse(req.body);
    const role = body.role as DemoRole;

    let cached = demoUserCache.get(role);
    if (!cached) {
      const { userId } = await getOrCreateDemoUser(db, role);
      cached = { userId };
      demoUserCache.set(role, cached);
    }

    const userRow = await getUserById(db, cached.userId);
    if (!userRow) return reply.code(500).send({ error: { message: "Internal Server Error", code: "INTERNAL_ERROR" } });
    return reply.send({ data: { user: toAuthUser(userRow as any), role }, error: null });
  });

  app.get("/auth/session", async (req) => {
    const token = (req.cookies as any)?.[env.COOKIE_NAME];
    if (!token) return { data: { session: null }, error: null };
    const trustToken = String((req.cookies as any)?.[MFA_TRUST_COOKIE] || "");
    const loaded = await loadSession(db, env, String(token), trustToken);
    if (!loaded) return { data: { session: null }, error: null };
    const expiresAtUnix = Math.floor(new Date(loaded.expiresAtIso).getTime() / 1000);
    return {
      data: {
        session: {
          access_token: String(token),
          user: loaded.user,
          expires_at: expiresAtUnix,
          mfa_pending: loaded.mfa.pending,
          mfa_setup_required: loaded.mfa.setupRequired,
        },
      },
      error: null,
    };
  });

  app.get("/auth/user", async (req, reply) => {
    if (!req.auth) return reply.code(401).send({ error: { message: "Unauthorized", code: "AUTH_UNAUTHORIZED" } });
    return reply.send({ data: { user: req.auth.user }, error: null });
  });

  // Supabase-compatible: updateUser (used in reset password flow)
  app.post("/auth/update-user", async (req, reply) => {
    const body = z.object({
      password: z.string().min(6).optional(),
      recovery_token: z.string().min(10).optional(),
      ["cf-turnstile-response"]: z.string().optional(),
      turnstile_token: z.string().optional()
    }).parse(req.body);

    if (!body.password) return reply.send({ data: { user: null }, error: null });
    if (body.recovery_token) {
      await verifyTurnstileOrReject(
        req,
        reply,
        db,
        env,
        "/api/auth/update-user",
        "update_user_turnstile_failed",
        getTurnstileToken(body)
      );
      if (reply.sent) return;
    }

    if (body.recovery_token) {
      const tokenHash = hashToken(body.recovery_token);
      const res = await db.query<{ user_id: string; expires_at: string; used_at: string | null }>(
        "select user_id, expires_at, used_at from public.password_reset_tokens where token_hash = $1 limit 1",
        [tokenHash]
      );
      const row = res.rows[0];
      if (!row || row.used_at || new Date(row.expires_at).getTime() < Date.now()) {
        return reply.code(400).send({ error: { message: "Link inválido ou expirado.", code: "AUTH_RECOVERY_INVALID" } });
      }
      const passwordHash = await bcrypt.hash(body.password, 10);
      await db.query("update public.users set password_hash = $1 where id = $2", [passwordHash, row.user_id]);
      await db.query("update public.password_reset_tokens set used_at = now() where token_hash = $1", [tokenHash]);
      return reply.send({ data: { user: null }, error: null });
    }

    if (!req.auth) return reply.code(401).send({ error: { message: "Unauthorized", code: "AUTH_UNAUTHORIZED" } });
    const passwordHash = await bcrypt.hash(body.password, 10);
    await db.query("update public.users set password_hash = $1 where id = $2", [passwordHash, req.auth.user.id]);
    return reply.send({ data: { user: req.auth.user }, error: null });
  });

  // Supabase-compatible: resetPasswordForEmail
  app.post("/auth/reset-password-for-email", async (req, reply) => {
    const body = z.object({
      email: z.string().email(),
      ["cf-turnstile-response"]: z.string().optional(),
      turnstile_token: z.string().optional(),
      options: z.object({ redirectTo: z.string().optional() }).optional()
    }).parse(req.body);
    await verifyTurnstileOrReject(
      req,
      reply,
      db,
      env,
      "/api/auth/reset-password-for-email",
      "reset_password_turnstile_failed",
      getTurnstileToken(body)
    );
    if (reply.sent) return;

    const email = body.email.trim().toLowerCase();
    const user = await getUserByEmail(db, email);

    // Do not leak if email exists
    if (!user) return reply.send({ data: {}, error: null });

    const token = nanoid(48);
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1h
    await db.query(
      "insert into public.password_reset_tokens(user_id, token_hash, expires_at) values ($1, $2, $3)",
      [user.id, tokenHash, expiresAt.toISOString()]
    );

    const redirectTo = body.options?.redirectTo || `${env.PUBLIC_BASE_URL}/auth/reset`;
    const link = `${redirectTo}#type=recovery&token=${encodeURIComponent(token)}`;

    const name = String(user.raw_user_meta_data?.name || "").trim() || "usuário";

    const queued = await enqueueTemplatedEmail(db, {
      to: email,
      eventKey: "password_reset",
      vars: {
        user_name: name,
        reset_link: link,
      },
      dedupeKey: `password_reset:${user.id}:${tokenHash}`,
      campaignId: null,
    });
    if (!queued.ok || (queued.ok && queued.queued === false)) {
      return reply.code(400).send({ error: { message: "SMTP não configurado.", code: "SMTP_NOT_CONFIGURED" } });
    }

    return reply.send({ data: {}, error: null });
  });

  // Utility: check email exists (used by Forgot Password UI)
  app.post("/functions/check-email-exists", async (req) => {
    // Hardening: avoid user enumeration. Always return an indistinguishable response.
    // The real reset flow already does not leak existence in /auth/reset-password-for-email.
    z.object({ email: z.string().email().optional() }).parse(req.body);
    return { exists: true };
  });
}

export function requireAuth(req: FastifyRequest, reply: FastifyReply): asserts req is FastifyRequest & { auth: NonNullable<FastifyRequest["auth"]> } {
  if (!req.auth) {
    reply.code(401).send({ error: { message: "Unauthorized", code: "AUTH_UNAUTHORIZED" } });
    throw new Error("Unauthorized");
  }
}

export async function requireAdmin(db: Db, req: FastifyRequest, reply: FastifyReply): Promise<void> {
  requireAuth(req, reply);
  if (req.auth.role !== "admin") {
    reply.code(403).send({ error: { message: "Forbidden", code: "AUTH_FORBIDDEN" } });
    throw new Error("Forbidden");
  }
}
