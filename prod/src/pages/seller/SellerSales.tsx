import { MouseEvent, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import PageContent from "@/components/layout/PageContent";
import { useQuery } from "@tanstack/react-query";
import { usePageMeta } from "@/contexts/PageMetaContext";
import DataTable, { DataTableColumn } from "@/components/shared/DataTable";
import FilterBar from "@/components/shared/FilterBar";
import DateRangePicker from "@/components/shared/DateRangePicker";
import StatusBadge from "@/components/shared/StatusBadge";
import StatCard from "@/components/shared/StatCard";
import LoadingState from "@/components/shared/LoadingState";
import EmptyState from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { DbOrder, fetchSellerSalesOverview } from "@/services/order.service";
import { DollarSign, CheckCircle, Clock, TrendingUp, User, Mail, Phone, CreditCard, Hash, Tag, Globe, ShoppingCart, Receipt, Landmark, ChevronDown } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { formatDatePtBr, formatDateTimePtBr } from "@/lib/timezone";
import { endOfToday, format, startOfMonth, startOfToday } from "date-fns";
import type { DateRange } from "react-day-picker";

type OrderStatus = DbOrder["status"];
type PaymentMethod = DbOrder["method"];

const statusLabels: Record<OrderStatus, string> = { approved: "Aprovado", pending: "Pendente", refunded: "Reembolsado", chargeback: "Chargeback", abandoned: "Abandonado" };
const methodLabels: Record<PaymentMethod, string> = { pix: "PIX", boleto: "Boleto", credit_card: "Cartão" };
const pageSizeOptions = [10, 25, 50, 100, 200] as const;

const columns: DataTableColumn<DbOrder>[] = [
  { key: "id", header: "ID", render: (row) => row.id.slice(0, 8) + "..." },
  { key: "created_at", header: "Data", render: (row) => formatDatePtBr(row.created_at) },
  { key: "buyer_name", header: "Comprador" },
  { key: "product_name", header: "Produto" },
  { key: "amount", header: "Valor Líquido", className: "text-right", render: (row) => `R$ ${Number(row.amount).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
  { key: "method", header: "Pagamento", render: (row) => methodLabels[row.method] },
  { key: "status", header: "Status", render: (row) => <StatusBadge status={row.status} /> },
];

const DetailRow = ({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value?: string | null }) => (
  <div className="flex items-start gap-3 py-2">
    <Icon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium text-foreground break-all">{value ?? "N/A"}</p>
    </div>
  </div>
);

const fmt = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const SellerSales = () => {
  const defaultDateRange = useMemo<DateRange>(() => ({
    from: startOfMonth(startOfToday()),
    to: endOfToday(),
  }), []);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | OrderStatus>("all");
  const [methodFilter, setMethodFilter] = useState<"all" | PaymentMethod>("all");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(defaultDateRange);
  const [pageSize, setPageSize] = useState<number>(25);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedOrder, setSelectedOrder] = useState<DbOrder | null>(null);
  const paginationAnchorRef = useRef<HTMLElement | null>(null);
  const pendingPaginationTopRef = useRef<number | null>(null);
  const deferredSearch = useDeferredValue(search);

  usePageMeta([{ label: "Vendedor", path: "/app" }, { label: "Vendas" }], "Vendas");

  const queryFrom = dateRange?.from ? format(dateRange.from, "yyyy-MM-dd") : "";
  const queryTo = dateRange?.to ? format(dateRange.to, "yyyy-MM-dd") : "";

  const { data: salesOverview, isLoading, isError, error } = useQuery({
    queryKey: ["seller-sales-overview", deferredSearch, statusFilter, methodFilter, queryFrom, queryTo],
    queryFn: () => fetchSellerSalesOverview({
      search: deferredSearch,
      status: statusFilter,
      method: methodFilter,
      dateRange,
    }),
    placeholderData: (previousData) => previousData,
    retry: 0,
  });

  const metrics = salesOverview?.metrics ?? {
    totalRevenue: 0,
    totalCount: 0,
    approvedCount: 0,
    pendingCount: 0,
    refundedCount: 0,
    chargebackCount: 0,
    conversionRate: 0,
  };
  const filtered = salesOverview?.orders ?? [];
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));

  useEffect(() => {
    setCurrentPage(1);
  }, [deferredSearch, statusFilter, methodFilter, queryFrom, queryTo, pageSize]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const visibleOrders = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [currentPage, filtered, pageSize]);

  useLayoutEffect(() => {
    if (pendingPaginationTopRef.current == null || !paginationAnchorRef.current) return;
    const previousTop = pendingPaginationTopRef.current;
    pendingPaginationTopRef.current = null;
    const currentTop = paginationAnchorRef.current.getBoundingClientRect().top;
    const delta = previousTop - currentTop;
    if (delta !== 0) {
      window.scrollBy({ top: delta, behavior: "auto" });
    }
  }, [currentPage, visibleOrders.length, totalPages]);

  const paginationItems = useMemo(() => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, index) => index + 1);
    }

    if (currentPage <= 4) {
      return [1, 2, 3, 4, 5, "...", totalPages] as const;
    }

    if (currentPage >= totalPages - 3) {
      return [1, "...", totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages] as const;
    }

    return [1, "...", currentPage - 1, currentPage, currentPage + 1, "...", totalPages] as const;
  }, [currentPage, totalPages]);

  const handlePageChange = (event: MouseEvent<HTMLElement>, nextPage: number) => {
    event.preventDefault();
    if (event.currentTarget instanceof HTMLElement) {
      event.currentTarget.blur();
    }
    if (nextPage < 1 || nextPage > totalPages || nextPage === currentPage) return;
    pendingPaginationTopRef.current = paginationAnchorRef.current?.getBoundingClientRect().top ?? null;
    setCurrentPage(nextPage);
  };

  if (isLoading) return <LoadingState />;
  if (isError) {
    return (
      <PageContent>
        <EmptyState
          icon={<ShoppingCart className="h-12 w-12" />}
          title="Falha ao carregar vendas"
          description={error instanceof Error ? error.message : "Nao foi possivel buscar os dados de vendas agora."}
        />
      </PageContent>
    );
  }

  const grossAmount = selectedOrder ? Number(selectedOrder.gross_amount || 0) : 0;
  const platformFee = selectedOrder ? Number(selectedOrder.platform_fee || 0) : 0;
  const netAmount = selectedOrder ? Number(selectedOrder.amount) : 0;
  const hasFeeData = grossAmount > 0 && platformFee > 0;

  return (
    <PageContent>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total de Vendas" value={`R$ ${metrics.totalRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} subtitle={`${metrics.totalCount} vendas`} icon={<DollarSign className="h-5 w-5" />} />
        <StatCard label="Aprovadas" value={metrics.approvedCount} icon={<CheckCircle className="h-5 w-5" />} />
        <StatCard label="Pendentes" value={metrics.pendingCount} icon={<Clock className="h-5 w-5" />} />
        <StatCard label="Taxa de Conversão" value={`${metrics.conversionRate.toFixed(1)}%`} icon={<TrendingUp className="h-5 w-5" />} />
      </div>
      <FilterBar searchValue={search} onSearchChange={setSearch} searchPlaceholder="Buscar por comprador, produto ou ID..."
        filters={[
          { label: "Status", value: statusFilter, onChange: setStatusFilter, options: [{ label: "Todos", value: "all" }, ...Object.entries(statusLabels).map(([v, l]) => ({ label: l, value: v }))] },
          { label: "Pagamento", value: methodFilter, onChange: setMethodFilter, options: [{ label: "Todos", value: "all" }, ...Object.entries(methodLabels).map(([v, l]) => ({ label: l, value: v }))] },
        ]}
        actionsClassName="sm:ml-0"
        actions={<DateRangePicker value={dateRange} onChange={setDateRange} placeholder="Selecionar período" className="w-[280px]" />}
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <p className="text-sm text-muted-foreground">
          Mostrando <span className="font-semibold text-foreground">{visibleOrders.length}</span> de{" "}
          <span className="font-semibold text-foreground">{filtered.length}</span> pedidos
        </p>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="w-full justify-between gap-2 sm:w-[180px]">
              {pageSize} itens
              <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[180px]">
            <DropdownMenuRadioGroup value={String(pageSize)} onValueChange={(value) => setPageSize(Number(value))}>
              {pageSizeOptions.map((option) => (
                <DropdownMenuRadioItem key={option} value={String(option)}>
                  {option} itens
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {filtered.length === 0 && !isLoading ? (
        <EmptyState icon={<ShoppingCart className="h-12 w-12" />} title="Nenhuma venda encontrada" description="Suas vendas aparecerão aqui quando seus clientes começarem a comprar." />
      ) : (
        <>
          <DataTable columns={columns} data={visibleOrders} emptyMessage="Nenhuma venda encontrada" onRowClick={(row) => setSelectedOrder(row)} />
          {totalPages > 1 && (
            <Pagination
              className="mt-4 justify-start"
              ref={(node) => {
                paginationAnchorRef.current = node;
              }}
            >
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    className={currentPage === 1 ? "pointer-events-none opacity-50" : undefined}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={(event) => handlePageChange(event, currentPage - 1)}
                  />
                </PaginationItem>
                {paginationItems.map((item, index) => (
                  <PaginationItem key={`${item}-${index}`}>
                    {item === "..." ? (
                      <PaginationEllipsis />
                    ) : (
                      <PaginationLink
                        isActive={item === currentPage}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={(event) => handlePageChange(event, item)}
                      >
                        {item}
                      </PaginationLink>
                    )}
                  </PaginationItem>
                ))}
                <PaginationItem>
                  <PaginationNext
                    className={currentPage === totalPages ? "pointer-events-none opacity-50" : undefined}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={(event) => handlePageChange(event, currentPage + 1)}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          )}
        </>
      )}

      <Sheet open={!!selectedOrder} onOpenChange={(open) => !open && setSelectedOrder(null)}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Detalhes da Venda</SheetTitle>
          </SheetHeader>

          {selectedOrder && (
            <div className="mt-4 space-y-4">
              <div className="flex items-center justify-between">
                <StatusBadge status={selectedOrder.status} />
                <span className="text-lg font-bold text-foreground">{fmt(netAmount)}</span>
              </div>

              <Separator />

              {/* Resumo Financeiro */}
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Resumo Financeiro</h4>
                <div className="rounded-lg border border-border bg-muted/50 p-3 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground flex items-center gap-1.5"><Receipt className="h-3.5 w-3.5" /> Valor bruto da venda</span>
                    <span className="font-medium text-foreground">{fmt(hasFeeData ? grossAmount : netAmount)}</span>
                  </div>
                  {hasFeeData && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground flex items-center gap-1.5"><Landmark className="h-3.5 w-3.5" /> Taxa da plataforma</span>
                      <span className="font-medium text-destructive">− {fmt(platformFee)}</span>
                    </div>
                  )}
                  <Separator />
                  <div className="flex justify-between text-sm">
                    <span className="font-semibold text-foreground flex items-center gap-1.5"><DollarSign className="h-3.5 w-3.5" /> Valor líquido (você recebe)</span>
                    <span className="font-bold text-primary">{fmt(netAmount)}</span>
                  </div>
                </div>
              </div>

              <Separator />

              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Pedido</h4>
                <DetailRow icon={Hash} label="ID" value={selectedOrder.id} />
                <DetailRow icon={Tag} label="Produto" value={selectedOrder.product_name} />
                <DetailRow icon={CreditCard} label="Pagamento" value={methodLabels[selectedOrder.method]} />
                <DetailRow icon={Clock} label="Data" value={formatDateTimePtBr(selectedOrder.created_at)} />
                <DetailRow icon={Hash} label="Transação" value={selectedOrder.transaction_id || "N/A"} />
              </div>

              <Separator />

              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Comprador</h4>
                <DetailRow icon={User} label="Nome" value={selectedOrder.buyer_name} />
                <DetailRow icon={Mail} label="E-mail" value={selectedOrder.buyer_email} />
                <DetailRow icon={Phone} label="Telefone" value={selectedOrder.buyer_phone} />
                <DetailRow icon={Hash} label="CPF" value={selectedOrder.buyer_cpf} />
              </div>

              {selectedOrder.utm && Object.values(selectedOrder.utm).some(Boolean) && (
                <>
                  <Separator />
                  <div>
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Rastreamento (UTM)</h4>
                    {selectedOrder.utm.source && <DetailRow icon={Globe} label="Source" value={selectedOrder.utm.source} />}
                    {selectedOrder.utm.medium && <DetailRow icon={Globe} label="Medium" value={selectedOrder.utm.medium} />}
                    {selectedOrder.utm.campaign && <DetailRow icon={Globe} label="Campaign" value={selectedOrder.utm.campaign} />}
                  </div>
                </>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </PageContent>
  );
};

export default SellerSales;
