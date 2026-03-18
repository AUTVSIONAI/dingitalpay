import { supabase } from "@/integrations/supabase/client";
import { isDemo, blockDemoWrite } from "@/lib/demo-utils";
import { demoWithdrawals } from "@/data/customer-stubs";
import { demoAdminWithdrawals } from "@/data/customer-stubs";

// ============= Types =============

export interface BankInfo {
  type: "PIX" | "TED";
  pixKey?: string;
  bankName?: string;
  agency?: string;
  account?: string;
  holder?: string;
}

export interface DbWithdrawal {
  id: string;
  seller_id: string;
  amount: number;
  fee_amount: number;
  net_amount: number;
  method: "PIX" | "TED";
  status: "pending" | "in_review" | "approved" | "rejected";
  bank_info: BankInfo;
  rejection_reason: string;
  requested_at: string;
  processed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbWithdrawalStatusHistory {
  id: string;
  withdrawal_id: string;
  status: "pending" | "in_review" | "approved" | "rejected";
  note: string;
  created_at: string;
}

export interface WithdrawalWithHistory extends DbWithdrawal {
  statusHistory: DbWithdrawalStatusHistory[];
}

export const MINIMUM_WITHDRAWAL = 50;

// ============= Fetch =============

export const fetchSellerWithdrawals = async (): Promise<WithdrawalWithHistory[]> => {
  if (isDemo()) return demoWithdrawals;
  const response = await fetch("/api/seller/withdrawals", {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error?.message || payload?.error || "Request failed");
  return ((payload?.data ?? []) as WithdrawalWithHistory[]).map((row) => ({
    ...row,
    statusHistory: row.statusHistory || [],
  }));
};

// ============= Create =============

export const createWithdrawalRequest = async (params: {
  seller_id: string;
  amount: number;
  method: "PIX" | "TED";
  bank_info: BankInfo;
}): Promise<WithdrawalWithHistory> => {
  const response = await fetch("/api/seller/withdrawals", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error?.message || payload?.error || "Request failed");
  const withdrawal = payload?.data as DbWithdrawal;
  return {
    ...withdrawal,
    statusHistory: [
      {
        id: "",
        withdrawal_id: withdrawal.id,
        status: "pending",
        note: "Solicitação recebida",
        created_at: withdrawal.requested_at,
      },
    ],
  };
};

// ============= Metrics (Seller) =============

export interface WithdrawalMetrics {
  availableBalance: number;
  pending: number;
  totalWithdrawn: number;
  lastWithdrawal: number | null;
  lastWithdrawalDate: string | null;
}

export const computeWithdrawalMetrics = async (
  withdrawals: WithdrawalWithHistory[]
): Promise<WithdrawalMetrics> => {
  if (isDemo()) {
    return {
      availableBalance: 100990,
      pending: 4300,
      totalWithdrawn: 8200,
      lastWithdrawal: 3200,
      lastWithdrawalDate: new Date(Date.now() - 6 * 86400000).toISOString(),
    };
  }

  const response = await fetch("/api/seller/withdrawals/metrics", {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error?.message || payload?.error || "Request failed");
  return payload?.data as WithdrawalMetrics;
};

// ============= Admin: Fetch All =============

export interface AdminWithdrawalRow extends DbWithdrawal {
  statusHistory: DbWithdrawalStatusHistory[];
  sellerName: string;
  sellerEmail: string;
}

export interface AdminWithdrawalMetrics {
  totalPending: number;
  totalPendingCount: number;
  totalInReview: number;
  totalInReviewCount: number;
  totalApproved: number;
  totalApprovedCount: number;
  totalRejectedCount: number;
  totalVolume: number;
}

export const fetchAllWithdrawals = async (): Promise<AdminWithdrawalRow[]> => {
  if (isDemo()) return demoAdminWithdrawals;
  const response = await fetch("/api/admin/withdrawals", {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error?.message || payload?.error || "Request failed");
  return (payload?.data ?? []) as AdminWithdrawalRow[];
};

export const computeAdminWithdrawalMetrics = (withdrawals: AdminWithdrawalRow[]): AdminWithdrawalMetrics => {
  const pendingItems = withdrawals.filter((w) => w.status === "pending");
  const inReviewItems = withdrawals.filter((w) => w.status === "in_review");
  const approvedItems = withdrawals.filter((w) => w.status === "approved");
  const rejectedItems = withdrawals.filter((w) => w.status === "rejected");

  return {
    totalPending: pendingItems.reduce((s, w) => s + Number(w.net_amount), 0),
    totalPendingCount: pendingItems.length,
    totalInReview: inReviewItems.reduce((s, w) => s + Number(w.net_amount), 0),
    totalInReviewCount: inReviewItems.length,
    totalApproved: approvedItems.reduce((s, w) => s + Number(w.net_amount), 0),
    totalApprovedCount: approvedItems.length,
    totalRejectedCount: rejectedItems.length,
    totalVolume: withdrawals.reduce((s, w) => s + Number(w.net_amount), 0),
  };
};

// ============= Admin: Update Status =============

export const updateWithdrawalStatus = async (
  id: string,
  status: "pending" | "in_review" | "approved" | "rejected",
  note?: string,
  rejectionReason?: string
): Promise<void> => {
  if (blockDemoWrite("Atualizar status de saque")) return;
  const response = await fetch(`/api/admin/withdrawals/${encodeURIComponent(id)}/status`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, note, reason: rejectionReason }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error?.message || payload?.error || "Request failed");
};
