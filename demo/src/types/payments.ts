import type { PaymentMethod, OrderStatus } from "@/types";

export type PaymentProvider = "MERCADO_PAGO" | "KIPAY";

export interface PixPaymentData {
  qr_code: string;
  qr_code_base64: string;
  expiration_date: string;
}

export interface BoletoPaymentData {
  barcode: string;
  external_resource_url: string;
  expiration_date: string;
}

export interface CardPaymentData {
  last_four_digits: string;
  installments: number;
}

export interface PaymentResult {
  provider: PaymentProvider;
  method: PaymentMethod;
  payment_id: string | number;
  status: string;
  status_detail: string;
  order_status: OrderStatus;
  pix?: PixPaymentData;
  boleto?: BoletoPaymentData;
  card?: CardPaymentData;
}

