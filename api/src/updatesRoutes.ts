import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "./db.js";
import type { Env } from "./env.js";
import { requireAdmin } from "./auth.js";
import { decryptJson, encryptJson, hashToken } from "./crypto.js";
import { promises as fs } from "node:fs";
import { basename, dirname } from "node:path";

const SetTokenSchema = z.object({
  token: z.string().min(10),
  provisioningBaseUrl: z.string().url().optional()
});

const CheckSchema = z.object({
  productKey: z.string().min(1).default("dingitalpay-platform"),
  currentVersion: z.string().optional()
});

const ApplySchema = z.object({
  productKey: z.string().min(1).default("dingitalpay-platform"),
  version: z.string().min(1),
});

type EncryptedPayload = { ciphertext: string; iv: string; tag: string };

async function ensureSingletonPlatformSettings(db: Db): Promise<void> {
  // platform_settings is intended to be a singleton row, but the table has no UNIQUE constraint to enforce it.
  // Insert only if the table is empty to avoid creating duplicates on every request.
  await db.query(
    `
      insert into public.platform_settings (id)
      select gen_random_uuid()
      where not exists (select 1 from public.platform_settings)
    `
  );
}

async function readSettings(db: Db): Promise<{
  provisioning_base_url: string | null;
  updates_token_encrypted: EncryptedPayload | null;
  updates_token_hash: string | null;
  updates_token_set_at: string | null;
}> {
  const res = await db.query<any>(
    "select provisioning_base_url, updates_token_encrypted, updates_token_hash, updates_token_set_at from public.platform_settings order by created_at asc limit 1"
  );
  const row = res.rows[0] || {};
  return {
    provisioning_base_url: row.provisioning_base_url ?? null,
    updates_token_encrypted: row.updates_token_encrypted ?? null,
    updates_token_hash: row.updates_token_hash ?? null,
    updates_token_set_at: row.updates_token_set_at ? new Date(row.updates_token_set_at).toISOString() : null
  };
}

async function writeTokenFileIfConfigured(env: Env, token: string): Promise<{ wrote: boolean }> {
  const filePath = String((env as any).UPDATES_TOKEN_FILE || "").trim();
  if (!filePath) return { wrote: false };
  const dir = dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(filePath, `${token}\n`, { mode: 0o600 });
  try {
    await fs.chmod(filePath, 0o600);
  } catch {
    // ignore
  }
  return { wrote: true };
}

async function deleteTokenFileIfConfigured(env: Env): Promise<void> {
  const filePath = String((env as any).UPDATES_TOKEN_FILE || "").trim();
  if (!filePath) return;
  try {
    await fs.unlink(filePath);
  } catch {
    // ignore
  }
}

async function readInstalledVersion(env: Env): Promise<string | null> {
  const installRoot = String((env as any).UPDATES_RUNNER_INSTALL_ROOT || "/opt/dingitalpay").trim() || "/opt/dingitalpay";
  const currentLink = `${installRoot.replace(/\/+$/, "")}/current`;
  try {
    const resolved = await fs.realpath(currentLink);
    const version = basename(resolved).trim();
    return version || null;
  } catch {
    return null;
  }
}

async function updatesJobsTableExists(db: Db): Promise<boolean> {
  try {
    const res = await db.query<any>(
      `
        select 1
        from information_schema.tables
        where table_schema = 'public' and table_name = 'updates_jobs'
        limit 1
      `
    );
    return Boolean(res.rows?.[0]);
  } catch {
    return false;
  }
}

