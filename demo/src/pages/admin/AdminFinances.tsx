import { useState, useEffect } from "react";
import PageContent from "@/components/layout/PageContent";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usePageMeta } from "@/contexts/PageMetaContext";
import StatCard from "@/components/shared/StatCard";
import DataTable, { DataTableColumn } from "@/components/shared/DataTable";
import FilterBar from "@/components/shared/FilterBar";
import ChartCard from "@/components/shared/ChartCard";
import TabsPeriodSelector from "@/components/shared/TabsPeriodSelector";
import LoadingState from "@/components/shared/LoadingState";
import EmptyState from "@/components/shared/EmptyState";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Landmark, DollarSign, TrendingUp, Percent, Banknote, Save,
  BarChart3, Receipt, Settings, CreditCard, ShoppingCart, Wallet,
} from "lucide-react";
import { maskCurrency, unmaskCurrency } from "@/lib/masks";
import { useToast } from "@/hooks/use-toast";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, PieChart, Pie, Cell,
} from "recharts";
import {
  getPlatformFees, updatePlatformFee, getPlatformFeeLogsSummary, getPlatformFeeChartData,
  getPlatformFeeLogsDetail, PlatformFee, FeeLogSummary, FeeLogDetail, FinanceChartPeriod,
} from "@/services/finance.service";
import { formatDatePtBr } from "@/lib/timezone";

// ========== Fee Config Tab ==========

const methodLabels: Record<string, string> = {
  pix: "PIX",
  credit_card: "Cartão de Crédito",
  boleto: "Boleto",
};

