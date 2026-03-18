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
import { Users, DollarSign, ShoppingCart, Package, BarChart3 } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fetchAdminDashboardSummary } from "@/services/admin.service";
import type { AdminDashboardSummary, AdminRecentUser } from "@/types/api";

const formatCurrency = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const productColumns: DataTableColumn<AdminDashboardSummary["topProducts"][number]>[] = [
  { key: "name", header: "Produto" },
  { key: "sales", header: "Vendas", className: "text-right" },
  {
    key: "revenue",
    header: "Receita",
    className: "text-right",
    render: (row) => formatCurrency(row.revenue),
  },
];

const userColumns: DataTableColumn<AdminRecentUser>[] = [
  { key: "name", header: "Nome" },
  { key: "role", header: "Tipo" },
  { key: "date", header: "Quando", className: "text-right" },
];

const AdminDashboard = () => {
  const [period, setPeriod] = useState("month");

  usePageMeta([{ label: "Admin", path: "/admin" }, { label: "Dashboard" }], "Dashboard");

  const { data: dashboardSummary, isLoading } = useQuery({
    queryKey: ["admin-dashboard-summary", period],
    queryFn: () => fetchAdminDashboardSummary(period as "today" | "7d" | "month" | "year"),
  });

  if (isLoading || !dashboardSummary) return <LoadingState />;

  const metrics = dashboardSummary.metrics;
  const chartData = dashboardSummary.chartData;
  const topProducts = dashboardSummary.topProducts;
  const recentUsers = dashboardSummary.recentUsers;

  return (
    <PageContent>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Usuários ativos" value={metrics.activeUsers.toLocaleString("pt-BR")} subtitle="total" icon={<Users className="h-5 w-5" />} />
        <StatCard label="Faturamento total" value={formatCurrency(metrics.totalRevenue)} subtitle="aprovado bruto" icon={<DollarSign className="h-5 w-5" />} />
        <StatCard label="Vendas aprovadas" value={metrics.approvedSales.toLocaleString("pt-BR")} subtitle="total" icon={<ShoppingCart className="h-5 w-5" />} />
        <StatCard label="Produtos ativos" value={metrics.activeProducts.toLocaleString("pt-BR")} subtitle="ativos" icon={<Package className="h-5 w-5" />} />
      </div>

      <ChartCard
        title="Faturamento por período"
        subtitle="Receita total em vendas aprovadas"
        action={
          <TabsPeriodSelector
            periods={[
              { label: "Hoje", value: "today" },
              { label: "7d", value: "7d" },
              { label: "Mês", value: "month" },
              { label: "Ano", value: "year" },
            ]}
            selected={period}
            onSelect={setPeriod}
          />
        }
        className="mb-6"
      >
        {chartData.length === 0 ? (
          <div className="h-64 flex items-center justify-center">
            <EmptyState
              icon={<BarChart3 className="h-10 w-10 text-muted-foreground" />}
              title="Sem dados de faturamento"
              description="Ainda não há vendas aprovadas para exibir no gráfico."
            />
          </div>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `R$${v / 1000}k`} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "13px" }}
                  formatter={(value: number) => [`R$ ${value.toLocaleString("pt-BR")}`, "Receita"]}
                />
                <Area type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#colorValue)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h3 className="text-sm font-medium text-foreground mb-3">Produtos mais vendidos</h3>
          {topProducts.length === 0 ? (
            <EmptyState
              icon={<Package className="h-10 w-10 text-muted-foreground" />}
              title="Nenhum produto"
              description="Ainda não há produtos com vendas registradas."
            />
          ) : (
            <DataTable columns={productColumns} data={topProducts} emptyMessage="Nenhum produto com vendas." />
          )}
        </div>
        <div>
          <h3 className="text-sm font-medium text-foreground mb-3">Últimos usuários cadastrados</h3>
          {recentUsers.length === 0 ? (
            <EmptyState
              icon={<Users className="h-10 w-10 text-muted-foreground" />}
              title="Nenhum usuário"
              description="Ainda não há usuários cadastrados na plataforma."
            />
          ) : (
            <DataTable columns={userColumns} data={recentUsers} emptyMessage="Nenhum usuário cadastrado." />
          )}
        </div>
      </div>
    </PageContent>
  );
};

export default AdminDashboard;
