import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import bcrypt from "bcryptjs";
import { z } from "zod";
import type { Db } from "./db.js";
import { decryptJson, encryptJson } from "./crypto.js";
import type { Env } from "./env.js";
import { requireAdmin } from "./auth.js";
import {
  enqueueOnboardingAccessEmail,
  getOnboardingAccessEmailSettings,
  saveOnboardingAccessEmailSettings,
  type OnboardingAccessEmailSettings,
} from "./onboardingAccessEmail.js";
import {
  ensureManualProductEntitlement,
  fetchActiveEntitlementCountsByEmail,
  hasActiveEntitlementByEmail,
} from "./productEntitlements.js";

const ADMIN_EMAIL = "admin@dingitalpay.com";
const SOURCE_PRODUCT_ID = "a5a0c1fa-7d47-403b-a262-47f07a93d3ec";
const PRO_UPDATES_PRODUCT_ID = "cbd62f45-4ece-4d5b-b88b-0896f7b57e0b";
const DEFAULT_PRODUCT_KEY = "dingitalpay-platform";
const STARTER_PLAN_NAME = "Starter";
const PRO_PLAN_NAME = "Pro";
const PRO_PLAN_PRICE_LABEL = "R$ 79,90/mês";
const ONBOARDING_MEMBER_COOKIE = "dingitalpay_onboarding_member";
const ONBOARDING_MEMBER_DAYS = 30;

type ProvisioningListRow = {
  licenseId: string;
  email: string;
  productKey: string;
  status: "active" | "revoked";
  planOverride?: "starter" | "pro" | null;
  updatesEnabled: boolean;
  maxActivations: number;
  activationsUsed: number;
  installToken: string | null;
  updateToken: string | null;
  onboardingPassword: string | null;
  installTokenExpiresAt: string | null;
  onboardingUrl: string | null;
  createdAt: string;
  revokedAt: string | null;
  lastActivationAt: string | null;
};

type ProvisioningListResp = {
  ok: boolean;
  rows: ProvisioningListRow[];
};

type ProvisioningIssueResp = {
  ok: boolean;
  licenseId: string;
  installToken: string;
  updateToken: string;
  onboardingPassword: string;
  installTokenExpiresAt: string;
  onboardingUrl: string;
};

type ProvisioningRotateInstallResp = {
  ok: boolean;
  licenseId: string;
  installToken: string;
  installTokenExpiresAt: string;
  onboardingUrl: string;
};

type ProvisioningRotateUpdateResp = {
  ok: boolean;
  licenseId: string;
  email: string;
  productKey: string;
  updateToken: string;
  previousUpdateTokenValidUntil?: string;
};

type ProvisioningToggleUpdatesResp = {
  ok: boolean;
  licenseId: string;
  enabled: boolean;
};

type ProvisioningSimpleResp = {
  ok: boolean;
  licenseId: string;
};

type ProvisioningEnsureResp = {
  ok: boolean;
  created: boolean;
  licenseId: string;
  installToken: string | null;
  updateToken: string | null;
  onboardingPassword: string | null;
  installTokenExpiresAt: string | null;
  onboardingUrl: string | null;
};

type ProvisioningVerifyResp = {
  ok: boolean;
  license: ProvisioningListRow | null;
};

type ProvisioningReleaseListResp = {
  ok: boolean;
  productKey: string;
  releases: Array<{ version: string; created_at: string }>;
};

type OnboardingMemberKind = "admin" | "customer";

type OnboardingMemberSession = {
  email: string;
  kind: OnboardingMemberKind;
  productKey: string;
  exp: number;
};

type OnboardingProgressPayload = {
  baseDomain: string;
  vpsIp: string;
  appSubdomain: string;
  installToken: string;
  currentStep: number;
  dnsConfirmed: boolean;
  installGenerated: boolean;
  installConfirmed: boolean;
  verifyConfirmed: boolean;
};

type OnboardingProgressStatus = "not_started" | "in_progress" | "completed" | "reset";

type PlanCode = "starter" | "pro" | "manual";

type PlanEntitlement = {
  email: string;
  starterOrdersCount: number;
  proOrdersCount: number;
  planCode: PlanCode;
  planName: string;
  updatesIncluded: boolean;
  supportIncluded: boolean;
  upgradeRequired: boolean;
  upgradeUrl: string | null;
};

type OnboardingProgressRecord = {
  id?: string | null;
  sessionKind: OnboardingMemberKind;
  email: string;
  productKey: string;
  licenseId: string | null;
  currentStep: number;
  status: OnboardingProgressStatus;
  schemaVersion: number;
  progress: OnboardingProgressPayload;
  lastClientSavedAt: string | null;
  completedAt: string | null;
  updatedAt: string | null;
};

type OnboardingAccessEmailTestResult = {
  settings: OnboardingAccessEmailSettings;
  result: { ok: boolean; queued: boolean; reason?: string; error?: string };
};

type OnboardingSetupFormStatus = "draft" | "submitted";

type OnboardingSetupFormPayload = {
  brandName: string;
  hasLogo: "" | "sim" | "nao";
  logoFileName: string;
  hasColorPalette: "" | "sim" | "nao";
  primaryColor: string;
  secondaryColor: string;
  hasOwnDomain: "" | "sim" | "nao";
  existingDomain: string;
  desiredDomain: string;
  hasVps: "" | "sim" | "nao";
  vpsProvider: string;
  hasDomainPanelAccess: "" | "sim" | "nao";
  technicalOwnerName: string;
  noTechnicalOwnerYet: boolean;
  hasMpOrKipay: "" | "sim" | "nao" | "outra_adquirente";
  initialAcquirer: string;
  hasAcquirerDocs: "" | "sim" | "nao";
  acquirerDocsLink: string;
  adminEmail: string;
  adminName: string;
  teamNeedsAccess: string;
  wantsLegalAndBrandingReady: "" | "sim" | "nao";
  extraCustomization: string;
  goalProfile: "" | "validar_rapido" | "operacao_completa";
};

