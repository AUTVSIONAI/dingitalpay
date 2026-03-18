import { useState } from "react";
import PageContent from "@/components/layout/PageContent";
import { useNavigate } from "react-router-dom";
import { usePageMeta } from "@/contexts/PageMetaContext";
import StatusBadge from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, BookOpen, FileText, Package } from "lucide-react";
import { useSellerProducts } from "@/hooks/useProducts";
import NewProductSheet from "./product/NewProductSheet";
import LoadingState from "@/components/shared/LoadingState";
import EmptyState from "@/components/shared/EmptyState";
import type { DbProduct } from "@/services/product.service";

const statusMap = { active: "active", inactive: "inactive", draft: "draft" } as const;

type ProductType = DbProduct["type"];

const typeConfig: Record<ProductType, { label: string; icon: React.ReactNode }> = {
  course: { label: "Curso", icon: <BookOpen className="h-3.5 w-3.5" /> },
  ebook: { label: "E-book", icon: <FileText className="h-3.5 w-3.5" /> },
  physical: { label: "Físico", icon: <Package className="h-3.5 w-3.5" /> },
};

function ProductGrid({ items, onSelect }: { items: DbProduct[]; onSelect: (productId: string) => void }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
      {items.map((p) => {
        const typeMeta = typeConfig[p.type];
        return (
          <Card
            key={p.id}
            className="overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all"
            onClick={() => onSelect(p.id)}
          >
            <div className="aspect-square bg-muted/50 flex flex-col items-center justify-center relative overflow-hidden">
              <div
                className="absolute inset-0 opacity-[0.03]"
                style={{
                  backgroundImage: "radial-gradient(circle, hsl(var(--foreground)) 1px, transparent 1px)",
                  backgroundSize: "20px 20px",
                }}
              />
              {p.image_url && p.image_url !== "" ? (
                <img src={p.image_url} alt={p.name} className="h-full w-full object-cover" />
              ) : (
                <>
                  <div className="h-10 w-10 rounded-xl bg-background shadow-sm border border-border flex items-center justify-center mb-1.5">
                    {p.type === "course" && <BookOpen className="h-5 w-5 text-primary" />}
                    {p.type === "ebook" && <FileText className="h-5 w-5 text-primary" />}
                    {p.type === "physical" && <Package className="h-5 w-5 text-primary" />}
                  </div>
                  <span className="text-[9px] font-medium text-muted-foreground/60 uppercase tracking-widest">{typeMeta.label}</span>
                </>
              )}
            </div>
            <CardContent className="p-3 space-y-2">
              <div className="min-w-0">
                <h3 className="text-xs font-semibold text-foreground truncate">{p.name}</h3>
                <Badge variant="outline" className="text-[10px] gap-0.5 font-normal mt-1">
                  {typeMeta.icon} {typeMeta.label}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-foreground">
                  R$ {Number(p.price).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <StatusBadge status={statusMap[p.status]} />
              </div>
              <div className="flex items-center gap-3 text-[10px] text-muted-foreground border-t border-border pt-2">
                <span>{p.sales} vendas</span>
                <span>R$ {Number(p.revenue).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

const SellerProducts = () => {
  const navigate = useNavigate();
  const { data: products, isLoading } = useSellerProducts();
  const [sheetOpen, setSheetOpen] = useState(false);

  usePageMeta([{ label: "Vendedor", path: "/app" }, { label: "Produtos" }], "Meus Produtos");

  if (isLoading) {
    return <LoadingState />;
  }

  const items = products || [];
  const activeItems = items.filter((product) => product.status !== "inactive");
  const inactiveItems = items.filter((product) => product.status === "inactive");

  return (
    <PageContent>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <p className="text-sm text-muted-foreground">{items.length} produto(s) cadastrado(s)</p>
        <Button onClick={() => setSheetOpen(true)} className="w-full sm:w-auto"><Plus className="h-4 w-4 mr-2" />Novo produto</Button>
      </div>

      {items.length === 0 ? (
        <EmptyState
          title="Nenhum produto cadastrado"
          description="Crie seu primeiro produto para começar a vender."
          action={<Button onClick={() => setSheetOpen(true)}><Plus className="h-4 w-4 mr-2" />Criar produto</Button>}
        />
      ) : (
        <div className="space-y-8">
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-foreground">Produtos ativos</h2>
              <Badge variant="secondary" className="text-[10px] px-2 py-0.5">{activeItems.length}</Badge>
            </div>
            {activeItems.length > 0 ? (
              <ProductGrid items={activeItems} onSelect={(productId) => navigate(`/app/products/${productId}`)} />
            ) : (
              <Card>
                <CardContent className="p-4 text-sm text-muted-foreground">
                  Nenhum produto ativo ou em rascunho nesta conta.
                </CardContent>
              </Card>
            )}
          </section>

          {inactiveItems.length > 0 && (
            <section className="space-y-4 border-t border-border pt-6">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-foreground">Produtos inativos</h2>
                <Badge variant="secondary" className="text-[10px] px-2 py-0.5">{inactiveItems.length}</Badge>
              </div>
              <ProductGrid items={inactiveItems} onSelect={(productId) => navigate(`/app/products/${productId}`)} />
            </section>
          )}
        </div>
      )}
      <NewProductSheet open={sheetOpen} onOpenChange={setSheetOpen} />
    </PageContent>
  );
};

export default SellerProducts;
