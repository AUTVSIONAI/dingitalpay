import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { CheckCircle, Mail, ShieldCheck } from "lucide-react";
import { useLocation, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { usePixelTracking } from "@/hooks/usePixelTracking";
import NotFound from "@/pages/NotFound";
import LoadingState from "@/components/shared/LoadingState";
import { getFacebookAttribution } from "@/lib/facebook-attribution";

const ThankYouPage = () => {
  const location = useLocation();
  const { orderId: orderIdParam } = useParams<{ orderId: string }>();
  
  const state = location.state as {
    productName?: string;
    email?: string;
    paymentMethod?: string;
    productId?: string;
    amount?: number;
  } | null;

  const { trackEvent } = usePixelTracking(state?.productId);
  const trackedRef = useRef(false);
  const orderId = String(orderIdParam || "").trim();

  const { data: orderStatus, isLoading, isFetched } = useQuery({
    queryKey: ["thank-you-order-status", orderId],
    queryFn: async () => {
      const res = await fetch(`/api/functions/order-status/${encodeURIComponent(orderId!)}`, {
        method: "GET",
        credentials: "omit",
        headers: { "content-type": "application/json" },
      });
      if (!res.ok) return null;
      return res.json().catch(() => null);
    },
    enabled: !!orderId,
    retry: false,
    staleTime: 30_000,
  });

  const normalizedStatus = String(orderStatus?.status || "").trim().toLowerCase();

  useEffect(() => {
    if (state?.productId && orderId && normalizedStatus === "approved" && !trackedRef.current) {
      trackedRef.current = true;
      const attribution = getFacebookAttribution();
      trackEvent("Purchase", {
        value: state.amount || 0,
        currency: "BRL",
        content_name: state.productName || "",
        content_ids: [state.productId],
        content_type: "product",
      }, {
        eventId: `order:${orderId}:Purchase`,
        attribution,
        userData: {
          email: state.email,
        },
      });
    }
  }, [state?.productId, state?.amount, state?.productName, state?.email, orderId, normalizedStatus, trackEvent]);

  if (!orderId) {
    return <NotFound />;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingState />
      </div>
    );
  }

  if (isFetched && normalizedStatus !== "approved") {
    return <NotFound />;
  }

  const paymentLabel =
    state?.paymentMethod === "credit_card"
      ? "Cartão de crédito"
      : state?.paymentMethod === "boleto"
      ? "Boleto bancário"
      : "PIX";

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", duration: 0.7 }}
        className="max-w-lg w-full space-y-8"
      >
        {/* Success icon */}
        <div className="flex flex-col items-center gap-4">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.15, type: "spring", stiffness: 180, damping: 14 }}
            className="relative"
          >
            <div className="absolute inset-0 rounded-full bg-success/20 blur-xl scale-150" />
            <div className="relative w-20 h-20 rounded-full bg-success/10 border-2 border-success/30 flex items-center justify-center">
              <CheckCircle className="h-10 w-10 text-success" />
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="text-center space-y-2"
          >
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
              Compra aprovada!
            </h1>
            <p className="text-muted-foreground text-sm sm:text-base max-w-sm mx-auto">
              Tudo certo! Os dados da sua compra foram enviados para o seu e-mail.
            </p>
          </motion.div>
        </div>

        {/* Order details card */}
        {state?.productName && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden"
          >
            <div className="px-5 py-4 bg-muted/40 border-b border-border">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Resumo do pedido
              </p>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-0.5 min-w-0">
                  <p className="text-xs text-muted-foreground">Produto</p>
                  <p className="text-sm font-semibold text-foreground truncate">
                    {state.productName}
                  </p>
                </div>
                <span className="shrink-0 mt-4 inline-flex items-center rounded-full bg-success/10 text-success text-[11px] font-medium px-2.5 py-0.5">
                  Aprovado
                </span>
              </div>

              <div className="h-px bg-border" />

              {state.email && (
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Mail className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">E-mail de acesso</p>
                    <p className="text-sm font-medium text-foreground truncate">{state.email}</p>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Pagamento</p>
                  <p className="text-sm font-medium text-foreground">{paymentLabel}</p>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Email notice */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.55 }}
          className="flex items-center gap-3 rounded-xl bg-muted/50 border border-border p-4"
        >
          <Mail className="h-5 w-5 text-muted-foreground shrink-0" />
          <p className="text-xs sm:text-sm text-muted-foreground">
            Verifique sua <span className="font-medium text-foreground">caixa de entrada</span> e a pasta de spam para os detalhes da compra.
          </p>
        </motion.div>

      </motion.div>
    </div>
  );
};

export default ThankYouPage;
