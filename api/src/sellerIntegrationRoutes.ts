import crypto from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { Db } from "./db.js";
import { requireAuth } from "./auth.js";
import { assertSafeOutboundWebhookUrl } from "./ssrfGuard.js";

const webhookCreateSchema = z.object({
  name: z.string().trim().min(1).max(160),
  url: z.string().trim().url().max(2_000),
  active: z.boolean().optional().default(true),
  events: z.array(z.string().trim().min(1).max(120)).min(1),
});

const webhookUpdateSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  url: z.string().trim().url().max(2_000).optional(),
  active: z.boolean().optional(),
  events: z.array(z.string().trim().min(1).max(120)).min(1).optional(),
}).refine((value) => Object.keys(value).length > 0, {
  message: "Nenhuma alteração informada.",
});

const whatsappCreateSchema = z.object({
  name: z.string().trim().min(1).max(160),
  phone: z.string().trim().max(60).optional().default(""),
  status: z.enum(["connected", "disconnected", "qr_pending"]).optional().default("qr_pending"),
  events: z.array(z.string().trim().min(1).max(120)).optional().default([]),
});

const zapierCreateSchema = z.object({
  name: z.string().trim().min(1).max(160),
  webhook_url: z.string().trim().url().max(2_000),
  active: z.boolean().optional().default(true),
  events: z.array(z.string().trim().min(1).max(120)).min(1),
});

const zapierUpdateSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  webhook_url: z.string().trim().url().max(2_000).optional(),
  active: z.boolean().optional(),
  events: z.array(z.string().trim().min(1).max(120)).min(1).optional(),
}).refine((value) => Object.keys(value).length > 0, {
  message: "Nenhuma alteração informada.",
});

function toJsonb(value: unknown) {
  return JSON.stringify(value ?? null);
}

function hmacSha256Hex(secret: string, body: string): string {
  return crypto.createHmac("sha256", String(secret || "")).update(body).digest("hex");
}

function mapWebhookEndpoint(row: any) {
  return {
    ...row,
    events: Array.isArray(row?.events) ? row.events : [],
    success_rate: Number(row?.success_rate || 0),
  };
}

function mapWhatsAppInstance(row: any) {
  return {
    ...row,
    events: Array.isArray(row?.events) ? row.events : [],
    messages_sent_24h: Number(row?.messages_sent_24h || 0),
    delivery_rate: Number(row?.delivery_rate || 0),
  };
}

function mapZapierIntegration(row: any) {
  return {
    ...row,
    events: Array.isArray(row?.events) ? row.events : [],
  };
}

async function ensureSellerAccess(req: any, reply: any) {
  requireAuth(req, reply);
  if (req.auth.role !== "seller") {
    reply.code(403).send({ error: { code: "AUTH_FORBIDDEN", message: "Forbidden" } });
    throw new Error("Forbidden");
  }
}

async function loadOwnedWebhook(db: Db, sellerId: string, id: string) {
  const res = await db.query<any>(
    "select * from public.webhook_endpoints where id = $1 and seller_id = $2 limit 1",
    [id, sellerId],
  );
  return res.rows[0] || null;
}

async function loadOwnedZap(db: Db, sellerId: string, id: string) {
  const res = await db.query<any>(
    "select * from public.zapier_integrations where id = $1 and seller_id = $2 limit 1",
    [id, sellerId],
  );
  return res.rows[0] || null;
}

