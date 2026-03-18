import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import EmptyState from "@/components/shared/EmptyState";
import CopyToClipboardField from "@/components/shared/CopyToClipboardField";
import LoadingState from "@/components/shared/LoadingState";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import { Plus, Globe, ShieldCheck, Trash2, CheckCircle, AlertCircle, RefreshCw } from "lucide-react";
import { useProductDomains, useCreateProductDomain, useDeleteProductDomain, useVerifyProductDomain } from "@/hooks/useProducts";
import { useQuery } from "@tanstack/react-query";
import { getPlatformSettings } from "@/services/admin.service";

interface ProductDomainsTabProps {
  productId: string | undefined;
}

const ProductDomainsTab = ({ productId }: ProductDomainsTabProps) => {
  const { data: domains = [], isLoading } = useProductDomains(productId);
  const createDomain = useCreateProductDomain(productId || "");
  const deleteDomain = useDeleteProductDomain(productId || "");
  const verifyDomain = useVerifyProductDomain(productId || "");
  const { data: platformSettings } = useQuery({
    queryKey: ["platform-settings"],
    queryFn: getPlatformSettings,
    staleTime: 5 * 60 * 1000,
  });

  const cnameDomain = platformSettings?.platformUrl
    ? platformSettings.platformUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "")
    : "checkout.plataforma.com";

  const [showAdd, setShowAdd] = useState(false);
  const [newDomain, setNewDomain] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const handleAdd = () => {
    if (!newDomain.trim()) return;
    createDomain.mutate(newDomain.trim(), {
      onSuccess: () => {
        setNewDomain("");
        setShowAdd(false);
      },
    });
  };

  if (isLoading) return <LoadingState />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-foreground">{domains.length} domínio(s) configurado(s)</h3>
        </div>
        <Button size="sm" onClick={() => setShowAdd(!showAdd)}>
          <Plus className="h-4 w-4 mr-1" />{showAdd ? "Cancelar" : "Adicionar domínio"}
        </Button>
      </div>

      {showAdd && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Novo Domínio Personalizado</CardTitle>
            <CardDescription>Use seu próprio domínio para exibir a página de checkout aos seus clientes</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Domínio ou subdomínio</Label>
              <Input placeholder="Ex: pay.meusite.com.br" value={newDomain} onChange={(e) => setNewDomain(e.target.value)} />
              <p className="text-xs text-muted-foreground">Recomendamos usar um subdomínio como <span className="font-mono text-foreground">pay.seusite.com</span> ou <span className="font-mono text-foreground">checkout.seusite.com</span></p>
            </div>

            <div className="rounded-lg border border-border bg-muted/40 p-4 space-y-3">
              <p className="text-sm font-semibold text-foreground flex items-center gap-2"><Globe className="h-4 w-4" />Como configurar</p>
              <ol className="text-xs text-muted-foreground space-y-2 list-decimal list-inside">
                <li>Acesse o painel DNS do seu provedor de domínio (GoDaddy, Cloudflare, Registro.br, etc.)</li>
                <li>Crie um novo registro do tipo <span className="font-mono font-semibold text-foreground">CNAME</span></li>
                <li>No campo <strong>Nome/Host</strong>, coloque o subdomínio desejado (ex: <span className="font-mono text-foreground">pay</span>)</li>
                <li>No campo <strong>Valor/Destino</strong>, cole o endereço abaixo:</li>
              </ol>
              <CopyToClipboardField value={cnameDomain} label="CNAME" />
              <div className="flex items-start gap-2 pt-1">
                <AlertCircle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
                <p className="text-xs text-muted-foreground">A propagação DNS pode levar até 72 horas. O SSL será ativado automaticamente após a verificação.</p>
              </div>
            </div>

            <div className="flex justify-end">
              <Button size="sm" onClick={handleAdd} disabled={createDomain.isPending || !newDomain.trim()}>
                <Plus className="h-4 w-4 mr-1" />Adicionar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {domains.length === 0 ? (
        <EmptyState icon={<Globe className="h-6 w-6 text-muted-foreground" />} title="Nenhum domínio" description="Adicione um domínio personalizado para seu checkout." />
      ) : (
        <div className="space-y-3">
          {domains.map((d) => (
            <Card key={d.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                      <Globe className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{d.domain}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <div className="flex items-center gap-1">
                          {d.verified ? <CheckCircle className="h-3 w-3 text-emerald-500" /> : <AlertCircle className="h-3 w-3 text-amber-500" />}
                          <span className="text-xs text-muted-foreground">{d.verified ? "Verificado" : "Pendente"}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <ShieldCheck className="h-3 w-3 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">SSL {d.verified ? "ativo" : "inativo"}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {!d.verified && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs"
                        disabled={verifyDomain.isPending}
                        onClick={() => verifyDomain.mutate(d.id)}
                      >
                        <RefreshCw className={`h-3.5 w-3.5 mr-1 ${verifyDomain.isPending ? "animate-spin" : ""}`} />
                        Verificar DNS
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteId(d.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={() => setDeleteId(null)}
        title="Remover domínio"
        description="Tem certeza que deseja remover este domínio?"
        onConfirm={() => {
          if (deleteId) deleteDomain.mutate(deleteId, { onSuccess: () => setDeleteId(null) });
        }}
      />
    </div>
  );
};

export default ProductDomainsTab;
