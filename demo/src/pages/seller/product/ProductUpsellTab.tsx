import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import FileUploader from "@/components/shared/FileUploader";
import LoadingState from "@/components/shared/LoadingState";
import { useUpsellConfig, useUpsertUpsellConfig, useSellerProducts } from "@/hooks/useProducts";
import { Save, Rocket, PlusCircle, Loader2, Eye } from "lucide-react";
import { maskCurrency, unmaskCurrency } from "@/lib/masks";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Props {
  productId: string;
}

const ProductUpsellTab = ({ productId }: Props) => {
  const { data: config, isLoading } = useUpsellConfig(productId);
  const { data: products = [] } = useSellerProducts();
  const upsertConfig = useUpsertUpsellConfig();

  const [form, setForm] = useState({
    enabled: false,
    productId: "",
    title: "Espera! Temos uma oferta exclusiva pra você 🚀",
    description: "Aproveite essa condição especial disponível apenas agora.",
    imageUrl: "",
    ctaText: "Sim, eu quero!",
    declineText: "Não, obrigado",
    specialPrice: "",
    downsellEnabled: false,
    downsellProductId: "",
    downsellTitle: "Última chance! Que tal essa oferta?",
    downsellCtaText: "Quero aproveitar!",
    downsellSpecialPrice: "",
  });

  const [initialized, setInitialized] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewStep, setPreviewStep] = useState<"upsell" | "downsell">("upsell");

  useEffect(() => {
    if (config && !initialized) {
      setForm({
        enabled: config.enabled,
        productId: config.upsell_product_id || "",
        title: config.title,
        description: config.description,
        imageUrl: config.image_url || "",
        ctaText: config.cta_text,
        declineText: config.decline_text,
        specialPrice: config.special_price ? maskCurrency(String(Math.round(config.special_price * 100))) : "",
        downsellEnabled: config.downsell_enabled,
        downsellProductId: config.downsell_product_id || "",
        downsellTitle: config.downsell_title || "",
        downsellCtaText: config.downsell_cta_text || "",
        downsellSpecialPrice: config.downsell_special_price ? maskCurrency(String(Math.round(config.downsell_special_price * 100))) : "",
      });
      setInitialized(true);
    }
  }, [config, initialized]);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  const handleSave = () => {
    upsertConfig.mutate({
      productId,
      config: {
        enabled: form.enabled,
        upsell_product_id: form.productId || null,
        title: form.title,
        description: form.description,
        image_url: form.imageUrl,
        cta_text: form.ctaText,
        decline_text: form.declineText,
        special_price: unmaskCurrency(form.specialPrice),
        downsell_enabled: form.downsellEnabled,
        downsell_product_id: form.downsellProductId || null,
        downsell_title: form.downsellTitle,
        downsell_cta_text: form.downsellCtaText,
        downsell_special_price: unmaskCurrency(form.downsellSpecialPrice),
      },
    });
  };

  if (isLoading) return <LoadingState />;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2"><Rocket className="h-4 w-4" />Upsell Pós-Compra</CardTitle>
            {form.enabled && (
              <Button variant="outline" size="sm" onClick={() => { setPreviewStep("upsell"); setPreviewOpen(true); }}>
                <Eye className="h-4 w-4 mr-2" />Preview
              </Button>
            )}
          </div>
          <CardDescription>Página exibida após a aprovação do pagamento com uma oferta especial</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Ativar upsell</p>
              <p className="text-xs text-muted-foreground">Cria uma página intermediária antes da página de obrigado</p>
            </div>
            <Switch checked={form.enabled} onCheckedChange={(v) => set("enabled", v)} />
          </div>

          {form.enabled && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Produto do upsell</Label>
                  {products.length > 0 ? (
                    <Select value={form.productId} onValueChange={(v) => set("productId", v)}>
                      <SelectTrigger><SelectValue placeholder="Selecione um produto" /></SelectTrigger>
                      <SelectContent>
                        {products.map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.name} — R$ {p.price}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Button variant="outline" className="w-full"><PlusCircle className="h-4 w-4 mr-2" />Criar produto</Button>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Título da página</Label>
                  <Input value={form.title} onChange={(e) => set("title", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Descrição</Label>
                  <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={3} />
                </div>
                <div className="space-y-2">
                  <Label>Imagem / Banner</Label>
                  <FileUploader onChange={async (files) => {
                    if (!files[0]) return;
                    try {
                      const { uploadProductImage } = await import("@/services/product.service");
                      const url = await uploadProductImage(files[0], productId);
                      set("imageUrl", url);
                      toast.success("Imagem do upsell enviada!");
                    } catch (err) {
                      toast.error("Erro ao enviar imagem do upsell.");
                    }
                  }} accept="image/*" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Texto do CTA</Label>
                    <Input value={form.ctaText} onChange={(e) => set("ctaText", e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Preço especial</Label>
                    <Input inputMode="numeric" placeholder="R$ 0,00" value={form.specialPrice} onChange={(e) => set("specialPrice", maskCurrency(e.target.value))} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Texto de recusa</Label>
                  <Input value={form.declineText} onChange={(e) => set("declineText", e.target.value)} />
                </div>
              </div>

              <div className="rounded-lg border border-border p-4 bg-muted/30 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Preview da página</p>
                <div className="rounded-lg overflow-hidden border border-border bg-background">
                  <div className="h-32 bg-muted flex items-center justify-center text-muted-foreground text-xs">
                    {form.imageUrl ? <img src={form.imageUrl} alt="upsell" className="h-full w-full object-cover" /> : "Imagem do upsell"}
                  </div>
                  <div className="p-4 space-y-3 text-center">
                    <h3 className="text-sm font-bold text-foreground">{form.title || "Título"}</h3>
                    <p className="text-xs text-muted-foreground">{form.description || "Descrição"}</p>
                    {form.specialPrice && <p className="text-lg font-bold text-primary">{form.specialPrice}</p>}
                    <Button size="sm" className="w-full">{form.ctaText || "Sim, eu quero!"}</Button>
                    <p className="text-xs text-muted-foreground underline cursor-pointer">{form.declineText || "Não, obrigado"}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {form.enabled && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Downsell (opcional)</CardTitle>
            <CardDescription>Oferta alternativa caso o comprador recuse o upsell</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Ativar downsell</p>
                <p className="text-xs text-muted-foreground">Segunda chance com oferta ainda mais atrativa</p>
              </div>
              <Switch checked={form.downsellEnabled} onCheckedChange={(v) => set("downsellEnabled", v)} />
            </div>
            {form.downsellEnabled && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div className="space-y-2">
                  <Label>Produto do downsell</Label>
                  <Select value={form.downsellProductId} onValueChange={(v) => set("downsellProductId", v)}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {products.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Preço especial</Label>
                  <Input inputMode="numeric" placeholder="R$ 0,00" value={form.downsellSpecialPrice} onChange={(e) => set("downsellSpecialPrice", maskCurrency(e.target.value))} />
                </div>
                <div className="space-y-2">
                  <Label>Título</Label>
                  <Input value={form.downsellTitle} onChange={(e) => set("downsellTitle", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Texto do CTA</Label>
                  <Input value={form.downsellCtaText} onChange={(e) => set("downsellCtaText", e.target.value)} />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={upsertConfig.isPending}>
          {upsertConfig.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Salvando...</> : <><Save className="h-4 w-4 mr-2" />Salvar upsell</>}
        </Button>
      </div>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-md p-0 overflow-hidden">
          {previewStep === "upsell" ? (
            <div className="bg-background min-h-[480px] flex flex-col">
              {form.imageUrl ? (
                <img src={form.imageUrl} alt="upsell" className="w-full h-48 object-cover" />
              ) : (
                <div className="w-full h-48 bg-muted flex items-center justify-center text-muted-foreground text-sm">Sem imagem</div>
              )}
              <div className="p-6 flex-1 flex flex-col items-center text-center space-y-4">
                <h2 className="text-xl font-bold text-foreground">{form.title || "Título do upsell"}</h2>
                <p className="text-sm text-muted-foreground">{form.description || "Descrição do upsell"}</p>
                {form.specialPrice && <p className="text-2xl font-bold text-primary">{form.specialPrice}</p>}
                <Button className="w-full" size="lg">{form.ctaText || "Sim, eu quero!"}</Button>
                <p
                  className="text-sm text-muted-foreground underline cursor-pointer"
                  onClick={() => {
                    if (form.downsellEnabled) {
                      setPreviewStep("downsell");
                    } else {
                      setPreviewOpen(false);
                    }
                  }}
                >
                  {form.declineText || "Não, obrigado"}
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-background min-h-[480px] flex flex-col items-center justify-center p-6 text-center space-y-4">
              <h2 className="text-xl font-bold text-foreground">{form.downsellTitle || "Título do downsell"}</h2>
              {form.downsellSpecialPrice && <p className="text-2xl font-bold text-primary">{form.downsellSpecialPrice}</p>}
              <Button className="w-full" size="lg">{form.downsellCtaText || "Quero aproveitar!"}</Button>
              <p
                className="text-sm text-muted-foreground underline cursor-pointer"
                onClick={() => setPreviewOpen(false)}
              >
                Não, obrigado
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProductUpsellTab;
