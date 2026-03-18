import { isDemo } from "@/lib/demo-utils";
import { demoOrders } from "@/data/customer-stubs";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";

// ============= Types matching Supabase schema =============
export interface DbOrder {
  id: string;
  seller_id: string;
  product_id: string;
  course_id?: string | null;
  buyer_email: string;
  buyer_name: string;
  buyer_phone: string;
  buyer_cpf: string;
  product_name: string;
  amount: number;
  gross_amount: number;
  platform_fee: number;
  method: "pix" | "boleto" | "credit_card";
  status: "pending" | "approved" | "refunded" | "chargeback" | "abandoned";
  transaction_id: string;
  utm: Record<string, string>;
  created_at: string;
  updated_at: string;
  access_granted?: boolean;
}

// ============= Buyer Purchases =============

export const fetchBuyerPurchases = async (): Promise<DbOrder[]> => {
  const response = await fetch("/api/member/purchases", {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload?.error?.message || payload?.error || "Request failed";
    console.error("fetchBuyerPurchases error:", message);
    if (response.status === 401) return [];
    throw new Error(message);
  }
  return (payload?.data as DbOrder[]) || [];
};

// ============= Metrics (computed from real data) =============

export interface OrderMetrics {
  totalRevenue: number;
  totalCount: number;
  approvedCount: number;
  pendingCount: number;
  refundedCount: number;
  chargebackCount: number;
  conversionRate: number;
}

export interface SellerSalesOverviewFilters {
  search?: string;
  status?: "all" | DbOrder["status"];
  method?: "all" | DbOrder["method"];
  dateRange?: DateRange | undefined;
}

export interface SellerSalesOverview {
  filters: {
    search: string;
    status: "all" | DbOrder["status"];
    method: "all" | DbOrder["method"];
    from: string | null;
    to: string | null;
  };
  metrics: OrderMetrics;
  orders: DbOrder[];
}

export const computeOrderMetrics = (orders: DbOrder[]): OrderMetrics => {
  const approvedOrders = orders.filter((o) => o.status === "approved");
  const pendingOrders = orders.filter((o) => o.status === "pending");
  const totalCount = orders.length;
  const approvedCount = approvedOrders.length;
  const pendingCount = pendingOrders.length;

  return {
    totalRevenue: approvedOrders.reduce((sum, o) => sum + Number(o.amount), 0),
    totalCount,
    approvedCount,
    pendingCount,
    refundedCount: orders.filter((o) => o.status === "refunded").length,
    chargebackCount: orders.filter((o) => o.status === "chargeback").length,
    conversionRate: approvedCount + pendingCount > 0 ? (approvedCount / (approvedCount + pendingCount)) * 100 : 0,
  };
};

function matchesDateRange(order: DbOrder, dateRange?: DateRange): boolean {
  if (!dateRange?.from && !dateRange?.to) return true;
  const createdAt = new Date(order.created_at);
  const createdDay = format(createdAt, "yyyy-MM-dd");
  const from = dateRange?.from ? format(dateRange.from, "yyyy-MM-dd") : null;
  const to = dateRange?.to ? format(dateRange.to, "yyyy-MM-dd") : null;
  if (from && createdDay < from) return false;
  if (to && createdDay > to) return false;
  return true;
}

function filterSellerOrdersForOverview(orders: DbOrder[], filters: SellerSalesOverviewFilters): DbOrder[] {
  const search = String(filters.search || "").trim().toLowerCase();
  const status = filters.status || "all";
  const method = filters.method || "all";

  return orders.filter((order) => {
    const matchesSearch = !search
      || order.buyer_name.toLowerCase().includes(search)
      || order.buyer_email.toLowerCase().includes(search)
      || order.buyer_phone.toLowerCase().includes(search)
      || order.buyer_cpf.toLowerCase().includes(search)
      || order.product_name.toLowerCase().includes(search)
      || String(order.transaction_id || "").toLowerCase().includes(search)
      || order.id.toLowerCase().includes(search);
    const matchesStatus = status === "all" || order.status === status;
    const matchesMethod = method === "all" || order.method === method;
    return matchesSearch && matchesStatus && matchesMethod && matchesDateRange(order, filters.dateRange);
  });
}

export const fetchSellerSalesOverview = async (filters: SellerSalesOverviewFilters = {}): Promise<SellerSalesOverview> => {
  const normalizedFilters = {
    search: String(filters.search || "").trim(),
    status: filters.status || "all",
    method: filters.method || "all",
    dateRange: filters.dateRange,
  } as const;

  if (isDemo()) {
    const filteredOrders = filterSellerOrdersForOverview(demoOrders as DbOrder[], normalizedFilters);
    return {
      filters: {
        search: normalizedFilters.search,
        status: normalizedFilters.status,
        method: normalizedFilters.method,
        from: normalizedFilters.dateRange?.from ? format(normalizedFilters.dateRange.from, "yyyy-MM-dd") : null,
        to: normalizedFilters.dateRange?.to ? format(normalizedFilters.dateRange.to, "yyyy-MM-dd") : null,
      },
      metrics: computeOrderMetrics(filteredOrders),
      orders: filteredOrders,
    };
  }

  const params = new URLSearchParams();
  if (normalizedFilters.search) params.set("search", normalizedFilters.search);
  if (normalizedFilters.status && normalizedFilters.status !== "all") params.set("status", normalizedFilters.status);
  if (normalizedFilters.method && normalizedFilters.method !== "all") params.set("method", normalizedFilters.method);
  if (normalizedFilters.dateRange?.from) params.set("from", format(normalizedFilters.dateRange.from, "yyyy-MM-dd"));
  if (normalizedFilters.dateRange?.to) params.set("to", format(normalizedFilters.dateRange.to, "yyyy-MM-dd"));

  const response = await fetch(`/api/seller/sales/overview${params.toString() ? `?${params.toString()}` : ""}`, {
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

  return (payload?.data as SellerSalesOverview) || {
    filters: {
      search: normalizedFilters.search,
      status: normalizedFilters.status,
      method: normalizedFilters.method,
      from: null,
      to: null,
    },
    metrics: computeOrderMetrics([]),
    orders: [],
  };
};
