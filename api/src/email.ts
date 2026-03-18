import nodemailer from "nodemailer";
import type { Db } from "./db.js";
import { loadEnv } from "./env.js";
import { decryptSmtpPassword, ensureSmtpPasswordEncrypted } from "./smtpCrypto.js";

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
};

type EmailTemplateRow = {
  event_key: string;
  subject: string;
  body: string;
  enabled: boolean;
};

export function renderTemplate(input: string, vars: Record<string, string>): string {
  return input.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key) => vars[key] ?? "");
}

export async function sendTemplatedEmail(db: Db, args: {
  to: string;
  eventKey: string;
  vars: Record<string, string>;
}): Promise<void> {
  const env = loadEnv();
  const { to, eventKey, vars } = args;

  const smtpRes = await db.query<SmtpConfigRow>("select * from public.smtp_config limit 1");
  const smtp = smtpRes.rows[0];
  if (!smtp || !smtp.enabled) throw new Error("SMTP não configurado");
  await ensureSmtpPasswordEncrypted(db, env, smtp);

  const tplRes = await db.query<EmailTemplateRow>(
    "select event_key, subject, body, enabled from public.email_templates where event_key = $1 limit 1",
    [eventKey]
  );
  const tpl = tplRes.rows[0];
  if (!tpl || !tpl.enabled) throw new Error("Template de e-mail desabilitado ou inexistente");

  const port = Number.parseInt(String(smtp.port || "587"), 10) || 587;
  const secure = port === 465;
  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port,
    secure,
    auth: String(smtp.username || "").trim()
      ? {
          user: smtp.username,
          pass: decryptSmtpPassword(env, smtp)
        }
      : undefined,
    tls: {
      rejectUnauthorized: !env.SMTP_ALLOW_INSECURE_TLS
    }
  });

  const subject = renderTemplate(tpl.subject, vars);
  const html = renderTemplate(tpl.body, vars);

  const from = String(smtp.from_name || "").trim()
    ? `${smtp.from_name} <${smtp.from_email}>`
    : String(smtp.from_email || "").trim();

  await transporter.sendMail({
    from,
    to,
    subject,
    html,
    text: html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
  });

  await db.query(
    "update public.email_templates set sent_count = sent_count + 1 where event_key = $1",
    [eventKey]
  );
  await db.query(
    "update public.smtp_config set emails_sent_today = emails_sent_today + 1, last_test = $1",
    [new Date().toISOString()]
  );
}
