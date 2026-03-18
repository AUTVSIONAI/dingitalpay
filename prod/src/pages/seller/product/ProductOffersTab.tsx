import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import EmptyState from "@/components/shared/EmptyState";
import LoadingState from "@/components/shared/LoadingState";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import { Plus, Tag, Percent, Trash2 } from "lucide-react";
import { useProductCoupons, useCreateProductCoupon, useDeleteProductCoupon } from "@/hooks/useProducts";
import { formatDatePtBr } from "@/lib/timezone";

interface ProductOffersTabProps {
  productId: string | undefined;
}

const ProductOffersTab = ({ productId }: ProductOffersTabProps) => {
  const { data: offers = [], isLoading } = useProductCoupons(productId);
  const createCoupon = useCreateProductCoupon(productId || "");
  const deleteCoupon = useDeleteProductCoupon(productId || "");

  const [showCreate, setShowCreate] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [newOffer, setNewOffer] = useState({ code: "", type: "percent", value: "", usageLimit: "", expiresAt: "" });

  const handleCreate = () => {
    if (!newOffer.code.trim()) return;
    createCoupon.mutate(
      {
        code: newOffer.code.trim(),
        type: newOffer.type,
        value: parseFloat(newOffer.value) || 0,
        usage_limit: parseInt(newOffer.usageLimit) || 100,
        expires_at: newOffer.expiresAt || undefined,
      },
      {
        onSuccess: () => {
          setNewOffer({ code: "", type: "percent", value: "", usageLimit: "", expiresAt: "" });
          setShowCreate(false);
        },
      }
    );
  };

  if (isLoading) return <LoadingState />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-foreground">{offers.length} cupom(ns) cadastrado(s)</h3>
        </div>
        <Button size="sm" onClick={() => setShowCreate(!showCreate)}>
          <Plus className="h-4 w-4 mr-1" />{showCreate ? "Cancelar" : "Novo cupom"}
        </Button>
      </div>

      {showCreate && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Criar Cupom</CardTitle>
            <CardDescription>Configure um novo cupom de desconto</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Código do cupom</Label>
                <Input placeholder="Ex: DESCONTO10" value={newOffer.code} onChange={(e) => setNewOffer({ ...newOffer, code: e.target.value.toUpperCase() })} />
              </div>
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select value={newOffer.type} onValueChange={(v) => setNewOffer({ ...newOffer, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percent">Porcentagem (%)</SelectItem>
                    <SelectItem value="fixed">Valor fixo (R$)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Valor</Label>
                <Input type="number" placeholder={newOffer.type === "percent" ? "Ex: 20" : "Ex: 50"} value={newOffer.value} onChange={(e) => setNewOffer({ ...newOffer, value: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Limite de uso</Label>
                <Input type="number" placeholder="Ex: 100" value={newOffer.usageLimit} onChange={(e) => setNewOffer({ ...newOffer, usageLimit: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Validade</Label>
                <Input type="date" value={newOffer.expiresAt} onChange={(e) => setNewOffer({ ...newOffer, expiresAt: e.target.value })} />
              </div>
            </div>
            <div className="flex justify-end">
              <Button size="sm" onClick={handleCreate} disabled={createCoupon.isPending || !newOffer.code.trim()}>
                <Plus className="h-4 w-4 mr-1" />Criar cupom
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {offers.length === 0 ? (
        <EmptyState icon={<Tag className="h-6 w-6 text-muted-foreground" />} title="Nenhum cupom" description="Crie cupons de desconto para atrair mais clientes." />
      ) : (
        <div className="space-y-3">
          {offers.map((offer) => (
            <Card key={offer.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                      {offer.type === "percent" ? <Percent className="h-5 w-5 text-muted-foreground" /> : <Tag className="h-5 w-5 text-muted-foreground" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold font-mono text-foreground">{offer.code}</p>
                        <Badge variant={offer.active ? "default" : "secondary"}>{offer.active ? "Ativo" : "Expirado"}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {offer.type === "percent" ? `${offer.value}% de desconto` : `R$ ${Number(offer.value).toFixed(2)} de desconto`}
                        {" · "}{offer.used_count}/{offer.usage_limit} usos
                        {offer.expires_at && <>{" · "}Expira em {formatDatePtBr(offer.expires_at)}</>}
                      </p>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteId(offer.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={() => setDeleteId(null)}
        title="Remover cupom"
        description="Tem certeza que deseja remover este cupom?"
        onConfirm={() => {
          if (deleteId) deleteCoupon.mutate(deleteId, { onSuccess: () => setDeleteId(null) });
        }}
      />
    </div>
  );
};

export default ProductOffersTab;