type OnboardingSetupFormAdminRow = {
  id: string;
  draftKey: string;
  status: OnboardingSetupFormStatus;
  schemaVersion: number;
  brandName: string | null;
  desiredDomain: string | null;
  adminEmail: string | null;
  logo: {
    fileName: string;
    contentType: string;
    sizeBytes: number;
  } | null;
  payload: OnboardingSetupFormPayload;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type OnboardingSetupFormLogoDownloadRow = {
  logo_file_name: string | null;
  logo_content_type: string | null;
  logo_data_base64: string | null;
};

const ONBOARDING_PROGRESS_SCHEMA_VERSION = 1;
const ONBOARDING_SETUP_FORM_SCHEMA_VERSION = 1;

const OnboardingProgressPayloadSchema = z.object({
  baseDomain: z.string().max(255).default(""),
  vpsIp: z.string().max(64).default(""),
  appSubdomain: z.string().max(100).default("app"),
  installToken: z.string().max(255).default(""),
  currentStep: z.coerce.number().int().min(0).max(4).default(0),
  dnsConfirmed: z.coerce.boolean().default(false),
  installGenerated: z.coerce.boolean().default(false),
  installConfirmed: z.coerce.boolean().default(false),
  verifyConfirmed: z.coerce.boolean().default(false),
});

const OnboardingProgressSaveSchema = z.object({
  progress: OnboardingProgressPayloadSchema,
  clientSavedAt: z.string().datetime().optional(),
});

const OnboardingSetupFormPayloadSchema = z.object({
  brandName: z.string().max(255).default(""),
  hasLogo: z.enum(["", "sim", "nao"]).default(""),
  logoFileName: z.string().max(255).default(""),
  hasColorPalette: z.enum(["", "sim", "nao"]).default(""),
  primaryColor: z.string().max(32).default("#00E6B8"),
  secondaryColor: z.string().max(32).default("#0B1210"),
  hasOwnDomain: z.enum(["", "sim", "nao"]).default(""),
  existingDomain: z.string().max(255).default(""),
  desiredDomain: z.string().max(255).default(""),
  hasVps: z.enum(["", "sim", "nao"]).default(""),
  vpsProvider: z.string().max(255).default(""),
  hasDomainPanelAccess: z.enum(["", "sim", "nao"]).default(""),
  technicalOwnerName: z.string().max(255).default(""),
  noTechnicalOwnerYet: z.coerce.boolean().default(false),
  hasMpOrKipay: z.enum(["", "sim", "nao", "outra_adquirente"]).default(""),
  initialAcquirer: z.string().max(255).default(""),
  hasAcquirerDocs: z.enum(["", "sim", "nao"]).default(""),
  acquirerDocsLink: z.string().max(1000).default(""),
  adminEmail: z.string().max(255).default(""),
  adminName: z.string().max(255).default(""),
  teamNeedsAccess: z.string().max(4000).default(""),
  wantsLegalAndBrandingReady: z.enum(["", "sim", "nao"]).default(""),
  extraCustomization: z.string().max(4000).default(""),
  goalProfile: z.enum(["", "validar_rapido", "operacao_completa"]).default(""),
});

function provisioningConfig(env: Env): { baseUrl: string; token: string } | null {
  const baseUrl = String(env.PROVISIONING_INTERNAL_BASE_URL || "http://provisioning:4010").trim();
  const token = String(env.PROVISIONING_INTERNAL_API_TOKEN || "").trim();
  if (!token) return null;
  return { baseUrl: baseUrl.replace(/\/+$/, ""), token };
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<{ ok: boolean; status: number; json: T | null }> {
  const res = await fetch(url, init);
  let json: T | null = null;
  try {
    json = (await res.json()) as T;
  } catch {
    json = null;
  }
  return { ok: res.ok, status: res.status, json };
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let index = 0;
  const workers = Array.from({ length: Math.max(1, limit) }, async () => {
    while (true) {
      const current = index++;
      if (current >= items.length) break;
      out[current] = await fn(items[current]!);
    }
  });
  await Promise.all(workers);
  return out;
}

function setOnboardingMemberCookie(reply: FastifyReply, env: Env, payload: OnboardingMemberSession) {
  const encrypted = encryptJson(env.MASTER_KEY, payload);
  reply.setCookie(ONBOARDING_MEMBER_COOKIE, JSON.stringify(encrypted), {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SAMESITE,
    path: "/",
    maxAge: ONBOARDING_MEMBER_DAYS * 24 * 60 * 60,
  });
}

function clearOnboardingMemberCookie(reply: FastifyReply, env: Env) {
  reply.clearCookie(ONBOARDING_MEMBER_COOKIE, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SAMESITE,
    path: "/",
  });
}

function readOnboardingMemberCookie(req: FastifyRequest, env: Env): OnboardingMemberSession | null {
  const raw = String((req.cookies as Record<string, string | undefined> | undefined)?.[ONBOARDING_MEMBER_COOKIE] || "").trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { ciphertext: string; iv: string; tag: string };
    const data = decryptJson(env.MASTER_KEY, parsed) as OnboardingMemberSession | null;
    if (!data?.email || !data.kind || !data.productKey || !data.exp) return null;
    if (Date.now() >= Number(data.exp || 0)) return null;
    return {
      email: String(data.email).trim().toLowerCase(),
      kind: data.kind,
      productKey: String(data.productKey).trim() || DEFAULT_PRODUCT_KEY,
      exp: Number(data.exp),
    };
  } catch {
    return null;
  }
}

async function getOnboardingAccess(db: Db, env: Env, email: string, kind: OnboardingMemberKind | null, productKey = DEFAULT_PRODUCT_KEY) {
  if (kind === "admin" && email === ADMIN_EMAIL) {
    return { allowed: true as const, kind: "admin" as const };
  }

  const paid = await hasActiveEntitlementByEmail(db, email, SOURCE_PRODUCT_ID);
  if (!paid) {
    return { allowed: false as const, kind: null };
  }

  try {
    const licences = await fetchProvisioningLicences(env, productKey, email);
    const activeLicence = licences.find((item) => item.email.toLowerCase() === email && item.status === "active") || null;
    if (activeLicence) {
      return { allowed: true as const, kind: "customer" as const };
    }
  } catch {
    // Provisioning availability is not the grant of access. With a valid entitlement,
    // keep the session logic alive and let the caller decide whether to re-ensure the license.
  }
  return { allowed: true as const, kind: "customer" as const };
}

async function requireOnboardingAdmin(db: Db, req: any, reply: any) {
  await requireAdmin(db, req, reply);
  const email = String(req.auth?.user?.email || "").trim().toLowerCase();
  if (email !== ADMIN_EMAIL) {
    return reply.code(403).send({ error: { code: "AUTH_FORBIDDEN", message: "Forbidden" } });
  }
  return null;
}

function buildProUpgradeUrl(env: Env, email?: string | null): string {
  const fallbackOrigin = "https://app.dingitalpay.com";
  let origin = fallbackOrigin;
  try {
    origin = new URL(env.PUBLIC_BASE_URL).origin;
  } catch {
    origin = fallbackOrigin;
  }

  const url = new URL(`/checkout/${PRO_UPDATES_PRODUCT_ID}`, origin);
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (normalizedEmail) url.searchParams.set("email", normalizedEmail);
  return url.toString();
}

function derivePlanEntitlement(email: string, starterOrdersCount: number, proOrdersCount: number, env: Env): PlanEntitlement {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (proOrdersCount > 0) {
    return {
      email: normalizedEmail,
      starterOrdersCount,
      proOrdersCount,
      planCode: "pro",
      planName: PRO_PLAN_NAME,
      updatesIncluded: true,
      supportIncluded: true,
      upgradeRequired: false,
      upgradeUrl: null,
    };
  }

  if (starterOrdersCount > 0) {
    return {
      email: normalizedEmail,
      starterOrdersCount,
      proOrdersCount,
      planCode: "starter",
      planName: STARTER_PLAN_NAME,
      updatesIncluded: false,
      supportIncluded: false,
      upgradeRequired: true,
      upgradeUrl: buildProUpgradeUrl(env, normalizedEmail),
    };
  }

  return {
    email: normalizedEmail,
    starterOrdersCount,
    proOrdersCount,
    planCode: "manual",
    planName: "Manual",
    updatesIncluded: false,
    supportIncluded: false,
    upgradeRequired: true,
    upgradeUrl: buildProUpgradeUrl(env, normalizedEmail),
  };
}

function applyPlanOverride(entitlement: PlanEntitlement, row: Pick<ProvisioningListRow, "planOverride"> | null | undefined, env: Env): PlanEntitlement {
  const override = row?.planOverride || null;
  if (override === "pro") {
    return {
      ...entitlement,
      planCode: "pro",
      planName: PRO_PLAN_NAME,
      updatesIncluded: true,
      supportIncluded: true,
      upgradeRequired: false,
      upgradeUrl: null,
    };
  }

  if (override === "starter") {
    return {
      ...entitlement,
      planCode: "starter",
      planName: STARTER_PLAN_NAME,
      updatesIncluded: false,
      supportIncluded: false,
      upgradeRequired: true,
      upgradeUrl: buildProUpgradeUrl(env, entitlement.email),
    };
  }

  return entitlement;
}

async function fetchPlanEntitlements(db: Db, env: Env, emails: string[]): Promise<Map<string, PlanEntitlement>> {
  const normalizedEmails = [...new Set(emails.map((email) => String(email || "").trim().toLowerCase()).filter(Boolean))];
  const out = new Map<string, PlanEntitlement>();
  if (normalizedEmails.length === 0) return out;

  const countsMap = await fetchActiveEntitlementCountsByEmail(db, normalizedEmails, [SOURCE_PRODUCT_ID, PRO_UPDATES_PRODUCT_ID]);
  const countsByEmail = new Map<string, { starter: number; pro: number }>();
  for (const email of normalizedEmails) countsByEmail.set(email, { starter: 0, pro: 0 });
  for (const [email, counts] of countsMap.entries()) {
    const current = countsByEmail.get(email) || { starter: 0, pro: 0 };
    current.starter = counts.get(SOURCE_PRODUCT_ID) || 0;
    current.pro = counts.get(PRO_UPDATES_PRODUCT_ID) || 0;
    countsByEmail.set(email, current);
  }

  for (const [email, counts] of countsByEmail.entries()) {
    out.set(email, derivePlanEntitlement(email, counts.starter, counts.pro, env));
  }

  return out;
}

