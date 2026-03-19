import type { FastifyInstance } from "fastify";
import { z } from "zod";
import crypto from "node:crypto";
import nodemailer from "nodemailer";
import type { Db } from "./db.js";
import type { Env } from "./env.js";
import { decryptJson, encryptJson } from "./crypto.js";
import { hashToken } from "./crypto.js";
import { requireAdmin, requireAuth } from "./auth.js";
import { enqueueTemplatedEmail, enqueueRenderedEmail } from "./emailQueue.js";
import { queueOrderLifecycleEmails } from "./emailEventTriggers.js";
import { renderTemplate } from "./email.js";
import { computeAcquirerConnectionStatus } from "./acquirerStatus.js";
import { assertSafeOutboundWebhookUrl } from "./ssrfGuard.js";
import { logSecurityEvent } from "./securityAudit.js";
import { decryptSmtpPassword, ensureSmtpPasswordEncrypted } from "./smtpCrypto.js";
import { enqueueOnboardingAccessEmail } from "./onboardingAccessEmail.js";
import {
  fetchActiveEntitlementCountsByEmail,
  syncOrderProductEntitlements,
} from "./productEntitlements.js";

const MP_API = "https://api.mercadopago.com";
const KIPAY_DEFAULT_BASE_URL = "https://api.kipaybr.com";
const FB_API_VERSION = "v21.0";
const ONBOARDING_SOURCE_PRODUCT_ID = "a5a0c1fa-7d47-403b-a262-47f07a93d3ec";
const ONBOARDING_PRO_PLAN_PRODUCT_ID = "cbd62f45-4ece-4d5b-b88b-0896f7b57e0b";
const ONBOARDING_PRODUCT_KEY = "dingitalpay-platform";

type OnboardingEnsureResult = {
  ok: boolean;
  licenseId: string;
  onboardingPassword: string | null;
};

type PaymentMethodLabel = "PIX" | "Cartão" | "Boleto" | "Cashout";

type AcquirerCatalogEntry = {
  acquirer_name: string;
  implemented: boolean;
  methods_supported: PaymentMethodLabel[];
  required_credentials: string[];
};

const ACQUIRER_CATALOG: AcquirerCatalogEntry[] = [
  {
    acquirer_name: "KIPAY",
    implemented: true,
    methods_supported: ["PIX"],
    required_credentials: ["api_secret", "webhook_token"],
  },
  {
    acquirer_name: "MERCADO PAGO",
    implemented: true,
    methods_supported: ["PIX", "Cartão", "Boleto"],
    required_credentials: ["access_token", "public_key"],
  },
  // Placeholders (not implemented yet). Keep conservative to avoid promising wrong methods.
  { acquirer_name: "ASAAS", implemented: false, methods_supported: [], required_credentials: [] },
  { acquirer_name: "PAGARME", implemented: false, methods_supported: [], required_credentials: [] },
  { acquirer_name: "STRIPE", implemented: false, methods_supported: [], required_credentials: [] },
  { acquirer_name: "CIELO", implemented: false, methods_supported: [], required_credentials: [] },
  { acquirer_name: "REDE", implemented: false, methods_supported: [], required_credentials: [] },
  { acquirer_name: "APPMAX", implemented: false, methods_supported: [], required_credentials: [] },
];

type CachedValue<T> = { value: T; exp: number };
const acquirerConfigCache = new Map<string, CachedValue<{ active: boolean; credentials: any } | null>>();
const ACQUIRER_CONFIG_TTL_MS = 30_000;

function normalizeAcquirerName(v: any): string {
  return String(v || "").trim().toUpperCase();
}

function methodLabel(method: string): "PIX" | "Boleto" | "Cartão" | "Cashout" | string {
  const m = String(method || "").trim().toLowerCase();
  if (m === "pix") return "PIX";
  if (m === "boleto") return "Boleto";
  if (m === "credit_card") return "Cartão";
  if (m === "cashout") return "Cashout";
  return method;
}

function canonicalMethodLabel(method: any): PaymentMethodLabel | null {
  const m = String(method || "").trim().toLowerCase();
  if (m === "pix") return "PIX";
  if (m === "boleto") return "Boleto";
  if (m === "cartão" || m === "cartao" || m === "credit_card" || m === "card" || m === "credito") return "Cartão";
  if (m === "cashout") return "Cashout";
  return null;
}

function getAcquirerCatalogEntry(acquirerName: string): AcquirerCatalogEntry | null {
  const key = normalizeAcquirerName(acquirerName);
  return ACQUIRER_CATALOG.find((a) => normalizeAcquirerName(a.acquirer_name) === key) || null;
}

function hasRequiredCredentials(required: string[], credentials: any): boolean {
  if (!required.length) return true;
  const creds = (credentials || {}) as Record<string, any>;
  return required.every((k) => String(creds?.[k] || "").trim().length > 0);
}

function mapKipayStatusToOrderStatus(kipayStatus: any): "pending" | "approved" | "refunded" | "chargeback" | "abandoned" {
  const s = String(kipayStatus || "").trim().toUpperCase();
  if (s === "AUTHORIZED" || s === "APPROVED" || s === "PAID") return "approved";
  if (s === "REFUNDED") return "refunded";
  if (s === "CHARGEBACK") return "chargeback";
  if (s === "REJECTED" || s === "FAILED" || s === "CANCELED" || s === "CANCELLED") return "abandoned";
  return "pending";
}

async function loadAcquirerForMethod(db: Db, method: string): Promise<string> {
  const label = methodLabel(method);
  const res = await db.query<{ acquirer_name: string }>(
    'select acquirer_name from public.payment_method_acquirers where method = $1 limit 1',
    [label]
  );
  const name = normalizeAcquirerName(res.rows[0]?.acquirer_name);
  return name || "MERCADO PAGO";
}

async function loadAcquirerConfig(db: Db, env: Env, acquirerName: string): Promise<{ active: boolean; credentials: any } | null> {
  const key = normalizeAcquirerName(acquirerName);
  if (!key) return null;

  const now = Date.now();
  const cached = acquirerConfigCache.get(key);
  if (cached && cached.exp > now) return cached.value;

  const res = await db.query<any>(
    "select active, credentials, credentials_ciphertext, credentials_iv, credentials_tag from public.acquirer_configs where acquirer_name = $1 limit 1",
    [key]
  );
  const row = res.rows[0];
  if (!row) {
    acquirerConfigCache.set(key, { value: null, exp: now + ACQUIRER_CONFIG_TTL_MS });
    return null;
  }

  const encrypted = row.credentials_ciphertext && row.credentials_iv && row.credentials_tag
    ? { ciphertext: row.credentials_ciphertext, iv: row.credentials_iv, tag: row.credentials_tag }
    : null;
  const creds = decryptJson(env.MASTER_KEY, encrypted) || row.credentials || {};
  const value = { active: Boolean(row.active), credentials: creds };
  acquirerConfigCache.set(key, { value, exp: now + ACQUIRER_CONFIG_TTL_MS });
  return value;
}

async function upsertAcquirerConfig(db: Db, env: Env, acquirerName: string, active: boolean, credentials: any) {
  const key = normalizeAcquirerName(acquirerName);
  const existing = await loadAcquirerConfig(db, env, key);
  const mergedCredentials = { ...((existing?.credentials || {}) as Record<string, any>), ...((credentials || {}) as Record<string, any>) };

  if (key === "KIPAY") {
    const currentToken = String(existing?.credentials?.webhook_token || "").trim();
    const previousToken = String(existing?.credentials?.webhook_token_previous || existing?.credentials?.webhook_token_prev || "").trim();
    const nextToken = String(mergedCredentials.webhook_token || "").trim();
    if (currentToken && nextToken && currentToken !== nextToken) {
      mergedCredentials.webhook_token_previous = currentToken;
    } else if (previousToken && !String(mergedCredentials.webhook_token_previous || "").trim()) {
      mergedCredentials.webhook_token_previous = previousToken;
    }
  }

  const enc = encryptJson(env.MASTER_KEY, mergedCredentials);
  const res = await db.query<any>(
    `
      insert into public.acquirer_configs(acquirer_name, active, credentials, credentials_ciphertext, credentials_iv, credentials_tag)
      values ($1, $2, $3, $4, $5, $6)
      on conflict (acquirer_name)
      do update set
        active = excluded.active,
        credentials = excluded.credentials,
        credentials_ciphertext = excluded.credentials_ciphertext,
        credentials_iv = excluded.credentials_iv,
        credentials_tag = excluded.credentials_tag,
        updated_at = now()
      returning acquirer_name, active
    `,
    [key, active, JSON.stringify({}), enc.ciphertext, enc.iv, enc.tag]
  );
  acquirerConfigCache.delete(key);
  return res.rows[0] ?? null;
}

async function buildAdminAcquirersOverview(db: Db, env: Env) {
  const names = ACQUIRER_CATALOG.map((a) => normalizeAcquirerName(a.acquirer_name));
  const cfgRes = await db.query<any>(
    "select acquirer_name, active, credentials, credentials_ciphertext, credentials_iv, credentials_tag, updated_at from public.acquirer_configs where acquirer_name = any($1::text[])",
    [names]
  );
  const cfgMap = new Map<string, { active: boolean; credentials: any; updated_at: string | null }>();
  for (const row of cfgRes.rows) {
    const key = normalizeAcquirerName(row.acquirer_name);
    const encrypted = row.credentials_ciphertext && row.credentials_iv && row.credentials_tag
      ? { ciphertext: row.credentials_ciphertext, iv: row.credentials_iv, tag: row.credentials_tag }
      : null;
    const creds = decryptJson(env.MASTER_KEY, encrypted) || row.credentials || {};
    cfgMap.set(key, {
      active: !!row.active,
      credentials: creds,
      updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : null,
    });
  }

  const healthRes = await db.query<any>(
    "select acquirer_name, ok, message, checked_at from public.acquirer_health where acquirer_name = any($1::text[])",
    [names]
  );
  const healthMap = new Map<string, { ok: boolean; message: string; checked_at: string | null }>();
  for (const row of healthRes.rows) {
    healthMap.set(normalizeAcquirerName(row.acquirer_name), {
      ok: !!row.ok,
      message: String(row.message || ""),
      checked_at: row.checked_at ? new Date(row.checked_at).toISOString() : null,
    });
  }

  const configurableAcquirers = ACQUIRER_CATALOG
    .filter((entry) => entry.implemented)
    .map((entry) => {
      const key = normalizeAcquirerName(entry.acquirer_name);
      const cfg = cfgMap.get(key) || { active: false, credentials: {}, updated_at: null };
      const health = healthMap.get(key) || { ok: false, message: "", checked_at: null };
      const hasCreds = hasRequiredCredentials(entry.required_credentials, cfg.credentials);
      const computed = computeAcquirerConnectionStatus({
        implemented: entry.implemented,
        active: !!cfg.active,
        hasRequiredCredentials: hasCreds,
        configUpdatedAt: cfg.updated_at,
        healthOk: health.checked_at ? !!health.ok : null,
        healthMessage: health.message || "",
        healthCheckedAt: health.checked_at,
      });

      return {
        acquirer_name: key,
        implemented: entry.implemented,
        methods_supported: entry.methods_supported,
        active: !!cfg.active,
        configured: !!Object.values(cfg.credentials || {}).some((value) => String(value || "").trim().length > 0),
        has_required_credentials: hasCreds,
        connection_test_ok: !!health.ok,
        connection_test_message: health.message || "",
        last_checked_at: health.checked_at,
        status: computed.status,
        reason: computed.reason,
        needs_retest: computed.needsRetest,
        config_updated_at: cfg.updated_at,
      };
    });

  const statusMap = new Map(configurableAcquirers.map((entry) => [normalizeAcquirerName(entry.acquirer_name), entry]));

  const mappingsRes = await db.query<any>(
    "select method, acquirer_name from public.payment_method_acquirers order by method asc"
  );
  const mappingMap = new Map<string, string>();
  for (const row of mappingsRes.rows) {
    mappingMap.set(String(row.method || ""), normalizeAcquirerName(row.acquirer_name));
  }

  const allMethods: PaymentMethodLabel[] = ["PIX", "Cartão", "Boleto", "Cashout"];
  const paymentMethods = allMethods.map((method) => {
    const currentAcquirer = mappingMap.get(method) || null;
    const options = ACQUIRER_CATALOG.map((entry) => {
      if (!entry.implemented) {
        return { acquirer_name: entry.acquirer_name, selectable: false, reason: "Integração em desenvolvimento." };
      }
      if (!entry.methods_supported.includes(method)) {
        return { acquirer_name: entry.acquirer_name, selectable: false, reason: `${entry.acquirer_name} não suporta ${method}.` };
      }
      const status = statusMap.get(normalizeAcquirerName(entry.acquirer_name));
      if (!status) return { acquirer_name: entry.acquirer_name, selectable: false, reason: "Carregando status..." };
      if (status.status === "connected") return { acquirer_name: entry.acquirer_name, selectable: true, reason: "" };
      if (status.status === "inactive") return { acquirer_name: entry.acquirer_name, selectable: false, reason: status.reason || "Inativo." };
      if (status.status === "not_configured") return { acquirer_name: entry.acquirer_name, selectable: false, reason: status.reason || "Configuração pendente." };
      if (status.status === "pending_test") return { acquirer_name: entry.acquirer_name, selectable: false, reason: status.reason || "Teste de conexão pendente." };
      if (status.status === "test_failed") return { acquirer_name: entry.acquirer_name, selectable: false, reason: status.reason || "Falha no teste de conexão." };
      return { acquirer_name: entry.acquirer_name, selectable: false, reason: "Indisponível." };
    });

    return {
      method,
      current_acquirer_name: currentAcquirer,
      current_status: currentAcquirer ? (statusMap.get(currentAcquirer)?.status || null) : null,
      options,
    };
  });

  const availableForActivation = ACQUIRER_CATALOG
    .filter((entry) => !entry.implemented)
    .map((entry) => ({
      acquirer_name: entry.acquirer_name,
      implemented: entry.implemented,
      methods_supported: entry.methods_supported,
    }));

  return {
    configurableAcquirers,
    availableForActivation,
    paymentMethods,
  };
}

function hmacSha256Hex(secret: string, body: string): string {
  const h = crypto.createHmac("sha256", secret);
  h.update(body);
  return `sha256=${h.digest("hex")}`;
}

async function sendWithRetry(url: string, payload: string, signature: string): Promise<{ statusCode: number; responseTime: number; success: boolean; attempt: number }> {
  const maxRetries = 3;
  const delays = [5000, 30000, 300000];
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const start = Date.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);
      const res = await fetch(url, {
        method: "POST",
        redirect: "manual",
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Signature": signature,
          "X-Webhook-Timestamp": new Date().toISOString(),
          "User-Agent": "DingitalPay-Webhooks/1.0"
        },
        body: payload,
        signal: controller.signal
      });
      clearTimeout(timeout);
      const responseTime = Date.now() - start;
      const success = res.status >= 200 && res.status < 300;
      await res.text();

      // Never follow redirects for outbound webhooks (SSRF hardening).
      if (res.status >= 300 && res.status < 400) {
        return { statusCode: res.status, responseTime, success: false, attempt };
      }

      if (success || (res.status >= 400 && res.status < 500)) {
        return { statusCode: res.status, responseTime, success, attempt };
      }
      if (attempt < maxRetries) await new Promise((r) => setTimeout(r, delays[attempt - 1] || 5000));
      else return { statusCode: res.status, responseTime, success: false, attempt };
    } catch {
      const responseTime = Date.now() - start;
      if (attempt >= maxRetries) return { statusCode: 0, responseTime, success: false, attempt };
      await new Promise((r) => setTimeout(r, delays[attempt - 1] || 5000));
    }
  }
  return { statusCode: 0, responseTime: 0, success: false, attempt: 3 };
}

function extractOrderId(payload: any): string | null {
  const direct = String(payload?.external_id || payload?.externalId || payload?.order_id || payload?.orderId || "").trim();
  if (direct) return direct;
  const nested = String(payload?.data?.external_id || payload?.data?.externalId || payload?.data?.order_id || "").trim();
  return nested || null;
}

function shouldApplyStatusTransition(current: string, next: string): boolean {
  const c = String(current || "").trim().toLowerCase();
  const n = String(next || "").trim().toLowerCase();
  if (!n) return false;
  if (!c) return true;
  if (c === n) return false;
  const terminal = new Set(["refunded", "chargeback", "abandoned"]);
  if (terminal.has(c)) return false;
  if (c === "approved") return n === "refunded" || n === "chargeback";
  if (c === "pending") return true;
  return true;
}

