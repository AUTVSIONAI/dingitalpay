import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import CopyToClipboardField from "@/components/shared/CopyToClipboardField";
import EmptyState from "@/components/shared/EmptyState";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import { Plus, Globe, Link2, ExternalLink, Pencil, Trash2 } from "lucide-react";
import { fetchProductOffers, createProductOffer, updateProductOffer, deleteProductOffer, DbProductOffer } from "@/services/product.service";
import { maskCurrency, unmaskCurrency } from "@/lib/masks";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useProductDomains } from "@/hooks/useProducts";
import { getPlatformSettings } from "@/services/admin.service";
import { toast } from "sonner";

interface ProductLinksTabProps {
  productId?: string;
}

function deriveCheckoutDomain(host: string): string {
  const raw = String(host || "").trim().toLowerCase();
  if (!raw) return "app.dingitalpay.com";
  if (raw.startsWith("app.") || raw.startsWith("demo.")) return raw;
  if (raw.startsWith("checkout.")) return `app.${raw.slice("checkout.".length)}`;
  if (raw.startsWith("www.")) return raw.slice("www.".length);
  return raw;
}

const ProductLinksTab = ({ productId }: ProductLinksTabProps) => {
  const { data: verifiedDomains = [] } = useProductDomains(productId);
  const { data: platformSettings } = useQuery({
    queryKey: ["platform-settings"],
    queryFn: getPlatformSettings,
    staleTime: 5 * 60 * 1000,
  });

  const platformDomain = platformSettings?.platformUrl
    ? platformSettings.platformUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "")
    : (typeof window !== "undefined" ? window.location.host : "app.dingitalpay.com");

  const checkoutDomain = deriveCheckoutDomain(platformDomain);

  const [selectedDomain, setSelectedDomain] = useState("");

  // Set default domain from platform settings once loaded
  useEffect(() => {
    if (!selectedDomain && checkoutDomain) {
      setSelectedDomain(checkoutDomain);
    }
  }, [checkoutDomain, selectedDomain]);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingLink, setEditingLink] = useState<DbProductOffer | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // form state
  const [formName, setFormName] = useState("");
  const [formPrice, setFormPrice] = useState("");
  const [formActive, setFormActive] = useState(true);

  const { data: links = [] } = useQuery({
    queryKey: ["product-offers", productId],
    queryFn: () => productId ? fetchProductOffers(productId) : Promise.resolve([]),
    enabled: !!productId,
  });

  const createMutation = useMutation({
    mutationFn: (offer: { product_id: string; name: string; price: number; slug: string }) =>
      createProductOffer(offer),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["product-offers", productId] });
      setSheetOpen(false);
      toast.success("Link criado com sucesso!");
    },
    onError: () => toast.error("Erro ao criar link."),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Pick<DbProductOffer, "name" | "price" | "active">> }) =>
      updateProductOffer(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["product-offers", productId] });
      setSheetOpen(false);
      toast.success("Link atualizado com sucesso!");
    },
    onError: () => toast.error("Erro ao atualizar link."),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteProductOffer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["product-offers", productId] });
      setDeleteId(null);
      setSheetOpen(false);
      setEditingLink(null);
      toast.success("Link excluido com sucesso!");
    },
    onError: () => {
      setDeleteId(null);
      toast.error("Erro ao excluir link.");
    },
  });

  const openCreate = () => {
    setEditingLink(null);
    setFormName("");
    setFormPrice("");
    setFormActive(true);
    setSheetOpen(true);
  };

  const openEdit = (link: DbProductOffer) => {
    setEditingLink(link);
    setFormName(link.name);
    setFormPrice(maskCurrency(String(Math.round(link.price * 100))));
    setFormActive(link.active);
    setSheetOpen(true);
  };

  const handleSave = () => {
    if (!formName.trim() || !productId) return;
    const price = unmaskCurrency(formPrice);
    if (editingLink) {
      updateMutation.mutate({ id: editingLink.id, updates: { name: formName, price, active: formActive } });
    } else {
      const slug = formName.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
      createMutation.mutate({ product_id: productId, name: formName, price, slug: slug || `link-${Date.now()}` });
    }
  };

  const buildUrl = (offerId: string) => `https://${selectedDomain}/offer/${offerId}`;

  return (
    <div className="space-y-6">
      {/* Domain selector */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Globe className="h-4 w-4" /> Domínio do Checkout
          </CardTitle>
          <CardDescription>
            Selecione o domínio que será usado nos links de pagamento deste produto
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-w-sm">
            <Label>Domínio</Label>
            <Select value={selectedDomain} onValueChange={setSelectedDomain}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={checkoutDomain}>
                  {checkoutDomain}
                  <span className="ml-2 text-xs text-muted-foreground">(padrão)</span>
                </SelectItem>
                {verifiedDomains.filter(d => d.verified).map((d) => (
                  <SelectItem key={d.id} value={d.domain}>{d.domain}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Payment links */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Link2 className="h-4 w-4" /> Links de Pagamento
              </CardTitle>
              <CardDescription>{links.length} link(s) criado(s)</CardDescription>
            </div>
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-1" /> Novo link
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {links.length === 0 ? (
            <EmptyState
              icon={<Link2 className="h-6 w-6 text-muted-foreground" />}
              title="Nenhum link criado"
              description="Crie seu primeiro link de pagamento para começar a vender."
            />
          ) : (
            <div className="space-y-3">
              {links.map((link) => (
                <div key={link.id} className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg border border-border p-3">
                  <div className="min-w-0 space-y-1 sm:w-48 shrink-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground truncate">{link.name}</p>
                      <Badge variant={link.active ? "default" : "secondary"} className="text-[10px] shrink-0">
                        {link.active ? "Ativo" : "Inativo"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      R$ {Number(link.price).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 flex-1 min-w-0">
                    <CopyToClipboardField value={buildUrl(link.id)} className="flex-1 min-w-0" />
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0"
                      onClick={() => window.open(buildUrl(link.id), "_blank")}>
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => openEdit(link)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-destructive hover:text-destructive"
                      onClick={() => setDeleteId(link.id)}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create / Edit Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{editingLink ? "Atualizar Link" : "Novo Link"}</SheetTitle>
            <SheetDescription>
              {editingLink ? "Edite as informações do link de pagamento" : "Preencha as informações para criar um novo link"}
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 py-6">
            <div className="space-y-2">
              <Label>Nome do link</Label>
              <Input placeholder="Ex: Link Principal" value={formName} onChange={(e) => setFormName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Preço</Label>
              <Input inputMode="numeric" placeholder="R$ 0,00" value={formPrice} onChange={(e) => setFormPrice(maskCurrency(e.target.value))} />
            </div>
            <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">Link ativo</p>
                <p className="text-xs text-muted-foreground">Desative para impedir novas compras por este link</p>
              </div>
              <Switch checked={formActive} onCheckedChange={setFormActive} className="shrink-0" />
            </div>
          </div>
          <SheetFooter className="gap-2 sm:gap-0">
            {editingLink && (
              <Button
                variant="destructive"
                onClick={() => setDeleteId(editingLink.id)}
                disabled={deleteMutation.isPending}
              >
                Excluir
              </Button>
            )}
            <Button variant="outline" onClick={() => setSheetOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={!formName.trim() || createMutation.isPending || updateMutation.isPending}>
              {editingLink ? "Salvar" : "Criar link"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Excluir link"
        description="Tem certeza que deseja excluir este link de pagamento?"
        onConfirm={() => {
          if (!deleteId) return;
          deleteMutation.mutate(deleteId);
        }}
      />
    </div>
  );
};

export default ProductLinksTab;
