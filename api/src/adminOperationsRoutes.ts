import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "./db.js";
import type { Env } from "./env.js";
import { requireAdmin } from "./auth.js";
import { encryptSmtpPassword } from "./smtpCrypto.js";
import { queueRewardSentEmail } from "./emailEventTriggers.js";

const userUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  phone: z.string().trim().max(40).optional(),
  role: z.enum(["admin", "seller", "buyer"]).optional(),
});

const smtpConfigSchema = z.object({
  host: z.string().trim().max(255),
  port: z.union([z.string(), z.number()]),
  username: z.string().trim().max(255).optional().default(""),
  password: z.string().optional().default(""),
  encryption: z.string().trim().optional().default("tls"),
  fromName: z.string().trim().max(255).optional().default(""),
  fromEmail: z.string().trim().email(),
  enabled: z.boolean(),
});

const rewardSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional().default(""),
  imageUrl: z.string().trim().optional().nullable(),
  minRevenue: z.number().nonnegative(),
  maxRevenue: z.number().nonnegative(),
  type: z.enum(["congratulation", "delivery"]),
  deliveryInstructions: z.string().trim().optional().nullable(),
  status: z.enum(["active", "inactive"]),
});

const platformUpdateSchema = z.object({
  version: z.string().trim().min(1).max(40),
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(1000),
  type: z.enum(["feature", "improvement", "security", "fix"]),
  date: z.string().trim().min(1).max(40),
  changes: z.array(z.string().trim().min(1).max(500)).default([]),
});

async function ensureAdmin(db: Db, req: any, reply: any) {
  await requireAdmin(db, req, reply);
}

function isMissingAffiliateMigration(err: any) {
  const code = String(err?.code || "");
  if (code === "42P01") return true;
  if (code === "42704") return true;
  if (code === "42703") return true;
  const msg = String(err?.message || "").toLowerCase();
  return (
    msg.includes("does not exist") ||
    msg.includes("undefined_table") ||
    msg.includes("relation") ||
    msg.includes("undefined object") ||
    msg.includes("undefined column")
  );
}

function sendAffiliateMigrationRequired(reply: any) {
  return reply.code(503).send({
    error: {
      code: "MIGRATION_REQUIRED",
      message: "Sistema de afiliados ainda não foi instalado no banco. Aplique a migração 0034_affiliates.sql e reinicie a API.",
    },
  });
}

function toSmtpConfigRowPayload(env: Env, values: z.infer<typeof smtpConfigSchema>, existing?: any) {
  const username = String(values.username || "").trim();
  const password = String(values.password || "").trim();
  const payload: Record<string, any> = {
    host: values.host,
    port: String(values.port),
    username,
    encryption: values.encryption || "tls",
    from_name: String(values.fromName || "").trim(),
    from_email: values.fromEmail,
    enabled: values.enabled,
  };

  if (password) {
    const enc = encryptSmtpPassword(env, password);
    payload.password = "";
    payload.password_ciphertext = enc.ciphertext;
    payload.password_iv = enc.iv;
    payload.password_tag = enc.tag;
  } else if (existing) {
    payload.password = existing.password || "";
    payload.password_ciphertext = existing.password_ciphertext || null;
    payload.password_iv = existing.password_iv || null;
    payload.password_tag = existing.password_tag || null;
  } else {
    payload.password = "";
    payload.password_ciphertext = null;
    payload.password_iv = null;
    payload.password_tag = null;
  }

  return payload;
}