function isUuidLike(value: any): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || "").trim());
}

function normalizeOptionalString(value: any): string | null {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function normalizeOrderStatus(value: any): string {
  return String(value || "").trim().toLowerCase();
}

function extractRoundedAmount(value: any): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return roundCurrency(parsed);
}

function providerAmountMatchesOrder(order: any, providerAmount: any): boolean {
  const remoteAmount = extractRoundedAmount(providerAmount);
  if (remoteAmount === null) return true;
  const expectedAmount = roundCurrency(order?.gross_amount ?? order?.amount ?? 0);
  return remoteAmount === expectedAmount;
}

type ProviderOrderMutationDecision = {
  currentStatus: string;
  nextStatus: string;
  statusChanged: boolean;
  canTransition: boolean;
  currentTransactionId: string | null;
  incomingTransactionId: string | null;
  nextTransactionId: string | null;
  txMismatch: boolean;
  txAttached: boolean;
  shouldPersistStatus: boolean;
  shouldPersistTransactionId: boolean;
  shouldPersist: boolean;
};

function evaluateProviderOrderMutation(order: any, nextStatusRaw: any, incomingTransactionIdRaw: any): ProviderOrderMutationDecision {
  const currentStatus = normalizeOrderStatus(order?.status);
  const nextStatus = normalizeOrderStatus(nextStatusRaw);
  const statusChanged = currentStatus !== nextStatus;
  const canTransition = shouldApplyStatusTransition(currentStatus, nextStatus);
  const currentTransactionId = normalizeOptionalString(order?.transaction_id);
  const incomingTransactionId = normalizeOptionalString(incomingTransactionIdRaw);
  const txMismatch = Boolean(currentTransactionId && incomingTransactionId && currentTransactionId !== incomingTransactionId);
  const txAttached = !currentTransactionId && Boolean(incomingTransactionId);
  const shouldPersistStatus = statusChanged && canTransition && !txMismatch;
  const shouldPersistTransactionId = txAttached && !txMismatch;
  return {
    currentStatus,
    nextStatus,
    statusChanged,
    canTransition,
    currentTransactionId,
    incomingTransactionId,
    nextTransactionId: currentTransactionId || incomingTransactionId,
    txMismatch,
    txAttached,
    shouldPersistStatus,
    shouldPersistTransactionId,
    shouldPersist: shouldPersistStatus || shouldPersistTransactionId,
  };
}

function buildSecurityAuditRequest(req?: any): any {
  return req || ({ headers: {}, ip: "", auth: null } as any);
}

async function auditPaymentStateRejection(
  db: Db,
  env: Env,
  req: any,
  route: string,
  code: string,
  meta: Record<string, any>
) {
  await logSecurityEvent(db, env, buildSecurityAuditRequest(req), {
    route,
    eventType: "payment_state_rejected",
    code,
    meta,
  });
}

async function auditCheckoutRejection(
  db: Db,
  env: Env,
  req: any,
  route: string,
  code: string,
  meta: Record<string, any>
) {
  await logSecurityEvent(db, env, buildSecurityAuditRequest(req), {
    route,
    eventType: "checkout_rejected",
    code,
    meta,
  });
}

async function auditPaymentProviderFailure(
  db: Db,
  env: Env,
  req: any,
  route: string,
  code: string,
  meta: Record<string, any>
) {
  await logSecurityEvent(db, env, buildSecurityAuditRequest(req), {
    route,
    eventType: "payment_provider_error",
    code,
    meta,
  });
}

async function fetchKipayTransactionById(db: Db, env: Env, transactionId: string): Promise<{ ok: boolean; statusCode: number; body?: any; error?: string }> {
  const kipayCfg = await loadAcquirerConfig(db, env, "KIPAY");
  const kipayCreds = (kipayCfg && kipayCfg.active) ? (kipayCfg.credentials || {}) : {};
  const kipayBase = String(kipayCreds?.api_url || process.env.KIPAY_API_URL || KIPAY_DEFAULT_BASE_URL).replace(/\/+$/, "");
  const kipaySecret = String(kipayCreds?.api_secret || process.env.KIPAY_API_SECRET || "").trim() || null;
  if (!kipaySecret) return { ok: false, statusCode: 500, error: "KIPAY_API_SECRET_MISSING" };

  try {
    const res = await fetch(`${kipayBase}/api/compat/v1/transactions/${encodeURIComponent(transactionId)}?refresh=1`, {
      method: "GET",
      headers: {
        "x-api-secret": kipaySecret,
        "content-type": "application/json",
      },
    });
    const text = await res.text();
    let body: any = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
    return {
      ok: res.ok,
      statusCode: res.status,
      body,
      error: res.ok ? undefined : String(body?.message || body?.error || `HTTP_${res.status}`),
    };
  } catch (error: any) {
    return {
      ok: false,
      statusCode: 0,
      error: String(error?.message || error || "KIPAY_FETCH_FAILED"),
    };
  }
}

function formatBRL(value: any): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return String(value ?? "");
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}

function getClientIpFromRequest(req: any): string {
  const realIp = String(req?.headers?.["x-real-ip"] || "").trim();
  if (realIp) return realIp;
  return String(req?.ip || "").trim();
}

export function buildPublicOrderStatusPayload(order: { id?: any; status?: any; updated_at?: any } | null | undefined) {
  return {
    id: String(order?.id || "").trim(),
    status: String(order?.status || "").trim().toLowerCase(),
    updated_at: order?.updated_at ?? null,
  };
}

function roundCurrency(value: any): number {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return 0;
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

const PAYMENT_TOKEN_TTL_MS = 30 * 60 * 1000;

type AllowedOrderBumpConfig = {
  productId: string;
  discountEnabled: boolean;
  discountPercentage: number;
};

function parseAllowedOrderBumpConfigs(config: any): AllowedOrderBumpConfig[] {
  const rawItems = Array.isArray(config?.order_bump_items)
    ? config.order_bump_items
    : config?.order_bump_product_id
      ? [{
          product_id: config.order_bump_product_id,
          discount_enabled: Number(config?.order_bump_discount ?? 0) > 0,
          discount_percentage: Number(config?.order_bump_discount ?? 30),
        }]
      : [];

  const seen = new Set<string>();
  const parsed: AllowedOrderBumpConfig[] = [];
  for (const item of rawItems) {
    const productId = String(item?.product_id || "").trim();
    if (!productId || seen.has(productId)) continue;
    seen.add(productId);
    const discountEnabled = item?.discount_enabled !== false;
    const discountPercentage = discountEnabled ? Math.max(0, Number(item?.discount_percentage ?? 30)) : 0;
    parsed.push({
      productId,
      discountEnabled,
      discountPercentage,
    });
  }
  return parsed;
}

async function syncOnboardingCustomerAccess(env: Env, db: Db, order: any): Promise<OnboardingEnsureResult | null> {
  const buyerEmail = String(order?.buyer_email || "").trim().toLowerCase();
  const productId = String(order?.product_id || "").trim();
  const token = String(env.PROVISIONING_INTERNAL_API_TOKEN || "").trim();
  const baseUrl = String(env.PROVISIONING_INTERNAL_BASE_URL || "").trim().replace(/\/+$/, "");
  if (!buyerEmail || ![ONBOARDING_SOURCE_PRODUCT_ID, ONBOARDING_PRO_PLAN_PRODUCT_ID].includes(productId) || !token || !baseUrl) return null;

  const entitlementMap = await fetchActiveEntitlementCountsByEmail(db, [buyerEmail], [ONBOARDING_SOURCE_PRODUCT_ID, ONBOARDING_PRO_PLAN_PRODUCT_ID]);
  const counts = entitlementMap.get(buyerEmail) || new Map<string, number>();
  const hasStarter = (counts.get(ONBOARDING_SOURCE_PRODUCT_ID) || 0) > 0;
  const hasPro = (counts.get(ONBOARDING_PRO_PLAN_PRODUCT_ID) || 0) > 0;
  if (!hasStarter) return null;

  try {
    const res = await fetch(`${baseUrl}/internal/licenses/ensure`, {
      method: "POST",
      headers: {
        "x-internal-token": token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: buyerEmail,
        productKey: ONBOARDING_PRODUCT_KEY,
        maxActivations: 1,
        sendEmail: false,
        mintInstallToken: false,
        updatesEnabled: hasPro,
      }),
    });
    const json = (await res.json().catch(() => null)) as OnboardingEnsureResult | null;
    if (!res.ok || !json?.ok) return null;
    return {
      ok: true,
      licenseId: String(json.licenseId || ""),
      onboardingPassword: json.onboardingPassword || null,
    };
  } catch {
    return null;
  }
}

async function enqueueOrderEmails(db: Db, env: Env, order: any, prevStatus: string, nextStatus: string) {
  const buyerEmail = String(order?.buyer_email || "").trim();
  const buyerName = String(order?.buyer_name || "").trim() || "Cliente";
  const productName = String(order?.product_name || "").trim() || "Produto";
  const orderId = String(order?.id || "").trim();
  const productId = String(order?.product_id || "").trim();

  const status = String(nextStatus || "").trim().toLowerCase();
  if (status === "approved" && buyerEmail) {
    const onboardingAccess = await syncOnboardingCustomerAccess(env, db, order);
    if (productId === ONBOARDING_SOURCE_PRODUCT_ID && onboardingAccess?.onboardingPassword) {
      await enqueueOnboardingAccessEmail(db, {
        productId: ONBOARDING_SOURCE_PRODUCT_ID,
        to: buyerEmail,
        customerName: buyerName,
        customerEmail: buyerEmail,
        productName,
        loginEmail: buyerEmail,
        onboardingPassword: onboardingAccess.onboardingPassword,
        licenseId: onboardingAccess.licenseId || null,
        dedupeKey: `order:onboarding_access:${orderId}:${buyerEmail}`,
      }).catch(() => {});
    }
  }
  await queueOrderLifecycleEmails(db, {
    orderId,
    sellerId: String(order?.seller_id || "").trim(),
    productId,
    productName,
    buyerEmail,
    buyerName,
    amount: order?.gross_amount ?? order?.amount ?? 0,
    status,
  }).catch(() => {});

  // Avoid unused vars
  void prevStatus;
}

function sha256HexNormalized(value: string): string {
  const normalized = String(value || "").trim().toLowerCase();
  return crypto.createHash("sha256").update(normalized, "utf8").digest("hex");
}

function normalizePhoneToE164Br(phone: string): string | null {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return null;
  // Best-effort BR default. If already has country code, keep.
  const withCc = digits.startsWith("55") ? digits : `55${digits}`;
  // Avoid absurd lengths (anti-garbage)
  if (withCc.length < 10 || withCc.length > 15) return null;
  return withCc;
}

function pickFirstAndLastName(name: string): { fn?: string; ln?: string } {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return {};
  if (parts.length === 1) return { fn: parts[0] };
  return { fn: parts[0], ln: parts[parts.length - 1] };
}

function nonEmpty(value: any): string | null {
  const v = String(value ?? "").trim();
  return v ? v : null;
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

type FacebookPixelSendResult = {
  pixel_id: string;
  status: "success" | "failed" | "skipped";
  reason?: string;
  events_received?: number;
};

function buildFacebookUserDataFromOrder(order: any) {
  const em = nonEmpty(order.buyer_email) ? sha256HexNormalized(String(order.buyer_email)) : null;
  const phRaw = normalizePhoneToE164Br(String(order.buyer_phone || ""));
  const ph = phRaw ? sha256HexNormalized(phRaw) : null;
  const { fn, ln } = pickFirstAndLastName(String(order.buyer_name || ""));
  const fnHash = fn ? sha256HexNormalized(fn) : null;
  const lnHash = ln ? sha256HexNormalized(ln) : null;

  const userData: any = {};
  if (em) userData.em = em;
  if (ph) userData.ph = ph;
  if (fnHash) userData.fn = fnHash;
  if (lnHash) userData.ln = lnHash;
  if (nonEmpty(order.client_ip)) userData.client_ip_address = String(order.client_ip);
  if (nonEmpty(order.client_user_agent)) userData.client_user_agent = String(order.client_user_agent).slice(0, 500);
  if (nonEmpty(order.meta_fbc)) userData.fbc = String(order.meta_fbc);
  if (nonEmpty(order.meta_fbp)) userData.fbp = String(order.meta_fbp);
  return userData;
}

function buildFacebookCustomDataFromOrder(order: any) {
  return {
    value: Number(order.gross_amount ?? 0),
    currency: "BRL",
    content_name: String(order.product_name || ""),
    content_ids: [String(order.product_id)],
    content_type: "product",
  };
}

async function sendFacebookEventForOrder(
  db: Db,
  env: Env,
  orderId: string,
  eventName: "Purchase" | "InitiateCheckout",
  opts?: {
    forceRetry?: boolean;
    eventId?: string;
    requireApproved?: boolean;
    requirePix?: boolean;
  }
): Promise<FacebookPixelSendResult[]> {
  const orderRes = await db.query<any>(
    `
      select
        id, status, method, product_id, product_name,
        buyer_email, buyer_phone, buyer_name,
        gross_amount,
        client_ip, client_user_agent, checkout_url,
        meta_fbc, meta_fbp
      from public.orders
      where id = $1
      limit 1
    `,
    [orderId]
  );
  const order = orderRes.rows[0];
  if (!order) return [];

  const status = String(order.status || "").trim().toLowerCase();
  const method = String(order.method || "").trim().toLowerCase();
  if (opts?.requireApproved && status !== "approved") return [];
  if (opts?.requirePix && method !== "pix") return [];

  const pixelsRes = await db.query<any>(
    "select pixel_id, access_token from public.product_pixels where product_id = $1 and platform = 'facebook' and active = true and access_token <> ''",
    [order.product_id]
  );
  const pixels = pixelsRes.rows || [];
  if (!pixels.length) return [];

  const eventTime = Math.floor(Date.now() / 1000);
  const eventId = nonEmpty(opts?.eventId) || `order:${order.id}:${eventName}`;
  const eventSourceUrl = nonEmpty(order.checkout_url) || nonEmpty(env.PUBLIC_BASE_URL) || undefined;
  const userData = buildFacebookUserDataFromOrder(order);
  const customData = buildFacebookCustomDataFromOrder(order);
  const metaFbcPresent = Boolean(nonEmpty(order.meta_fbc));
  const metaFbpPresent = Boolean(nonEmpty(order.meta_fbp));

  const results: FacebookPixelSendResult[] = [];

  for (const pixel of pixels) {
    const pixelId = String(pixel.pixel_id || "").trim();
    const accessToken = String(pixel.access_token || "").trim();
    if (!pixelId || !accessToken) continue;

    const inserted = await db.query<any>(
      `
        insert into public.pixel_event_logs(
          order_id, platform, pixel_id, event_name, event_id, status, response, error, meta_fbc_present, meta_fbp_present
        )
        values ($1, 'facebook', $2, $3, $4, 'pending', null, null, $5, $6)
        on conflict (order_id, platform, pixel_id, event_name) do nothing
        returning id
      `,
      [order.id, pixelId, eventName, eventId, metaFbcPresent, metaFbpPresent]
    );

    if (!inserted.rows[0]) {
      const existing = await db.query<any>(
        `
          select id, status
          from public.pixel_event_logs
          where order_id = $1 and platform = 'facebook' and pixel_id = $2 and event_name = $3
          limit 1
        `,
        [order.id, pixelId, eventName]
      );
      const existingStatus = String(existing.rows[0]?.status || "").trim().toLowerCase();
      const canRetry = opts?.forceRetry === true && existingStatus === "failed";
      if (!canRetry) {
        results.push({ pixel_id: pixelId, status: "skipped", reason: existingStatus ? `already_${existingStatus}` : "already_exists" });
        continue;
      }

      await db.query(
        `
          update public.pixel_event_logs
          set status = 'pending',
              response = null,
              error = null,
              event_id = $4,
              meta_fbc_present = $5,
              meta_fbp_present = $6
          where order_id = $1 and platform = 'facebook' and pixel_id = $2 and event_name = $3
        `,
        [order.id, pixelId, eventName, eventId, metaFbcPresent, metaFbpPresent]
      );
    }

    const payload = {
      data: [
        {
          event_name: eventName,
          event_time: eventTime,
          event_id: eventId,
          event_source_url: eventSourceUrl,
          action_source: "website",
          user_data: userData,
          custom_data: customData,
        }
      ],
    };

    const url = `https://graph.facebook.com/${FB_API_VERSION}/${encodeURIComponent(pixelId)}/events?access_token=${encodeURIComponent(accessToken)}`;
    let successResult: FacebookPixelSendResult | null = null;
    let finalError = "CAPI request failed";
    let finalResponse: any = null;

    for (let attempt = 1; attempt <= 3; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8_000);
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        clearTimeout(timeout);
        const json = await res.json().catch(() => ({}));

        if (res.ok) {
          finalResponse = json || {};
          successResult = {
            pixel_id: pixelId,
            status: "success",
            events_received: Number(json?.events_received || 0) || 0,
          };
          break;
        }

        finalResponse = json || {};
        finalError = String(json?.error?.message || "CAPI request failed");
        if (res.status >= 500 && attempt < 3) {
          await sleep(attempt * 1000);
          continue;
        }
        break;
      } catch (error: any) {
        clearTimeout(timeout);
        finalError = String(error?.name === "AbortError" ? "CAPI timeout" : (error?.message || "CAPI request failed"));
        finalResponse = null;
        if (attempt < 3) {
          await sleep(attempt * 1000);
          continue;
        }
      }
    }

    if (successResult) {
      await db.query(
        `
          update public.pixel_event_logs
          set status = 'success',
              response = $5::jsonb,
              error = null,
              event_id = $4,
              meta_fbc_present = $6,
              meta_fbp_present = $7
          where order_id = $1 and platform = 'facebook' and pixel_id = $2 and event_name = $3
        `,
        [order.id, pixelId, eventName, eventId, JSON.stringify(finalResponse || {}), metaFbcPresent, metaFbpPresent]
      );
      results.push(successResult);
      continue;
    }

    await db.query(
      `
        update public.pixel_event_logs
        set status = 'failed',
            response = $5::jsonb,
            error = $6,
            event_id = $4,
            meta_fbc_present = $7,
            meta_fbp_present = $8
        where order_id = $1 and platform = 'facebook' and pixel_id = $2 and event_name = $3
      `,
      [order.id, pixelId, eventName, eventId, finalResponse ? JSON.stringify(finalResponse) : null, finalError.slice(0, 800), metaFbcPresent, metaFbpPresent]
    );
    results.push({ pixel_id: pixelId, status: "failed", reason: finalError });
  }

  return results;
}