export async function registerUpdatesRoutes(api: FastifyInstance, db: Db, env: Env) {
  api.get("/admin/updates/status", async (req, reply) => {
    await requireAdmin(db, req, reply);
    await ensureSingletonPlatformSettings(db);
    const s = await readSettings(db);
    const configured = Boolean(s.updates_token_encrypted && s.updates_token_hash);
    const currentVersion = await readInstalledVersion(env);
    return reply.send({
      ok: true,
      configured,
      tokenSetAt: s.updates_token_set_at,
      currentVersion,
      provisioningBaseUrl: s.provisioning_base_url || (env as any).PROVISIONING_BASE_URL || null,
      runnerEnabled: Boolean((env as any).UPDATES_RUNNER_ENABLED),
    });
  });

  api.post("/admin/updates/token", async (req, reply) => {
    await requireAdmin(db, req, reply);
    const body = SetTokenSchema.parse((req as any).body || {});
    await ensureSingletonPlatformSettings(db);

    const payload = encryptJson(env.MASTER_KEY, { token: body.token });
    const tokenHash = hashToken(body.token);

    await db.query(
      `update public.platform_settings
       set updates_token_encrypted = $1,
           updates_token_hash = $2,
           updates_token_set_at = now(),
           provisioning_base_url = coalesce($3, provisioning_base_url)
       where id = (select id from public.platform_settings order by created_at asc limit 1)`,
      [payload, tokenHash, body.provisioningBaseUrl ?? null]
    );

    let wroteFile = false;
    try {
      const r = await writeTokenFileIfConfigured(env, body.token);
      wroteFile = r.wrote;
    } catch {
      // ignore; DB storage is the source of truth
    }

    return reply.send({ ok: true, stored: true, wroteTokenFile: wroteFile });
  });

  api.delete("/admin/updates/token", async (req, reply) => {
    await requireAdmin(db, req, reply);
    await ensureSingletonPlatformSettings(db);
    await db.query(
      `update public.platform_settings
       set updates_token_encrypted = null,
           updates_token_hash = null,
           updates_token_set_at = null
       where id = (select id from public.platform_settings order by created_at asc limit 1)`
    );
    await deleteTokenFileIfConfigured(env);
    return reply.send({ ok: true });
  });

  api.post("/admin/updates/check", async (req, reply) => {
    await requireAdmin(db, req, reply);
    const body = CheckSchema.parse((req as any).body || {});
    await ensureSingletonPlatformSettings(db);
    const s = await readSettings(db);

    const decrypted = decryptJson(env.MASTER_KEY, s.updates_token_encrypted as any) as { token?: string } | null;
    const token = String(decrypted?.token || "").trim();
    if (!token) return reply.code(409).send({ ok: false, error: "missing_token" });

    const provisioningBaseUrl =
      String(s.provisioning_base_url || (env as any).PROVISIONING_BASE_URL || "").trim() ||
      "https://api.dingitalpay.com/provisioning";

    const res = await fetch(`${provisioningBaseUrl.replace(/\/+$/, "")}/api/updates/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, productKey: body.productKey, currentVersion: body.currentVersion }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok || payload?.ok !== true) {
      return reply.code(502).send({ ok: false, error: payload?.error || "upstream_error" });
    }
    return reply.send({ ok: true, releases: payload.releases || [] });
  });

  api.get("/admin/updates/jobs", async (req, reply) => {
    await requireAdmin(db, req, reply);
    if (!(await updatesJobsTableExists(db))) return reply.send({ ok: true, jobs: [] });
    const res = await db.query<any>(
      `
        select id, product_key, target_version, status, attempts, max_attempts, created_at, started_at, finished_at, last_error
        from public.updates_jobs
        order by created_at desc
        limit 50
      `
    );
    return reply.send({ ok: true, jobs: res.rows || [] });
  });

  api.get("/admin/updates/jobs/:id", async (req, reply) => {
    await requireAdmin(db, req, reply);
    const id = String((req as any).params?.id || "").trim();
    if (!id) return reply.code(400).send({ ok: false, error: "missing_id" });
    if (!(await updatesJobsTableExists(db))) return reply.code(409).send({ ok: false, error: "missing_migrations" });
    const res = await db.query<any>(
      `
        select id, product_key, target_version, status, attempts, max_attempts, created_at, started_at, finished_at, last_error, log
        from public.updates_jobs
        where id = $1
        limit 1
      `,
      [id]
    );
    const row = res.rows?.[0];
    if (!row) return reply.code(404).send({ ok: false, error: "not_found" });
    return reply.send({ ok: true, job: row });
  });

  api.post("/admin/updates/jobs/:id/cancel", async (req, reply) => {
    await requireAdmin(db, req, reply);
    const id = String((req as any).params?.id || "").trim();
    if (!id) return reply.code(400).send({ ok: false, error: "missing_id" });
    if (!(await updatesJobsTableExists(db))) return reply.code(409).send({ ok: false, error: "missing_migrations" });

    const canceled = await db.query<any>(
      `
        update public.updates_jobs
        set
          status = 'canceled',
          finished_at = now(),
          locked_at = null,
          last_error = case
            when coalesce(last_error, '') = '' then 'canceled_by_admin'
            else left(last_error || ' | canceled_by_admin', 4000)
          end,
          log = case
            when coalesce(log, '') = '' then '[admin-cancel] job canceled manually from admin panel'
            else left(log || E'\\n\\n[admin-cancel] job canceled manually from admin panel', 20000)
          end
        where id = $1
          and status in ('queued', 'running')
        returning id, product_key, target_version, status, attempts, max_attempts, created_at, started_at, finished_at, last_error, log
      `,
      [id]
    );
    const job = canceled.rows?.[0];
    if (job) {
      return reply.send({
        ok: true,
        job,
        message: "Job cancelado. Se já estava em execução, o runner vai interromper o processo.",
      });
    }

    const existing = await db.query<any>(
      `
        select id, product_key, target_version, status, attempts, max_attempts, created_at, started_at, finished_at, last_error, log
        from public.updates_jobs
        where id = $1
        limit 1
      `,
      [id]
    );
    const row = existing.rows?.[0];
    if (!row) return reply.code(404).send({ ok: false, error: "not_found" });
    return reply.code(409).send({ ok: false, error: "job_not_cancelable", job: row });
  });

  api.post("/admin/updates/apply", async (req, reply) => {
    await requireAdmin(db, req, reply);
    const body = ApplySchema.parse((req as any).body || {});
    await ensureSingletonPlatformSettings(db);
    const s = await readSettings(db);
    const configured = Boolean(s.updates_token_encrypted && s.updates_token_hash);
    if (!configured) return reply.code(409).send({ ok: false, error: "missing_token" });
    if (!(await updatesJobsTableExists(db))) return reply.code(409).send({ ok: false, error: "missing_migrations" });
    if (!(env as any).UPDATES_RUNNER_ENABLED) {
      return reply.code(409).send({
        ok: false,
        error: "runner_disabled",
        message: "O runner server-side está desabilitado nesta instância. Habilite o runner ou use o CLI.",
      });
    }

    const userId = (req as any).user?.id || null;
    await db.query(
      `
        update public.updates_jobs
        set
          status = 'canceled',
          finished_at = now(),
          locked_at = null,
          last_error = case
            when coalesce(last_error, '') = '' then 'superseded_by_new_apply_request'
            else left(last_error || ' | superseded_by_new_apply_request', 4000)
          end,
          log = case
            when coalesce(log, '') = '' then '[auto-cancel] superseded by newer apply request'
            else left(log || E'\\n\\n[auto-cancel] superseded by newer apply request', 20000)
          end
        where product_key = $1
          and status in ('queued', 'running')
      `,
      [body.productKey]
    );
    const ins = await db.query<any>(
      `
        insert into public.updates_jobs(product_key, target_version, requested_by_user_id)
        values ($1,$2,$3)
        returning id, status, created_at
      `,
      [body.productKey, body.version, userId]
    );
    const job = ins.rows?.[0];

    return reply.send({
      ok: true,
      job: job || null,
      runnerEnabled: Boolean((env as any).UPDATES_RUNNER_ENABLED),
      message: (env as any).UPDATES_RUNNER_ENABLED
        ? "Job enfileirado. O worker aplicará a atualização no servidor."
        : "Job enfileirado, mas o runner está desabilitado. Use o CLI (dingitalpay-updater) para aplicar.",
    });
  });
}