export async function registerAdminOperationsRoutes(api: FastifyInstance, db: Db, env: Env) {
  api.get("/admin/users", async (req, reply) => {
    await ensureAdmin(db, req, reply);

    const res = await db.query<{
      user_id: string;
      email: string;
      name: string | null;
      phone: string | null;
      role: "admin" | "seller" | "buyer" | null;
      created_at: string;
      disabled: boolean;
    }>(`
      select
        u.id as user_id,
        u.email,
        p.name,
        p.phone,
        ur.role,
        u.created_at,
        u.disabled
      from public.users u
      left join public.profiles p on p.user_id = u.id
      left join lateral (
        select role
        from public.user_roles
        where user_id = u.id
        order by
          case role
            when 'admin' then 1
            when 'seller' then 2
            when 'buyer' then 3
            else 4
          end asc
        limit 1
      ) ur on true
      order by u.created_at desc
    `);

    return reply.send({
      data: res.rows.map((row: any) => ({
        id: row.user_id,
        name: row.name || row.email || "Usuário",
        email: row.email,
        phone: row.phone || "",
        role: row.role || "buyer",
        createdAt: row.created_at,
        status: row.disabled ? "disabled" : "active",
      })),
    });
  });

  api.get("/admin/users/:userId/products", async (req, reply) => {
    await ensureAdmin(db, req, reply);
    const { userId } = z.object({ userId: z.string().uuid() }).parse(req.params);

    const res = await db.query<{
      id: string;
      name: string;
      price: string | number | null;
      status: string;
    }>(
      `select id, name, price, status
       from public.products
       where seller_id = $1
       order by created_at desc`,
      [userId]
    );

    return reply.send({
      data: res.rows.map((row: any) => ({
        id: row.id,
        name: row.name,
        price: Number(row.price || 0),
        status: row.status,
      })),
    });
  });

  api.put("/admin/users/:userId", async (req, reply) => {
    await ensureAdmin(db, req, reply);
    const { userId } = z.object({ userId: z.string().uuid() }).parse(req.params);
    const body = userUpdateSchema.parse(req.body ?? {});

    if (body.name !== undefined || body.phone !== undefined) {
      await db.query(
        `
          insert into public.profiles(user_id, name, phone)
          values ($1, $2, $3)
          on conflict (user_id) do update set
            name = excluded.name,
            phone = excluded.phone,
            updated_at = now()
        `,
        [userId, body.name ?? "", body.phone ?? ""]
      );
    }

    if (body.role) {
      await db.query("delete from public.user_roles where user_id = $1", [userId]);
      await db.query("insert into public.user_roles(user_id, role) values ($1, $2)", [userId, body.role]);
    }

    return reply.send({ data: { ok: true } });
  });

  api.delete("/admin/users/:userId", async (req, reply) => {
    await ensureAdmin(db, req, reply);
    const { userId } = z.object({ userId: z.string().uuid() }).parse(req.params);
    await db.query("select public.admin_delete_user_cascade($1)", [userId]);
    return reply.send({ data: { ok: true } });
  });

  api.get("/admin/products", async (req, reply) => {
    await ensureAdmin(db, req, reply);

    const res = await db.query<{
      id: string;
      name: string;
      price: string | number | null;
      status: "active" | "inactive" | "draft";
      image_url: string | null;
      short_description: string | null;
      seller_id: string;
      seller_name: string | null;
    }>(`
      select
        p.id,
        p.name,
        p.price,
        p.status,
        p.image_url,
        p.short_description,
        p.seller_id,
        pr.name as seller_name
      from public.products p
      left join public.profiles pr on pr.user_id = p.seller_id
      order by p.created_at desc
    `);

    return reply.send({
      data: res.rows.map((row: any) => ({
        id: row.id,
        name: row.name,
        price: Number(row.price || 0),
        status: row.status,
        imageUrl: row.image_url || "",
        shortDescription: row.short_description || "",
        sellerId: row.seller_id,
        sellerName: row.seller_name || "Desconhecido",
      })),
    });
  });

  api.get("/admin/products/:productId/affiliate-program", async (req, reply) => {
    await ensureAdmin(db, req, reply);
    const { productId } = z.object({ productId: z.string().uuid() }).parse(req.params);

    const exists = await db.query("select id from public.products where id = $1 limit 1", [productId]);
    if (!exists.rows[0]) {
      return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Produto não encontrado." } });
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
        error: null,
      });
    } catch (err: any) {
      if (isMissingAffiliateMigration(err)) return sendAffiliateMigrationRequired(reply);
      throw err;
    }
  });

  api.put("/admin/products/:productId/affiliate-program", async (req, reply) => {
    await ensureAdmin(db, req, reply);
    const { productId } = z.object({ productId: z.string().uuid() }).parse(req.params);

    const exists = await db.query("select id from public.products where id = $1 limit 1", [productId]);
    if (!exists.rows[0]) {
      return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Produto não encontrado." } });
    }

    const body = z
      .object({
        enabled: z.boolean().optional(),
        commission_percent: z.number().min(0).max(100).optional(),
        cookie_days: z.number().int().min(1).max(365).optional(),
      })
      .refine((value) => Object.keys(value).length > 0, { message: "Nenhuma alteração informada." })
      .parse(req.body ?? {});

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
        error: null,
      });
    } catch (err: any) {
      if (isMissingAffiliateMigration(err)) return sendAffiliateMigrationRequired(reply);
      throw err;
    }
  });

  api.get("/admin/products/:productId/sales", async (req, reply) => {
    await ensureAdmin(db, req, reply);
    const { productId } = z.object({ productId: z.string().uuid() }).parse(req.params);

    const res = await db.query<{
      id: string;
      buyer_name: string | null;
      amount: string | number | null;
      created_at: string;
      status: string;
    }>(
      `
        with approved_items as (
          select
            oi.order_id,
            oi.amount
          from public.order_items oi
          where oi.product_id = $1
        )
        select
          o.id,
          o.buyer_name,
          coalesce(ai.amount, o.amount) as amount,
          o.created_at,
          o.status
        from public.orders o
        left join approved_items ai on ai.order_id = o.id
        where (o.product_id = $1 or ai.order_id is not null)
        order by o.created_at desc
        limit 10
      `,
      [productId]
    );

    return reply.send({
      data: res.rows.map((row: any) => ({
        id: row.id,
        buyer: row.buyer_name || "Comprador",
        amount: Number(row.amount || 0),
        date: row.created_at,
        status: row.status,
      })),
    });
  });

  api.get("/admin/smtp/config", async (req, reply) => {
    await ensureAdmin(db, req, reply);
    const res = await db.query<any>("select * from public.smtp_config order by created_at asc limit 1");
    const row = res.rows[0];
    return reply.send({
      data: row
        ? {
            host: row.host || "",
            port: String(row.port || "587"),
            username: row.username || "",
            password: "",
            encryption: row.encryption || "tls",
            fromName: row.from_name || "",
            fromEmail: row.from_email || "",
            enabled: Boolean(row.enabled),
          }
        : {
            host: "",
            port: "587",
            username: "",
            password: "",
            encryption: "tls",
            fromName: "",
            fromEmail: "",
            enabled: false,
          },
    });
  });

  api.put("/admin/smtp/config", async (req, reply) => {
    await ensureAdmin(db, req, reply);
    const body = smtpConfigSchema.parse(req.body ?? {});
    const existingRes = await db.query<any>("select * from public.smtp_config order by created_at asc limit 1");
    const existing = existingRes.rows[0];
    const payload = toSmtpConfigRowPayload(env, body, existing);

    if (existing?.id) {
      await db.query(
        `
          update public.smtp_config
          set host = $2,
              port = $3,
              username = $4,
              password = $5,
              password_ciphertext = $6,
              password_iv = $7,
              password_tag = $8,
              encryption = $9,
              from_name = $10,
              from_email = $11,
              enabled = $12,
              updated_at = now()
          where id = $1
        `,
        [
          existing.id,
          payload.host,
          payload.port,
          payload.username,
          payload.password,
          payload.password_ciphertext,
          payload.password_iv,
          payload.password_tag,
          payload.encryption,
          payload.from_name,
          payload.from_email,
          payload.enabled,
        ]
      );
    } else {
      await db.query(
        `
          insert into public.smtp_config(
            host, port, username, password, password_ciphertext, password_iv, password_tag,
            encryption, from_name, from_email, enabled
          ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        `,
        [
          payload.host,
          payload.port,
          payload.username,
          payload.password,
          payload.password_ciphertext,
          payload.password_iv,
          payload.password_tag,
          payload.encryption,
          payload.from_name,
          payload.from_email,
          payload.enabled,
        ]
      );
    }

    return reply.send({ data: { ok: true } });
  });

  api.get("/admin/smtp/status", async (req, reply) => {
    await ensureAdmin(db, req, reply);
    const res = await db.query<any>(
      "select emails_sent_today, delivery_rate, bounces, last_test from public.smtp_config order by created_at asc limit 1"
    );
    const row = res.rows[0];
    return reply.send({
      data: {
        emailsSentToday: String(row?.emails_sent_today ?? 0),
        deliveryRate: row?.delivery_rate ?? "-",
        bounces: String(row?.bounces ?? 0),
        lastTest: row?.last_test ?? "-",
      },
    });
  });

  api.get("/admin/smtp/dns", async (req, reply) => {
    await ensureAdmin(db, req, reply);
    const res = await db.query<any>("select type, value, status from public.smtp_dns_records order by created_at asc");
    return reply.send({
      data: res.rows.map((row: any) => ({
        type: row.type,
        value: row.value,
        status: row.status,
      })),
    });
  });

  api.get("/admin/rewards", async (req, reply) => {
    await ensureAdmin(db, req, reply);
    const res = await db.query<any>("select * from public.rewards order by min_revenue asc");
    return reply.send({
      data: res.rows.map((row: any) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        imageUrl: row.image_url,
        minRevenue: Number(row.min_revenue || 0),
        maxRevenue: Number(row.max_revenue || 0),
        type: row.type,
        deliveryInstructions: row.delivery_instructions ?? undefined,
        status: row.status,
      })),
    });
  });

  api.post("/admin/rewards", async (req, reply) => {
    await ensureAdmin(db, req, reply);
    const body = rewardSchema.parse(req.body ?? {});
    await db.query(
      `
        insert into public.rewards(
          name, description, image_url, min_revenue, max_revenue,
          type, delivery_instructions, status
        ) values ($1,$2,$3,$4,$5,$6,$7,$8)
      `,
      [
        body.name,
        body.description,
        body.imageUrl || "/placeholder.svg",
        body.minRevenue,
        body.maxRevenue,
        body.type,
        body.deliveryInstructions || null,
        body.status,
      ]
    );
    return reply.send({ data: { ok: true } });
  });

  api.put("/admin/rewards/:id", async (req, reply) => {
    await ensureAdmin(db, req, reply);
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = rewardSchema.partial().parse(req.body ?? {});
    const currentRes = await db.query<any>("select * from public.rewards where id = $1 limit 1", [id]);
    const current = currentRes.rows[0];
    if (!current) {
      return reply.code(404).send({ error: { code: "REWARD_NOT_FOUND", message: "Not found" } });
    }

    await db.query(
      `
        update public.rewards
        set name = $2,
            description = $3,
            image_url = $4,
            min_revenue = $5,
            max_revenue = $6,
            type = $7,
            delivery_instructions = $8,
            status = $9,
            updated_at = now()
        where id = $1
      `,
      [
        id,
        body.name ?? current.name,
        body.description ?? current.description,
        body.imageUrl ?? current.image_url ?? null,
        body.minRevenue ?? Number(current.min_revenue || 0),
        body.maxRevenue ?? Number(current.max_revenue || 0),
        body.type ?? current.type,
        body.deliveryInstructions ?? current.delivery_instructions ?? null,
        body.status ?? current.status,
      ]
    );
    return reply.send({ data: { ok: true } });
  });

  api.delete("/admin/rewards/:id", async (req, reply) => {
    await ensureAdmin(db, req, reply);
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    await db.query("delete from public.rewards where id = $1", [id]);
    return reply.send({ data: { ok: true } });
  });

  api.get("/admin/reward-claims", async (req, reply) => {
    await ensureAdmin(db, req, reply);
    const res = await db.query<any>(`
      select
        rc.id,
        rc.reward_id,
        rc.seller_id,
        rc.revenue_achieved,
        rc.claimed_at,
        rc.sent_at,
        rc.status,
        r.name as reward_name,
        r.image_url as reward_image_url,
        p.name as seller_name,
        u.email as seller_email
      from public.reward_claims rc
      left join public.rewards r on r.id = rc.reward_id
      left join public.profiles p on p.user_id = rc.seller_id
      left join public.users u on u.id = rc.seller_id
      order by rc.claimed_at desc
    `);

    return reply.send({
      data: res.rows.map((row: any) => ({
        id: row.id,
        rewardId: row.reward_id,
        rewardName: row.reward_name || "",
        rewardImageUrl: row.reward_image_url || "/placeholder.svg",
        sellerName: row.seller_name || "Vendedor",
        sellerEmail: row.seller_email || "",
        revenueAchieved: Number(row.revenue_achieved || 0),
        claimedAt: row.claimed_at,
        sentAt: row.sent_at,
        status: row.status,
      })),
    });
  });

  api.post("/admin/reward-claims/:id/mark-sent", async (req, reply) => {
    await ensureAdmin(db, req, reply);
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const res = await db.query<any>(
      `
        update public.reward_claims
        set status = 'sent', sent_at = now()
        where id = $1
          and status = 'pending'
        returning *
      `,
      [id]
    );
    const claim = res.rows[0];
    if (!claim) {
      return reply.code(404).send({ error: "Recompensa pendente nao encontrada." });
    }

    await queueRewardSentEmail(db, { claimId: id }).catch(() => {});

    return reply.send({ data: { ok: true } });
  });

  api.get("/admin/platform-updates", async (req, reply) => {
    await ensureAdmin(db, req, reply);
    const res = await db.query<any>("select * from public.platform_updates order by date desc");
    return reply.send({
      data: res.rows.map((row: any) => ({
        id: row.id,
        version: row.version,
        title: row.title,
        description: row.description,
        type: row.type,
        date: row.date,
        changes: Array.isArray(row.changes) ? row.changes : [],
      })),
    });
  });

  api.post("/admin/platform-updates", async (req, reply) => {
    await ensureAdmin(db, req, reply);
    const body = platformUpdateSchema.parse(req.body ?? {});
    await db.query(
      `
        insert into public.platform_updates(version, title, description, type, date, changes)
        values ($1,$2,$3,$4,$5,$6::jsonb)
      `,
      [body.version, body.title, body.description, body.type, body.date, JSON.stringify(body.changes)]
    );
    return reply.send({ data: { ok: true } });
  });

  api.delete("/admin/platform-updates/:id", async (req, reply) => {
    await ensureAdmin(db, req, reply);
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    await db.query("delete from public.platform_updates where id = $1", [id]);
    return reply.send({ data: { ok: true } });
  });

  api.get("/admin/email/outbox", async (req, reply) => {
    await ensureAdmin(db, req, reply);
    const { limit } = z.object({ limit: z.coerce.number().int().positive().max(500).default(50) }).parse(req.query ?? {});
    const res = await db.query<any>(
      `
        select
          id, campaign_id, template_event_key, to_email, subject, status, attempts, max_attempts,
          last_error, created_at, sent_at, open_count, open_human_count, click_count, click_human_count
        from public.email_outbox
        order by created_at desc
        limit $1
      `,
      [limit]
    );
    return reply.send({
      data: res.rows.map((row: any) => ({
        id: row.id,
        campaignId: row.campaign_id ?? null,
        templateEventKey: row.template_event_key ?? "",
        toEmail: row.to_email ?? "",
        subject: row.subject ?? "",
        status: row.status,
        attempts: Number(row.attempts || 0),
        maxAttempts: Number(row.max_attempts || 5),
        lastError: row.last_error ?? "",
        createdAt: row.created_at,
        sentAt: row.sent_at ?? null,
        openCount: Number(row.open_count || 0),
        openHumanCount: Number(row.open_human_count || 0),
        clickCount: Number(row.click_count || 0),
        clickHumanCount: Number(row.click_human_count || 0),
      })),
    });
  });

  api.get("/admin/email/outbox/:id/logs", async (req, reply) => {
    await ensureAdmin(db, req, reply);
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const query = z.object({ limit: z.coerce.number().int().positive().max(500).default(50) }).parse(req.query ?? {});
    const res = await db.query<any>(
      `
        select id, outbox_id, level, message, meta, created_at
        from public.email_logs
        where outbox_id = $1
        order by created_at desc
        limit $2
      `,
      [params.id, query.limit]
    );
    return reply.send({
      data: res.rows.map((row: any) => ({
        id: row.id,
        outboxId: row.outbox_id,
        level: row.level,
        message: row.message,
        meta: row.meta || {},
        createdAt: row.created_at,
      })),
    });
  });

  api.post("/admin/email/outbox/:id/requeue", async (req, reply) => {
    await ensureAdmin(db, req, reply);
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    await db.query(
      `
        update public.email_outbox
        set status = 'queued',
            attempts = 0,
            next_retry_at = null,
            locked_at = null,
            last_error = ''
        where id = $1
      `,
      [id]
    );
    return reply.send({ data: { ok: true } });
  });

  api.post("/admin/email/outbox/:id/cancel", async (req, reply) => {
    await ensureAdmin(db, req, reply);
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    await db.query(
      `
        update public.email_outbox
        set status = 'canceled',
            canceled_at = now(),
            locked_at = null
        where id = $1
      `,
      [id]
    );
    return reply.send({ data: { ok: true } });
  });
}
