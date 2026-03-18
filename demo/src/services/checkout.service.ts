import { supabase } from "@/integrations/supabase/client";

export type CheckoutMethod = "pix" | "credit_card" | "boleto";

export interface CheckoutOrderItemInput {
  product_id: string;
  product_name: string;
  amount: number;
  is_order_bump?: boolean;
}

export interface CreateCheckoutOrderParams {
  product_id: string;
  offer_id?: string;
  buyer_email: string;
  buyer_name?: string;
  buyer_phone?: string;
  buyer_cpf?: string;
  method: CheckoutMethod;
  utm?: Record<string, string>;
  meta_fbc?: string;
  meta_fbp?: string;
  meta_initiate_checkout_event_id?: string;
  items: CheckoutOrderItemInput[];
}

export interface CreateCheckoutOrderResult {
  order_id: string;
  payment_token: string;
}

export const createCheckoutOrder = async (
  params: CreateCheckoutOrderParams,
): Promise<CreateCheckoutOrderResult> => {
  const { data, error } = await supabase.functions.invoke("create-order", {
    body: params,
  });

  if (error) {
    console.error("createCheckoutOrder error:", error);
    throw new Error(error.message || "Erro ao criar pedido");
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  if (!data?.order_id || !data?.payment_token) {
    throw new Error("Falha ao criar pedido.");
  }

  return data as CreateCheckoutOrderResult;
};
