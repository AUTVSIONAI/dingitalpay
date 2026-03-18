import { useState } from "react";
import { QrCode, Copy, Check, Barcode, ExternalLink, CreditCard, CheckCircle } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import type { PaymentResult } from "@/services/payment.service";

interface PaymentResultDisplayProps {
  result: PaymentResult;
  method: "pix" | "credit_card" | "boleto";
  primaryColor?: string;
}

const PaymentResultDisplay = ({ result, method, primaryColor }: PaymentResultDisplayProps) => {
  const [copied, setCopied] = useState(false);

  const handleCopyPix = () => {
    if (result.pix?.qr_code) {
      navigator.clipboard.writeText(result.pix.qr_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCopyBarcode = () => {
    if (result.boleto?.barcode) {
      navigator.clipboard.writeText(result.boleto.barcode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Credit card approved
  if (method === "credit_card" && result.status === "approved") {
    return (
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="space-y-4">
        <div className="flex flex-col items-center gap-3 p-6 rounded-lg border border-success/30 bg-success/5">
          <CheckCircle className="h-12 w-12 text-success" />
          <h3 className="text-lg font-semibold text-foreground">Pagamento aprovado!</h3>
          <p className="text-sm text-muted-foreground text-center">
            Cartão terminando em {result.card?.last_four_digits} • {result.card?.installments}x
          </p>
        </div>
      </motion.div>
    );
  }

  // Credit card pending/rejected
  if (method === "credit_card") {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
        <div className="flex flex-col items-center gap-3 p-6 rounded-lg border border-warning/30 bg-warning/5">
          <CreditCard className="h-10 w-10 text-warning" />
          <h3 className="text-base font-semibold text-foreground">Pagamento em processamento</h3>
          <p className="text-sm text-muted-foreground text-center">
            Status: {result.status_detail || result.status}
          </p>
        </div>
      </motion.div>
    );
  }

  // PIX
  if (method === "pix" && result.pix) {
    return (
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="space-y-4">
        <div className="flex flex-col items-center gap-3 p-6 rounded-lg border border-border bg-muted/30">
          {result.pix.qr_code_base64 ? (
            <img
              src={`data:image/png;base64,${result.pix.qr_code_base64}`}
              alt="QR Code PIX"
              className="h-48 w-48 rounded-lg"
            />
          ) : (
            <div className="h-48 w-48 rounded-lg border-2 border-dashed bg-background flex items-center justify-center">
              <QrCode className="h-16 w-16 text-muted-foreground" />
            </div>
          )}
          <p className="text-xs text-muted-foreground text-center">
            Escaneie o QR Code ou copie o código abaixo
          </p>
        </div>

        {result.pix.qr_code && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 p-3 rounded-lg border border-border bg-background">
              <code className="text-xs text-muted-foreground flex-1 truncate">{result.pix.qr_code}</code>
              <Button variant="ghost" size="sm" onClick={handleCopyPix} className="shrink-0">
                {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        )}

        <div className="rounded-lg bg-success/10 border border-success/20 p-3">
          <p className="text-xs text-success font-medium">✓ Aprovação instantânea após pagamento</p>
        </div>
      </motion.div>
    );
  }

  // Boleto
  if (method === "boleto" && result.boleto) {
    return (
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="space-y-4">
        <div className="flex flex-col items-center gap-3 p-6 rounded-lg border border-border bg-muted/30">
          <Barcode className="h-12 w-24 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">Boleto gerado com sucesso!</p>
          <p className="text-xs text-muted-foreground text-center">
            Copie o código de barras ou acesse o boleto pelo link abaixo
          </p>
        </div>

        {result.boleto.barcode && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 p-3 rounded-lg border border-border bg-background">
              <code className="text-xs text-muted-foreground flex-1 truncate">{result.boleto.barcode}</code>
              <Button variant="ghost" size="sm" onClick={handleCopyBarcode} className="shrink-0">
                {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        )}

        {result.boleto.external_resource_url && (
          <a
            href={result.boleto.external_resource_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full py-3 rounded-lg border border-border text-sm font-medium hover:bg-muted transition-colors"
          >
            <ExternalLink className="h-4 w-4" />
            Abrir boleto em PDF
          </a>
        )}

        <div className="rounded-lg bg-warning/10 border border-warning/20 p-3">
          <p className="text-xs text-warning font-medium">⏱ Pagamento processado em até 3 dias úteis</p>
        </div>
      </motion.div>
    );
  }

  return null;
};

export default PaymentResultDisplay;
