import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "./db.js";
import { requireAuth } from "./auth.js";
import { withClient } from "./db.js";

async function ensureAdminAccess(req: any, reply: any) {
  requireAuth(req, reply);
  if (req.auth.role !== "admin") {
    reply.code(403).send({ error: { code: "AUTH_FORBIDDEN", message: "Forbidden" } });
    throw new Error("Forbidden");
  }
}

type DashboardPeriod = "today" | "7d" | "month" | "year";

function formatRelativeDatePtBr(value: string | Date): string {
  const when = new Date(value);
  const diffMs = Date.now() - when.getTime();
  const minutes = Math.max(0, Math.floor(diffMs / 60_000));
  if (minutes < 60) return `Há ${minutes}min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Há ${hours}h`;
  const days = Math.floor(hours / 24);
  return `Há ${days}d`;
}

function mapRoleLabel(role: string | null | undefined): string {
  if (role === "admin") return "Administrador";
  if (role === "seller") return "Vendedor";
  if (role === "buyer") return "Comprador";
  return "Comprador";
}

function periodToChartConfig(period: DashboardPeriod) {
  const monthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const dayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

  if (period === "today") {
    return {
      query: `
        with bounds as (
          select
            date_trunc('day', timezone('America/Sao_Paulo', now())) as start_local,
            date_trunc('hour', timezone('America/Sao_Paulo', now())) as end_local
        ),
        series as (
          select generate_series(bounds.start_local, bounds.end_local, interval '1 hour') as bucket_local
          from bounds
        ),
        agg as (
          select
            date_trunc('hour', timezone('America/Sao_Paulo', created_at)) as bucket_local,
            coalesce(sum(amount), 0)::numeric as total
          from public.orders
          cross join bounds
          where status = 'approved'
            and timezone('America/Sao_Paulo', created_at) >= bounds.start_local
          group by 1
        )
        select
          to_char(series.bucket_local, 'YYYY-MM-DD HH24:00') as bucket_key,
          extract(hour from series.bucket_local)::int as hour_of_day,
          coalesce(agg.total, 0)::text as total
        from series
        left join agg using (bucket_local)
        order by series.bucket_local asc
      `,
      map: (rows: Array<any>) =>
        rows.map((row) => ({
          name: `${String(Number(row.hour_of_day || 0)).padStart(2, "0")}h`,
          value: Number(row.total || 0),
        })),
    };
  }

  if (period === "7d") {
    return {
      query: `
        with bounds as (
          select
            date_trunc('day', timezone('America/Sao_Paulo', now())) - interval '6 day' as start_local,
            date_trunc('day', timezone('America/Sao_Paulo', now())) as end_local
        ),
        series as (
          select generate_series(bounds.start_local, bounds.end_local, interval '1 day') as bucket_local
          from bounds
        ),
        agg as (
          select
            date_trunc('day', timezone('America/Sao_Paulo', created_at)) as bucket_local,
            coalesce(sum(amount), 0)::numeric as total
          from public.orders
          cross join bounds
          where status = 'approved'
            and timezone('America/Sao_Paulo', created_at) >= bounds.start_local
          group by 1
        )
        select
          to_char(series.bucket_local, 'YYYY-MM-DD') as bucket_key,
          extract(dow from series.bucket_local)::int as dow,
          coalesce(agg.total, 0)::text as total
        from series
        left join agg using (bucket_local)
        order by series.bucket_local asc
      `,
      map: (rows: Array<any>) =>
        rows.map((row) => ({
          name: dayNames[Number(row.dow || 0)] || "",
          value: Number(row.total || 0),
        })),
    };
  }

  if (period === "month") {
    return {
      query: `
        with bounds as (
          select
            date_trunc('month', timezone('America/Sao_Paulo', now())) as start_local,
            date_trunc('day', timezone('America/Sao_Paulo', now())) as end_local
        ),
        series as (
          select generate_series(bounds.start_local, bounds.end_local, interval '1 day') as bucket_local
          from bounds
        ),
        agg as (
          select
            date_trunc('day', timezone('America/Sao_Paulo', created_at)) as bucket_local,
            coalesce(sum(amount), 0)::numeric as total
          from public.orders
          cross join bounds
          where status = 'approved'
            and timezone('America/Sao_Paulo', created_at) >= bounds.start_local
          group by 1
        )
        select
          to_char(series.bucket_local, 'YYYY-MM-DD') as bucket_key,
          extract(day from series.bucket_local)::int as day_of_month,
          coalesce(agg.total, 0)::text as total
        from series
        left join agg using (bucket_local)
        order by series.bucket_local asc
      `,
      map: (rows: Array<any>) =>
        rows.map((row) => ({
          name: String(Number(row.day_of_month || 0)),
          value: Number(row.total || 0),
        })),
    };
  }

  return {
    query: `
      with bounds as (
        select
          date_trunc('year', timezone('America/Sao_Paulo', now())) as start_local,
          date_trunc('month', timezone('America/Sao_Paulo', now())) as end_local
      ),
      series as (
        select generate_series(bounds.start_local, bounds.end_local, interval '1 month') as bucket_local
        from bounds
      ),
      agg as (
        select
          date_trunc('month', timezone('America/Sao_Paulo', created_at)) as bucket_local,
          coalesce(sum(amount), 0)::numeric as total
        from public.orders
        cross join bounds
        where status = 'approved'
          and timezone('America/Sao_Paulo', created_at) >= bounds.start_local
        group by 1
      )
      select
        to_char(series.bucket_local, 'YYYY-MM') as bucket_key,
        extract(month from series.bucket_local)::int as month_of_year,
        coalesce(agg.total, 0)::text as total
      from series
      left join agg using (bucket_local)
      order by series.bucket_local asc
    `,
    map: (rows: Array<any>) =>
      rows.map((row) => ({
        name: monthNames[Math.max(0, Number(row.month_of_year || 1) - 1)] || "",
        value: Number(row.total || 0),
      })),
  };
}

