import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { Db } from "./db.js";
import { withClient } from "./db.js";
import { requireAuth } from "./auth.js";
import {
  assertOwnedBySellerViaCourseId,
  assertOwnedBySellerViaModuleId,
  assertOwnedBySellerViaProductsJoin,
  assertOwnedCourseLesson,
  assertOwnedCourseModule,
} from "./dbOwnership.js";

function isMissingTableError(err: any) {
  const code = String(err?.code || "");
  if (code === "42P01") return true;
  const msg = String(err?.message || "").toLowerCase();
  return msg.includes("does not exist") || msg.includes("undefined_table") || msg.includes("relation");
}

function sendAffiliateMigrationRequired(reply: any) {
  return reply.code(503).send({
    error: {
      code: "MIGRATION_REQUIRED",
      message: "Sistema de afiliados ainda não foi instalado no banco. Aplique a migração 0034_affiliates.sql e reinicie a API.",
    },
  });
}

const productCreateSchema = z.object({
  name: z.string().trim().min(1).max(160),
  short_description: z.string().trim().max(500).optional().default(""),
  price: z.number().nonnegative(),
  type: z.enum(["ebook", "course", "physical"]),
});

const productUpdateSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  short_description: z.string().trim().max(500).optional(),
  long_description: z.string().trim().max(10_000).optional(),
  price: z.number().nonnegative().optional(),
  status: z.enum(["active", "inactive", "draft"]).optional(),
  image_url: z.string().trim().max(2_000).optional(),
  warranty_days: z.number().int().min(0).max(3650).optional(),
  delivery_type: z.string().trim().max(120).optional(),
}).refine((value) => Object.keys(value).length > 0, {
  message: "Nenhuma alteração informada.",
});

const offerSchema = z.object({
  name: z.string().trim().min(1).max(160),
  price: z.number().nonnegative(),
  slug: z.string().trim().min(1).max(200),
});

const offerUpdateSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  price: z.number().nonnegative().optional(),
  active: z.boolean().optional(),
  slug: z.string().trim().min(1).max(200).optional(),
}).refine((value) => Object.keys(value).length > 0, {
  message: "Nenhuma alteração informada.",
});

const domainSchema = z.object({
  domain: z.string().trim().min(1).max(255),
});

const couponSchema = z.object({
  code: z.string().trim().min(1).max(100),
  type: z.enum(["percent", "fixed"]),
  value: z.number().nonnegative(),
  usage_limit: z.number().int().min(1).max(1_000_000),
  expires_at: z.string().trim().optional().nullable(),
});

const pixelSchema = z.object({
  platform: z.string().trim().min(1).max(100),
  pixel_id: z.string().trim().min(1).max(255),
  access_token: z.string().trim().max(2_000).optional().default(""),
});

const pixelUpdateSchema = z.object({
  platform: z.string().trim().min(1).max(100).optional(),
  pixel_id: z.string().trim().min(1).max(255).optional(),
  active: z.boolean().optional(),
  access_token: z.string().trim().max(2_000).optional(),
}).refine((value) => Object.keys(value).length > 0, {
  message: "Nenhuma alteração informada.",
});

const checkoutConfigSchema = z.object({}).passthrough();
const upsellConfigSchema = z.object({}).passthrough();
const deliveryConfigSchema = z.object({}).passthrough();

const courseCreateSchema = z.object({
  title: z.string().trim().min(1).max(160),
});

const courseModuleCreateSchema = z.object({
  title: z.string().trim().min(1).max(160),
  sort_order: z.number().int().min(0),
});

const courseModuleUpdateSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  sort_order: z.number().int().min(0).optional(),
}).refine((value) => Object.keys(value).length > 0, {
  message: "Nenhuma alteração informada.",
});

const courseLessonCreateSchema = z.object({
  title: z.string().trim().min(1).max(160),
  sort_order: z.number().int().min(0),
});

const courseLessonUpdateSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  video_url: z.string().trim().max(2_000).optional(),
  duration: z.string().trim().max(40).optional(),
  sort_order: z.number().int().min(0).optional(),
  locked: z.boolean().optional(),
}).refine((value) => Object.keys(value).length > 0, {
  message: "Nenhuma alteração informada.",
});

function mapProductRow(row: any) {
  return {
    ...row,
    price: Number(row.price || 0),
    sales: Number(row.sales || 0),
    revenue: Number(row.revenue || 0),
    warranty_days: row.warranty_days == null ? null : Number(row.warranty_days),
  };
}

function mapOfferRow(row: any) {
  return {
    ...row,
    price: Number(row.price || 0),
  };
}

function mapCouponRow(row: any) {
  return {
    ...row,
    value: Number(row.value || 0),
    usage_limit: Number(row.usage_limit || 0),
    used_count: Number(row.used_count || 0),
  };
}

function mapConfigRow(row: any) {
  if (!row) return null;
  return row;
}

function mapUpsellRow(row: any) {
  if (!row) return null;
  return {
    ...row,
    special_price: Number(row.special_price || 0),
    downsell_special_price: Number(row.downsell_special_price || 0),
  };
}

function mapDeliveryRow(row: any) {
  if (!row) return null;
  return {
    ...row,
    processing_days: Number(row.processing_days || 0),
  };
}

function toJsonb(value: unknown) {
  return JSON.stringify(value ?? null);
}

function mapCoursePreview(modules: any[], lessons: any[], course: any) {
  return {
    title: String(course?.title || ""),
    description: String(course?.description || ""),
    modules: (modules || [])
      .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
      .map((module) => ({
        id: module.id,
        title: module.title,
        lessons: (lessons || [])
          .filter((lesson) => lesson.module_id === module.id)
          .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
          .map((lesson) => ({
            id: lesson.id,
            title: lesson.title,
            duration: lesson.duration || "00:00",
            completed: false,
            locked: Boolean(lesson.locked),
            videoUrl: lesson.video_url || "",
          })),
      })),
  };
}