export async function registerSellerIntegrationRoutes(api: FastifyInstance, db: Db, env: { NODE_ENV?: string }) {
  api.get("/seller/webhooks", async (req, reply) => {
    await ensureSellerAccess(req, reply);
    const sellerId = String(req.auth!.user.id || "");
    const res = await db.query<any>(
      "select * from public.webhook_endpoints where seller_id = $1 order by created_at desc",
      [sellerId],
    );
    return reply.send({ data: (res.rows || []).map(mapWebhookEndpoint) });
  });

  api.post("/seller/webhooks", async (req, reply) => {
    await ensureSellerAccess(req, reply);
    const sellerId = String(req.auth!.user.id || "");
    const body = webhookCreateSchema.parse(req.body ?? {});
    const res = await db.query<any>(
      `
        insert into public.webhook_endpoints(seller_id, name, url, active, events)
        values ($1, $2, $3, $4, $5::jsonb)
        returning *
      `,
      [sellerId, body.name, body.url, body.active, toJsonb(body.events)],
    );
    return reply.code(201).send({ data: mapWebhookEndpoint(res.rows[0]) });
  });

  api.put("/seller/webhooks/:id", async (req, reply) => {
    await ensureSellerAccess(req, reply);
    const sellerId = String(req.auth!.user.id || "");
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = webhookUpdateSchema.parse(req.body ?? {});
    const existing = await loadOwnedWebhook(db, sellerId, id);
    if (!existing) return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Webhook not found" } });

    const res = await db.query<any>(
      `
        update public.webhook_endpoints
        set
          name = coalesce($1, name),
          url = coalesce($2, url),
          active = coalesce($3, active),
          events = coalesce($4::jsonb, events)
        where id = $5 and seller_id = $6
        returning *
      `,
      [
        body.name ?? null,
        body.url ?? null,
        typeof body.active === "boolean" ? body.active : null,
        body.events ? toJsonb(body.events) : null,
        id,
        sellerId,
      ],
    );
    return reply.send({ data: mapWebhookEndpoint(res.rows[0]) });
  });

  api.delete("/seller/webhooks/:id", async (req, reply) => {
    await ensureSellerAccess(req, reply);
    const sellerId = String(req.auth!.user.id || "");
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const existing = await loadOwnedWebhook(db, sellerId, id);
    if (!existing) return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Webhook not found" } });
    await db.query("delete from public.webhook_endpoints where id = $1 and seller_id = $2", [id, sellerId]);
    return reply.send({ data: { ok: true } });
  });

  api.get("/seller/webhooks/:id/logs", async (req, reply) => {
    await ensureSellerAccess(req, reply);
    const sellerId = String(req.auth!.user.id || "");
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const existing = await loadOwnedWebhook(db, sellerId, id);
    if (!existing) return reply.send({ data: [] });
    const res = await db.query<any>(
      `
        select *
        from public.webhook_logs
        where endpoint_id = $1
        order by triggered_at desc
        limit 20
      `,
      [id],
    );
    return reply.send({ data: res.rows || [] });
  });

  api.post("/seller/webhooks/:id/test", async (req, reply) => {
    await ensureSellerAccess(req, reply);
    const sellerId = String(req.auth!.user.id || "");
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const endpoint = await loadOwnedWebhook(db, sellerId, id);
    if (!endpoint) return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Webhook not found" } });

    const payload = JSON.stringify({
      payload_version: "2026-02-24",
      event: "test.ping",
      id: "test_" + crypto.randomUUID().slice(0, 8),
      value: 0,
      payment_method: "PIX",
      status: "TEST",
      customer: { name: "Teste Webhook", email: "teste@exemplo.com", cpf: "000.000.000-00", phone: "(00) 00000-0000" },
      product: { id: "prod_test", name: "Produto de Teste" },
      created_at: new Date().toISOString(),
    });

    const allowHttp = String(env.NODE_ENV || "").toLowerCase() === "development";
    const url = await assertSafeOutboundWebhookUrl(String(endpoint.url || ""), { allowHttp });
    const signature = hmacSha256Hex(endpoint.secret, payload);
    const startedAt = Date.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);
      const response = await fetch(url.toString(), {
        method: "POST",
        redirect: "manual",
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Signature": signature,
          "X-Webhook-Timestamp": new Date().toISOString(),
          "User-Agent": "DingitalPay-Webhooks/1.0 (test)",
        },
        body: payload,
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const responseTime = Date.now() - startedAt;
      await response.text().catch(() => {});
      return reply.send({
        data: {
          status_code: response.status,
          response_time: responseTime,
          success: response.status >= 200 && response.status < 300,
        },
      });
    } catch (error: any) {
      return reply.send({
        data: {
          status_code: 0,
          response_time: Date.now() - startedAt,
          success: false,
          error: String(error?.message || "Connection failed"),
        },
      });
    }
  });

  api.get("/seller/whatsapp-instances", async (req, reply) => {
    await ensureSellerAccess(req, reply);
    const sellerId = String(req.auth!.user.id || "");
    const res = await db.query<any>(
      "select * from public.whatsapp_instances where seller_id = $1 order by created_at desc",
      [sellerId],
    );
    return reply.send({ data: (res.rows || []).map(mapWhatsAppInstance) });
  });

  api.post("/seller/whatsapp-instances", async (req, reply) => {
    await ensureSellerAccess(req, reply);
    const sellerId = String(req.auth!.user.id || "");
    const body = whatsappCreateSchema.parse(req.body ?? {});
    const res = await db.query<any>(
      `
        insert into public.whatsapp_instances(
          seller_id, name, phone, status, events, last_active_at
        ) values ($1, $2, $3, $4, $5::jsonb, $6)
        returning *
      `,
      [sellerId, body.name, body.phone, body.status, toJsonb(body.events), new Date().toISOString()],
    );
    return reply.code(201).send({ data: mapWhatsAppInstance(res.rows[0]) });
  });

  api.delete("/seller/whatsapp-instances/:id", async (req, reply) => {
    await ensureSellerAccess(req, reply);
    const sellerId = String(req.auth!.user.id || "");
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const res = await db.query<any>(
      "delete from public.whatsapp_instances where id = $1 and seller_id = $2 returning id",
      [id, sellerId],
    );
    if (!res.rows[0]) return reply.code(404).send({ error: { code: "NOT_FOUND", message: "WhatsApp instance not found" } });
    return reply.send({ data: { ok: true } });
  });

  api.get("/seller/zapier-integrations", async (req, reply) => {
    await ensureSellerAccess(req, reply);
    const sellerId = String(req.auth!.user.id || "");
    const res = await db.query<any>(
      "select * from public.zapier_integrations where seller_id = $1 order by created_at desc",
      [sellerId],
    );
    return reply.send({ data: (res.rows || []).map(mapZapierIntegration) });
  });

  api.post("/seller/zapier-integrations", async (req, reply) => {
    await ensureSellerAccess(req, reply);
    const sellerId = String(req.auth!.user.id || "");
    const body = zapierCreateSchema.parse(req.body ?? {});
    const res = await db.query<any>(
      `
        insert into public.zapier_integrations(seller_id, name, webhook_url, active, events)
        values ($1, $2, $3, $4, $5::jsonb)
        returning *
      `,
      [sellerId, body.name, body.webhook_url, body.active, toJsonb(body.events)],
    );
    return reply.code(201).send({ data: mapZapierIntegration(res.rows[0]) });
  });

  api.put("/seller/zapier-integrations/:id", async (req, reply) => {
    await ensureSellerAccess(req, reply);
    const sellerId = String(req.auth!.user.id || "");
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = zapierUpdateSchema.parse(req.body ?? {});
    const existing = await loadOwnedZap(db, sellerId, id);
    if (!existing) return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Zapier integration not found" } });
    const res = await db.query<any>(
      `
        update public.zapier_integrations
        set
          name = coalesce($1, name),
          webhook_url = coalesce($2, webhook_url),
          active = coalesce($3, active),
          events = coalesce($4::jsonb, events)
        where id = $5 and seller_id = $6
        returning *
      `,
      [
        body.name ?? null,
        body.webhook_url ?? null,
        typeof body.active === "boolean" ? body.active : null,
        body.events ? toJsonb(body.events) : null,
        id,
        sellerId,
      ],
    );
    return reply.send({ data: mapZapierIntegration(res.rows[0]) });
  });

  api.delete("/seller/zapier-integrations/:id", async (req, reply) => {
    await ensureSellerAccess(req, reply);
    const sellerId = String(req.auth!.user.id || "");
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const res = await db.query<any>(
      "delete from public.zapier_integrations where id = $1 and seller_id = $2 returning id",
      [id, sellerId],
    );
    if (!res.rows[0]) return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Zapier integration not found" } });
    return reply.send({ data: { ok: true } });
  });

  api.get("/seller/zapier-integrations/:id/logs", async (req, reply) => {
    await ensureSellerAccess(req, reply);
    const sellerId = String(req.auth!.user.id || "");
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const existing = await loadOwnedZap(db, sellerId, id);
    if (!existing) return reply.send({ data: [] });
    const res = await db.query<any>(
      `
        select *
        from public.zapier_logs
        where integration_id = $1
        order by triggered_at desc
        limit 20
      `,
      [id],
    );
    return reply.send({ data: res.rows || [] });
  });

  api.post("/seller/zapier-integrations/:id/test", async (req, reply) => {
    await ensureSellerAccess(req, reply);
    const sellerId = String(req.auth!.user.id || "");
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const integration = await loadOwnedZap(db, sellerId, id);
    if (!integration) return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Zapier integration not found" } });

    const allowHttp = String(env.NODE_ENV || "").toLowerCase() === "development";
    const url = await assertSafeOutboundWebhookUrl(String(integration.webhook_url || ""), { allowHttp });
    const payload = JSON.stringify({
      event: "test.ping",
      payload_version: "2026-02-24",
      id: "zap_test_" + crypto.randomUUID().slice(0, 8),
      value: 1,
      payment_method: "PIX",
      status: "AUTHORIZED",
      customer: { name: "Teste Zapier", email: "teste@email.com" },
      product: { id: "prod_test", name: "Produto Teste" },
      created_at: new Date().toISOString(),
    });

    let success = false;
    let statusCode = 0;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);
      const response = await fetch(url.toString(), {
        method: "POST",
        redirect: "manual",
        headers: { "Content-Type": "application/json", "User-Agent": "DingitalPay-Zapier/1.0 (test)" },
        body: payload,
        signal: controller.signal,
      });
      clearTimeout(timeout);
      statusCode = response.status;
      success = response.status >= 200 && response.status < 300;
      await response.text().catch(() => {});
    } catch {
      success = false;
      statusCode = 0;
    }

    const now = new Date().toISOString();
    await db.query(
      "insert into public.zapier_logs(integration_id, event, success) values ($1, $2, $3)",
      [id, "test.ping", success],
    );
    await db.query("update public.zapier_integrations set last_triggered_at = $1 where id = $2", [now, id]);

    return reply.send({ data: { success, status_code: statusCode, triggered_at: now } });
  });
}
