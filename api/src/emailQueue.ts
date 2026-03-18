import { z } from "zod";
import type { Db } from "./db.js";
import { renderTemplate } from "./email.js";

type SmtpConfigRow = {
  enabled: boolean;
};

type PlatformSettingsRow = {
  platform_name: string;
  platform_url: string;
  support_email: string;
};

type EmailTemplateRow = {
  event_key: string;
  subject: string;
  body: string;
  enabled: boolean;
};

export type EnqueueResult =
  | { ok: true; queued: true; outbox_id: string }
  | { ok: true; queued: false; reason: "smtp_disabled" | "template_disabled" }
  | { ok: false; error: string };

function sanitizeVars(input: unknown): Record<string, string> {
  if (!input || typeof input !== "object") return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(input as any)) {
    if (!/^[a-zA-Z0-9_]+$/.test(k)) continue;
    out[k] = v == null ? "" : String(v);
  }
  return out;
}

async function isSmtpEnabled(db: Db): Promise<boolean> {
  const smtpRes = await db.query<SmtpConfigRow>("select enabled from public.smtp_config limit 1");
  return Boolean(smtpRes.rows[0]?.enabled);
}

async function loadPlatformVars(db: Db): Promise<Record<string, string>> {
  const res = await db.query<PlatformSettingsRow>("select platform_name, platform_url, support_email from public.platform_settings limit 1");
  const row = res.rows[0];
  return {
    platform_name: String(row?.platform_name || "Plataforma"),
    platform_url: String(row?.platform_url || ""),
    support_email: String(row?.support_email || ""),
  };
}

export async function enqueueRenderedEmail(db: Db, args: {
  to: string;
  subject: string;
  html: string;
  text?: string;
  templateEventKey?: string;
  vars?: Record<string, string>;
  campaignId?: string | null;
  dedupeKey?: string | null;
  maxAttempts?: number;
}): Promise<EnqueueResult> {
  const schema = z.object({
    to: z.string().email(),
    subject: z.string().min(1),
    html: z.string().min(1),
    text: z.string().optional(),
    templateEventKey: z.string().optional(),
    vars: z.record(z.string()).optional(),
    campaignId: z.string().uuid().nullable().optional(),
    dedupeKey: z.string().max(200).nullable().optional(),
    maxAttempts: z.number().int().positive().max(20).optional(),
  });
  const parsed = schema.parse(args);

  const smtpOk = await isSmtpEnabled(db);
  if (!smtpOk) return { ok: true, queued: false, reason: "smtp_disabled" };

  const outboxRes = await db.query<{ id: string }>(
    `insert into public.email_outbox(to_email, subject, html, text, template_event_key, vars, campaign_id, dedupe_key, max_attempts)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     returning id`,
    [
      parsed.to,
      parsed.subject,
      parsed.html,
      parsed.text || "",
      parsed.templateEventKey || "",
      JSON.stringify(parsed.vars || {}),
      parsed.campaignId ?? null,
      parsed.dedupeKey ?? null,
      parsed.maxAttempts ?? 5,
    ]
  );
  return { ok: true, queued: true, outbox_id: outboxRes.rows[0]!.id };
}

export async function enqueueTemplatedEmail(db: Db, args: {
  to: string;
  eventKey: string;
  vars?: Record<string, any>;
  dedupeKey?: string | null;
  campaignId?: string | null;
}): Promise<EnqueueResult> {
  const schema = z.object({
    to: z.string().email(),
    eventKey: z.string().min(1).max(80),
    vars: z.record(z.any()).optional(),
    dedupeKey: z.string().max(200).nullable().optional(),
    campaignId: z.string().uuid().nullable().optional(),
  });
  const parsed = schema.parse(args);

  const smtpOk = await isSmtpEnabled(db);
  if (!smtpOk) return { ok: true, queued: false, reason: "smtp_disabled" };

  const tplRes = await db.query<EmailTemplateRow>(
    "select event_key, subject, body, enabled from public.email_templates where event_key = $1 limit 1",
    [parsed.eventKey]
  );
  const tpl = tplRes.rows[0];
  if (!tpl || !tpl.enabled) return { ok: true, queued: false, reason: "template_disabled" };

  const baseVars = await loadPlatformVars(db);
  const userVars = sanitizeVars(parsed.vars || {});
  const merged = { ...baseVars, ...userVars };
  const subject = renderTemplate(String(tpl.subject || ""), merged).trim() || "Mensagem";
  const html = renderTemplate(String(tpl.body || ""), merged).trim() || "<p>Mensagem</p>";
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

  return enqueueRenderedEmail(db, {
    to: parsed.to,
    subject,
    html,
    text,
    templateEventKey: parsed.eventKey,
    vars: merged,
    campaignId: parsed.campaignId ?? null,
    dedupeKey: parsed.dedupeKey ?? null,
  });
}

