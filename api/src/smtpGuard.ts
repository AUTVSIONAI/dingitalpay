import type { Db } from "./db.js";

export type SmtpGuardState = {
  enabled: boolean;
  host: string;
  port: string;
  username: string;
  fromEmail: string;
  hasPassword: boolean;
  lastTest: string | null;
};

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

export function mapSmtpGuardState(row: any): SmtpGuardState {
  const password = toText(row?.password);
  const passwordCiphertext = toText(row?.password_ciphertext);
  return {
    enabled: Boolean(row?.enabled),
    host: toText(row?.host),
    port: toText(row?.port),
    username: toText(row?.username),
    fromEmail: toText(row?.from_email),
    hasPassword: Boolean(password || passwordCiphertext),
    lastTest: toText(row?.last_test) || null,
  };
}

export async function readSmtpGuardState(db: Db): Promise<SmtpGuardState> {
  const res = await db.query<any>(
    `select enabled, host, port, username, from_email, password, password_ciphertext, last_test
       from public.smtp_config
      order by created_at asc
      limit 1`
  );
  return mapSmtpGuardState(res.rows[0] ?? null);
}

export function mergeSmtpGuardState(current: SmtpGuardState, patch: Record<string, any>): SmtpGuardState {
  const next = { ...current };
  if ("enabled" in patch) next.enabled = Boolean(patch.enabled);
  if ("host" in patch) next.host = toText(patch.host);
  if ("port" in patch) next.port = toText(patch.port);
  if ("username" in patch) next.username = toText(patch.username);
  if ("from_email" in patch) next.fromEmail = toText(patch.from_email);
  if ("password" in patch) next.hasPassword = Boolean(toText(patch.password)) || next.hasPassword;
  if ("password_ciphertext" in patch) next.hasPassword = Boolean(toText(patch.password_ciphertext));
  if ("last_test" in patch) next.lastTest = toText(patch.last_test) || null;
  return next;
}

export function smtpGuardHasRequiredFields(state: SmtpGuardState): boolean {
  const port = Number.parseInt(state.port, 10);
  return Boolean(
    state.host &&
      Number.isFinite(port) &&
      port > 0 &&
      state.username &&
      state.fromEmail &&
      state.hasPassword
  );
}

export function smtpGuardReadyForEmailVerification(state: SmtpGuardState): boolean {
  return state.enabled && smtpGuardHasRequiredFields(state) && Boolean(state.lastTest);
}
