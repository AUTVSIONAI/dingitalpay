import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Archive, Trash2, Ban, Loader2 } from "lucide-react";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import { useDeleteProduct, useUpdateProduct, useDeleteProductCoupon, useProductCoupons } from "@/hooks/useProducts";
import { toast } from "sonner";

interface Props {
  productId: string;
  productName: string;
  salesCount: number;
}

const ProductDangerTab = ({ productId, productName, salesCount }: Props) => {
  const navigate = useNavigate();
  const deleteProductMutation = useDeleteProduct();
  const updateProductMutation = useUpdateProduct();
  const { data: coupons = [] } = useProductCoupons(productId);
  const deleteCoupon = useDeleteProductCoupon(productId);
  const hasSales = Number(salesCount || 0) > 0;

  const [archiveOpen, setArchiveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);

  const handleDisableOffers = () => {
    setDisableOpen(false);
    // Delete all coupons
    const promises = coupons.map((c) => deleteCoupon.mutateAsync(c.id));
    Promise.all(promises)
      .then(() => toast.success("Todas as ofertas foram desativadas!"))
      .catch(() => toast.error("Erro ao desativar ofertas."));
  };

  const handleArchive = () => {
    setArchiveOpen(false);
    updateProductMutation.mutate(
      { id: productId, updates: { status: "inactive" as any } },
      { onSuccess: () => toast.success("Produto arquivado (status: inativo).") }
    );
  };

  const handleDelete = () => {
    setDeleteOpen(false);
    deleteProductMutation.mutate(productId, {
      onSuccess: () => {
        toast.success("Produto excluído permanentemente.");
        navigate("/app/products");
      },
    });
  };

  const actions: Array<{
    icon: any;
    title: string;
    description: string;
    buttonLabel: string;
    variant: "default" | "destructive";
    onConfirm: () => void;
    open: boolean;
    setOpen: (v: boolean) => void;
    loading: boolean;
    disabled?: boolean;
  }> = [
    {
      icon: Ban,
      title: "Desativar todas as ofertas",
      description: `Remove todos os ${coupons.length} cupom(ns) ativo(s) deste produto.`,
      buttonLabel: "Desativar ofertas",
      variant: "default" as const,
      onConfirm: handleDisableOffers,
      open: disableOpen,
      setOpen: setDisableOpen,
      loading: deleteCoupon.isPending,
    },
    {
      icon: Archive,
      title: "Arquivar produto",
      description: "O produto será removido da vitrine (status: inativo) mas poderá ser restaurado.",
      buttonLabel: "Arquivar produto",
      variant: "default" as const,
      onConfirm: handleArchive,
      open: archiveOpen,
      setOpen: setArchiveOpen,
      loading: updateProductMutation.isPending,
    },
    {
      icon: Trash2,
      title: "Excluir produto permanentemente",
      description: hasSales
        ? "Este produto possui vendas/pedidos vinculados e não pode ser excluído. Arquive o produto para removê-lo da vitrine."
        : "Esta ação não pode ser desfeita. O produto e todos os dados vinculados serão removidos.",
      buttonLabel: "Excluir permanentemente",
      variant: "destructive" as const,
      onConfirm: handleDelete,
      open: deleteOpen,
      setOpen: setDeleteOpen,
      loading: deleteProductMutation.isPending,
      disabled: hasSales,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
        <p className="text-sm font-medium text-destructive">⚠️ Zona de perigo</p>
        <p className="text-xs text-muted-foreground mt-1">Ações irreversíveis ou de alto impacto. Tenha cuidado.</p>
      </div>

      {actions.map((action, i) => (
        <Card key={i}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <action.icon className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="max-w-md">
                  <p className="text-sm font-medium text-foreground">{action.title}</p>
                  <p className="text-xs text-muted-foreground">{action.description}</p>
                </div>
              </div>
              <Button
                variant={action.variant === "destructive" ? "destructive" : "outline"}
                size="sm"
                className="shrink-0"
                onClick={() => action.setOpen(true)}
                disabled={action.loading || !!action.disabled}
              >
                {action.loading && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                {action.buttonLabel}
              </Button>
            </div>
            <ConfirmDialog
              open={action.open}
              onOpenChange={action.setOpen}
              title={`Confirmar: ${action.title}`}
              description={action.description}
              onConfirm={action.onConfirm}
              variant={action.variant}
            />
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default ProductDangerTab;
