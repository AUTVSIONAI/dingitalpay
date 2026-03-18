import type { PaymentMethodLabel } from "@/data/acquirersCatalog";

export type AcquirerStatus = "connected" | "inactive" | "not_configured" | "pending_test" | "test_failed";

export type BackendAcquirerStatus = {
  acquirer_name: string;
  implemented: boolean;
  methods_supported: PaymentMethodLabel[];
  active: boolean;
  configured: boolean;
  has_required_credentials: boolean;
  connection_test_ok: boolean;
  connection_test_message: string;
  last_checked_at: string | null;
  status: "connected" | "inactive" | "not_configured" | "pending_test" | "test_failed" | "not_implemented";
  reason: string;
  needs_retest?: boolean;
  config_updated_at?: string | null;
};

export type AcquirerOptionMeta = {
  acquirer_name: string;
  selectable: boolean;
  reason: string;
};

export type PaymentMethodOverview = {
  method: PaymentMethodLabel;
  current_acquirer_name: string | null;
  current_status: BackendAcquirerStatus["status"] | null;
  options: AcquirerOptionMeta[];
};

export type AdminAcquirersOverview = {
  configurableAcquirers: BackendAcquirerStatus[];
  availableForActivation: Array<{
    acquirer_name: string;
    implemented: boolean;
    methods_supported: PaymentMethodLabel[];
  }>;
  paymentMethods: PaymentMethodOverview[];
};
