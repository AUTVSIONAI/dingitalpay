import { supabase } from "@/integrations/supabase/client";
import type { PaymentResult } from "@/types";

export type { PaymentResult };

interface CreatePaymentParams {
  order_id: string;
  payment_token: string;
  amount: number;
  method: "pix" | "credit_card" | "boleto";
  buyer_email: string;
  buyer_name: string;
  buyer_cpf?: string;
  description?: string;
  card_token?: string;
  installments?: number;
  issuer_id?: string;
}

export const createPayment = async (params: CreatePaymentParams): Promise<PaymentResult> => {
  const { data, error } = await supabase.functions.invoke("create-payment", {
    body: params,
  });

  if (error) {
    console.error("createPayment error:", error);
    throw new Error(error.message || "Erro ao processar pagamento");
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  return data as PaymentResult;
};
