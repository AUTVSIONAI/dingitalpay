import { addDays, addMonths, addYears, startOfDay, startOfMonth, startOfYear, subDays, subMonths, subYears } from "date-fns";
import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";
import { isDemo, blockDemoWrite } from "@/lib/demo-utils";
import { demoPlatformFees, demoFeeLogsSummary, demoFeeLogsDetail } from "@/data/customer-stubs";
import { formatDateKey, formatMonthKey, PLATFORM_TZ } from "@/lib/timezone";

// ── Types ──

export interface PlatformFee {
  id: string;
  method: string;
  fee_percent: number;
  fee_fixed: number;
}

export interface FeeLogDetail {
  id: string;
  order_id: string | null;
  withdrawal_id: string | null;
  seller_id: string;
  seller_name: string;
  type: string;
  method: string;
  gross_amount: number;
  fee_amount: number;
  created_at: string;
}

export interface FeeLogSummary {
  totalFees: number;
  transactionFees: number;
  withdrawalFees: number;
  totalCount: number;
  byMethod: Record<string, number>;
  monthlyData: { name: string; value: number }[];
}

export type FinanceChartPeriod = "today" | "yesterday" | "7d" | "30d" | "6m" | "year";

export interface FinanceChartPoint {
  name: string;
  value: number;
}

// ── Platform Fees CRUD ──

export const getPlatformFees = async (): Promise<PlatformFee[]> => {
  if (isDemo()) return demoPlatformFees;
  const response = await fetch("/api/admin/finances/fees", {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error?.message || payload?.error || "Request failed");
  return (payload?.data ?? []) as PlatformFee[];
};

export const updatePlatformFee = async (id: string, feePercent: number, feeFixed: number) => {
  if (blockDemoWrite("Alterar taxas")) return;
  const response = await fetch(`/api/admin/finances/fees/${encodeURIComponent(id)}`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ feePercent, feeFixed }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error?.message || payload?.error || "Request failed");
};

type FeeChartLogRow = {
  created_at: string;
  fee_amount: number | string | null;
  order_id?: string | null;
  withdrawal_id?: string | null;
  type: string;
};

const monthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const buildDemoFinanceChartData = (period: FinanceChartPeriod): FinanceChartPoint[] => {
  const base = demoFeeLogsSummary.monthlyData.length
    ? demoFeeLogsSummary.monthlyData
    : [{ name: "Jan", value: 120 }, { name: "Fev", value: 180 }, { name: "Mar", value: 240 }];

  if (period === "today" || period === "yesterday") {
    const hours = period === "today" ? Number(formatInTimeZone(new Date(), PLATFORM_TZ, "H")) + 1 : 24;
    return Array.from({ length: hours }, (_, index) => ({
      name: `${String(index).padStart(2, "0")}h`,
      value: Math.max(0, Math.round((base[index % base.length]?.value || 0) / 8)),
    }));
  }

  if (period === "7d" || period === "30d") {
    const days = period === "7d" ? 7 : 30;
    return Array.from({ length: days }, (_, index) => {
      const date = subDays(new Date(), days - index - 1);
      return {
        name: formatInTimeZone(date, PLATFORM_TZ, "dd/MM"),
        value: Math.max(0, Math.round((base[index % base.length]?.value || 0) / (period === "7d" ? 2 : 3))),
      };
    });
  }

  if (period === "6m") {
    return Array.from({ length: 6 }, (_, index) => {
      const date = addMonths(startOfMonth(subMonths(new Date(), 5)), index);
      return {
        name: monthNames[Number(formatInTimeZone(date, PLATFORM_TZ, "M")) - 1] || "",
        value: base[index % base.length]?.value || 0,
      };
    });
  }

  return Array.from({ length: 5 }, (_, index) => {
    const date = addYears(startOfYear(subYears(new Date(), 4)), index);
    return {
      name: formatInTimeZone(date, PLATFORM_TZ, "yyyy"),
      value: (base[index % base.length]?.value || 0) * 12,
    };
  });
};

const groupFeeRows = (rows: FeeChartLogRow[], keyFn: (row: FeeChartLogRow) => string) => {
  const grouped: Record<string, number> = {};
  rows.forEach((row) => {
    const key = keyFn(row);
    grouped[key] = (grouped[key] || 0) + Number(row.fee_amount || 0);
  });
  return grouped;
};

// ── Fee Logs Summary ──

export const getPlatformFeeLogsSummary = async (): Promise<FeeLogSummary> => {
  if (isDemo()) return demoFeeLogsSummary;
  const response = await fetch("/api/admin/finances/summary", {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error?.message || payload?.error || "Request failed");
  return payload?.data as FeeLogSummary;
};

export const getPlatformFeeChartData = async (period: FinanceChartPeriod = "year"): Promise<FinanceChartPoint[]> => {
  if (isDemo()) return buildDemoFinanceChartData(period);
  const response = await fetch(`/api/admin/finances/chart?period=${encodeURIComponent(period)}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error?.message || payload?.error || "Request failed");
  return (payload?.data ?? []) as FinanceChartPoint[];
};

// ── Fee Logs Detail ──

export const getPlatformFeeLogsDetail = async (): Promise<FeeLogDetail[]> => {
  if (isDemo()) return demoFeeLogsDetail;
  const response = await fetch("/api/admin/finances/logs", {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error?.message || payload?.error || "Request failed");
  return (payload?.data ?? []) as FeeLogDetail[];
};
