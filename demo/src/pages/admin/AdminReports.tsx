import { useState } from "react";
import PageContent from "@/components/layout/PageContent";
import { usePageMeta } from "@/contexts/PageMetaContext";
import { useQuery } from "@tanstack/react-query";
import StatCard from "@/components/shared/StatCard";
import ChartCard from "@/components/shared/ChartCard";
import TabsPeriodSelector from "@/components/shared/TabsPeriodSelector";
import DataTable, { DataTableColumn } from "@/components/shared/DataTable";
import LoadingState from "@/components/shared/LoadingState";
import EmptyState from "@/components/shared/EmptyState";
import { DollarSign, TrendingUp, ShoppingCart, BarChart3, ArrowUpRight, PieChart as PieChartIcon, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, PieChart, Pie, Cell } from "recharts";
import { fetchAdminReportsSummary, getPaymentMethodData, getTopSellers } from "@/services/admin.service";
import type { PaymentMethodStat, TopSeller } from "@/types/api";
import type { AdminRevenuePeriod } from "@/services/admin.service";

const formatCurrency = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const sellerColumns: DataTableColumn<TopSeller>[] = [
  { key: "name", header: "Vendedor" },
  { key: "products", header: "Produtos", className: "text-center" },
  { key: "revenue", header: "Receita", className: "text-right" },
  {
    key: "conversion", header: "Conversão", className: "text-right",
    render: (row) => (<Badge variant="secondary" className="gap-1"><ArrowUpRight className="h-3 w-3" /> {row.conversion}</Badge>),
  },
];

const AdminReports = () => {
  const [period, setPeriod] = useState<AdminRevenuePeriod>("year");

  usePageMeta([{ label: "Admin", path: "/admin" }, { label: "Relatórios" }], "Relatórios & Analytics");

  const { data: reportsSummary, isLoading: summaryLoading } = useQuery({
    queryKey: ["admin-reports-summary", period],
    queryFn: () => fetchAdminReportsSummary(period),
    staleTime: 60_000,
    retry: false,
  });

  const { data: paymentData = [], isLoading: paymentLoading } = useQuery<PaymentMethodStat[]>({
    queryKey: ["admin-reports-payment-methods"],
    queryFn: () => getPaymentMethodData(),
    staleTime: 60_000,
  });

  const { data: topSellers = [], isLoading: topSellersLoading } = useQuery<TopSeller[]>({
    queryKey: ["admin-reports-top-sellers"],
    queryFn: () => getTopSellers(),
    staleTime: 60_000,
  });

  if (summaryLoading || !reportsSummary) return <LoadingState />;

  const metrics = reportsSummary.metrics;
  const revenueData = reportsSummary.chartData;

  return (
    <PageContent>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Receita Total Bruta" value={formatCurrency(metrics.grossTotalRevenue)} subtitle="no período" icon={<DollarSign className="h-5 w-5" />} />
        <StatCard label="Ticket Médio" value={formatCurrency(metrics.avgTicket)} subtitle="por venda aprovada" icon={<TrendingUp className="h-5 w-5" />} />
        <StatCard label="Total de Vendas" value={metrics.totalSales.toLocaleString("pt-BR")} subtitle="aprovadas no período" icon={<ShoppingCart className="h-5 w-5" />} />
        <StatCard label="Taxa de Conversão" value={`${metrics.conversionRate.toFixed(1)}%`} subtitle="desempenho de vendas no período" icon={<BarChart3 className="h-5 w-5" />} />
      </div>

      <ChartCard title="Receita e Vendas por Período" subtitle="Evolução do faturamento no intervalo selecionado"
        action={<TabsPeriodSelector periods={[
          { label: "Hoje", value: "today" },
          { label: "Ontem", value: "yesterday" },
          { label: "7d", value: "7d" },
          { label: "30d", value: "30d" },
          { label: "6 meses", value: "6m" },
          { label: "Ano", value: "year" },
        ]} selected={period} onSelect={(value) => setPeriod(value as AdminRevenuePeriod)} />}
        className="mb-6"
      >
        {revenueData.length === 0 ? (
          <div className="h-72 flex items-center justify-center">
            <EmptyState icon={<BarChart3 className="h-10 w-10 text-muted-foreground" />} title="Sem dados de receita" description="Ainda não há vendas para exibir no gráfico." />
          </div>
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueData}>
                <defs>
                  <linearGradient id="adminReportsRevenueFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `R$${v / 1000}k`} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "13px" }}
                  formatter={(value: number, name: string) => [name === "revenue" ? `R$ ${value.toLocaleString("pt-BR")}` : value.toLocaleString("pt-BR"), name === "revenue" ? "Receita" : "Pedidos"]} />
                <Area type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#adminReportsRevenueFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartCard>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <ChartCard title="Métodos de Pagamento" subtitle="Distribuição das vendas" className="lg:col-span-1">
          <div className="h-56 flex flex-col items-center justify-center">
            {paymentLoading ? (
              <div className="text-sm text-muted-foreground">Carregando métodos...</div>
            ) : paymentData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie data={paymentData} cx="50%" cy="50%" innerRadius={40} outerRadius={65} dataKey="value" paddingAngle={3}>
                      {paymentData.map((entry, i) => (<Cell key={i} fill={entry.color} />))}
                    </Pie>
                    <Tooltip formatter={(value: number) => [`${value}%`, ""]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex items-center gap-4 mt-2">
                  {paymentData.map((m) => (
                    <div key={m.name} className="flex items-center gap-1.5">
                      <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: m.color }} />
                      <span className="text-xs text-muted-foreground">{m.name} ({m.value}%)</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <EmptyState icon={<PieChartIcon className="h-10 w-10 text-muted-foreground" />} title="Sem dados" description="Nenhuma venda registrada ainda." />
            )}
          </div>
        </ChartCard>

        <ChartCard title="Top Vendedores" subtitle="Maiores receitas" className="lg:col-span-2">
          {topSellersLoading ? (
            <div className="h-56 flex items-center justify-center text-sm text-muted-foreground">
              Carregando vendedores...
            </div>
          ) : topSellers.length === 0 ? (
            <EmptyState icon={<Users className="h-10 w-10 text-muted-foreground" />} title="Sem vendedores" description="Nenhum vendedor com vendas registradas." />
          ) : (
            <DataTable columns={sellerColumns} data={topSellers} emptyMessage="Nenhum vendedor com vendas." />
          )}
        </ChartCard>
      </div>
    </PageContent>
  );
};

export default AdminReports;
