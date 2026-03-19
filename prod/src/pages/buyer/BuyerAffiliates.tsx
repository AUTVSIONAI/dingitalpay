import { usePageMeta } from "@/contexts/PageMetaContext";
import PageContent from "@/components/layout/PageContent";
import LoadingState from "@/components/shared/LoadingState";
import EmptyState from "@/components/shared/EmptyState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useAffiliateSummary, useAffiliateLinks, useAffiliateCommissions } from "@/hooks/useProducts";
import { Link2, Wallet } from "lucide-react";

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "secondary",
  available: "default",
  paid: "outline",
  canceled: "destructive",
};

const BuyerAffiliates = () => {
  usePageMeta([{ label: "Comprador" }, { label: "Afiliados" }], "Afiliados");

  const summary = useAffiliateSummary();
  const links = useAffiliateLinks();
  const commissions = useAffiliateCommissions();

  if (summary.isLoading || links.isLoading || commissions.isLoading) return <LoadingState />;

  const s = summary.data || { pending_total: 0, available_total: 0, paid_total: 0, total_count: 0 };
  const linkRows = links.data || [];
  const commissionRows = commissions.data || [];

  return (
    <PageContent className="space-y-6">
      <div className="flex items-center gap-3">
        <Link2 className="h-6 w-6 text-primary" />
        <div>
          <h2 className="text-lg font-semibold text-foreground">Afiliados</h2>
          <p className="text-sm text-muted-foreground">Links e comissões das suas divulgações.</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Pendente</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-semibold">R$ {Number(s.pending_total).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Disponível</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-semibold">R$ {Number(s.available_total).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Pago</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-semibold">R$ {Number(s.paid_total).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Meus links</CardTitle>
        </CardHeader>
        <CardContent>
          {linkRows.length === 0 ? (
            <EmptyState icon={<Link2 className="h-12 w-12" />} title="Nenhum link gerado" description="Gere links pelo Marketplace para começar." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead>Oferta</TableHead>
                  <TableHead>Comissão</TableHead>
                  <TableHead>Link</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {linkRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.product_name}</TableCell>
                    <TableCell className="text-muted-foreground">{row.offer_name || "—"}</TableCell>
                    <TableCell>{Number(row.commission_percent).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%</TableCell>
                    <TableCell className="max-w-[260px] truncate">
                      <a href={row.url} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                        {row.url}
                      </a>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Comissões</CardTitle>
          <Wallet className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          {commissionRows.length === 0 ? (
            <EmptyState icon={<Wallet className="h-12 w-12" />} title="Sem comissões ainda" description="As comissões aparecem quando uma venda é aprovada." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead>Pedido</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {commissionRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.product_name}</TableCell>
                    <TableCell className="text-muted-foreground">{row.order_id.slice(0, 8)}…</TableCell>
                    <TableCell>R$ {Number(row.commission_amount).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant[row.commission_status] || "secondary"}>{row.commission_status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </PageContent>
  );
};

export default BuyerAffiliates;

