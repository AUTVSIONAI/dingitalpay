import { useState, useEffect } from "react";
import { maskPhone } from "@/lib/masks";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ColorPicker from "@/components/shared/ColorPicker";
import FileUploader from "@/components/shared/FileUploader";
import KeyValueList from "@/components/shared/KeyValueList";
import CheckoutPreview from "./CheckoutPreview";
import LoadingState from "@/components/shared/LoadingState";
import { useCheckoutConfig, useUpsertCheckoutConfig, useSellerProducts } from "@/hooks/useProducts";
import {
  Save, CreditCard, Timer, Bell, ShoppingCart, Image, Star,
  Heart, Zap, PlusCircle, Trash2, Phone, Loader2, Sun, Moon,
} from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

/* ───── helpers ───── */
interface Review {
  id: string;
  name: string;
  rating: number;
  comment: string;
}

interface OrderBumpFormItem {
  key: string;
  value: string;
  discountEnabled: boolean;
}

const StarRating = ({ value, onChange }: { value: number; onChange: (v: number) => void }) => (
  <div className="flex gap-1">
    {[1, 2, 3, 4, 5].map((s) => (
      <button key={s} type="button" onClick={() => onChange(s)} className="text-primary">
        <Star className={`h-4 w-4 ${s <= value ? "fill-primary" : "fill-none"}`} />
      </button>
    ))}
  </div>
);

