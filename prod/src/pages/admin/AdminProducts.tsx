import { useState, useEffect, useMemo } from "react";
import PageContent from "@/components/layout/PageContent";
import { toast } from "sonner";
import { usePageMeta } from "@/contexts/PageMetaContext";
import DataTable, { DataTableColumn } from "@/components/shared/DataTable";
import FilterBar from "@/components/shared/FilterBar";
import EmptyState from "@/components/shared/EmptyState";
import LoadingState from "@/components/shared/LoadingState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Package, DollarSign, Calendar, ShoppingCart, Users, User, Copy, ShieldCheck, Percent } from "lucide-react";
import { getAdminProducts, getAdminProductSales, getAdminAffiliateProgram, updateAdminAffiliateProgram } from "@/services/admin.service";
import { formatDatePtBr } from "@/lib/timezone";

interface AdminProduct {
  id: string;
  name: string;
  price: number;
  status: "active" | "inactive" | "draft";
  imageUrl: string;
  shortDescription: string;
  sellerId: string;
  sellerName: string;
}

const statusConfig: Record<AdminProduct["status"], { label: string; variant: "default" | "secondary" | "outline" }> = {
  active: { label: "Ativo", variant: "default" },
  draft: { label: "Rascunho", variant: "outline" },
  inactive: { label: "Inativo", variant: "secondary" },
};

