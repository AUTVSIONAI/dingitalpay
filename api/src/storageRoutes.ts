import type { FastifyInstance } from "fastify";
import path from "node:path";
import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import { z } from "zod";
import type { Env } from "./env.js";
import type { Db } from "./db.js";
import { requireAuth } from "./auth.js";
import { logSecurityEvent } from "./securityAudit.js";

const bucketSchema = z.string().regex(/^[a-z0-9-]+$/);

function safeJoin(root: string, ...parts: string[]): string {
  const joined = path.join(root, ...parts);
  const normalizedRoot = path.resolve(root) + path.sep;
  const normalizedJoined = path.resolve(joined);
  if (!normalizedJoined.startsWith(normalizedRoot)) throw new Error("Invalid path");
  return normalizedJoined;
}

function contentTypeForFilename(filename: string): string {
  const ext = String(path.extname(filename || "")).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".ico") return "image/x-icon";
  return "application/octet-stream";
}

export async function registerStorageRoutes(app: FastifyInstance, _db: Db, env: Env) {
  const uploadsRoot = process.env.UPLOADS_DIR || "/data/uploads";
  const publicBuckets = new Set(
    String(env.PUBLIC_STORAGE_BUCKETS || "platform-assets,avatars,product-images")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
  const db = _db;

  const storageStrict = Boolean(env.STORAGE_STRICT_AUTHZ);
  const auditOnly = Boolean(env.STORAGE_AUDIT_ONLY);
  const uuidSchema = z.string().uuid();

  function forbidden(reply: any, code: string, message: string) {
    return reply.code(403).send({ error: { code, message } });
  }

  function badRequest(reply: any, message: string) {
    return reply.code(400).send({ error: { code: "STORAGE_BAD_REQUEST", message } });
  }

  async function ownsProduct(productId: string, sellerId: string): Promise<boolean> {
    try {
      const res = await db.query("select 1 from public.products where id = $1 and seller_id = $2 limit 1", [productId, sellerId]);
      return !!res.rows[0];
    } catch {
      return false;
    }
  }

  async function enforceStorageAuthz(req: any, reply: any, args: { action: "upload" | "list" | "remove"; bucket: string; pathOrPrefix?: string; paths?: string[] }) {
    if (!storageStrict) return { ok: true };

    const role = String(req?.auth?.role || "").trim();
    const userId = String(req?.auth?.user?.id || "").trim();
    if (!role || !userId) {
      logSecurityEvent(db, env, req, { route: "/api/storage", eventType: "storage_forbidden", code: "STORAGE_NO_ROLE", meta: { action: args.action, bucket: args.bucket } }).catch(() => {});
      if (auditOnly) return { ok: true };
      forbidden(reply, "STORAGE_FORBIDDEN", "Forbidden");
      return { ok: false };
    }

    const bucket = String(args.bucket || "").trim();
    const allowedBuckets = new Set(["platform-assets", "avatars", "product-images", "product-files"]);
    if (!allowedBuckets.has(bucket)) {
      logSecurityEvent(db, env, req, { route: "/api/storage", eventType: "storage_forbidden", code: "STORAGE_BUCKET_NOT_ALLOWED", meta: { action: args.action, bucket } }).catch(() => {});
      if (auditOnly) return { ok: true };
      forbidden(reply, "STORAGE_BUCKET_NOT_ALLOWED", "Bucket not allowed.");
      return { ok: false };
    }

    if (bucket === "platform-assets") {
      if (role !== "admin") {
        logSecurityEvent(db, env, req, { route: "/api/storage", eventType: "storage_forbidden", code: "STORAGE_ADMIN_ONLY", meta: { action: args.action, bucket } }).catch(() => {});
        if (auditOnly) return { ok: true };
        forbidden(reply, "STORAGE_FORBIDDEN", "Forbidden");
        return { ok: false };
      }
      const paths = args.paths && args.paths.length ? args.paths : [String(args.pathOrPrefix || "").trim()].filter(Boolean);
      if (!paths.length) {
        logSecurityEvent(db, env, req, { route: "/api/storage", eventType: "storage_forbidden", code: "STORAGE_PREFIX_REQUIRED", meta: { action: args.action, bucket } }).catch(() => {});
        if (auditOnly) return { ok: true };
        badRequest(reply, "Prefix/path obrigatório.");
        return { ok: false };
      }
      if (paths.some((p) => !String(p || "").startsWith("branding/"))) {
        logSecurityEvent(db, env, req, { route: "/api/storage", eventType: "storage_forbidden", code: "STORAGE_BAD_PATH", meta: { action: args.action, bucket } }).catch(() => {});
        if (auditOnly) return { ok: true };
        badRequest(reply, "Caminho inválido.");
        return { ok: false };
      }
      return { ok: true };
    }

    if (bucket === "avatars") {
      const paths = args.paths && args.paths.length ? args.paths : [String(args.pathOrPrefix || "").trim()].filter(Boolean);
      if (!paths.length) {
        logSecurityEvent(db, env, req, { route: "/api/storage", eventType: "storage_forbidden", code: "STORAGE_PREFIX_REQUIRED", meta: { action: args.action, bucket } }).catch(() => {});
        if (auditOnly) return { ok: true };
        badRequest(reply, "Prefix/path obrigatório.");
        return { ok: false };
      }
      if (paths.some((p) => !String(p || "").startsWith(`${userId}/`))) {
        logSecurityEvent(db, env, req, { route: "/api/storage", eventType: "storage_forbidden", code: "STORAGE_CROSS_TENANT", meta: { action: args.action, bucket } }).catch(() => {});
        if (auditOnly) return { ok: true };
        forbidden(reply, "STORAGE_FORBIDDEN", "Forbidden");
        return { ok: false };
      }
      return { ok: true };
    }

    if (bucket === "product-images") {
      if (role !== "seller" && role !== "admin") {
        logSecurityEvent(db, env, req, { route: "/api/storage", eventType: "storage_forbidden", code: "STORAGE_SELLER_ONLY", meta: { action: args.action, bucket } }).catch(() => {});
        if (auditOnly) return { ok: true };
        forbidden(reply, "STORAGE_FORBIDDEN", "Forbidden");
        return { ok: false };
      }
      const sellerId = userId;
      const paths = args.paths && args.paths.length ? args.paths : [String(args.pathOrPrefix || "").trim()].filter(Boolean);
      if (!paths.length) {
        if (auditOnly) return { ok: true };
        badRequest(reply, "Prefix/path obrigatório.");
        return { ok: false };
      }

      const productIds = Array.from(new Set(paths.map((p) => String(p || "").split("/")[0]).filter(Boolean)));
      for (const pidRaw of productIds) {
        if (!pidRaw) continue;
        let pid = "";
        try {
          pid = uuidSchema.parse(pidRaw);
        } catch {
          if (auditOnly) continue;
          badRequest(reply, "Caminho inválido.");
          return { ok: false };
        }
        if (role === "admin") continue;
        const ok = await ownsProduct(pid, sellerId);
        if (!ok) {
          logSecurityEvent(db, env, req, { route: "/api/storage", eventType: "storage_forbidden", code: "STORAGE_PRODUCT_NOT_OWNED", meta: { action: args.action, bucket } }).catch(() => {});
          if (auditOnly) return { ok: true };
          forbidden(reply, "STORAGE_FORBIDDEN", "Forbidden");
          return { ok: false };
        }
      }
      return { ok: true };
    }

    if (bucket === "product-files") {
      if (role !== "seller" && role !== "admin") {
        logSecurityEvent(db, env, req, { route: "/api/storage", eventType: "storage_forbidden", code: "STORAGE_SELLER_ONLY", meta: { action: args.action, bucket } }).catch(() => {});
        if (auditOnly) return { ok: true };
        forbidden(reply, "STORAGE_FORBIDDEN", "Forbidden");
        return { ok: false };
      }
      const sellerId = userId;
      const paths = args.paths && args.paths.length ? args.paths : [String(args.pathOrPrefix || "").trim()].filter(Boolean);
      if (!paths.length) {
        if (auditOnly) return { ok: true };
        badRequest(reply, "Prefix/path obrigatório.");
        return { ok: false };
      }

      const productIds = Array.from(new Set(paths.map((p) => String(p || "").split("/")[0]).filter(Boolean)));
      for (const pidRaw of productIds) {
        if (!pidRaw) continue;
        let pid = "";
        try {
          pid = uuidSchema.parse(pidRaw);
        } catch {
          if (auditOnly) continue;
          badRequest(reply, "Caminho inválido.");
          return { ok: false };
        }
        if (role === "admin") continue;
        const ok = await ownsProduct(pid, sellerId);
        if (!ok) {
          logSecurityEvent(db, env, req, { route: "/api/storage", eventType: "storage_forbidden", code: "STORAGE_PRODUCT_NOT_OWNED", meta: { action: args.action, bucket } }).catch(() => {});
          if (auditOnly) return { ok: true };
          forbidden(reply, "STORAGE_FORBIDDEN", "Forbidden");
          return { ok: false };
        }
      }
      return { ok: true };
    }

    return { ok: true };
  }

  // Public file serving
  app.get("/storage/public/:bucket/*", async (req, reply) => {
    const bucket = bucketSchema.parse((req.params as any).bucket);
    if (!publicBuckets.has(bucket)) return reply.code(404).send({ error: "Not found" });
    const rest = String((req.params as any)["*"] || "");
    const filePath = safeJoin(uploadsRoot, bucket, rest);
    try {
      await fs.access(filePath);
    } catch {
      return reply.code(404).send({ error: "Not found" });
    }
    return reply.type(contentTypeForFilename(rest)).send(createReadStream(filePath));
  });

  // Upload (authenticated)
  app.post("/storage/:bucket/upload", async (req, reply) => {
    requireAuth(req, reply);
    const bucket = bucketSchema.parse((req.params as any).bucket);

    const filename = String((req.query as any).path || "").trim();
    const upsert = String((req.query as any).upsert || "false") === "true";
    if (!filename) return reply.code(400).send({ error: { message: "path is required" } });

    const authz = await enforceStorageAuthz(req, reply, { action: "upload", bucket, pathOrPrefix: filename });
    if (!authz.ok) return;

    const mp = await (req as any).file();
    if (!mp) return reply.code(400).send({ error: { message: "file is required" } });

    if (bucket === "platform-assets") {
      const mime = String(mp.mimetype || "");
      if (!mime.startsWith("image/")) {
        return reply.code(400).send({ error: { message: "Only image uploads are allowed for this bucket." } });
      }
    }
    if (bucket === "product-images" || bucket === "avatars") {
      const mime = String(mp.mimetype || "");
      if (!mime.startsWith("image/")) {
        return reply.code(400).send({ error: { message: "Only image uploads are allowed for this bucket." } });
      }
    }

    let dest = "";
    try {
      dest = safeJoin(uploadsRoot, bucket, filename);
    } catch {
      return reply.code(400).send({ error: { message: "Invalid path" } });
    }
    await fs.mkdir(path.dirname(dest), { recursive: true });

    try {
      if (!upsert) {
        await fs.access(dest);
        return reply.code(409).send({ error: { message: "File already exists" } });
      }
    } catch {
      // ok
    }

    const buf = await mp.toBuffer();
    if (bucket === "platform-assets") {
      const maxBytes = 2 * 1024 * 1024;
      if (buf.length > maxBytes) return reply.code(413).send({ error: { message: "File too large (max 2MB)." } });
    }
    if (bucket === "product-images" || bucket === "avatars") {
      const maxBytes = 5 * 1024 * 1024;
      if (buf.length > maxBytes) return reply.code(413).send({ error: { message: "File too large (max 5MB)." } });
    }
    await fs.writeFile(dest, buf);
    return reply.send({ data: { path: filename }, error: null });
  });

  // List files (authenticated)
  app.get("/storage/:bucket/list", async (req, reply) => {
    requireAuth(req, reply);
    const bucket = bucketSchema.parse((req.params as any).bucket);
    const prefix = String((req.query as any).prefix || "").trim();
    const authz = await enforceStorageAuthz(req, reply, { action: "list", bucket, pathOrPrefix: prefix });
    if (!authz.ok) return;

    let dir = "";
    try {
      dir = safeJoin(uploadsRoot, bucket, prefix);
    } catch {
      return reply.send({ data: [], error: null });
    }
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      const files = entries
        .filter((e) => e.isFile())
        .map((e) => ({ name: e.name }));
      return reply.send({ data: files, error: null });
    } catch {
      return reply.send({ data: [], error: null });
    }
  });

  // Remove files (authenticated)
  app.post("/storage/:bucket/remove", async (req, reply) => {
    requireAuth(req, reply);
    const bucket = bucketSchema.parse((req.params as any).bucket);
    const body = z.object({ paths: z.array(z.string().min(1)) }).parse(req.body);
    const authz = await enforceStorageAuthz(req, reply, { action: "remove", bucket, paths: body.paths });
    if (!authz.ok) return;
    const removed: string[] = [];
    for (const p of body.paths) {
      let filePath = "";
      try {
        filePath = safeJoin(uploadsRoot, bucket, p);
      } catch {
        continue;
      }
      try {
        await fs.rm(filePath, { force: true });
        removed.push(p);
      } catch {
        // ignore
      }
    }
    return reply.send({ data: removed.map((p) => ({ name: p })), error: null });
  });

  // getPublicUrl helper (no auth required)
  app.get("/storage/:bucket/public-url", async (req, reply) => {
    const bucket = bucketSchema.parse((req.params as any).bucket);
    if (!publicBuckets.has(bucket)) return reply.code(403).send({ error: { message: "Bucket is not public." } });
    const filePath = String((req.query as any).path || "").trim();
    if (!filePath) return reply.code(400).send({ error: { message: "path is required" } });
    const publicUrl = `${env.PUBLIC_BASE_URL}/api/storage/public/${bucket}/${encodeURIComponent(filePath).replace(/%2F/g, "/")}`;
    return reply.send({ data: { publicUrl }, error: null });
  });
}
