import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "./db.js";
import { requireAdmin, requireAuth } from "./auth.js";
import { enqueueTemplatedEmail } from "./emailQueue.js";

type FinanceChartPeriod = "today" | "yesterday" | "7d" | "30d" | "6m" | "year";

const withdrawalCreateSchema = z.object({
  seller_id: z.string().uuid().optional(),
  amount: z.number().positive(),
  method: z.enum(["PIX", "TED"]),
  bank_info: z.object({
    type: z.enum(["PIX", "TED"]).optional(),
    pixKey: z.string().optional(),
    bankName: z.string().optional(),
    agency: z.string().optional(),
    account: z.string().optional(),
    holder: z.string().optional(),
  }),
});

const withdrawalStatusSchema = z.object({
  status: z.enum(["pending", "in_review", "approved", "rejected"]),
  note: z.string().trim().optional(),
  reason: z.string().trim().optional(),
});

async function ensureAdmin(db: Db, req: any, reply: any) {
  await requireAdmin(db, req, reply);
}

async function ensureSeller(req: any, reply: any) {
  requireAuth(req, reply);
  if (req.auth?.role !== "seller") {
    reply.code(403).send({ error: { code: "AUTH_FORBIDDEN", message: "Forbidden" } });
    throw new Error("Forbidden");
  }
}

async function getApprovedOrderIds(db: Db, orderIds: string[]): Promise<Set<string>> {
  if (!orderIds.length) return new Set();
  const res = await db.query<{ id: string }>(
    "select id from public.orders where id = any($1::uuid[]) and status = 'approved'",
    [orderIds]
  );
  return new Set(res.rows.map((row) => row.id));
}

async function getApprovedWithdrawalIds(db: Db, withdrawalIds: string[]): Promise<Set<string>> {
  if (!withdrawalIds.length) return new Set();
  const res = await db.query<{ id: string }>(
    "select id from public.withdrawals where id = any($1::uuid[]) and status = 'approved'",
    [withdrawalIds]
  );
  return new Set(res.rows.map((row) => row.id));
}

async function listApprovedFeeLogs(db: Db) {
  const res = await db.query<any>(
    "select * from public.platform_fee_logs order by created_at desc limit 500"
  );
  const rows = res.rows || [];
  const approvedOrderIds = await getApprovedOrderIds(
    db,
    rows.filter((row: any) => row.type === "transaction" && row.order_id).map((row: any) => row.order_id)
  );
  const approvedWithdrawalIds = await getApprovedWithdrawalIds(
    db,
    rows.filter((row: any) => row.type === "withdrawal" && row.withdrawal_id).map((row: any) => row.withdrawal_id)
  );
  return rows.filter((row: any) => {
    if (row.type === "transaction") return row.order_id ? approvedOrderIds.has(row.order_id) : false;
    if (row.type === "withdrawal") return row.withdrawal_id ? approvedWithdrawalIds.has(row.withdrawal_id) : false;
    return false;
  });
}

function bucketLabel(date: Date, period: FinanceChartPeriod) {
  const fmt = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" });
  if (period === "today" || period === "yesterday") {
    return `${String(Number(new Intl.DateTimeFormat("en-US", { hour: "2-digit", hour12: false, timeZone: "America/Sao_Paulo" }).format(date))).padStart(2, "0")}h`;
  }
  if (period === "7d" || period === "30d") {
    const parts = fmt.format(date).split("/");
    return `${parts[0]}/${parts[1]}`;
  }
  if (period === "6m") {
    return new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "America/Sao_Paulo" }).format(date).replace(".", "");
  }
  return new Intl.DateTimeFormat("pt-BR", { year: "numeric", timeZone: "America/Sao_Paulo" }).format(date);
}

