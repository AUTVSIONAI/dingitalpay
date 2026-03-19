import type { FastifyInstance } from "fastify";
import { z } from "zod";
import crypto from "node:crypto";
import type { Db } from "./db.js";
import type { Env } from "./env.js";
import { requireAuth } from "./auth.js";

function ensureAuth(req: any, reply: any) {
  requireAuth(req, reply);
}

function isMissingTableError(err: any) {
  const code = String(err?.code || "");
  if (code === "42P01") return true;
  const msg = String(err?.message || "").toLowerCase();
  return msg.includes("does not exist") || msg.includes("undefined_table") || msg.includes("relation");
}

function sendMigrationRequired(reply: any) {
  return reply.code(503).send({
    error: {
      code: "MIGRATION_REQUIRED",
      message: "Sistema de afiliados ainda não foi instalado no banco. Aplique a migração 0034_affiliates.sql e reinicie a API.",
    },
  });
}

function roundCurrency(value: any): number {
  const n = Number(value || 0);
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function buildAffiliateUrl(env: Env, input: { offerSlug?: string | null; offerId?: string | null; productId: string; code: string }) {
  const base = String(env.PUBLIC_BASE_URL || "").replace(/\/+$/, "");
  const code = encodeURIComponent(input.code);
  if (input.offerSlug) return `${base}/c/${encodeURIComponent(input.offerSlug)}?ref=${code}`;
  if (input.offerId) return `${base}/checkout/offer/${encodeURIComponent(input.offerId)}?ref=${code}`;
  return `${base}/checkout/${encodeURIComponent(input.productId)}?ref=${code}`;
}

async function ensureAffiliateCodeUnique(db: Db, preferred?: string) {
  const candidate = String(preferred || "").trim().toUpperCase();
  if (candidate && /^[A-Z0-9]{6,32}$/.test(candidate)) return candidate;
  return crypto.randomBytes(6).toString("hex").toUpperCase();
}

export async function registerAffiliateRoutes(api: FastifyInstance, db: Db, env: Env) {
  api.post("/affiliate/links", async (req, reply) => {
    ensureAuth(req, reply);
    try {
      const auth = req.auth!;
      const body = z.object({
        product_id: z.string().uuid(),
        offer_id: z.string().uuid().optional().nullable(),
      }).parse(req.body);

      const userId = String(auth.user.id || "");
      const offerId = body.offer_id ? String(body.offer_id) : null;

      const productRes = await db.query<any>(
        "select id, name, status from public.products where id = $1 limit 1",
        [body.product_id]
      );
      const product = productRes.rows[0];
      if (!product) return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Produto não encontrado." } });
      if (String(product.status || "").toLowerCase() !== "active") {
        return reply.code(400).send({ error: { code: "PRODUCT_INACTIVE", message: "Produto indisponível para afiliação." } });
      }

      const programRes = await db.query<any>(
        "select enabled, commission_percent, cookie_days from public.affiliate_programs where product_id = $1 limit 1",
        [body.product_id]
      );
      const program = programRes.rows[0];
      if (!program || program.enabled !== true) {
        return reply.code(400).send({ error: { code: "PROGRAM_DISABLED", message: "Este produto ainda não está com afiliação habilitada." } });
      }

      let offerSlug: string | null = null;
      if (offerId) {
        const offerRes = await db.query<any>(
          "select id, slug, active from public.product_offers where id = $1 and product_id = $2 limit 1",
          [offerId, body.product_id]
        );
        const offer = offerRes.rows[0];
        if (!offer || offer.active !== true) {
          return reply.code(400).send({ error: { code: "INVALID_OFFER", message: "Oferta inválida ou inativa para este produto." } });
        }
        offerSlug = String(offer.slug || "").trim() || null;
      }

      const existingRes = await db.query<any>(
        `
          select id, code
          from public.affiliate_links
          where affiliate_user_id = $1
            and product_id = $2
            and offer_id is not distinct from $3::uuid
          limit 1
        `,
        [userId, body.product_id, offerId]
      );
      const existing = existingRes.rows[0];
      if (existing) {
        const url = buildAffiliateUrl(env, { offerSlug, offerId, productId: body.product_id, code: existing.code });
        return reply.send({ data: { id: existing.id, code: existing.code, url }, error: null });
      }

      let inserted: any = null;
      for (let attempt = 0; attempt < 6; attempt++) {
        const code = await ensureAffiliateCodeUnique(db);
        try {
          const ins = await db.query<any>(
            `
              insert into public.affiliate_links(code, product_id, offer_id, affiliate_user_id)
              values ($1,$2,$3,$4)
              returning id, code
            `,
            [code, body.product_id, offerId, userId]
          );
          inserted = ins.rows[0] || null;
          if (inserted) {
            const url = buildAffiliateUrl(env, { offerSlug, offerId, productId: body.product_id, code: inserted.code });
            return reply.send({ data: { id: inserted.id, code: inserted.code, url }, error: null });
          }
        } catch (err: any) {
          const msg = String(err?.message || "");
          const isUniqueViolation = msg.includes("duplicate key") || msg.includes("unique");
          if (!isUniqueViolation) throw err;
        }
      }

      return reply.code(500).send({ error: { code: "FAILED", message: "Falha ao gerar link de afiliado." } });
    } catch (err: any) {
      if (isMissingTableError(err)) return sendMigrationRequired(reply);
      throw err;
    }
  });

  api.get("/affiliate/links", async (req, reply) => {
    ensureAuth(req, reply);
    try {
      const auth = req.auth!;
      const query = z.object({ product_id: z.string().uuid().optional() }).parse(req.query || {});
      const userId = String(auth.user.id || "");

      const res = await db.query<any>(
        `
          select
            l.id,
            l.code,
            l.product_id,
            p.name as product_name,
            l.offer_id,
            o.slug as offer_slug,
            o.name as offer_name,
            l.created_at,
            ap.enabled as program_enabled,
            coalesce(ap.commission_percent, 0) as commission_percent
          from public.affiliate_links l
          join public.products p on p.id = l.product_id
          left join public.product_offers o on o.id = l.offer_id
          left join public.affiliate_programs ap on ap.product_id = l.product_id
          where l.affiliate_user_id = $1
            and ($2::uuid is null or l.product_id = $2::uuid)
          order by l.created_at desc
        `,
        [userId, query.product_id || null]
      );

      const data = (res.rows || []).map((row: any) => {
        const code = String(row.code || "");
        const url = buildAffiliateUrl(env, {
          offerSlug: row.offer_slug ? String(row.offer_slug) : null,
          offerId: row.offer_id ? String(row.offer_id) : null,
          productId: String(row.product_id || ""),
          code,
        });
        return {
          id: String(row.id || ""),
          code,
          url,
          product_id: String(row.product_id || ""),
          product_name: String(row.product_name || ""),
          offer_id: row.offer_id ? String(row.offer_id) : null,
          offer_slug: row.offer_slug ? String(row.offer_slug) : null,
          offer_name: row.offer_name ? String(row.offer_name) : null,
          created_at: row.created_at,
          program_enabled: row.program_enabled === true,
          commission_percent: roundCurrency(row.commission_percent),
        };
      });

      return reply.send({ data, error: null });
    } catch (err: any) {
      if (isMissingTableError(err)) return sendMigrationRequired(reply);
      throw err;
    }
  });

  api.get("/affiliate/commissions", async (req, reply) => {
    ensureAuth(req, reply);
    try {
      const auth = req.auth!;
      const query = z.object({ status: z.enum(["pending", "available", "canceled", "paid"]).optional() }).parse(req.query || {});
      const userId = String(auth.user.id || "");

      const res = await db.query<any>(
        `
          select
            c.id,
            c.order_id,
            c.product_id,
            p.name as product_name,
            c.seller_id,
            c.commission_percent,
            c.commission_amount,
            c.status as commission_status,
            c.created_at,
            o.status as order_status,
            coalesce(o.gross_amount, o.amount) as order_gross_amount,
            o.method as order_method
          from public.affiliate_commissions c
          join public.orders o on o.id = c.order_id
          join public.products p on p.id = c.product_id
          where c.affiliate_user_id = $1
            and ($2::public.affiliate_commission_status is null or c.status = $2::public.affiliate_commission_status)
          order by c.created_at desc
          limit 500
        `,
        [userId, query.status || null]
      );

      const data = (res.rows || []).map((row: any) => ({
        id: String(row.id || ""),
        order_id: String(row.order_id || ""),
        product_id: String(row.product_id || ""),
        product_name: String(row.product_name || ""),
        seller_id: String(row.seller_id || ""),
        commission_percent: roundCurrency(row.commission_percent),
        commission_amount: roundCurrency(row.commission_amount),
        commission_status: String(row.commission_status || "pending"),
        order_status: String(row.order_status || ""),
        order_gross_amount: roundCurrency(row.order_gross_amount),
        order_method: String(row.order_method || ""),
        created_at: row.created_at,
      }));

      return reply.send({ data, error: null });
    } catch (err: any) {
      if (isMissingTableError(err)) return sendMigrationRequired(reply);
      throw err;
    }
  });

  api.get("/affiliate/summary", async (req, reply) => {
    ensureAuth(req, reply);
    try {
      const auth = req.auth!;
      const userId = String(auth.user.id || "");

      const totalsRes = await db.query<any>(
        `
          select
            coalesce(sum(case when status = 'pending' then commission_amount else 0 end), 0) as pending_total,
            coalesce(sum(case when status = 'available' then commission_amount else 0 end), 0) as available_total,
            coalesce(sum(case when status = 'paid' then commission_amount else 0 end), 0) as paid_total,
            count(*)::int as total_count
          from public.affiliate_commissions
          where affiliate_user_id = $1
        `,
        [userId]
      );
      const row = totalsRes.rows[0] || {};
      return reply.send({
        data: {
          pending_total: roundCurrency(row.pending_total),
          available_total: roundCurrency(row.available_total),
          paid_total: roundCurrency(row.paid_total),
          total_count: Number(row.total_count || 0),
        },
        error: null,
      });
    } catch (err: any) {
      if (isMissingTableError(err)) return sendMigrationRequired(reply);
      throw err;
    }
  });
}
