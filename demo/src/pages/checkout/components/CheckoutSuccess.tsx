import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { CheckCircle, Mail, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CheckoutSuccessProps {
  productName: string;
  email?: string;
  paymentMethod: string;
  thankYouTitle?: string;
  thankYouMessage?: string;
  redirectUrl?: string;
  redirectDelay?: number;
}

const CheckoutSuccess = ({
  productName,
  email,
  paymentMethod,
  thankYouTitle,
  thankYouMessage,
  redirectUrl,
  redirectDelay = 5,
}: CheckoutSuccessProps) => {
  const [secondsLeft, setSecondsLeft] = useState(redirectDelay);

  const title = thankYouTitle || "Compra realizada!";
  const message = thankYouMessage || (
    paymentMethod === "pix"
      ? "Pagamento via PIX confirmado com sucesso."
      : paymentMethod === "boleto"
      ? "Seu boleto foi gerado. O acesso será liberado após a confirmação do pagamento."
      : "Pagamento confirmado com sucesso."
  );

  // Auto-redirect
  useEffect(() => {
    if (!redirectUrl) return;
    const timer = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          window.location.href = redirectUrl;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [redirectUrl]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", duration: 0.6 }}
        className="max-w-md w-full text-center space-y-6"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
        >
          <CheckCircle className="h-20 w-20 text-success mx-auto" />
        </motion.div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-foreground">{title}</h1>
          <p className="text-muted-foreground text-sm">{message}</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 space-y-3 text-left">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Produto</p>
            <p className="text-sm font-medium text-foreground">{productName}</p>
          </div>
          {email && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">E-mail de acesso</p>
              <p className="text-sm font-medium text-foreground">{email}</p>
            </div>
          )}
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Método de pagamento</p>
            <p className="text-sm font-medium text-foreground capitalize">
              {paymentMethod === "credit_card" ? "Cartão de crédito" : paymentMethod === "boleto" ? "Boleto" : "PIX"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 justify-center text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">
          <Mail className="h-4 w-4" />
          <span>Os detalhes foram enviados para o seu e-mail</span>
        </div>

        {redirectUrl ? (
          <p className="text-xs text-muted-foreground">
            Redirecionando em {secondsLeft}s...
          </p>
        ) : (
          <Button className="w-full" size="lg">
            Acessar conteúdo <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        )}
      </motion.div>
    </div>
  );
};

export default CheckoutSuccess;