async function ensureSellerAccess(req: any, reply: any) {
  requireAuth(req, reply);
  if (req.auth.role !== "seller") {
    reply.code(403).send({ error: { code: "AUTH_FORBIDDEN", message: "Forbidden" } });
    throw new Error("Forbidden");
  }
}

async function ensureOwnedProduct(db: Db, sellerId: string, productId: string) {
  const res = await db.query<any>(
    `
      select *
      from public.products
      where id = $1 and seller_id = $2
      limit 1
    `,
    [productId, sellerId],
  );
  return res.rows[0] || null;
}

function ownershipFailure(reply: any, kind: "not_found" | "forbidden") {
  if (kind === "not_found") {
    return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Resource not found" } });
  }
  return reply.code(403).send({ error: { code: "AUTH_FORBIDDEN", message: "Forbidden" } });
}

function buildDefaultSlug(name: string) {
  return name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") || `produto-${Date.now()}`;
}

export async function registerSellerProductRoutes(api: FastifyInstance, db: Db) {
  api.get("/seller/products/overview", async (req, reply) => {
    await ensureSellerAccess(req, reply);
    const sellerId = String(req.auth!.user.id || "").trim();

    const res = await db.query<any>(
      `
        with approved_orders as (
          select
            id,
            product_id,
            gross_amount,
            amount
          from public.orders
          where seller_id = $1
            and status = 'approved'
        ),
        item_metrics as (
          select
            oi.product_id,
            count(*)::bigint as sales,
            coalesce(sum(oi.amount), 0)::numeric as revenue
          from public.order_items oi
          inner join approved_orders ao on ao.id = oi.order_id
          group by oi.product_id
        ),
        legacy_metrics as (
          select
            ao.product_id,
            count(*)::bigint as sales,
            coalesce(sum(coalesce(ao.gross_amount, ao.amount)), 0)::numeric as revenue
          from approved_orders ao
          where not exists (
            select 1
            from public.order_items oi
            where oi.order_id = ao.id
          )
          group by ao.product_id
        ),
        combined_metrics as (
          select
            product_id,
            sum(sales)::bigint as sales,
            sum(revenue)::numeric as revenue
          from (
            select product_id, sales, revenue from item_metrics
            union all
            select product_id, sales, revenue from legacy_metrics
          ) metrics
          group by product_id
        )
        select
          p.id,
          p.seller_id,
          p.name,
          p.short_description,
          p.long_description,
          p.price,
          p.type,
          p.status,
          p.image_url,
          coalesce(cm.sales, 0)::text as sales,
          coalesce(cm.revenue, 0)::text as revenue,
          p.warranty_days,
          p.delivery_type,
          p.created_at,
          p.updated_at
        from public.products p
        left join combined_metrics cm on cm.product_id = p.id
        where p.seller_id = $1
        order by p.created_at desc
      `,
      [sellerId],
    );

    return reply.send({
      data: (res.rows || []).map(mapProductRow),
      error: null,
    });
  });

  api.get("/seller/products/by-ids", async (req, reply) => {
    await ensureSellerAccess(req, reply);
    const sellerId = String(req.auth!.user.id || "").trim();
    const query = z.object({ ids: z.string().trim().optional().default("") }).parse(req.query ?? {});
    const ids = Array.from(new Set(query.ids.split(",").map((value) => value.trim()).filter(Boolean)));
    if (ids.length === 0) return reply.send({ data: [] });

    const res = await db.query<any>(
      `
        select *
        from public.products
        where seller_id = $1
          and id = any($2::uuid[])
        order by created_at desc
      `,
      [sellerId, ids],
    );

    return reply.send({ data: (res.rows || []).map(mapProductRow) });
  });

  api.get("/seller/products/:productId", async (req, reply) => {
    await ensureSellerAccess(req, reply);
    const sellerId = String(req.auth!.user.id || "").trim();
    const { productId } = z.object({ productId: z.string().uuid() }).parse(req.params);
    const row = await ensureOwnedProduct(db, sellerId, productId);
    if (!row) {
      return reply.send({ data: null });
    }
    return reply.send({ data: mapProductRow(row) });
  });

  api.post("/seller/products", async (req, reply) => {
    await ensureSellerAccess(req, reply);
    const sellerId = String(req.auth!.user.id || "").trim();
    const body = productCreateSchema.parse(req.body ?? {});

    const created = await withClient(db, async (client) => {
      await client.query("begin");
      try {
        const productRes = await client.query<any>(
          `
            insert into public.products(
              seller_id, name, short_description, price, type, status
            ) values ($1, $2, $3, $4, $5, 'active')
            returning *
          `,
          [sellerId, body.name, body.short_description, body.price, body.type],
        );
        const product = productRes.rows[0];
        await client.query(
          "insert into public.product_checkout_config(product_id) values ($1) on conflict (product_id) do nothing",
          [product.id],
        );
        await client.query(
          `
            insert into public.product_offers(product_id, name, price, slug)
            values ($1, $2, $3, $4)
          `,
          [product.id, "Link principal", product.price, buildDefaultSlug(product.name)],
        );
        await client.query("commit");
        return product;
      } catch (error) {
        await client.query("rollback");
        throw error;
      }
    });

    return reply.code(201).send({ data: mapProductRow(created) });
  });

  api.put("/seller/products/:productId", async (req, reply) => {
    await ensureSellerAccess(req, reply);
    const sellerId = String(req.auth!.user.id || "").trim();
    const { productId } = z.object({ productId: z.string().uuid() }).parse(req.params);
    const body = productUpdateSchema.parse(req.body ?? {});

    const owned = await ensureOwnedProduct(db, sellerId, productId);
    if (!owned) {
      return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Product not found" } });
    }

    const assignments: string[] = [];
    const values: any[] = [productId, sellerId];
    let idx = 3;
    for (const [key, value] of Object.entries(body)) {
      assignments.push(`${key} = $${idx}`);
      values.push(value);
      idx += 1;
    }

    const res = await db.query<any>(
      `
        update public.products
        set ${assignments.join(", ")}, updated_at = now()
        where id = $1 and seller_id = $2
        returning *
      `,
      values,
    );

    return reply.send({ data: mapProductRow(res.rows[0]) });
  });

  api.delete("/seller/products/:productId", async (req, reply) => {
    await ensureSellerAccess(req, reply);
    const sellerId = String(req.auth!.user.id || "").trim();
    const { productId } = z.object({ productId: z.string().uuid() }).parse(req.params);
    const owned = await ensureOwnedProduct(db, sellerId, productId);
    if (!owned) {
      return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Product not found" } });
    }
    await db.query("delete from public.products where id = $1 and seller_id = $2", [productId, sellerId]);
    return reply.send({ data: { ok: true } });
  });

  api.get("/seller/products/:productId/affiliate-program", async (req, reply) => {
    await ensureSellerAccess(req, reply);
    const sellerId = String(req.auth!.user.id || "").trim();
    const { productId } = z.object({ productId: z.string().uuid() }).parse(req.params);
    if (!(await ensureOwnedProduct(db, sellerId, productId))) {
      return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Product not found" } });
    }
    try {
      const res = await db.query<any>(
        "select product_id, enabled, commission_percent, cookie_days, created_at, updated_at from public.affiliate_programs where product_id = $1 limit 1",
        [productId]
      );
      const row = res.rows[0];
      return reply.send({
        data: row
          ? {
              product_id: String(row.product_id || ""),
              enabled: row.enabled === true,
              commission_percent: Number(row.commission_percent || 0),
              cookie_days: Number(row.cookie_days || 0),
              created_at: row.created_at,
              updated_at: row.updated_at,
            }
          : {
              product_id: productId,
              enabled: false,
              commission_percent: 30,
              cookie_days: 30,
              created_at: null,
              updated_at: null,
            },
      });
    } catch (err: any) {
      if (isMissingTableError(err)) return sendAffiliateMigrationRequired(reply);
      throw err;
    }
  });

  api.put("/seller/products/:productId/affiliate-program", async (req, reply) => {
    await ensureSellerAccess(req, reply);
    const sellerId = String(req.auth!.user.id || "").trim();
    const { productId } = z.object({ productId: z.string().uuid() }).parse(req.params);
    if (!(await ensureOwnedProduct(db, sellerId, productId))) {
      return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Product not found" } });
    }

    const body = z.object({
      enabled: z.boolean().optional(),
      commission_percent: z.number().min(0).max(100).optional(),
      cookie_days: z.number().int().min(1).max(365).optional(),
    }).refine((value) => Object.keys(value).length > 0, { message: "Nenhuma alteração informada." }).parse(req.body ?? {});

    try {
      const res = await db.query<any>(
        `
          insert into public.affiliate_programs(product_id, enabled, commission_percent, cookie_days)
          values ($1, coalesce($2, false), coalesce($3, 30), coalesce($4, 30))
          on conflict (product_id) do update set
            enabled = coalesce(excluded.enabled, public.affiliate_programs.enabled),
            commission_percent = coalesce(excluded.commission_percent, public.affiliate_programs.commission_percent),
            cookie_days = coalesce(excluded.cookie_days, public.affiliate_programs.cookie_days),
            updated_at = now()
          returning product_id, enabled, commission_percent, cookie_days, created_at, updated_at
        `,
        [productId, body.enabled ?? null, body.commission_percent ?? null, body.cookie_days ?? null]
      );
      const row = res.rows[0];
      return reply.send({
        data: {
          product_id: String(row.product_id || ""),
          enabled: row.enabled === true,
          commission_percent: Number(row.commission_percent || 0),
          cookie_days: Number(row.cookie_days || 0),
          created_at: row.created_at,
          updated_at: row.updated_at,
        },
      });
    } catch (err: any) {
      if (isMissingTableError(err)) return sendAffiliateMigrationRequired(reply);
      throw err;
    }
  });

  api.get("/seller/products/:productId/offers", async (req, reply) => {
    await ensureSellerAccess(req, reply);
    const sellerId = String(req.auth!.user.id || "").trim();
    const { productId } = z.object({ productId: z.string().uuid() }).parse(req.params);
    if (!(await ensureOwnedProduct(db, sellerId, productId))) {
      return reply.send({ data: [] });
    }
    const res = await db.query<any>(
      `
        select *
        from public.product_offers
        where product_id = $1
        order by created_at desc
      `,
      [productId],
    );
    return reply.send({ data: (res.rows || []).map(mapOfferRow) });
  });

  api.post("/seller/products/:productId/offers", async (req, reply) => {
    await ensureSellerAccess(req, reply);
    const sellerId = String(req.auth!.user.id || "").trim();
    const { productId } = z.object({ productId: z.string().uuid() }).parse(req.params);
    const body = offerSchema.parse(req.body ?? {});
    if (!(await ensureOwnedProduct(db, sellerId, productId))) {
      return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Product not found" } });
    }
    const res = await db.query<any>(
      `
        insert into public.product_offers(product_id, name, price, slug)
        values ($1, $2, $3, $4)
        returning *
      `,
      [productId, body.name, body.price, body.slug],
    );
    return reply.code(201).send({ data: mapOfferRow(res.rows[0]) });
  });

  api.put("/seller/product-offers/:offerId", async (req, reply) => {
    await ensureSellerAccess(req, reply);
    const sellerId = String(req.auth!.user.id || "").trim();
    const { offerId } = z.object({ offerId: z.string().uuid() }).parse(req.params);
    const body = offerUpdateSchema.parse(req.body ?? {});
    const ownership = await assertOwnedBySellerViaProductsJoin(db, {
      table: "product_offers",
      id: offerId,
      sellerId,
      productIdColumn: "product_id",
    });
    if (!ownership.ok) return ownershipFailure(reply, ownership.kind);

    const assignments: string[] = [];
    const values: any[] = [offerId];
    let idx = 2;
    for (const [key, value] of Object.entries(body)) {
      assignments.push(`${key} = $${idx}`);
      values.push(value);
      idx += 1;
    }
    const res = await db.query<any>(
      `
        update public.product_offers
        set ${assignments.join(", ")}
        where id = $1
        returning *
      `,
      values,
    );
    return reply.send({ data: mapOfferRow(res.rows[0]) });
  });

  api.delete("/seller/product-offers/:offerId", async (req, reply) => {
    await ensureSellerAccess(req, reply);
    const sellerId = String(req.auth!.user.id || "").trim();
    const { offerId } = z.object({ offerId: z.string().uuid() }).parse(req.params);
    const ownership = await assertOwnedBySellerViaProductsJoin(db, {
      table: "product_offers",
      id: offerId,
      sellerId,
      productIdColumn: "product_id",
    });
    if (!ownership.ok) return ownershipFailure(reply, ownership.kind);
    await db.query("delete from public.product_offers where id = $1", [offerId]);
    return reply.send({ data: { ok: true } });
  });

  api.get("/seller/products/:productId/checkout-config", async (req, reply) => {
    await ensureSellerAccess(req, reply);
    const sellerId = String(req.auth!.user.id || "").trim();
    const { productId } = z.object({ productId: z.string().uuid() }).parse(req.params);
    if (!(await ensureOwnedProduct(db, sellerId, productId))) return reply.send({ data: null });
    const res = await db.query<any>(
      "select * from public.product_checkout_config where product_id = $1 limit 1",
      [productId],
    );
    return reply.send({ data: mapConfigRow(res.rows[0] || null) });
  });

  api.put("/seller/products/:productId/checkout-config", async (req, reply) => {
    await ensureSellerAccess(req, reply);
    const sellerId = String(req.auth!.user.id || "").trim();
    const { productId } = z.object({ productId: z.string().uuid() }).parse(req.params);
    const body = checkoutConfigSchema.parse(req.body ?? {});
    if (!(await ensureOwnedProduct(db, sellerId, productId))) {
      return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Product not found" } });
    }
    const payload = {
      product_id: productId,
      payment_methods: body.payment_methods ?? { pix: true, credit_card: true, boleto: false },
      required_fields: body.required_fields ?? { name: true, email: true, cpf: true, phone: true },
      countdown_enabled: Boolean(body.countdown_enabled),
      countdown_minutes: Number(body.countdown_minutes ?? 15),
      countdown_phrase: String(body.countdown_phrase ?? "Oferta por tempo limitado!"),
      countdown_expired_phrase: String(body.countdown_expired_phrase ?? "Oferta encerrada."),
      banner_url: String(body.banner_url ?? ""),
      colors: body.colors ?? {},
      buy_button_text: String(body.buy_button_text ?? "Comprar agora"),
      order_bump_items: body.order_bump_items ?? [],
      order_bump_product_id: body.order_bump_product_id ?? null,
      order_bump_discount: Number(body.order_bump_discount ?? 0),
      social_proof_enabled: Boolean(body.social_proof_enabled),
      notification_interval: Number(body.notification_interval ?? 8),
      notification_names: body.notification_names ?? [],
      whatsapp_support: String(body.whatsapp_support ?? ""),
      whatsapp_message: String(body.whatsapp_message ?? ""),
      email_confirmation: Boolean(body.email_confirmation),
      reviews_enabled: Boolean(body.reviews_enabled),
      reviews: body.reviews ?? [],
      thank_you_config: body.thank_you_config ?? { redirect_url: "" },
      thank_you_redirect_delay: Number(body.thank_you_redirect_delay ?? 0),
    };
    const res = await db.query<any>(
      `
        insert into public.product_checkout_config(
          product_id, payment_methods, required_fields, countdown_enabled, countdown_minutes,
          countdown_phrase, countdown_expired_phrase, banner_url, colors, buy_button_text,
          order_bump_items, order_bump_product_id, order_bump_discount, social_proof_enabled,
          notification_interval, notification_names, whatsapp_support, whatsapp_message,
          email_confirmation, reviews_enabled, reviews, thank_you_config, thank_you_redirect_delay
        ) values (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23
        )
        on conflict (product_id) do update set
          payment_methods = excluded.payment_methods,
          required_fields = excluded.required_fields,
          countdown_enabled = excluded.countdown_enabled,
          countdown_minutes = excluded.countdown_minutes,
          countdown_phrase = excluded.countdown_phrase,
          countdown_expired_phrase = excluded.countdown_expired_phrase,
          banner_url = excluded.banner_url,
          colors = excluded.colors,
          buy_button_text = excluded.buy_button_text,
          order_bump_items = excluded.order_bump_items,
          order_bump_product_id = excluded.order_bump_product_id,
          order_bump_discount = excluded.order_bump_discount,
          social_proof_enabled = excluded.social_proof_enabled,
          notification_interval = excluded.notification_interval,
          notification_names = excluded.notification_names,
          whatsapp_support = excluded.whatsapp_support,
          whatsapp_message = excluded.whatsapp_message,
          email_confirmation = excluded.email_confirmation,
          reviews_enabled = excluded.reviews_enabled,
          reviews = excluded.reviews,
          thank_you_config = excluded.thank_you_config,
          thank_you_redirect_delay = excluded.thank_you_redirect_delay,
          updated_at = now()
        returning *
      `,
      [
        payload.product_id,
        toJsonb(payload.payment_methods),
        toJsonb(payload.required_fields),
        payload.countdown_enabled,
        payload.countdown_minutes,
        payload.countdown_phrase,
        payload.countdown_expired_phrase,
        payload.banner_url,
        toJsonb(payload.colors),
        payload.buy_button_text,
        toJsonb(payload.order_bump_items),
        payload.order_bump_product_id,
        payload.order_bump_discount,
        payload.social_proof_enabled,
        payload.notification_interval,
        toJsonb(payload.notification_names),
        payload.whatsapp_support,
        payload.whatsapp_message,
        payload.email_confirmation,
        payload.reviews_enabled,
        toJsonb(payload.reviews),
        toJsonb(payload.thank_you_config),
        payload.thank_you_redirect_delay,
      ],
    );
    return reply.send({ data: mapConfigRow(res.rows[0]) });
  });

  api.get("/seller/products/:productId/domains", async (req, reply) => {
    await ensureSellerAccess(req, reply);
    const sellerId = String(req.auth!.user.id || "").trim();
    const { productId } = z.object({ productId: z.string().uuid() }).parse(req.params);
    if (!(await ensureOwnedProduct(db, sellerId, productId))) return reply.send({ data: [] });
    const res = await db.query<any>(
      "select * from public.product_domains where product_id = $1 order by created_at desc",
      [productId],
    );
    return reply.send({ data: res.rows || [] });
  });

  api.post("/seller/products/:productId/domains", async (req, reply) => {
    await ensureSellerAccess(req, reply);
    const sellerId = String(req.auth!.user.id || "").trim();
    const { productId } = z.object({ productId: z.string().uuid() }).parse(req.params);
    const body = domainSchema.parse(req.body ?? {});
    if (!(await ensureOwnedProduct(db, sellerId, productId))) {
      return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Product not found" } });
    }
    const res = await db.query<any>(
      `
        insert into public.product_domains(product_id, domain)
        values ($1, $2)
        returning *
      `,
      [productId, body.domain],
    );
    return reply.code(201).send({ data: res.rows[0] });
  });

  api.delete("/seller/product-domains/:domainId", async (req, reply) => {
    await ensureSellerAccess(req, reply);
    const sellerId = String(req.auth!.user.id || "").trim();
    const { domainId } = z.object({ domainId: z.string().uuid() }).parse(req.params);
    const ownership = await assertOwnedBySellerViaProductsJoin(db, {
      table: "product_domains",
      id: domainId,
      sellerId,
      productIdColumn: "product_id",
    });
    if (!ownership.ok) return ownershipFailure(reply, ownership.kind);
    await db.query("delete from public.product_domains where id = $1", [domainId]);
    return reply.send({ data: { ok: true } });
  });

  api.get("/seller/products/:productId/coupons", async (req, reply) => {
    await ensureSellerAccess(req, reply);
    const sellerId = String(req.auth!.user.id || "").trim();
    const { productId } = z.object({ productId: z.string().uuid() }).parse(req.params);
    if (!(await ensureOwnedProduct(db, sellerId, productId))) return reply.send({ data: [] });
    const res = await db.query<any>(
      "select * from public.product_coupons where product_id = $1 order by created_at desc",
      [productId],
    );
    return reply.send({ data: (res.rows || []).map(mapCouponRow) });
  });

  api.post("/seller/products/:productId/coupons", async (req, reply) => {
    await ensureSellerAccess(req, reply);
    const sellerId = String(req.auth!.user.id || "").trim();
    const { productId } = z.object({ productId: z.string().uuid() }).parse(req.params);
    const body = couponSchema.parse(req.body ?? {});
    if (!(await ensureOwnedProduct(db, sellerId, productId))) {
      return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Product not found" } });
    }
    const res = await db.query<any>(
      `
        insert into public.product_coupons(product_id, code, type, value, usage_limit, expires_at)
        values ($1, $2, $3, $4, $5, $6)
        returning *
      `,
      [productId, body.code, body.type, body.value, body.usage_limit, body.expires_at || null],
    );
    return reply.code(201).send({ data: mapCouponRow(res.rows[0]) });
  });

  api.delete("/seller/product-coupons/:couponId", async (req, reply) => {
    await ensureSellerAccess(req, reply);
    const sellerId = String(req.auth!.user.id || "").trim();
    const { couponId } = z.object({ couponId: z.string().uuid() }).parse(req.params);
    const ownership = await assertOwnedBySellerViaProductsJoin(db, {
      table: "product_coupons",
      id: couponId,
      sellerId,
      productIdColumn: "product_id",
    });
    if (!ownership.ok) return ownershipFailure(reply, ownership.kind);
    await db.query("delete from public.product_coupons where id = $1", [couponId]);
    return reply.send({ data: { ok: true } });
  });

  api.get("/seller/products/:productId/pixels", async (req, reply) => {
    await ensureSellerAccess(req, reply);
    const sellerId = String(req.auth!.user.id || "").trim();
    const { productId } = z.object({ productId: z.string().uuid() }).parse(req.params);
    if (!(await ensureOwnedProduct(db, sellerId, productId))) return reply.send({ data: [] });
    const res = await db.query<any>(
      "select * from public.product_pixels where product_id = $1 order by created_at desc",
      [productId],
    );
    return reply.send({ data: res.rows || [] });
  });

  api.post("/seller/products/:productId/pixels", async (req, reply) => {
    await ensureSellerAccess(req, reply);
    const sellerId = String(req.auth!.user.id || "").trim();
    const { productId } = z.object({ productId: z.string().uuid() }).parse(req.params);
    const body = pixelSchema.parse(req.body ?? {});
    if (!(await ensureOwnedProduct(db, sellerId, productId))) {
      return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Product not found" } });
    }
    const res = await db.query<any>(
      `
        insert into public.product_pixels(product_id, platform, pixel_id, access_token)
        values ($1, $2, $3, $4)
        returning *
      `,
      [productId, body.platform, body.pixel_id, body.access_token],
    );
    return reply.code(201).send({ data: res.rows[0] });
  });

  api.put("/seller/product-pixels/:pixelId", async (req, reply) => {
    await ensureSellerAccess(req, reply);
    const sellerId = String(req.auth!.user.id || "").trim();
    const { pixelId } = z.object({ pixelId: z.string().uuid() }).parse(req.params);
    const body = pixelUpdateSchema.parse(req.body ?? {});
    const ownership = await assertOwnedBySellerViaProductsJoin(db, {
      table: "product_pixels",
      id: pixelId,
      sellerId,
      productIdColumn: "product_id",
    });
    if (!ownership.ok) return ownershipFailure(reply, ownership.kind);
    const assignments: string[] = [];
    const values: any[] = [pixelId];
    let idx = 2;
    for (const [key, value] of Object.entries(body)) {
      assignments.push(`${key} = $${idx}`);
      values.push(value);
      idx += 1;
    }
    const res = await db.query<any>(
      `
        update public.product_pixels
        set ${assignments.join(", ")}
        where id = $1
        returning *
      `,
      values,
    );
    return reply.send({ data: res.rows[0] });
  });

  api.delete("/seller/product-pixels/:pixelId", async (req, reply) => {
    await ensureSellerAccess(req, reply);
    const sellerId = String(req.auth!.user.id || "").trim();
    const { pixelId } = z.object({ pixelId: z.string().uuid() }).parse(req.params);
    const ownership = await assertOwnedBySellerViaProductsJoin(db, {
      table: "product_pixels",
      id: pixelId,
      sellerId,
      productIdColumn: "product_id",
    });
    if (!ownership.ok) return ownershipFailure(reply, ownership.kind);
    await db.query("delete from public.product_pixels where id = $1", [pixelId]);
    return reply.send({ data: { ok: true } });
  });

  api.get("/seller/products/:productId/upsell-config", async (req, reply) => {
    await ensureSellerAccess(req, reply);
    const sellerId = String(req.auth!.user.id || "").trim();
    const { productId } = z.object({ productId: z.string().uuid() }).parse(req.params);
    if (!(await ensureOwnedProduct(db, sellerId, productId))) return reply.send({ data: null });
    const res = await db.query<any>(
      "select * from public.product_upsell_config where product_id = $1 limit 1",
      [productId],
    );
    return reply.send({ data: mapUpsellRow(res.rows[0] || null) });
  });

  api.put("/seller/products/:productId/upsell-config", async (req, reply) => {
    await ensureSellerAccess(req, reply);
    const sellerId = String(req.auth!.user.id || "").trim();
    const { productId } = z.object({ productId: z.string().uuid() }).parse(req.params);
    const body = upsellConfigSchema.parse(req.body ?? {});
    if (!(await ensureOwnedProduct(db, sellerId, productId))) {
      return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Product not found" } });
    }
    const payload = {
      product_id: productId,
      enabled: Boolean(body.enabled),
      upsell_product_id: body.upsell_product_id ?? null,
      title: String(body.title ?? "Espera! Temos uma oferta exclusiva pra você 🚀"),
      description: String(body.description ?? ""),
      image_url: String(body.image_url ?? ""),
      cta_text: String(body.cta_text ?? "Sim, eu quero!"),
      decline_text: String(body.decline_text ?? "Não, obrigado"),
      special_price: Number(body.special_price ?? 0),
      downsell_enabled: Boolean(body.downsell_enabled),
      downsell_product_id: body.downsell_product_id ?? null,
      downsell_title: String(body.downsell_title ?? ""),
      downsell_cta_text: String(body.downsell_cta_text ?? ""),
      downsell_special_price: Number(body.downsell_special_price ?? 0),
    };
    const res = await db.query<any>(
      `
        insert into public.product_upsell_config(
          product_id, enabled, upsell_product_id, title, description, image_url,
          cta_text, decline_text, special_price, downsell_enabled, downsell_product_id,
          downsell_title, downsell_cta_text, downsell_special_price
        ) values (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14
        )
        on conflict (product_id) do update set
          enabled = excluded.enabled,
          upsell_product_id = excluded.upsell_product_id,
          title = excluded.title,
          description = excluded.description,
          image_url = excluded.image_url,
          cta_text = excluded.cta_text,
          decline_text = excluded.decline_text,
          special_price = excluded.special_price,
          downsell_enabled = excluded.downsell_enabled,
          downsell_product_id = excluded.downsell_product_id,
          downsell_title = excluded.downsell_title,
          downsell_cta_text = excluded.downsell_cta_text,
          downsell_special_price = excluded.downsell_special_price,
          updated_at = now()
        returning *
      `,
      [
        payload.product_id,
        payload.enabled,
        payload.upsell_product_id,
        payload.title,
        payload.description,
        payload.image_url,
        payload.cta_text,
        payload.decline_text,
        payload.special_price,
        payload.downsell_enabled,
        payload.downsell_product_id,
        payload.downsell_title,
        payload.downsell_cta_text,
        payload.downsell_special_price,
      ],
    );
    return reply.send({ data: mapUpsellRow(res.rows[0]) });
  });

  api.get("/seller/products/:productId/delivery-config", async (req, reply) => {
    await ensureSellerAccess(req, reply);
    const sellerId = String(req.auth!.user.id || "").trim();
    const { productId } = z.object({ productId: z.string().uuid() }).parse(req.params);
    if (!(await ensureOwnedProduct(db, sellerId, productId))) return reply.send({ data: null });
    const res = await db.query<any>(
      "select * from public.product_delivery_config where product_id = $1 limit 1",
      [productId],
    );
    return reply.send({ data: mapDeliveryRow(res.rows[0] || null) });
  });

  api.put("/seller/products/:productId/delivery-config", async (req, reply) => {
    await ensureSellerAccess(req, reply);
    const sellerId = String(req.auth!.user.id || "").trim();
    const { productId } = z.object({ productId: z.string().uuid() }).parse(req.params);
    const body = deliveryConfigSchema.parse(req.body ?? {});
    if (!(await ensureOwnedProduct(db, sellerId, productId))) {
      return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Product not found" } });
    }
    const payload = {
      product_id: productId,
      delivery_method: String(body.delivery_method ?? "email"),
      email_subject: String(body.email_subject ?? "Seu produto está pronto! 📚"),
      email_body: String(body.email_body ?? ""),
      download_url: String(body.download_url ?? ""),
      file_url: String(body.file_url ?? ""),
      auto_send: Boolean(body.auto_send),
      shipping_method: String(body.shipping_method ?? "correios"),
      processing_days: Number(body.processing_days ?? 3),
      tracking_enabled: Boolean(body.tracking_enabled),
      weight: String(body.weight ?? ""),
      dimensions: String(body.dimensions ?? ""),
      instructions: String(body.instructions ?? ""),
    };
    const res = await db.query<any>(
      `
        insert into public.product_delivery_config(
          product_id, delivery_method, email_subject, email_body, download_url, file_url,
          auto_send, shipping_method, processing_days, tracking_enabled, weight, dimensions, instructions
        ) values (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13
        )
        on conflict (product_id) do update set
          delivery_method = excluded.delivery_method,
          email_subject = excluded.email_subject,
          email_body = excluded.email_body,
          download_url = excluded.download_url,
          file_url = excluded.file_url,
          auto_send = excluded.auto_send,
          shipping_method = excluded.shipping_method,
          processing_days = excluded.processing_days,
          tracking_enabled = excluded.tracking_enabled,
          weight = excluded.weight,
          dimensions = excluded.dimensions,
          instructions = excluded.instructions,
          updated_at = now()
        returning *
      `,
      [
        payload.product_id,
        payload.delivery_method,
        payload.email_subject,
        payload.email_body,
        payload.download_url,
        payload.file_url,
        payload.auto_send,
        payload.shipping_method,
        payload.processing_days,
        payload.tracking_enabled,
        payload.weight,
        payload.dimensions,
        payload.instructions,
      ],
    );
    return reply.send({ data: mapDeliveryRow(res.rows[0]) });
  });

  api.get("/seller/products/:productId/course", async (req, reply) => {
    await ensureSellerAccess(req, reply);
    const sellerId = String(req.auth!.user.id || "").trim();
    const { productId } = z.object({ productId: z.string().uuid() }).parse(req.params);
    if (!(await ensureOwnedProduct(db, sellerId, productId))) return reply.send({ data: null });
    const res = await db.query<any>(
      "select * from public.courses where product_id = $1 order by created_at asc limit 1",
      [productId],
    );
    return reply.send({ data: res.rows[0] || null });
  });

  api.post("/seller/products/:productId/course", async (req, reply) => {
    await ensureSellerAccess(req, reply);
    const sellerId = String(req.auth!.user.id || "").trim();
    const { productId } = z.object({ productId: z.string().uuid() }).parse(req.params);
    const body = courseCreateSchema.parse(req.body ?? {});
    const product = await ensureOwnedProduct(db, sellerId, productId);
    if (!product) {
      return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Product not found" } });
    }
    const existing = await db.query<any>(
      "select * from public.courses where product_id = $1 order by created_at asc limit 1",
      [productId],
    );
    if (existing.rows[0]) return reply.send({ data: existing.rows[0] });
    const res = await db.query<any>(
      "insert into public.courses(product_id, title) values ($1, $2) returning *",
      [productId, body.title],
    );
    return reply.code(201).send({ data: res.rows[0] });
  });

  api.get("/seller/products/:productId/course/preview-token", async (req, reply) => {
    await ensureSellerAccess(req, reply);
    const sellerId = String(req.auth!.user.id || "").trim();
    const { productId } = z.object({ productId: z.string().uuid() }).parse(req.params);
    if (!(await ensureOwnedProduct(db, sellerId, productId))) return reply.send({ data: null });
    const res = await db.query<any>(
      "select preview_token from public.courses where product_id = $1 order by created_at asc limit 1",
      [productId],
    );
    return reply.send({ data: res.rows[0]?.preview_token || null });
  });

  api.get("/seller/products/:productId/course/preview", async (req, reply) => {
    await ensureSellerAccess(req, reply);
    const sellerId = String(req.auth!.user.id || "").trim();
    const { productId } = z.object({ productId: z.string().uuid() }).parse(req.params);
    if (!(await ensureOwnedProduct(db, sellerId, productId))) return reply.send({ data: null });

    const courseRes = await db.query<any>(
      "select id, title, description from public.courses where product_id = $1 order by created_at asc limit 1",
      [productId],
    );
    const course = courseRes.rows[0];
    if (!course) return reply.send({ data: null });

    const modulesRes = await db.query<any>(
      "select id, title, sort_order from public.course_modules where course_id = $1 order by sort_order asc",
      [course.id],
    );
    const lessonsRes = await db.query<any>(
      `
        select id, module_id, title, duration, video_url, locked, sort_order
        from public.course_lessons
        where module_id = any(
          select id from public.course_modules where course_id = $1
        )
        order by sort_order asc
      `,
      [course.id],
    );

    return reply.send({
      data: mapCoursePreview(modulesRes.rows || [], lessonsRes.rows || [], course),
    });
  });

  api.get("/seller/courses/:courseId/modules", async (req, reply) => {
    await ensureSellerAccess(req, reply);
    const sellerId = String(req.auth!.user.id || "").trim();
    const { courseId } = z.object({ courseId: z.string().uuid() }).parse(req.params);
    if (!(await assertOwnedBySellerViaCourseId(db, { courseId, sellerId }))) {
      return reply.send({ data: [] });
    }
    const res = await db.query<any>(
      "select * from public.course_modules where course_id = $1 order by sort_order asc",
      [courseId],
    );
    return reply.send({ data: res.rows || [] });
  });

  api.post("/seller/courses/:courseId/modules", async (req, reply) => {
    await ensureSellerAccess(req, reply);
    const sellerId = String(req.auth!.user.id || "").trim();
    const { courseId } = z.object({ courseId: z.string().uuid() }).parse(req.params);
    const body = courseModuleCreateSchema.parse(req.body ?? {});
    if (!(await assertOwnedBySellerViaCourseId(db, { courseId, sellerId }))) {
      return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Course not found" } });
    }
    const res = await db.query<any>(
      "insert into public.course_modules(course_id, title, sort_order) values ($1, $2, $3) returning *",
      [courseId, body.title, body.sort_order],
    );
    return reply.code(201).send({ data: res.rows[0] });
  });

  api.put("/seller/course-modules/:moduleId", async (req, reply) => {
    await ensureSellerAccess(req, reply);
    const sellerId = String(req.auth!.user.id || "").trim();
    const { moduleId } = z.object({ moduleId: z.string().uuid() }).parse(req.params);
    const body = courseModuleUpdateSchema.parse(req.body ?? {});
    const ownership = await assertOwnedCourseModule(db, { moduleId, sellerId });
    if (!ownership.ok) return ownershipFailure(reply, ownership.kind);
    const assignments: string[] = [];
    const values: any[] = [moduleId];
    let idx = 2;
    for (const [key, value] of Object.entries(body)) {
      assignments.push(`${key} = $${idx}`);
      values.push(value);
      idx += 1;
    }
    const res = await db.query<any>(
      `
        update public.course_modules
        set ${assignments.join(", ")}
        where id = $1
        returning *
      `,
      values,
    );
    return reply.send({ data: res.rows[0] });
  });

  api.delete("/seller/course-modules/:moduleId", async (req, reply) => {
    await ensureSellerAccess(req, reply);
    const sellerId = String(req.auth!.user.id || "").trim();
    const { moduleId } = z.object({ moduleId: z.string().uuid() }).parse(req.params);
    const ownership = await assertOwnedCourseModule(db, { moduleId, sellerId });
    if (!ownership.ok) return ownershipFailure(reply, ownership.kind);
    await db.query("delete from public.course_modules where id = $1", [moduleId]);
    return reply.send({ data: { ok: true } });
  });

  api.get("/seller/course-modules/:moduleId/lessons", async (req, reply) => {
    await ensureSellerAccess(req, reply);
    const sellerId = String(req.auth!.user.id || "").trim();
    const { moduleId } = z.object({ moduleId: z.string().uuid() }).parse(req.params);
    if (!(await assertOwnedBySellerViaModuleId(db, { moduleId, sellerId }))) {
      return reply.send({ data: [] });
    }
    const res = await db.query<any>(
      "select * from public.course_lessons where module_id = $1 order by sort_order asc",
      [moduleId],
    );
    return reply.send({ data: res.rows || [] });
  });

  api.post("/seller/course-modules/:moduleId/lessons", async (req, reply) => {
    await ensureSellerAccess(req, reply);
    const sellerId = String(req.auth!.user.id || "").trim();
    const { moduleId } = z.object({ moduleId: z.string().uuid() }).parse(req.params);
    const body = courseLessonCreateSchema.parse(req.body ?? {});
    if (!(await assertOwnedBySellerViaModuleId(db, { moduleId, sellerId }))) {
      return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Module not found" } });
    }
    const res = await db.query<any>(
      "insert into public.course_lessons(module_id, title, sort_order) values ($1, $2, $3) returning *",
      [moduleId, body.title, body.sort_order],
    );
    return reply.code(201).send({ data: res.rows[0] });
  });

  api.put("/seller/course-lessons/:lessonId", async (req, reply) => {
    await ensureSellerAccess(req, reply);
    const sellerId = String(req.auth!.user.id || "").trim();
    const { lessonId } = z.object({ lessonId: z.string().uuid() }).parse(req.params);
    const body = courseLessonUpdateSchema.parse(req.body ?? {});
    const ownership = await assertOwnedCourseLesson(db, { lessonId, sellerId });
    if (!ownership.ok) return ownershipFailure(reply, ownership.kind);
    const assignments: string[] = [];
    const values: any[] = [lessonId];
    let idx = 2;
    for (const [key, value] of Object.entries(body)) {
      assignments.push(`${key} = $${idx}`);
      values.push(value);
      idx += 1;
    }
    const res = await db.query<any>(
      `
        update public.course_lessons
        set ${assignments.join(", ")}
        where id = $1
        returning *
      `,
      values,
    );
    return reply.send({ data: res.rows[0] });
  });

  api.delete("/seller/course-lessons/:lessonId", async (req, reply) => {
    await ensureSellerAccess(req, reply);
    const sellerId = String(req.auth!.user.id || "").trim();
    const { lessonId } = z.object({ lessonId: z.string().uuid() }).parse(req.params);
    const ownership = await assertOwnedCourseLesson(db, { lessonId, sellerId });
    if (!ownership.ok) return ownershipFailure(reply, ownership.kind);
    await db.query("delete from public.course_lessons where id = $1", [lessonId]);
    return reply.send({ data: { ok: true } });
  });
}
