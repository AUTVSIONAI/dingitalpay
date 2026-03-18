import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Db } from "./db.js";
import type { Env } from "./env.js";
import {
  invalidatePlatformAuthPolicyCache,
  requireAdmin,
  revokeSessionsMissingRequiredTwoFactor,
} from "./auth.js";
import { logSecurityEvent } from "./securityAudit.js";
import { readSmtpGuardState, smtpGuardReadyForEmailVerification } from "./smtpGuard.js";

type PlatformAuthRow = {
  email_verification: boolean;
  two_factor: boolean;
};

function getPath(req: FastifyRequest): string {
  const url = String(req.raw.url || req.url || "");
  return url.split("?")[0] || url;
}

export async function registerPlatformAuthSettingsRoutes(app: FastifyInstance, db: Db, env: Env) {
  app.put("/admin/platform-auth-settings", async (req, reply) => {
    await requireAdmin(db, req, reply);
    if (reply.sent) return;

    const body = z
      .object({
        email_verification: z.boolean().optional(),
        two_factor: z.boolean().optional(),
      })
      .refine((value) => Object.keys(value).length > 0, { message: "No changes provided" })
      .parse(req.body);

    const currentRes = await db.query<PlatformAuthRow>(
      "select email_verification, two_factor from public.platform_settings order by created_at asc limit 1"
    );
    const current = currentRes.rows[0] ?? { email_verification: false, two_factor: false };

    const nextEmailVerification =
      body.email_verification !== undefined ? body.email_verification : current.email_verification;
    const nextTwoFactor = body.two_factor !== undefined ? body.two_factor : current.two_factor;

    if (!current.email_verification && nextEmailVerification) {
      const smtpState = await readSmtpGuardState(db).catch(() => null);
      if (!smtpState || !smtpGuardReadyForEmailVerification(smtpState)) {
        return reply.code(400).send({
          error: {
            code: "SMTP_REQUIRED_FOR_EMAIL_VERIFICATION",
            message:
              "Para ativar a verificacao obrigatoria de e-mail, o SMTP precisa estar ativo, configurado e com teste de conexao concluido com sucesso.",
          },
        });
      }
    }

    const updateRes = await db.query<PlatformAuthRow>(
      `
        with s as (
          select id from public.platform_settings order by created_at asc limit 1
        )
        update public.platform_settings ps
        set
          email_verification = case when $1::boolean is not null then $1::boolean else ps.email_verification end,
          two_factor = case when $2::boolean is not null then $2::boolean else ps.two_factor end,
          updated_at = now()
        from s
        where ps.id = s.id
        returning email_verification, two_factor
      `,
      [body.email_verification ?? null, body.two_factor ?? null]
    );

    let row = updateRes.rows[0] ?? null;
    if (!row) {
      const insertRes = await db.query<PlatformAuthRow>(
        `
          insert into public.platform_settings(email_verification, two_factor)
          values ($1, $2)
          returning email_verification, two_factor
        `,
        [nextEmailVerification, nextTwoFactor]
      );
      row = insertRes.rows[0] ?? null;
    }

    invalidatePlatformAuthPolicyCache();

    let revokedSessions = 0;
    if (!current.two_factor && nextTwoFactor) {
      revokedSessions = await revokeSessionsMissingRequiredTwoFactor(db).catch(() => 0);
    }

    logSecurityEvent(db, env, req, {
      route: getPath(req),
      eventType: "platform_auth_settings_updated",
      code: "PLATFORM_AUTH_SETTINGS_UPDATED",
      meta: {
        emailVerification: row?.email_verification ?? nextEmailVerification,
        twoFactor: row?.two_factor ?? nextTwoFactor,
        revokedSessions,
      },
    }).catch(() => {});

    return reply.send({
      data: {
        email_verification: row?.email_verification ?? nextEmailVerification,
        two_factor: row?.two_factor ?? nextTwoFactor,
        revoked_sessions: revokedSessions,
      },
      error: null,
    });
  });
}