const AdminProducts = () => {
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedProduct, setSelectedProduct] = useState<AdminProduct | null>(null);
  const [viewSheetOpen, setViewSheetOpen] = useState(false);
  const [productSales, setProductSales] = useState<{ id: string; buyer: string; amount: string; date: string; status: string }[]>([]);
  const [affiliateLoading, setAffiliateLoading] = useState(false);
  const [affiliateSaving, setAffiliateSaving] = useState(false);
  const [affiliateEnabled, setAffiliateEnabled] = useState(false);
  const [affiliateCommissionPercent, setAffiliateCommissionPercent] = useState("30");
  const [affiliateCookieDays, setAffiliateCookieDays] = useState("30");

  useEffect(() => {
    const load = async () => {
      try {
        const data = await getAdminProducts();
        setProducts(data);
      } catch {
        void 0;
      }
      setLoading(false);
    };
    load();
  }, []);

  const filtered = products.filter((p) => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || p.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const handleViewProduct = async (product: AdminProduct) => {
    setSelectedProduct(product);
    setViewSheetOpen(true);
    try {
      const sales = await getAdminProductSales(product.id);
      setProductSales(sales);
    } catch { setProductSales([]); }
  };

  useEffect(() => {
    if (!viewSheetOpen || !selectedProduct) return;
    let cancelled = false;
    setAffiliateLoading(true);
    getAdminAffiliateProgram(selectedProduct.id)
      .then((program) => {
        if (cancelled) return;
        setAffiliateEnabled(Boolean(program.enabled));
        setAffiliateCommissionPercent(String(Number(program.commission_percent ?? 0)));
        setAffiliateCookieDays(String(Number(program.cookie_days ?? 30)));
      })
      .catch((err: any) => {
        const message = err instanceof Error ? err.message : "Falha ao carregar afiliação.";
        toast.error(message);
      })
      .finally(() => {
        if (cancelled) return;
        setAffiliateLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [viewSheetOpen, selectedProduct?.id]);

  const canSaveAffiliate = useMemo(() => {
    if (!selectedProduct) return false;
    const percent = Number(affiliateCommissionPercent);
    const days = Number(affiliateCookieDays);
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) return false;
    if (!Number.isFinite(days) || days < 1 || days > 365) return false;
    return true;
  }, [selectedProduct, affiliateCommissionPercent, affiliateCookieDays]);

  const columns: DataTableColumn<AdminProduct>[] = [
    {
      key: "name", header: "Produto",
      render: (row) => (
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
            <Package className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">{row.name}</p>
            <p className="text-xs text-muted-foreground">{row.shortDescription}</p>
          </div>
        </div>
      ),
    },
    {
      key: "price", header: "Preço", className: "text-right",
      render: (row) => <span className="text-sm font-medium text-foreground">R$ {row.price.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>,
    },
    {
      key: "status", header: "Status",
      render: (row) => { const c = statusConfig[row.status]; return <Badge variant={c.variant}>{c.label}</Badge>; },
    },
  ];

  usePageMeta([{ label: "Admin", path: "/admin" }, { label: "Produtos" }], "Gestão de Produtos");

  if (loading) return <LoadingState />;

  return (
    <PageContent>
      <FilterBar
        searchPlaceholder="Buscar produto..." searchValue={search} onSearchChange={setSearch}
        actions={
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 w-[140px] text-sm"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="active">Ativo</SelectItem>
              <SelectItem value="draft">Rascunho</SelectItem>
              <SelectItem value="inactive">Inativo</SelectItem>
            </SelectContent>
          </Select>
        }
        className="mb-4"
      />
      <div className="flex items-center gap-3 mb-4">
        <p className="text-sm text-muted-foreground">{filtered.length} {filtered.length === 1 ? "produto encontrado" : "produtos encontrados"}</p>
      </div>
      <DataTable columns={columns} data={filtered} onRowClick={handleViewProduct} emptyMessage="Nenhum produto encontrado." />

      <Sheet open={viewSheetOpen} onOpenChange={setViewSheetOpen}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          {selectedProduct && (
            <>
              <SheetHeader>
                <SheetTitle>Detalhes do Produto</SheetTitle>
                <SheetDescription>Informações completas do produto.</SheetDescription>
              </SheetHeader>
              <div className="py-4">
                <div className="flex items-center gap-4 pb-4">
                  <div className="h-14 w-14 rounded-lg bg-muted flex items-center justify-center shrink-0">
                    <Package className="h-7 w-7 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-lg font-semibold text-foreground">{selectedProduct.name}</p>
                    <Badge variant={statusConfig[selectedProduct.status].variant}>{statusConfig[selectedProduct.status].label}</Badge>
                  </div>
                </div>
                <Tabs defaultValue="geral" className="w-full">
                  <TabsList className="w-full">
                    <TabsTrigger value="geral" className="flex-1">Geral</TabsTrigger>
                    <TabsTrigger value="vendas" className="flex-1">Vendas</TabsTrigger>
                    <TabsTrigger value="afiliacao" className="flex-1">Afiliação</TabsTrigger>
                  </TabsList>
                  <TabsContent value="geral" className="space-y-5 mt-4">
                    <div className="space-y-2">
                      <div className="flex items-center gap-3 text-sm"><DollarSign className="h-4 w-4 text-muted-foreground" /><span className="text-muted-foreground">Preço:</span><span className="text-foreground">R$ {selectedProduct.price.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                    </div>
                    <Separator />
                    <div className="space-y-3">
                      <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Descrição</h4>
                      <p className="text-sm text-foreground">{selectedProduct.shortDescription || "Sem descrição"}</p>
                    </div>
                    <Separator />
                    <div className="space-y-3">
                      <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Proprietário</h4>
                      <div className="space-y-2">
                        <div className="flex items-center gap-3 text-sm"><User className="h-4 w-4 text-muted-foreground" /><span className="text-muted-foreground">Nome:</span><span className="text-foreground">{selectedProduct.sellerName}</span></div>
                        <div className="flex items-center gap-3 text-sm min-w-0"><Calendar className="h-4 w-4 text-muted-foreground shrink-0" /><span className="text-muted-foreground shrink-0">ID:</span><span className="text-foreground font-mono text-xs truncate">{selectedProduct.sellerId}</span><Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => { navigator.clipboard.writeText(selectedProduct.sellerId); toast.success("ID copiado!"); }}><Copy className="h-3 w-3" /></Button></div>
                      </div>
                    </div>
                    <Separator />
                    <div className="flex items-center gap-3 text-sm min-w-0">
                      <Package className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="text-muted-foreground shrink-0">ID do produto:</span>
                      <span className="text-foreground font-mono text-xs truncate">{selectedProduct.id}</span>
                      <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => { navigator.clipboard.writeText(selectedProduct.id); toast.success("ID copiado!"); }}><Copy className="h-3 w-3" /></Button>
                    </div>
                  </TabsContent>
                  <TabsContent value="vendas" className="mt-4">
                    {productSales.length === 0 ? (
                      <EmptyState icon={<ShoppingCart className="h-6 w-6 text-muted-foreground" />} title="Nenhuma venda" description="Este produto ainda não possui vendas." />
                    ) : (
                      <div className="space-y-3">
                        <p className="text-xs text-muted-foreground">Mostrando últimas 10 vendas</p>
                        {productSales.slice(0, 10).map((s) => (
                          <div key={s.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                            <div className="flex items-center gap-3">
                              <Users className="h-5 w-5 text-muted-foreground" />
                              <div>
                                <p className="text-sm font-medium text-foreground">{s.buyer}</p>
                                <p className="text-xs text-muted-foreground">{s.amount} · {formatDatePtBr(s.date)}</p>
                              </div>
                            </div>
                            <Badge variant={s.status === "Aprovado" ? "default" : "outline"}>{s.status}</Badge>
                          </div>
                        ))}
                      </div>
                    )}
                  </TabsContent>
                  <TabsContent value="afiliacao" className="mt-4 space-y-5">
                    {affiliateLoading ? (
                      <LoadingState />
                    ) : (
                      <>
                        <div className="flex items-center gap-3 text-sm">
                          <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                          <span className="text-muted-foreground">Aprovar e configurar programa de afiliados</span>
                        </div>
                        <Separator />
                        <div className="flex items-center justify-between gap-4">
                          <div className="space-y-0.5">
                            <div className="text-sm font-medium text-foreground">Ativar afiliação</div>
                            <div className="text-xs text-muted-foreground">Quando ativo, afiliados conseguem gerar links para este produto.</div>
                          </div>
                          <Switch checked={affiliateEnabled} onCheckedChange={setAffiliateEnabled} />
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label>Comissão (%)</Label>
                            <div className="relative">
                              <Percent className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                              <Input
                                className="pl-9"
                                inputMode="decimal"
                                value={affiliateCommissionPercent}
                                onChange={(e) => setAffiliateCommissionPercent(e.target.value)}
                              />
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label>Cookie (dias)</Label>
                            <Input
                              inputMode="numeric"
                              value={affiliateCookieDays}
                              onChange={(e) => setAffiliateCookieDays(e.target.value)}
                            />
                          </div>
                        </div>

                        <div className="flex justify-end gap-2">
                          <Button
                            onClick={async () => {
                              if (!selectedProduct) return;
                              setAffiliateSaving(true);
                              try {
                                await updateAdminAffiliateProgram(selectedProduct.id, {
                                  enabled: affiliateEnabled,
                                  commission_percent: Number(affiliateCommissionPercent),
                                  cookie_days: Number(affiliateCookieDays),
                                });
                                toast.success("Afiliação atualizada!");
                              } catch (err: any) {
                                const message = err instanceof Error ? err.message : "Falha ao salvar afiliação.";
                                toast.error(message);
                              } finally {
                                setAffiliateSaving(false);
                              }
                            }}
                            disabled={!canSaveAffiliate || affiliateSaving}
                          >
                            {affiliateSaving ? "Salvando..." : "Salvar"}
                          </Button>
                        </div>
                      </>
                    )}
                  </TabsContent>
                </Tabs>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </PageContent>
  );
};

export default AdminProducts;