export async function registerFinanceWithdrawalRoutes(api: FastifyInstance, db: Db) {
  api.get("/admin/finances/fees", async (req, reply) => {
    await ensureAdmin(db, req, reply);
    const res = await db.query<any>("select id, method, fee_percent, fee_fixed from public.platform_fees order by method asc");
    return reply.send({ data: res.rows });
  });

  api.put("/admin/finances/fees/:id", async (req, reply) => {
    await ensureAdmin(db, req, reply);
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z.object({ feePercent: z.number().min(0), feeFixed: z.number().min(0) }).parse(req.body ?? {});
    await db.query(
      "update public.platform_fees set fee_percent = $2, fee_fixed = $3, updated_at = now() where id = $1",
      [id, body.feePercent, body.feeFixed]
    );
    return reply.send({ data: { ok: true } });
  });

  api.get("/admin/finances/summary", async (req, reply) => {
    await ensureAdmin(db, req, reply);
    const logs = await listApprovedFeeLogs(db);
    const summary = {
      totalFees: 0,
      transactionFees: 0,
      withdrawalFees: 0,
      totalCount: logs.length,
      byMethod: { pix: 0, credit_card: 0, boleto: 0 } as Record<string, number>,
      monthlyData: [] as Array<{ name: string; value: number }>,
    };
    const monthMap: Record<string, number> = {};
    logs.forEach((row: any) => {
      const fee = Number(row.fee_amount || 0);
      summary.totalFees += fee;
      if (row.type === "transaction") summary.transactionFees += fee;
      if (row.type === "withdrawal") summary.withdrawalFees += fee;
      summary.byMethod[row.method] = (summary.byMethod[row.method] || 0) + fee;
      const date = new Date(row.created_at);
      const month = new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "America/Sao_Paulo" }).format(date).replace(".", "");
      monthMap[month] = (monthMap[month] || 0) + fee;
    });
    summary.monthlyData = Object.entries(monthMap).map(([name, value]) => ({ name, value }));
    return reply.send({ data: summary });
  });

  api.get("/admin/finances/chart", async (req, reply) => {
    await ensureAdmin(db, req, reply);
    const { period } = z.object({
      period: z.enum(["today", "yesterday", "7d", "30d", "6m", "year"]).default("year"),
    }).parse(req.query ?? {}) as { period: FinanceChartPeriod };
    const logs = await listApprovedFeeLogs(db);
    const now = new Date();
    let from = new Date(now);
    if (period === "today") from.setHours(0, 0, 0, 0);
    if (period === "yesterday") {
      from.setDate(from.getDate() - 1);
      from.setHours(0, 0, 0, 0);
    }
    if (period === "7d") {
      from.setDate(from.getDate() - 6);
      from.setHours(0, 0, 0, 0);
    }
    if (period === "30d") {
      from.setDate(from.getDate() - 29);
      from.setHours(0, 0, 0, 0);
    }
    if (period === "6m") {
      from = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    }
    if (period === "year") {
      from = new Date(now.getFullYear() - 4, 0, 1);
    }

    const filtered = logs.filter((row: any) => new Date(row.created_at) >= from);
    const grouped: Record<string, number> = {};
    filtered.forEach((row: any) => {
      const label = bucketLabel(new Date(row.created_at), period);
      grouped[label] = (grouped[label] || 0) + Number(row.fee_amount || 0);
    });
    return reply.send({
      data: Object.entries(grouped).map(([name, value]) => ({ name, value })),
    });
  });

  api.get("/admin/finances/logs", async (req, reply) => {
    await ensureAdmin(db, req, reply);
    const logs = await listApprovedFeeLogs(db);
    const sellerIds = Array.from(new Set(logs.map((row: any) => row.seller_id).filter(Boolean)));
    const profilesRes = sellerIds.length
      ? await db.query<any>("select user_id, name from public.profiles where user_id = any($1::uuid[])", [sellerIds])
      : { rows: [] };
    const nameMap = new Map<string, string>((profilesRes.rows || []).map((row: any) => [row.user_id, row.name || "Sem nome"]));
    return reply.send({
      data: logs.map((row: any) => ({
        id: row.id,
        order_id: row.order_id,
        withdrawal_id: row.withdrawal_id,
        seller_id: row.seller_id,
        seller_name: nameMap.get(row.seller_id) || "Desconhecido",
        type: row.type,
        method: row.method,
        gross_amount: Number(row.gross_amount || 0),
        fee_amount: Number(row.fee_amount || 0),
        created_at: row.created_at,
      })),
    });
  });

  api.get("/seller/withdrawals", async (req, reply) => {
    await ensureSeller(req, reply);
    const sellerId = String(req.auth!.user.id);
    const withdrawalsRes = await db.query<any>(
      "select * from public.withdrawals where seller_id = $1 order by requested_at desc",
      [sellerId]
    );
    const withdrawals = withdrawalsRes.rows || [];
    const ids = withdrawals.map((row: any) => row.id);
    const historyRes = ids.length
      ? await db.query<any>(
          "select * from public.withdrawal_status_history where withdrawal_id = any($1::uuid[]) order by created_at asc",
          [ids]
        )
      : { rows: [] };
    const historyMap = new Map<string, any[]>();
    (historyRes.rows || []).forEach((row: any) => {
      const list = historyMap.get(row.withdrawal_id) || [];
      list.push(row);
      historyMap.set(row.withdrawal_id, list);
    });
    return reply.send({
      data: withdrawals.map((row: any) => ({
        ...row,
        statusHistory: historyMap.get(row.id) || [],
      })),
    });
  });

  api.get("/seller/withdrawals/metrics", async (req, reply) => {
    await ensureSeller(req, reply);
    const sellerId = String(req.auth!.user.id);
    const [ordersRes, withdrawalsRes] = await Promise.all([
      db.query<any>("select amount from public.orders where seller_id = $1 and status = 'approved'", [sellerId]),
      db.query<any>("select amount, net_amount, status, processed_at, requested_at from public.withdrawals where seller_id = $1 order by requested_at desc", [sellerId]),
    ]);
    const withdrawals = withdrawalsRes.rows || [];
    const totalRevenue = (ordersRes.rows || []).reduce((sum: number, row: any) => sum + Number(row.amount || 0), 0);
    const totalWithdrawn = withdrawals.filter((w: any) => w.status === "approved").reduce((sum: number, w: any) => sum + Number(w.net_amount || 0), 0);
    const pendingGross = withdrawals.filter((w: any) => w.status === "pending" || w.status === "in_review").reduce((sum: number, w: any) => sum + Number(w.amount || 0), 0);
    const pendingNet = withdrawals.filter((w: any) => w.status === "pending" || w.status === "in_review").reduce((sum: number, w: any) => sum + Number(w.net_amount || 0), 0);
    const totalWithdrawnGross = withdrawals.filter((w: any) => w.status === "approved").reduce((sum: number, w: any) => sum + Number(w.amount || 0), 0);
    const lastApproved = withdrawals.find((w: any) => w.status === "approved") || null;
    return reply.send({
      data: {
        availableBalance: Math.max(0, totalRevenue - totalWithdrawnGross - pendingGross),
        pending: pendingNet,
        totalWithdrawn,
        lastWithdrawal: lastApproved ? Number(lastApproved.net_amount || 0) : null,
        lastWithdrawalDate: lastApproved?.processed_at || lastApproved?.requested_at || null,
      },
    });
  });

  api.post("/seller/withdrawals", async (req, reply) => {
    await ensureSeller(req, reply);
    const sellerId = String(req.auth!.user.id);
    const body = withdrawalCreateSchema.parse(req.body ?? {});
    const settingsRes = await db.query<any>(
      "select withdrawal_fee_type, withdrawal_fee_percent from public.platform_settings order by created_at asc limit 1"
    );
    const settings = settingsRes.rows[0] || {};
    const feeType = settings.withdrawal_fee_type || "percent";
    const feeRate = Number(settings.withdrawal_fee_percent || 0);
    const feeAmount = feeType === "percent" ? (body.amount * feeRate / 100) : feeRate;
    const netAmount = Math.max(body.amount - feeAmount, 0);
    const insertRes = await db.query<any>(
      `
        insert into public.withdrawals(seller_id, amount, fee_amount, net_amount, method, status, bank_info)
        values ($1,$2,$3,$4,$5,'pending',$6::jsonb)
        returning *
      `,
      [sellerId, body.amount, feeAmount, netAmount, body.method, JSON.stringify(body.bank_info || {})]
    );
    const withdrawal = insertRes.rows[0];
    await db.query(
      "insert into public.withdrawal_status_history(withdrawal_id, status, note) values ($1, 'pending', 'Solicitação recebida')",
      [withdrawal.id]
    );
    return reply.send({ data: withdrawal });
  });

  api.get("/admin/withdrawals", async (req, reply) => {
    await ensureAdmin(db, req, reply);
    const withdrawalsRes = await db.query<any>("select * from public.withdrawals order by requested_at desc");
    const withdrawals = withdrawalsRes.rows || [];
    const ids = withdrawals.map((row: any) => row.id);
    const sellerIds = Array.from(new Set(withdrawals.map((row: any) => row.seller_id).filter(Boolean)));
    const [historyRes, profilesRes, usersRes] = await Promise.all([
      ids.length
        ? db.query<any>("select * from public.withdrawal_status_history where withdrawal_id = any($1::uuid[]) order by created_at asc", [ids])
        : Promise.resolve({ rows: [] }),
      sellerIds.length
        ? db.query<any>("select user_id, name from public.profiles where user_id = any($1::uuid[])", [sellerIds])
        : Promise.resolve({ rows: [] }),
      sellerIds.length
        ? db.query<any>("select id, email from public.users where id = any($1::uuid[])", [sellerIds])
        : Promise.resolve({ rows: [] }),
    ]);
    const historyMap = new Map<string, any[]>();
    (historyRes.rows || []).forEach((row: any) => {
      const list = historyMap.get(row.withdrawal_id) || [];
      list.push(row);
      historyMap.set(row.withdrawal_id, list);
    });
    const profileMap = new Map<string, string>((profilesRes.rows || []).map((row: any) => [row.user_id, row.name || "Vendedor"]));
    const emailMap = new Map<string, string>((usersRes.rows || []).map((row: any) => [row.id, row.email || ""]));
    return reply.send({
      data: withdrawals.map((row: any) => ({
        ...row,
        statusHistory: historyMap.get(row.id) || [],
        sellerName: profileMap.get(row.seller_id) || "Vendedor",
        sellerEmail: emailMap.get(row.seller_id) || "",
      })),
    });
  });

  api.post("/admin/withdrawals/:id/status", async (req, reply) => {
    await ensureAdmin(db, req, reply);
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = withdrawalStatusSchema.parse(req.body ?? {});
    const prevRes = await db.query<any>("select * from public.withdrawals where id = $1 limit 1", [id]);
    const prev = prevRes.rows[0];
    if (!prev) {
      return reply.code(404).send({ error: { code: "WITHDRAWAL_NOT_FOUND", message: "Not found" } });
    }

    const updates: Record<string, any> = { status: body.status };
    if (body.status === "approved" || body.status === "rejected") updates.processed_at = new Date().toISOString();
    if (body.status === "rejected" && body.reason) updates.rejection_reason = body.reason;
    await db.query(
      `
        update public.withdrawals
        set status = $2,
            processed_at = $3,
            rejection_reason = $4,
            updated_at = now()
        where id = $1
      `,
      [id, updates.status, updates.processed_at || null, updates.rejection_reason || prev.rejection_reason || null]
    );
    await db.query(
      "insert into public.withdrawal_status_history(withdrawal_id, status, note) values ($1, $2, $3)",
      [id, body.status, body.note || ""]
    );

    if (body.status === "approved" && Number(prev.fee_amount || 0) > 0) {
      await db.query(
        `
          insert into public.platform_fee_logs(seller_id, withdrawal_id, type, method, gross_amount, fee_amount)
          values ($1,$2,'withdrawal',$3,$4,$5)
        `,
        [prev.seller_id, prev.id, prev.method, prev.amount, prev.fee_amount]
      );
    }

    if (prev.status !== body.status && (body.status === "approved" || body.status === "rejected")) {
      const sellerRes = await db.query<any>(
        "select u.email, coalesce(p.name,'') as name from public.users u left join public.profiles p on p.user_id = u.id where u.id = $1 limit 1",
        [prev.seller_id]
      );
      const seller = sellerRes.rows[0];
      if (seller?.email) {
        await enqueueTemplatedEmail(db, {
          to: String(seller.email),
          eventKey: body.status === "approved" ? "withdrawal_approved" : "withdrawal_rejected",
          dedupeKey: `withdrawal:${body.status}:${id}:${seller.email}`,
          vars: {
            seller_name: String(seller.name || "").trim() || "Vendedor",
            amount: String(prev.net_amount ?? ""),
            reason: String(body.reason || prev.rejection_reason || ""),
          },
        }).catch(() => {});
      }
    }

    return reply.send({ data: { ok: true } });
  });
}