async function sendFacebookPixPurchaseForOrder(
  db: Db,
  env: Env,
  orderId: string,
  opts?: { forceRetry?: boolean; source?: string }
) : Promise<FacebookPixelSendResult[]> {
  return sendFacebookEventForOrder(db, env, orderId, "Purchase", {
    forceRetry: opts?.forceRetry,
    requireApproved: true,
    requirePix: true,
  });
}

async function sendFacebookInitiateCheckoutForOrder(
  db: Db,
  env: Env,
  orderId: string,
  eventId?: string
): Promise<FacebookPixelSendResult[]> {
  return sendFacebookEventForOrder(db, env, orderId, "InitiateCheckout", {
    eventId,
  });
}

function normalizeAffiliateCode(raw: unknown): string | null {
  const value = String(raw || "").trim();
  if (!value) return null;
  const normalized = value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  if (normalized.length < 6 || normalized.length > 64) return null;
  return normalized;
}

async function resolveAffiliateAttributionForOrder(
  db: Db,
  input: { productId: string; offerId?: string | null; sellerId: string; utm?: Record<string, any> | null }
): Promise<{ affiliate_user_id: string; affiliate_link_id: string } | null> {
  const utm = input.utm || {};
  const raw = utm.ref ?? utm.affiliate ?? utm.aff ?? null;
  const code = normalizeAffiliateCode(raw);
  if (!code) return null;

  const res = await db.query<any>(
    `
      select
        l.id,
        l.affiliate_user_id,
        l.product_id,
        l.offer_id,
        ap.enabled as program_enabled
      from public.affiliate_links l
      left join public.affiliate_programs ap on ap.product_id = l.product_id
      where upper(l.code) = upper($1)
      limit 1
    `,
    [code]
  );
  const link = res.rows[0];
  if (!link) return null;
  if (link.program_enabled !== true) return null;
  if (String(link.product_id || "") !== input.productId) return null;
  if (String(link.affiliate_user_id || "") === String(input.sellerId || "")) return null;

  const linkOfferId = link.offer_id ? String(link.offer_id) : null;
  const orderOfferId = input.offerId ? String(input.offerId) : null;
  if (linkOfferId && linkOfferId !== orderOfferId) return null;

  return { affiliate_user_id: String(link.affiliate_user_id || ""), affiliate_link_id: String(link.id || "") };
}

async function syncAffiliateCommissionForOrderStatus(db: Db, orderId: string, nextStatus: string) {
  const status = String(nextStatus || "").toLowerCase();
  if (!orderId) return;

  if (status === "approved") {
    const existing = await db.query<any>("select id from public.affiliate_commissions where order_id = $1 limit 1", [orderId]);
    if (existing.rows[0]) return;

    const orderRes = await db.query<any>(
      `
        select
          id,
          seller_id,
          product_id,
          amount,
          affiliate_link_id,
          affiliate_user_id
        from public.orders
        where id = $1
        limit 1
      `,
      [orderId]
    );
    const order = orderRes.rows[0];
    if (!order) return;
    if (!order.affiliate_user_id) return;

    const programRes = await db.query<any>(
      "select enabled, commission_percent from public.affiliate_programs where product_id = $1 limit 1",
      [order.product_id]
    );
    const program = programRes.rows[0];
    if (!program || program.enabled !== true) return;

    const percent = roundCurrency(program.commission_percent || 0);
    if (percent <= 0) return;
    const base = roundCurrency(order.amount || 0);
    const amount = roundCurrency((base * percent) / 100);
    if (amount <= 0) return;

    await db.query(
      `
        insert into public.affiliate_commissions(order_id, affiliate_link_id, affiliate_user_id, seller_id, product_id, commission_percent, commission_amount, status)
        values ($1,$2,$3,$4,$5,$6,$7,'pending')
        on conflict (order_id) do nothing
      `,
      [order.id, order.affiliate_link_id || null, order.affiliate_user_id, order.seller_id, order.product_id, percent, amount]
    );
    return;
  }

  if (status === "refunded" || status === "chargeback" || status === "abandoned") {
    await db.query("update public.affiliate_commissions set status = 'canceled' where order_id = $1 and status <> 'paid'", [orderId]);
  }
}

