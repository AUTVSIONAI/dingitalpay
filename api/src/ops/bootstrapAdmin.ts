import { createHash, randomBytes } from "node:crypto";
import { chmodSync, writeFileSync } from "node:fs";
import bcrypt from "bcryptjs";
import { loadEnv } from "../env.js";
import { createPool } from "../db.js";

function argValue(name: string): string | null {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return null;
  return String(process.argv[idx + 1] || "").trim() || null;
}

function isValidEmail(email: string): boolean {
  const v = email.trim();
  if (!v.includes("@")) return false;
  if (v.length < 6 || v.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function safeBaseDomainFromHost(host: string): string {
  const h = host.trim().toLowerCase().replace(/^www\./, "");
  if (!h) return "plataforma.local";
  const parts = h.split(".").filter(Boolean);
  if (parts.length >= 2) return parts.slice(1).join(".");
  return h;
}

function pickDefaultEmail(envPublicBaseUrl: string): string {
  try {
    const host = new URL(envPublicBaseUrl).hostname;
    const base = safeBaseDomainFromHost(host);
    return `admin@${base}`;
  } catch {
    return "admin@plataforma.local";
  }
}

function genPassword(): string {
  // Human-friendly (copy/paste) and strong enough.
  return randomBytes(12).toString("hex");
}

function hashPasswordForLog(password: string): string {
  // Avoid leaking the full password in logs if someone pipes/greps.
  return createHash("sha256").update(password).digest("hex").slice(0, 12);
}

async function main() {
  const env = loadEnv();
  const emailArg = argValue("--email");
  const passwordArg = argValue("--password");
  const nameArg = argValue("--name");
  const outFileArg = argValue("--out-file");

  const email = (emailArg || pickDefaultEmail(env.PUBLIC_BASE_URL)).trim().toLowerCase();
  if (!isValidEmail(email)) {
    console.error(`ERRO: email inválido: ${email}`);
    process.exit(2);
  }

  const password = (passwordArg || genPassword()).trim();
  if (password.length < 10) {
    console.error("ERRO: senha muito curta (mín. 10 caracteres).");
    process.exit(2);
  }

  const displayName = (nameArg || "Admin").trim().slice(0, 80) || "Admin";
  const outFile = String(outFileArg || process.env.ADMIN_CREDENTIALS_FILE || "/data/config/admin-credentials.txt").trim();

  const db = createPool({
    connectionString: env.DATABASE_URL,
    host: env.PGHOST,
    port: env.PGPORT,
    user: env.PGUSER,
    password: env.PGPASSWORD,
    database: env.PGDATABASE,
  });

  try {
    const existingAdmin = await db.query<{ user_id: string; email: string }>(
      `select u.id as user_id, u.email
       from public.user_roles r
       join public.users u on u.id = r.user_id
       where r.role = 'admin'
       limit 1`
    );
    if (existingAdmin.rows[0]) {
      const existingEmail = String(existingAdmin.rows[0].email || "").trim().toLowerCase();
      try {
        writeFileSync(
          outFile,
          `email=${existingEmail}\npassword=\npassword_status=existing_admin_not_reset\n`,
          { encoding: "utf8", mode: 0o600 }
        );
        chmodSync(outFile, 0o600);
      } catch {
        // best-effort; do not fail bootstrap if filesystem is read-only
      }

      console.log(`OK: admin já existe (${existingEmail}).`);
      console.log(`ADMIN_EMAIL=${existingEmail}`);
      console.log("ADMIN_ALREADY_EXISTS=true");
      console.log("ADMIN_PASSWORD_UNCHANGED=true");
      console.log(`ADMIN_CREDENTIALS_FILE=${outFile}`);
      console.log("ATENCAO: o instalador não redefiniu a senha do admin existente.");
      console.log("OK");
      return;
    }

    const existingEmail = await db.query<{ id: string }>("select id from public.users where lower(email)=lower($1) limit 1", [email]);
    if (existingEmail.rows[0]) {
      console.error(`ERRO: já existe usuário com este email (${email}). Escolha outro email para o admin.`);
      process.exit(3);
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const rawMeta: any = { name: displayName, role: "admin" };

    const inserted = await db.query<{ id: string }>(
      "insert into public.users(email, password_hash, email_verified, raw_user_meta_data) values ($1, $2, true, $3) returning id",
      [email, passwordHash, JSON.stringify(rawMeta)]
    );
    const userId = inserted.rows[0]!.id;

    await db.query(
      "insert into public.profiles(user_id, name) values ($1, $2) on conflict (user_id) do update set name = excluded.name",
      [userId, displayName]
    );
    await db.query("insert into public.user_roles(user_id, role) values ($1, 'admin') on conflict do nothing", [userId]);

    try {
      writeFileSync(outFile, `email=${email}\npassword=${password}\n`, { encoding: "utf8", mode: 0o600 });
      chmodSync(outFile, 0o600);
    } catch {
      // best-effort; do not fail bootstrap if filesystem is read-only
    }

    console.log("✅ Admin criado para esta instância:");
    console.log(`ADMIN_EMAIL=${email}`);
    console.log(`ADMIN_PASSWORD=${password}`);
    console.log(`ADMIN_PASSWORD_SHA256_12=${hashPasswordForLog(password)}`);
    console.log(`ADMIN_CREDENTIALS_FILE=${outFile}`);
    console.log("Recomendado: faça login e altere a senha imediatamente.");
    console.log("OK");
  } finally {
    await db.end().catch(() => {});
  }
}

main().catch((err) => {
  console.error("ERRO: falha ao criar admin.");
  console.error(String(err?.message || err));
  process.exit(1);
});
