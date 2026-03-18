import nodemailer from "nodemailer";
import type { Db } from "./db.js";
import type { Env } from "./env.js";
import { signTrackingToken } from "./tracking.js";
import { renderTemplate } from "./email.js";
import { decryptSmtpPassword, ensureSmtpPasswordEncrypted } from "./smtpCrypto.js";

type OutboxRow = {
  id: string;
  campaign_id: string | null;
  template_event_key: string;
  to_email: string;
  subject: string;
  html: string;
  text: string;
  vars: any;
  status: string;
  attempts: number;
  max_attempts: number;
};

type SmtpConfigRow = {
  id?: string;
  host: string;
  port: string;
  username: string;
  password: string;
  password_ciphertext?: string | null;
  password_iv?: string | null;
  password_tag?: string | null;
  from_name: string;
  from_email: string;
  enabled: boolean;
  emails_sent_today?: number;
  last_sent_at?: string | null;
};

function safeErrorMessage(err: any): string {
  const msg = String(err?.message || err || "Falha ao enviar e-mail.");
  // avoid leaking secrets (very basic)
  return msg.replace(/(pass(word)?|secret|token)=([^&\\s]+)/gi, "$1=***");
}

function startOfUtcDay(d: Date = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function startOfTomorrowUtc(): Date {
  const today = startOfUtcDay();
  return new Date(today.getTime() + 24 * 60 * 60 * 1000);
}

function toPositiveInt(value: any): number | null {
  const n = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

let lastSendAtMs = 0;
async function throttleSends(maxPerMinute: number | null) {
  if (!maxPerMinute) return;
  const minIntervalMs = Math.max(0, Math.floor(60_000 / maxPerMinute));
  if (!minIntervalMs) return;
  const elapsed = Date.now() - lastSendAtMs;
  if (elapsed < minIntervalMs) {
    await new Promise((r) => setTimeout(r, minIntervalMs - elapsed));
  }
}

function applyOpenTracking(env: Env, outboxId: string, html: string): string {
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 60 * 60 * 24 * 90; // 90 days
  const token = signTrackingToken(env.MASTER_KEY, { t: "open", id: outboxId, iat, exp });
  const src = `${env.PUBLIC_BASE_URL}/api/email/open/${encodeURIComponent(token)}`;
  const pixel = `<img src="${src}" alt="" width="1" height="1" style="display:none;opacity:0;" />`;
  if (/<\/body\s*>/i.test(html)) return html.replace(/<\/body\s*>/i, `${pixel}</body>`);
  return `${html}\n${pixel}`;
}

function rewriteClickLinks(env: Env, outboxId: string, html: string): string {
  // Conservative: rewrite only absolute http(s) hrefs in <a ... href="...">
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 60 * 60 * 24 * 90;
  return html.replace(/<a\s+([^>]*?)href=(["'])(https?:\/\/[^"']+)\2([^>]*?)>/gi, (m, pre, quote, url, post) => {
    // Avoid rewriting our own tracking urls
    if (String(url).includes("/api/email/click/")) return m;
    const token = signTrackingToken(env.MASTER_KEY, { t: "click", id: outboxId, u: String(url), iat, exp });
    const tracked = `${env.PUBLIC_BASE_URL}/api/email/click/${encodeURIComponent(token)}`;
    return `<a ${pre}href=${quote}${tracked}${quote}${post}>`;
  });
}

async function insertLog(db: Db, outboxId: string, level: "info" | "error", message: string, meta: Record<string, any> = {}) {
  await db.query(
    "insert into public.email_logs(outbox_id, level, message, meta) values ($1,$2,$3,$4)",
    [outboxId, level, message, JSON.stringify(meta || {})]
  );
}

export async function processNextEmailOutboxJob(db: Db, env: Env): Promise<{ processed: boolean }> {
  // Recover stuck "sending" after 10 minutes
  const jobRes = await db.query<OutboxRow>(
    `
      with next_job as (
        select id
        from public.email_outbox
        where
          (
            status = 'queued' and (next_retry_at is null or next_retry_at <= now())
          )
          or (
            status = 'sending' and locked_at is not null and locked_at < now() - interval '10 minutes'
          )
        order by created_at asc
        limit 1
        for update skip locked
      )
      update public.email_outbox eo
      set status = 'sending', locked_at = now()
      from next_job
      where eo.id = next_job.id
      returning eo.*
    `
  );
  const job = jobRes.rows[0];
  if (!job) return { processed: false };

  const smtpRes = await db.query<SmtpConfigRow>("select * from public.smtp_config limit 1");
  const smtp = smtpRes.rows[0];
  if (!smtp || !smtp.enabled) {
    await db.query(
      "update public.email_outbox set status = 'failed', last_error = $2, updated_at = now() where id = $1",
      [job.id, "SMTP desabilitado ou não configurado."]
    );
    await insertLog(db, job.id, "error", "SMTP desabilitado ou não configurado.");
    return { processed: true };
  }
  await ensureSmtpPasswordEncrypted(db, env, smtp);

  // Reset daily counters if a new UTC day has started
  try {
    const lastSentAt = smtp.last_sent_at ? new Date(String(smtp.last_sent_at)) : null;
    if (lastSentAt && lastSentAt.getTime() < startOfUtcDay().getTime() && (smtp.emails_sent_today || 0) !== 0) {
      await db.query("update public.smtp_config set emails_sent_today = 0 where id is not null");
      smtp.emails_sent_today = 0;
    }
  } catch {
    // ignore
  }

  // Guardrails: optional global limits
  const dailyLimit = toPositiveInt((env as any).EMAIL_DAILY_LIMIT) ?? 5000;
  const maxPerMinute = toPositiveInt((env as any).EMAIL_MAX_PER_MINUTE) ?? 120;
  if ((smtp.emails_sent_today || 0) >= dailyLimit) {
    const next = startOfTomorrowUtc().toISOString();
    await db.query(
      "update public.email_outbox set status = 'queued', next_retry_at = $2, last_error = $3, updated_at = now() where id = $1",
      [job.id, next, `Limite diário de e-mails atingido (${dailyLimit}/dia).`]
    );
    await insertLog(db, job.id, "error", "Limite diário de e-mails atingido.", { dailyLimit });
    return { processed: true };
  }

  const host = String(smtp.host || "").trim();
  const port = Number.parseInt(String(smtp.port || "587"), 10) || 587;
  const secure = port === 465;
  const username = String(smtp.username || "").trim();
  const password = decryptSmtpPassword(env, smtp);
  const fromEmail = String(smtp.from_email || "").trim();
  const fromName = String(smtp.from_name || "").trim();
  if (!host || !fromEmail) {
    await db.query(
      "update public.email_outbox set status = 'failed', last_error = $2, updated_at = now() where id = $1",
      [job.id, "SMTP inválido (host/from_email)."]
    );
    await insertLog(db, job.id, "error", "SMTP inválido (host/from_email).");
    return { processed: true };
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: username ? { user: username, pass: password } : undefined,
    tls: { rejectUnauthorized: !env.SMTP_ALLOW_INSECURE_TLS }
  });

  await throttleSends(maxPerMinute);
  const from = fromName ? `${fromName} <${fromEmail}>` : fromEmail;
  const htmlTracked = rewriteClickLinks(env, job.id, applyOpenTracking(env, job.id, String(job.html || "")));
  const text = String(job.text || "") || String(job.html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

  try {
    await transporter.sendMail({
      from,
      to: job.to_email,
      subject: job.subject,
      html: htmlTracked,
      text
    });
    lastSendAtMs = Date.now();

    await db.query(
      "update public.email_outbox set status = 'sent', sent_at = now(), last_error = '', updated_at = now() where id = $1",
      [job.id]
    );
    await db.query("update public.smtp_config set emails_sent_today = emails_sent_today + 1, last_sent_at = now() where id is not null");

    if (job.template_event_key) {
      await db.query("update public.email_templates set sent_count = sent_count + 1 where event_key = $1", [job.template_event_key]);
    }
    if (job.campaign_id) {
      await db.query("update public.email_campaigns set recipients_count = greatest(recipients_count, 0) where id = $1", [job.campaign_id]);
    }

    await insertLog(db, job.id, "info", "E-mail enviado com sucesso.", { to: job.to_email });
    return { processed: true };
  } catch (e: any) {
    const msg = safeErrorMessage(e);
    const attempts = Number(job.attempts || 0) + 1;
    const maxAttempts = Number(job.max_attempts || 5);
    const failed = attempts >= maxAttempts;
    const backoffSeconds = Math.min(60 * 60, Math.round(Math.pow(2, Math.min(attempts, 10)) * 5));
    const nextRetryAt = failed ? null : new Date(Date.now() + backoffSeconds * 1000).toISOString();

    await db.query(
      `
        update public.email_outbox
        set
          status = $2,
          attempts = $3,
          next_retry_at = $4,
          last_error = $5,
          updated_at = now()
        where id = $1
      `,
      [job.id, failed ? "failed" : "queued", attempts, nextRetryAt, msg]
    );
    await insertLog(db, job.id, "error", "Falha ao enviar e-mail.", { error: msg, attempts, maxAttempts });
    return { processed: true };
  }
}

export async function reconcileCampaignStatuses(db: Db): Promise<void> {
  // Mark campaigns as "sent" when there are no queued/sending jobs
  await db.query(
    `
      update public.email_campaigns c
      set status = 'sent', sent_at = coalesce(sent_at, now())
      where c.status = 'sending'
        and not exists (
          select 1 from public.email_outbox o
          where o.campaign_id = c.id and o.status in ('queued','sending')
        )
    `
  );
}

export async function dispatchDueCampaigns(db: Db): Promise<void> {
  const dueRes = await db.query<any>(
    "select id, subject, body, segment from public.email_campaigns where status = 'scheduled' and scheduled_at is not null and scheduled_at <= now() order by scheduled_at asc limit 5"
  );
  const due = dueRes.rows;
  if (!due.length) return;

  const platRes = await db.query<any>("select platform_name, platform_url, support_email from public.platform_settings limit 1");
  const plat = platRes.rows[0] || {};
  const platformVars = {
    platform_name: String(plat.platform_name || "Plataforma"),
    platform_url: String(plat.platform_url || ""),
    support_email: String(plat.support_email || ""),
  };

  for (const campaign of due) {
    const campaignId = String(campaign.id);
    const segment = String(campaign.segment || "buyers");
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

    if (recipients.length === 0) {
      await db.query("update public.email_campaigns set status = 'sent', sent_at = now(), recipients_count = 0 where id = $1", [campaignId]);
      continue;
    }

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
        dedupe_key: `campaign:${campaignId}:${String(r.email || "").toLowerCase()}`,
      };
    });

    await db.query("update public.email_campaigns set status = 'sending', recipients_count = $2, canceled_at = null, updated_at = now() where id = $1", [campaignId, recipients.length]);
    await db.query(
      `
        insert into public.email_outbox(campaign_id, template_event_key, to_email, subject, html, text, vars, dedupe_key)
        select $1::uuid, ''::text, x.to_email::text, x.subject::text, x.html::text, x.text::text, x.vars::jsonb, x.dedupe_key::text
        from jsonb_to_recordset($2::jsonb) as x(to_email text, subject text, html text, text text, vars jsonb, dedupe_key text)
      `,
      [campaignId, JSON.stringify(rows)]
    );
  }
}
