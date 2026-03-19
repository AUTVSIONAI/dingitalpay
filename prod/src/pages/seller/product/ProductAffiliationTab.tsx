import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import LoadingState from "@/components/shared/LoadingState";
import CopyToClipboardField from "@/components/shared/CopyToClipboardField";
import { useAffiliateProgram, useUpdateAffiliateProgram, useCreateAffiliateLink } from "@/hooks/useProducts";
import { Link2, Percent, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

interface ProductAffiliationTabProps {
  productId?: string;
}

const ProductAffiliationTab = ({ productId }: ProductAffiliationTabProps) => {
  const { data: program, isLoading } = useAffiliateProgram(productId);
  const updateProgram = useUpdateAffiliateProgram(productId || "");
  const createLink = useCreateAffiliateLink();

  const [enabled, setEnabled] = useState(false);
  const [commissionPercent, setCommissionPercent] = useState("30");
  const [cookieDays, setCookieDays] = useState("30");
  const [affiliateUrl, setAffiliateUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!program) return;
    setEnabled(Boolean(program.enabled));
    setCommissionPercent(String(Number(program.commission_percent || 0)));
    setCookieDays(String(Number(program.cookie_days || 0) || 30));
  }, [program]);

  const canSave = useMemo(() => {
    if (!productId) return false;
    const percent = Number(commissionPercent);
    const days = Number(cookieDays);
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) return false;
    if (!Number.isFinite(days) || days < 1 || days > 365) return false;
    return true;
  }, [productId, commissionPercent, cookieDays]);

  if (!productId) {
    return (
      <div className="py-10">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Afiliação</CardTitle>
            <CardDescription>Produto não encontrado.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (isLoading) return <LoadingState />;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" />
            Programa de afiliados
          </CardTitle>
          <CardDescription>Habilite a afiliação e defina a comissão para este produto.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <div className="text-sm font-medium text-foreground">Ativar afiliação</div>
              <div className="text-xs text-muted-foreground">Afiliados poderão gerar links e vender este produto.</div>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Comissão (%)</Label>
              <div className="relative">
                <Percent className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  inputMode="decimal"
                  value={commissionPercent}
                  onChange={(e) => setCommissionPercent(e.target.value)}
                />
              </div>
              <p className="text-xs text-muted-foreground">Aplicado sobre o valor líquido do pedido (amount).</p>
            </div>

            <div className="space-y-2">
              <Label>Cookie (dias)</Label>
              <Input
                inputMode="numeric"
                value={cookieDays}
                onChange={(e) => setCookieDays(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Preparado para atribuição por cookie (em breve).</p>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              onClick={() => updateProgram.mutate({ enabled, commission_percent: Number(commissionPercent), cookie_days: Number(cookieDays) })}
              disabled={!canSave || updateProgram.isPending}
            >
              {updateProgram.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Link2 className="h-4 w-4" />
            Link de afiliado (teste)
          </CardTitle>
          <CardDescription>Gere um link de afiliado para validar o tracking no checkout.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {affiliateUrl ? (
            <CopyToClipboardField value={affiliateUrl} />
          ) : (
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  const res = await createLink.mutateAsync({ product_id: productId, offer_id: null });
                  setAffiliateUrl(res.url);
                } catch (e) {
                  const message = e instanceof Error ? e.message : "Erro ao gerar link.";
                  toast.error(message);
                }
              }}
              disabled={createLink.isPending}
            >
              {createLink.isPending ? "Gerando..." : "Gerar link"}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ProductAffiliationTab;
