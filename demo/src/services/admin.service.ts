import { supabase } from "@/integrations/supabase/client";
import { isDemo, blockDemoWrite } from "@/lib/demo-utils";
import {
  demoAdminMetrics, demoAdminChartData, demoAdminTopProducts, demoAdminRecentUsers,
  demoReportMetrics, demoRevenueData, demoPaymentMethodData, demoTopSellers,
  demoAdminUsers, demoPlatformSettings, demoRewards, demoUpdates,
  demoAdminProducts, demoAdminProductSales,
  demoSmtpConfig, demoSmtpStatus, demoDnsRecords,
  demoCampaigns, demoEmailTemplates, demoRewardClaims,
} from "@/data/customer-stubs";
import type {
  RevenueDataPoint, PaymentMethodStat, TopSeller,
  SmtpConfig, SmtpStatus, DnsRecord,
  Campaign, PlatformSettings, Reward, RewardClaim, UpdateEntry, EmailTemplate,
  EmailOutboxJob, EmailLogEntry,
  AdminDashboardSummary,
  AdminReportsSummary,
} from "@/types/api";
import type { User } from "@/types";
import { PLATFORM_TZ, formatDateKey, formatMonthKey } from "@/lib/timezone";
import { addDays, addHours, addMonths, addYears, startOfDay, startOfMonth, startOfYear, subDays, subMonths, subYears } from "date-fns";
import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";

function formatApiError(payload: any, fallback = "Request failed"): string {
  const err = payload?.error;
  if (!err) return fallback;
  if (Array.isArray(err.issues) && err.issues.length > 0) {
    const details = err.issues
      .map((issue: any) => {
        const path = Array.isArray(issue?.path) && issue.path.length > 0 ? issue.path.join(".") : "request";
        const message = String(issue?.message || "Valor inválido.");
        return `${path}: ${message}`;
      })
      .join(" | ");
    const base = String(err.message || "").trim();
    return base ? `${base}: ${details}` : details;
  }
  return String(err.message || err || fallback);
}

export const fetchAdminDashboardSummary = async (period: "today" | "7d" | "month" | "year" = "month"): Promise<AdminDashboardSummary> => {
  if (isDemo()) {
    const parseCurrency = (value: string) =>
      Number(
        String(value || "0")
          .replace(/[^\d,.-]/g, "")
          .replace(/\./g, "")
          .replace(",", ".")
      ) || 0;

    return {
      metrics: {
        activeUsers: Number(String(demoAdminMetrics.activeUsers).replace(/\D/g, "")) || 0,
        totalRevenue: parseCurrency(demoAdminMetrics.totalRevenue),
        approvedSales: Number(String(demoAdminMetrics.approvedSales).replace(/\D/g, "")) || 0,
        activeProducts: Number(String(demoAdminMetrics.activeProducts).replace(/\D/g, "")) || 0,
      },
      chartData: demoAdminChartData,
      topProducts: demoAdminTopProducts.map((row, index) => ({
        id: `demo-admin-product-${index + 1}`,
        name: row.name,
        sales: Number(row.sales || 0),
        revenue: parseCurrency(row.revenue),
      })),
      recentUsers: demoAdminRecentUsers,
    };
  }

  const response = await fetch(`/api/admin/dashboard/summary?period=${encodeURIComponent(period)}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload?.error?.message || payload?.error || "Request failed";
    throw new Error(message);
  }

  return (payload?.data as AdminDashboardSummary) || {
    metrics: {
      activeUsers: 0,
      totalRevenue: 0,
      approvedSales: 0,
      activeProducts: 0,
    },
    chartData: [],
    topProducts: [],
    recentUsers: [],
  };
};

// ═══════════════════════════════════════════════════
// USERS
// ═══════════════════════════════════════════════════

export const getAdminUsers = async (): Promise<User[]> => {
  if (isDemo()) return demoAdminUsers;
  const response = await fetch("/api/admin/users", {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error?.message || payload?.error || "Request failed");
  return (payload?.data ?? []) as User[];
};

export const getAdminUserProducts = async (userId: string) => {
  if (isDemo()) return demoAdminProducts.filter((p) => p.sellerId === userId).map((p) => ({ id: p.id, name: p.name, price: `R$ ${p.price.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, status: p.status === "active" ? "Ativo" : "Inativo" }));
  const response = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/products`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error?.message || payload?.error || "Request failed");
  return ((payload?.data ?? []) as Array<any>).map((p) => ({
    id: p.id,
    name: p.name,
    price: `R$ ${Number(p.price).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    status: p.status === "active" ? "Ativo" : p.status === "draft" ? "Rascunho" : "Inativo",
  }));
};

export const updateAdminUser = async (userId: string, data: { name?: string; phone?: string; role?: string }) => {
  if (blockDemoWrite("Editar usuário")) return;
  const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const payload = await res.json().catch(() => null);
  if (!res.ok) throw new Error(payload?.error?.message || payload?.error || "Request failed");
};

