import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import * as crypto from "node:crypto";
import type { Db } from "./db.js";
import type { Env } from "./env.js";
import { requireAdmin } from "./auth.js";
import { logSecurityEvent } from "./securityAudit.js";

type LegalPublicRow = {
  terms_of_use: string;
  privacy_policy: string;
  require_terms_acceptance: boolean;
  updated_at: string;
};

const HTML_TAG_RE = /<[^>]*>/g;
const HTML_SPACE_RE = /&nbsp;|&#160;/gi;
const WHITESPACE_RE = /\s+/g;

function hasMeaningfulRichText(value: string | null | undefined): boolean {
  return String(value || "")
    .replace(HTML_SPACE_RE, " ")
    .replace(HTML_TAG_RE, " ")
    .replace(WHITESPACE_RE, " ")
    .trim()
    .length > 0;
}

function computeEtag(payload: unknown): string {
  const raw = JSON.stringify(payload ?? null);
  const hash = crypto.createHash("sha256").update(raw).digest("hex");
  return `"${hash}"`;
}

function getPath(req: FastifyRequest): string {
  const url = String(req.raw.url || req.url || "");
  return url.split("?")[0] || url;
}

export async function registerLegalRoutes(app: FastifyInstance, db: Db, env: Env) {
  // Public, read-only legal content used by unauthenticated pages (register/login).
  app.get("/public/legal", async (req, reply) => {
    let row: LegalPublicRow | null = null;
    try {
      const res = await db.query<LegalPublicRow>(
        "select terms_of_use, privacy_policy, require_terms_acceptance, updated_at from public.platform_settings order by created_at asc limit 1"
      );
      row = res.rows[0] ?? null;
    } catch (err: any) {
      logSecurityEvent(db, env, req, {
        route: getPath(req),
        eventType: "public_legal_failed",
        code: "PUBLIC_LEGAL_FAILED",
        meta: { message: String(err?.message || "unknown") },
      }).catch(() => {});
      throw err;
    }

    const etag = computeEtag(row);
    const inm = String(req.headers["if-none-match"] || "").trim();
    reply.header("ETag", etag);
    // Legal content can change from the admin panel and must reflect immediately
    // on registration/login pages, so force revalidation on every navigation.
    reply.header("Cache-Control", "no-cache, max-age=0, must-revalidate");

    if (inm && inm === etag) return reply.code(304).send();
    return reply.send({ data: row, error: null });
  });

  // Admin-only writer for legal content (terms/privacy). Keeps payload scoped + audit trail.
  app.put("/admin/legal", async (req, reply) => {
    await requireAdmin(db, req, reply);

    const schema = z
      .object({
        terms_of_use: z.string().max(300_000).optional(),
        privacy_policy: z.string().max(300_000).optional(),
        require_terms_acceptance: z.boolean().optional(),
      })
      .refine((v) => Object.keys(v).length > 0, { message: "No changes provided" });

    const body = schema.parse(req.body);
    const termsProvided = Object.prototype.hasOwnProperty.call(body, "terms_of_use");
    const privacyProvided = Object.prototype.hasOwnProperty.call(body, "privacy_policy");
    const requireProvided = Object.prototype.hasOwnProperty.call(body, "require_terms_acceptance");

    const terms = body.terms_of_use ?? "";
    const privacy = body.privacy_policy ?? "";
    const requireAcceptance = body.require_terms_acceptance ?? false;
    const currentRes = await db.query<LegalPublicRow>(
      "select terms_of_use, privacy_policy, require_terms_acceptance, updated_at from public.platform_settings order by created_at asc limit 1"
    );
    const current = currentRes.rows[0] ?? null;

    const finalTerms = termsProvided ? terms : current?.terms_of_use ?? "";
    const finalPrivacy = privacyProvided ? privacy : current?.privacy_policy ?? "";
    const finalRequireAcceptance = requireProvided ? requireAcceptance : current?.require_terms_acceptance ?? false;

    if (finalRequireAcceptance && (!hasMeaningfulRichText(finalTerms) || !hasMeaningfulRichText(finalPrivacy))) {
      return reply.code(400).send({
        error: {
          code: "LEGAL_ACCEPTANCE_REQUIRES_CONTENT",
          message: "Preencha Termos de Uso e Política de Privacidade antes de ativar o aceite obrigatório no cadastro.",
        },
      });
    }

    const updateRes = await db.query<LegalPublicRow>(
      `
        with s as (
          select id from public.platform_settings order by created_at asc limit 1
        )
        update public.platform_settings ps
        set
          terms_of_use = case when $2::boolean then $1::text else ps.terms_of_use end,
          privacy_policy = case when $4::boolean then $3::text else ps.privacy_policy end,
          require_terms_acceptance = case when $6::boolean then $5::boolean else ps.require_terms_acceptance end,
          updated_at = now()
        from s
        where ps.id = s.id
        returning terms_of_use, privacy_policy, require_terms_acceptance, updated_at
      `,
      [terms, termsProvided, privacy, privacyProvided, requireAcceptance, requireProvided]
    );

    // If the singleton row does not exist (unexpected), create it.
    let row = updateRes.rows[0] ?? null;
    if (!row) {
      const insertRes = await db.query<LegalPublicRow>(
        `
          insert into public.platform_settings(terms_of_use, privacy_policy, require_terms_acceptance)
          values ($1,$2,$3)
          returning terms_of_use, privacy_policy, require_terms_acceptance, updated_at
        `,
        [termsProvided ? terms : "", privacyProvided ? privacy : "", requireProvided ? requireAcceptance : false]
      );
      row = insertRes.rows[0] ?? null;
    }

    logSecurityEvent(db, env, req, {
      route: getPath(req),
      eventType: "legal_updated",
      code: "LEGAL_UPDATED",
      meta: {
        termsProvided,
        privacyProvided,
        requireProvided,
        termsLength: termsProvided ? terms.length : undefined,
        privacyLength: privacyProvided ? privacy.length : undefined,
      },
    }).catch(() => {});

    return reply.send({ data: row, error: null });
  });
}