async function syncProvisioningUpdatesEntitlement(env: Env, row: ProvisioningListRow, entitlement: PlanEntitlement) {
  if (row.status !== "active") return;
  if (Boolean(row.updatesEnabled) === Boolean(entitlement.updatesIncluded)) return;
  await buildProvisioningRequest(env, "/internal/licenses/ensure", {
    email: row.email,
    productKey: row.productKey,
    maxActivations: row.maxActivations || 1,
    sendEmail: false,
    mintInstallToken: false,
    updatesEnabled: entitlement.updatesIncluded,
  });
}

async function fetchProvisioningLicences(env: Env, productKey: string, email?: string) {
  const cfg = provisioningConfig(env);
  if (!cfg) throw new Error("PROVISIONING_NOT_CONFIGURED");
  const qs = new URLSearchParams({ productKey });
  if (email) qs.set("email", email);

  const res = await fetchJson<ProvisioningListResp>(`${cfg.baseUrl}/internal/licenses/list?${qs.toString()}`, {
    method: "GET",
    headers: { "x-internal-token": cfg.token },
  });

  if (!res.ok || !res.json?.ok) {
    const error: any = new Error("PROVISIONING_LIST_FAILED");
    error.statusCode = res.status || 502;
    throw error;
  }

  return res.json.rows || [];
}

