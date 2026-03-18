import { useEffect, useRef, useState, useCallback } from "react";

declare global {
  interface Window {
    MercadoPago: any;
  }
}

export interface CardData {
  cardNumber: string;
  cardholderName: string;
  expirationMonth: string;
  expirationYear: string;
  securityCode: string;
  installments: number;
}

interface UseMercadoPagoReturn {
  isReady: boolean;
  createCardToken: (cardData: CardData, cpf?: string) => Promise<string>;
  error: string | null;
}

const MP_SDK_URL = "https://sdk.mercadopago.com/js/v2";

export const useMercadoPago = (publicKey?: string): UseMercadoPagoReturn => {
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mpRef = useRef<any>(null);

  useEffect(() => {
    if (!publicKey) return;

    // Check if already loaded
    if (window.MercadoPago) {
      try {
        mpRef.current = new window.MercadoPago(publicKey);
        setIsReady(true);
      } catch (e) {
        setError("Erro ao inicializar Mercado Pago SDK");
      }
      return;
    }

    // Load SDK script
    const script = document.createElement("script");
    script.src = MP_SDK_URL;
    script.async = true;

    script.onload = () => {
      try {
        mpRef.current = new window.MercadoPago(publicKey);
        setIsReady(true);
      } catch (e) {
        setError("Erro ao inicializar Mercado Pago SDK");
      }
    };

    script.onerror = () => {
      setError("Erro ao carregar Mercado Pago SDK");
    };

    document.head.appendChild(script);

    return () => {
      // Don't remove script on unmount — it's cached
    };
  }, [publicKey]);

  const createCardToken = useCallback(
    async (cardData: CardData, cpf?: string): Promise<string> => {
      if (!mpRef.current) {
        throw new Error("Mercado Pago SDK não está pronto");
      }

      const tokenData: Record<string, any> = {
        cardNumber: cardData.cardNumber.replace(/\s/g, ""),
        cardholderName: cardData.cardholderName,
        cardExpirationMonth: cardData.expirationMonth.padStart(2, "0"),
        cardExpirationYear: cardData.expirationYear.length === 2
          ? `20${cardData.expirationYear}`
          : cardData.expirationYear,
        securityCode: cardData.securityCode,
      };

      if (cpf) {
        tokenData.identificationType = "CPF";
        tokenData.identificationNumber = cpf.replace(/\D/g, "");
      }

      const result = await mpRef.current.createCardToken(tokenData);

      if (result.error) {
        throw new Error(result.error);
      }

      return result.id;
    },
    []
  );

  return { isReady, createCardToken, error };
};
