export type PaymentMethodLabel = "PIX" | "Cartão" | "Boleto" | "Cashout";

export type AcquirerCatalogEntry = {
  name: string;
  description: string;
  implemented: boolean;
  configurable: boolean;
  methodsSupported: PaymentMethodLabel[];
};

export const ACQUIRERS_CATALOG: AcquirerCatalogEntry[] = [
  {
    name: "KIPAY",
    description: "Gateway de pagamentos com foco em PIX.",
    implemented: true,
    configurable: true,
    methodsSupported: ["PIX"],
  },
  {
    name: "MERCADO PAGO",
    description: "Gateway de pagamentos completo para PIX, cartão e boleto.",
    implemented: true,
    configurable: true,
    methodsSupported: ["PIX", "Cartão", "Boleto"],
  },
  // Placeholders (não implementadas ainda). Mantemos somente métodos informados pelo negócio.
  {
    name: "ASAAS",
    description: "Entre em contato com o suporte para ativar esta adquirente.",
    implemented: false,
    configurable: false,
    methodsSupported: ["PIX", "Cartão", "Boleto"],
  },
  {
    name: "PAGARME",
    description: "Entre em contato com o suporte para ativar esta adquirente.",
    implemented: false,
    configurable: false,
    methodsSupported: ["PIX", "Cartão"],
  },
  {
    name: "APPMAX",
    description: "Entre em contato com o suporte para ativar esta adquirente.",
    implemented: false,
    configurable: false,
    methodsSupported: ["PIX", "Cartão", "Boleto"],
  },
  {
    name: "IUGU",
    description: "Entre em contato com o suporte para ativar esta adquirente.",
    implemented: false,
    configurable: false,
    methodsSupported: ["PIX", "Cartão", "Boleto"],
  },
  {
    name: "OPENPIX",
    description: "Entre em contato com o suporte para ativar esta adquirente.",
    implemented: false,
    configurable: false,
    methodsSupported: ["PIX"],
  },
];

export type PaymentMethodCard = {
  name: string;
  methodLabel: PaymentMethodLabel;
};

export const PAYMENT_METHODS_CATALOG: PaymentMethodCard[] = [
  { name: "PIX", methodLabel: "PIX" },
  { name: "Cartão", methodLabel: "Cartão" },
  { name: "Boleto", methodLabel: "Boleto" },
  { name: "Cashout", methodLabel: "Cashout" },
];
