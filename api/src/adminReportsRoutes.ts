import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "./db.js";
import { requireAuth } from "./auth.js";
import { withClient } from "./db.js";

type ReportsPeriod = "today" | "yesterday" | "7d" | "30d" | "6m" | "year";

async function ensureAdminAccess(req: any, reply: any) {
  requireAuth(req, reply);
  if (req.auth.role !== "admin") {
    reply.code(403).send({ error: { code: "AUTH_FORBIDDEN", message: "Forbidden" } });
    throw new Error("Forbidden");
  }
}

function periodConfig(period: ReportsPeriod) {
  const monthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

  if (period === "today") {
    return {
      startSql: "date_trunc('day', timezone('America/Sao_Paulo', now()))",
      endSql: "timezone('America/Sao_Paulo', now())",
      chartQuery: `
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
            coalesce(sum(amount), 0)::numeric as revenue,
            count(*)::int as orders
          from public.orders
          cross join bounds
          where status = 'approved'
            and timezone('America/Sao_Paulo', created_at) >= bounds.start_local
            and timezone('America/Sao_Paulo', created_at) <= bounds.end_local
          group by 1
        )
        select
          extract(hour from series.bucket_local)::int as hour_of_day,
          coalesce(agg.revenue, 0)::text as revenue,
          coalesce(agg.orders, 0)::int as orders
        from series
        left join agg using (bucket_local)
        order by series.bucket_local asc
      `,
      mapChart: (rows: Array<any>) =>
        rows.map((row) => ({
          name: `${String(Number(row.hour_of_day || 0)).padStart(2, "0")}h`,
          revenue: Number(row.revenue || 0),
          orders: Number(row.orders || 0),
        })),
    };
  }

  if (period === "yesterday") {
    return {
      startSql: "date_trunc('day', timezone('America/Sao_Paulo', now())) - interval '1 day'",
      endSql: "date_trunc('day', timezone('America/Sao_Paulo', now()))",
      chartQuery: `
        with bounds as (
          select
            date_trunc('day', timezone('America/Sao_Paulo', now())) - interval '1 day' as start_local,
            date_trunc('day', timezone('America/Sao_Paulo', now())) as end_local
        ),
        series as (
          select generate_series(bounds.start_local, bounds.end_local - interval '1 hour', interval '1 hour') as bucket_local
          from bounds
        ),
        agg as (
          select
            date_trunc('hour', timezone('America/Sao_Paulo', created_at)) as bucket_local,
            coalesce(sum(amount), 0)::numeric as revenue,
            count(*)::int as orders
          from public.orders
          cross join bounds
          where status = 'approved'
            and timezone('America/Sao_Paulo', created_at) >= bounds.start_local
            and timezone('America/Sao_Paulo', created_at) < bounds.end_local
          group by 1
        )
        select
          extract(hour from series.bucket_local)::int as hour_of_day,
          coalesce(agg.revenue, 0)::text as revenue,
          coalesce(agg.orders, 0)::int as orders
        from series
        left join agg using (bucket_local)
        order by series.bucket_local asc
      `,
      mapChart: (rows: Array<any>) =>
        rows.map((row) => ({
          name: `${String(Number(row.hour_of_day || 0)).padStart(2, "0")}h`,
          revenue: Number(row.revenue || 0),
          orders: Number(row.orders || 0),
        })),
    };
  }

  if (period === "7d" || period === "30d") {
    const dayWindow = period === "7d" ? 6 : 29;
    return {
      startSql: `date_trunc('day', timezone('America/Sao_Paulo', now())) - interval '${dayWindow} day'`,
      endSql: "timezone('America/Sao_Paulo', now())",
      chartQuery: `
        with bounds as (
          select
            date_trunc('day', timezone('America/Sao_Paulo', now())) - interval '${dayWindow} day' as start_local,
            date_trunc('day', timezone('America/Sao_Paulo', now())) as end_local
        ),
        series as (
          select generate_series(bounds.start_local, bounds.end_local, interval '1 day') as bucket_local
          from bounds
        ),
        agg as (
          select
            date_trunc('day', timezone('America/Sao_Paulo', created_at)) as bucket_local,
            coalesce(sum(amount), 0)::numeric as revenue,
            count(*)::int as orders
          from public.orders
          cross join bounds
          where status = 'approved'
            and timezone('America/Sao_Paulo', created_at) >= bounds.start_local
            and timezone('America/Sao_Paulo', created_at) <= timezone('America/Sao_Paulo', now())
          group by 1
        )
        select
          to_char(series.bucket_local, 'DD/MM') as day_label,
          coalesce(agg.revenue, 0)::text as revenue,
          coalesce(agg.orders, 0)::int as orders
        from series
        left join agg using (bucket_local)
        order by series.bucket_local asc
      `,
      mapChart: (rows: Array<any>) =>
        rows.map((row) => ({
          name: row.day_label,
          revenue: Number(row.revenue || 0),
          orders: Number(row.orders || 0),
        })),
    };
  }

  if (period === "6m") {
    return {
      startSql: "date_trunc('month', timezone('America/Sao_Paulo', now())) - interval '5 month'",
      endSql: "timezone('America/Sao_Paulo', now())",
      chartQuery: `
        with bounds as (
          select
            date_trunc('month', timezone('America/Sao_Paulo', now())) - interval '5 month' as start_local,
            date_trunc('month', timezone('America/Sao_Paulo', now())) as end_local
        ),
        series as (
          select generate_series(bounds.start_local, bounds.end_local, interval '1 month') as bucket_local
          from bounds
        ),
        agg as (
          select
            date_trunc('month', timezone('America/Sao_Paulo', created_at)) as bucket_local,
            coalesce(sum(amount), 0)::numeric as revenue,
            count(*)::int as orders
          from public.orders
          cross join bounds
          where status = 'approved'
            and timezone('America/Sao_Paulo', created_at) >= bounds.start_local
            and timezone('America/Sao_Paulo', created_at) <= timezone('America/Sao_Paulo', now())
          group by 1
        )
        select
          extract(month from series.bucket_local)::int as month_of_year,
          coalesce(agg.revenue, 0)::text as revenue,
          coalesce(agg.orders, 0)::int as orders
        from series
        left join agg using (bucket_local)
        order by series.bucket_local asc
      `,
      mapChart: (rows: Array<any>) =>
        rows.map((row) => ({
          name: monthNames[Math.max(0, Number(row.month_of_year || 1) - 1)] || "",
          revenue: Number(row.revenue || 0),
          orders: Number(row.orders || 0),
        })),
    };
  }

  return {
    startSql: "date_trunc('year', timezone('America/Sao_Paulo', now())) - interval '4 year'",
    endSql: "timezone('America/Sao_Paulo', now())",
    chartQuery: `
      with bounds as (
        select
          date_trunc('year', timezone('America/Sao_Paulo', now())) - interval '4 year' as start_local,
          date_trunc('year', timezone('America/Sao_Paulo', now())) as end_local
      ),
      series as (
        select generate_series(bounds.start_local, bounds.end_local, interval '1 year') as bucket_local
        from bounds
      ),
      agg as (
        select
          date_trunc('year', timezone('America/Sao_Paulo', created_at)) as bucket_local,
          coalesce(sum(amount), 0)::numeric as revenue,
          count(*)::int as orders
        from public.orders
        cross join bounds
        where status = 'approved'
          and timezone('America/Sao_Paulo', created_at) >= bounds.start_local
          and timezone('America/Sao_Paulo', created_at) <= timezone('America/Sao_Paulo', now())
        group by 1
      )
      select
        extract(year from series.bucket_local)::int as year_value,
        coalesce(agg.revenue, 0)::text as revenue,
        coalesce(agg.orders, 0)::int as orders
      from series
      left join agg using (bucket_local)
      order by series.bucket_local asc
    `,
    mapChart: (rows: Array<any>) =>
      rows.map((row) => ({
        name: String(Number(row.year_value || 0)),
        revenue: Number(row.revenue || 0),
        orders: Number(row.orders || 0),
      })),
  };
}

