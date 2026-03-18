import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "./db.js";
import { withClient } from "./db.js";
import { requireAuth } from "./auth.js";

async function ensureSellerAccess(req: any, reply: any) {
  requireAuth(req, reply);
  if (req.auth.role !== "seller") {
    reply.code(403).send({ error: { code: "AUTH_FORBIDDEN", message: "Forbidden" } });
    throw new Error("Forbidden");
  }
}

const salesOverviewQuerySchema = z.object({
  search: z.string().trim().max(200).optional().default(""),
  status: z.enum(["all", "approved", "pending", "refunded", "chargeback", "abandoned"]).default("all"),
  method: z.enum(["all", "pix", "boleto", "credit_card"]).default("all"),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

type SalesOverviewQuery = z.infer<typeof salesOverviewQuerySchema>;

function normalizeDateRange(from?: string, to?: string): { from: string | null; to: string | null } {
  if (!from && !to) return { from: null, to: null };
  if (from && !to) return { from, to: from };
  if (!from && to) return { from: to, to };
  if (!from || !to) return { from: null, to: null };
  return from <= to ? { from, to } : { from: to, to: from };
}

export async function registerSellerSalesRoutes(api: FastifyInstance, db: Db) {
  api.get("/seller/sales/overview", async (req, reply) => {
    await ensureSellerAccess(req, reply);
    const auth = req.auth!;
    const sellerId = String(auth.user.id || "").trim();
    const parsed = salesOverviewQuerySchema.parse(req.query ?? {}) as SalesOverviewQuery;
    const search = parsed.search.trim();
    const dateRange = normalizeDateRange(parsed.from, parsed.to);

    const params = [
      sellerId,
      parsed.status,
      parsed.method,
      search,
      dateRange.from,
      dateRange.to,
    ];

    const metricsSql = `
      with filtered_orders as (
        select
          id,
          amount,
          status
        from public.orders
        where seller_id = $1
          and ($2::text = 'all' or status::text = $2::text)
          and ($3::text = 'all' or method::text = $3::text)
          and (
            $4::text = ''
            or buyer_name ilike '%' || $4::text || '%'
            or buyer_email ilike '%' || $4::text || '%'
            or buyer_phone ilike '%' || $4::text || '%'
            or buyer_cpf ilike '%' || $4::text || '%'
            or product_name ilike '%' || $4::text || '%'
            or transaction_id ilike '%' || $4::text || '%'
            or id::text ilike '%' || $4::text || '%'
          )
          and ($5::date is null or timezone('America/Sao_Paulo', created_at)::date >= $5::date)
          and ($6::date is null or timezone('America/Sao_Paulo', created_at)::date <= $6::date)
      )
      select
        coalesce(sum(amount) filter (where status = 'approved'), 0)::text as total_revenue,
        count(*)::text as total_count,
        count(*) filter (where status = 'approved')::text as approved_count,
        count(*) filter (where status = 'pending')::text as pending_count,
        count(*) filter (where status = 'refunded')::text as refunded_count,
        count(*) filter (where status = 'chargeback')::text as chargeback_count
      from filtered_orders
    `;

    const ordersSql = `
      select
        id,
        seller_id,
        product_id,
        buyer_email,
        buyer_name,
        buyer_phone,
        buyer_cpf,
        product_name,
        amount,
        gross_amount,
        platform_fee,
        method,
        status,
        transaction_id,
        utm,
        created_at,
        updated_at
      from public.orders
      where seller_id = $1
        and ($2::text = 'all' or status::text = $2::text)
        and ($3::text = 'all' or method::text = $3::text)
        and (
          $4::text = ''
          or buyer_name ilike '%' || $4::text || '%'
          or buyer_email ilike '%' || $4::text || '%'
          or buyer_phone ilike '%' || $4::text || '%'
          or buyer_cpf ilike '%' || $4::text || '%'
          or product_name ilike '%' || $4::text || '%'
          or transaction_id ilike '%' || $4::text || '%'
          or id::text ilike '%' || $4::text || '%'
        )
        and ($5::date is null or timezone('America/Sao_Paulo', created_at)::date >= $5::date)
        and ($6::date is null or timezone('America/Sao_Paulo', created_at)::date <= $6::date)
      order by created_at desc
    `;

    const result = await withClient(db, async (client) => {
      await client.query("begin");
      await client.query("set local transaction read only");
      await client.query("set local transaction isolation level repeatable read");
      try {
        const [metricsRes, ordersRes] = await Promise.all([
          client.query<{
            total_revenue: string | number | null;
            total_count: string | number | null;
            approved_count: string | number | null;
            pending_count: string | number | null;
            refunded_count: string | number | null;
            chargeback_count: string | number | null;
          }>(metricsSql, params),
          client.query<any>(ordersSql, params),
        ]);
        await client.query("commit");
        return { metricsRes, ordersRes };
      } catch (error) {
        await client.query("rollback");
        throw error;
      }
    });

    const metricsRow = result.metricsRes.rows[0] || {
      total_revenue: "0",
      total_count: "0",
      approved_count: "0",
      pending_count: "0",
      refunded_count: "0",
      chargeback_count: "0",
    };

    const totalCount = Number(metricsRow.total_count || 0);
    const approvedCount = Number(metricsRow.approved_count || 0);
    const pendingCount = Number(metricsRow.pending_count || 0);

    return reply.send({
      data: {
        filters: {
          search,
          status: parsed.status,
          method: parsed.method,
          from: dateRange.from,
          to: dateRange.to,
        },
        metrics: {
          totalRevenue: Number(metricsRow.total_revenue || 0),
          totalCount,
          approvedCount,
          pendingCount,
          refundedCount: Number(metricsRow.refunded_count || 0),
          chargebackCount: Number(metricsRow.chargeback_count || 0),
          conversionRate: approvedCount + pendingCount > 0 ? (approvedCount / (approvedCount + pendingCount)) * 100 : 0,
        },
        orders: result.ordersRes.rows || [],
      },
      error: null,
    });
  });
}