export async function registerAdminDashboardRoutes(api: FastifyInstance, db: Db) {
  api.get("/admin/dashboard/summary", async (req, reply) => {
    await ensureAdminAccess(req, reply);

    const { period } = z.object({
      period: z.enum(["today", "7d", "month", "year"]).default("month"),
    }).parse(req.query ?? {}) as { period: DashboardPeriod };

    const chartConfig = periodToChartConfig(period);

    const data = await withClient(db, async (client) => {
      await client.query("begin");
      try {
        await client.query("set local transaction isolation level repeatable read");

        const [metricsRes, chartRes, topProductsRes, recentUsersRes] = await Promise.all([
          client.query<{
            active_users: string | number | null;
            total_revenue: string | number | null;
            approved_sales: string | number | null;
            active_products: string | number | null;
          }>(
            `
              with users_count as (
                select count(*)::text as active_users
                from public.profiles
              ),
              revenue_count as (
                select
                  coalesce(sum(coalesce(gross_amount, amount)) filter (where status = 'approved'), 0)::text as total_revenue,
                  count(*) filter (where status = 'approved')::text as approved_sales
                from public.orders
              ),
              products_count as (
                select count(*)::text as active_products
                from public.products
                where status = 'active'
              )
              select
                users_count.active_users,
                revenue_count.total_revenue,
                revenue_count.approved_sales,
                products_count.active_products
              from users_count, revenue_count, products_count
            `
          ),
          client.query(chartConfig.query),
          client.query<{
            id: string;
            name: string;
            sales: string | number | null;
            revenue: string | number | null;
          }>(
            `
              with approved_orders as (
                select id, product_id, amount
                from public.orders
                where status = 'approved'
              ),
              item_metrics as (
                select
                  oi.product_id,
                  count(*)::numeric as sales,
                  coalesce(sum(oi.amount), 0)::numeric as revenue
                from public.order_items oi
                inner join approved_orders ao on ao.id = oi.order_id
                group by oi.product_id
              ),
              legacy_metrics as (
                select
                  ao.product_id,
                  count(*)::numeric as sales,
                  coalesce(sum(ao.amount), 0)::numeric as revenue
                from approved_orders ao
                where ao.product_id is not null
                  and not exists (
                    select 1
                    from public.order_items oi
                    where oi.order_id = ao.id
                  )
                group by ao.product_id
              ),
              combined_metrics as (
                select
                  product_id,
                  sum(sales)::numeric as sales,
                  sum(revenue)::numeric as revenue
                from (
                  select product_id, sales, revenue from item_metrics
                  union all
                  select product_id, sales, revenue from legacy_metrics
                ) src
                group by product_id
              )
              select
                p.id,
                p.name,
                coalesce(cm.sales, 0)::text as sales,
                coalesce(cm.revenue, 0)::text as revenue
              from public.products p
              inner join combined_metrics cm on cm.product_id = p.id
              order by cm.revenue desc, p.created_at desc
              limit 5
            `
          ),
          client.query<{
            name: string | null;
            email: string | null;
            role: string | null;
            created_at: string;
          }>(
            `
              select
                p.name,
                u.email,
                ur.role::text as role,
                p.created_at
              from public.profiles p
              left join public.users u on u.id = p.user_id
              left join public.user_roles ur on ur.user_id = p.user_id
              order by p.created_at desc
              limit 5
            `
          ),
        ]);

        await client.query("commit");

        const metricsRow = metricsRes.rows[0] || {
          active_users: "0",
          total_revenue: "0",
          approved_sales: "0",
          active_products: "0",
        };

        return {
          metrics: {
            activeUsers: Number(metricsRow.active_users || 0),
            totalRevenue: Number(metricsRow.total_revenue || 0),
            approvedSales: Number(metricsRow.approved_sales || 0),
            activeProducts: Number(metricsRow.active_products || 0),
          },
          chartData: chartConfig.map(chartRes.rows || []),
          topProducts: (topProductsRes.rows || []).map((row) => ({
            id: row.id,
            name: row.name,
            sales: Number(row.sales || 0),
            revenue: Number(row.revenue || 0),
          })),
          recentUsers: (recentUsersRes.rows || []).map((row) => ({
            name: row.name || "Sem nome",
            email: row.email || "",
            role: mapRoleLabel(row.role),
            date: formatRelativeDatePtBr(row.created_at),
          })),
        };
      } catch (error) {
        await client.query("rollback").catch(() => {});
        throw error;
      }
    });

    return reply.send({ data, error: null });
  });
}
