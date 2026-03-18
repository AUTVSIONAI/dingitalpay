import { usePageMeta } from "@/contexts/PageMetaContext";
import PageContent from "@/components/layout/PageContent";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ShoppingBag, ExternalLink } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { fetchBuyerPurchases, DbOrder } from "@/services/order.service";
import LoadingState from "@/components/shared/LoadingState";
import EmptyState from "@/components/shared/EmptyState";
import { formatDatePtBr } from "@/lib/timezone";

const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  approved: { label: "Aprovado", variant: "default" },
  pending: { label: "Pendente", variant: "secondary" },
  refunded: { label: "Reembolsado", variant: "destructive" },
  chargeback: { label: "Chargeback", variant: "destructive" },
  abandoned: { label: "Abandonado", variant: "outline" },
};

const BuyerPurchases = () => {
  const navigate = useNavigate();

  usePageMeta([{ label: "Comprador" }, { label: "Minhas Compras" }], "Minhas Compras");

  const { data: purchases = [], isLoading } = useQuery({
    queryKey: ["buyer-purchases"],
    queryFn: fetchBuyerPurchases,
  });

  if (isLoading) return <LoadingState />;

  return (
    <PageContent className="space-y-6">
      <div className="flex items-center gap-3">
        <ShoppingBag className="h-6 w-6 text-primary" />
        <div>
          <h2 className="text-lg font-semibold text-foreground">Histórico de compras</h2>
          <p className="text-sm text-muted-foreground">Veja todos os produtos que você adquiriu</p>
        </div>
      </div>

      {purchases.length === 0 ? (
        <EmptyState icon={<ShoppingBag className="h-12 w-12" />} title="Nenhuma compra encontrada" description="Suas compras aparecerão aqui quando você adquirir um produto." />
      ) : (
        <Card>
          <CardContent className="pt-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Pagamento</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchases.map((purchase) => {
                  const st = statusMap[purchase.status] || statusMap.pending;
                  return (
                    <TableRow key={purchase.id}>
                      <TableCell className="font-medium">{purchase.product_name}</TableCell>
                      <TableCell className="text-muted-foreground">{formatDatePtBr(purchase.created_at)}</TableCell>
                      <TableCell>R$ {Number(purchase.amount).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                      <TableCell className="capitalize">{purchase.method === "credit_card" ? "Cartão" : purchase.method === "boleto" ? "Boleto" : "PIX"}</TableCell>
                      <TableCell><Badge variant={st.variant}>{st.label}</Badge></TableCell>
                      <TableCell className="text-right">
                        {purchase.access_granted && purchase.course_id ? (
                          <Button size="sm" variant="outline" onClick={() => navigate(`/members/courses/${purchase.course_id}`)}>
                            <ExternalLink className="h-3.5 w-3.5 mr-1" />Acessar
                          </Button>
                        ) : <span className="text-xs text-muted-foreground">—</span>}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </PageContent>
  );
};

export default BuyerPurchases;