const FeeConfigTab = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: fees = [], isLoading } = useQuery({
    queryKey: ["platform-fees"],
    queryFn: getPlatformFees,
  });

  const [editValues, setEditValues] = useState<Record<string, { feePercent: string; feeFixed: string }>>({});

  useEffect(() => {
    if (fees.length > 0 && Object.keys(editValues).length === 0) {
      const initial: Record<string, { feePercent: string; feeFixed: string }> = {};
      fees.forEach((f) => {
        initial[f.method] = {
          feePercent: String(f.fee_percent),
          feeFixed: maskCurrency(String(Math.round(f.fee_fixed * 100))),
        };
      });
      setEditValues(initial);
    }
  }, [fees]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      for (const fee of fees) {
        const edit = editValues[fee.method];
        if (!edit) continue;
        const percent = Number(edit.feePercent) || 0;
        const fixed = unmaskCurrency(edit.feeFixed);
        await updatePlatformFee(fee.id, percent, fixed);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-fees"] });
      toast({ title: "Taxas atualizadas com sucesso" });
    },
    onError: (err: Error) => {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) return <LoadingState />;

  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-3">
        {fees.map((fee) => {
          const edit = editValues[fee.method] || { feePercent: "0", feeFixed: "R$ 0,00" };

          // Preview calculation
          const previewGross = 100;
          const pct = Number(edit.feePercent) || 0;
          const fix = unmaskCurrency(edit.feeFixed);
          const previewFee = (previewGross * pct / 100) + fix;
          const previewNet = previewGross - previewFee;

          return (
            <Card key={fee.method}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  {fee.method === "pix" && <Banknote className="h-4 w-4" />}
                  {fee.method === "credit_card" && <CreditCard className="h-4 w-4" />}
                  {fee.method === "boleto" && <Receipt className="h-4 w-4" />}
                  {methodLabels[fee.method] || fee.method}
                </CardTitle>
                <CardDescription>Taxa cobrada por transação via {methodLabels[fee.method]?.toLowerCase()}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="flex items-center gap-1">
                      <Percent className="h-3 w-3" /> Percentual (%)
                    </Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step={0.01}
                      value={edit.feePercent}
                      onChange={(e) =>
                        setEditValues((prev) => ({
                          ...prev,
                          [fee.method]: { ...edit, feePercent: e.target.value },
                        }))
                      }
                      placeholder="0.00"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="flex items-center gap-1">
                      <DollarSign className="h-3 w-3" /> Valor fixo (R$)
                    </Label>
                    <Input
                      inputMode="numeric"
                      value={edit.feeFixed}
                      onChange={(e) =>
                        setEditValues((prev) => ({
                          ...prev,
                          [fee.method]: { ...edit, feeFixed: maskCurrency(e.target.value) },
                        }))
                      }
                      placeholder="R$ 0,00"
                    />
                  </div>
                </div>

                <div className="rounded-lg border border-border bg-muted/50 p-3 space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Simulação (venda de R$ 100,00)</p>
                  <div className="text-xs space-y-0.5">
                    <p className="text-foreground">R$ 100,00 − {pct}% = R$ {(previewGross - previewGross * pct / 100).toFixed(2).replace(".", ",")}</p>
                    <p className="text-foreground">R$ {(previewGross - previewGross * pct / 100).toFixed(2).replace(".", ",")} − R$ {fix.toFixed(2).replace(".", ",")} = <span className="font-semibold text-primary">R$ {previewNet.toFixed(2).replace(".", ",")}</span></p>
                    <p className="text-muted-foreground mt-1">Plataforma recebe: <span className="font-semibold text-emerald-600 dark:text-emerald-400">R$ {previewFee.toFixed(2).replace(".", ",")}</span></p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex justify-end">
        <Button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending} className="gap-2">
          <Save className="h-4 w-4" />
          {updateMutation.isPending ? "Salvando..." : "Salvar taxas"}
        </Button>
      </div>
    </div>
  );
};

// ========== Revenue Dashboard Tab ==========

const fmt = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const COLORS = ["hsl(var(--primary))", "hsl(var(--chart-2, 142 71% 45%))", "hsl(var(--chart-3, 35 92% 50%))"];

const RevenueDashboardTab = () => {
  const [period, setPeriod] = useState<FinanceChartPeriod>("year");
  const [typeFilter, setTypeFilter] = useState("all");
  const [methodFilter, setMethodFilter] = useState("all");
  const [search, setSearch] = useState("");

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ["platform-fee-summary"],
    queryFn: getPlatformFeeLogsSummary,
  });

  const { data: logs = [], isLoading: logsLoading } = useQuery({
    queryKey: ["platform-fee-logs-detail"],
    queryFn: getPlatformFeeLogsDetail,
  });

  const { data: chartData = [], isLoading: chartLoading } = useQuery({
    queryKey: ["platform-fee-chart", period],
    queryFn: () => getPlatformFeeChartData(period),
    staleTime: 60_000,
  });

  if (summaryLoading || logsLoading) return <LoadingState />;
  if (!summary) return null;

  const filtered = logs.filter((l) => {
    const matchType = typeFilter === "all" || l.type === typeFilter;
    const matchMethod = methodFilter === "all" || l.method === methodFilter;
    const matchSearch = !search || l.seller_name.toLowerCase().includes(search.toLowerCase());
    return matchType && matchMethod && matchSearch;
  });

  const pieData = [
    { name: "PIX", value: summary.byMethod.pix, color: COLORS[0] },
    { name: "Cartão", value: summary.byMethod.credit_card, color: COLORS[1] },
    { name: "Boleto", value: summary.byMethod.boleto, color: COLORS[2] },
  ].filter((d) => d.value > 0);

  const logColumns: DataTableColumn<FeeLogDetail>[] = [
    { key: "created_at", header: "Data", render: (row) => formatDatePtBr(row.created_at) },
    { key: "seller_name", header: "Vendedor" },
    { key: "type", header: "Tipo", render: (row) => <Badge variant="secondary">{row.type === "transaction" ? "Transação" : "Saque"}</Badge> },
    { key: "method", header: "Método", render: (row) => methodLabels[row.method] || row.method },
    { key: "gross_amount", header: "Valor Bruto", className: "text-right", render: (row) => fmt(row.gross_amount) },
    { key: "fee_amount", header: "Taxa Cobrada", className: "text-right font-medium", render: (row) => <span className="text-emerald-600 dark:text-emerald-400">+{fmt(row.fee_amount)}</span> },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Receita Total (Taxas)"
          value={fmt(summary.totalFees)}
          icon={<DollarSign className="h-5 w-5" />}
          subtitle="todas as taxas"
        />
        <StatCard
          label="Taxas de Transação"
          value={fmt(summary.transactionFees)}
          icon={<ShoppingCart className="h-5 w-5" />}
          subtitle="vendas"
        />
        <StatCard
          label="Taxas de Saque"
          value={fmt(summary.withdrawalFees)}
          icon={<Wallet className="h-5 w-5" />}
          subtitle="saques"
        />
        <StatCard
          label="Total Transações"
          value={summary.totalCount.toLocaleString("pt-BR")}
          icon={<TrendingUp className="h-5 w-5" />}
          subtitle="aprovadas"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <ChartCard
          title="Receita por Período"
          subtitle="Evolução da receita com taxas no intervalo selecionado"
          className="lg:col-span-2"
          action={
            <TabsPeriodSelector
              periods={[
                { label: "Hoje", value: "today" },
                { label: "Ontem", value: "yesterday" },
                { label: "7d", value: "7d" },
                { label: "30d", value: "30d" },
                { label: "6 meses", value: "6m" },
                { label: "Ano", value: "year" },
              ]}
              selected={period}
              onSelect={(value) => setPeriod(value as FinanceChartPeriod)}
            />
          }
        >
          {chartLoading ? (
            <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">
              Carregando receita...
            </div>
          ) : chartData.length === 0 ? (
            <div className="h-64 flex items-center justify-center">
              <EmptyState icon={<BarChart3 className="h-10 w-10 text-muted-foreground" />} title="Sem dados" description="Ainda não há registros de taxas." />
            </div>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="financeRevenueFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `R$${v / 1000}k`} />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "13px" }}
                    formatter={(value: number) => [fmt(value), "Receita"]}
                  />
                  <Area type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#financeRevenueFill)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>

        <ChartCard title="Por Método" subtitle="Distribuição das taxas">
          <div className="h-64 flex flex-col items-center justify-center">
            {pieData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={65} dataKey="value" paddingAngle={3}>
                      {pieData.map((entry, i) => (<Cell key={i} fill={entry.color} />))}
                    </Pie>
                    <Tooltip formatter={(value: number) => [fmt(value), ""]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex items-center gap-4 mt-2">
                  {pieData.map((d) => (
                    <div key={d.name} className="flex items-center gap-1.5">
                      <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                      <span className="text-xs text-muted-foreground">{d.name}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <EmptyState icon={<BarChart3 className="h-10 w-10 text-muted-foreground" />} title="Sem dados" description="Nenhum registro." />
            )}
          </div>
        </ChartCard>
      </div>

      <FilterBar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar por vendedor..."
        filters={[
          {
            label: "Tipo",
            value: typeFilter,
            onChange: setTypeFilter,
            options: [
              { label: "Todos", value: "all" },
              { label: "Transação", value: "transaction" },
              { label: "Saque", value: "withdrawal" },
            ],
          },
          {
            label: "Método",
            value: methodFilter,
            onChange: setMethodFilter,
            options: [
              { label: "Todos", value: "all" },
              { label: "PIX", value: "pix" },
              { label: "Cartão", value: "credit_card" },
              { label: "Boleto", value: "boleto" },
            ],
          },
        ]}
      />

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Receipt className="h-12 w-12" />}
          title="Nenhum registro de taxa"
          description="As taxas cobradas aparecerão aqui conforme as vendas e saques acontecerem."
        />
      ) : (
        <DataTable columns={logColumns} data={filtered} emptyMessage="Nenhum registro encontrado" />
      )}
    </div>
  );
};

// ========== Main Component ==========

const AdminFinances = () => {
  usePageMeta([{ label: "Admin", path: "/admin" }, { label: "Financeiro" }], "Financeiro");

  return (
    <PageContent>
      <Tabs defaultValue="dashboard" className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="dashboard" className="gap-2">
            <Landmark className="h-4 w-4" /> Receita
          </TabsTrigger>
          <TabsTrigger value="fees" className="gap-2">
            <Settings className="h-4 w-4" /> Taxas por Método
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard">
          <RevenueDashboardTab />
        </TabsContent>

        <TabsContent value="fees">
          <FeeConfigTab />
        </TabsContent>
      </Tabs>
    </PageContent>
  );
};

export default AdminFinances;
