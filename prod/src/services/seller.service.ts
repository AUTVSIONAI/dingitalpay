import { isDemo } from "@/lib/demo-utils";
import { demoSellerMetrics, demoSellerChartData, demoSellerRecentSales, demoPaymentBreakdown } from "@/data/customer-stubs";
import type { Reward } from "@/types/api";
import type { Integration } from "@/types/api";

// ═══════════════════════════════════════════════════
// SELLER DASHBOARD METRICS (real data)
// ═══════════════════════════════════════════════════

export interface SellerDashboardMetrics {
  revenue: number;
  approvedSales: number;
  totalOrders: number;
  conversionRate: number;
}

export interface SellerChartPoint {
  name: string;
  value: number;
}

// ═══════════════════════════════════════════════════
// RECENT SALES (real)
// ═══════════════════════════════════════════════════

export interface SellerRecentSale {
  buyer: string;
  product: string;
  amount: string;
  method: string;
  status: string;
  date: string;
}

const methodLabels: Record<string, string> = { pix: "PIX", credit_card: "Cartão", boleto: "Boleto" };

export const fetchSellerRecentSales = async (): Promise<SellerRecentSale[]> => {
  if (isDemo()) return demoSellerRecentSales;

  const response = await fetch("/api/seller/dashboard/recent-sales", {
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

  return ((payload?.data ?? []) as Array<any>).map((o) => {
    const diff = Date.now() - new Date(o.created_at).getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    const date = mins < 60 ? `Há ${mins}min` : hours < 24 ? `Há ${hours}h` : `Há ${days}d`;

    return {
      buyer: o.buyer_name,
      product: o.product_name,
      amount: `R$ ${Number(o.amount || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      method: methodLabels[o.method] || o.method,
      status: o.status,
      date,
    };
  });
};

export const claimSellerReward = async (rewardId: string) => {
  const response = await fetch(`/api/seller/dashboard/rewards/${encodeURIComponent(rewardId)}/claim`, {
    method: "POST",
    credentials: "include",
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload?.error?.message || payload?.error || "Request failed";
    throw new Error(message);
  }
  return payload?.data ?? null;
};

// ═══════════════════════════════════════════════════
// PAYMENT METHOD BREAKDOWN (real)
// ═══════════════════════════════════════════════════

export interface PaymentMethodBreakdown {
  method: string;
  label: string;
  count: number;
  total: number;
  conversionRate: number;
}

// ═══════════════════════════════════════════════════
// REWARD PROGRESS (real)
// ═══════════════════════════════════════════════════

export interface SellerRewardProgress {
  currentRevenue: number;
  rewards: Reward[];
}

export interface SellerRewardClaimSummary {
  id: string;
  rewardId: string;
  status: "pending" | "sent";
  claimedAt: string;
  sentAt: string | null;
}

export interface SellerDashboardSummary {
  metrics: SellerDashboardMetrics;
  rewardProgress: SellerRewardProgress;
  rewardClaims: SellerRewardClaimSummary[];
  chartData: SellerChartPoint[];
  paymentBreakdown: PaymentMethodBreakdown[];
}

export const fetchSellerDashboardSummary = async (days: number = 7): Promise<SellerDashboardSummary> => {
  if (isDemo()) {
    const { demoRewards } = await import("@/data/customer-stubs");
    return {
      metrics: demoSellerMetrics,
      rewardProgress: {
        currentRevenue: demoSellerMetrics.revenue,
        rewards: demoRewards,
      },
      rewardClaims: [],
      chartData: demoSellerChartData,
      paymentBreakdown: demoPaymentBreakdown,
    };
  }

  const safeDays = Math.max(1, Math.min(30, Math.floor(days)));
  const response = await fetch(`/api/seller/dashboard/summary?days=${safeDays}`, {
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

  return (payload?.data as SellerDashboardSummary) || {
    metrics: { revenue: 0, approvedSales: 0, totalOrders: 0, conversionRate: 0 },
    rewardProgress: { currentRevenue: 0, rewards: [] },
    rewardClaims: [],
    chartData: [],
    paymentBreakdown: demoPaymentBreakdown,
  };
};

// ═══════════════════════════════════════════════════
// INTEGRATIONS (static — no table needed)
// ═══════════════════════════════════════════════════

export const getIntegrations = (): Integration[] => [
  { name: "Webhook", description: "Receba notificações em tempo real via HTTP POST", iconName: "Webhook", connected: true, category: "Automação" },
  { name: "WhatsApp", description: "Conecte seu WhatsApp e envie mensagens automáticas", iconName: "MessageSquare", connected: true, category: "Comunicação" },
  { name: "Zapier", description: "Conecte com 5.000+ apps via Zapier", iconName: "Zap", connected: true, category: "Automação" },
  { name: "API", description: "Integre diretamente com nossa API REST", iconName: "Key", connected: false, category: "Desenvolvimento", comingSoon: true },
];
