import { useState, useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { QrCode, Copy, Check, Clock, CheckCircle, ShieldCheck } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { QRCodeSVG } from "qrcode.react";
import LoadingState from "@/components/shared/LoadingState";

interface PixState {
  qr_code?: string;
  qr_code_base64?: string;
  productName: string;
  amount: number;
  primaryColor?: string;
  checkoutTheme?: "light" | "dark";
}

const PIX_EXPIRATION_MINUTES = 30;

const PixPaymentPage = () => {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const pixState = location.state as PixState | null;

  const [copied, setCopied] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(PIX_EXPIRATION_MINUTES * 60);

  const primaryColor = pixState?.primaryColor || "hsl(224, 76%, 48%)";
  const checkoutTheme = pixState?.checkoutTheme || "light";

  // Poll order status every 5s
  const { data: order } = useQuery({
    queryKey: ["pix-order-status", orderId],
    queryFn: async () => {
      const res = await fetch(`/api/functions/order-status/${encodeURIComponent(orderId!)}`, {
        method: "GET",
        credentials: "omit",
        headers: { "content-type": "application/json" },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `ORDER_STATUS_${res.status}`);
      }
      return res.json();
    },
    enabled: !!orderId,
    refetchInterval: 5000,
  });

  // Redirect on approval
  useEffect(() => {
    if (order?.status === "approved") {
      navigate(`/obrigado/${encodeURIComponent(orderId!)}`, {
        state: {
          productName: pixState?.productName,
          paymentMethod: "pix",
          amount: pixState?.amount,
        },
        replace: true,
      });
    }
  }, [order?.status, navigate, pixState]);

  // Scroll to top on mount
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // Countdown timer
  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  };

  const handleCopy = () => {
    if (pixState?.qr_code) {
      navigator.clipboard.writeText(pixState.qr_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  if (!pixState) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <QrCode className="h-12 w-12 text-muted-foreground mx-auto" />
          <p className="text-muted-foreground text-sm">Sessão expirada. Refaça o checkout.</p>
        </div>
      </div>
    );
  }

  const expired = secondsLeft <= 0;

  return (
    <div data-checkout-theme={checkoutTheme} className="min-h-screen bg-background text-foreground">
      {/* Header bar */}
      <div className="py-3 px-4 text-center text-white text-sm font-medium" style={{ backgroundColor: primaryColor }}>
        <div className="flex items-center justify-center gap-2">
          <ShieldCheck className="h-4 w-4" />
          Pagamento via PIX — {pixState.productName}
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-8 space-y-6">
        {/* Status card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-border bg-card p-6 md:p-8 space-y-6"
        >
          {/* Timer */}
          <div className="flex items-center justify-center gap-2 text-sm">
            <Clock className="h-4 w-4 text-muted-foreground" />
            {expired ? (
              <span className="text-destructive font-medium">QR Code expirado</span>
            ) : (
              <span className="text-muted-foreground">
                Expira em{" "}
                <span className="font-mono font-bold text-foreground">{formatTime(secondsLeft)}</span>
              </span>
            )}
          </div>

          {/* Amount */}
          <div className="text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Valor a pagar</p>
            <p className="text-3xl font-bold mt-1" style={{ color: primaryColor }}>
              R$ {pixState.amount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </p>
          </div>

          {/* QR Code */}
          <div className="flex flex-col items-center gap-4">
            {pixState.qr_code_base64 ? (
              <div className="bg-white p-4 rounded-xl shadow-card">
                <img
                  src={`data:image/png;base64,${pixState.qr_code_base64}`}
                  alt="QR Code PIX"
                  className="h-52 w-52"
                />
              </div>
            ) : pixState.qr_code ? (
              <div className="bg-white p-4 rounded-xl shadow-card">
                <QRCodeSVG value={pixState.qr_code} size={208} level="M" />
              </div>
            ) : (
              <div className="h-52 w-52 rounded-xl border-2 border-dashed border-border bg-muted flex items-center justify-center">
                <QrCode className="h-20 w-20 text-muted-foreground" />
              </div>
            )}
            <p className="text-xs text-muted-foreground text-center max-w-xs">
              Abra o app do seu banco, escolha <strong>pagar com PIX</strong> e escaneie o QR Code acima
            </p>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-border" />
            <span className="text-[10px] text-muted-foreground uppercase tracking-widest">ou copie o código</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* Copy code */}
          {pixState.qr_code && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 p-3 rounded-lg border border-border bg-muted/30">
                <code className="text-xs text-muted-foreground flex-1 break-all line-clamp-3">
                  {pixState.qr_code}
                </code>
              </div>
              <Button
                onClick={handleCopy}
                className="w-full gap-2"
                variant={copied ? "default" : "outline"}
                style={copied ? { backgroundColor: "hsl(var(--success))", color: "white" } : undefined}
              >
                {copied ? (
                  <>
                    <Check className="h-4 w-4" /> Código copiado!
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" /> Copiar código PIX
                  </>
                )}
              </Button>
            </div>
          )}
        </motion.div>

        {/* Waiting confirmation */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="rounded-xl border border-success/30 bg-success/5 p-4 flex items-start gap-3"
        >
          <div className="h-8 w-8 rounded-full bg-success/10 flex items-center justify-center shrink-0 mt-0.5">
            <CheckCircle className="h-4 w-4 text-success" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">Aguardando pagamento</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Assim que o PIX for confirmado, você será redirecionado automaticamente.
            </p>
          </div>
        </motion.div>

        {/* Polling indicator */}
        <div className="flex items-center justify-center gap-2 text-[11px] text-muted-foreground">
          <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
          Verificando pagamento automaticamente...
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-border bg-card py-6 px-4 text-center mt-8">
        <p className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} · Pagamento seguro via PIX
        </p>
      </div>
    </div>
  );
};

export default PixPaymentPage;
