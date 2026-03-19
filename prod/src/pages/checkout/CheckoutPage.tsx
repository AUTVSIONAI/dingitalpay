import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  fetchPublicCheckoutConfig,
  fetchPublicOfferById,
  fetchPublicProductById,
  fetchPublicProductsByIds,
} from "@/services/product.service";
import { createCheckoutOrder } from "@/services/checkout.service";
import { createPayment, type PaymentResult } from "@/services/payment.service";
import { Phone, Timer, Lock, BadgeCheck, Mail, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import LoadingState from "@/components/shared/LoadingState";
import { useMercadoPago, type CardData } from "@/hooks/useMercadoPago";
import { usePixelTracking } from "@/hooks/usePixelTracking";
import { getFacebookAttribution } from "@/lib/facebook-attribution";

import CheckoutForm from "./components/CheckoutForm";
import PaymentMethods from "./components/PaymentMethods";
import OrderSummary from "./components/OrderSummary";
import OrderBump from "./components/OrderBump";
import SocialProof from "./components/SocialProof";
import CheckoutSuccess from "./components/CheckoutSuccess";
import PaymentResultDisplay from "./components/PaymentResultDisplay";

type PaymentMethod = "pix" | "credit_card" | "boleto";

const CheckoutPage = () => {
  const { productId, offerId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [formData, setFormData] = useState<Record<string, string>>({});
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("pix");
  const [orderBumpAcceptedIds, setOrderBumpAcceptedIds] = useState<string[]>([]);
  const [completed, setCompleted] = useState(false);
  const [completedOrderId, setCompletedOrderId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [paymentResult, setPaymentResult] = useState<PaymentResult | null>(null);
  const cardDataRef = useRef<CardData | null>(null);
  const submittingRef = useRef(false);
  const initiateCheckoutEventIdRef = useRef<string | null>(null);

  // MercadoPago SDK - public key from env (publishable, safe in frontend)
  const mpPublicKey = import.meta.env.VITE_MERCADO_PAGO_PUBLIC_KEY || "";
  const { isReady: mpReady, createCardToken, error: mpError } = useMercadoPago(mpPublicKey || undefined);

  // Pixel tracking — resolved product id
  const resolvedProductId = offerId ? undefined : productId;

  // Fetch offer when offerId is present
  const { data: offer, isLoading: loadingOffer } = useQuery({
    queryKey: ["checkout-offer", offerId],
    queryFn: () => fetchPublicOfferById(offerId!),
    enabled: !!offerId,
  });

  const effectiveProductId = offerId ? offer?.product_id : productId;

  // Pixel tracking
  const { trackEvent } = usePixelTracking(effectiveProductId);

  // Fetch product
  const { data: product, isLoading: loadingProduct } = useQuery({
    queryKey: ["checkout-product", effectiveProductId],
    queryFn: () => fetchPublicProductById(effectiveProductId!),
    enabled: !!effectiveProductId,
  });

  // Fetch checkout config
  const { data: checkoutConfig } = useQuery({
    queryKey: ["checkout-config", effectiveProductId],
    queryFn: () => fetchPublicCheckoutConfig(effectiveProductId!),
    enabled: !!effectiveProductId,
  });

  // Use offer price when available, otherwise product price
  const checkoutPrice = offer ? Number(offer.price) : (product ? Number(product.price) : 0);

  // Parse config with defaults
  const cfg = {
    buyButtonText: checkoutConfig?.buy_button_text || "Finalizar compra",
    countdownEnabled: checkoutConfig?.countdown_enabled ?? false,
    countdownMinutes: checkoutConfig?.countdown_minutes ?? 15,
    countdownPhrase: checkoutConfig?.countdown_phrase || "Oferta por tempo limitado!",
    countdownExpiredPhrase: checkoutConfig?.countdown_expired_phrase || "Oferta encerrada.",
    bannerUrl: checkoutConfig?.banner_url || "",
    socialProofEnabled: checkoutConfig?.social_proof_enabled ?? false,
    notificationNames: (Array.isArray((checkoutConfig?.notification_names as any)) ? (checkoutConfig?.notification_names as string[]) : ["Maria S.", "João P.", "Ana L."]),
    notificationInterval: checkoutConfig?.notification_interval ?? 8,
    reviewsEnabled: checkoutConfig?.reviews_enabled ?? false,
    reviews: (Array.isArray((checkoutConfig?.reviews as any)) ? (checkoutConfig?.reviews as any[]) : []),
    whatsappSupport: checkoutConfig?.whatsapp_support || "",
    whatsappMessage: checkoutConfig?.whatsapp_message || "Olá! Preciso de ajuda com minha compra.",
    orderBumpItems: Array.isArray((checkoutConfig as any)?.order_bump_items) && (checkoutConfig as any).order_bump_items.length > 0
      ? ((checkoutConfig as any).order_bump_items as Array<{ product_id: string; discount_enabled?: boolean; discount_percentage?: number }>).map((item) => ({
          productId: item.product_id,
          discountEnabled: item.discount_enabled !== false,
          discountPercentage: item.discount_enabled === false ? 0 : Math.max(0, Number(item.discount_percentage ?? 30)),
        }))
      : (checkoutConfig?.order_bump_product_id
        ? [{
            productId: checkoutConfig.order_bump_product_id,
            discountEnabled: Number((checkoutConfig as any)?.order_bump_discount ?? 0) > 0,
            discountPercentage: Math.max(0, Number((checkoutConfig as any)?.order_bump_discount ?? 30)),
          }]
        : []),
    requiredFields: (checkoutConfig?.required_fields as any) ?? { name: true, email: true, cpf: true, phone: false },
    paymentMethods: (checkoutConfig?.payment_methods as any) ?? { pix: true, credit_card: true, boleto: true },
    colors: (checkoutConfig?.colors as any) ?? { primary: "#8B5CF6", background: "#ffffff", text: "#1a1a2e" },
    checkoutTheme: ((checkoutConfig?.colors as any)?.theme as "light" | "dark") || "light",
    thankYouConfig: (checkoutConfig?.thank_you_config as any) ?? { title: "Compra realizada com sucesso!", message: "Você receberá os detalhes por e-mail.", redirect_url: "" },
    thankYouRedirectDelay: checkoutConfig?.thank_you_redirect_delay ?? 5,
  };

  const primaryColor = cfg.colors.primary || "#8B5CF6";
  const buyButtonColor = cfg.colors.buy_button_color || primaryColor;
  const buyButtonTextColor = cfg.colors.buy_button_text_color || "#ffffff";
  const orderBumpProductIds = cfg.orderBumpItems.map((item) => item.productId);
  const { data: orderBumpProducts = [] } = useQuery({
    queryKey: ["checkout-order-bump-products", orderBumpProductIds.slice().sort().join(",")],
    queryFn: () => fetchPublicProductsByIds(orderBumpProductIds),
    enabled: orderBumpProductIds.length > 0,
  });
  const orderBumpProductsMap = new Map(orderBumpProducts.map((item) => [item.id, item] as const));
  const orderBumpOptions = cfg.orderBumpItems
    .map((item) => {
      const product = orderBumpProductsMap.get(item.productId);
      if (!product || product.status !== "active") return null;
      return {
        productId: product.id,
        name: product.name,
        shortDescription: product.short_description,
        price: Number(product.price),
        discountEnabled: item.discountEnabled,
        discountPercentage: item.discountEnabled ? item.discountPercentage : 0,
      };
    })
    .filter((item): item is NonNullable<typeof item> => !!item);
  const selectedOrderBumps = orderBumpOptions.filter((item) => orderBumpAcceptedIds.includes(item.productId));
  const totalCheckoutAmount = checkoutPrice + selectedOrderBumps.reduce((sum, item) => (
    sum + (item.discountEnabled ? item.price * (1 - item.discountPercentage / 100) : item.price)
  ), 0);

  useEffect(() => {
    setOrderBumpAcceptedIds((current) => current.filter((productId) => orderBumpOptions.some((item) => item.productId === productId)));
  }, [orderBumpOptions]);

  // Track InitiateCheckout on first form interaction
  const initiateTrackedRef = useRef(false);
  const handleInitiateCheckout = useCallback(() => {
    if (!product || initiateTrackedRef.current) return;
    initiateTrackedRef.current = true;
    const attribution = getFacebookAttribution({ searchParams });
    const eventId = trackEvent("InitiateCheckout", {
      value: checkoutPrice,
      currency: "BRL",
      content_name: product.name,
      content_ids: [product.id],
      content_type: "product",
    }, {
      attribution,
      userData: {
        email: formData.email,
        name: formData.name,
        phone: formData.phone,
      },
    });
    initiateCheckoutEventIdRef.current = eventId || null;
  }, [product, checkoutPrice, trackEvent, formData, searchParams]);

  // Countdown timer
  useEffect(() => {
    if (!cfg.countdownEnabled) return;
    setCountdown(cfg.countdownMinutes * 60);
    const interval = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [cfg.countdownEnabled, cfg.countdownMinutes]);

  const formatCountdown = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  };

  // Collect UTM params
  const getUtmParams = useCallback(() => {
    const utmKeys = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "ref", "affiliate", "aff"];
    const utm: Record<string, string> = {};
    utmKeys.forEach((key) => {
      const val = searchParams.get(key);
      if (val) utm[key] = val;
    });
    return Object.keys(utm).length > 0 ? utm : undefined;
  }, [searchParams]);

  useEffect(() => {
    const email = String(searchParams.get("email") || "").trim();
    if (!email || !/\S+@\S+\.\S+/.test(email)) return;
    setFormData((current) => {
      if (String(current.email || "").trim()) return current;
      return {
        ...current,
        email,
        emailConfirm: email,
      };
    });
  }, [searchParams]);

  useEffect(() => {
    getFacebookAttribution({ searchParams });
  }, [searchParams]);

  // Submit order
  const handleSubmit = async () => {
    if (!product || submittingRef.current) return;
    submittingRef.current = true;

    // Validate required fields
    if (cfg.requiredFields.name && !formData.name?.trim()) {
      toast.error("Preencha o nome completo.");
      submittingRef.current = false;
      return;
    }
    if (cfg.requiredFields.email && !formData.email?.trim()) {
      toast.error("Preencha o e-mail.");
      submittingRef.current = false;
      return;
    }
    if (cfg.requiredFields.email && !/\S+@\S+\.\S+/.test(formData.email)) {
      toast.error("E-mail inválido.");
      submittingRef.current = false;
      return;
    }
    if (checkoutConfig?.email_confirmation && formData.email !== formData.emailConfirm) {
      toast.error("Os e-mails não coincidem.");
      submittingRef.current = false;
      return;
    }

    setSubmitting(true);
    try {
      // Tokenize card if credit card method
      let tokenizedCardToken: string | undefined;
      let selectedInstallments: number | undefined;

      if (paymentMethod === "credit_card") {
        const cardData = cardDataRef.current;
        if (!cardData || !cardData.cardNumber || !cardData.securityCode) {
          toast.error("Preencha todos os campos do cartão.");
          setSubmitting(false);
          return;
        }
        if (!mpReady) {
          toast.error("SDK de pagamento ainda carregando. Tente novamente.");
          setSubmitting(false);
          return;
        }
        try {
          tokenizedCardToken = await createCardToken(cardData, formData.cpf);
          selectedInstallments = cardData.installments;
        } catch (tokenErr: any) {
          console.error("Card tokenization error:", tokenErr);
          toast.error("Erro ao processar dados do cartão. Verifique os dados e tente novamente.");
          setSubmitting(false);
          return;
        }
      }

      // 1. Create order server-side (bypass RLS) via edge function
      if (!initiateTrackedRef.current) {
        handleInitiateCheckout();
      }
      const attribution = getFacebookAttribution({ searchParams });
      const { order_id, payment_token } = await createCheckoutOrder({
        product_id: product.id,
        offer_id: offerId || undefined,
        buyer_email: formData.email || "",
        buyer_name: formData.name || "",
        buyer_phone: formData.phone || "",
        buyer_cpf: formData.cpf || "",
        method: paymentMethod,
        utm: getUtmParams(),
        meta_fbc: attribution.fbc || undefined,
        meta_fbp: attribution.fbp || undefined,
        meta_initiate_checkout_event_id: initiateCheckoutEventIdRef.current || undefined,
        items: [
          {
            product_id: product.id,
            product_name: product.name,
            amount: checkoutPrice,
            is_order_bump: false,
          },
          ...selectedOrderBumps.map((item) => ({
            product_id: item.productId,
            product_name: item.name,
            amount: item.discountEnabled ? item.price * (1 - item.discountPercentage / 100) : item.price,
            is_order_bump: true,
          })),
        ],
      });

      // 2. Call Mercado Pago via edge function
      const paymentData = await createPayment({
        order_id,
        payment_token,
        amount: totalCheckoutAmount,
        method: paymentMethod,
        buyer_email: formData.email || "",
        buyer_name: formData.name || "",
        buyer_cpf: formData.cpf || "",
        description: product.name,
        card_token: tokenizedCardToken,
        installments: selectedInstallments,
      });

      // PIX: redirect to dedicated page
      if (paymentMethod === "pix") {
        navigate(`/pix/${order_id}`, {
          state: {
            qr_code: paymentData.pix?.qr_code,
            qr_code_base64: paymentData.pix?.qr_code_base64,
            productName: product.name,
            amount: totalCheckoutAmount,
            primaryColor,
            checkoutTheme: cfg.checkoutTheme,
          },
          replace: true,
        });
        return;
      }

      setPaymentResult(paymentData);

      // If credit card approved, go to success
      if (paymentMethod === "credit_card" && paymentData.status === "approved") {
        setCompletedOrderId(order_id);
        setTimeout(() => setCompleted(true), 2000);
      }
      // PIX and boleto show payment instructions (QR code / barcode)
    } catch (err: any) {
      console.error("Checkout error:", err);
      toast.error(err.message || "Erro ao processar pedido. Tente novamente.");
    } finally {
      setSubmitting(false);
      submittingRef.current = false;
    }
  };

  if (loadingProduct || loadingOffer) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingState />
      </div>
    );
  }

  if (!product || product.status !== "active" || (offerId && (!offer || !offer.active))) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 p-4 text-center">
        <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mx-auto">
          <Lock className="h-7 w-7 text-muted-foreground" />
        </div>
        <h1 className="text-lg font-semibold text-foreground">Produto indisponível</h1>
        <p className="text-sm text-muted-foreground max-w-sm">
          Este produto está inativo ou foi removido da plataforma. Entre em contato com o vendedor para mais informações.
        </p>
      </div>
    );
  }

  if (completed) {
    const redirectUrl = cfg.thankYouConfig.redirect_url;
    if (redirectUrl) {
      window.location.href = redirectUrl;
      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
          <p className="text-sm text-muted-foreground">Redirecionando...</p>
        </div>
      );
    }
    navigate(`/obrigado/${encodeURIComponent(completedOrderId || "")}`, {
      state: {
        productName: product.name,
        email: formData.email,
        paymentMethod,
        productId: product.id,
        amount: totalCheckoutAmount,
      },
      replace: true,
    });
    return null;
  }

  return (
    <div
      data-checkout-theme={cfg.checkoutTheme}
      className="min-h-screen bg-background text-foreground"
    >
      {/* Countdown bar */}
      {cfg.countdownEnabled && (
        <motion.div
          initial={{ y: -40 }}
          animate={{ y: 0 }}
          className="py-2.5 px-4 text-center text-white"
          style={{ backgroundColor: cfg.colors.primary }}
        >
          <div className="flex items-center justify-center gap-2 text-sm font-medium">
            <Timer className="h-4 w-4" />
            {countdown > 0 ? (
              <>
                <span>{cfg.countdownPhrase}</span>
                <span className="font-bold font-mono px-2 py-0.5 rounded" style={{ backgroundColor: "rgba(255,255,255,0.2)" }}>
                  {formatCountdown(countdown)}
                </span>
              </>
            ) : (
              <span>{cfg.countdownExpiredPhrase}</span>
            )}
          </div>
        </motion.div>
      )}

      {/* Banner */}
      {cfg.bannerUrl && (
        <div className="w-full h-40 md:h-56 overflow-hidden">
          <img src={cfg.bannerUrl} alt="Banner" className="w-full h-full object-cover" />
        </div>
      )}

      {/* Main content */}
      <div className="max-w-5xl mx-auto px-4 py-8 md:py-12">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          {/* Left: Form */}
          <div className="lg:col-span-3">
            {/* Product header mobile */}
            <div className="lg:hidden rounded-xl border border-border bg-card p-4">
              <h1 className="text-lg font-bold text-foreground">{product.name}</h1>
              {product.short_description && (
                <p className="text-sm mt-1 text-muted-foreground">{product.short_description}</p>
              )}
              <p className="text-xl font-bold mt-2" style={{ color: cfg.colors.primary }}>
                R$ {checkoutPrice.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>

            {/* Form card */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-6 lg:mt-0 rounded-xl border border-border bg-card p-5 md:p-6 space-y-6"
            >
              <CheckoutForm
                fieldName={cfg.requiredFields.name}
                fieldEmail={cfg.requiredFields.email}
                fieldCpf={cfg.requiredFields.cpf}
                fieldPhone={cfg.requiredFields.phone}
                fieldBirthDate={cfg.requiredFields.birth_date ?? false}
                fieldAddress={cfg.requiredFields.address ?? false}
                emailConfirmation={checkoutConfig?.email_confirmation ?? false}
                primaryColor={primaryColor}
                onFormChange={setFormData}
                onFirstInteraction={handleInitiateCheckout}
              />

              <div className="border-t border-border" />

              <PaymentMethods
                pix={cfg.paymentMethods.pix}
                creditCard={cfg.paymentMethods.credit_card}
                boleto={cfg.paymentMethods.boleto}
                primaryColor={primaryColor}
                onMethodChange={(method) => {
                  setPaymentMethod(method);
                  trackEvent("AddPaymentInfo", {
                    content_category: method,
                    value: checkoutPrice,
                    currency: "BRL",
                  }, {
                    email: formData.email,
                    name: formData.name,
                    phone: formData.phone,
                  });
                }}
                onCardDataChange={(data) => { cardDataRef.current = data; }}
              />

              {/* Payment result (QR code, barcode, card status) */}
              {paymentResult && (
                <div className="pt-2">
                  <PaymentResultDisplay
                    result={paymentResult}
                    method={paymentMethod}
                    primaryColor={primaryColor}
                  />
                </div>
              )}
            </motion.div>

            {/* Order Bump */}
            {orderBumpOptions.length > 0 && (
              <div className="mt-6">
                <OrderBump
                  items={orderBumpOptions}
                  acceptedIds={orderBumpAcceptedIds}
                  onAcceptChange={(productId, accepted) => {
                    setOrderBumpAcceptedIds((current) => (
                      accepted
                        ? Array.from(new Set([...current, productId]))
                        : current.filter((currentId) => currentId !== productId)
                    ));
                  }}
                  primaryColor={primaryColor}
                />
              </div>
            )}

            {/* Buy button */}
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="mt-6">
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="w-full py-4 rounded-xl text-base font-bold transition-all hover:opacity-90 hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                style={{
                  backgroundColor: buyButtonColor,
                  color: buyButtonTextColor,
                }}
              >
                <ArrowRight className="h-5 w-5" />
                {submitting ? "Processando..." : cfg.buyButtonText}
              </button>
              <div className="flex items-center justify-center gap-4 mt-3 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1"><Lock className="h-3 w-3" /> Pagamento seguro</span>
                <span>•</span>
                <span className="flex items-center gap-1"><BadgeCheck className="h-3 w-3" /> Garantia de 7 dias</span>
                <span>•</span>
                <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> Acesso imediato</span>
              </div>
            </motion.div>

            {/* Social proof: reviews + notifications */}
            {(cfg.socialProofEnabled || cfg.reviewsEnabled) && (
              <div className="mt-6">
                <SocialProof
                  notificationsEnabled={cfg.socialProofEnabled}
                  notificationNames={cfg.notificationNames}
                  notificationInterval={cfg.notificationInterval}
                  reviewsEnabled={cfg.reviewsEnabled}
                  reviews={cfg.reviews}
                  primaryColor={primaryColor}
                />
              </div>
            )}
          </div>

          {/* Right: Summary (sticky on desktop) */}
          <div className="lg:col-span-2">
            <div className="lg:sticky lg:top-8 space-y-4">
              <OrderSummary
                product={{ ...product, price: checkoutPrice }}
                primaryColor={primaryColor}
                orderBumpItems={orderBumpOptions}
                acceptedOrderBumpIds={orderBumpAcceptedIds}
              />

              {/* Trust badges */}
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="space-y-1">
                    <div className="h-8 w-8 rounded-full bg-success/10 flex items-center justify-center mx-auto">
                      <Lock className="h-4 w-4 text-success" />
                    </div>
                    <p className="text-[10px] leading-tight text-muted-foreground">Compra segura</p>
                  </div>
                  <div className="space-y-1">
                    <div className="h-8 w-8 rounded-full flex items-center justify-center mx-auto" style={{ backgroundColor: `${cfg.colors.primary}1a` }}>
                      <BadgeCheck className="h-4 w-4" style={{ color: cfg.colors.primary }} />
                    </div>
                    <p className="text-[10px] leading-tight text-muted-foreground">7 dias de garantia</p>
                  </div>
                  <div className="space-y-1">
                    <div className="h-8 w-8 rounded-full flex items-center justify-center mx-auto" style={{ backgroundColor: `${cfg.colors.primary}1a` }}>
                      <Mail className="h-4 w-4" style={{ color: cfg.colors.primary }} />
                    </div>
                    <p className="text-[10px] leading-tight text-muted-foreground">Acesso imediato</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* WhatsApp floating */}
      {cfg.whatsappSupport && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 1, type: "spring" }}
          className="fixed bottom-6 right-6 z-50"
        >
          <a
            href={`https://wa.me/55${cfg.whatsappSupport.replace(/\D/g, "")}?text=${encodeURIComponent(cfg.whatsappMessage)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="h-14 w-14 rounded-full bg-[#25d366] flex items-center justify-center shadow-elevated hover:scale-110 transition-transform"
          >
            <Phone className="h-6 w-6 text-white" />
          </a>
        </motion.div>
      )}

      {/* Footer */}
      <div className="border-t border-border bg-card py-6 px-4 text-center">
        <p className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} · Todos os direitos reservados · Termos de uso · Política de privacidade
        </p>
      </div>
    </div>
  );
};

export default CheckoutPage;