export async function registerFunctions(app: FastifyInstance, db: Db, env: Env) {
  // In-memory anti-abuse cache for Mercado Pago webhook: prevents repeated external fetches for the same invalid payment ID.
  const mpNotFoundCache = new Map<string, number>(); // paymentId -> expiresAtMs

  // create-order (public)
  app.post("/functions/create-order", async (req, reply) => {
    const body = z.object({
      product_id: z.string().uuid(),
      offer_id: z.string().uuid().optional(),
      buyer_email: z.string().email(),
      buyer_name: z.string().optional().default(""),
      buyer_phone: z.string().optional().default(""),
      buyer_cpf: z.string().optional().default(""),
      method: z.enum(["pix", "credit_card", "boleto"]),
      utm: z.record(z.any()).optional(),
      meta_fbc: z.string().optional(),
      meta_fbp: z.string().optional(),
      meta_initiate_checkout_event_id: z.string().optional(),
      items: z.array(z.object({
        product_id: z.string().uuid(),
        product_name: z.string().optional(),
        amount: z.number().optional(),
        is_order_bump: z.boolean().optional()
      })).min(1)
    }).parse(req.body);

    const buyerEmail = body.buyer_email.trim().toLowerCase();
    const buyerName = String(body.buyer_name || "").trim();
    const buyerPhone = String(body.buyer_phone || "").trim();
    const buyerCpf = String(body.buyer_cpf || "").trim();

    const clientIp = getClientIpFromRequest(req);
    const clientUserAgent = String(req.headers["user-agent"] || "");
    const checkoutUrl = String(req.headers["referer"] || "");
    const metaFbc = nonEmpty(body.meta_fbc);
    const metaFbp = nonEmpty(body.meta_fbp);
    const initiateCheckoutEventId = nonEmpty(body.meta_initiate_checkout_event_id);
    const paymentToken = crypto.randomBytes(24).toString("base64url");
    const paymentTokenHash = hashToken(paymentToken);
    const paymentTokenExpiresAt = new Date(Date.now() + PAYMENT_TOKEN_TTL_MS).toISOString();

    const productRes = await db.query<any>(
      "select id, name, price, status, seller_id from public.products where id = $1 limit 1",
      [body.product_id]
    );
    const product = productRes.rows[0];
    if (!product) return reply.code(404).send({ error: "Produto não encontrado." });
    if (String(product.status).toLowerCase() !== "active") return reply.code(400).send({ error: "Produto indisponível." });

    let baseAmount = roundCurrency(product.price || 0);
    if (body.offer_id) {
      const offerRes = await db.query<any>(
        "select id, product_id, price, active from public.product_offers where id = $1 and product_id = $2 limit 1",
        [body.offer_id, body.product_id]
      );
      const offer = offerRes.rows[0];
      if (!offer || offer.active !== true) {
        await auditCheckoutRejection(db, env, req, "/api/functions/create-order", "INVALID_OFFER", {
          product_id: body.product_id,
          offer_id: body.offer_id,
        });
        return reply.code(400).send({ error: "Oferta inválida ou inativa." });
      }
      baseAmount = roundCurrency(offer.price || 0);
    }

    const affiliateAttribution = await resolveAffiliateAttributionForOrder(db, {
      productId: body.product_id,
      offerId: body.offer_id || null,
      sellerId: String(product.seller_id || ""),
      utm: (body.utm as any) || null,
    }).catch(() => null);

    const requestedBaseItems = body.items.filter((item) => !item.is_order_bump);
    if (requestedBaseItems.some((item) => String(item.product_id || "").trim() !== body.product_id)) {
      await auditCheckoutRejection(db, env, req, "/api/functions/create-order", "INVALID_PRIMARY_ITEM", {
        product_id: body.product_id,
        requested_product_ids: requestedBaseItems.map((item) => String(item.product_id || "").trim()).filter(Boolean),
      });
      return reply.code(400).send({ error: "Item principal inválido." });
    }

    const requestedOrderBumpIds = body.items
      .filter((item) => !!item.is_order_bump)
      .map((item) => String(item.product_id || "").trim())
      .filter(Boolean);
    if (new Set(requestedOrderBumpIds).size !== requestedOrderBumpIds.length) {
      await auditCheckoutRejection(db, env, req, "/api/functions/create-order", "DUPLICATE_ORDER_BUMP", {
        product_id: body.product_id,
        requested_order_bump_ids: requestedOrderBumpIds,
      });
      return reply.code(400).send({ error: "Order bumps duplicados não são permitidos." });
    }

    const checkoutConfigRes = await db.query<any>(
      "select order_bump_items, order_bump_product_id, order_bump_discount from public.product_checkout_config where product_id = $1 limit 1",
      [body.product_id]
    );
    const allowedOrderBumps = parseAllowedOrderBumpConfigs(checkoutConfigRes.rows[0] || null);
    const allowedOrderBumpsMap = new Map(allowedOrderBumps.map((item) => [item.productId, item] as const));

    const unauthorizedOrderBump = requestedOrderBumpIds.find((productId) => !allowedOrderBumpsMap.has(productId));
    if (unauthorizedOrderBump) {
      await auditCheckoutRejection(db, env, req, "/api/functions/create-order", "UNAUTHORIZED_ORDER_BUMP", {
        product_id: body.product_id,
        order_bump_product_id: unauthorizedOrderBump,
      });
      return reply.code(400).send({ error: "Order bump inválido para este checkout." });
    }

    let orderBumpProductsById = new Map<string, any>();
    if (requestedOrderBumpIds.length > 0) {
      const orderBumpProductsRes = await db.query<any>(
        "select id, name, price, status from public.products where id = any($1::uuid[])",
        [requestedOrderBumpIds]
      );
      orderBumpProductsById = new Map(orderBumpProductsRes.rows.map((row: any) => [String(row.id), row]));
      if (requestedOrderBumpIds.some((productId) => !orderBumpProductsById.has(productId))) {
        await auditCheckoutRejection(db, env, req, "/api/functions/create-order", "ORDER_BUMP_PRODUCT_NOT_FOUND", {
          product_id: body.product_id,
          requested_order_bump_ids: requestedOrderBumpIds,
        });
        return reply.code(400).send({ error: "Produto de order bump não encontrado." });
      }
      if (requestedOrderBumpIds.some((productId) => String(orderBumpProductsById.get(productId)?.status || "").toLowerCase() !== "active")) {
        await auditCheckoutRejection(db, env, req, "/api/functions/create-order", "ORDER_BUMP_PRODUCT_UNAVAILABLE", {
          product_id: body.product_id,
          requested_order_bump_ids: requestedOrderBumpIds,
        });
        return reply.code(400).send({ error: "Produto de order bump indisponível." });
      }
    }

    const itemsToInsert = [
      {
        product_id: body.product_id,
        product_name: String(product.name || "Produto"),
        amount: baseAmount,
        is_order_bump: false,
      },
      ...requestedOrderBumpIds.map((productId) => {
        const config = allowedOrderBumpsMap.get(productId)!;
        const bumpProduct = orderBumpProductsById.get(productId)!;
        const originalPrice = roundCurrency(bumpProduct.price || 0);
        const finalAmount = config.discountEnabled
          ? roundCurrency(originalPrice * (1 - config.discountPercentage / 100))
          : originalPrice;
        return {
          product_id: productId,
          product_name: String(bumpProduct.name || "Produto"),
          amount: finalAmount,
          is_order_bump: true,
        };
      }),
    ];

    const grossAmount = roundCurrency(itemsToInsert.reduce((sum, i) => sum + Number(i.amount), 0));
    if (grossAmount <= 0) {
      await auditCheckoutRejection(db, env, req, "/api/functions/create-order", "INVALID_ORDER_AMOUNT", {
        product_id: body.product_id,
        gross_amount: grossAmount,
      });
      return reply.code(400).send({ error: "Valor do pedido inválido." });
    }

    const orderInsert = await db.query<any>(
      `insert into public.orders(seller_id, product_id, buyer_email, buyer_name, buyer_phone, buyer_cpf, product_name, amount, method, status, transaction_id, utm, client_ip, client_user_agent, checkout_url, meta_fbc, meta_fbp, payment_token_hash, payment_token_expires_at, affiliate_link_id, affiliate_user_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending','',$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       returning id`,
      [
        product.seller_id,
        body.product_id,
        buyerEmail,
        buyerName,
        buyerPhone,
        buyerCpf,
        product.name || "",
        grossAmount,
        body.method,
        JSON.stringify(body.utm || {}),
        clientIp || null,
        clientUserAgent || null,
        checkoutUrl || null,
        metaFbc,
        metaFbp,
        paymentTokenHash,
        paymentTokenExpiresAt,
        affiliateAttribution?.affiliate_link_id || null,
        affiliateAttribution?.affiliate_user_id || null,
      ]
    );
    const orderId = String(orderInsert.rows[0]?.id || "");
    if (!orderId) return reply.code(500).send({ error: "Falha ao criar pedido." });

    try {
      await db.query(
        `insert into public.order_items(order_id, product_id, product_name, amount, is_order_bump)
         select $1, x.product_id::uuid, x.product_name::text, x.amount::numeric, x.is_order_bump::boolean
         from jsonb_to_recordset($2::jsonb) as x(product_id text, product_name text, amount numeric, is_order_bump boolean)`,
        [orderId, JSON.stringify(itemsToInsert)]
      );
    } catch {
      await db.query("delete from public.orders where id = $1", [orderId]);
      return reply.code(500).send({ error: "Falha ao criar itens do pedido." });
    }

    void sendFacebookInitiateCheckoutForOrder(db, env, orderId, initiateCheckoutEventId || undefined).catch(() => {});

    return reply.send({ order_id: orderId, payment_token: paymentToken });
  });

  // create-payment (public)
  app.post("/functions/create-payment", async (req, reply) => {
    const body = z.object({
      order_id: z.string().uuid(),
      payment_token: z.string().min(16),
      amount: z.number().positive(),
      method: z.enum(["pix", "credit_card", "boleto"]),
      buyer_email: z.string().email(),
      buyer_name: z.string().optional().default(""),
      buyer_cpf: z.string().optional().default(""),
      description: z.string().optional().default(""),
      card_token: z.string().optional(),
      installments: z.number().int().optional(),
      issuer_id: z.any().optional()
    }).parse(req.body);

    const acquirer = await loadAcquirerForMethod(db, body.method);
    const orderRes = await db.query<any>(
      "select id, product_id, amount, status, seller_id, gross_amount, platform_fee, method, buyer_email, buyer_name, buyer_cpf, payment_token_hash, payment_token_expires_at from public.orders where id = $1 limit 1",
      [body.order_id]
    );
    const order = orderRes.rows[0];
    if (!order) {
      await auditCheckoutRejection(db, env, req, "/api/functions/create-payment", "ORDER_NOT_FOUND", {
        order_id: body.order_id,
        method: body.method,
      });
      return reply.code(404).send({ error: "Pedido não encontrado." });
    }
    if (String(order.status) !== "pending") {
      await auditCheckoutRejection(db, env, req, "/api/functions/create-payment", "ORDER_ALREADY_PROCESSED", {
        order_id: body.order_id,
        current_status: String(order.status || ""),
      });
      return reply.code(400).send({ error: "Este pedido já foi processado." });
    }
    if (!order.payment_token_hash || hashToken(body.payment_token) !== String(order.payment_token_hash)) {
      await auditCheckoutRejection(db, env, req, "/api/functions/create-payment", "INVALID_PAYMENT_TOKEN", {
        order_id: body.order_id,
        method: body.method,
      });
      return reply.code(403).send({ error: "Sessão de pagamento inválida." });
    }
    const paymentTokenExpiresAt = order.payment_token_expires_at ? new Date(order.payment_token_expires_at).getTime() : 0;
    if (!Number.isFinite(paymentTokenExpiresAt) || paymentTokenExpiresAt <= Date.now()) {
      await auditCheckoutRejection(db, env, req, "/api/functions/create-payment", "PAYMENT_TOKEN_EXPIRED", {
        order_id: body.order_id,
        method: body.method,
      });
      return reply.code(403).send({ error: "Sessão de pagamento expirada. Refaça o checkout." });
    }
    if (String(order.method || "").trim().toLowerCase() !== String(body.method || "").trim().toLowerCase()) {
      await auditCheckoutRejection(db, env, req, "/api/functions/create-payment", "PAYMENT_METHOD_MISMATCH", {
        order_id: body.order_id,
        expected_method: String(order.method || ""),
        received_method: body.method,
      });
      return reply.code(400).send({ error: "Método de pagamento incompatível com o pedido." });
    }
    if (String(order.buyer_email || "").trim().toLowerCase() !== String(body.buyer_email || "").trim().toLowerCase()) {
      await auditCheckoutRejection(db, env, req, "/api/functions/create-payment", "BUYER_EMAIL_MISMATCH", {
        order_id: body.order_id,
        method: body.method,
      });
      return reply.code(400).send({ error: "Comprador incompatível com o pedido." });
    }
    if (String(order.buyer_name || "").trim() !== String(body.buyer_name || "").trim()) {
      await auditCheckoutRejection(db, env, req, "/api/functions/create-payment", "BUYER_NAME_MISMATCH", {
        order_id: body.order_id,
        method: body.method,
      });
      return reply.code(400).send({ error: "Dados do comprador incompatíveis com o pedido." });
    }
    const expectedCpf = String(order.buyer_cpf || "").replace(/\D/g, "");
    const providedCpf = String(body.buyer_cpf || "").replace(/\D/g, "");
    if (expectedCpf !== providedCpf) {
      await auditCheckoutRejection(db, env, req, "/api/functions/create-payment", "BUYER_CPF_MISMATCH", {
        order_id: body.order_id,
        method: body.method,
      });
      return reply.code(400).send({ error: "CPF incompatível com o pedido." });
    }

    const productRes = await db.query<any>("select id, name, price, status from public.products where id = $1 limit 1", [order.product_id]);
    const product = productRes.rows[0];
    if (!product) {
      await auditCheckoutRejection(db, env, req, "/api/functions/create-payment", "ORDER_PRODUCT_NOT_FOUND", {
        order_id: body.order_id,
        product_id: String(order.product_id || ""),
      });
      return reply.code(404).send({ error: "Produto não encontrado." });
    }
    if (String(product.status) !== "active") {
      await auditCheckoutRejection(db, env, req, "/api/functions/create-payment", "ORDER_PRODUCT_UNAVAILABLE", {
        order_id: body.order_id,
        product_id: String(order.product_id || ""),
      });
      return reply.code(400).send({ error: "Produto indisponível." });
    }

    const itemsRes = await db.query<any>("select amount from public.order_items where order_id = $1", [body.order_id]);
    const grossAmount = itemsRes.rows.length > 0
      ? itemsRes.rows.reduce((sum: number, item: any) => sum + Number(item.amount), 0)
      : Number(product.price || 0);
    const requestedAmount = roundCurrency(body.amount);
    const authoritativeGrossAmount = roundCurrency(grossAmount);
    if (requestedAmount > 0 && requestedAmount !== authoritativeGrossAmount) {
      await auditCheckoutRejection(db, env, req, "/api/functions/create-payment", "PAYMENT_AMOUNT_MISMATCH", {
        order_id: body.order_id,
        expected_amount: authoritativeGrossAmount,
        received_amount: requestedAmount,
        method: body.method,
      });
      return reply.code(400).send({ error: "Valor incompatível com o pedido." });
    }

    const feeRes = await db.query<any>("select fee_percent, fee_fixed from public.platform_fees where method = $1 limit 1", [body.method]);
    const feePercent = feeRes.rows[0] ? Number(feeRes.rows[0].fee_percent) : 0;
    const feeFixed = feeRes.rows[0] ? Number(feeRes.rows[0].fee_fixed) : 0;
    const afterPercent = grossAmount - (grossAmount * feePercent) / 100;
    const platformFee = (grossAmount * feePercent) / 100 + feeFixed;
    const netAmount = Math.max(afterPercent - feeFixed, 0);

    await db.query("update public.orders set gross_amount = $1, platform_fee = $2, amount = $3 where id = $4", [authoritativeGrossAmount, platformFee, netAmount, body.order_id]);

    if (normalizeAcquirerName(acquirer) === "KIPAY") {
      if (body.method !== "pix") {
        return reply.code(400).send({ error: "KIPAY habilitado apenas para PIX no momento. Ajuste o adquirente do método no Admin." });
      }

      const kipayCfg = await loadAcquirerConfig(db, env, "KIPAY");
      const kipayCreds = (kipayCfg && kipayCfg.active) ? (kipayCfg.credentials || {}) : {};

      const kipayBase = String(kipayCreds?.api_url || process.env.KIPAY_API_URL || KIPAY_DEFAULT_BASE_URL).replace(/\/+$/, "");
      const kipaySecret = String(kipayCreds?.api_secret || process.env.KIPAY_API_SECRET || "").trim() || null;
      const webhookToken = String(kipayCreds?.webhook_token || process.env.KIPAY_WEBHOOK_TOKEN || "").trim() || null;
      if (!kipaySecret) return reply.code(500).send({ error: "KIPAY não configurada. Cadastre as credenciais em Admin → Adquirentes (KIPAY) ou configure KIPAY_API_SECRET." });
      if (!webhookToken) return reply.code(500).send({ error: "KIPAY não configurada. Cadastre o Webhook Token em Admin → Adquirentes (KIPAY) ou configure KIPAY_WEBHOOK_TOKEN." });
      if (!body.buyer_cpf) return reply.code(400).send({ error: "CPF é obrigatório para pagamento via PIX (KIPAY)." });

      const webhookUrl = `${env.PUBLIC_BASE_URL}/api/functions/kipay-webhook/${encodeURIComponent(webhookToken)}`;
      const kipayResponse = await fetch(`${kipayBase}/api/compat/v1/transactions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-secret": kipaySecret,
          "Idempotency-Key": body.order_id
        },
        body: JSON.stringify({
          amount: Number(authoritativeGrossAmount),
          payment_method: "pix",
          external_id: body.order_id,
          webhook_url: webhookUrl,
          customer: {
            name: body.buyer_name || "Cliente",
            email: body.buyer_email,
            document: String(body.buyer_cpf || "").replace(/\D/g, "")
          },
          items: [
            {
              title: body.description || product.name,
              quantity: 1,
              price: Number(authoritativeGrossAmount),
              description: body.description || product.name,
              is_physical: false
            }
          ]
        })
      });
      const kipayData: any = await kipayResponse.json().catch(() => ({}));
      if (!kipayResponse.ok) {
        await auditPaymentProviderFailure(db, env, req, "/api/functions/create-payment", "KIPAY_PROVIDER_ERROR", {
          order_id: body.order_id,
          method: body.method,
          provider: "KIPAY",
          provider_status: kipayResponse.status,
          provider_error: String(kipayData?.message || kipayData?.error || "UNKNOWN"),
        });
        return reply.code(502).send({
          error: "Erro ao processar pagamento. Tente novamente em instantes.",
          code: "PAYMENT_PROVIDER_ERROR",
        });
      }
      const kipayTxId = String(kipayData?.id || "").trim();
      const pixPayload = String(kipayData?.pix?.payload || "").trim();
      if (!kipayTxId || !pixPayload) return reply.code(502).send({ error: "Resposta inválida da KIPAY (id/pix.payload ausentes)." });

      const orderStatus = mapKipayStatusToOrderStatus(kipayData?.status);
      const prevStatus = String(order.status || "");
      await db.query("update public.orders set transaction_id = $1, status = $2 where id = $3", [kipayTxId, orderStatus, body.order_id]);
      await syncOrderProductEntitlements(db, body.order_id).catch(() => {});
      await enqueueOrderEmails(db, env, { ...order, id: body.order_id, gross_amount: authoritativeGrossAmount }, prevStatus, orderStatus);

      // PIX Purchase via CAPI (server-side, idempotent). If KIPAY returns PAID immediately,
      // we may not receive a webhook transition later (status already approved), so send here too.
      if (orderStatus === "approved" && String(body.method || "").toLowerCase() === "pix" && prevStatus.toLowerCase() !== "approved") {
        sendFacebookPixPurchaseForOrder(db, env, String(body.order_id), { source: "create-payment" }).catch(() => {});
      }

      if (platformFee > 0 && orderStatus === "approved") {
        await db.query(
          "insert into public.platform_fee_logs(seller_id, order_id, type, method, gross_amount, fee_amount) values ($1,$2,'transaction',$3,$4,$5)",
          [order.seller_id, body.order_id, body.method, authoritativeGrossAmount, platformFee]
        );
      }

      return reply.send({
        provider: "KIPAY",
        method: body.method,
        payment_id: kipayTxId,
        status: String(kipayData?.status || "PENDING"),
        status_detail: "KIPAY",
        order_status: orderStatus,
        pix: {
          qr_code: pixPayload,
          qr_code_base64: "",
          expiration_date: ""
        }
      });
    }

    // Mercado Pago default
    const mpCfg = await loadAcquirerConfig(db, env, "MERCADO PAGO");
    const mpCreds = (mpCfg && mpCfg.active) ? (mpCfg.credentials || {}) : {};
    const mpToken =
      String(mpCreds?.access_token || "").trim() ||
      process.env.MERCADO_PAGO_ACCESS_TOKEN ||
      process.env.MP_ACCESS_TOKEN ||
      "";
    if (!mpToken) return reply.code(500).send({ error: "Token do Mercado Pago não configurado." });

    const paymentPayload: any = {
      transaction_amount: Number(authoritativeGrossAmount),
      description: body.description || product.name,
      external_reference: body.order_id,
      payer: {
        email: body.buyer_email,
        first_name: body.buyer_name?.split(" ")[0] || "",
        last_name: body.buyer_name?.split(" ").slice(1).join(" ") || ""
      }
    };
    if (body.buyer_cpf) {
      paymentPayload.payer.identification = { type: "CPF", number: body.buyer_cpf.replace(/\D/g, "") };
    }
    if (body.method === "pix") paymentPayload.payment_method_id = "pix";
    else if (body.method === "boleto") paymentPayload.payment_method_id = "bolbradesco";
    else {
      if (!body.card_token) return reply.code(400).send({ error: "card_token é obrigatório para pagamento com cartão de crédito." });
      paymentPayload.token = body.card_token;
      paymentPayload.installments = body.installments || 1;
      if (body.issuer_id) paymentPayload.issuer_id = body.issuer_id;
    }

    const mpResponse = await fetch(`${MP_API}/v1/payments`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${mpToken}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": body.order_id
      },
      body: JSON.stringify(paymentPayload)
    });
    const mpData: any = await mpResponse.json().catch(() => ({}));
    if (!mpResponse.ok) {
      await auditPaymentProviderFailure(db, env, req, "/api/functions/create-payment", "MP_PROVIDER_ERROR", {
        order_id: body.order_id,
        method: body.method,
        provider: "MERCADO_PAGO",
        provider_status: mpResponse.status,
        provider_error: String(mpData?.message || mpData?.cause?.[0]?.description || "UNKNOWN"),
      });
      return reply.code(502).send({
        error: "Erro ao processar pagamento. Tente novamente em instantes.",
        code: "PAYMENT_PROVIDER_ERROR",
      });
    }

    const orderStatus = mpData.status === "approved" ? "approved" : "pending";
    const prevStatus = String(order.status || "");
    await db.query("update public.orders set transaction_id = $1, status = $2 where id = $3", [String(mpData.id), orderStatus, body.order_id]);
    await syncOrderProductEntitlements(db, body.order_id).catch(() => {});
    await enqueueOrderEmails(db, env, { ...order, id: body.order_id, gross_amount: authoritativeGrossAmount }, prevStatus, orderStatus);

    // PIX Purchase via CAPI (server-side, idempotent). Keep it best-effort.
    if (orderStatus === "approved" && String(body.method || "").toLowerCase() === "pix" && prevStatus.toLowerCase() !== "approved") {
      sendFacebookPixPurchaseForOrder(db, env, String(body.order_id), { source: "create-payment" }).catch(() => {});
    }

    if (platformFee > 0 && orderStatus === "approved") {
      await db.query(
        "insert into public.platform_fee_logs(seller_id, order_id, type, method, gross_amount, fee_amount) values ($1,$2,'transaction',$3,$4,$5)",
        [order.seller_id, body.order_id, body.method, authoritativeGrossAmount, platformFee]
      );
    }

    const responseData: any = {
      provider: "MERCADO_PAGO",
      method: body.method,
      payment_id: mpData.id,
      status: mpData.status,
      status_detail: mpData.status_detail,
      order_status: orderStatus
    };
    if (body.method === "pix") {
      const pixData = mpData.point_of_interaction?.transaction_data;
      responseData.pix = { qr_code: pixData?.qr_code || "", qr_code_base64: pixData?.qr_code_base64 || "", expiration_date: pixData?.expiration_date || "" };
    } else if (body.method === "boleto") {
      responseData.boleto = { barcode: mpData.barcode?.content || "", external_resource_url: mpData.transaction_details?.external_resource_url || "", expiration_date: mpData.date_of_expiration || "" };
    } else if (body.method === "credit_card") {
      responseData.card = { last_four_digits: mpData.card?.last_four_digits || "", installments: mpData.installments || 1 };
    }
    return reply.send(responseData);
  });

  // Mercado Pago webhook (public)
  app.post("/functions/mp-webhook", async (req, reply) => {
    // Avoid 5xx on malformed/abusive requests. Only retry (5xx) for real transient failures.
    const cfg = await loadAcquirerConfig(db, env, "MERCADO PAGO");
    const creds = cfg?.active ? (cfg.credentials || {}) : {};
    const mpToken = String(creds.access_token || creds.mp_access_token || "").trim();
    if (!mpToken) {
      return reply.send({ received: true, ignored: true, reason: "mp_not_configured" });
    }

    const body: any = req.body && typeof req.body === "object" ? req.body : {};
    const type = String(body.type || "").trim();
    const action = String(body.action || "").trim();
    const isPaymentEvent = type === "payment" || action === "payment.updated" || action === "payment.created";
    if (!isPaymentEvent) return reply.send({ received: true, ignored: true, reason: "ignored_event" });

    const paymentIdRaw = body.data?.id ?? body?.data_id ?? body?.id;
    const paymentId = String(paymentIdRaw || "").trim();
    if (!paymentId) return reply.code(400).send({ error: "No payment ID" });
    // MP payment IDs are numeric. Reject obvious garbage early (cheap DoS hardening).
    if (!/^[0-9]{6,32}$/.test(paymentId)) return reply.send({ received: true, ignored: true, reason: "invalid_payment_id" });

    // short TTL cache: if we recently got 404 from MP for this id, do not refetch.
    const now = Date.now();
    const cachedExp = mpNotFoundCache.get(paymentId);
    if (cachedExp && cachedExp > now) return reply.send({ received: true, ignored: true, reason: "payment_not_found_cached" });
    if (cachedExp && cachedExp <= now) mpNotFoundCache.delete(paymentId);

    let mpResponse: Response;
    let mpData: any = {};
    try {
      mpResponse = await fetch(`${MP_API}/v1/payments/${encodeURIComponent(paymentId)}`, {
        headers: { Authorization: `Bearer ${mpToken}` },
      });
      mpData = await mpResponse.json().catch(() => ({}));
    } catch {
      // transient/network
      return reply.code(502).send({ error: "Failed to verify payment" });
    }

    // Common attacker path: random IDs -> 404. Treat as ignored (no 5xx).
    if (mpResponse.status === 404) {
      mpNotFoundCache.set(paymentId, Date.now() + 5 * 60_000);
      // best-effort cleanup
      if (mpNotFoundCache.size > 5000) {
        const t = Date.now();
        for (const [k, exp] of mpNotFoundCache) {
          if (exp <= t) mpNotFoundCache.delete(k);
          if (mpNotFoundCache.size <= 5000) break;
        }
      }
      return reply.send({ received: true, ignored: true, reason: "payment_not_found" });
    }
    if (mpResponse.status === 401 || mpResponse.status === 403) return reply.send({ received: true, ignored: true, reason: "mp_token_invalid" });
    if (!mpResponse.ok) return reply.code(502).send({ error: "Failed to verify payment" });

    const statusMap: Record<string, string> = {
      approved: "approved",
      authorized: "approved",
      pending: "pending",
      in_process: "pending",
      in_mediation: "pending",
      rejected: "abandoned",
      cancelled: "abandoned",
      refunded: "refunded",
      charged_back: "chargeback"
    };
    const orderStatus = statusMap[mpData.status] || "pending";
    const orderId = mpData.external_reference;
    if (!orderId) return reply.code(400).send({ error: "No order reference" });

    const orderRes = await db.query<any>("select * from public.orders where id = $1 limit 1", [orderId]);
    const order = orderRes.rows[0];
    if (!order) return reply.send({ received: true, ignored: true, reason: "order_not_found", order_id: orderId });

    if (!providerAmountMatchesOrder(order, mpData.transaction_amount ?? mpData.transaction_details?.total_paid_amount ?? null)) {
      await auditPaymentStateRejection(db, env, req, "/api/functions/mp-webhook", "MP_AMOUNT_MISMATCH", {
        orderId,
        paymentId,
        providerAmount: mpData.transaction_amount ?? mpData.transaction_details?.total_paid_amount ?? null,
        expectedAmount: roundCurrency(order?.gross_amount ?? order?.amount ?? 0),
      }).catch(() => {});
      return reply.send({ received: true, ignored: true, reason: "amount_mismatch", order_id: orderId });
    }

    const mutation = evaluateProviderOrderMutation(order, orderStatus, paymentId);
    if (mutation.txMismatch) {
      await auditPaymentStateRejection(db, env, req, "/api/functions/mp-webhook", "MP_TRANSACTION_MISMATCH", {
        orderId,
        paymentId,
        currentTransactionId: mutation.currentTransactionId,
      }).catch(() => {});
      return reply.send({ received: true, ignored: true, reason: "transaction_mismatch", order_id: orderId });
    }
    if (mutation.statusChanged && !mutation.canTransition) {
      await auditPaymentStateRejection(db, env, req, "/api/functions/mp-webhook", "MP_INVALID_TRANSITION", {
        orderId,
        paymentId,
        currentStatus: mutation.currentStatus,
        attemptedStatus: mutation.nextStatus,
      }).catch(() => {});
      return reply.send({ received: true, ignored: true, reason: "invalid_transition", order_id: orderId, status: mutation.currentStatus });
    }
    if (!mutation.shouldPersist) {
      return reply.send({ received: true, order_id: orderId, status: mutation.currentStatus || mutation.nextStatus, updated: false });
    }

    await db.query("update public.orders set status = $1, transaction_id = $2 where id = $3", [
      mutation.shouldPersistStatus ? mutation.nextStatus : mutation.currentStatus,
      mutation.nextTransactionId,
      orderId,
    ]);
    await syncOrderProductEntitlements(db, orderId).catch(() => {});

    if (mutation.shouldPersistStatus) {
      await enqueueOrderEmails(db, env, order, mutation.currentStatus, mutation.nextStatus);
    }

    if (mutation.shouldPersistStatus && mutation.nextStatus === "approved" && String(order.method || "").toLowerCase() === "pix") {
      sendFacebookPixPurchaseForOrder(db, env, String(orderId), { source: "mp-webhook" }).catch(() => {});
    }

    if (mutation.shouldPersistStatus && mutation.nextStatus === "approved") {
      const grossAmount = Number(order.gross_amount || 0);
      const platformFee = Number(order.platform_fee || 0);
      if (platformFee > 0) {
        const existing = await db.query<any>("select id from public.platform_fee_logs where order_id = $1 and type = 'transaction' limit 1", [orderId]);
        if (!existing.rows[0]) {
          await db.query(
            "insert into public.platform_fee_logs(seller_id, order_id, type, method, gross_amount, fee_amount) values ($1,$2,'transaction',$3,$4,$5)",
            [order.seller_id, orderId, order.method || "pix", grossAmount, platformFee]
          );
        }
      }
    }

    if (mutation.shouldPersistStatus) {
      await syncAffiliateCommissionForOrderStatus(db, String(orderId), String(mutation.nextStatus || "")).catch(() => {});
    }

    const webhookEventMap: Record<string, string> = {
      approved: "transaction.authorized",
      pending: "transaction.pending",
      refunded: "transaction.refunded",
      chargeback: "transaction.chargeback",
      abandoned: "transaction.expired"
    };
    const webhookEvent = webhookEventMap[mutation.nextStatus];
    if (webhookEvent && mutation.shouldPersistStatus) {
      await dispatchWebhook(db, env, { sellerId: String(order.seller_id || ""), event: webhookEvent, data: {
        id: order.id,
        value: Number(order.amount),
        payment_method: String(order.method || "pix").toUpperCase(),
        status: String(mpData.status || mutation.nextStatus).toUpperCase(),
        customer: {
          name: order.buyer_name,
          email: order.buyer_email,
          cpf: order.buyer_cpf || "",
          phone: order.buyer_phone || ""
        },
        product: { id: order.product_id, name: order.product_name },
        created_at: order.created_at,
        approved_at: new Date().toISOString()
      }});
    }

    return reply.send({ received: true, order_id: orderId, status: mutation.shouldPersistStatus ? mutation.nextStatus : mutation.currentStatus, updated: true });
  });

  async function applyOrderStateFromKipay(order: any, payload: any, source: string, audit?: { req?: any; route?: string }) {
    const kipayChargeId = String(payload?.id || payload?.charge_id || order?.transaction_id || "").trim() || null;
    const kipayStatus = String(payload?.status || payload?.data?.status || "").trim() || "PENDING";
    const nextStatus = mapKipayStatusToOrderStatus(kipayStatus);
    const auditRoute = audit?.route || `/api/functions/${source}`;

    if (!providerAmountMatchesOrder(order, payload?.amount ?? payload?.data?.amount ?? null)) {
      await auditPaymentStateRejection(db, env, audit?.req, auditRoute, "KIPAY_AMOUNT_MISMATCH", {
        orderId: String(order?.id || ""),
        source,
        providerAmount: payload?.amount ?? payload?.data?.amount ?? null,
        expectedAmount: roundCurrency(order?.gross_amount ?? order?.amount ?? 0),
      }).catch(() => {});
      return {
        updated: false,
        status: normalizeOrderStatus(order?.status) || nextStatus,
        transaction_id: normalizeOptionalString(order?.transaction_id),
        provider_status: kipayStatus.toUpperCase(),
      };
    }

    const mutation = evaluateProviderOrderMutation(order, nextStatus, kipayChargeId);
    if (mutation.txMismatch) {
      await auditPaymentStateRejection(db, env, audit?.req, auditRoute, "KIPAY_TRANSACTION_MISMATCH", {
        orderId: String(order?.id || ""),
        source,
        providerTransactionId: kipayChargeId,
        currentTransactionId: mutation.currentTransactionId,
      }).catch(() => {});
      return {
        updated: false,
        status: mutation.currentStatus || mutation.nextStatus,
        transaction_id: mutation.currentTransactionId,
        provider_status: kipayStatus.toUpperCase(),
      };
    }
    if (mutation.statusChanged && !mutation.canTransition) {
      await auditPaymentStateRejection(db, env, audit?.req, auditRoute, "KIPAY_INVALID_TRANSITION", {
        orderId: String(order?.id || ""),
        source,
        currentStatus: mutation.currentStatus,
        attemptedStatus: mutation.nextStatus,
      }).catch(() => {});
      return {
        updated: false,
        status: mutation.currentStatus || mutation.nextStatus,
        transaction_id: mutation.currentTransactionId,
        provider_status: kipayStatus.toUpperCase(),
      };
    }
    if (!mutation.shouldPersist) {
      return {
        updated: false,
        status: mutation.currentStatus || mutation.nextStatus,
        transaction_id: mutation.currentTransactionId,
        provider_status: kipayStatus.toUpperCase(),
      };
    }

    await db.query(
      "update public.orders set status = $1, transaction_id = $2 where id = $3",
      [mutation.shouldPersistStatus ? mutation.nextStatus : mutation.currentStatus, mutation.nextTransactionId, order.id]
    );
    await syncOrderProductEntitlements(db, order.id).catch(() => {});

    if (mutation.shouldPersistStatus) {
      await enqueueOrderEmails(db, env, order, mutation.currentStatus, mutation.nextStatus);
    }

    if (mutation.shouldPersistStatus && mutation.nextStatus === "approved" && String(order.method || "").toLowerCase() === "pix") {
      sendFacebookPixPurchaseForOrder(db, env, String(order.id), { source }).catch(() => {});
    }

    if (mutation.shouldPersistStatus && mutation.nextStatus === "approved") {
      const grossAmount = Number(order.gross_amount || 0);
      const platformFee = Number(order.platform_fee || 0);
      if (platformFee > 0) {
        const existing = await db.query<any>("select id from public.platform_fee_logs where order_id = $1 and type = 'transaction' limit 1", [order.id]);
        if (!existing.rows[0]) {
          await db.query(
            "insert into public.platform_fee_logs(seller_id, order_id, type, method, gross_amount, fee_amount) values ($1,$2,'transaction',$3,$4,$5)",
            [order.seller_id, order.id, order.method || "pix", grossAmount, platformFee]
          );
        }
      }
    }

    if (mutation.shouldPersistStatus) {
      await syncAffiliateCommissionForOrderStatus(db, String(order.id || ""), String(mutation.nextStatus || "")).catch(() => {});
    }

    const webhookEventMap: Record<string, string> = {
      approved: "transaction.authorized",
      pending: "transaction.pending",
      refunded: "transaction.refunded",
      chargeback: "transaction.chargeback",
      abandoned: "transaction.expired"
    };
    const webhookEvent = webhookEventMap[mutation.nextStatus];
    if (webhookEvent && mutation.shouldPersistStatus) {
      await dispatchWebhook(db, env, { sellerId: String(order.seller_id || ""), event: webhookEvent, data: {
        id: order.id,
        value: Number(order.amount),
        payment_method: String(order.method || "pix").toUpperCase(),
        status: kipayStatus.toUpperCase(),
        customer: {
          name: order.buyer_name,
          email: order.buyer_email,
          cpf: order.buyer_cpf || "",
          phone: order.buyer_phone || ""
        },
        product: { id: order.product_id, name: order.product_name },
        created_at: order.created_at,
        approved_at: new Date().toISOString(),
        provider: "KIPAY",
        provider_charge_id: kipayChargeId
      }});
    }

    return {
      updated: true,
      status: mutation.shouldPersistStatus ? mutation.nextStatus : mutation.currentStatus,
      transaction_id: mutation.nextTransactionId,
      provider_status: kipayStatus.toUpperCase(),
    };
  }

  async function reconcileKipayOrderById(orderId: string, source: string, audit?: { req?: any; route?: string }) {
    const orderRes = await db.query<any>(
      "select id, amount, method, status, transaction_id, buyer_name, buyer_email, buyer_cpf, buyer_phone, product_id, product_name, created_at, seller_id, gross_amount, platform_fee from public.orders where id = $1 limit 1",
      [orderId]
    );
    const order = orderRes.rows[0];
    if (!order) return { ok: false, reason: "order_not_found" };

    const transactionId = String(order.transaction_id || "").trim();
    if (!isUuidLike(transactionId)) {
      return { ok: false, reason: "transaction_id_not_uuid", status: String(order.status || ""), transaction_id: transactionId || null };
    }

    const remote = await fetchKipayTransactionById(db, env, transactionId);
    if (!remote.ok || !remote.body) {
      return {
        ok: false,
        reason: remote.error || `kipay_http_${remote.statusCode}`,
        statusCode: remote.statusCode,
        status: String(order.status || ""),
        transaction_id: transactionId,
      };
    }

    const applied = await applyOrderStateFromKipay(order, remote.body, source, audit || { route: `/api/functions/${source}` });
    return {
      ok: true,
      order_id: orderId,
      status: applied.status,
      transaction_id: applied.transaction_id,
      provider_status: applied.provider_status,
      updated: applied.updated,
    };
  }

  async function handleKipayWebhook(req: any, receivedToken: string, payload: any, reply: any) {
    const token = String(receivedToken || "").trim();

    const expectedEnv = String(process.env.KIPAY_WEBHOOK_TOKEN || "").trim();
    const expectedEnvPrev = String(process.env.KIPAY_WEBHOOK_TOKEN_PREVIOUS || "").trim();
    const expectedDb = await (async () => {
      const cfg = await loadAcquirerConfig(db, env, "KIPAY");
      const creds = (cfg && cfg.active) ? (cfg.credentials || {}) : {};
      const cur = String(creds.webhook_token || "").trim();
      const prev = String(creds.webhook_token_previous || creds.webhook_token_prev || "").trim();
      return { cur, prev };
    })();

    const tokenOk =
      (expectedEnv && token === expectedEnv) ||
      (expectedEnvPrev && token === expectedEnvPrev) ||
      (expectedDb?.cur && token === expectedDb.cur) ||
      (expectedDb?.prev && token === expectedDb.prev);
    if (!tokenOk) {
      logSecurityEvent(db, env, req, {
        route: "/api/functions/kipay-webhook",
        eventType: "webhook_unauthorized",
        code: "KIPAY_UNAUTHORIZED",
      }).catch(() => {});
      return reply.code(401).send({ error: "Unauthorized" });
    }

    const orderId = extractOrderId(payload);
    if (!orderId) return reply.code(400).send({ error: "Missing external_id (order id)" });

    const orderRes = await db.query<any>(
      "select id, amount, method, status, transaction_id, buyer_name, buyer_email, buyer_cpf, buyer_phone, product_id, product_name, created_at, seller_id, gross_amount, platform_fee from public.orders where id = $1 limit 1",
      [orderId]
    );
    const order = orderRes.rows[0];
    if (!order) return reply.send({ received: true, ignored: true, reason: "order_not_found", order_id: orderId });
    const applied = await applyOrderStateFromKipay(order, payload, "kipay-webhook", { req, route: "/api/functions/kipay-webhook" });
    return reply.send({ received: true, order_id: orderId, status: applied.status, updated: applied.updated, provider_status: applied.provider_status });
  }

  // Kipay webhook (public, protected via token in path — avoids querystring token leakage)
  app.post("/functions/kipay-webhook/:token", async (req, reply) => {
    const receivedToken = String((req.params as any).token || "").trim();
    const payload: any = req.body || {};
    return handleKipayWebhook(req, receivedToken, payload, reply);
  });

  // Legacy compatibility: Kipay webhook via token query param.
  // Keep for a short window to avoid breaking older Kipay configs.
  app.post("/functions/kipay-webhook", async (req, reply) => {
    const receivedToken = String((req.query as any).token || "").trim();
    const payload: any = req.body || {};
    return handleKipayWebhook(req, receivedToken, payload, reply);
  });

  app.get("/functions/order-status/:id", async (req, reply) => {
    const orderId = String((req.params as any).id || "").trim();
    if (!orderId) return reply.code(400).send({ error: "Missing order id" });

    const orderRes = await db.query<any>(
      "select id, status, transaction_id, method, updated_at from public.orders where id = $1 limit 1",
      [orderId]
    );
    const order = orderRes.rows[0];
    if (!order) return reply.code(404).send({ error: "Order not found" });

    if (String(order.status || "").toLowerCase() === "pending" && String(order.method || "").toLowerCase() === "pix" && isUuidLike(order.transaction_id)) {
      await reconcileKipayOrderById(orderId, "order-status-poll", { req, route: "/api/functions/order-status/:id" });
    }

    const latestRes = await db.query<any>(
      "select id, status, transaction_id, method, updated_at from public.orders where id = $1 limit 1",
      [orderId]
    );
    const latest = latestRes.rows[0];
    return reply.send(buildPublicOrderStatusPayload(latest));
  });

  // Admin acquirer config (admin only)
  app.post("/functions/admin-acquirer-config", async (req, reply) => {
    await requireAdmin(db, req, reply);
    const body = z.object({
      action: z.string().optional().default("get"),
      acquirer_name: z.string().min(1),
      credentials: z.record(z.any()).optional(),
      active: z.boolean().optional()
    }).parse(req.body);

    const acquirerName = normalizeAcquirerName(body.acquirer_name);
    if (body.action === "get") {
      const cfg = await loadAcquirerConfig(db, env, acquirerName);
      const base = cfg || { active: false, credentials: {} };
      const credentials: any = { ...(base.credentials || {}) };

      if (acquirerName === "KIPAY") {
        if (!String(credentials.api_url || "").trim()) credentials.api_url = String(process.env.KIPAY_API_URL || "https://api.kipaybr.com");
        if (!String(credentials.api_secret || "").trim()) credentials.api_secret = String(process.env.KIPAY_API_SECRET || "");
        if (!String(credentials.webhook_token || "").trim()) credentials.webhook_token = String(process.env.KIPAY_WEBHOOK_TOKEN || "");
      }
      if (acquirerName === "MERCADO PAGO") {
        if (!String(credentials.access_token || "").trim()) credentials.access_token = String(process.env.MERCADO_PAGO_ACCESS_TOKEN || process.env.MP_ACCESS_TOKEN || "");
        if (!String(credentials.public_key || "").trim()) credentials.public_key = String(process.env.MERCADO_PAGO_PUBLIC_KEY || process.env.MP_PUBLIC_KEY || "");
      }

      return reply.send({ data: { acquirer_name: acquirerName, active: !!base.active, credentials } });
    }

    if (body.action === "upsert") {
      const active = body.active === false ? false : true;
      const out = await upsertAcquirerConfig(db, env, acquirerName, active, body.credentials || {});
      return reply.send({ data: out });
    }

    return reply.code(400).send({ error: "Ação inválida" });
  });

  // Test acquirer connection (admin only)
  app.post("/functions/test-acquirer-connection", async (req, reply) => {
    await requireAdmin(db, req, reply);
    const body = z.object({ acquirer_name: z.string().min(1) }).parse(req.body);
    const acquirerName = normalizeAcquirerName(body.acquirer_name);

    const cfg = await loadAcquirerConfig(db, env, acquirerName);
    const creds = (cfg && cfg.active) ? (cfg.credentials || {}) : {};

    const persistHealth = async (ok: boolean, message: string) => {
      try {
        await db.query(
          `
            insert into public.acquirer_health(acquirer_name, ok, message, checked_at)
            values ($1, $2, $3, now())
            on conflict (acquirer_name)
            do update set
              ok = excluded.ok,
              message = excluded.message,
              checked_at = excluded.checked_at,
              updated_at = now()
          `,
          [acquirerName, ok, String(message || "").slice(0, 500)]
        );
      } catch {
        // best-effort
      }
    };

    if (acquirerName === "MERCADO PAGO") {
      const mpToken = String(creds.access_token || "").trim() || process.env.MERCADO_PAGO_ACCESS_TOKEN || process.env.MP_ACCESS_TOKEN || "";
      if (!mpToken) {
        await persistHealth(false, "Access Token não configurado.");
        return reply.send({ ok: false, message: "Access Token não configurado." });
      }
      const res = await fetch("https://api.mercadopago.com/v1/payment_methods", { headers: { Authorization: `Bearer ${mpToken}` } });
      await res.text();
      if (res.ok) {
        await persistHealth(true, "Conexão com Mercado Pago OK!");
        return reply.send({ ok: true, message: "Conexão com Mercado Pago OK!" });
      }
      await persistHealth(false, `Mercado Pago retornou ${res.status}. Verifique o Access Token.`);
      return reply.send({ ok: false, message: `Mercado Pago retornou ${res.status}. Verifique o Access Token.` });
    }

    if (acquirerName === "KIPAY") {
      const apiSecret = String(creds.api_secret || "").trim() || process.env.KIPAY_API_SECRET || "";
      const apiUrl = String(creds.api_url || "").trim() || process.env.KIPAY_API_URL || KIPAY_DEFAULT_BASE_URL;
      const baseUrl = apiUrl.replace(/\/+$/, "");
      if (!apiSecret) {
        await persistHealth(false, "API Secret não configurado.");
        return reply.send({ ok: false, message: "API Secret não configurado." });
      }
      let testOk = false;
      let testMessage = "";
      try {
        const res = await fetch(`${baseUrl}/api/compat/v1/transactions?limit=1&page=1`, {
          method: "GET",
          headers: { "x-api-secret": apiSecret, "Content-Type": "application/json" }
        });
        await res.text();
        if (res.status === 200) {
          testOk = true;
          testMessage = "Conexão com Kipay OK!";
        } else if (res.status === 401 || res.status === 403) {
          testMessage = `Kipay retornou ${res.status} — credenciais inválidas.`;
        } else if (res.status === 404) {
          const healthRes = await fetch(`${baseUrl}/health`, { method: "GET" });
          await healthRes.text();
          if (healthRes.ok) {
            testOk = true;
            testMessage = "Conexão com Kipay OK! (via health check)";
          } else {
            testMessage = `Kipay acessível mas endpoint retornou ${res.status}.`;
          }
        } else {
          testMessage = `Kipay retornou ${res.status}.`;
        }
      } catch {
        testMessage = `Não foi possível conectar à Kipay (${baseUrl}).`;
      }
      await persistHealth(testOk, testMessage);
      return reply.send({ ok: testOk, message: testMessage });
    }

    await persistHealth(false, `Teste não implementado para ${acquirerName}.`);
    return reply.send({ ok: false, message: `Teste não implementado para ${acquirerName}.` });
  });

  // Kipay webhook self-test (admin only). This validates that:
  // - KIPAY webhook token is configured
  // - our webhook handler accepts the token and returns a 2xx response
  // It does NOT depend on the Kipay dashboard; it uses an internal inject call.
  app.post("/functions/test-kipay-webhook", async (req, reply) => {
    await requireAdmin(db, req, reply);

    const cfg = await loadAcquirerConfig(db, env, "KIPAY");
    const creds = (cfg && cfg.active) ? (cfg.credentials || {}) : {};
    const token = String(creds.webhook_token || process.env.KIPAY_WEBHOOK_TOKEN || "").trim();
    if (!token) return reply.send({ ok: false, message: "Webhook Token não configurado." });

    // All routes are mounted under `/api` (see `api/src/index.ts`), so the injected URL
    // must include the prefix; otherwise Fastify will return 404.
    const url = `/api/functions/kipay-webhook/${encodeURIComponent(token)}`;
    const payload = {
      external_id: crypto.randomUUID(),
      id: "test",
      status: "PENDING",
    };

    const injected = await app.inject({
      method: "POST",
      url,
      payload,
      headers: { "content-type": "application/json" },
    });

    let bodyJson: any = null;
    try { bodyJson = injected.json(); } catch { bodyJson = null; }
    const ok = injected.statusCode >= 200 && injected.statusCode < 300 && bodyJson?.received === true;
    const message = ok
      ? "Webhook OK! (token aceito)"
      : `Falha no webhook (${injected.statusCode}).`;
    return reply.send({ ok, message });
  });

  // Admin acquirers overview (admin only)
  app.post("/functions/admin-acquirers-overview", async (req, reply) => {
    await requireAdmin(db, req, reply);
    const overview = await buildAdminAcquirersOverview(db, env);
    return reply.send({ data: overview });
  });

  // Admin acquirers status (admin only)
  app.post("/functions/admin-acquirers-status", async (req, reply) => {
    await requireAdmin(db, req, reply);
    const overview = await buildAdminAcquirersOverview(db, env);
    return reply.send({ data: { acquirers: overview.configurableAcquirers } });
  });

  // Admin: security events (admin only)
  app.post("/functions/admin-security-events", async (req, reply) => {
    await requireAdmin(db, req, reply);
    const body = z
      .object({
        limit: z.coerce.number().int().positive().max(500).optional().default(200),
        event_type: z.string().optional(),
      })
      .parse(req.body);

    const limit = Number(body.limit || 200);
    const eventType = String(body.event_type || "").trim();

    const params: any[] = [];
    let where = "";
    if (eventType) {
      params.push(eventType);
      where = `where event_type = $${params.length}`;
    }
    params.push(limit);

    const res = await db.query<any>(
      `select occurred_at, event_type, code, route, role, user_id, meta
       from public.security_events
       ${where}
       order by occurred_at desc
       limit $${params.length}`,
      params
    );
    return reply.send({ data: res.rows || [] });
  });

  // Admin payment method -> acquirer mapping (admin only)
  app.post("/functions/admin-payment-method-acquirers", async (req, reply) => {
    await requireAdmin(db, req, reply);
    const body = z.object({
      action: z.enum(["list", "upsert"]),
      method: z.any().optional(),
      acquirer_name: z.any().optional()
    }).parse(req.body);

    if (body.action === "list") {
      const res = await db.query<any>("select method, acquirer_name, created_at, updated_at from public.payment_method_acquirers order by method asc");
      return reply.send({ data: res.rows });
    }

    const method = canonicalMethodLabel(body.method);
    if (!method) return reply.code(400).send({ error: "Método inválido." });

    const rawAcq = String(body.acquirer_name || "").trim();
    const acquirerName = normalizeAcquirerName(rawAcq);

    const prevRes = await db.query<any>("select acquirer_name from public.payment_method_acquirers where method = $1 limit 1", [method]);
    const prevAcq = normalizeAcquirerName(prevRes.rows[0]?.acquirer_name || "");

    if (!acquirerName || acquirerName === "NONE") {
      await db.query("delete from public.payment_method_acquirers where method = $1", [method]);
      await db.query(
        "insert into public.payment_method_acquirer_audit(admin_user_id, method, old_acquirer_name, new_acquirer_name) values ($1,$2,$3,$4)",
        [req.auth!.user.id, method, prevAcq || null, null]
      ).catch(() => {});
      return reply.send({ data: { method, acquirer_name: null } });
    }

    const catalog = getAcquirerCatalogEntry(acquirerName);
    if (!catalog) return reply.code(400).send({ error: "Adquirente inválida." });
    if (!catalog.implemented) return reply.code(400).send({ error: "Integração em desenvolvimento. Não é possível selecionar esta adquirente ainda." });
    if (!catalog.methods_supported.includes(method)) return reply.code(400).send({ error: `${catalog.acquirer_name} não suporta ${method}.` });

    const cfg = await loadAcquirerConfig(db, env, acquirerName);
    if (!cfg || !cfg.active) return reply.code(400).send({ error: "Adquirente não está ativa. Configure e ative as credenciais primeiro." });
    if (!hasRequiredCredentials(catalog.required_credentials, cfg.credentials)) return reply.code(400).send({ error: "Credenciais obrigatórias pendentes para esta adquirente." });

    const healthRes = await db.query<any>("select ok from public.acquirer_health where acquirer_name = $1 limit 1", [acquirerName]);
    const health = healthRes.rows[0];
    if (!health || !health.ok) {
      return reply.code(400).send({ error: "Adquirente ainda não passou no teste de conexão. Clique em “Testar conexão” antes de aplicar." });
    }

    const upsert = await db.query<any>(
      `
        insert into public.payment_method_acquirers(method, acquirer_name)
        values ($1, $2)
        on conflict (method)
        do update set acquirer_name = excluded.acquirer_name, updated_at = now()
        returning method, acquirer_name, created_at, updated_at
      `,
      [method, catalog.acquirer_name]
    );

    await db.query(
      "insert into public.payment_method_acquirer_audit(admin_user_id, method, old_acquirer_name, new_acquirer_name) values ($1,$2,$3,$4)",
      [req.auth!.user.id, method, prevAcq || null, catalog.acquirer_name]
    ).catch(() => {});

    return reply.send({ data: upsert.rows[0] });
  });

  // send-test-email (admin only) - used by /admin/smtp
  app.post("/functions/send-test-email", async (req, reply) => {
    await requireAdmin(db, req, reply);
    const body = z.discriminatedUnion("action", [
      z.object({ action: z.literal("test-connection") }),
      z.object({ action: z.literal("send-test"), to: z.string().email() }),
    ]).parse(req.body);

    const smtpRes = await db.query<any>("select * from public.smtp_config limit 1");
    const smtp = smtpRes.rows[0];
    if (!smtp) return reply.send({ success: false, error: "SMTP não configurado." });
    await ensureSmtpPasswordEncrypted(db, env, smtp);

    const host = String(smtp.host || "").trim();
    const port = Number.parseInt(String(smtp.port || "587"), 10) || 587;
    const username = String(smtp.username || "").trim();
    const password = decryptSmtpPassword(env, smtp);
    const fromName = String(smtp.from_name || "").trim();
    const fromEmail = String(smtp.from_email || "").trim();

    if (!host) return reply.send({ success: false, error: "Host SMTP não configurado." });
    if (!port) return reply.send({ success: false, error: "Porta SMTP inválida." });

    const secure = port === 465;
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: username ? { user: username, pass: password } : undefined,
      tls: { rejectUnauthorized: !env.SMTP_ALLOW_INSECURE_TLS },
    });

    const nowIso = new Date().toISOString();

    try {
      if (body.action === "test-connection") {
        await transporter.verify();
        await db.query("update public.smtp_config set last_test = $1 where id is not null", [nowIso]);
        return reply.send({ success: true, message: "Conexão SMTP verificada com sucesso." });
      }

      if (!fromEmail) return reply.send({ success: false, error: "Configure o e-mail do remetente (fromEmail) antes de enviar teste." });
      const from = fromName ? `${fromName} <${fromEmail}>` : fromEmail;

      await transporter.sendMail({
        from,
        to: body.to,
        subject: "DingitalPay — E-mail de teste",
        text: `E-mail de teste enviado em ${nowIso}`,
      });
      await db.query("update public.smtp_config set last_test = $1, emails_sent_today = emails_sent_today + 1 where id is not null", [nowIso]);
      return reply.send({ success: true, message: `E-mail de teste enviado para ${body.to}.` });
    } catch (e: any) {
      const msg = String(e?.message || "Falha ao enviar e-mail de teste.");
      return reply.send({ success: false, error: msg });
    }
  });

  // verify-domain (seller/admin)
  app.post("/functions/verify-domain", async (req, reply) => {
    requireAuth(req, reply);
    const body = z.object({ domainId: z.string().uuid() }).parse(req.body);

    const domainRes = await db.query<any>("select id, domain, product_id, verified from public.product_domains where id = $1 limit 1", [body.domainId]);
    const domain = domainRes.rows[0];
    if (!domain) return reply.code(404).send({ error: "Domain not found" });
    if (domain.verified) return reply.send({ verified: true, message: "Domain already verified" });

    // ownership check for sellers
    if (req.auth!.role !== "admin") {
      const owns = await db.query<any>("select 1 from public.products where id = $1 and seller_id = $2 limit 1", [domain.product_id, req.auth!.user.id]);
      if (!owns.rows[0]) return reply.code(403).send({ error: "Forbidden" });
    }

    const settingsRes = await db.query<any>("select platform_url from public.platform_settings limit 1");
    const platformHost = settingsRes.rows[0]?.platform_url
      ? String(settingsRes.rows[0].platform_url).replace(/^https?:\/\//, "").replace(/\/+$/, "")
      : null;
    if (!platformHost) return reply.send({ verified: false, error: "Platform URL not configured" });

    const dnsUrl = `https://dns.google/resolve?name=${encodeURIComponent(domain.domain)}&type=CNAME`;
    const dnsRes = await fetch(dnsUrl);
    const dnsData: any = await dnsRes.json().catch(() => ({}));

    const dnsAUrl = `https://dns.google/resolve?name=${encodeURIComponent(domain.domain)}&type=A`;
    const dnsARes = await fetch(dnsAUrl);
    const dnsAData: any = await dnsARes.json().catch(() => ({}));

    const cnameRecords = (dnsData.Answer || []).filter((r: any) => r.type === 5).map((r: any) => String(r.data).replace(/\.$/, "").toLowerCase());
    const aRecords = (dnsAData.Answer || []).filter((r: any) => r.type === 1).map((r: any) => String(r.data));
    const verified = cnameRecords.some((c: string) => c === platformHost.toLowerCase());

    if (verified) await db.query("update public.product_domains set verified = true where id = $1", [body.domainId]);

    return reply.send({
      verified,
      domain: domain.domain,
      expectedCname: platformHost,
      foundCnames: cnameRecords,
      foundARecords: aRecords,
      message: verified ? "DNS verified! CNAME points correctly to the platform." : `CNAME not found pointing to ${platformHost}.`
    });
  });

  // track-conversion (public)
  app.post("/functions/track-conversion", async (req, reply) => {
    // Enterprise hardening: this endpoint is internal-only.
    // Browser clients must rely on fbq; server-side Purchase events are emitted by webhooks/create-payment.
    const expected = String(env.INTERNAL_WEBHOOK_TOKEN || "").trim();
    const received = String((req.headers as any)["x-internal-token"] || (req.headers as any)["x-internal-webhook-token"] || "").trim();
    if (!expected || !received || received !== expected) {
      logSecurityEvent(db, env, req, {
        route: "/api/functions/track-conversion",
        eventType: "capi_forbidden",
        code: "CAPI_FORBIDDEN",
      }).catch(() => {});
      return reply.code(403).send({ error: "Forbidden" });
    }

    const body = z.object({
      product_id: z.string().uuid(),
      event_name: z.string().min(1),
      event_id: z.string().optional(),
      event_data: z.record(z.any()).optional(),
      user_data: z.record(z.any()).optional(),
      event_source_url: z.string().optional()
    }).parse(req.body);

    const pixelsRes = await db.query<any>(
      "select pixel_id, access_token from public.product_pixels where product_id = $1 and platform = 'facebook' and active = true and access_token <> ''",
      [body.product_id]
    );
    const pixels = pixelsRes.rows;
    if (!pixels || pixels.length === 0) return reply.send({ message: "No Facebook pixels with access_token configured" });

    const clientIp =
      String(req.headers["x-forwarded-for"] || "").split(",")[0]?.trim() ||
      String(req.headers["cf-connecting-ip"] || "") ||
      "";
    const userAgent = String(req.headers["user-agent"] || "");
    const eventTime = Math.floor(Date.now() / 1000);

    const capiUserData: any = {
      ...(body.user_data || {}),
      client_ip_address: clientIp,
      client_user_agent: userAgent
    };
    if (nonEmpty(body.user_data?.fbc)) capiUserData.fbc = String(body.user_data?.fbc);
    if (nonEmpty(body.user_data?.fbp)) capiUserData.fbp = String(body.user_data?.fbp);
    const customData: any = {};
    const ed = body.event_data || {};
    if (ed.value !== undefined) customData.value = ed.value;
    if (ed.currency) customData.currency = ed.currency;
    if (ed.content_name) customData.content_name = ed.content_name;
    if (ed.content_ids) customData.content_ids = ed.content_ids;
    if (ed.content_type) customData.content_type = ed.content_type;
    if (ed.content_category) customData.content_category = ed.content_category;

    const results = await Promise.allSettled(
      pixels.map(async (pixel: any) => {
        const payload = {
          data: [
            {
              event_name: body.event_name,
              event_time: eventTime,
              event_id: body.event_id || undefined,
              event_source_url: body.event_source_url || undefined,
              action_source: "website",
              user_data: capiUserData,
              custom_data: Object.keys(customData).length > 0 ? customData : undefined
            }
          ]
        };
        const url = `https://graph.facebook.com/${FB_API_VERSION}/${pixel.pixel_id}/events?access_token=${pixel.access_token}`;
        const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error?.message || "CAPI request failed");
        return { pixel_id: pixel.pixel_id, success: true, events_received: json.events_received };
      })
    );

	    const summary = results.map((r: any, i: number) => ({
	      pixel_id: pixels[i].pixel_id,
	      status: r.status,
	      ...(r.status === "fulfilled" ? r.value : { error: r.reason?.message })
	    }));
	    return reply.send({ results: summary });
	  });

	  // _internal/replay-pix-purchase-capi (token-protected)
	  // Used for smoke tests and manual reprocess without depender de provedor.
	  app.post("/functions/_internal/replay-pix-purchase-capi", async (req, reply) => {
	    const expected = String(env.INTERNAL_WEBHOOK_TOKEN || "").trim();
	    const received = String((req.headers as any)["x-internal-webhook-token"] || "").trim();
	    if (!expected || !received || received !== expected) {
	      return reply.code(403).send({ error: "Forbidden" });
	    }

	    const body = z.object({
	      order_id: z.string().uuid(),
	      force_retry: z.coerce.boolean().optional().default(false),
	    }).parse(req.body);

	    const results = await sendFacebookPixPurchaseForOrder(db, env, body.order_id, { forceRetry: body.force_retry, source: "internal-replay" });
	    return reply.send({ ok: true, results });
	  });

	  // test-webhook (seller)
	  app.post("/functions/test-webhook", async (req, reply) => {
	    requireAuth(req, reply);
	    const body = z.object({ endpoint_id: z.string().uuid() }).parse(req.body);

    const epRes = await db.query<any>(
      "select * from public.webhook_endpoints where id = $1 and seller_id = $2 limit 1",
      [body.endpoint_id, req.auth!.user.id]
    );
    const ep = epRes.rows[0];
    if (!ep) return reply.code(404).send({ error: "Endpoint not found" });

    const testPayload = JSON.stringify({
      payload_version: "2026-02-24",
      event: "test.ping",
      id: "test_" + crypto.randomUUID().slice(0, 8),
      value: 0,
      payment_method: "PIX",
      status: "TEST",
      customer: { name: "Teste Webhook", email: "teste@exemplo.com", cpf: "000.000.000-00", phone: "(00) 00000-0000" },
      product: { id: "prod_test", name: "Produto de Teste" },
      created_at: new Date().toISOString()
    });
    const signature = hmacSha256Hex(ep.secret, testPayload);
    const start = Date.now();
    try {
      const allowHttp = String(env.NODE_ENV || "").toLowerCase() === "development";
      const safeUrl = await assertSafeOutboundWebhookUrl(String(ep.url || ""), { allowHttp });

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);
      const res = await fetch(safeUrl.toString(), {
        method: "POST",
        redirect: "manual",
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Signature": signature,
          "X-Webhook-Timestamp": new Date().toISOString(),
          "User-Agent": "DingitalPay-Webhooks/1.0 (test)"
        },
        body: testPayload,
        signal: controller.signal
      });
      clearTimeout(timeout);
      const responseTime = Date.now() - start;
      await res.text();
      return reply.send({ status_code: res.status, response_time: responseTime, success: res.status >= 200 && res.status < 300 });
    } catch (e: any) {
      const responseTime = Date.now() - start;
      const msg = String(e?.message || "");
      const isBlocked = /não permitido|apenas https|protocolo|host/i.test(msg);
      if (isBlocked) {
        logSecurityEvent(db, env, req, {
          route: "/api/functions/test-webhook",
          eventType: "ssrf_blocked",
          code: "SSRF_BLOCKED",
        }).catch(() => {});
      }
      return reply.send({ status_code: 0, response_time: responseTime, success: false, error: isBlocked ? "Endpoint bloqueado por segurança (SSRF)." : "Connection failed" });
    }
  });

  // cleanup-orders (internal)
  app.post("/functions/cleanup-orders", async (req, reply) => {
    // Optional internal token
    if (env.INTERNAL_WEBHOOK_TOKEN) {
      const token = String(req.headers["x-internal-token"] || "");
      if (token !== env.INTERNAL_WEBHOOK_TOKEN) return reply.code(401).send({ error: "Unauthorized" });
    } else {
      await requireAdmin(db, req, reply);
    }

    const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const orphanRes = await db.query<any>(
      "select id from public.orders where status = 'pending' and created_at < $1 and (transaction_id is null or transaction_id = '')",
      [cutoff]
    );
    const orphanIds = orphanRes.rows.map((o: any) => o.id);
    if (orphanIds.length === 0) return reply.send({ cleaned: 0, message: "Nenhum pedido órfão encontrado." });

    await db.query("delete from public.order_items where order_id = any($1)", [orphanIds]);
    await db.query("update public.orders set status = 'abandoned' where id = any($1)", [orphanIds]);
    return reply.send({ cleaned: orphanIds.length, message: `${orphanIds.length} pedidos órfãos marcados como abandonados.` });
  });

  app.post("/functions/reconcile-orders", async (req, reply) => {
    if (env.INTERNAL_WEBHOOK_TOKEN) {
      const token = String(req.headers["x-internal-token"] || "");
      if (token !== env.INTERNAL_WEBHOOK_TOKEN) return reply.code(401).send({ error: "Unauthorized" });
    } else {
      await requireAdmin(db, req, reply);
    }

    const body = z.object({
      seller_id: z.string().uuid().optional(),
      product_id: z.string().uuid().optional(),
      limit: z.coerce.number().int().positive().max(1000).optional().default(200),
      order_ids: z.array(z.string().uuid()).optional(),
    }).parse(req.body || {});

    const where: string[] = ["status = 'pending'", "method = 'pix'", "transaction_id ~ '^[0-9a-fA-F-]{36}$'"];
    const params: any[] = [];
    if (body.seller_id) {
      params.push(body.seller_id);
      where.push(`seller_id = $${params.length}`);
    }
    if (body.product_id) {
      params.push(body.product_id);
      where.push(`product_id = $${params.length}`);
    }
    if (body.order_ids?.length) {
      params.push(body.order_ids);
      where.push(`id = any($${params.length})`);
    }
    params.push(body.limit);

    const rows = await db.query<{ id: string }>(
      `select id from public.orders where ${where.join(" and ")} order by created_at asc limit $${params.length}`,
      params
    );

    let updated = 0;
    let unchanged = 0;
    let failed = 0;
    const results: any[] = [];

    for (const row of rows.rows) {
      try {
        const result = await reconcileKipayOrderById(String(row.id), "reconcile-orders");
        results.push(result);
        if (result.ok && result.updated) updated++;
        else if (result.ok) unchanged++;
        else failed++;
      } catch (error: any) {
        failed++;
        results.push({ ok: false, order_id: row.id, reason: String(error?.message || error || "UNKNOWN_ERROR") });
      }
    }

    return reply.send({
      scanned: rows.rows.length,
      updated,
      unchanged,
      failed,
      results,
    });
  });

  // cleanup-spam-users (internal)
  // Removes unverified accounts with empty names and no activity (safe defaults).
  app.post("/functions/cleanup-spam-users", async (req, reply) => {
    if (env.INTERNAL_WEBHOOK_TOKEN) {
      const token = String(req.headers["x-internal-token"] || "");
      if (token !== env.INTERNAL_WEBHOOK_TOKEN) return reply.code(401).send({ error: "Unauthorized" });
    } else {
      await requireAdmin(db, req, reply);
    }

    const body = z.object({
      older_than_hours: z.coerce.number().int().nonnegative().optional().default(48),
      limit: z.coerce.number().int().positive().optional().default(500),
      dry_run: z.boolean().optional().default(false),
    }).parse(req.body || {});

    const cutoff = new Date(Date.now() - body.older_than_hours * 60 * 60 * 1000).toISOString();
    const candidates = await db.query<{ id: string }>(
      `
      select u.id
      from public.users u
      join public.profiles p on p.user_id = u.id
      where u.email_verified = false
        and u.created_at < $1
        and btrim(coalesce(p.name,'')) = ''
        and not exists (select 1 from public.products pr where pr.seller_id = u.id)
      order by u.created_at asc
      limit $2
      `,
      [cutoff, body.limit]
    );
    const userIds = candidates.rows.map((r) => r.id);
    if (userIds.length === 0) return reply.send({ cleaned: 0, dry_run: body.dry_run, message: "Nenhum usuário spam elegível encontrado." });

    if (!body.dry_run) {
      await db.query("delete from public.users where id = any($1)", [userIds]);
    }

    logSecurityEvent(db, env, req, {
      route: "/api/functions/cleanup-spam-users",
      eventType: "cleanup_spam_users",
      code: body.dry_run ? "DRY_RUN" : "CLEANED",
      meta: { cleaned: userIds.length, olderThanHours: body.older_than_hours, limit: body.limit },
    }).catch(() => {});

    return reply.send({
      cleaned: userIds.length,
      dry_run: body.dry_run,
      message: body.dry_run ? "Dry-run concluído." : "Usuários spam removidos.",
    });
  });

  // dispatch-webhook (internal/admin)
  app.post("/functions/dispatch-webhook", async (req, reply) => {
    if (env.INTERNAL_WEBHOOK_TOKEN) {
      const token = String(req.headers["x-internal-token"] || "");
      if (token !== env.INTERNAL_WEBHOOK_TOKEN) return reply.code(401).send({ error: "Unauthorized" });
    } else {
      await requireAdmin(db, req, reply);
    }

    const body = z.object({ seller_id: z.string().uuid(), event: z.string().min(1), data: z.any() }).parse(req.body);
    const out = await dispatchWebhook(db, env, { sellerId: body.seller_id, event: body.event, data: body.data });
    return reply.send(out);
  });

  // send-template-test (admin only) - used by /admin/email-campaigns to validate templates
  app.post("/functions/send-template-test", async (req, reply) => {
    await requireAdmin(db, req, reply);
    const body = z.object({
      event_key: z.string().min(1).max(80),
      to: z.string().email(),
      vars: z.record(z.any()).optional().default({}),
    }).parse(req.body);

    // Throttle by recipient+template to avoid accidental spam from the UI.
    const recentRes = await db.query<{ c: number }>(
      "select count(*)::int as c from public.email_outbox where to_email = $1 and template_event_key = $2 and created_at > now() - interval '1 minute'",
      [body.to, body.event_key]
    );
    if ((recentRes.rows[0]?.c ?? 0) >= 3) {
      return reply.code(429).send({ data: null, error: { code: "RATE_LIMITED", message: "Muitos envios de teste. Aguarde 1 minuto e tente novamente." } });
    }

    const out = await enqueueTemplatedEmail(db, {
      to: body.to,
      eventKey: body.event_key,
      vars: body.vars,
      // tests should not dedupe globally
      dedupeKey: null,
      campaignId: null,
    });
    return reply.send({ data: out, error: null });
  });

  // admin-email-templates (admin only) - list templates with open/click metrics (tracking + "human" estimate)
  app.post("/functions/admin-email-templates", async (req, reply) => {
    await requireAdmin(db, req, reply);
    const body = z.object({ action: z.literal("list") }).parse(req.body);
    if (body.action !== "list") return reply.code(400).send({ error: "Invalid action" });

    const res = await db.query<any>(
      `
        select
          t.*,
          coalesce(m.sent_count, 0)::int as outbox_sent_count,
          coalesce(m.open_unique_count, 0)::int as outbox_open_unique_count,
          coalesce(m.click_unique_count, 0)::int as outbox_click_unique_count,
          coalesce(m.open_human_unique_count, 0)::int as outbox_open_human_unique_count,
          coalesce(m.click_human_unique_count, 0)::int as outbox_click_human_unique_count,
          coalesce(m.open_total_count, 0)::int as outbox_open_total_count,
          coalesce(m.click_total_count, 0)::int as outbox_click_total_count,
          coalesce(m.open_human_total_count, 0)::int as outbox_open_human_total_count,
          coalesce(m.click_human_total_count, 0)::int as outbox_click_human_total_count,
          case
            when coalesce(m.sent_count, 0) > 0
              then (round(100.0 * coalesce(m.open_unique_count, 0) / nullif(m.sent_count, 0))::int::text || '%')
            else '-'
          end as metrics_open_rate,
          case
            when coalesce(m.sent_count, 0) > 0
              then (round(100.0 * coalesce(m.click_unique_count, 0) / nullif(m.sent_count, 0))::int::text || '%')
            else '-'
          end as metrics_click_rate
        from public.email_templates t
        left join (
          select
            template_event_key,
            count(*) filter (where status = 'sent') as sent_count,
            sum(case when status = 'sent' and open_count > 0 then 1 else 0 end) as open_unique_count,
            sum(case when status = 'sent' and click_count > 0 then 1 else 0 end) as click_unique_count,
            sum(case when status = 'sent' and open_human_count > 0 then 1 else 0 end) as open_human_unique_count,
            sum(case when status = 'sent' and click_human_count > 0 then 1 else 0 end) as click_human_unique_count,
            coalesce(sum(open_count) filter (where status = 'sent'), 0) as open_total_count,
            coalesce(sum(click_count) filter (where status = 'sent'), 0) as click_total_count
            ,
            coalesce(sum(open_human_count) filter (where status = 'sent'), 0) as open_human_total_count,
            coalesce(sum(click_human_count) filter (where status = 'sent'), 0) as click_human_total_count
          from public.email_outbox
          where template_event_key is not null and template_event_key <> ''
          group by template_event_key
        ) m on m.template_event_key = t.event_key
        order by
          case t.category
            when 'auth' then 1
            when 'purchases' then 2
            when 'courses' then 3
            when 'profile' then 4
            when 'seller' then 5
            when 'gamification' then 6
            else 99
          end asc,
          t.event_key asc,
          t.id asc
      `
    );

    return reply.send({ data: res.rows, error: null });
  });

  // admin-email-campaigns (admin only) - minimal broadcast sender (segment: buyers/sellers/all)
  app.post("/functions/admin-email-campaigns", async (req, reply) => {
    await requireAdmin(db, req, reply);
    const body = z.discriminatedUnion("action", [
      z.object({
        action: z.literal("list"),
        limit: z.number().int().positive().max(200).optional().default(50),
      }),
      z.object({
        action: z.literal("create"),
        name: z.string().min(1).max(120),
        subject: z.string().min(1).max(200),
        body: z.string().min(1),
        segment: z.enum(["buyers", "sellers", "all"]).default("buyers"),
        scheduled_at: z.string().optional(),
      }),
      z.object({
        action: z.literal("update"),
        campaign_id: z.string().uuid(),
        name: z.string().min(1).max(120).optional(),
        subject: z.string().min(1).max(200).optional(),
        body: z.string().min(1).optional(),
        segment: z.enum(["buyers", "sellers", "all"]).optional(),
        scheduled_at: z.string().nullable().optional(),
        status: z.enum(["draft", "scheduled"]).optional(),
      }),
      z.object({
        action: z.literal("send-now"),
        campaign_id: z.string().uuid(),
      }),
      z.object({
        action: z.literal("cancel"),
        campaign_id: z.string().uuid(),
      }),
      z.object({
        action: z.literal("delete"),
        campaign_id: z.string().uuid(),
      }),
    ]).parse(req.body);

    if (body.action === "list") {
      const res = await db.query<any>(
        `
          select
            c.*,
            coalesce(m.sent_count, 0)::int as sent_count,
            coalesce(m.queued_count, 0)::int as queued_count,
            coalesce(m.sending_count, 0)::int as sending_count,
            coalesce(m.failed_count, 0)::int as failed_count,
            coalesce(m.canceled_count, 0)::int as canceled_count,
            coalesce(m.open_unique_count, 0)::int as open_unique_count,
            coalesce(m.click_unique_count, 0)::int as click_unique_count,
            coalesce(m.open_human_unique_count, 0)::int as open_human_unique_count,
            coalesce(m.click_human_unique_count, 0)::int as click_human_unique_count,
            coalesce(m.open_total_count, 0)::int as open_total_count,
            coalesce(m.click_total_count, 0)::int as click_total_count,
            coalesce(m.open_human_total_count, 0)::int as open_human_total_count,
            coalesce(m.click_human_total_count, 0)::int as click_human_total_count,
            m.last_sent_at,
            greatest(
              c.updated_at,
              c.created_at,
              coalesce(c.sent_at, '-infinity'::timestamptz),
              coalesce(c.scheduled_at, '-infinity'::timestamptz),
              coalesce(c.canceled_at, '-infinity'::timestamptz),
              coalesce(m.last_activity_at, '-infinity'::timestamptz)
            ) as last_activity_at,
            case
              when c.status = 'canceled' or c.canceled_at is not null then 'canceled'
              when coalesce(m.queued_count, 0) > 0 or coalesce(m.sending_count, 0) > 0 or c.status = 'sending' then 'sending'
              when c.status = 'sent' or (coalesce(m.sent_count, 0) > 0 and coalesce(m.queued_count, 0) = 0 and coalesce(m.sending_count, 0) = 0) then 'sent'
              when c.status = 'scheduled' then 'scheduled'
              else 'draft'
            end as display_status
          from public.email_campaigns c
          left join (
            select
              campaign_id,
              count(*) filter (where status = 'queued') as queued_count,
              count(*) filter (where status = 'sending') as sending_count,
              count(*) filter (where status = 'sent') as sent_count,
              count(*) filter (where status = 'failed') as failed_count,
              count(*) filter (where status = 'canceled') as canceled_count,
              sum(case when status = 'sent' and open_count > 0 then 1 else 0 end) as open_unique_count,
              sum(case when status = 'sent' and click_count > 0 then 1 else 0 end) as click_unique_count,
              sum(case when status = 'sent' and open_human_count > 0 then 1 else 0 end) as open_human_unique_count,
              sum(case when status = 'sent' and click_human_count > 0 then 1 else 0 end) as click_human_unique_count,
              coalesce(sum(open_count) filter (where status = 'sent'), 0) as open_total_count,
              coalesce(sum(click_count) filter (where status = 'sent'), 0) as click_total_count,
              coalesce(sum(open_human_count) filter (where status = 'sent'), 0) as open_human_total_count,
              coalesce(sum(click_human_count) filter (where status = 'sent'), 0) as click_human_total_count,
              max(sent_at) filter (where status = 'sent') as last_sent_at,
              max(
                greatest(
                  coalesce(updated_at, created_at),
                  created_at,
                  coalesce(sent_at, '-infinity'::timestamptz),
                  coalesce(canceled_at, '-infinity'::timestamptz)
                )
              ) as last_activity_at
            from public.email_outbox
            where campaign_id is not null
            group by campaign_id
          ) m on m.campaign_id = c.id
          order by c.created_at desc
          limit $1
        `,
        [body.limit]
      );
      return reply.send({ data: res.rows, error: null });
    }

    if (body.action === "create") {
      const status = body.scheduled_at ? "scheduled" : "draft";
      const res = await db.query<any>(
        "insert into public.email_campaigns(name, subject, body, status, scheduled_at, sent_at, recipients_count, open_count, click_count, segment, segment_payload) values ($1,$2,$3,$4,$5,null,0,0,0,$6,$7) returning *",
        [body.name, body.subject, body.body, status, body.scheduled_at ? new Date(body.scheduled_at).toISOString() : null, body.segment, JSON.stringify({})]
      );
      return reply.send({ data: res.rows[0], error: null });
    }

    if (body.action === "update") {
      const updates: any[] = [];
      const params: any[] = [];
      let i = 1;
      if (body.name !== undefined) { params.push(body.name); updates.push(`name = $${i++}`); }
      if (body.subject !== undefined) { params.push(body.subject); updates.push(`subject = $${i++}`); }
      if (body.body !== undefined) { params.push(body.body); updates.push(`body = $${i++}`); }
      if (body.segment !== undefined) { params.push(body.segment); updates.push(`segment = $${i++}`); }
      if (body.status !== undefined) { params.push(body.status); updates.push(`status = $${i++}`); }
      if (body.scheduled_at !== undefined) { params.push(body.scheduled_at ? new Date(body.scheduled_at).toISOString() : null); updates.push(`scheduled_at = $${i++}`); }
      params.push(body.campaign_id);
      if (body.status !== undefined) {
        updates.push(`canceled_at = null`);
      }
      const sql = `update public.email_campaigns set ${updates.length ? updates.join(", ") + ", " : ""} updated_at = now() where id = $${i} returning *`;
      const res = await db.query<any>(sql, params);
      return reply.send({ data: res.rows[0], error: null });
    }

    const campaignRes = await db.query<any>("select * from public.email_campaigns where id = $1 limit 1", [body.campaign_id]);
    const campaign = campaignRes.rows[0];
    if (!campaign) return reply.code(404).send({ error: "Campaign not found" });

    if (body.action === "cancel") {
      await db.query("update public.email_campaigns set status = 'canceled', scheduled_at = null, canceled_at = now(), updated_at = now() where id = $1", [body.campaign_id]);
      await db.query("update public.email_outbox set status = 'canceled', canceled_at = now(), updated_at = now() where campaign_id = $1 and status in ('queued','sending')", [body.campaign_id]).catch(() => {});
      return reply.send({ data: { ok: true }, error: null });
    }

    if (body.action === "delete") {
      await db.query("update public.email_outbox set status = 'canceled', canceled_at = now(), updated_at = now() where campaign_id = $1 and status in ('queued','sending')", [body.campaign_id]).catch(() => {});
      await db.query("delete from public.email_campaigns where id = $1", [body.campaign_id]);
      return reply.send({ data: { ok: true }, error: null });
    }

    // send-now
    const segment = String((campaign.segment as any) || "buyers");
    const roleFilter = segment === "sellers" ? ["seller"] : segment === "all" ? ["buyer", "seller"] : ["buyer"];
    const recRes = await db.query<any>(
      `
        select distinct on (lower(u.email)) u.email, coalesce(p.name,'') as name, r.role
        from public.users u
        join public.user_roles r on r.user_id = u.id
        left join public.profiles p on p.user_id = u.id
        where r.role = any($1) and u.disabled is not true and u.email is not null and u.email <> ''
        order by lower(u.email) asc
      `,
      [roleFilter]
    );
    const recipients = recRes.rows;
    if (recipients.length === 0) return reply.send({ data: { ok: false, message: "Sem destinatários." }, error: null });

    // platform vars
    const platRes = await db.query<any>("select platform_name, platform_url, support_email from public.platform_settings limit 1");
    const plat = platRes.rows[0] || {};
    const platformVars = {
      platform_name: String(plat.platform_name || "Plataforma"),
      platform_url: String(plat.platform_url || ""),
      support_email: String(plat.support_email || ""),
    };

    const rows = recipients.map((r: any) => {
      const vars = {
        ...platformVars,
        user_name: String(r.name || "Cliente"),
        seller_name: String(r.name || "Vendedor"),
        buyer_email: String(r.email || ""),
      };
      const subj = renderTemplate(String(campaign.subject || ""), vars).trim() || "Campanha";
      const html = renderTemplate(String(campaign.body || ""), vars).trim() || "<p>Campanha</p>";
      const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      return {
        to_email: String(r.email || ""),
        subject: subj,
        html,
        text,
        vars,
        dedupe_key: `campaign:${campaign.id}:${String(r.email || "").toLowerCase()}`,
      };
    });

    // Insert in batch
    await db.query(
      `
        insert into public.email_outbox(campaign_id, template_event_key, to_email, subject, html, text, vars, dedupe_key)
        select $1::uuid, ''::text, x.to_email::text, x.subject::text, x.html::text, x.text::text, x.vars::jsonb, x.dedupe_key::text
        from jsonb_to_recordset($2::jsonb) as x(to_email text, subject text, html text, text text, vars jsonb, dedupe_key text)
      `,
      [campaign.id, JSON.stringify(rows)]
    );

    await db.query("update public.email_campaigns set status = 'sending', recipients_count = $2, canceled_at = null, updated_at = now() where id = $1", [campaign.id, recipients.length]);
    return reply.send({ data: { ok: true, queued: recipients.length }, error: null });
  });
}

