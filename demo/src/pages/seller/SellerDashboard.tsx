import { useState } from "react";
import PageContent from "@/components/layout/PageContent";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usePageMeta } from "@/contexts/PageMetaContext";
import StatCard from "@/components/shared/StatCard";
import ChartCard from "@/components/shared/ChartCard";
import TabsPeriodSelector from "@/components/shared/TabsPeriodSelector";
import DataTable, { DataTableColumn } from "@/components/shared/DataTable";
import StatusBadge from "@/components/shared/StatusBadge";
import LoadingState from "@/components/shared/LoadingState";
import EmptyState from "@/components/shared/EmptyState";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { DollarSign, ShoppingCart, TrendingUp, Eye, Trophy, Gift, CheckCircle2, Clock, PackageCheck, Award, ChevronRight, CreditCard, QrCode, FileText } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  claimSellerReward, fetchSellerDashboardSummary, fetchSellerRecentSales,
  type SellerRecentSale,
} from "@/services/seller.service";
import { useAuth } from "@/contexts/AuthContext";

const formatCurrency = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const salesColumns: DataTableColumn<SellerRecentSale>[] = [
  { key: "buyer", header: "Comprador" },
  { key: "product", header: "Produto" },
  { key: "amount", header: "Valor", className: "text-right" },
  { key: "method", header: "Método" },
  { key: "status", header: "Status", render: (row) => <StatusBadge status={row.status as any} /> },
  { key: "date", header: "Quando", className: "text-right" },
];

const methodIcons: Record<string, React.ReactNode> = {
  pix: <QrCode className="h-4 w-4 text-primary" />,
  credit_card: <CreditCard className="h-4 w-4 text-primary" />,
  boleto: <FileText className="h-4 w-4 text-primary" />,
};

const periodToDays: Record<string, number> = { today: 1, "7d": 7, "30d": 30 };

const getRewardProgressPercent = (currentRevenue: number, minRevenue: number, maxRevenue: number) => {
  const safeMin = Number(minRevenue || 0);
  const safeMax = Number(maxRevenue || 0);
  const range = safeMax - safeMin;

  if (!Number.isFinite(range) || range <= 0) {
    return currentRevenue >= safeMax ? 100 : 0;
  }

  const rawPercent = ((currentRevenue - safeMin) / range) * 100;
  return Math.max(0, Math.min(100, Math.round(rawPercent)));
};

const getNextRewardProgressPercent = (
  currentRevenue: number,
  rewards: Array<{ maxRevenue: number }>,
  nextReward: { id: string; maxRevenue: number } | undefined
) => {
  if (!nextReward) return 100;

  const previousUnlocked = [...rewards]
    .filter((reward) => reward.maxRevenue < nextReward.maxRevenue && currentRevenue >= reward.maxRevenue)
    .sort((a, b) => b.maxRevenue - a.maxRevenue)[0];

  const lowerBound = previousUnlocked?.maxRevenue ?? 0;
  return getRewardProgressPercent(currentRevenue, lowerBound, nextReward.maxRevenue);
};

