import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "./db.js";
import { requireAuth } from "./auth.js";

async function ensureSellerAccess(req: any, reply: any) {
  requireAuth(req, reply);
  if (req.auth.role !== "seller") {
    reply.code(403).send({ error: { code: "AUTH_FORBIDDEN", message: "Forbidden" } });
    throw new Error("Forbidden");
  }
}

export async function registerSellerDashboardRoutes(api: FastifyInstance, db: Db) {
  api.get("/seller/dashboard/summary", async (req, reply) => {
    await ensureSellerAccess(req, reply);
    const auth = req.auth!;
    const sellerId = String(auth.user.id || "").trim();
    const { days } = z.object({
      days: z.coerce.number().int().min(1).max(30).default(7),
    }).parse(req.query ?? {});
    const periodDays = days;
    const dayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
    const useHourlyChart = periodDays === 1;

    const [metricsRes, totalRevenueRes, rewardsRes, claimsRes, chartRes, paymentBreakdownRes] = await Promise.all([
      db.query<{
        revenue: string | number | null;
        approved_sales: string | number | null;
        pending_orders: string | number | null;
        total_orders: string | number | null;
      }>(
        `
          with bounds as (
            select date_trunc('day', timezone('America/Sao_Paulo', now())) - (($2::int - 1) * interval '1 day') as start_local
          )
          select
            coalesce(sum(amount) filter (where status = 'approved'), 0)::text as revenue,
            count(*) filter (where status = 'approved')::text as approved_sales,
            count(*) filter (where status = 'pending')::text as pending_orders,
            count(*)::text as total_orders
          from public.orders
          cross join bounds
          where seller_id = $1
            and timezone('America/Sao_Paulo', created_at) >= bounds.start_local
        `,
        [sellerId, periodDays]
      ),
      db.query<{ total_revenue: string | number | null }>(
        `
          select
            coalesce(sum(amount) filter (where status = 'approved'), 0)::text as total_revenue
          from public.orders
          where seller_id = $1
        `,
        [sellerId]
      ),
      db.query<any>(
        `
          select
            id,
            name,
            description,
            image_url,
            min_revenue,
            max_revenue,
            type,
            delivery_instructions,
            status
          from public.rewards
          where status = 'active'
          order by min_revenue asc
        `
      ),
      db.query<any>(
        `
          select
            id,
            reward_id,
            status,
            claimed_at,
            sent_at
          from public.reward_claims
          where seller_id = $1
          order by claimed_at desc
        `,
        [sellerId]
      ),
      useHourlyChart
        ? db.query<{ bucket_key: string; hour_of_day: number; total: string | number | null }>(
            `
              with bounds as (
                select
                  date_trunc('day', timezone('America/Sao_Paulo', now())) as start_local,
                  date_trunc('hour', timezone('America/Sao_Paulo', now())) as end_local
              ),
              series as (
                select generate_series(bounds.start_local, bounds.end_local, interval '1 hour') as hour_local
                from bounds
              ),
              agg as (
                select
                  date_trunc('hour', timezone('America/Sao_Paulo', created_at)) as hour_local,
                  coalesce(sum(amount), 0)::numeric as total
                from public.orders
                cross join bounds
                where seller_id = $1
                  and status = 'approved'
                  and timezone('America/Sao_Paulo', created_at) >= bounds.start_local
                group by 1
              )
              select
                to_char(series.hour_local, 'YYYY-MM-DD HH24:00') as bucket_key,
                extract(hour from series.hour_local)::int as hour_of_day,
                coalesce(agg.total, 0)::text as total
              from series
              left join agg using (hour_local)
              order by series.hour_local asc
            `,
            [sellerId]
          )
        : db.query<{ bucket_key: string; dow: number; total: string | number | null }>(
            `
              with bounds as (
                select
                  date_trunc('day', timezone('America/Sao_Paulo', now())) - (($2::int - 1) * interval '1 day') as start_local,
                  date_trunc('day', timezone('America/Sao_Paulo', now())) as end_local
              ),
              series as (
                select generate_series(bounds.start_local, bounds.end_local, interval '1 day') as day_local
                from bounds
              ),
              agg as (
                select
                  date_trunc('day', timezone('America/Sao_Paulo', created_at)) as day_local,
                  coalesce(sum(amount), 0)::numeric as total
                from public.orders
                cross join bounds
                where seller_id = $1
                  and status = 'approved'
                  and timezone('America/Sao_Paulo', created_at) >= bounds.start_local
                group by 1
              )
              select
                to_char(series.day_local, 'YYYY-MM-DD') as bucket_key,
                extract(dow from series.day_local)::int as dow,
                coalesce(agg.total, 0)::text as total
              from series
              left join agg using (day_local)
              order by series.day_local asc
            `,
            [sellerId, periodDays]
          ),
      db.query<{
        method: string | null;
        approved_count: string | number | null;
        total_count: string | number | null;
        approved_total: string | number | null;
      }>(
        `
          with bounds as (
            select date_trunc('day', timezone('America/Sao_Paulo', now())) - (($2::int - 1) * interval '1 day') as start_local
          )
          select
            method,
            count(*) filter (where status = 'approved')::text as approved_count,
            count(*)::text as total_count,
            coalesce(sum(amount) filter (where status = 'approved'), 0)::text as approved_total
          from public.orders
          cross join bounds
          where seller_id = $1
            and timezone('America/Sao_Paulo', created_at) >= bounds.start_local
          group by method
        `,
        [sellerId, periodDays]
      ),
    ]);

    const metricsRow = metricsRes.rows[0] || {
      revenue: "0",
      approved_sales: "0",
      pending_orders: "0",
      total_orders: "0",
    };
    const revenue = Number(metricsRow.revenue || 0);
    const approvedSales = Number(metricsRow.approved_sales || 0);
    const pendingOrders = Number(metricsRow.pending_orders || 0);
    const totalOrders = Number(metricsRow.total_orders || 0);
    const totalRevenueRow = totalRevenueRes.rows[0] || { total_revenue: "0" };
    const totalRevenue = Number(totalRevenueRow.total_revenue || 0);

    const rewards = (rewardsRes.rows || []).map((reward: any) => ({
      id: reward.id,
      name: reward.name,
      description: reward.description,
      imageUrl: reward.image_url,
      minRevenue: Number(reward.min_revenue || 0),
      maxRevenue: Number(reward.max_revenue || 0),
      type: reward.type,
      deliveryInstructions: reward.delivery_instructions ?? undefined,
      status: reward.status,
    }));

    const rewardClaims = (claimsRes.rows || []).map((claim: any) => ({
      id: claim.id,
      rewardId: claim.reward_id,
      status: claim.status === "sent" ? "sent" : "pending",
      claimedAt: claim.claimed_at,
      sentAt: claim.sent_at,
    }));
    const chartData = useHourlyChart
      ? (chartRes.rows || []).map((row: any) => ({
          name: `${String(Number(row.hour_of_day || 0)).padStart(2, "0")}h`,
          value: Number(row.total || 0),
          dateKey: String(row.bucket_key || ""),
        }))
      : (chartRes.rows || []).map((row: any) => ({
          name: dayNames[Number(row.dow || 0)] || "",
          value: Number(row.total || 0),
          dateKey: String(row.bucket_key || ""),
        }));
    const methodLabels: Record<string, string> = {
      pix: "Pix",
      credit_card: "Cartão",
      boleto: "Boleto",
    };
    const paymentBreakdownMap = new Map(
      (paymentBreakdownRes.rows || []).map((row) => [
        String(row.method || "").trim().toLowerCase(),
        row,
      ])
    );
    const paymentBreakdown = ["pix", "credit_card", "boleto"].map((method) => {
      const row = paymentBreakdownMap.get(method);
      const approvedCount = Number(row?.approved_count || 0);
      const totalCount = Number(row?.total_count || 0);
      const total = Number(row?.approved_total || 0);

      return {
        method,
        label: methodLabels[method] || method,
        count: approvedCount,
        total,
        conversionRate: totalCount > 0 ? (approvedCount / totalCount) * 100 : 0,
      };
    });

    return reply.send({
      data: {
        metrics: {
          revenue,
          approvedSales,
          totalOrders,
          conversionRate: approvedSales + pendingOrders > 0 ? (approvedSales / (approvedSales + pendingOrders)) * 100 : 0,
        },
        rewardProgress: {
          currentRevenue: totalRevenue,
          rewards,
        },
        rewardClaims,
        chartData,
        paymentBreakdown,
      },
      error: null,
    });
  });

  api.get("/seller/dashboard/recent-sales", async (req, reply) => {
    await ensureSellerAccess(req, reply);
    const sellerId = String(req.auth!.user.id || "").trim();

    const res = await db.query<any>(
      `
        select
          buyer_name,
          product_name,
          amount,
          method,
          status,
          created_at
        from public.orders
        where seller_id = $1
        order by created_at desc
        limit 10
      `,
      [sellerId]
    );

    return reply.send({
      data: (res.rows || []).map((row: any) => ({
        buyer: row.buyer_name,
        product: row.product_name,
        amount: Number(row.amount || 0),
        method: row.method,
        status: row.status,
        created_at: row.created_at,
      })),
    });
  });

  api.post("/seller/dashboard/rewards/:rewardId/claim", async (req, reply) => {
    await ensureSellerAccess(req, reply);
    const sellerId = String(req.auth!.user.id || "").trim();
    const { rewardId } = z.object({ rewardId: z.string().uuid() }).parse(req.params);

    const [rewardRes, revenueRes, existingClaimRes] = await Promise.all([
      db.query<any>(
        `
          select id, name, type, status, max_revenue
          from public.rewards
          where id = $1
          limit 1
        `,
        [rewardId]
      ),
      db.query<{ total_revenue: string | number | null }>(
        `
          select coalesce(sum(amount) filter (where status = 'approved'), 0)::text as total_revenue
          from public.orders
          where seller_id = $1
        `,
        [sellerId]
      ),
      db.query<any>(
        `
          select id
          from public.reward_claims
          where reward_id = $1
            and seller_id = $2
          limit 1
        `,
        [rewardId, sellerId]
      ),
    ]);

    const reward = rewardRes.rows[0];
    if (!reward || reward.status !== "active") {
      return reply.code(404).send({ error: { code: "REWARD_NOT_FOUND", message: "Recompensa não encontrada." } });
    }

    if (String(reward.type || "") !== "delivery") {
      return reply.code(400).send({ error: { code: "REWARD_NOT_CLAIMABLE", message: "Esta recompensa não requer resgate manual." } });
    }

    if (existingClaimRes.rows[0]) {
      return reply.code(409).send({ error: { code: "REWARD_ALREADY_CLAIMED", message: "Esta recompensa já foi resgatada." } });
    }

    const currentRevenue = Number(revenueRes.rows[0]?.total_revenue || 0);
    const requiredRevenue = Number(reward.max_revenue || 0);
    if (currentRevenue < requiredRevenue) {
      return reply.code(403).send({ error: { code: "REWARD_NOT_UNLOCKED", message: "Meta ainda não atingida." } });
    }

    const insertRes = await db.query<any>(
      `
        insert into public.reward_claims(reward_id, seller_id, revenue_achieved)
        values ($1, $2, $3)
        returning id, reward_id, seller_id, status, revenue_achieved, claimed_at, sent_at
      `,
      [rewardId, sellerId, currentRevenue]
    );

    return reply.code(201).send({ data: insertRes.rows[0] ?? null });
  });
}
