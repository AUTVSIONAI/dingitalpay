import { useState, useEffect, useCallback } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QrCode, CreditCard, Barcode } from "lucide-react";
import { motion } from "framer-motion";
import type { CardData } from "@/hooks/useMercadoPago";

interface PaymentMethodsProps {
  pix?: boolean;
  creditCard?: boolean;
  boleto?: boolean;
  primaryColor?: string;
  onMethodChange?: (method: "pix" | "credit_card" | "boleto") => void;
  onCardDataChange?: (data: CardData) => void;
}

const methodMap: Record<string, "pix" | "credit_card" | "boleto"> = {
  pix: "pix",
  card: "credit_card",
  boleto: "boleto",
};

const formatCardNumber = (value: string) => {
  const digits = value.replace(/\D/g, "").slice(0, 16);
  return digits.replace(/(\d{4})(?=\d)/g, "$1 ");
};

const formatExpiry = (value: string) => {
  const digits = value.replace(/\D/g, "").slice(0, 4);
  if (digits.length > 2) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return digits;
};

const PaymentMethods = ({
  pix = true,
  creditCard = true,
  boleto = true,
  primaryColor,
  onMethodChange,
  onCardDataChange,
}: PaymentMethodsProps) => {
  const [cardNumber, setCardNumber] = useState("");
  const [cardholderName, setCardholderName] = useState("");
  const [expiry, setExpiry] = useState("");
  const [securityCode, setSecurityCode] = useState("");
  const [installments, setInstallments] = useState(1);

  const methods = [
    { value: "pix", label: "PIX", icon: QrCode, enabled: pix },
    { value: "card", label: "Cartão", icon: CreditCard, enabled: creditCard },
    { value: "boleto", label: "Boleto", icon: Barcode, enabled: boleto },
  ].filter((m) => m.enabled);

  const defaultMethod = methods[0]?.value || "pix";

  useEffect(() => {
    onMethodChange?.(methodMap[defaultMethod] || "pix");
  }, []);

  // Notify parent when card data changes
  const notifyCardData = useCallback(() => {
    const parts = expiry.split("/");
    const expirationMonth = parts[0] || "";
    const expirationYear = parts[1] || "";

    onCardDataChange?.({
      cardNumber: cardNumber.replace(/\s/g, ""),
      cardholderName,
      expirationMonth,
      expirationYear,
      securityCode,
      installments,
    });
  }, [cardNumber, cardholderName, expiry, securityCode, installments, onCardDataChange]);

  useEffect(() => {
    notifyCardData();
  }, [notifyCardData]);

  const handleTabChange = (value: string) => {
    onMethodChange?.(methodMap[value] || "pix");
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <CreditCard className="h-4 w-4" style={primaryColor ? { color: primaryColor } : undefined} />
        <h3 className="font-semibold text-foreground text-sm">Forma de pagamento</h3>
      </div>

      <Tabs defaultValue={defaultMethod} onValueChange={handleTabChange} className="w-full">
        <TabsList className="w-full grid" style={{ gridTemplateColumns: `repeat(${methods.length}, 1fr)` }}>
          {methods.map((m) => (
            <TabsTrigger key={m.value} value={m.value} className="flex items-center gap-1.5 text-xs">
              <m.icon className="h-3.5 w-3.5" />
              {m.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* PIX */}
        {pix && (
          <TabsContent value="pix">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4 pt-4">
              <div className="flex flex-col items-center gap-3 p-6 rounded-lg border border-border bg-muted/30">
                <div
                  className="h-32 w-32 rounded-lg border-2 border-dashed bg-background flex items-center justify-center"
                  style={{ borderColor: primaryColor ? `${primaryColor}4d` : undefined }}
                >
                  <QrCode className="h-16 w-16" style={{ color: primaryColor ? `${primaryColor}66` : undefined }} />
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  O QR Code será gerado após confirmar a compra
                </p>
              </div>
              <div className="rounded-lg bg-success/10 border border-success/20 p-3">
                <p className="text-xs text-success font-medium">✓ Aprovação instantânea após pagamento</p>
              </div>
            </motion.div>
          </TabsContent>
        )}

        {/* Cartão */}
        {creditCard && (
          <TabsContent value="card">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3 pt-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Número do cartão</Label>
                <Input
                  placeholder="0000 0000 0000 0000"
                  className="h-10 bg-background text-sm font-mono"
                  value={cardNumber}
                  onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                  maxLength={19}
                  inputMode="numeric"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Nome no cartão</Label>
                <Input
                  placeholder="Como está impresso no cartão"
                  className="h-10 bg-background text-sm"
                  value={cardholderName}
                  onChange={(e) => setCardholderName(e.target.value.toUpperCase())}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Validade</Label>
                  <Input
                    placeholder="MM/AA"
                    className="h-10 bg-background text-sm font-mono"
                    value={expiry}
                    onChange={(e) => setExpiry(formatExpiry(e.target.value))}
                    maxLength={5}
                    inputMode="numeric"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">CVV</Label>
                  <Input
                    placeholder="000"
                    className="h-10 bg-background text-sm font-mono"
                    value={securityCode}
                    onChange={(e) => setSecurityCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
                    maxLength={4}
                    inputMode="numeric"
                    type="password"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Parcelas</Label>
                <Select
                  value={String(installments)}
                  onValueChange={(v) => setInstallments(Number(v))}
                >
                  <SelectTrigger className="h-10 bg-background text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1x (sem juros)</SelectItem>
                    <SelectItem value="2">2x</SelectItem>
                    <SelectItem value="3">3x</SelectItem>
                    <SelectItem value="6">6x</SelectItem>
                    <SelectItem value="12">12x</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </motion.div>
          </TabsContent>
        )}

        {/* Boleto */}
        {boleto && (
          <TabsContent value="boleto">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4 pt-4">
              <div className="flex flex-col items-center gap-3 p-6 rounded-lg border border-border bg-muted/30">
                <Barcode className="h-12 w-24 text-muted-foreground" />
                <p className="text-xs text-muted-foreground text-center">
                  O boleto será gerado após confirmar a compra
                </p>
              </div>
              <div className="rounded-lg bg-warning/10 border border-warning/20 p-3">
                <p className="text-xs text-warning font-medium">⏱ Pagamento processado em até 3 dias úteis</p>
              </div>
            </motion.div>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
};

export default PaymentMethods;
