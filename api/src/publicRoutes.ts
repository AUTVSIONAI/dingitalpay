import type { FastifyInstance } from "fastify";
import type { Db } from "./db.js";
import { loadEnv } from "./env.js";
import { verifyTrackingToken } from "./tracking.js";
import * as crypto from "node:crypto";
import { z } from "zod";
import { classifyEmailTrackingSource, isHumanTrackingEvent, truncateHeaderValue } from "./emailTrackingClassifier.js";

const ONBOARDING_SETUP_FORM_SCHEMA_VERSION = 1;

const SetupFormPayloadSchema = z.object({
  brandName: z.string().max(255).default(""),
  hasLogo: z.enum(["", "sim", "nao"]).default(""),
  logoFileName: z.string().max(255).default(""),
  hasColorPalette: z.enum(["", "sim", "nao"]).default(""),
  primaryColor: z.string().max(32).default("#00E6B8"),
  secondaryColor: z.string().max(32).default("#0B1210"),
  hasOwnDomain: z.enum(["", "sim", "nao"]).default(""),
  existingDomain: z.string().max(255).default(""),
  desiredDomain: z.string().max(255).default(""),
  hasVps: z.enum(["", "sim", "nao"]).default(""),
  vpsProvider: z.string().max(255).default(""),
  hasDomainPanelAccess: z.enum(["", "sim", "nao"]).default(""),
  technicalOwnerName: z.string().max(255).default(""),
  noTechnicalOwnerYet: z.coerce.boolean().default(false),
  hasMpOrKipay: z.enum(["", "sim", "nao", "outra_adquirente"]).default(""),
  initialAcquirer: z.string().max(255).default(""),
  hasAcquirerDocs: z.enum(["", "sim", "nao"]).default(""),
  acquirerDocsLink: z.string().max(1000).default(""),
  adminEmail: z.string().max(255).default(""),
  adminName: z.string().max(255).default(""),
  teamNeedsAccess: z.string().max(4000).default(""),
  wantsLegalAndBrandingReady: z.enum(["", "sim", "nao"]).default(""),
  extraCustomization: z.string().max(4000).default(""),
  goalProfile: z.enum(["", "validar_rapido", "operacao_completa"]).default(""),
});

const SetupFormLogoSchema = z
  .object({
    fileName: z.string().min(1).max(255),
    contentType: z.string().min(1).max(255),
    sizeBytes: z.coerce.number().int().min(1).max(2 * 1024 * 1024),
    dataBase64: z.string().min(1).max(3_200_000),
  })
  .nullable()
  .optional();

const SetupFormSaveSchema = z.object({
  draftKey: z.string().uuid().optional(),
  payload: SetupFormPayloadSchema,
  logo: SetupFormLogoSchema,
});

type SetupFormStatus = "draft" | "submitted";

type SetupFormLogoStored = {
  fileName: string;
  contentType: string;
  sizeBytes: number;
  dataBase64: string;
};

type SetupFormRow = {
  id: string;
  draft_key: string;
  status: SetupFormStatus;
  schema_version: number;
  brand_name: string | null;
  desired_domain: string | null;
  admin_email: string | null;
  payload: unknown;
  logo_file_name: string | null;
  logo_content_type: string | null;
  logo_size_bytes: number | null;
  logo_data_base64: string | null;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
};