const SubCard = ({ title, icon, description, children }: { title: string; icon?: React.ReactNode; description?: string; children: React.ReactNode }) => (
  <div className="rounded-lg border border-border bg-card p-4 space-y-4">
    <div>
      <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">{icon}{title}</h4>
      {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
    </div>
    {children}
  </div>
);

interface Props {
  productId: string;
}

const ProductCheckoutTab = ({ productId }: Props) => {
  const { data: config, isLoading } = useCheckoutConfig(productId);
  const { data: products = [] } = useSellerProducts();
  const upsertConfig = useUpsertCheckoutConfig();

  const [form, setForm] = useState({
    pix: true, creditCard: true, boleto: false,
    fieldName: true, fieldEmail: true, fieldAddress: false,
    fieldPhone: true, fieldBirthDate: false, fieldCpf: true,
    emailConfirmation: false,
    countdownEnabled: false, countdownMinutes: "15",
    countdownPhrase: "Oferta por tempo limitado!", countdownExpiredPhrase: "Oferta encerrada.",
    bannerEnabled: false, bannerUrl: "",
    primaryColor: "#6366f1", secondaryColor: "#0ea5e9",
    buyButtonText: "Comprar agora", buyButtonColor: "#6366f1", buyButtonTextColor: "#ffffff",
    orderBumpEnabled: false,
    notificationsEnabled: false, notificationInterval: "8",
    notificationNames: ["Cláudio", "Maria", "Julia", "Pedro", "Ana"],
    reviewsEnabled: false,
    thankYouEnabled: false, thankYouRedirectUrl: "",
    whatsappEnabled: false, whatsappNumber: "", whatsappMessage: "Olá! Preciso de ajuda com minha compra.",
    checkoutTheme: "light" as "light" | "dark",
  });

  const [reviews, setReviews] = useState<Review[]>([]);
  const [orderBumpItems, setOrderBumpItems] = useState<OrderBumpFormItem[]>([{ key: "", value: "10", discountEnabled: true }]);
  const [newNotifName, setNewNotifName] = useState("");
  const [initialized, setInitialized] = useState(false);

  // Load from DB
  useEffect(() => {
    if (config && !initialized) {
      const pm = config.payment_methods || { pix: true, credit_card: true, boleto: false };
      const rf = config.required_fields || { name: true, email: true, cpf: true, phone: false };
      const colors = (config.colors || { primary: "#6366f1", background: "#ffffff", text: "#1a1a2e" }) as Record<string, string>;
      const ty = config.thank_you_config || { title: "", message: "", redirect_url: "" };

      setForm((prev) => ({
        ...prev,
        pix: pm.pix ?? true,
        creditCard: pm.credit_card ?? true,
        boleto: pm.boleto ?? false,
        fieldName: rf.name ?? true,
        fieldEmail: rf.email ?? true,
        fieldCpf: rf.cpf ?? true,
        fieldPhone: rf.phone ?? false,
        fieldAddress: rf.address ?? false,
        fieldBirthDate: rf.birth_date ?? false,
        emailConfirmation: config.email_confirmation ?? false,
        countdownEnabled: config.countdown_enabled,
        countdownMinutes: String(config.countdown_minutes),
        countdownPhrase: config.countdown_phrase || "Oferta por tempo limitado!",
        countdownExpiredPhrase: config.countdown_expired_phrase || "Oferta encerrada.",
        bannerUrl: config.banner_url || "",
        bannerEnabled: !!config.banner_url,
        primaryColor: colors.primary || "#6366f1",
        secondaryColor: colors.secondary || colors.background || "#0ea5e9",
        buyButtonText: config.buy_button_text || "Comprar agora",
        buyButtonColor: colors.buy_button_color || colors.primary || "#6366f1",
        buyButtonTextColor: colors.buy_button_text_color || "#ffffff",
        orderBumpEnabled: Array.isArray((config as any).order_bump_items)
          ? ((config as any).order_bump_items as any[]).length > 0
          : !!config.order_bump_product_id,
        notificationsEnabled: config.social_proof_enabled,
        notificationInterval: String(config.notification_interval ?? 8),
        notificationNames: Array.isArray(config.notification_names) ? config.notification_names : ["Cláudio", "Maria", "Julia", "Pedro", "Ana"],
        reviewsEnabled: config.reviews_enabled ?? false,
        whatsappEnabled: !!config.whatsapp_support,
        whatsappNumber: config.whatsapp_support || "",
        whatsappMessage: config.whatsapp_message || "Olá! Preciso de ajuda com minha compra.",
        thankYouEnabled: !!(ty.redirect_url),
        thankYouRedirectUrl: ty.redirect_url || "",
        checkoutTheme: (colors.theme as "light" | "dark") || "light",
      }));
      const rawOrderBumpItems = Array.isArray((config as any).order_bump_items)
        ? ((config as any).order_bump_items as Array<{ product_id?: string; discount_enabled?: boolean; discount_percentage?: number }>)
        : [];
      const normalizedOrderBumpItems = rawOrderBumpItems.length > 0
        ? rawOrderBumpItems.map((item) => ({
            key: String(item.product_id || ""),
            value: String(item.discount_percentage ?? 30),
            discountEnabled: item.discount_enabled !== false,
          }))
        : (config.order_bump_product_id
          ? [{
              key: config.order_bump_product_id,
              value: String(config.order_bump_discount ?? 30),
              discountEnabled: Number(config.order_bump_discount ?? 30) > 0,
            }]
          : [{ key: "", value: "10", discountEnabled: true }]);
      setOrderBumpItems(normalizedOrderBumpItems);
      setReviews(Array.isArray(config.reviews) ? config.reviews.map((r: any) => ({ id: crypto.randomUUID(), ...r })) : []);
      setInitialized(true);
    }
  }, [config, initialized]);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  const addReview = () =>
    setReviews((r) => [...r, { id: crypto.randomUUID(), name: "", rating: 5, comment: "" }]);
  const removeReview = (id: string) => setReviews((r) => r.filter((x) => x.id !== id));
  const updateReview = (id: string, patch: Partial<Review>) =>
    setReviews((r) => r.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  const handleSave = () => {
    const normalizedOrderBumpItems = form.orderBumpEnabled
      ? orderBumpItems
          .filter((item) => item.key)
          .reduce<Array<{ product_id: string; discount_enabled: boolean; discount_percentage: number }>>((acc, item) => {
            if (acc.some((existing) => existing.product_id === item.key)) return acc;
            acc.push({
              product_id: item.key,
              discount_enabled: item.discountEnabled,
              discount_percentage: item.discountEnabled ? Math.max(0, parseInt(item.value) || 0) : 0,
            });
            return acc;
          }, [])
      : [];
    const primaryOrderBump = normalizedOrderBumpItems[0];

    upsertConfig.mutate({
      productId,
      config: {
        payment_methods: { pix: form.pix, credit_card: form.creditCard, boleto: form.boleto },
        required_fields: { name: form.fieldName, email: form.fieldEmail, cpf: form.fieldCpf, phone: form.fieldPhone, address: form.fieldAddress, birth_date: form.fieldBirthDate },
        email_confirmation: form.emailConfirmation,
        countdown_enabled: form.countdownEnabled,
        countdown_minutes: parseInt(form.countdownMinutes) || 15,
        countdown_phrase: form.countdownPhrase,
        countdown_expired_phrase: form.countdownExpiredPhrase,
        banner_url: form.bannerEnabled ? form.bannerUrl : "",
        colors: {
          primary: form.primaryColor,
          secondary: form.secondaryColor,
          background: form.secondaryColor,
          text: "#1a1a2e",
          buy_button_color: form.buyButtonColor,
          buy_button_text_color: form.buyButtonTextColor,
          theme: form.checkoutTheme,
        },
        buy_button_text: form.buyButtonText,
        order_bump_items: normalizedOrderBumpItems,
        order_bump_product_id: primaryOrderBump?.product_id || null,
        order_bump_discount: primaryOrderBump ? primaryOrderBump.discount_percentage : 0,
        social_proof_enabled: form.notificationsEnabled,
        notification_interval: parseInt(form.notificationInterval) || 8,
        notification_names: form.notificationNames,
        whatsapp_support: form.whatsappEnabled ? form.whatsappNumber : "",
        whatsapp_message: form.whatsappEnabled ? form.whatsappMessage : "",
        reviews_enabled: form.reviewsEnabled,
        reviews: reviews.map(({ name, rating, comment }) => ({ name, rating, comment })),
        thank_you_config: {
          redirect_url: form.thankYouEnabled ? form.thankYouRedirectUrl : "",
        },
        thank_you_redirect_delay: 0,
      },
    });
  };

  if (isLoading) return <LoadingState />;

  const availableOrderBumpProducts = products.filter((product) => product.id !== productId && product.status === "active");
  const orderBumpPreviewItems = orderBumpItems
    .filter((item) => item.key)
    .map((item) => {
      const product = products.find((currentProduct) => currentProduct.id === item.key);
      if (!product) return null;
      return {
        productId: product.id,
        name: product.name,
        shortDescription: product.short_description,
        price: Number(product.price),
        discountEnabled: item.discountEnabled,
        discountPercentage: item.discountEnabled ? Math.max(0, parseInt(item.value) || 0) : 0,
      };
    })
    .filter((item): item is NonNullable<typeof item> => !!item);

  return (
    <div className="space-y-6">
      {/* save top */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={upsertConfig.isPending}>
          {upsertConfig.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Salvando...</> : <><Save className="h-4 w-4 mr-2" />Salvar checkout</>}
        </Button>
      </div>
      {/* 0 — Tema do checkout */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            {form.checkoutTheme === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            Tema do Checkout
          </CardTitle>
          <CardDescription>Escolha se o checkout será exibido no modo claro ou escuro</CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup value={form.checkoutTheme} onValueChange={(v) => set("checkoutTheme", v as "light" | "dark")} className="grid grid-cols-2 gap-4">
            <label
              htmlFor="theme-light"
              className={`relative flex flex-col items-center gap-3 rounded-lg border-2 p-4 cursor-pointer transition-colors ${
                form.checkoutTheme === "light" ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/30"
              }`}
            >
              <RadioGroupItem value="light" id="theme-light" className="sr-only" />
              <div className="h-20 w-full rounded-md bg-white border border-border flex items-center justify-center">
                <Sun className="h-6 w-6 text-amber-500" />
              </div>
              <span className="text-sm font-medium text-foreground">Claro</span>
            </label>
            <label
              htmlFor="theme-dark"
              className={`relative flex flex-col items-center gap-3 rounded-lg border-2 p-4 cursor-pointer transition-colors ${
                form.checkoutTheme === "dark" ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/30"
              }`}
            >
              <RadioGroupItem value="dark" id="theme-dark" className="sr-only" />
              <div className="h-20 w-full rounded-md bg-zinc-900 border border-zinc-700 flex items-center justify-center">
                <Moon className="h-6 w-6 text-blue-400" />
              </div>
              <span className="text-sm font-medium text-foreground">Escuro</span>
            </label>
          </RadioGroup>
        </CardContent>
      </Card>

      {/* 1 — Métodos de pagamento */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><CreditCard className="h-4 w-4" />Métodos de Pagamento</CardTitle>
          <CardDescription>Selecione os meios de pagamento disponíveis no checkout</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {([
            { key: "pix" as const, label: "PIX", desc: "Pagamento instantâneo" },
            { key: "creditCard" as const, label: "Cartão de Crédito", desc: "Até 12x" },
            { key: "boleto" as const, label: "Boleto Bancário", desc: "Vencimento em 3 dias" },
          ]).map((m) => (
            <div key={m.key} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Checkbox checked={form[m.key]} onCheckedChange={(v) => set(m.key, !!v)} id={`pay-${m.key}`} />
                <div>
                  <Label htmlFor={`pay-${m.key}`} className="cursor-pointer">{m.label}</Label>
                  <p className="text-xs text-muted-foreground">{m.desc}</p>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* 3 — Campos obrigatórios */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Campos Obrigatórios</CardTitle>
          <CardDescription>Dados coletados do comprador</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {([
              { key: "fieldName" as const, label: "Nome completo" },
              { key: "fieldEmail" as const, label: "E-mail" },
              { key: "fieldAddress" as const, label: "Endereço" },
              { key: "fieldPhone" as const, label: "Telefone" },
              { key: "fieldBirthDate" as const, label: "Data de nascimento" },
              { key: "fieldCpf" as const, label: "CPF" },
            ]).map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => set(f.key, !form[f.key])}
                className={`px-4 py-2 rounded-md text-sm font-medium border transition-colors ${
                  form[f.key]
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="pt-2 border-t border-border flex items-center gap-3">
            <Switch checked={form.emailConfirmation} onCheckedChange={(v) => set("emailConfirmation", v)} />
            <div>
              <p className="text-sm font-medium text-foreground">Confirmação de e-mail</p>
              <p className="text-xs text-muted-foreground">Exige que o comprador digite o e-mail duas vezes</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 4 — Contagem regressiva */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Timer className="h-4 w-4" />Contagem Regressiva</CardTitle>
          <CardDescription>Barra de urgência no topo do checkout</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-foreground">Ativar contagem</p>
            <Switch checked={form.countdownEnabled} onCheckedChange={(v) => set("countdownEnabled", v)} />
          </div>
          {form.countdownEnabled && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div className="space-y-2">
                <Label>Tempo (minutos)</Label>
                <Input type="number" value={form.countdownMinutes} onChange={(e) => set("countdownMinutes", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Frase durante a contagem</Label>
                <Input value={form.countdownPhrase} onChange={(e) => set("countdownPhrase", e.target.value)} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Frase após expirar</Label>
                <Input value={form.countdownExpiredPhrase} onChange={(e) => set("countdownExpiredPhrase", e.target.value)} />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 5 — Banner */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Image className="h-4 w-4" />Banner do Topo</CardTitle>
          <CardDescription>Imagem exibida no topo da página de checkout</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-foreground">Ativar banner</p>
            <Switch checked={form.bannerEnabled} onCheckedChange={(v) => set("bannerEnabled", v)} />
          </div>
          {form.bannerEnabled && (
            <>
              <FileUploader onChange={async (files) => {
                if (!files[0]) return;
                try {
                  const { uploadProductImage } = await import("@/services/product.service");
                  const url = await uploadProductImage(files[0], productId);
                  set("bannerUrl", url);
                  toast.success("Banner enviado!");
                } catch (err) {
                  toast.error("Erro ao enviar banner.");
                }
              }} accept="image/*" />
              {form.bannerUrl && (
                <img src={form.bannerUrl} alt="Preview do banner" className="rounded-lg w-full h-32 object-cover border border-border" />
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* 6 — CUSTOMIZAÇÃO VISUAL */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Customização Visual</CardTitle>
          <CardDescription>Configure a aparência do checkout e veja o resultado em tempo real</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6">
            <div className="space-y-4">
              <SubCard title="Cores" description="Cores primária e secundária do checkout">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <ColorPicker value={form.primaryColor} onChange={(c) => set("primaryColor", c)} label="Cor primária" />
                  <ColorPicker value={form.secondaryColor} onChange={(c) => set("secondaryColor", c)} label="Cor secundária" />
                </div>
              </SubCard>

              <SubCard title="Botão de Compra" icon={<ShoppingCart className="h-4 w-4" />} description="Texto e cores do botão principal">
                <div className="space-y-2">
                  <Label>Texto do botão</Label>
                  <Input value={form.buyButtonText} onChange={(e) => set("buyButtonText", e.target.value)} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <ColorPicker value={form.buyButtonColor} onChange={(c) => set("buyButtonColor", c)} label="Cor de fundo" />
                  <ColorPicker value={form.buyButtonTextColor} onChange={(c) => set("buyButtonTextColor", c)} label="Cor do texto" />
                </div>
              </SubCard>

              <SubCard title="Order Bump" icon={<Zap className="h-4 w-4" />} description="Produto adicional sugerido na hora da compra">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-foreground">Ativar order bump</p>
                  <Switch checked={form.orderBumpEnabled} onCheckedChange={(v) => set("orderBumpEnabled", v)} />
                </div>
                {form.orderBumpEnabled && (
                  <div className="space-y-3 pt-2">
                    {availableOrderBumpProducts.length > 0 ? (
                      <KeyValueList<OrderBumpFormItem>
                        value={orderBumpItems}
                        onChange={setOrderBumpItems}
                        createItem={() => ({ key: "", value: "10", discountEnabled: true })}
                        renderItem={({ item, onItemChange, onRemove }) => (
                          <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_auto_0.8fr_auto] gap-3 items-end">
                            <div className="space-y-2">
                              <Label>Produto</Label>
                              <Select value={item.key} onValueChange={(value) => onItemChange({ key: value })}>
                                <SelectTrigger><SelectValue placeholder="Selecione um produto" /></SelectTrigger>
                                <SelectContent>
                                  {availableOrderBumpProducts.map((product) => (
                                    <SelectItem key={product.id} value={product.id}>{product.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5 gap-3">
                              <div>
                                <p className="text-xs font-medium text-foreground">Aplicar desconto</p>
                              </div>
                              <Switch
                                checked={item.discountEnabled}
                                onCheckedChange={(checked) => onItemChange({ discountEnabled: checked })}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Desconto (%)</Label>
                              <Input
                                type="number"
                                disabled={!item.discountEnabled}
                                value={item.value}
                                onChange={(e) => onItemChange({ value: e.target.value })}
                              />
                            </div>
                            <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0" onClick={onRemove}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      />
                    ) : (
                      <Button variant="outline" className="w-full"><PlusCircle className="h-4 w-4 mr-2" />Criar produto</Button>
                    )}
                  </div>
                )}
              </SubCard>

              <SubCard title="Notificações Sociais" icon={<Bell className="h-4 w-4" />} description="Pop-ups como 'Fulano acabou de comprar'">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-foreground">Ativar notificações</p>
                  <Switch checked={form.notificationsEnabled} onCheckedChange={(v) => set("notificationsEnabled", v)} />
                </div>
                {form.notificationsEnabled && (
                  <>
                    <div className="space-y-2">
                      <Label>Intervalo entre notificações (segundos)</Label>
                      <Input type="number" value={form.notificationInterval} onChange={(e) => set("notificationInterval", e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Nomes fictícios</Label>
                      <div className="flex flex-wrap gap-2">
                        {form.notificationNames.map((n, i) => (
                          <span key={i} className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs font-medium text-foreground">
                            {n}
                            <button onClick={() => set("notificationNames", form.notificationNames.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive">
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <Input placeholder="Novo nome" value={newNotifName} onChange={(e) => setNewNotifName(e.target.value)} className="flex-1" />
                        <Button variant="outline" size="sm" onClick={() => { if (newNotifName.trim()) { set("notificationNames", [...form.notificationNames, newNotifName.trim()]); setNewNotifName(""); } }}>
                          Adicionar
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </SubCard>

              <SubCard title="Reviews" icon={<Star className="h-4 w-4" />} description="Depoimentos exibidos na página de checkout">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-foreground">Ativar reviews</p>
                  <Switch checked={form.reviewsEnabled} onCheckedChange={(v) => set("reviewsEnabled", v)} />
                </div>
                {form.reviewsEnabled && (
                  <>
                    <div className="space-y-4">
                      {reviews.map((r) => (
                        <div key={r.id} className="rounded-lg border border-border p-3 space-y-2 relative">
                          <button onClick={() => removeReview(r.id)} className="absolute top-2 right-2 text-muted-foreground hover:text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </button>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <Label className="text-xs">Nome</Label>
                              <Input value={r.name} onChange={(e) => updateReview(r.id, { name: e.target.value })} className="h-8 text-sm" />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Nota</Label>
                              <StarRating value={r.rating} onChange={(v) => updateReview(r.id, { rating: v })} />
                            </div>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Comentário</Label>
                            <Textarea value={r.comment} onChange={(e) => updateReview(r.id, { comment: e.target.value })} rows={2} className="text-sm" />
                          </div>
                        </div>
                      ))}
                    </div>
                    <Button variant="outline" size="sm" onClick={addReview}><PlusCircle className="h-4 w-4 mr-2" />Adicionar review</Button>
                  </>
                )}
              </SubCard>

              <SubCard title="WhatsApp Flutuante" icon={<Phone className="h-4 w-4" />} description="Ícone do WhatsApp no canto inferior do checkout">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-foreground">Ativar WhatsApp</p>
                  <Switch checked={form.whatsappEnabled} onCheckedChange={(v) => set("whatsappEnabled", v)} />
                </div>
                {form.whatsappEnabled && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                    <div className="space-y-2">
                      <Label>Número (com DDD)</Label>
                      <Input placeholder="(11) 99999-0000" value={form.whatsappNumber} onChange={(e) => set("whatsappNumber", maskPhone(e.target.value))} />
                    </div>
                    <div className="space-y-2">
                      <Label>Mensagem padrão</Label>
                      <Input value={form.whatsappMessage} onChange={(e) => set("whatsappMessage", e.target.value)} />
                    </div>
                  </div>
                )}
              </SubCard>

              <SubCard title="Página de Obrigado" icon={<Heart className="h-4 w-4" />} description="Personalize a página exibida após a compra">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">Redirecionar para URL externa</p>
                    <p className="text-xs text-muted-foreground">Se desativado, será exibida a página de obrigado padrão da plataforma</p>
                  </div>
                  <Switch checked={form.thankYouEnabled} onCheckedChange={(v) => set("thankYouEnabled", v)} />
                </div>
                {form.thankYouEnabled && (
                  <div className="pt-2">
                    <div className="space-y-2">
                      <Label>URL de redirecionamento</Label>
                      <Input placeholder="https://..." value={form.thankYouRedirectUrl} onChange={(e) => set("thankYouRedirectUrl", e.target.value)} />
                      <p className="text-xs text-muted-foreground">Após a compra ser aprovada, o comprador será redirecionado automaticamente para esta URL.</p>
                    </div>
                  </div>
                )}
              </SubCard>
            </div>

            {/* RIGHT: sticky preview */}
            <div className="hidden lg:block">
              <div className="sticky top-[30px]">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Preview</p>
                <CheckoutPreview
                  primaryColor={form.primaryColor} secondaryColor={form.secondaryColor}
                  buyButtonText={form.buyButtonText} buyButtonColor={form.buyButtonColor} buyButtonTextColor={form.buyButtonTextColor}
                  bannerEnabled={form.bannerEnabled} bannerUrl={form.bannerUrl}
                  countdownEnabled={form.countdownEnabled} countdownPhrase={form.countdownPhrase} countdownMinutes={form.countdownMinutes}
                  fieldName={form.fieldName} fieldEmail={form.fieldEmail} fieldAddress={form.fieldAddress}
                  fieldPhone={form.fieldPhone} fieldBirthDate={form.fieldBirthDate} fieldCpf={form.fieldCpf}
                  pix={form.pix} creditCard={form.creditCard} boleto={form.boleto}
                  orderBumpEnabled={form.orderBumpEnabled} orderBumpItems={orderBumpPreviewItems}
                  reviewsEnabled={form.reviewsEnabled} reviews={reviews}
                  notificationsEnabled={form.notificationsEnabled} notificationNames={form.notificationNames}
                  whatsappEnabled={form.whatsappEnabled}
                  checkoutTheme={form.checkoutTheme}
                />
              </div>
            </div>

            <div className="lg:hidden">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Preview</p>
              <CheckoutPreview
                primaryColor={form.primaryColor} secondaryColor={form.secondaryColor}
                buyButtonText={form.buyButtonText} buyButtonColor={form.buyButtonColor} buyButtonTextColor={form.buyButtonTextColor}
                bannerEnabled={form.bannerEnabled} bannerUrl={form.bannerUrl}
                countdownEnabled={form.countdownEnabled} countdownPhrase={form.countdownPhrase} countdownMinutes={form.countdownMinutes}
                fieldName={form.fieldName} fieldEmail={form.fieldEmail} fieldAddress={form.fieldAddress}
                fieldPhone={form.fieldPhone} fieldBirthDate={form.fieldBirthDate} fieldCpf={form.fieldCpf}
                pix={form.pix} creditCard={form.creditCard} boleto={form.boleto}
                orderBumpEnabled={form.orderBumpEnabled} orderBumpItems={orderBumpPreviewItems}
                reviewsEnabled={form.reviewsEnabled} reviews={reviews}
                notificationsEnabled={form.notificationsEnabled} notificationNames={form.notificationNames}
                whatsappEnabled={form.whatsappEnabled}
                checkoutTheme={form.checkoutTheme}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* save */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={upsertConfig.isPending}>
          {upsertConfig.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Salvando...</> : <><Save className="h-4 w-4 mr-2" />Salvar checkout</>}
        </Button>
      </div>
    </div>
  );
};

export default ProductCheckoutTab;
