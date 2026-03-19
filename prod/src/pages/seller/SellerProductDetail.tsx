import { useState } from "react";
import { useParams, useNavigate, useBlocker } from "react-router-dom";
import { usePageMeta } from "@/contexts/PageMetaContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import StatusBadge from "@/components/shared/StatusBadge";
import LoadingState from "@/components/shared/LoadingState";
import PageContent from "@/components/layout/PageContent";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import { ArrowLeft } from "lucide-react";
import { useProduct } from "@/hooks/useProducts";

import ProductDetailsTab from "./product/ProductDetailsTab";
import ProductCheckoutTab from "./product/ProductCheckoutTab";
import ProductUpsellTab from "./product/ProductUpsellTab";
import ProductOffersTab from "./product/ProductOffersTab";
import ProductAffiliationTab from "./product/ProductAffiliationTab";
import ProductDomainsTab from "./product/ProductDomainsTab";
import ProductPixelsTab from "./product/ProductPixelsTab";
import ProductDangerTab from "./product/ProductDangerTab";
import ProductMembersTab from "./product/ProductMembersTab";
import ProductDeliveryTab from "./product/ProductDeliveryTab";
import ProductLinksTab from "./product/ProductLinksTab";

const statusMap = { active: "active", inactive: "inactive", draft: "draft" } as const;

const typeLabels: Record<string, string> = {
  course: "Curso",
  ebook: "E-book",
  physical: "Produto Físico",
};

const SellerProductDetail = () => {
  const { productId } = useParams();
  const navigate = useNavigate();
  const { data: product, isLoading } = useProduct(productId);

  const [activeTab, setActiveTab] = useState("detalhes");
  const [membersDirty, setMembersDirty] = useState(false);
  const [pendingTab, setPendingTab] = useState<string | null>(null);

  // Block route navigation when members tab has unsaved changes
  const blocker = useBlocker(activeTab === "membros" && membersDirty);


  usePageMeta(
    [{ label: "Vendedor", path: "/app" }, { label: "Produtos", path: "/app/products" }, { label: product?.name || "Carregando..." }],
    product ? "" : "Produto"
  );

  const handleTabChange = (value: string) => {
    if (activeTab === "membros" && membersDirty) {
      setPendingTab(value);
      return;
    }
    setActiveTab(value);
  };

  const confirmTabChange = () => {
    if (pendingTab) {
      setMembersDirty(false);
      setActiveTab(pendingTab);
      setPendingTab(null);
    }
  };




  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <LoadingState />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <p className="text-muted-foreground">Produto não encontrado.</p>
        <Button variant="outline" onClick={() => navigate("/app/products")}><ArrowLeft className="h-4 w-4 mr-2" />Voltar</Button>
      </div>
    );
  }

  const productForTabs = {
    id: product.id,
    name: product.name,
    shortDescription: product.short_description,
    longDescription: product.long_description || "",
    price: Number(product.price),
    status: product.status,
    sales: product.sales,
    revenue: Number(product.revenue),
    imageUrl: product.image_url,
    type: product.type,
    warrantyDays: product.warranty_days ?? 7,
    deliveryType: product.delivery_type || "instant",
  };

  const dynamicTabs: { value: string; label: string; content: React.ReactNode }[] = [];

  if (product.type === "course") {
    dynamicTabs.push({
      value: "membros",
      label: "Área de Membros",
      content: <ProductMembersTab productId={product.id} onDirtyChange={setMembersDirty} />,
    });
  }

  if (product.type === "ebook" || product.type === "physical") {
    dynamicTabs.push({ value: "entrega", label: product.type === "ebook" ? "Conteúdo" : "Entrega", content: <ProductDeliveryTab productId={product.id} productType={product.type} /> });
  }

  return (
    <PageContent>
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate("/app/products")} className="shrink-0">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-foreground truncate">{product.name}</h1>
            <StatusBadge status={statusMap[product.status]} />
          </div>
          <p className="text-sm text-muted-foreground">{typeLabels[product.type]} · R$ {Number(product.price).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="w-full justify-start overflow-x-auto flex-nowrap scrollbar-none">
          <TabsTrigger value="detalhes">Detalhes</TabsTrigger>
          {dynamicTabs.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>
          ))}
          <TabsTrigger value="checkout">Checkout</TabsTrigger>
          <TabsTrigger value="links">Links</TabsTrigger>
          <TabsTrigger value="upsell">Upsell</TabsTrigger>
          <TabsTrigger value="ofertas">Cupons</TabsTrigger>
          <TabsTrigger value="afiliacao">Afiliação</TabsTrigger>
          <TabsTrigger value="dominios">Domínios</TabsTrigger>
          <TabsTrigger value="pixels">Pixels</TabsTrigger>
          <TabsTrigger value="danger">Danger Zone</TabsTrigger>
        </TabsList>

        <div className="mt-6">
          <TabsContent value="detalhes"><ProductDetailsTab product={productForTabs} /></TabsContent>
          {dynamicTabs.map((t) => (
            <TabsContent key={t.value} value={t.value}>{t.content}</TabsContent>
          ))}
          <TabsContent value="checkout"><ProductCheckoutTab productId={product.id} /></TabsContent>
          <TabsContent value="links"><ProductLinksTab productId={productId} /></TabsContent>
          <TabsContent value="upsell"><ProductUpsellTab productId={product.id} /></TabsContent>
          <TabsContent value="ofertas"><ProductOffersTab productId={productId} /></TabsContent>
          <TabsContent value="afiliacao"><ProductAffiliationTab productId={productId} /></TabsContent>
          <TabsContent value="dominios"><ProductDomainsTab productId={productId} /></TabsContent>
          <TabsContent value="pixels"><ProductPixelsTab productId={product.id} /></TabsContent>
          <TabsContent value="danger"><ProductDangerTab productId={product.id} productName={product.name} salesCount={Number(product.sales || 0)} /></TabsContent>
        </div>
      </Tabs>

      <ConfirmDialog
        open={!!pendingTab}
        onOpenChange={(open) => { if (!open) setPendingTab(null); }}
        title="Alterações não salvas"
        description="Você tem alterações não salvas na Área de Membros. Deseja sair sem salvar?"
        confirmLabel="Sair sem salvar"
        cancelLabel="Continuar editando"
        onConfirm={confirmTabChange}
        variant="destructive"
      />

      <ConfirmDialog
        open={blocker.state === "blocked"}
        onOpenChange={(open) => { if (!open && blocker.state === "blocked") blocker.reset(); }}
        title="Alterações não salvas"
        description="Você tem alterações não salvas na Área de Membros. Deseja sair sem salvar?"
        confirmLabel="Sair sem salvar"
        cancelLabel="Continuar editando"
        onConfirm={() => { setMembersDirty(false); blocker.proceed(); }}
        variant="destructive"
      />

    </PageContent>
  );
};

export default SellerProductDetail;