const SellerDashboard = () => {
  const [period, setPeriod] = useState("today");
  const [sheetOpen, setSheetOpen] = useState(false);
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const sellerScope = user?.id || "anonymous";

  usePageMeta([{ label: "Vendedor", path: "/app" }, { label: "Dashboard" }], "Dashboard");

  const { data: dashboardSummary, isLoading: loadingMetrics } = useQuery({
    queryKey: ["seller-dashboard-summary", sellerScope, period],
    queryFn: () => fetchSellerDashboardSummary(periodToDays[period] || 7),
    enabled: Boolean(user?.id),
  });

  const { data: recentSales = [] } = useQuery({
    queryKey: ["seller-recent-sales", sellerScope],
    queryFn: fetchSellerRecentSales,
    enabled: Boolean(user?.id),
  });

  // Claim reward mutation
  const claimMutation = useMutation({
    mutationFn: (rewardId: string) => claimSellerReward(rewardId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["seller-dashboard-summary", sellerScope] });
    },
  });

  if (loadingMetrics) return <LoadingState />;

  const m = dashboardSummary?.metrics ?? { revenue: 0, approvedSales: 0, totalOrders: 0, conversionRate: 0 };
  const chartData = dashboardSummary?.chartData ?? [];
  const paymentBreakdown = dashboardSummary?.paymentBreakdown ?? [];
  const rewardProgress = dashboardSummary?.rewardProgress ?? { currentRevenue: m.revenue, rewards: [] };
  const rewardClaims = dashboardSummary?.rewardClaims ?? [];

  // Reward calculations
  const sortedRewards = [...(rewardProgress?.rewards ?? [])].sort((a, b) => a.maxRevenue - b.maxRevenue);
  const currentRevenue = rewardProgress?.currentRevenue ?? 0;
  const rewardClaimByRewardId = new Map<string, { id: string; status: "pending" | "sent"; claimedAt: string; sentAt: string | null }>();
  for (const claim of rewardClaims) {
    if (!rewardClaimByRewardId.has(claim.rewardId)) {
      rewardClaimByRewardId.set(claim.rewardId, claim);
    }
  }
  const unlockedRewards = sortedRewards.filter((r) => currentRevenue >= r.maxRevenue);
  const nextReward = sortedRewards.find((r) => currentRevenue < r.maxRevenue);
  const progressPercent = getNextRewardProgressPercent(currentRevenue, sortedRewards, nextReward);

  const claimableReward = sortedRewards.find(
    (r) => currentRevenue >= r.maxRevenue && r.type === "delivery" && !rewardClaimByRewardId.has(r.id)
  );
  const pendingDeliveryClaim = sortedRewards
    .filter((reward) => reward.type === "delivery")
    .map((reward) => rewardClaimByRewardId.get(reward.id))
    .find((claim) => claim?.status === "pending");
  const sentDeliveryClaim = sortedRewards
    .filter((reward) => reward.type === "delivery")
    .map((reward) => rewardClaimByRewardId.get(reward.id))
    .find((claim) => claim?.status === "sent");

  return (
    <PageContent>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Faturamento" value={formatCurrency(m.revenue)} subtitle="aprovado" icon={<DollarSign className="h-5 w-5" />} />
        <StatCard label="Vendas aprovadas" value={String(m.approvedSales)} subtitle={`de ${m.totalOrders} total`} icon={<ShoppingCart className="h-5 w-5" />} />
        <StatCard label="Taxa de conversão" value={`${m.conversionRate.toFixed(1)}%`} subtitle="aprovadas/(aprovadas + pendentes)" icon={<TrendingUp className="h-5 w-5" />} />
        <StatCard label="Total de pedidos" value={String(m.totalOrders)} subtitle="todos os status" icon={<Eye className="h-5 w-5" />} />
      </div>

      <div className="flex flex-col lg:flex-row gap-4 mb-6">
        <ChartCard title="Vendas por dia" subtitle="Receita aprovada no período"
          action={<TabsPeriodSelector periods={[{ label: "Hoje", value: "today" }, { label: "7d", value: "7d" }, { label: "30d", value: "30d" }]} selected={period} onSelect={setPeriod} />}
          className="lg:w-[70%] w-full"
        >
          <div className="h-64">
            {chartData.length === 0 ? (
              <EmptyState icon={<ShoppingCart className="h-8 w-8" />} title="Sem dados" description="Nenhuma venda no período." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="sellerGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `R$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "13px" }}
                    formatter={(value: number) => [`R$ ${value.toLocaleString("pt-BR")}`, "Receita"]} />
                  <Area type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#sellerGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </ChartCard>

        {/* Reward Progress Card */}
        <div className="rounded-lg border border-border bg-card p-5 lg:w-[30%] w-full flex flex-col">
          <div className="flex items-center gap-2 mb-4">
            <Trophy className="h-5 w-5 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Premiações por Faturamento</h3>
          </div>

          <div className="mb-2">
            <span className="text-xs text-muted-foreground">Seu faturamento: <span className="font-medium text-foreground">{formatCurrency(currentRevenue)}</span></span>
          </div>
          <div className="mb-1">
            {nextReward ? (
              <span className="text-xs text-muted-foreground">Próxima meta: <span className="font-medium text-foreground">{formatCurrency(nextReward.maxRevenue)}</span></span>
            ) : sortedRewards.length > 0 ? (
              <span className="text-xs font-medium text-green-600">Todas as metas atingidas! 🎉</span>
            ) : (
              <span className="text-xs text-muted-foreground">Nenhuma recompensa disponível.</span>
            )}
          </div>
          <Progress value={progressPercent} className="h-2.5 my-3" />

          <span className="text-xs text-muted-foreground mb-3">
            {unlockedRewards.length} de {sortedRewards.length} recompensas desbloqueadas
          </span>

          <div className="flex flex-col gap-2 mt-auto">
            <Button variant="outline" size="sm" className="gap-1.5 w-full" onClick={() => setSheetOpen(true)}>
              <Award className="h-3.5 w-3.5" />
              Ver recompensas
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
            {claimableReward ? (
              <Button size="sm" className="gap-1.5 w-full" onClick={() => claimMutation.mutate(claimableReward.id)} disabled={claimMutation.isPending}>
                <Gift className="h-3.5 w-3.5" />
                Resgatar recompensa
              </Button>
            ) : pendingDeliveryClaim ? (
              <Button size="sm" variant="secondary" disabled className="gap-1.5 w-full">
                <Clock className="h-3.5 w-3.5" />
                Solicitado — Envio Pendente
              </Button>
            ) : sentDeliveryClaim ? (
              <Button size="sm" variant="secondary" disabled className="gap-1.5 w-full">
                <PackageCheck className="h-3.5 w-3.5" />
                Recompensa enviada
              </Button>
            ) : (
              <Button size="sm" variant="secondary" disabled className="gap-1.5 w-full">
                <Gift className="h-3.5 w-3.5" />
                Resgatar recompensa
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Rewards Detail Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="sm:max-w-md overflow-y-auto">
          <SheetHeader className="mb-5">
            <SheetTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-primary" />
              Suas Recompensas
            </SheetTitle>
            <SheetDescription>
              Faturamento atual: <span className="font-semibold text-foreground">{formatCurrency(currentRevenue)}</span>
            </SheetDescription>
          </SheetHeader>

          {sortedRewards.length === 0 ? (
            <EmptyState icon={<Trophy className="h-8 w-8" />} title="Sem recompensas" description="Nenhuma recompensa configurada." />
          ) : (
            <div className="space-y-3">
              {sortedRewards.map((r) => {
                const isUnlocked = currentRevenue >= r.maxRevenue;
                const isCurrent = nextReward?.id === r.id;
                const rewardClaim = rewardClaimByRewardId.get(r.id);
                const isClaimPending = rewardClaim?.status === "pending";
                const isClaimSent = rewardClaim?.status === "sent";
                const isDelivery = r.type === "delivery";

                return (
                  <div
                    key={r.id}
                    className={`flex items-start gap-3 rounded-lg border p-3 transition-all ${
                      isUnlocked ? "border-green-500/30 bg-green-500/5"
                        : isCurrent ? "border-primary/30 bg-primary/5"
                        : "border-border bg-muted/30 opacity-60"
                    }`}
                  >
                    <div className="h-10 w-10 shrink-0 rounded-full bg-muted flex items-center justify-center">
                      {isDelivery ? <Gift className="h-4 w-4 text-primary" /> : <Trophy className="h-4 w-4 text-primary" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="text-sm font-medium text-foreground truncate">{r.name}</p>
                        {isUnlocked && <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-600" />}
                      </div>
                      <p className="text-xs text-muted-foreground mb-1">{r.description}</p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-[10px]">
                          {formatCurrency(r.minRevenue)} — {formatCurrency(r.maxRevenue)}
                        </Badge>
                        <Badge variant="secondary" className="text-[10px]">
                          {isDelivery ? "Entrega" : "Parabenização"}
                        </Badge>
                        {isUnlocked && isDelivery && isClaimPending && (
                          <Badge className="text-[10px] bg-amber-500/15 text-amber-700 border-amber-500/30 gap-1">
                            <Clock className="h-2.5 w-2.5" />
                            Envio Pendente
                          </Badge>
                        )}
                        {isUnlocked && isDelivery && isClaimSent && (
                          <Badge className="text-[10px] bg-green-500/15 text-green-700 border-green-500/30 gap-1">
                            <PackageCheck className="h-2.5 w-2.5" />
                            Enviado
                          </Badge>
                        )}
                        {isUnlocked && isDelivery && !rewardClaim && (
                          <Badge className="text-[10px] bg-green-500/15 text-green-700 border-green-500/30 gap-1 cursor-pointer hover:bg-green-500/25"
                            onClick={() => claimMutation.mutate(r.id)}>
                            <PackageCheck className="h-2.5 w-2.5" />
                            Solicitar Envio
                          </Badge>
                        )}
                      </div>
                      {isCurrent && (
                        <div className="mt-2">
                          <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                            <span>Progresso</span>
                            <span>{progressPercent}%</span>
                          </div>
                          <Progress value={progressPercent} className="h-1.5" />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Cards de vendas por método de pagamento */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {paymentBreakdown.map((pm) => (
          <div key={pm.method} className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                {methodIcons[pm.method] || <CreditCard className="h-4 w-4 text-primary" />}
              </div>
              <h3 className="text-sm font-semibold text-foreground">{pm.label}</h3>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Quantidade</span>
                <span className="text-sm font-medium text-foreground">{pm.count}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Valor total</span>
                <span className="text-sm font-medium text-foreground">{formatCurrency(pm.total)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Taxa de conversão</span>
                <span className="text-sm font-medium text-foreground">{pm.conversionRate.toFixed(1)}%</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div>
        <h3 className="text-sm font-medium text-foreground mb-3">Últimas vendas</h3>
        {recentSales.length === 0 ? (
          <EmptyState icon={<ShoppingCart className="h-8 w-8" />} title="Nenhuma venda" description="Suas vendas aparecerão aqui." />
        ) : (
          <DataTable columns={salesColumns} data={recentSales} />
        )}
      </div>
    </PageContent>
  );
};

export default SellerDashboard;