export const deleteAdminUser = async (userId: string) => {
  if (blockDemoWrite("Excluir usuário")) return;
  const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
    method: "DELETE",
    credentials: "include",
  });
  const payload = await res.json().catch(() => null);
  if (!res.ok) throw new Error(payload?.error?.message || payload?.error || "Request failed");
};

// ═══════════════════════════════════════════════════
// PRODUCTS (Admin view — all products)
// ═══════════════════════════════════════════════════

export const getAdminProducts = async () => {
  if (isDemo()) return demoAdminProducts;
  const response = await fetch("/api/admin/products", {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error?.message || payload?.error || "Request failed");
  return (payload?.data ?? []) as Array<any>;
};

export const getAdminProductSales = async (productId: string) => {
  if (isDemo()) return demoAdminProductSales;
  const response = await fetch(`/api/admin/products/${encodeURIComponent(productId)}/sales`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error?.message || payload?.error || "Request failed");
  return ((payload?.data ?? []) as Array<any>).map((o) => ({
    id: o.id,
    buyer: o.buyer,
    amount: `R$ ${Number(o.amount).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    date: o.date,
    status: o.status === "approved" ? "Aprovado" : o.status === "pending" ? "Pendente" : o.status,
  }));
};

export const fetchAdminReportsSummary = async (period: AdminRevenuePeriod = "year"): Promise<AdminReportsSummary> => {
  if (isDemo()) {
    const parseCurrency = (value: string) =>
      Number(
        String(value || "0")
          .replace(/[^\d,.-]/g, "")
          .replace(/\./g, "")
          .replace(",", ".")
      ) || 0;

    const totalRevenue = parseCurrency(demoReportMetrics.totalRevenue);
    const totalSales = Number(String(demoReportMetrics.totalSales).replace(/\D/g, "")) || 0;

    return {
      metrics: {
        grossTotalRevenue: totalRevenue,
        totalRevenue,
        avgTicket: totalSales > 0 ? totalRevenue / totalSales : 0,
        totalSales,
        conversionRate: 0,
      },
      chartData: buildDemoRevenueData(period),
    };
  }

  const response = await fetch(`/api/admin/reports/summary?period=${encodeURIComponent(period)}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload?.error?.message || payload?.error || "Request failed";
    throw new Error(message);
  }

  return (payload?.data as AdminReportsSummary) || {
    metrics: {
      grossTotalRevenue: 0,
      totalRevenue: 0,
      avgTicket: 0,
      totalSales: 0,
      conversionRate: 0,
    },
    chartData: [],
  };
};

export type AdminRevenuePeriod = "today" | "yesterday" | "7d" | "30d" | "6m" | "year";

type RevenueOrderRow = {
  amount: number | string | null;
  created_at: string;
  status: string;
};

const monthLabelFormatter = new Intl.DateTimeFormat("pt-BR", {
  month: "short",
  timeZone: PLATFORM_TZ,
});

const normalizeMonthLabel = (date: Date) => {
  const raw = monthLabelFormatter.format(date).replace(".", "");
  return raw.charAt(0).toUpperCase() + raw.slice(1);
};

const groupRevenueRows = (
  rows: RevenueOrderRow[],
  keyForRow: (row: RevenueOrderRow) => string
) => {
  const grouped: Record<string, { revenue: number; orders: number }> = {};

  rows.forEach((row) => {
    const key = keyForRow(row);
    if (!grouped[key]) grouped[key] = { revenue: 0, orders: 0 };
    grouped[key].revenue += Number(row.amount ?? 0);
    grouped[key].orders += 1;
  });

  return grouped;
};

const buildDemoRevenueData = (period: AdminRevenuePeriod): RevenueDataPoint[] => {
  const base = demoRevenueData.length ? demoRevenueData : [
    { name: "Jan", revenue: 12000, orders: 18 },
    { name: "Fev", revenue: 15400, orders: 23 },
    { name: "Mar", revenue: 18750, orders: 29 },
  ];

  if (period === "today" || period === "yesterday") {
    const hours = period === "today" ? 13 : 24;
    return Array.from({ length: hours }, (_, index) => ({
      name: `${String(index).padStart(2, "0")}h`,
      revenue: Math.max(0, Math.round((base[index % base.length]?.revenue || 0) / 60)),
      orders: Math.max(0, Math.round((base[index % base.length]?.orders || 0) / 6)),
    }));
  }

  if (period === "7d" || period === "30d") {
    const days = period === "7d" ? 7 : 30;
    return Array.from({ length: days }, (_, index) => {
      const date = subDays(new Date(), days - index - 1);
      return {
        name: formatInTimeZone(date, PLATFORM_TZ, "dd/MM"),
        revenue: Math.max(0, Math.round((base[index % base.length]?.revenue || 0) / (period === "7d" ? 10 : 12))),
        orders: Math.max(0, Math.round((base[index % base.length]?.orders || 0) / (period === "7d" ? 2 : 3))),
      };
    });
  }

  if (period === "6m") {
    return Array.from({ length: 6 }, (_, index) => {
      const date = addMonths(startOfMonth(subMonths(new Date(), 5)), index);
      return {
        name: normalizeMonthLabel(date),
        revenue: base[index % base.length]?.revenue || 0,
        orders: base[index % base.length]?.orders || 0,
      };
    });
  }

  return Array.from({ length: 5 }, (_, index) => {
    const yearDate = addYears(startOfYear(subYears(new Date(), 4)), index);
    return {
      name: formatInTimeZone(yearDate, PLATFORM_TZ, "yyyy"),
      revenue: (base[index % base.length]?.revenue || 0) * 12,
      orders: (base[index % base.length]?.orders || 0) * 12,
    };
  });
};

export const getRevenueData = async (period: AdminRevenuePeriod = "year"): Promise<RevenueDataPoint[]> => {
  if (isDemo()) return buildDemoRevenueData(period);

  const nowZoned = toZonedTime(new Date(), PLATFORM_TZ);

  if (period === "today") {
    const startZoned = startOfDay(nowZoned);
    const startUtc = fromZonedTime(startZoned, PLATFORM_TZ);
    const currentHour = Number(formatInTimeZone(new Date(), PLATFORM_TZ, "H"));

    const { data } = await supabase
      .from("orders")
      .select("amount, created_at, status")
      .eq("status", "approved")
      .gte("created_at", startUtc.toISOString())
      .order("created_at", { ascending: true });

    const grouped = groupRevenueRows((data ?? []) as RevenueOrderRow[], (row) =>
      formatInTimeZone(new Date(row.created_at), PLATFORM_TZ, "HH")
    );

    return Array.from({ length: currentHour + 1 }, (_, index) => {
      const key = String(index).padStart(2, "0");
      const bucket = grouped[key] || { revenue: 0, orders: 0 };
      return { name: `${key}h`, revenue: Math.round(bucket.revenue), orders: bucket.orders };
    });
  }

  if (period === "yesterday") {
    const startZoned = startOfDay(subDays(nowZoned, 1));
    const endZoned = startOfDay(nowZoned);
    const startUtc = fromZonedTime(startZoned, PLATFORM_TZ);
    const endUtc = fromZonedTime(endZoned, PLATFORM_TZ);

    const { data } = await supabase
      .from("orders")
      .select("amount, created_at, status")
      .eq("status", "approved")
      .gte("created_at", startUtc.toISOString())
      .lt("created_at", endUtc.toISOString())
      .order("created_at", { ascending: true });

    const grouped = groupRevenueRows((data ?? []) as RevenueOrderRow[], (row) =>
      formatInTimeZone(new Date(row.created_at), PLATFORM_TZ, "HH")
    );

    return Array.from({ length: 24 }, (_, index) => {
      const key = String(index).padStart(2, "0");
      const bucket = grouped[key] || { revenue: 0, orders: 0 };
      return { name: `${key}h`, revenue: Math.round(bucket.revenue), orders: bucket.orders };
    });
  }

  if (period === "7d" || period === "30d") {
    const days = period === "7d" ? 7 : 30;
    const startZoned = startOfDay(subDays(nowZoned, days - 1));
    const startUtc = fromZonedTime(startZoned, PLATFORM_TZ);

    const { data } = await supabase
      .from("orders")
      .select("amount, created_at, status")
      .eq("status", "approved")
      .gte("created_at", startUtc.toISOString())
      .order("created_at", { ascending: true });

    const grouped = groupRevenueRows((data ?? []) as RevenueOrderRow[], (row) => formatDateKey(row.created_at));

    return Array.from({ length: days }, (_, index) => {
      const bucketDate = addDays(startZoned, index);
      const bucketUtc = fromZonedTime(bucketDate, PLATFORM_TZ);
      const key = formatDateKey(bucketUtc);
      const bucket = grouped[key] || { revenue: 0, orders: 0 };
      return {
        name: formatInTimeZone(bucketUtc, PLATFORM_TZ, "dd/MM"),
        revenue: Math.round(bucket.revenue),
        orders: bucket.orders,
      };
    });
  }

  if (period === "6m") {
    const startZoned = startOfMonth(subMonths(nowZoned, 5));
    const startUtc = fromZonedTime(startZoned, PLATFORM_TZ);

    const { data } = await supabase
      .from("orders")
      .select("amount, created_at, status")
      .eq("status", "approved")
      .gte("created_at", startUtc.toISOString())
      .order("created_at", { ascending: true });

    const grouped = groupRevenueRows((data ?? []) as RevenueOrderRow[], (row) => formatMonthKey(row.created_at));

    return Array.from({ length: 6 }, (_, index) => {
      const bucketDate = addMonths(startZoned, index);
      const bucketUtc = fromZonedTime(bucketDate, PLATFORM_TZ);
      const key = formatMonthKey(bucketUtc);
      const bucket = grouped[key] || { revenue: 0, orders: 0 };
      return {
        name: normalizeMonthLabel(bucketUtc),
        revenue: Math.round(bucket.revenue),
        orders: bucket.orders,
      };
    });
  }

  const startZoned = startOfYear(subYears(nowZoned, 4));
  const startUtc = fromZonedTime(startZoned, PLATFORM_TZ);

  const { data } = await supabase
    .from("orders")
    .select("amount, created_at, status")
    .eq("status", "approved")
    .gte("created_at", startUtc.toISOString())
    .order("created_at", { ascending: true });

  const grouped = groupRevenueRows((data ?? []) as RevenueOrderRow[], (row) =>
    formatInTimeZone(new Date(row.created_at), PLATFORM_TZ, "yyyy")
  );

  return Array.from({ length: 5 }, (_, index) => {
    const bucketDate = addYears(startZoned, index);
    const bucketUtc = fromZonedTime(bucketDate, PLATFORM_TZ);
    const key = formatInTimeZone(bucketUtc, PLATFORM_TZ, "yyyy");
    const bucket = grouped[key] || { revenue: 0, orders: 0 };
    return {
      name: key,
      revenue: Math.round(bucket.revenue),
      orders: bucket.orders,
    };
  });
};

export const getPaymentMethodData = async (): Promise<PaymentMethodStat[]> => {
  if (isDemo()) return demoPaymentMethodData;

  const { data } = await supabase
    .from("orders")
    .select("method, status")
    .eq("status", "approved");

  const counts: Record<string, number> = {};
  (data ?? []).forEach((o) => {
    counts[o.method] = (counts[o.method] || 0) + 1;
  });

  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
  const methodLabels: Record<string, string> = { pix: "PIX", credit_card: "Cartão", boleto: "Boleto" };
  const methodColors: Record<string, string> = {
    pix: "hsl(142, 72%, 35%)",
    credit_card: "hsl(224, 76%, 48%)",
    boleto: "hsl(38, 92%, 50%)",
  };

  return Object.entries(counts).map(([method, count]) => ({
    name: methodLabels[method] || method,
    value: Math.round((count / total) * 100),
    color: methodColors[method] || "hsl(0, 0%, 50%)",
  }));
};

export const getTopSellers = async (): Promise<TopSeller[]> => {
  if (isDemo()) return demoTopSellers;

  const { data: orders } = await supabase
    .from("orders")
    .select("seller_id, amount, status")

  const sellerRevenue: Record<string, number> = {};
  const sellerApprovedCount: Record<string, number> = {};
  const sellerPendingCount: Record<string, number> = {};

  (orders ?? []).forEach((o) => {
    if (o.status === "approved") {
      sellerRevenue[o.seller_id] = (sellerRevenue[o.seller_id] || 0) + Number(o.amount);
      sellerApprovedCount[o.seller_id] = (sellerApprovedCount[o.seller_id] || 0) + 1;
      return;
    }

    if (o.status === "pending") {
      sellerPendingCount[o.seller_id] = (sellerPendingCount[o.seller_id] || 0) + 1;
    }
  });

  const topSellerIds = Object.entries(sellerRevenue)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([id]) => id);

  if (!topSellerIds.length) return [];

  const [profilesRes, productsRes] = await Promise.all([
    supabase.from("profiles").select("user_id, name").in("user_id", topSellerIds),
    supabase.from("products").select("seller_id").in("seller_id", topSellerIds),
  ]);

  const nameMap = new Map((profilesRes.data ?? []).map((p) => [p.user_id, p.name]));
  const productCounts: Record<string, number> = {};
  (productsRes.data ?? []).forEach((p) => {
    productCounts[p.seller_id] = (productCounts[p.seller_id] || 0) + 1;
  });

  return topSellerIds.map((id) => ({
    name: nameMap.get(id) ?? "Vendedor",
    products: productCounts[id] || 0,
    revenue: `R$ ${sellerRevenue[id].toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    conversion: (() => {
      const approved = sellerApprovedCount[id] || 0;
      const pending = sellerPendingCount[id] || 0;
      const base = approved + pending;
      const rate = base > 0 ? (approved / base) * 100 : 0;
      return `${rate.toFixed(1)}%`;
    })(),
  }));
};

// ═══════════════════════════════════════════════════
// SMTP
// ═══════════════════════════════════════════════════

export const getSmtpConfig = async (): Promise<SmtpConfig> => {
  if (isDemo()) return demoSmtpConfig;
  const response = await fetch("/api/admin/smtp/config", {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(formatApiError(payload));
  return (payload?.data as SmtpConfig) || { host: "", port: "587", username: "", password: "", encryption: "tls", fromName: "", fromEmail: "", enabled: false };
};

export const updateSmtpConfig = async (config: SmtpConfig) => {
  if (blockDemoWrite("Configurar SMTP")) return;
  const response = await fetch("/api/admin/smtp/config", {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(formatApiError(payload));
};

export const getSmtpStatus = async (): Promise<SmtpStatus> => {
  if (isDemo()) return demoSmtpStatus;
  const response = await fetch("/api/admin/smtp/status", {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(formatApiError(payload));
  return (payload?.data as SmtpStatus) || { emailsSentToday: "0", deliveryRate: "-", bounces: "0", lastTest: "-" };
};

export const getSmtpLite = async (): Promise<{ enabled: boolean; host: string; fromEmail: string }> => {
  if (isDemo()) return { enabled: demoSmtpConfig.enabled, host: demoSmtpConfig.host, fromEmail: demoSmtpConfig.fromEmail };

  const { data } = await supabase.from("smtp_config").select("enabled, host, from_email").limit(1).maybeSingle();
  return { enabled: Boolean(data?.enabled), host: String(data?.host || ""), fromEmail: String(data?.from_email || "") };
};

export const getDnsRecords = async (): Promise<DnsRecord[]> => {
  if (isDemo()) return demoDnsRecords;
  const response = await fetch("/api/admin/smtp/dns", {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(formatApiError(payload));
  return (payload?.data ?? []) as DnsRecord[];
};

// ═══════════════════════════════════════════════════
// CAMPAIGNS
// ═══════════════════════════════════════════════════

export const getCampaigns = async (): Promise<Campaign[]> => {
  if (isDemo()) return demoCampaigns;

  const { data } = await supabase
    .from("email_campaigns")
    .select("*")
    .order("created_at", { ascending: false });

  return (data ?? []).map((c: any) => ({
    id: c.id,
    name: c.name,
    subject: c.subject,
    status: c.status as Campaign["status"],
    scheduledAt: c.scheduled_at || null,
    sentAt: c.sent_at || null,
    recipients: c.recipients_count,
    openRate: c.recipients_count > 0 ? `${Math.round((c.open_count / c.recipients_count) * 100)}%` : "-",
    clickRate: c.recipients_count > 0 ? `${Math.round((c.click_count / c.recipients_count) * 100)}%` : "-",
  }));
};

// ═══════════════════════════════════════════════════
// EMAIL TEMPLATES
// ═══════════════════════════════════════════════════

export const getEmailTemplates = async (): Promise<EmailTemplate[]> => {
  if (isDemo()) return demoEmailTemplates;

  const { data, error } = await supabase.functions.invoke("admin-email-templates", { body: { action: "list" } });
  if (error) throw new Error(error.message || "Falha ao carregar templates de e-mail.");

  return ((data as any[]) ?? []).map((t: any) => ({
    id: t.id,
    category: t.category as EmailTemplate["category"],
    eventKey: t.event_key,
    title: t.title,
    description: t.description,
    subject: t.subject,
    body: t.body,
    defaultSubject: t.default_subject ?? t.subject,
    defaultBody: t.default_body ?? t.body,
    enabled: Boolean(t.enabled),
    sentCount: Number(t.outbox_sent_count ?? t.sent_count ?? 0),
    openRate: String(t.metrics_open_rate ?? "-"),
    clickRate: String(t.metrics_click_rate ?? "-"),
  }));
};

export const updateEmailTemplate = async (id: string, updates: { subject?: string; body?: string; enabled?: boolean }) => {
  if (blockDemoWrite("Editar template de email")) return;

  const payload: Record<string, any> = {};
  if (updates.subject !== undefined) payload.subject = updates.subject;
  if (updates.body !== undefined) payload.body = updates.body;
  if (updates.enabled !== undefined) payload.enabled = updates.enabled;
  const { error } = await supabase.from("email_templates").update(payload).eq("id", id);
  if (error) throw error;
};

export const sendTemplateTest = async (params: { eventKey: string; to: string; vars?: Record<string, any> }) => {
  if (blockDemoWrite("Enviar teste de template")) return;

  const { data, error } = await supabase.functions.invoke("send-template-test", {
    body: { event_key: params.eventKey, to: params.to, vars: params.vars || {} },
  });
  if (error) throw new Error(error.message || "Falha ao enviar teste.");
  return data;
};

export type EmailCampaignSegment = "buyers" | "sellers" | "all";
export type EmailCampaignDisplayStatus = "draft" | "scheduled" | "sending" | "sent" | "canceled";

export interface EmailCampaignRow {
  id: string;
  name: string;
  subject: string;
  body: string;
  status: "draft" | "scheduled" | "sending" | "sent" | "canceled";
  display_status?: EmailCampaignDisplayStatus;
  scheduled_at: string | null;
  sent_at: string | null;
  canceled_at?: string | null;
  recipients_count: number;
  open_count: number;
  click_count: number;
  sent_count?: number;
  queued_count?: number;
  sending_count?: number;
  failed_count?: number;
  canceled_count?: number;
  open_unique_count?: number;
  click_unique_count?: number;
  open_human_unique_count?: number;
  click_human_unique_count?: number;
  open_total_count?: number;
  click_total_count?: number;
  open_human_total_count?: number;
  click_human_total_count?: number;
  last_sent_at?: string | null;
  last_activity_at?: string | null;
  segment: EmailCampaignSegment;
}

export const listEmailCampaignRows = async (limit = 50): Promise<EmailCampaignRow[]> => {
  const { data, error } = await supabase.functions.invoke("admin-email-campaigns", { body: { action: "list", limit } });
  if (error) throw new Error(error.message || "Falha ao listar campanhas.");
  return (data as any[]) || [];
};

export const createEmailCampaign = async (params: { name: string; subject: string; body: string; segment: EmailCampaignSegment; scheduledAt?: string }) => {
  if (blockDemoWrite("Criar campanha")) return;
  const { data, error } = await supabase.functions.invoke("admin-email-campaigns", {
    body: { action: "create", name: params.name, subject: params.subject, body: params.body, segment: params.segment, scheduled_at: params.scheduledAt },
  });
  if (error) throw new Error(error.message || "Falha ao criar campanha.");
  return data as EmailCampaignRow;
};

export const updateEmailCampaign = async (params: { campaignId: string; name?: string; subject?: string; body?: string; segment?: EmailCampaignSegment; scheduledAt?: string | null; status?: "draft" | "scheduled" }) => {
  if (blockDemoWrite("Atualizar campanha")) return;
  const { data, error } = await supabase.functions.invoke("admin-email-campaigns", {
    body: {
      action: "update",
      campaign_id: params.campaignId,
      name: params.name,
      subject: params.subject,
      body: params.body,
      segment: params.segment,
      scheduled_at: params.scheduledAt,
      status: params.status,
    },
  });
  if (error) throw new Error(error.message || "Falha ao atualizar campanha.");
  return data as EmailCampaignRow;
};

export const sendEmailCampaignNow = async (campaignId: string) => {
  if (blockDemoWrite("Enviar campanha")) return;
  const { data, error } = await supabase.functions.invoke("admin-email-campaigns", { body: { action: "send-now", campaign_id: campaignId } });
  if (error) throw new Error(error.message || "Falha ao enfileirar campanha.");
  return data as any;
};

export const cancelEmailCampaign = async (campaignId: string) => {
  if (blockDemoWrite("Cancelar campanha")) return;
  const { data, error } = await supabase.functions.invoke("admin-email-campaigns", { body: { action: "cancel", campaign_id: campaignId } });
  if (error) throw new Error(error.message || "Falha ao cancelar campanha.");
  return data as any;
};

export const deleteEmailCampaign = async (campaignId: string) => {
  if (blockDemoWrite("Excluir campanha")) return;
  const { data, error } = await supabase.functions.invoke("admin-email-campaigns", { body: { action: "delete", campaign_id: campaignId } });
  if (error) throw new Error(error.message || "Falha ao excluir campanha.");
  return data as any;
};

export const listEmailOutbox = async (limit = 50): Promise<EmailOutboxJob[]> => {
  const response = await fetch(`/api/admin/email/outbox?limit=${encodeURIComponent(String(limit))}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error?.message || payload?.error || "Falha ao carregar fila de e-mails.");
  return (payload?.data ?? []) as EmailOutboxJob[];
};

export const listEmailLogs = async (outboxId: string, limit = 50): Promise<EmailLogEntry[]> => {
  const response = await fetch(`/api/admin/email/outbox/${encodeURIComponent(outboxId)}/logs?limit=${encodeURIComponent(String(limit))}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error?.message || payload?.error || "Falha ao carregar logs do e-mail.");
  return (payload?.data ?? []) as EmailLogEntry[];
};

export const requeueEmailOutbox = async (outboxId: string) => {
  const response = await fetch(`/api/admin/email/outbox/${encodeURIComponent(outboxId)}/requeue`, {
    method: "POST",
    credentials: "include",
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error?.message || payload?.error || "Falha ao reenfileirar e-mail.");
};

export const cancelEmailOutbox = async (outboxId: string) => {
  const response = await fetch(`/api/admin/email/outbox/${encodeURIComponent(outboxId)}/cancel`, {
    method: "POST",
    credentials: "include",
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error?.message || payload?.error || "Falha ao cancelar e-mail.");
};

// ═══════════════════════════════════════════════════
// PLATFORM SETTINGS
// ═══════════════════════════════════════════════════

// Promise-level deduplication: if multiple callers request settings
// simultaneously, they share the same in-flight promise.
let _settingsPromise: Promise<PlatformSettings> | null = null;
let _settingsCache: { data: PlatformSettings; ts: number } | null = null;
const SETTINGS_TTL = 5 * 60 * 1000; // 5 min

export const getPlatformSettings = async (): Promise<PlatformSettings> => {
  if (isDemo()) return demoPlatformSettings;

  // Return cached if fresh
  if (_settingsCache && Date.now() - _settingsCache.ts < SETTINGS_TTL) {
    return _settingsCache.data;
  }

  // Deduplicate concurrent calls
  if (_settingsPromise) return _settingsPromise;

  _settingsPromise = (async () => {
    try {
      const res = await fetch("/api/public/platform-settings", { credentials: "omit" });
      const json = await res.json().catch(() => null);
      if (!res.ok || json?.error) throw new Error(json?.error?.message || "Failed to load platform settings");
      const result = mapSettingsData(json?.data);
      _settingsCache = { data: result, ts: Date.now() };
      return result;
    } finally {
      _settingsPromise = null;
    }
  })();

  return _settingsPromise;
};

/** Invalidate the in-memory cache (e.g. after admin updates settings) */
export const invalidateSettingsCache = () => {
  _settingsCache = null;
};

const mapSettingsData = (data: any): PlatformSettings => {
  if (!data) {
    return {
      platformName: "Plataforma Digital", platformUrl: "", supportEmail: "",
      description: "", maintenanceMode: false, registrationOpen: true,
      emailVerification: false, twoFactor: false, language: "pt-BR",
      termsOfUse: "", privacyPolicy: "", requireTermsAcceptance: false,
      logoUrl: "", darkLogoUrl: "", whiteLogoUrl: "", faviconUrl: "", palette: "violet", neonMode: false, glowMode: false,
      minWithdrawal: 50, maxWithdrawal: 10000, withdrawalFeeType: "percent" as const, withdrawalFeePercent: 0, withdrawalProcessingDays: 3, withdrawalPixEnabled: true, withdrawalTedEnabled: true,
    };
  }

  const d = data as any;
  return {
    platformName: d.platform_name,
    platformUrl: d.platform_url,
    supportEmail: d.support_email,
    description: d.description,
    maintenanceMode: d.maintenance_mode,
    registrationOpen: d.registration_open,
    emailVerification: d.email_verification,
    twoFactor: d.two_factor,
    language: d.language,
    termsOfUse: d.terms_of_use,
    privacyPolicy: d.privacy_policy,
    requireTermsAcceptance: d.require_terms_acceptance,
    logoUrl: d.logo_url ?? "",
    darkLogoUrl: d.dark_logo_url ?? "",
    whiteLogoUrl: d.white_logo_url ?? "",
    faviconUrl: d.favicon_url ?? "",
    palette: d.palette ?? "violet",
    neonMode: d.neon_mode ?? false,
    glowMode: d.glow_mode ?? false,
    minWithdrawal: d.min_withdrawal ?? 50,
    maxWithdrawal: d.max_withdrawal ?? 10000,
    withdrawalFeeType: (d.withdrawal_fee_type ?? "percent") as "percent" | "fixed",
    withdrawalFeePercent: d.withdrawal_fee_percent ?? 0,
    withdrawalProcessingDays: d.withdrawal_processing_days ?? 3,
    withdrawalPixEnabled: d.withdrawal_pix_enabled ?? true,
    withdrawalTedEnabled: d.withdrawal_ted_enabled ?? true,
  };
};

export const updatePlatformSettings = async (settings: Partial<PlatformSettings>) => {
  if (blockDemoWrite("Configurações da plataforma")) return;

  // Enterprise hardening: legal docs are updated through a dedicated admin endpoint
  // (scoped payload + audit trail) instead of the generic /db/query client.
  const legalPayload: Record<string, any> = {};
  if (settings.termsOfUse !== undefined) legalPayload.terms_of_use = settings.termsOfUse;
  if (settings.privacyPolicy !== undefined) legalPayload.privacy_policy = settings.privacyPolicy;
  if (settings.requireTermsAcceptance !== undefined) legalPayload.require_terms_acceptance = settings.requireTermsAcceptance;

  if (Object.keys(legalPayload).length) {
    const res = await fetch("/api/admin/legal", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(legalPayload),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || json?.error) throw new Error(json?.error?.message || "Falha ao salvar Termos/Privacidade.");
  }

  const authPayload: Record<string, any> = {};
  if (settings.emailVerification !== undefined) authPayload.email_verification = settings.emailVerification;
  if (settings.twoFactor !== undefined) authPayload.two_factor = settings.twoFactor;

  if (Object.keys(authPayload).length) {
    const res = await fetch("/api/admin/platform-auth-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(authPayload),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || json?.error) throw new Error(json?.error?.message || "Falha ao salvar regras de autenticação.");
  }

  const payload: Record<string, any> = {};
  if (settings.platformName !== undefined) payload.platform_name = settings.platformName;
  if (settings.platformUrl !== undefined) payload.platform_url = settings.platformUrl;
  if (settings.supportEmail !== undefined) payload.support_email = settings.supportEmail;
  if (settings.description !== undefined) payload.description = settings.description;
  if (settings.maintenanceMode !== undefined) payload.maintenance_mode = settings.maintenanceMode;
  if (settings.registrationOpen !== undefined) payload.registration_open = settings.registrationOpen;
  if (settings.language !== undefined) payload.language = settings.language;
  if (settings.logoUrl !== undefined) payload.logo_url = settings.logoUrl;
  if (settings.darkLogoUrl !== undefined) payload.dark_logo_url = settings.darkLogoUrl;
  if (settings.whiteLogoUrl !== undefined) payload.white_logo_url = settings.whiteLogoUrl;
  if (settings.faviconUrl !== undefined) payload.favicon_url = settings.faviconUrl;
  if (settings.palette !== undefined) payload.palette = settings.palette;
  if (settings.neonMode !== undefined) payload.neon_mode = settings.neonMode;
  if (settings.glowMode !== undefined) payload.glow_mode = settings.glowMode;
  if (settings.minWithdrawal !== undefined) payload.min_withdrawal = settings.minWithdrawal;
  if (settings.maxWithdrawal !== undefined) payload.max_withdrawal = settings.maxWithdrawal;
  if (settings.withdrawalFeeType !== undefined) payload.withdrawal_fee_type = settings.withdrawalFeeType;
  if (settings.withdrawalFeePercent !== undefined) payload.withdrawal_fee_percent = settings.withdrawalFeePercent;
  if (settings.withdrawalProcessingDays !== undefined) payload.withdrawal_processing_days = settings.withdrawalProcessingDays;
  if (settings.withdrawalPixEnabled !== undefined) payload.withdrawal_pix_enabled = settings.withdrawalPixEnabled;
  if (settings.withdrawalTedEnabled !== undefined) payload.withdrawal_ted_enabled = settings.withdrawalTedEnabled;

  // If only legal payload changed, we're done.
  if (!Object.keys(payload).length) {
    invalidateSettingsCache();
    return;
  }

  const { error } = await supabase
    .from("platform_settings")
    .update(payload as any)
    .not("id", "is", null);

  if (error) throw error;
  invalidateSettingsCache();
};

// ═══════════════════════════════════════════════════
// REWARDS & ACHIEVEMENTS
// ═══════════════════════════════════════════════════

export const getRewards = async (): Promise<Reward[]> => {
  if (isDemo()) return demoRewards;
  const response = await fetch("/api/admin/rewards", {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error?.message || payload?.error || "Request failed");
  return (payload?.data ?? []) as Reward[];
};

export const createReward = async (reward: Omit<Reward, "id">) => {
  if (blockDemoWrite("Criar conquista")) return;
  const response = await fetch("/api/admin/rewards", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(reward),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error?.message || payload?.error || "Request failed");
};

export const updateReward = async (id: string, reward: Partial<Reward>) => {
  if (blockDemoWrite("Editar conquista")) return;
  const response = await fetch(`/api/admin/rewards/${encodeURIComponent(id)}`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(reward),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error?.message || payload?.error || "Request failed");
};

export const deleteReward = async (id: string) => {
  if (blockDemoWrite("Excluir conquista")) return;
  const response = await fetch(`/api/admin/rewards/${encodeURIComponent(id)}`, {
    method: "DELETE",
    credentials: "include",
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error?.message || payload?.error || "Request failed");
};

export const getRewardClaims = async (): Promise<RewardClaim[]> => {
  if (isDemo()) return demoRewardClaims;
  const response = await fetch("/api/admin/reward-claims", {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error?.message || payload?.error || "Request failed");
  return (payload?.data ?? []) as RewardClaim[];
};

export const markRewardClaimSent = async (claimId: string) => {
  if (blockDemoWrite("Marcar como enviado")) return;
  const response = await fetch(`/api/admin/reward-claims/${encodeURIComponent(claimId)}/mark-sent`, {
    method: "POST",
    credentials: "include",
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error?.message || payload?.error || "Request failed");
};

// ═══════════════════════════════════════════════════
// PLATFORM UPDATES (changelog)
// ═══════════════════════════════════════════════════

export const getUpdates = async (): Promise<UpdateEntry[]> => {
  if (isDemo()) return demoUpdates;
  const response = await fetch("/api/admin/platform-updates", {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error?.message || payload?.error || "Request failed");
  return (payload?.data ?? []) as UpdateEntry[];
};

export const createUpdate = async (entry: Omit<UpdateEntry, "id">) => {
  if (blockDemoWrite("Criar atualização")) return;
  const response = await fetch("/api/admin/platform-updates", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(entry),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error?.message || payload?.error || "Request failed");
};

export const deleteUpdate = async (id: string) => {
  if (blockDemoWrite("Excluir atualização")) return;
  const response = await fetch(`/api/admin/platform-updates/${encodeURIComponent(id)}`, {
    method: "DELETE",
    credentials: "include",
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error?.message || payload?.error || "Request failed");
};
