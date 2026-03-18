import { Phone, ShoppingCart, Star, CreditCard, QrCode, Barcode } from "lucide-react";

interface CheckoutPreviewProps {
  primaryColor: string;
  secondaryColor: string;
  buyButtonText: string;
  buyButtonColor: string;
  buyButtonTextColor: string;
  bannerEnabled: boolean;
  bannerUrl: string;
  countdownEnabled: boolean;
  countdownPhrase: string;
  countdownMinutes: string;
  fieldName: boolean;
  fieldEmail: boolean;
  fieldAddress: boolean;
  fieldPhone: boolean;
  fieldBirthDate: boolean;
  fieldCpf: boolean;
  pix: boolean;
  creditCard: boolean;
  boleto: boolean;
  orderBumpEnabled: boolean;
  orderBumpItems: {
    productId: string;
    name: string;
    shortDescription?: string;
    price: number;
    discountEnabled: boolean;
    discountPercentage: number;
  }[];
  reviewsEnabled: boolean;
  reviews: { name: string; rating: number; comment: string }[];
  notificationsEnabled: boolean;
  notificationNames: string[];
  whatsappEnabled: boolean;
  checkoutTheme?: "light" | "dark";
}

const CheckoutPreview = (props: CheckoutPreviewProps) => {
  const withAlpha = (color: string, alpha: number) => {
    if (/^#([0-9a-f]{6}|[0-9a-f]{3})$/i.test(color)) {
      const normalized = color.length === 4
        ? `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`
        : color;
      const hexAlpha = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
        .toString(16)
        .padStart(2, "0");
      return `${normalized}${hexAlpha}`;
    }

    return color;
  };

  const fields = [
    { key: "fieldName", label: "Nome completo", type: "text" },
    { key: "fieldEmail", label: "E-mail", type: "email" },
    { key: "fieldCpf", label: "CPF", type: "text" },
    { key: "fieldPhone", label: "Telefone", type: "tel" },
    { key: "fieldBirthDate", label: "Data de nascimento", type: "date" },
    { key: "fieldAddress", label: "Endereço", type: "text" },
  ] as const;

  const activeFields = fields.filter((f) => props[f.key]);
  const isDark = props.checkoutTheme === "dark";
  return (
    <div className="rounded-xl border border-border overflow-hidden bg-muted/30 shadow-sm">
      {/* ── macOS browser chrome ── */}
      <div className="flex items-center gap-2 px-3 py-2.5 bg-muted/80 border-b border-border">
        <div className="flex gap-1.5">
          <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
          <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
          <span className="h-3 w-3 rounded-full bg-[#28c840]" />
        </div>
        <div className="flex-1 mx-2">
          <div className="bg-background/70 rounded-md px-3 py-1 text-[10px] text-muted-foreground text-center truncate border border-border/50">
            pay.plataforma.com/checkout
          </div>
        </div>
      </div>

      {/* ── checkout content ── */}
      <div className={`relative ${isDark ? "bg-zinc-950 text-zinc-100" : "bg-background"}`} style={{ fontSize: "11px" }}>
        {/* Countdown bar */}
        {props.countdownEnabled && (
          <div
            className="px-3 py-1.5 text-center text-[10px] font-semibold text-white"
            style={{ backgroundColor: props.primaryColor }}
          >
            ⏱ {props.countdownPhrase || "Oferta por tempo limitado!"} — {props.countdownMinutes}:00
          </div>
        )}

        {/* Banner */}
        {props.bannerEnabled && props.bannerUrl && (
          <div className="w-full h-16 bg-muted overflow-hidden">
            <img src={props.bannerUrl} alt="banner" className="w-full h-full object-cover" />
          </div>
        )}
        {props.bannerEnabled && !props.bannerUrl && (
          <div className="w-full h-16 bg-muted flex items-center justify-center">
            <span className="text-[10px] text-muted-foreground">Banner</span>
          </div>
        )}

        {/* Header */}
        <div
          className="px-4 py-2.5 text-white font-bold text-xs flex items-center gap-2"
          style={{ backgroundColor: props.primaryColor }}
        >
          <ShoppingCart className="h-3 w-3" />
          Checkout — Produto
        </div>

        <div className="p-4 space-y-3">
          {/* Form fields */}
          <div className="space-y-2">
            <p className={`font-semibold text-[11px] ${isDark ? "text-zinc-200" : "text-foreground"}`}>Dados pessoais</p>
            {activeFields.map((f) => (
              <div key={f.key} className="space-y-0.5">
                <label className={`text-[9px] font-medium ${isDark ? "text-zinc-400" : "text-muted-foreground"}`}>{f.label}</label>
                <div className={`h-6 rounded border ${isDark ? "border-zinc-700 bg-zinc-800" : "border-border bg-muted/30"}`} />
              </div>
            ))}
            {activeFields.length === 0 && (
              <p className={`text-[9px] italic ${isDark ? "text-zinc-500" : "text-muted-foreground"}`}>Nenhum campo ativo</p>
            )}
          </div>

          {/* Payment methods */}
          <div className="space-y-1.5">
            <p className={`font-semibold text-[11px] ${isDark ? "text-zinc-200" : "text-foreground"}`}>Pagamento</p>
            <div className="flex gap-1.5">
              {props.pix && (
                <div className={`flex items-center gap-1 rounded border px-2 py-1 text-[9px] ${isDark ? "border-zinc-700 bg-zinc-800 text-zinc-300" : "border-border bg-muted/30"}`}>
                  <QrCode className="h-2.5 w-2.5" /> PIX
                </div>
              )}
              {props.creditCard && (
                <div className={`flex items-center gap-1 rounded border px-2 py-1 text-[9px] ${isDark ? "border-zinc-700 bg-zinc-800 text-zinc-300" : "border-border bg-muted/30"}`}>
                  <CreditCard className="h-2.5 w-2.5" /> Cartão
                </div>
              )}
              {props.boleto && (
                <div className={`flex items-center gap-1 rounded border px-2 py-1 text-[9px] ${isDark ? "border-zinc-700 bg-zinc-800 text-zinc-300" : "border-border bg-muted/30"}`}>
                  <Barcode className="h-2.5 w-2.5" /> Boleto
                </div>
              )}
            </div>
          </div>

          {/* Order bump */}
          {props.orderBumpEnabled && props.orderBumpItems.length > 0 && (
            <div className="space-y-2">
              {props.orderBumpItems.map((item) => {
                const finalPrice = item.discountEnabled
                  ? item.price * (1 - item.discountPercentage / 100)
                  : item.price;
                return (
                  <div
                    key={item.productId}
                    className="rounded border-2 border-dashed p-2 space-y-1"
                    style={{
                      borderColor: withAlpha(props.primaryColor, 0.45),
                      backgroundColor: withAlpha(props.primaryColor, 0.05),
                    }}
                  >
                    <div className="flex items-center gap-1">
                      <input type="checkbox" className="h-2.5 w-2.5" defaultChecked readOnly />
                      <span className="font-bold text-[10px] text-foreground">
                        Adicione também {item.name} por R$ {finalPrice.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                    {item.discountEnabled && (
                      <div className="flex flex-wrap items-center gap-1 text-[8px]" style={{ color: props.primaryColor }}>
                        <span className="font-semibold">Economize {item.discountPercentage}%</span>
                        <span className="text-muted-foreground">de</span>
                        <span className="text-muted-foreground line-through">
                          R$ {item.price.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        <span className="text-muted-foreground">por</span>
                        <span className="font-semibold">
                          R$ {finalPrice.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    )}
                    {item.shortDescription && (
                      <p className="text-[9px] text-muted-foreground">{item.shortDescription}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Buy button */}
          <button
            className="w-full py-2 rounded-md text-[11px] font-bold transition-transform hover:scale-[1.02]"
            style={{ backgroundColor: props.buyButtonColor, color: props.buyButtonTextColor }}
          >
            {props.buyButtonText || "Comprar agora"}
          </button>

          {/* Reviews */}
          {props.reviewsEnabled && props.reviews.length > 0 && (
            <div className="space-y-1.5 pt-1 border-t border-border">
              <p className="font-semibold text-[10px] text-foreground">Avaliações</p>
              {props.reviews.slice(0, 2).map((r, i) => (
                <div key={i} className="rounded border border-border p-1.5 bg-muted/20">
                  <div className="flex items-center gap-1 mb-0.5">
                    <div className="flex">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star
                          key={s}
                          className={`h-2.5 w-2.5 ${s <= r.rating ? "fill-warning text-warning" : "text-muted-foreground"}`}
                        />
                      ))}
                    </div>
                    <span className="font-medium text-[9px]">{r.name || "Anônimo"}</span>
                  </div>
                  <p className="text-[9px] text-muted-foreground">{r.comment || "..."}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Social notification popup */}
        {props.notificationsEnabled && (
          <div className="absolute bottom-10 left-2 right-2 animate-fade-in">
            <div className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 shadow-elevated text-[9px]">
              <ShoppingCart className="h-3 w-3 text-primary shrink-0" />
              <span>
                <strong>{props.notificationNames[0] || "Alguém"}</strong> acabou de comprar
              </span>
            </div>
          </div>
        )}

        {/* WhatsApp floating */}
        {props.whatsappEnabled && (
          <div className="absolute bottom-2 right-2">
            <div className="h-8 w-8 rounded-full bg-[#25d366] flex items-center justify-center shadow-elevated">
              <Phone className="h-4 w-4 text-white" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CheckoutPreview;
