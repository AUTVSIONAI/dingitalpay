import { renderTemplate } from "./email.js";
import { enqueueRenderedEmail } from "./emailQueue.js";
import type { Db } from "./db.js";

const DEFAULT_ONBOARDING_URL = "https://app.dingitalpay.com/entrar";
const DEFAULT_SUBJECT = "Seu acesso ao onboarding da DingitalPay esta pronto";
const DEFAULT_BODY_HTML =
  "<p>Ola {{customer_name}},</p>" +
  "<p>Sua compra foi aprovada e o seu acesso ao onboarding da DingitalPay ja esta liberado.</p>" +
  "<p><strong>Pagina do onboarding:</strong> <a href=\"{{onboarding_url}}\">{{onboarding_url}}</a><br />" +
  "<strong>Login:</strong> {{login_email}}<br />" +
  "<strong>Senha:</strong> {{onboarding_password}}</p>" +
  "<p>Guarde estes dados em local seguro. Se precisar de ajuda, responda este e-mail ou fale com {{support_email}}.</p>";

type OnboardingAccessEmailSettingsRow = {
  product_id: string;
  enabled: boolean;
  onboarding_url: string;
  subject: string;
  body_html: string;
  created_at: string;
  updated_at: string;
};

type PlatformVarsRow = {
  platform_name: string | null;
  support_email: string | null;
  platform_url: string | null;
};

export type OnboardingAccessEmailSettings = {
  productId: string;
  enabled: boolean;
  onboardingUrl: string;
  subject: string;
  bodyHtml: string;
  createdAt: string | null;
  updatedAt: string | null;
};

export type OnboardingAccessEmailSendResult =
  | { ok: true; queued: true }
  | { ok: true; queued: false; reason: "settings_disabled" | "smtp_disabled" }
  | { ok: false; error: string };

function stripHtml(html: string) {
  return String(html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function defaultSettings(productId: string): OnboardingAccessEmailSettings {
  return {
    productId,
    enabled: false,
    onboardingUrl: DEFAULT_ONBOARDING_URL,
    subject: DEFAULT_SUBJECT,
    bodyHtml: DEFAULT_BODY_HTML,
    createdAt: null,
    updatedAt: null,
  };
}

async function ensureSettingsRow(db: Db, productId: string) {
  await db.query(
    `
      insert into public.onboarding_access_email_settings (product_id, onboarding_url, subject, body_html)
      values ($1, $2, $3, $4)
      on conflict (product_id) do nothing
    `,
    [productId, DEFAULT_ONBOARDING_URL, DEFAULT_SUBJECT, DEFAULT_BODY_HTML]
  );
}

async function loadPlatformVars(db: Db): Promise<Record<string, string>> {
  const res = await db.query<PlatformVarsRow>(
    "select platform_name, support_email, platform_url from public.platform_settings order by created_at asc limit 1"
  );
  const row = res.rows[0];
  return {
    platform_name: String(row?.platform_name || "DingitalPay"),
    support_email: String(row?.support_email || ""),
    platform_url: String(row?.platform_url || ""),
  };
}

function mapSettingsRow(row: OnboardingAccessEmailSettingsRow | undefined, productId: string): OnboardingAccessEmailSettings {
  if (!row) return defaultSettings(productId);
  return {
    productId: row.product_id,
    enabled: Boolean(row.enabled),
    onboardingUrl: String(row.onboarding_url || DEFAULT_ONBOARDING_URL),
    subject: String(row.subject || DEFAULT_SUBJECT),
    bodyHtml: String(row.body_html || DEFAULT_BODY_HTML),
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

export async function getOnboardingAccessEmailSettings(db: Db, productId: string): Promise<OnboardingAccessEmailSettings> {
  await ensureSettingsRow(db, productId);
  const res = await db.query<OnboardingAccessEmailSettingsRow>(
    `
      select product_id, enabled, onboarding_url, subject, body_html, created_at, updated_at
      from public.onboarding_access_email_settings
      where product_id = $1
      limit 1
    `,
    [productId]
  );
  return mapSettingsRow(res.rows[0], productId);
}

export async function saveOnboardingAccessEmailSettings(
  db: Db,
  args: { productId: string; enabled: boolean; onboardingUrl: string; subject: string; bodyHtml: string }
): Promise<OnboardingAccessEmailSettings> {
  await ensureSettingsRow(db, args.productId);
  const res = await db.query<OnboardingAccessEmailSettingsRow>(
    `
      update public.onboarding_access_email_settings
      set enabled = $2,
          onboarding_url = $3,
          subject = $4,
          body_html = $5
      where product_id = $1
      returning product_id, enabled, onboarding_url, subject, body_html, created_at, updated_at
    `,
    [args.productId, args.enabled, args.onboardingUrl, args.subject, args.bodyHtml]
  );
  return mapSettingsRow(res.rows[0], args.productId);
}

export async function enqueueOnboardingAccessEmail(
  db: Db,
  args: {
    productId: string;
    to: string;
    customerName?: string;
    customerEmail?: string;
    productName?: string;
    loginEmail: string;
    onboardingPassword: string;
    licenseId?: string | null;
    dedupeKey?: string | null;
  }
): Promise<OnboardingAccessEmailSendResult> {
  const settings = await getOnboardingAccessEmailSettings(db, args.productId);
  if (!settings.enabled) return { ok: true, queued: false, reason: "settings_disabled" };

  const platformVars = await loadPlatformVars(db);
  const vars = {
    ...platformVars,
    customer_name: String(args.customerName || "Cliente"),
    customer_email: String(args.customerEmail || args.to || "").trim(),
    product_name: String(args.productName || "DingitalPay"),
    onboarding_url: String(settings.onboardingUrl || DEFAULT_ONBOARDING_URL),
    login_email: String(args.loginEmail || args.to || "").trim(),
    onboarding_password: String(args.onboardingPassword || "").trim(),
    license_id: String(args.licenseId || "").trim(),
  };

  const subject = renderTemplate(settings.subject || DEFAULT_SUBJECT, vars).trim() || DEFAULT_SUBJECT;
  const html = renderTemplate(settings.bodyHtml || DEFAULT_BODY_HTML, vars).trim() || DEFAULT_BODY_HTML;
  const queued = await enqueueRenderedEmail(db, {
    to: args.to,
    subject,
    html,
    text: stripHtml(html),
    templateEventKey: "onboarding_access_delivery",
    vars,
    dedupeKey: args.dedupeKey ?? null,
  });

  if (!queued.ok) return { ok: false, error: queued.error };
  if (!queued.queued) return { ok: true, queued: false, reason: queued.reason === "smtp_disabled" ? "smtp_disabled" : "settings_disabled" };
  return { ok: true, queued: true };
}