async function dispatchWebhook(db: Db, env: Env, args: { sellerId: string; event: string; data: any }) {
  const sellerId = String(args.sellerId || "").trim();
  const event = String(args.event || "").trim();
  const data = args.data;
  if (!sellerId || !event) return { dispatched: 0, webhooks: [], zapier: [], error: "Missing sellerId/event" };

  const endpointsRes = await db.query<any>("select * from public.webhook_endpoints where active = true and seller_id = $1", [sellerId]);
  const endpoints = endpointsRes.rows || [];
  const matching = endpoints.filter((ep: any) => Array.isArray(ep.events) && ep.events.includes(event));

  const payload = JSON.stringify({ payload_version: "2026-02-24", event, ...data });
  const webhookResults: any[] = [];
  const allowHttp = String(env.NODE_ENV || "").toLowerCase() === "development";
  const ssrfGuard = Boolean((env as any).WEBHOOK_SSRF_GUARD);
  const ssrfAuditOnly = Boolean((env as any).WEBHOOK_SSRF_AUDIT_ONLY);

  for (const ep of matching) {
    const signature = hmacSha256Hex(ep.secret, payload);
    const rawUrl = String(ep.url || "").trim();
    let safeUrl = rawUrl;
    if (ssrfGuard) {
      try {
        safeUrl = (await assertSafeOutboundWebhookUrl(rawUrl, { allowHttp })).toString();
      } catch {
        logSecurityEvent(db, env, ({ headers: {}, ip: "", auth: null } as any), {
          route: "/api/functions/dispatch-webhook",
          eventType: "ssrf_blocked",
          code: "SSRF_BLOCKED",
          meta: { target: "webhook_endpoints", endpoint_id: ep.id },
        }).catch(() => {});
        if (!ssrfAuditOnly) {
          await db.query(
            "insert into public.webhook_logs(endpoint_id, event, status_code, response_time, success) values ($1,$2,$3,$4,$5)",
            [ep.id, event, 0, 0, false]
          ).catch(() => {});
          webhookResults.push({ endpoint_id: ep.id, statusCode: 0, responseTime: 0, success: false, attempt: 0, blocked: true });
          continue;
        }
      }
    }

    const result = await sendWithRetry(safeUrl, payload, signature);
    await db.query(
      "insert into public.webhook_logs(endpoint_id, event, status_code, response_time, success) values ($1,$2,$3,$4,$5)",
      [ep.id, event, result.statusCode, result.responseTime, result.success]
    );

    const recent = await db.query<any>(
      "select success from public.webhook_logs where endpoint_id = $1 order by triggered_at desc limit 100",
      [ep.id]
    );
    if (recent.rows.length > 0) {
      const successCount = recent.rows.filter((l: any) => l.success).length;
      const rate = Math.round((successCount / recent.rows.length) * 100);
      await db.query(
        "update public.webhook_endpoints set success_rate = $1, last_triggered_at = $2 where id = $3",
        [rate, new Date().toISOString(), ep.id]
      );
    }
    webhookResults.push({ endpoint_id: ep.id, ...result });
  }

  // Zapier integrations
  const zapsRes = await db.query<any>("select * from public.zapier_integrations where active = true and seller_id = $1", [sellerId]);
  const zaps = (zapsRes.rows || []).filter((z: any) => Array.isArray(z.events) && z.events.includes(event));
  const zapierResults: any[] = [];
  for (const z of zaps) {
    const start = Date.now();
    let success = false;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);
      const rawUrl = String(z.webhook_url || "").trim();
      let safeUrl = rawUrl;
      if (ssrfGuard) {
        try {
          safeUrl = (await assertSafeOutboundWebhookUrl(rawUrl, { allowHttp })).toString();
        } catch {
          logSecurityEvent(db, env, ({ headers: {}, ip: "", auth: null } as any), {
            route: "/api/functions/dispatch-webhook",
            eventType: "ssrf_blocked",
            code: "SSRF_BLOCKED",
            meta: { target: "zapier_integrations", integration_id: z.id },
          }).catch(() => {});
          if (!ssrfAuditOnly) {
            success = false;
            const responseTime = Date.now() - start;
            await db.query("insert into public.zapier_logs(integration_id, event, success) values ($1,$2,$3)", [z.id, event, false]).catch(() => {});
            zapierResults.push({ integration_id: z.id, success: false, responseTime, blocked: true });
            continue;
          }
        }
      }

      const res = await fetch(safeUrl, {
        method: "POST",
        redirect: "manual",
        headers: { "Content-Type": "application/json", "User-Agent": "DingitalPay-Zapier/1.0" },
        body: payload,
        signal: controller.signal
      });
      clearTimeout(timeout);
      await res.text();
      success = res.status >= 200 && res.status < 300;
    } catch {
      success = false;
    }
    const responseTime = Date.now() - start;
    try {
      await db.query("insert into public.zapier_logs(integration_id, event, success) values ($1,$2,$3)", [z.id, event, success]);
      await db.query("update public.zapier_integrations set last_triggered_at = $1 where id = $2", [new Date().toISOString(), z.id]);
    } catch {
      // ignore
    }
    zapierResults.push({ integration_id: z.id, success, responseTime });
  }

  return { dispatched: webhookResults.length + zapierResults.length, webhooks: webhookResults, zapier: zapierResults };
}
