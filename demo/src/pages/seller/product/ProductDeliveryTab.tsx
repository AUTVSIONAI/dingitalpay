import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import FileUploader from "@/components/shared/FileUploader";
import LoadingState from "@/components/shared/LoadingState";
import { useDeliveryConfig, useUpsertDeliveryConfig } from "@/hooks/useProducts";
import { supabase } from "@/integrations/supabase/client";
import { Save, Mail, Package, FileText, Truck, Loader2, Trash2, Link, Upload } from "lucide-react";

interface Props {
  productId: string;
  productType: "ebook" | "physical";
}

const ProductDeliveryTab = ({ productId, productType }: Props) => {
  const { data: config, isLoading } = useDeliveryConfig(productId);
  const upsertConfig = useUpsertDeliveryConfig();

  const [form, setForm] = useState({
    deliveryMethod: "email",
    emailSubject: "Seu e-book está pronto! 📚",
    emailBody: "Olá {nome}! Seu e-book já está disponível para download. Clique no link abaixo para acessar.",
    downloadUrl: "",
    fileUrl: "",
    autoSend: true,
    shippingMethod: "correios",
    processingDays: "3",
    trackingEnabled: true,
    weight: "",
    dimensions: "",
    instructions: "",
    contentSource: "file" as "file" | "url",
  });

  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (config && !initialized) {
      setForm({
        deliveryMethod: config.delivery_method || "email",
        emailSubject: config.email_subject || "",
        emailBody: config.email_body || "",
        downloadUrl: config.download_url || "",
        fileUrl: config.file_url || "",
        autoSend: config.auto_send,
        shippingMethod: config.shipping_method || "correios",
        processingDays: String(config.processing_days || 3),
        trackingEnabled: config.tracking_enabled,
        weight: config.weight || "",
        dimensions: config.dimensions || "",
        instructions: config.instructions || "",
        contentSource: config.file_url ? "file" : config.download_url ? "url" : "file",
      });
      setInitialized(true);
    }
  }, [config, initialized]);

  const handleSave = () => {
    upsertConfig.mutate({
      productId,
      config: {
        delivery_method: form.deliveryMethod,
        email_subject: form.emailSubject,
        email_body: form.emailBody,
        download_url: form.contentSource === "url" ? form.downloadUrl : "",
        file_url: form.contentSource === "file" ? form.fileUrl : "",
        auto_send: form.autoSend,
        shipping_method: form.shippingMethod,
        processing_days: parseInt(form.processingDays) || 3,
        tracking_enabled: form.trackingEnabled,
        weight: form.weight,
        dimensions: form.dimensions,
        instructions: form.instructions,
      },
    });
  };

  if (isLoading) return <LoadingState />;

  if (productType === "ebook") {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4" /> Arquivo do Produto</CardTitle>
            <CardDescription>Escolha como o conteúdo será disponibilizado ao comprador</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <RadioGroup
              value={form.contentSource}
              onValueChange={(v: "file" | "url") => setForm(prev => ({ ...prev, contentSource: v }))}
              className="grid grid-cols-1 sm:grid-cols-2 gap-3"
            >
              <label
                htmlFor="source-file"
                className={`flex items-center gap-3 rounded-lg border p-4 cursor-pointer transition-colors ${form.contentSource === "file" ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/40"}`}
              >
                <RadioGroupItem value="file" id="source-file" />
                <Upload className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium text-foreground">Upload de arquivo</p>
                  <p className="text-xs text-muted-foreground">PDF, EPUB, ZIP — até 50MB</p>
                </div>
              </label>
              <label
                htmlFor="source-url"
                className={`flex items-center gap-3 rounded-lg border p-4 cursor-pointer transition-colors ${form.contentSource === "url" ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/40"}`}
              >
                <RadioGroupItem value="url" id="source-url" />
                <Link className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium text-foreground">URL externa</p>
                  <p className="text-xs text-muted-foreground">Google Drive, Dropbox, etc.</p>
                </div>
              </label>
            </RadioGroup>

            {form.contentSource === "file" && (
              <div className="space-y-3">
                {form.fileUrl ? (
                  <div className="flex items-center gap-3 rounded-lg border border-border p-3 bg-muted/30">
                    <FileText className="h-5 w-5 text-primary shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">Arquivo enviado</p>
                      <p className="text-xs text-muted-foreground truncate">{form.fileUrl}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive shrink-0"
                      onClick={() => setForm(prev => ({ ...prev, fileUrl: "" }))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <FileUploader accept=".pdf,.epub,.zip" maxSizeMB={50} onChange={async (files) => {
                    if (!files[0]) return;
                    try {
                      const file = files[0];
                      const ext = file.name.split(".").pop();
                      const path = `${productId}/${Date.now()}.${ext}`;
                      const { error } = await supabase.storage.from("product-files").upload(path, file, { upsert: true });
                      if (error) throw error;
                      const { data: urlData } = supabase.storage.from("product-files").getPublicUrl(path);
                      setForm(prev => ({ ...prev, fileUrl: urlData.publicUrl }));
                      toast.success("Arquivo enviado com sucesso!");
                    } catch (err: any) {
                      toast.error("Erro ao enviar arquivo: " + (err.message || ""));
                    }
                  }} />
                )}
              </div>
            )}

            {form.contentSource === "url" && (
              <div className="space-y-2">
                <Label>URL de download</Label>
                <Input placeholder="https://drive.google.com/..." value={form.downloadUrl} onChange={(e) => setForm({ ...form, downloadUrl: e.target.value })} />
                <p className="text-xs text-muted-foreground">Cole o link direto para o conteúdo hospedado externamente.</p>
              </div>
            )}
          </CardContent>
        </Card>
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={upsertConfig.isPending}>
            {upsertConfig.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Salvando...</> : <><Save className="h-4 w-4 mr-2" /> Salvar entrega</>}
          </Button>
        </div>
      </div>
    );
  }

  // Physical product
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Truck className="h-4 w-4" /> Configurações de Envio</CardTitle>
          <CardDescription>Configure como o produto físico será enviado</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Método de envio</Label>
              <Select value={form.shippingMethod} onValueChange={(v) => setForm({ ...form, shippingMethod: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="correios">Correios</SelectItem>
                  <SelectItem value="transportadora">Transportadora</SelectItem>
                  <SelectItem value="retirada">Retirada no local</SelectItem>
                  <SelectItem value="outro">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Prazo de preparo (dias)</Label>
              <Input type="number" value={form.processingDays} onChange={(e) => setForm({ ...form, processingDays: e.target.value })} />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Código de rastreio</p>
              <p className="text-xs text-muted-foreground">Enviar código de rastreamento por e-mail</p>
            </div>
            <Switch checked={form.trackingEnabled} onCheckedChange={(v) => setForm({ ...form, trackingEnabled: v })} />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Package className="h-4 w-4" /> Dados do Produto</CardTitle>
          <CardDescription>Informações para cálculo de frete</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Peso (kg)</Label>
              <Input placeholder="0,5" value={form.weight} onChange={(e) => setForm({ ...form, weight: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Dimensões (cm)</Label>
              <Input placeholder="30x20x10" value={form.dimensions} onChange={(e) => setForm({ ...form, dimensions: e.target.value })} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Instruções de envio</Label>
            <Textarea rows={3} placeholder="Instruções adicionais para o processo de envio..." value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} />
          </div>
        </CardContent>
      </Card>
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={upsertConfig.isPending}>
          {upsertConfig.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Salvando...</> : <><Save className="h-4 w-4 mr-2" /> Salvar entrega</>}
        </Button>
      </div>
    </div>
  );
};

export default ProductDeliveryTab;