function normalizeSetupFormRecord(row: SetupFormRow | null) {
  if (!row) return null;
  const payload = SetupFormPayloadSchema.parse(row.payload || {});
  return {
    id: row.id,
    draftKey: row.draft_key,
    status: row.status,
    schemaVersion: Number(row.schema_version || ONBOARDING_SETUP_FORM_SCHEMA_VERSION),
    payload,
    logo: row.logo_file_name
      ? {
          fileName: row.logo_file_name,
          contentType: row.logo_content_type || "",
          sizeBytes: Number(row.logo_size_bytes || 0),
        }
      : null,
    submittedAt: row.submitted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getOnboardingSetupFormByDraftKey(db: Db, draftKey: string) {
  const res = await db.query<SetupFormRow>(
    `
    select
      id,
      draft_key,
      status,
      schema_version,
      brand_name,
      desired_domain,
      admin_email,
      payload,
      logo_file_name,
      logo_content_type,
      logo_size_bytes,
      logo_data_base64,
      submitted_at,
      created_at,
      updated_at
    from public.onboarding_setup_forms
    where draft_key = $1
    limit 1
    `,
    [draftKey]
  );
  return res.rows[0] || null;
}

async function saveOnboardingSetupForm(
  db: Db,
  input: {
    draftKey?: string;
    payload: z.infer<typeof SetupFormPayloadSchema>;
    logo?: z.infer<typeof SetupFormLogoSchema>;
    status: SetupFormStatus;
  }
) {
  const draftKey = String(input.draftKey || crypto.randomUUID()).trim();
  const existing = await getOnboardingSetupFormByDraftKey(db, draftKey);
  const logo: SetupFormLogoStored | null =
    input.logo === undefined
      ? existing?.logo_file_name
        ? {
            fileName: String(existing.logo_file_name || ""),
            contentType: String(existing.logo_content_type || ""),
            sizeBytes: Number(existing.logo_size_bytes || 0),
            dataBase64: String(existing.logo_data_base64 || ""),
          }
        : null
      : input.logo
        ? {
            fileName: input.logo.fileName,
            contentType: input.logo.contentType,
            sizeBytes: input.logo.sizeBytes,
            dataBase64: input.logo.dataBase64,
          }
        : null;

  const submittedAt = input.status === "submitted" ? new Date().toISOString() : null;

  const saved = await db.query<SetupFormRow>(
    `
    insert into public.onboarding_setup_forms (
      draft_key,
      status,
      schema_version,
      brand_name,
      desired_domain,
      admin_email,
      payload,
      logo_file_name,
      logo_content_type,
      logo_size_bytes,
      logo_data_base64,
      submitted_at
    ) values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12)
    on conflict (draft_key) do update
    set status = case
          when public.onboarding_setup_forms.status = 'submitted' then public.onboarding_setup_forms.status
          else excluded.status
        end,
        schema_version = excluded.schema_version,
        brand_name = excluded.brand_name,
        desired_domain = excluded.desired_domain,
        admin_email = excluded.admin_email,
        payload = excluded.payload,
        logo_file_name = excluded.logo_file_name,
        logo_content_type = excluded.logo_content_type,
        logo_size_bytes = excluded.logo_size_bytes,
        logo_data_base64 = excluded.logo_data_base64,
        submitted_at = case
          when public.onboarding_setup_forms.status = 'submitted' then public.onboarding_setup_forms.submitted_at
          when excluded.status = 'submitted' then coalesce(public.onboarding_setup_forms.submitted_at, excluded.submitted_at)
          else public.onboarding_setup_forms.submitted_at
        end,
        updated_at = now()
    returning
      id,
      draft_key,
      status,
      schema_version,
      brand_name,
      desired_domain,
      admin_email,
      payload,
      logo_file_name,
      logo_content_type,
      logo_size_bytes,
      logo_data_base64,
      submitted_at,
      created_at,
      updated_at
    `,
    [
      draftKey,
      input.status,
      ONBOARDING_SETUP_FORM_SCHEMA_VERSION,
      input.payload.brandName.trim() || null,
      input.payload.desiredDomain.trim() || null,
      input.payload.adminEmail.trim().toLowerCase() || null,
      JSON.stringify(input.payload),
      logo?.fileName || null,
      logo?.contentType || null,
      logo?.sizeBytes || null,
      logo?.dataBase64 || null,
      submittedAt,
    ]
  );

  return saved.rows[0] || null;
}

export async function registerPublicRoutes(app: FastifyInstance, db: Db) {
  const env = loadEnv();

  const ipSalt = crypto.createHash("sha256").update(`dingitalpay:ip_salt:${env.MASTER_KEY}`).digest("hex");
  function hashIp(ip: string): string {
    const normalized = String(ip || "").trim();
    if (!normalized) return "";
    return crypto.createHash("sha256").update(`${ipSalt}:${normalized}`).digest("hex");
  }

  function getClientIp(req: any): string {
    const realIp = String(req.headers?.["x-real-ip"] || "").trim();
    return realIp || String(req.ip || "");
  }

  // Public, read-only platform settings used by the frontend (theme, links, branding).
  app.get("/public/platform-settings", async (_req, reply) => {
    const res = await db.query("select * from public.platform_settings limit 1");
    return reply.send({ data: res.rows[0] ?? null, error: null });
  });

  app.get("/public/offers/slug/:slug", async (req, reply) => {
    const { slug } = z.object({ slug: z.string().min(1).max(255) }).parse(req.params);
    const res = await db.query(
      `
      select id, product_id, price, active, name
      from public.product_offers
      where slug = $1
      limit 1
      `,
      [slug]
    );
    return reply.send({ data: res.rows[0] ?? null, error: null });
  });

  app.get("/public/offers/:offerId", async (req, reply) => {
    const { offerId } = z.object({ offerId: z.string().uuid() }).parse(req.params);
    const res = await db.query(
      `
      select id, product_id, price, active, name
      from public.product_offers
      where id = $1
      limit 1
      `,
      [offerId]
    );
    return reply.send({ data: res.rows[0] ?? null, error: null });
  });

  app.get("/public/products/:productId/pixels", async (req, reply) => {
    const { productId } = z.object({ productId: z.string().uuid() }).parse(req.params);
    const res = await db.query(
      `
      select id, product_id, pixel_id, platform, active, created_at
      from public.product_pixels
      where product_id = $1
        and active = true
      order by created_at asc
      `,
      [productId]
    );
    return reply.send({ data: res.rows ?? [], error: null });
  });

  app.get("/public/product-domains/resolve", async (req, reply) => {
    const { host } = z.object({ host: z.string().min(1).max(255) }).parse(req.query || {});
    const res = await db.query(
      `
      select product_id
      from public.product_domains
      where domain = $1
        and verified = true
      limit 1
      `,
      [host]
    );
    return reply.send({ data: res.rows[0] ?? null, error: null });
  });

  app.get("/public/products/by-ids", async (req, reply) => {
    const { ids } = z.object({ ids: z.string().min(1) }).parse(req.query || {});
    const productIds = Array.from(new Set(ids.split(",").map((value) => value.trim()).filter(Boolean)));
    if (!productIds.length) return reply.send({ data: [], error: null });

    const res = await db.query(
      `
      select
        id,
        seller_id,
        name,
        short_description,
        long_description,
        price,
        type,
        status,
        image_url,
        sales,
        revenue,
        warranty_days,
        delivery_type,
        created_at,
        updated_at
      from public.products
      where id = any($1::uuid[])
        and status = 'active'
      `,
      [productIds]
    );
    return reply.send({ data: res.rows ?? [], error: null });
  });

  app.get("/public/products/:productId", async (req, reply) => {
    const { productId } = z.object({ productId: z.string().uuid() }).parse(req.params);
    const res = await db.query(
      `
      select
        id,
        seller_id,
        name,
        short_description,
        long_description,
        price,
        type,
        status,
        image_url,
        sales,
        revenue,
        warranty_days,
        delivery_type,
        created_at,
        updated_at
      from public.products
      where id = $1
        and status = 'active'
      limit 1
      `,
      [productId]
    );
    return reply.send({ data: res.rows[0] ?? null, error: null });
  });

  app.get("/public/products/:productId/checkout-config", async (req, reply) => {
    const { productId } = z.object({ productId: z.string().uuid() }).parse(req.params);
    const res = await db.query(
      `
      select *
      from public.product_checkout_config
      where product_id = $1
      limit 1
      `,
      [productId]
    );
    return reply.send({ data: res.rows[0] ?? null, error: null });
  });

  app.get("/public/onboarding/setup-form", async (req, reply) => {
    const draftKey = String((req.query as any)?.draftKey || "").trim();
    if (!draftKey) {
      return reply.send({ data: { form: null }, error: null });
    }
    const parsed = z.string().uuid().safeParse(draftKey);
    if (!parsed.success) {
      return reply.code(422).send({ error: { code: "VALIDATION_ERROR", message: "Draft inválido." } });
    }

    const row = await getOnboardingSetupFormByDraftKey(db, parsed.data);
    return reply.send({ data: { form: normalizeSetupFormRecord(row) }, error: null });
  });

  app.post("/public/onboarding/setup-form/draft", async (req, reply) => {
    const body = SetupFormSaveSchema.parse((req as any).body || {});
    const saved = await saveOnboardingSetupForm(db, {
      draftKey: body.draftKey,
      payload: body.payload,
      logo: body.logo,
      status: "draft",
    });
    return reply.send({ data: { form: normalizeSetupFormRecord(saved) }, error: null });
  });

  app.post("/public/onboarding/setup-form/submit", async (req, reply) => {
    const body = SetupFormSaveSchema.parse((req as any).body || {});
    const saved = await saveOnboardingSetupForm(db, {
      draftKey: body.draftKey,
      payload: body.payload,
      logo: body.logo,
      status: "submitted",
    });
    return reply.send({ data: { form: normalizeSetupFormRecord(saved) }, error: null });
  });

  // Open tracking pixel
  app.get("/email/open/:token", async (req, reply) => {
    const token = String((req.params as any).token || "");
    const payload = verifyTrackingToken(env.MASTER_KEY, token);
    if (!payload || payload.t !== "open") return reply.code(404).send("not found");

    const outboxId = payload.id;
    const ua = truncateHeaderValue(String(req.headers["user-agent"] || ""));
    const referer = truncateHeaderValue(String(req.headers["referer"] || ""));
    const ipHash = hashIp(getClientIp(req));

    const src = classifyEmailTrackingSource({ type: "open", userAgent: ua, referer });
    const isHuman = isHumanTrackingEvent({ type: "open", source: src });

    await db.query(
      "insert into public.email_events(outbox_id, type, source, is_human, ip_hash, ua, referer) values ($1,'open',$2,$3,$4,$5,$6)",
      [outboxId, src, isHuman, ipHash, ua, referer]
    ).catch(() => {});

    await db.query(
      `
        update public.email_outbox
        set
          open_count = open_count + 1,
          first_open_at = coalesce(first_open_at, now()),
          open_human_count = open_human_count + (case when $2::boolean then 1 else 0 end),
          first_human_open_at = case when $2::boolean then coalesce(first_human_open_at, now()) else first_human_open_at end,
          updated_at = now()
        where id = $1
      `,
      [outboxId, isHuman]
    ).catch(() => {});

    await db.query(
      "insert into public.email_logs(outbox_id, level, message, meta) values ($1,'info','open',$2::jsonb)",
      [outboxId, JSON.stringify({ source: src, human: isHuman })]
    ).catch(() => {});

    // 1x1 transparent GIF
    const gif = Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64");
    return reply
      .header("Content-Type", "image/gif")
      .header("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate")
      .header("Pragma", "no-cache")
      .header("Expires", "0")
      .send(gif);
  });

  // Click tracking redirect
  app.get("/email/click/:token", async (req, reply) => {
    const token = String((req.params as any).token || "");
    const payload = verifyTrackingToken(env.MASTER_KEY, token);
    if (!payload || payload.t !== "click") return reply.code(404).send("not found");

    const outboxId = payload.id;
    const ua = truncateHeaderValue(String(req.headers["user-agent"] || ""));
    const referer = truncateHeaderValue(String(req.headers["referer"] || ""));
    const ipHash = hashIp(getClientIp(req));
    const destUrl = truncateHeaderValue(String(payload.u || ""), 1024);

    const src = classifyEmailTrackingSource({ type: "click", userAgent: ua, referer, url: destUrl });
    const isHuman = isHumanTrackingEvent({ type: "click", source: src });

    await db.query(
      "insert into public.email_events(outbox_id, type, source, is_human, ip_hash, ua, referer, url) values ($1,'click',$2,$3,$4,$5,$6,$7)",
      [outboxId, src, isHuman, ipHash, ua, referer, destUrl]
    ).catch(() => {});

    await db.query(
      `
        update public.email_outbox
        set
          click_count = click_count + 1,
          first_click_at = coalesce(first_click_at, now()),
          click_human_count = click_human_count + (case when $2::boolean then 1 else 0 end),
          first_human_click_at = case when $2::boolean then coalesce(first_human_click_at, now()) else first_human_click_at end,
          updated_at = now()
        where id = $1
      `,
      [outboxId, isHuman]
    ).catch(() => {});

    await db.query(
      "insert into public.email_logs(outbox_id, level, message, meta) values ($1,'info','click',$2::jsonb)",
      [outboxId, JSON.stringify({ u: destUrl, source: src, human: isHuman })]
    ).catch(() => {});

    return reply.redirect(payload.u);
  });
}