export async function registerAdminReportsRoutes(api: FastifyInstance, db: Db) {
  api.get("/admin/reports/summary", async (req, reply) => {
    await ensureAdminAccess(req, reply);

    const { period } = z.object({
      period: z.enum(["today", "yesterday", "7d", "30d", "6m", "year"]).default("year"),
    }).parse(req.query ?? {}) as { period: ReportsPeriod };

    const config = periodConfig(period);

    const data = await withClient(db, async (client) => {
      await client.query("begin");
      try {
        await client.query("set local transaction isolation level repeatable read");

        const [metricsRes, chartRes] = await Promise.all([
          client.query<{
            gross_total_revenue: string | number | null;
            total_revenue: string | number | null;
            total_sales: string | number | null;
            pending_orders: string | number | null;
            total_orders: string | number | null;
          }>(`
            with bounds as (
              select
                ${config.startSql} as start_local,
                ${config.endSql} as end_local
            ),
            filtered_orders as (
              select amount, gross_amount, status
              from public.orders
              cross join bounds
              where timezone('America/Sao_Paulo', created_at) >= bounds.start_local
                and timezone('America/Sao_Paulo', created_at) <= bounds.end_local
            )
            select
              coalesce(sum(coalesce(gross_amount, amount)) filter (where status = 'approved'), 0)::text as gross_total_revenue,
              coalesce(sum(amount) filter (where status = 'approved'), 0)::text as total_revenue,
              count(*) filter (where status = 'approved')::text as total_sales,
              count(*) filter (where status = 'pending')::text as pending_orders,
              count(*)::text as total_orders
            from filtered_orders
          `),
          client.query(config.chartQuery),
        ]);

        await client.query("commit");

        const row = metricsRes.rows[0] || {
          gross_total_revenue: "0",
          total_revenue: "0",
          total_sales: "0",
          pending_orders: "0",
          total_orders: "0",
        };
        const grossTotalRevenue = Number(row.gross_total_revenue || 0);
        const totalRevenue = Number(row.total_revenue || 0);
        const totalSales = Number(row.total_sales || 0);
        const pendingOrders = Number(row.pending_orders || 0);
        const totalOrders = Number(row.total_orders || 0);

        return {
          metrics: {
            grossTotalRevenue,
            totalRevenue,
            avgTicket: totalSales > 0 ? totalRevenue / totalSales : 0,
            totalSales,
            conversionRate: totalSales + pendingOrders > 0 ? (totalSales / (totalSales + pendingOrders)) * 100 : 0,
          },
          chartData: config.mapChart(chartRes.rows || []),
        };
      } catch (error) {
        await client.query("rollback").catch(() => {});
        throw error;
      }
    });

    return reply.send({ data, error: null });
  });
}