function buildProvisioningRequest(env: Env, path: string, body: Record<string, unknown>) {
  const cfg = provisioningConfig(env);
  if (!cfg) {
    const err: any = new Error("PROVISIONING_NOT_CONFIGURED");
    err.statusCode = 500;
    throw err;
  }
  return fetchJson(`${cfg.baseUrl}${path}`, {
    method: "POST",
    headers: {
      "x-internal-token": cfg.token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function emptyOnboardingProgress(): OnboardingProgressPayload {
  return {
    baseDomain: "",
    vpsIp: "",
    appSubdomain: "app",
    installToken: "",
    currentStep: 0,
    dnsConfirmed: false,
    installGenerated: false,
    installConfirmed: false,
    verifyConfirmed: false,
  };
}

function deriveOnboardingProgressStatus(progress: OnboardingProgressPayload): OnboardingProgressStatus {
  const hasAnyData = Boolean(
    progress.baseDomain.trim() ||
      progress.vpsIp.trim() ||
      progress.installToken.trim() ||
      progress.dnsConfirmed ||
      progress.installGenerated ||
      progress.installConfirmed ||
      progress.verifyConfirmed ||
      progress.currentStep > 0
  );
  if (progress.currentStep >= 4) return "completed";
  if (!hasAnyData) return "not_started";
  return "in_progress";
}

async function resolveOnboardingLicenseId(env: Env, session: OnboardingMemberSession): Promise<string | null> {
  if (session.kind !== "customer") return null;
  const rows = await fetchProvisioningLicences(env, session.productKey, session.email);
  const row = rows.find((item) => item.email.toLowerCase() === session.email && item.status === "active") || rows[0] || null;
  return row?.licenseId || null;
}

async function requireActiveOnboardingLicense(env: Env, session: OnboardingMemberSession) {
  if (session.kind !== "customer") return { ok: true as const, licenseId: null };
  const rows = await fetchProvisioningLicences(env, session.productKey, session.email);
  const row = rows.find((item) => item.email.toLowerCase() === session.email && item.status === "active") || null;
  if (!row?.licenseId) {
    return { ok: false as const, licenseId: null };
  }
  return { ok: true as const, licenseId: row.licenseId };
}

function normalizeOnboardingProgressRecord(
  session: OnboardingMemberSession,
  row?: {
    id?: string | null;
    license_id: string | null;
    current_step: number | null;
    status: OnboardingProgressStatus | null;
    schema_version: number | null;
    progress_payload: unknown;
    last_client_saved_at: string | null;
    completed_at: string | null;
    updated_at: string | null;
  } | null
): OnboardingProgressRecord {
  const progress = OnboardingProgressPayloadSchema.parse(row?.progress_payload || emptyOnboardingProgress());
  return {
    id: row?.id || null,
    sessionKind: session.kind,
    email: session.email,
    productKey: session.productKey,
    licenseId: row?.license_id || null,
    currentStep: Number.isInteger(row?.current_step) ? Number(row?.current_step) : progress.currentStep,
    status: (row?.status as OnboardingProgressStatus | null) || deriveOnboardingProgressStatus(progress),
    schemaVersion: Number(row?.schema_version || ONBOARDING_PROGRESS_SCHEMA_VERSION),
    progress: {
      ...progress,
      currentStep: Number.isInteger(row?.current_step) ? Number(row?.current_step) : progress.currentStep,
    },
    lastClientSavedAt: row?.last_client_saved_at || null,
    completedAt: row?.completed_at || null,
    updatedAt: row?.updated_at || null,
  };
}

async function getStoredOnboardingProgressRow(db: Db, session: OnboardingMemberSession) {
  const res = await db.query<{
    id: string | null;
    license_id: string | null;
    current_step: number | null;
    status: OnboardingProgressStatus | null;
    schema_version: number | null;
    progress_payload: unknown;
    last_client_saved_at: string | null;
    completed_at: string | null;
    updated_at: string | null;
  }>(
    `
    select id, license_id, current_step, status, schema_version, progress_payload, last_client_saved_at, completed_at, updated_at
    from public.onboarding_progress
    where session_kind = $1
      and email = $2
      and product_key = $3
    limit 1
    `,
    [session.kind, session.email, session.productKey]
  );
  return res.rows[0] || null;
}

function normalizeOnboardingSetupFormRow(
  row:
    | {
        id: string;
        draft_key: string;
        status: OnboardingSetupFormStatus;
        schema_version: number | null;
        brand_name: string | null;
        desired_domain: string | null;
        admin_email: string | null;
        payload: unknown;
        logo_file_name: string | null;
        logo_content_type: string | null;
        logo_size_bytes: number | null;
        submitted_at: string | null;
        created_at: string;
        updated_at: string;
      }
    | null
): OnboardingSetupFormAdminRow | null {
  if (!row) return null;
  const payload = OnboardingSetupFormPayloadSchema.parse(row.payload || {});
  return {
    id: row.id,
    draftKey: row.draft_key,
    status: row.status || "draft",
    schemaVersion: Number(row.schema_version || ONBOARDING_SETUP_FORM_SCHEMA_VERSION),
    brandName: row.brand_name || payload.brandName || null,
    desiredDomain: row.desired_domain || payload.desiredDomain || null,
    adminEmail: row.admin_email || payload.adminEmail || null,
    payload,
    logo: row.logo_file_name
      ? {
          fileName: row.logo_file_name,
          contentType: row.logo_content_type || "",
          sizeBytes: Number(row.logo_size_bytes || 0),
        }
      : null,
    submittedAt: row.submitted_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function logOnboardingProgressEvent(
  db: Db,
  payload: {
    progressId: string | null;
    session: OnboardingMemberSession;
    licenseId: string | null;
    eventType: string;
    fromStep?: number | null;
    toStep?: number | null;
    status?: string | null;
    meta?: Record<string, unknown>;
  }
) {
  await db.query(
    `
    insert into public.onboarding_progress_events (
      progress_id,
      session_kind,
      email,
      product_key,
      license_id,
      event_type,
      from_step,
      to_step,
      status,
      meta
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
    `,
    [
      payload.progressId,
      payload.session.kind,
      payload.session.email,
      payload.session.productKey,
      payload.licenseId,
      payload.eventType,
      payload.fromStep ?? null,
      payload.toStep ?? null,
      payload.status ?? null,
      JSON.stringify(payload.meta || {}),
    ]
  );
}

async function getPrimaryUserForOnboarding(db: Db, email: string) {
  const res = await db.query<{ id: string; email: string; password_hash: string; disabled: boolean }>(
    "select id, email, password_hash, disabled from public.users where lower(email) = lower($1) limit 1",
    [email]
  );
  return res.rows[0] || null;
}

async function getOnboardingMemberSessionFromRequest(db: Db, req: FastifyRequest, reply: FastifyReply, env: Env) {
  const session = readOnboardingMemberCookie(req, env);
  if (!session) {
    clearOnboardingMemberCookie(reply, env);
    return null;
  }

  const access = await getOnboardingAccess(db, env, session.email, session.kind, session.productKey);
  if (!access.allowed || access.kind !== session.kind) {
    clearOnboardingMemberCookie(reply, env);
    return null;
  }

  return session;
}

export async function registerAdminOnboardingRoutes(api: FastifyInstance, db: Db, env: Env) {
  api.post("/onboarding/member/sign-in", async (req, reply) => {
    const body = z
      .object({
        email: z.string().email(),
        password: z.string().min(6),
        productKey: z.string().min(1).default(DEFAULT_PRODUCT_KEY),
      })
      .parse((req as any).body || {});

    const email = body.email.trim().toLowerCase();

    if (email === ADMIN_EMAIL) {
      const user = await getPrimaryUserForOnboarding(db, email);
      if (!user || user.disabled) {
        return reply.code(401).send({ error: { code: "AUTH_INVALID_CREDENTIALS", message: "Credenciais inválidas." } });
      }
      const valid = await bcrypt.compare(body.password, String(user.password_hash || ""));
      if (!valid) {
        return reply.code(401).send({ error: { code: "AUTH_INVALID_CREDENTIALS", message: "Credenciais inválidas." } });
      }

      const exp = Date.now() + ONBOARDING_MEMBER_DAYS * 24 * 60 * 60 * 1000;
      setOnboardingMemberCookie(reply, env, { email, kind: "admin", productKey: body.productKey, exp });
      return reply.send({ data: { session: { email, kind: "admin", productKey: body.productKey } }, error: null });
    }

    const access = await getOnboardingAccess(db, env, email, "customer", body.productKey);
    if (!access.allowed) {
      return reply.code(403).send({ error: { code: "AUTH_FORBIDDEN", message: "Acesso restrito ao onboarding." } });
    }

    const verified = await buildProvisioningRequest(env, "/internal/member-auth/verify", {
      email,
      password: body.password,
      productKey: body.productKey,
    });

    if (!verified.ok || !verified.json || !(verified.json as ProvisioningVerifyResp).ok) {
      return reply.code(401).send({ error: { code: "AUTH_INVALID_CREDENTIALS", message: "Credenciais inválidas." } });
    }

    const exp = Date.now() + ONBOARDING_MEMBER_DAYS * 24 * 60 * 60 * 1000;
    setOnboardingMemberCookie(reply, env, { email, kind: "customer", productKey: body.productKey, exp });
    return reply.send({ data: { session: { email, kind: "customer", productKey: body.productKey } }, error: null });
  });

  api.post("/onboarding/member/sign-out", async (_req, reply) => {
    clearOnboardingMemberCookie(reply, env);
    return reply.send({ data: { ok: true }, error: null });
  });

  api.get("/onboarding/member/session", async (req, reply) => {
    const session = await getOnboardingMemberSessionFromRequest(db, req, reply, env);
    if (!session) return reply.send({ data: { session: null }, error: null });
    return reply.send({ data: { session }, error: null });
  });

  api.get("/onboarding/member/access", async (req, reply) => {
    const session = await getOnboardingMemberSessionFromRequest(db, req, reply, env);
    if (!session) {
      return reply.code(401).send({ error: { code: "AUTH_UNAUTHORIZED", message: "Unauthorized" } });
    }

    return reply.send({ data: { allowed: true, kind: session.kind }, error: null });
  });

  api.get("/onboarding/member/progress", async (req, reply) => {
    const session = await getOnboardingMemberSessionFromRequest(db, req, reply, env);
    if (!session) {
      return reply.code(401).send({ error: { code: "AUTH_UNAUTHORIZED", message: "Unauthorized" } });
    }

    const row = await getStoredOnboardingProgressRow(db, session);

    return reply.send({
      data: {
        progress: normalizeOnboardingProgressRecord(session, row),
      },
      error: null,
    });
  });

  api.post("/onboarding/member/progress", async (req, reply) => {
    const session = await getOnboardingMemberSessionFromRequest(db, req, reply, env);
    if (!session) {
      return reply.code(401).send({ error: { code: "AUTH_UNAUTHORIZED", message: "Unauthorized" } });
    }

    const body = OnboardingProgressSaveSchema.parse((req as any).body || {});
    const progress = OnboardingProgressPayloadSchema.parse(body.progress);
    const status = deriveOnboardingProgressStatus(progress);
    const existing = await getStoredOnboardingProgressRow(db, session);
    const activeLicense = await requireActiveOnboardingLicense(env, session);
    if (!activeLicense.ok) {
      return reply.code(409).send({ error: { code: "LICENSE_NOT_ACTIVE", message: "Sua licença do onboarding não está ativa." } });
    }
    const licenseId = activeLicense.licenseId || existing?.license_id || null;
    const existingClientSavedAt = existing?.last_client_saved_at ? Date.parse(existing.last_client_saved_at) : Number.NaN;
    const incomingClientSavedAt = body.clientSavedAt ? Date.parse(body.clientSavedAt) : Number.NaN;
    const existingPayload = OnboardingProgressPayloadSchema.parse(existing?.progress_payload || emptyOnboardingProgress());
    const payloadChanged =
      JSON.stringify(existingPayload) !== JSON.stringify(progress) || Number(existing?.current_step || 0) !== progress.currentStep;
    if (
      existing &&
      Number.isFinite(existingClientSavedAt) &&
      Number.isFinite(incomingClientSavedAt) &&
      incomingClientSavedAt < existingClientSavedAt &&
      payloadChanged
    ) {
      await logOnboardingProgressEvent(db, {
        progressId: existing.id || null,
        session,
        licenseId,
        eventType: "sync_conflict_rejected",
        fromStep: Number(existing.current_step || 0),
        toStep: progress.currentStep,
        status: existing.status || "in_progress",
        meta: {
          existingClientSavedAt: existing.last_client_saved_at,
          incomingClientSavedAt: body.clientSavedAt,
        },
      });
      return reply.code(409).send({
        data: { progress: normalizeOnboardingProgressRecord(session, existing) },
        error: { code: "PROGRESS_CONFLICT", message: "Existe um progresso mais recente salvo em outro navegador ou dispositivo." },
      });
    }
    const completedAt = status === "completed" ? new Date().toISOString() : null;

    const saved = await db.query<{
      id: string | null;
      license_id: string | null;
      current_step: number | null;
      status: OnboardingProgressStatus | null;
      schema_version: number | null;
      progress_payload: unknown;
      last_client_saved_at: string | null;
      completed_at: string | null;
      updated_at: string | null;
    }>(
      `
      insert into public.onboarding_progress (
        session_kind,
        email,
        product_key,
        license_id,
        current_step,
        status,
        schema_version,
        progress_payload,
        last_client_saved_at,
        completed_at,
        updated_at
      ) values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,now())
      on conflict (session_kind, email, product_key) do update
      set license_id = excluded.license_id,
          current_step = excluded.current_step,
          status = excluded.status,
          schema_version = excluded.schema_version,
          progress_payload = excluded.progress_payload,
          last_client_saved_at = excluded.last_client_saved_at,
          completed_at = case
            when excluded.status = 'completed' then coalesce(public.onboarding_progress.completed_at, excluded.completed_at)
            when excluded.status = 'reset' then null
            else public.onboarding_progress.completed_at
          end,
          updated_at = now()
      returning id, license_id, current_step, status, schema_version, progress_payload, last_client_saved_at, completed_at, updated_at
      `,
      [
        session.kind,
        session.email,
        session.productKey,
        licenseId,
        progress.currentStep,
        status,
        ONBOARDING_PROGRESS_SCHEMA_VERSION,
        JSON.stringify(progress),
        body.clientSavedAt || null,
        completedAt,
      ]
    );

    const savedRow = saved.rows[0] || null;
    await logOnboardingProgressEvent(db, {
      progressId: savedRow?.id || null,
      session,
      licenseId,
      eventType: existing ? "progress_saved" : "progress_started",
      fromStep: Number(existing?.current_step || 0),
      toStep: progress.currentStep,
      status,
      meta: {
        dnsConfirmed: progress.dnsConfirmed,
        installGenerated: progress.installGenerated,
        installConfirmed: progress.installConfirmed,
        verifyConfirmed: progress.verifyConfirmed,
      },
    });
    if (existing && progress.currentStep > Number(existing.current_step || 0)) {
      await logOnboardingProgressEvent(db, {
        progressId: savedRow?.id || null,
        session,
        licenseId,
        eventType: "step_advanced",
        fromStep: Number(existing.current_step || 0),
        toStep: progress.currentStep,
        status,
      });
    }

    return reply.send({
      data: {
        progress: normalizeOnboardingProgressRecord(session, savedRow),
      },
      error: null,
    });
  });

  api.post("/onboarding/member/progress/reset", async (req, reply) => {
    const session = await getOnboardingMemberSessionFromRequest(db, req, reply, env);
    if (!session) {
      return reply.code(401).send({ error: { code: "AUTH_UNAUTHORIZED", message: "Unauthorized" } });
    }

    const progress = emptyOnboardingProgress();
    const existing = await getStoredOnboardingProgressRow(db, session);
    const activeLicense = await requireActiveOnboardingLicense(env, session);
    if (!activeLicense.ok) {
      return reply.code(409).send({ error: { code: "LICENSE_NOT_ACTIVE", message: "Sua licença do onboarding não está ativa." } });
    }
    const licenseId = activeLicense.licenseId || existing?.license_id || null;
    const saved = await db.query<{
      id: string | null;
      license_id: string | null;
      current_step: number | null;
      status: OnboardingProgressStatus | null;
      schema_version: number | null;
      progress_payload: unknown;
      last_client_saved_at: string | null;
      completed_at: string | null;
      updated_at: string | null;
    }>(
      `
      insert into public.onboarding_progress (
        session_kind,
        email,
        product_key,
        license_id,
        current_step,
        status,
        schema_version,
        progress_payload,
        last_client_saved_at,
        completed_at,
        updated_at
      ) values ($1,$2,$3,$4,0,'reset',$5,$6::jsonb,null,null,now())
      on conflict (session_kind, email, product_key) do update
      set license_id = excluded.license_id,
          current_step = 0,
          status = 'reset',
          schema_version = excluded.schema_version,
          progress_payload = excluded.progress_payload,
          last_client_saved_at = null,
          completed_at = null,
          updated_at = now()
      returning id, license_id, current_step, status, schema_version, progress_payload, last_client_saved_at, completed_at, updated_at
      `,
      [session.kind, session.email, session.productKey, licenseId, ONBOARDING_PROGRESS_SCHEMA_VERSION, JSON.stringify(progress)]
    );
    const savedRow = saved.rows[0] || null;
    await logOnboardingProgressEvent(db, {
      progressId: savedRow?.id || null,
      session,
      licenseId,
      eventType: "progress_reset",
      fromStep: Number(existing?.current_step || 0),
      toStep: 0,
      status: "reset",
    });

    return reply.send({
      data: {
        progress: normalizeOnboardingProgressRecord(session, savedRow),
      },
      error: null,
    });
  });

  api.post("/onboarding/member/progress/complete", async (req, reply) => {
    const session = await getOnboardingMemberSessionFromRequest(db, req, reply, env);
    if (!session) {
      return reply.code(401).send({ error: { code: "AUTH_UNAUTHORIZED", message: "Unauthorized" } });
    }

    const body = OnboardingProgressSaveSchema.parse((req as any).body || {});
    const progress = {
      ...OnboardingProgressPayloadSchema.parse(body.progress),
      currentStep: 4,
    };
    const existing = await getStoredOnboardingProgressRow(db, session);
    const activeLicense = await requireActiveOnboardingLicense(env, session);
    if (!activeLicense.ok) {
      return reply.code(409).send({ error: { code: "LICENSE_NOT_ACTIVE", message: "Sua licença do onboarding não está ativa." } });
    }
    const licenseId = activeLicense.licenseId || existing?.license_id || null;
    const completedAt = new Date().toISOString();

    const saved = await db.query<{
      id: string | null;
      license_id: string | null;
      current_step: number | null;
      status: OnboardingProgressStatus | null;
      schema_version: number | null;
      progress_payload: unknown;
      last_client_saved_at: string | null;
      completed_at: string | null;
      updated_at: string | null;
    }>(
      `
      insert into public.onboarding_progress (
        session_kind,
        email,
        product_key,
        license_id,
        current_step,
        status,
        schema_version,
        progress_payload,
        last_client_saved_at,
        completed_at,
        updated_at
      ) values ($1,$2,$3,$4,$5,'completed',$6,$7::jsonb,$8,$9,now())
      on conflict (session_kind, email, product_key) do update
      set license_id = excluded.license_id,
          current_step = excluded.current_step,
          status = 'completed',
          schema_version = excluded.schema_version,
          progress_payload = excluded.progress_payload,
          last_client_saved_at = excluded.last_client_saved_at,
          completed_at = coalesce(public.onboarding_progress.completed_at, excluded.completed_at),
          updated_at = now()
      returning id, license_id, current_step, status, schema_version, progress_payload, last_client_saved_at, completed_at, updated_at
      `,
      [
        session.kind,
        session.email,
        session.productKey,
        licenseId,
        progress.currentStep,
        ONBOARDING_PROGRESS_SCHEMA_VERSION,
        JSON.stringify(progress),
        body.clientSavedAt || null,
        completedAt,
      ]
    );
    const savedRow = saved.rows[0] || null;
    await logOnboardingProgressEvent(db, {
      progressId: savedRow?.id || null,
      session,
      licenseId,
      eventType: "progress_completed",
      fromStep: Number(existing?.current_step || 0),
      toStep: 4,
      status: "completed",
    });

    return reply.send({
      data: {
        progress: normalizeOnboardingProgressRecord(session, savedRow),
      },
      error: null,
    });
  });

  api.get("/onboarding/member/profile", async (req, reply) => {
    const session = await getOnboardingMemberSessionFromRequest(db, req, reply, env);
    if (!session) {
      return reply.code(401).send({ error: { code: "AUTH_UNAUTHORIZED", message: "Unauthorized" } });
    }

    if (session.kind === "admin") {
      return reply.send({
        data: {
          profile: {
            email: session.email,
            customerName: "Admin DingitalPay",
            planName: PRO_PLAN_NAME,
            planCode: "pro",
            installToken: null,
            updateToken: null,
            onboardingPassword: null,
            status: "admin",
            createdAt: null,
            licenseId: null,
            installTokenExpiresAt: null,
            maxActivations: 0,
            activationsUsed: 0,
            eligibleByOrder: true,
            ordersCount: 0,
            updatesIncluded: true,
            supportIncluded: true,
            upgradeRequired: false,
            upgradeUrl: null,
          },
        },
        error: null,
      });
    }

    const rows = await fetchProvisioningLicences(env, session.productKey, session.email);
    const row = rows.find((item) => item.email.toLowerCase() === session.email && item.status === "active") || rows[0] || null;
    if (!row) {
      return reply.code(404).send({ error: { code: "LICENSE_NOT_FOUND", message: "Licença do onboarding não encontrada." } });
    }

    const entitlementMap = await fetchPlanEntitlements(db, env, [session.email]);
    const baseEntitlement = entitlementMap.get(session.email) || derivePlanEntitlement(session.email, 0, 0, env);
    const entitlement = applyPlanOverride(baseEntitlement, row, env);
    await syncProvisioningUpdatesEntitlement(env, row, entitlement).catch(() => {});

    const nameRes = await db.query<{ name: string | null }>(
      `
      select max(nullif(trim(buyer_name), '')) as name
      from public.orders
      where product_id = any($1::uuid[])
        and status = 'approved'
        and lower(buyer_email) = $2
      `,
      [[SOURCE_PRODUCT_ID, PRO_UPDATES_PRODUCT_ID], session.email]
    );
    const countMap = await fetchActiveEntitlementCountsByEmail(db, [session.email], [SOURCE_PRODUCT_ID, PRO_UPDATES_PRODUCT_ID]);
    const entitlementCounts = countMap.get(session.email) || new Map<string, number>();
    const totalEntitlements = (entitlementCounts.get(SOURCE_PRODUCT_ID) || 0) + (entitlementCounts.get(PRO_UPDATES_PRODUCT_ID) || 0);

    return reply.send({
      data: {
        profile: {
          email: row.email,
          customerName: String(nameRes.rows[0]?.name || row.email.split("@")[0] || "").trim(),
          planName: entitlement.planName,
          planCode: entitlement.planCode,
          installToken: row.installToken,
          updateToken: entitlement.updatesIncluded ? row.updateToken : null,
          onboardingPassword: null,
          status: row.status,
          createdAt: row.createdAt,
          licenseId: row.licenseId,
          installTokenExpiresAt: row.installTokenExpiresAt,
          maxActivations: row.maxActivations,
          activationsUsed: row.activationsUsed,
          eligibleByOrder: true,
          ordersCount: totalEntitlements,
          updatesIncluded: entitlement.updatesIncluded,
          supportIncluded: entitlement.supportIncluded,
          upgradeRequired: entitlement.upgradeRequired,
          upgradeUrl: entitlement.upgradeUrl,
        },
      },
      error: null,
    });
  });

  api.get("/onboarding/member/platform-version", async (req, reply) => {
    const session = await getOnboardingMemberSessionFromRequest(db, req, reply, env);
    if (!session) {
      return reply.code(401).send({ error: { code: "AUTH_UNAUTHORIZED", message: "Unauthorized" } });
    }

    const cfg = provisioningConfig(env);
    if (!cfg) {
      return reply.code(500).send({ error: { code: "PROVISIONING_NOT_CONFIGURED", message: "Provisioning internal token não configurado." } });
    }

    const rels = await fetchJson<ProvisioningReleaseListResp>(`${cfg.baseUrl}/internal/releases/list?productKey=${encodeURIComponent(DEFAULT_PRODUCT_KEY)}`, {
      method: "GET",
      headers: { "x-internal-token": cfg.token },
    });

    if (!rels.ok || !rels.json?.ok) {
      return reply.code(502).send({ error: { code: "PROVISIONING_RELEASES_FAILED", message: "Falha ao consultar a versão atual." } });
    }

    const current = rels.json.releases?.[0] || null;
    return reply.send({ data: { version: current?.version || null, productKey: DEFAULT_PRODUCT_KEY }, error: null });
  });

  api.post("/onboarding/member/upgrade-click", async (req, reply) => {
    const session = await getOnboardingMemberSessionFromRequest(db, req, reply, env);
    if (!session) {
      return reply.code(401).send({ error: { code: "AUTH_UNAUTHORIZED", message: "Unauthorized" } });
    }

    const body = z.object({ source: z.string().max(80).optional() }).parse((req as any).body || {});
    const existing = await getStoredOnboardingProgressRow(db, session);
    const license = await requireActiveOnboardingLicense(env, session);
    await logOnboardingProgressEvent(db, {
      progressId: existing?.id || null,
      session,
      licenseId: license.ok ? license.licenseId : null,
      eventType: "upgrade_cta_clicked",
      fromStep: existing?.current_step ?? null,
      toStep: existing?.current_step ?? null,
      status: existing?.status || "not_started",
      meta: { source: body.source || "unknown" },
    });

    return reply.send({ data: { ok: true }, error: null });
  });

  api.post("/onboarding/member/rotate-install-token", async (req, reply) => {
    const session = await getOnboardingMemberSessionFromRequest(db, req, reply, env);
    if (!session) {
      return reply.code(401).send({ error: { code: "AUTH_UNAUTHORIZED", message: "Unauthorized" } });
    }

    if (session.kind !== "customer") {
      return reply.code(403).send({ error: { code: "AUTH_FORBIDDEN", message: "Forbidden" } });
    }

    const rows = await fetchProvisioningLicences(env, session.productKey, session.email);
    const row = rows.find((item) => item.email.toLowerCase() === session.email && item.status === "active") || rows[0] || null;
    if (!row || row.status !== "active" || !row.licenseId) {
      return reply.code(404).send({ error: { code: "LICENSE_NOT_FOUND", message: "Licença ativa não encontrada." } });
    }

    const rotated = await buildProvisioningRequest(env, "/internal/licenses/rotate-install-token", {
      licenseId: row.licenseId,
    });
    if (!rotated.ok || !rotated.json || !(rotated.json as any).ok) {
      return reply.code(rotated.status || 500).send({ error: { code: "PROVISIONING_ROTATE_INSTALL_FAILED", message: "Falha ao rotacionar install token." } });
    }

    return reply.send({ data: rotated.json as ProvisioningRotateInstallResp, error: null });
  });

  api.get("/admin/onboarding/licences", async (req, reply) => {
    const forbidden = await requireOnboardingAdmin(db, req, reply);
    if (forbidden) return forbidden;

    const q = z.object({ productId: z.string().uuid() }).parse((req as any).query || {});

    const entitlementRes = await db.query<{ email: string; last_paid_at: string; orders_count: string }>(
      `
      select
        normalized_buyer_email as email,
        max(granted_at) as last_paid_at,
        count(*)::text as orders_count
      from public.product_entitlements
      where product_id = $1
        and status = 'active'
      group by 1
      `,
      [q.productId]
    );

    const approvedByEmail = new Map(
      entitlementRes.rows.map((row) => [
        row.email,
        {
          email: row.email,
          lastPaidAt: row.last_paid_at,
          ordersCount: Number.parseInt(row.orders_count, 10) || 0,
        },
      ])
    );

    let provisioningRows = await fetchProvisioningLicences(env, DEFAULT_PRODUCT_KEY);
    const existingEmails = new Set(provisioningRows.map((row) => row.email.toLowerCase()));
    const missingApprovedEmails = [...approvedByEmail.keys()].filter((email) => !existingEmails.has(email));
    if (missingApprovedEmails.length > 0) {
      await mapWithConcurrency(missingApprovedEmails, 4, async (email) => {
        const ensured = await buildProvisioningRequest(env, "/internal/licenses/ensure", {
          email,
          productKey: DEFAULT_PRODUCT_KEY,
          maxActivations: 1,
          sendEmail: false,
          mintInstallToken: false,
        });
        if (!ensured.ok && ensured.status !== 409) {
          throw new Error(`PROVISIONING_ENSURE_FAILED:${email}`);
        }
      });
      provisioningRows = await fetchProvisioningLicences(env, DEFAULT_PRODUCT_KEY);
    }

    const missingPasswords = provisioningRows.filter((row) => row.status === "active" && !String(row.onboardingPassword || "").trim());
    if (missingPasswords.length > 0) {
      await mapWithConcurrency(missingPasswords, 4, async (row) => {
        const ensured = await buildProvisioningRequest(env, "/internal/licenses/ensure", {
          email: row.email,
          productKey: row.productKey,
          maxActivations: row.maxActivations || 1,
          sendEmail: false,
          mintInstallToken: false,
        });
        if (!ensured.ok && ensured.status !== 409) {
          throw new Error(`PROVISIONING_PASSWORD_BACKFILL_FAILED:${row.email}`);
        }
      });
      provisioningRows = await fetchProvisioningLicences(env, DEFAULT_PRODUCT_KEY);
    }

    const progressRes =
      provisioningRows.length > 0
        ? await db.query<{
            email: string;
            current_step: number | null;
            status: OnboardingProgressStatus | null;
            updated_at: string | null;
            completed_at: string | null;
          }>(
            `
            select lower(email) as email, current_step, status, updated_at, completed_at
            from public.onboarding_progress
            where session_kind = 'customer'
              and product_key = $1
              and lower(email) = any($2::text[])
            `,
            [DEFAULT_PRODUCT_KEY, provisioningRows.map((row) => row.email.toLowerCase())]
          )
        : { rows: [] as any[] };

    const upgradeEventRes =
      provisioningRows.length > 0
        ? await db.query<{ email: string; last_upgrade_click_at: string | null }>(
            `
            select lower(email) as email, max(created_at) as last_upgrade_click_at
            from public.onboarding_progress_events
            where session_kind = 'customer'
              and product_key = $1
              and event_type = 'upgrade_cta_clicked'
              and lower(email) = any($2::text[])
            group by 1
            `,
            [DEFAULT_PRODUCT_KEY, provisioningRows.map((row) => row.email.toLowerCase())]
          )
        : { rows: [] as any[] };

    const progressByEmail = new Map(
      progressRes.rows.map((row) => [
        row.email,
        {
          currentStep: Number(row.current_step || 0),
          status: row.status || "not_started",
          updatedAt: row.updated_at || null,
          completedAt: row.completed_at || null,
        },
      ])
    );
    const upgradeClicksByEmail = new Map(upgradeEventRes.rows.map((row) => [row.email, row.last_upgrade_click_at || null]));

    const entitlements = await fetchPlanEntitlements(db, env, provisioningRows.map((row) => row.email));
    await mapWithConcurrency(provisioningRows.filter((row) => row.status === "active"), 4, async (row) => {
      const baseEntitlement = entitlements.get(row.email.toLowerCase()) || derivePlanEntitlement(row.email, 0, 0, env);
      const effectiveEntitlement = applyPlanOverride(baseEntitlement, row, env);
      await syncProvisioningUpdatesEntitlement(env, row, effectiveEntitlement).catch(() => {});
    });
    provisioningRows = await fetchProvisioningLicences(env, DEFAULT_PRODUCT_KEY);

    const rows = provisioningRows
      .map((row) => {
        const paid = approvedByEmail.get(row.email.toLowerCase());
        const progress = progressByEmail.get(row.email.toLowerCase());
        const baseEntitlement = entitlements.get(row.email.toLowerCase()) || derivePlanEntitlement(row.email, 0, 0, env);
        const entitlement = applyPlanOverride(baseEntitlement, row, env);
        return {
          ...row,
          eligibleByOrder: Boolean(paid),
          lastPaidAt: paid?.lastPaidAt || null,
          ordersCount: paid?.ordersCount || 0,
          planCode: entitlement.planCode,
          planName: entitlement.planName,
          updatesIncluded: entitlement.updatesIncluded,
          supportIncluded: entitlement.supportIncluded,
          upgradeRequired: entitlement.upgradeRequired,
          upgradeUrl: entitlement.upgradeUrl,
          planPriceLabel: entitlement.planCode === "pro" ? PRO_PLAN_PRICE_LABEL : null,
          onboardingProgressStep: progress?.currentStep ?? 0,
          onboardingProgressStatus: progress?.status ?? "not_started",
          onboardingProgressUpdatedAt: progress?.updatedAt ?? null,
          onboardingProgressCompletedAt: progress?.completedAt ?? null,
          lastUpgradeClickAt: upgradeClicksByEmail.get(row.email.toLowerCase()) ?? null,
        };
      })
      .sort((a, b) => {
        if (Number(b.eligibleByOrder) !== Number(a.eligibleByOrder)) return Number(b.eligibleByOrder) - Number(a.eligibleByOrder);
        const left = a.lastPaidAt || a.createdAt;
        const right = b.lastPaidAt || b.createdAt;
        return new Date(right).getTime() - new Date(left).getTime();
      });

    return reply.send({ data: { rows }, error: null });
  });

  api.get("/admin/onboarding/licences/email-settings", async (req, reply) => {
    const forbidden = await requireOnboardingAdmin(db, req, reply);
    if (forbidden) return forbidden;

    const q = z.object({ productId: z.string().uuid() }).parse((req as any).query || {});
    const settings = await getOnboardingAccessEmailSettings(db, q.productId);
    return reply.send({ data: { settings }, error: null });
  });

  api.post("/admin/onboarding/licences/email-settings", async (req, reply) => {
    const forbidden = await requireOnboardingAdmin(db, req, reply);
    if (forbidden) return forbidden;

    const body = z
      .object({
        productId: z.string().uuid(),
        enabled: z.coerce.boolean(),
        onboardingUrl: z.string().url(),
        subject: z.string().min(3).max(180),
        bodyHtml: z.string().min(20).max(20000),
      })
      .parse((req as any).body || {});

    const settings = await saveOnboardingAccessEmailSettings(db, {
      productId: body.productId,
      enabled: body.enabled,
      onboardingUrl: body.onboardingUrl.trim(),
      subject: body.subject.trim(),
      bodyHtml: body.bodyHtml.trim(),
    });
    return reply.send({ data: { settings }, error: null });
  });

  api.post("/admin/onboarding/licences/email-settings/send-test", async (req, reply) => {
    const forbidden = await requireOnboardingAdmin(db, req, reply);
    if (forbidden) return forbidden;

    const body = z
      .object({
        productId: z.string().uuid(),
        to: z.string().email(),
      })
      .parse((req as any).body || {});

    const settings = await getOnboardingAccessEmailSettings(db, body.productId);
    const result = await enqueueOnboardingAccessEmail(db, {
      productId: body.productId,
      to: body.to.trim().toLowerCase(),
      customerName: "Cliente teste",
      customerEmail: body.to.trim().toLowerCase(),
      productName: "DingitalPay Platform",
      loginEmail: body.to.trim().toLowerCase(),
      onboardingPassword: "SenhaTemporaria123!",
      licenseId: "teste",
      dedupeKey: null,
    });

    const payload: OnboardingAccessEmailTestResult = {
      settings,
      result: result.ok
        ? { ok: true, queued: result.queued, reason: result.queued ? undefined : result.reason }
        : { ok: false, queued: false, error: result.error },
    };

    if (!result.ok) {
      return reply.code(500).send({ data: payload, error: { code: "EMAIL_TEST_FAILED", message: result.error } });
    }
    if (!result.queued) {
      return reply.code(409).send({
        data: payload,
        error: {
          code: result.reason === "smtp_disabled" ? "SMTP_DISABLED" : "ONBOARDING_EMAIL_DISABLED",
          message: result.reason === "smtp_disabled" ? "SMTP desabilitado ou nao configurado." : "Automacao de e-mail desabilitada.",
        },
      });
    }
    return reply.send({ data: payload, error: null });
  });

  api.get("/admin/onboarding/licences/setup-forms", async (req, reply) => {
    const forbidden = await requireOnboardingAdmin(db, req, reply);
    if (forbidden) return forbidden;

    const forms = await db.query<{
      id: string;
      draft_key: string;
      status: OnboardingSetupFormStatus;
      schema_version: number | null;
      brand_name: string | null;
      desired_domain: string | null;
      admin_email: string | null;
      payload: unknown;
      logo_file_name: string | null;
      logo_content_type: string | null;
      logo_size_bytes: number | null;
      submitted_at: string | null;
      created_at: string;
      updated_at: string;
    }>(
      `
      select
        id,
        draft_key,
        status,
        schema_version,
        brand_name,
        desired_domain,
        admin_email,
        payload,
        logo_file_name,
        logo_content_type,
        logo_size_bytes,
        submitted_at,
        created_at,
        updated_at
      from public.onboarding_setup_forms
      order by
        case when status = 'submitted' then 0 else 1 end,
        coalesce(submitted_at, updated_at) desc
      limit 300
      `
    );

    return reply.send({
      data: {
        rows: forms.rows.map((row) => normalizeOnboardingSetupFormRow(row)).filter(Boolean),
      },
      error: null,
    });
  });

  api.get("/admin/onboarding/licences/setup-forms/:id/logo", async (req, reply) => {
    const forbidden = await requireOnboardingAdmin(db, req, reply);
    if (forbidden) return forbidden;

    const params = z.object({ id: z.string().uuid() }).parse((req as any).params || {});
    const result = await db.query<OnboardingSetupFormLogoDownloadRow>(
      `
      select
        logo_file_name,
        logo_content_type,
        logo_data_base64
      from public.onboarding_setup_forms
      where id = $1
      limit 1
      `,
      [params.id]
    );

    const row = result.rows[0] || null;
    if (!row) {
      return reply.code(404).send({
        error: { code: "SETUP_FORM_NOT_FOUND", message: "Briefing nao encontrado." },
      });
    }
    if (!row.logo_file_name || !row.logo_data_base64) {
      return reply.code(404).send({
        error: { code: "SETUP_FORM_LOGO_NOT_FOUND", message: "Este briefing nao possui logotipo anexado." },
      });
    }

    const contentType = String(row.logo_content_type || "application/octet-stream");
    const fileName = String(row.logo_file_name || "logo");
    const binary = Buffer.from(String(row.logo_data_base64 || ""), "base64");

    reply.header("Content-Type", contentType);
    reply.header("Content-Length", String(binary.length));
    reply.header("Content-Disposition", `attachment; filename="${fileName.replace(/"/g, "")}"`);
    return reply.send(binary);
  });

  api.post("/admin/onboarding/licences/send-access-email", async (req, reply) => {
    const forbidden = await requireOnboardingAdmin(db, req, reply);
    if (forbidden) return forbidden;

    const body = z.object({ licenseId: z.string().uuid() }).parse((req as any).body || {});
    const provisioningRows = await fetchProvisioningLicences(env, DEFAULT_PRODUCT_KEY);
    const row = provisioningRows.find((item) => item.licenseId === body.licenseId) || null;
    if (!row) {
      return reply.code(404).send({ error: { code: "LICENSE_NOT_FOUND", message: "Licenca nao encontrada." } });
    }
    if (row.status !== "active") {
      return reply.code(409).send({ error: { code: "LICENSE_NOT_ACTIVE", message: "A licenca precisa estar ativa para enviar o acesso." } });
    }

    const ensured = await buildProvisioningRequest(env, "/internal/licenses/ensure", {
      email: row.email,
      productKey: row.productKey,
      maxActivations: row.maxActivations || 1,
      sendEmail: false,
      mintInstallToken: false,
      updatesEnabled: row.updatesEnabled,
    });
    if (!ensured.ok || !ensured.json || !(ensured.json as any).ok) {
      return reply.code(ensured.status || 500).send({
        error: { code: "PROVISIONING_ENSURE_FAILED", message: "Falha ao garantir credenciais do onboarding." },
      });
    }

    const latestOrder = await db.query<{ buyer_name: string | null; product_name: string | null }>(
      `
        select buyer_name, product_name
        from public.orders
        where lower(buyer_email) = $1
          and product_id = $2
          and status = 'approved'
        order by created_at desc
        limit 1
      `,
      [row.email.toLowerCase(), SOURCE_PRODUCT_ID]
    );
    const orderMeta = latestOrder.rows[0];
    const ensuredData = ensured.json as ProvisioningEnsureResp;
    const password = String(ensuredData.onboardingPassword || "").trim();
    if (!password) {
      return reply.code(409).send({
        error: { code: "ONBOARDING_PASSWORD_MISSING", message: "A senha do onboarding ainda nao esta disponivel para esta licenca." },
      });
    }

    const result = await enqueueOnboardingAccessEmail(db, {
      productId: SOURCE_PRODUCT_ID,
      to: row.email,
      customerName: String(orderMeta?.buyer_name || "Cliente"),
      customerEmail: row.email,
      productName: String(orderMeta?.product_name || "DingitalPay Platform"),
      loginEmail: row.email,
      onboardingPassword: password,
      licenseId: row.licenseId,
      dedupeKey: null,
    });

    if (!result.ok) {
      return reply.code(500).send({ error: { code: "ONBOARDING_EMAIL_FAILED", message: result.error } });
    }
    if (!result.queued) {
      return reply.code(409).send({
        error: {
          code: result.reason === "smtp_disabled" ? "SMTP_DISABLED" : "ONBOARDING_EMAIL_DISABLED",
          message: result.reason === "smtp_disabled" ? "SMTP desabilitado ou nao configurado." : "Automacao de e-mail desabilitada.",
        },
      });
    }

    return reply.send({ data: { licenseId: row.licenseId, queued: true }, error: null });
  });

  api.post("/admin/onboarding/licences/issue", async (req, reply) => {
    const forbidden = await requireOnboardingAdmin(db, req, reply);
    if (forbidden) return forbidden;

    const body = z
      .object({
        email: z.string().email(),
        productKey: z.string().min(1).default(DEFAULT_PRODUCT_KEY),
        maxActivations: z.coerce.number().int().min(1).max(10).default(1),
      })
      .parse((req as any).body || {});

    const issued = await buildProvisioningRequest(env, "/internal/licenses/issue", {
      email: body.email,
      productKey: body.productKey,
      maxActivations: body.maxActivations,
      sendEmail: false,
    });

    if (!issued.ok || !issued.json || !(issued.json as any).ok) {
      return reply.code(issued.status || 500).send({ error: { code: "PROVISIONING_ISSUE_FAILED", message: "Falha ao criar licença." } });
    }

    try {
      await ensureManualProductEntitlement(db, {
        productId: SOURCE_PRODUCT_ID,
        buyerEmail: body.email,
        buyerName: body.email.split("@")[0] || body.email,
        transactionId: `manual-license:${String((issued.json as any).licenseId || "").trim() || body.email.toLowerCase()}`,
      });
    } catch (error) {
      req.log?.error?.({ err: error, email: body.email }, "manual onboarding entitlement grant failed");
      return reply.code(500).send({
        error: {
          code: "ENTITLEMENT_GRANT_FAILED",
          message: "Licença criada, mas falhou ao liberar o acesso do onboarding automaticamente.",
        },
      });
    }

    return reply.send({ data: issued.json as ProvisioningIssueResp, error: null });
  });

  api.post("/admin/onboarding/licences/rotate-install-token", async (req, reply) => {
    const forbidden = await requireOnboardingAdmin(db, req, reply);
    if (forbidden) return forbidden;

    const body = z
      .object({
        licenseId: z.string().uuid(),
        installTtlMinutes: z.coerce.number().int().min(5).max(7 * 24 * 60).optional(),
      })
      .parse((req as any).body || {});

    const rotated = await buildProvisioningRequest(env, "/internal/licenses/rotate-install-token", body);
    if (!rotated.ok || !rotated.json || !(rotated.json as any).ok) {
      return reply.code(rotated.status || 500).send({ error: { code: "PROVISIONING_ROTATE_INSTALL_FAILED", message: "Falha ao rotacionar install token." } });
    }

    return reply.send({ data: rotated.json as ProvisioningRotateInstallResp, error: null });
  });

  api.post("/admin/onboarding/licences/rotate-update-token", async (req, reply) => {
    const forbidden = await requireOnboardingAdmin(db, req, reply);
    if (forbidden) return forbidden;

    const body = z
      .object({
        licenseId: z.string().uuid(),
        graceMinutes: z.coerce.number().int().min(0).max(7 * 24 * 60).default(60 * 24),
      })
      .parse((req as any).body || {});

    const rot = await buildProvisioningRequest(env, "/internal/licenses/rotate-update-token", body);

    if (!rot.ok || !rot.json || !(rot.json as any).ok) {
      return reply.code(rot.status || 500).send({ error: { code: "PROVISIONING_ROTATE_FAILED", message: "Falha ao rotacionar update token." } });
    }

    return reply.send({ data: rot.json as ProvisioningRotateUpdateResp, error: null });
  });

  api.post("/admin/onboarding/licences/set-updates-enabled", async (req, reply) => {
    const forbidden = await requireOnboardingAdmin(db, req, reply);
    if (forbidden) return forbidden;

    const body = z
      .object({
        licenseId: z.string().uuid(),
        enabled: z.coerce.boolean(),
      })
      .parse((req as any).body || {});

    const toggled = await buildProvisioningRequest(env, "/internal/licenses/set-updates-enabled", body);
    if (!toggled.ok || !toggled.json || !(toggled.json as any).ok) {
      return reply.code(toggled.status || 500).send({ error: { code: "PROVISIONING_TOGGLE_UPDATES_FAILED", message: "Falha ao alterar o estado dos updates." } });
    }

    return reply.send({ data: toggled.json as ProvisioningToggleUpdatesResp, error: null });
  });

  api.post("/admin/onboarding/licences/revoke", async (req, reply) => {
    const forbidden = await requireOnboardingAdmin(db, req, reply);
    if (forbidden) return forbidden;

    const body = z.object({ licenseId: z.string().uuid() }).parse((req as any).body || {});
    const revoked = await buildProvisioningRequest(env, "/internal/licenses/revoke", body);
    if (!revoked.ok || !revoked.json || !(revoked.json as any).ok) {
      return reply.code(revoked.status || 500).send({ error: { code: "PROVISIONING_REVOKE_FAILED", message: "Falha ao revogar a licença." } });
    }

    return reply.send({ data: revoked.json as ProvisioningSimpleResp, error: null });
  });

  api.post("/admin/onboarding/licences/reactivate", async (req, reply) => {
    const forbidden = await requireOnboardingAdmin(db, req, reply);
    if (forbidden) return forbidden;

    const body = z.object({ licenseId: z.string().uuid() }).parse((req as any).body || {});
    const reactivated = await buildProvisioningRequest(env, "/internal/licenses/reactivate", body);
    if (!reactivated.ok || !reactivated.json || !(reactivated.json as any).ok) {
      return reply.code(reactivated.status || 500).send({ error: { code: "PROVISIONING_REACTIVATE_FAILED", message: "Falha ao reativar a licença." } });
    }

    return reply.send({ data: reactivated.json as ProvisioningSimpleResp, error: null });
  });
}
