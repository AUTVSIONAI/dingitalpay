import { isDemo } from "@/lib/demo-utils";

async function apiFetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (init?.body !== undefined && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  const response = await fetch(`/api${path}`, {
    credentials: "include",
    headers,
    ...init,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error?.message || payload?.error || "Request failed");
  }
  return payload?.data as T;
}

export interface DbWebhookEndpoint {
  id: string;
  seller_id: string;
  name: string;
  url: string;
  secret: string;
  active: boolean;
  events: string[];
  created_at: string;
  last_triggered_at: string | null;
  success_rate: number;
}

export interface DbWebhookLog {
  id: string;
  endpoint_id: string;
  event: string;
  status_code: number;
  response_time: number;
  triggered_at: string;
  success: boolean;
}

export interface DbWhatsAppInstance {
  id: string;
  seller_id: string;
  name: string;
  phone: string;
  status: string;
  events: string[];
  created_at: string;
  last_active_at: string | null;
  messages_sent_24h: number;
  delivery_rate: number;
  last_message_at: string | null;
}

export interface DbZapierIntegration {
  id: string;
  seller_id: string;
  name: string;
  webhook_url: string;
  active: boolean;
  events: string[];
  created_at: string;
  last_triggered_at: string | null;
}

export interface DbZapierLog {
  id: string;
  integration_id: string;
  event: string;
  triggered_at: string;
  success: boolean;
}

export interface WebhookTestResult {
  status_code: number;
  response_time: number;
  success: boolean;
  error?: string;
}

export interface ZapierTestResult {
  success: boolean;
  status_code: number;
  triggered_at: string;
}

export const fetchWebhookEndpoints = async (): Promise<DbWebhookEndpoint[]> => {
  if (isDemo()) {
    const { demoWebhookEndpoints } = await import("@/data/customer-stubs/integrations");
    return demoWebhookEndpoints;
  }
  return await apiFetchJson<DbWebhookEndpoint[]>("/seller/webhooks");
};

export const createWebhookEndpoint = async (ep: {
  name: string; url: string; active: boolean; events: string[];
}): Promise<DbWebhookEndpoint> => {
  return await apiFetchJson<DbWebhookEndpoint>("/seller/webhooks", {
    method: "POST",
    body: JSON.stringify(ep),
  });
};

export const updateWebhookEndpoint = async (id: string, ep: {
  name?: string; url?: string; active?: boolean; events?: string[];
}): Promise<DbWebhookEndpoint> => {
  return await apiFetchJson<DbWebhookEndpoint>(`/seller/webhooks/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(ep),
  });
};

export const deleteWebhookEndpoint = async (id: string): Promise<void> => {
  await apiFetchJson<{ ok: true }>(`/seller/webhooks/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
};

export const fetchWebhookLogs = async (endpointId: string): Promise<DbWebhookLog[]> => {
  return await apiFetchJson<DbWebhookLog[]>(`/seller/webhooks/${encodeURIComponent(endpointId)}/logs`);
};

export const testWebhookEndpoint = async (endpointId: string): Promise<WebhookTestResult> => {
  return await apiFetchJson<WebhookTestResult>(`/seller/webhooks/${encodeURIComponent(endpointId)}/test`, {
    method: "POST",
  });
};

export const fetchWhatsAppInstances = async (): Promise<DbWhatsAppInstance[]> => {
  return await apiFetchJson<DbWhatsAppInstance[]>("/seller/whatsapp-instances");
};

export const createWhatsAppInstance = async (instance: {
  name: string; phone: string; status: string; events?: string[];
}): Promise<DbWhatsAppInstance> => {
  return await apiFetchJson<DbWhatsAppInstance>("/seller/whatsapp-instances", {
    method: "POST",
    body: JSON.stringify(instance),
  });
};

export const deleteWhatsAppInstance = async (id: string): Promise<void> => {
  await apiFetchJson<{ ok: true }>(`/seller/whatsapp-instances/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
};

export const fetchZapierIntegrations = async (): Promise<DbZapierIntegration[]> => {
  if (isDemo()) {
    const { demoZapierIntegrations } = await import("@/data/customer-stubs/integrations");
    return demoZapierIntegrations;
  }
  return await apiFetchJson<DbZapierIntegration[]>("/seller/zapier-integrations");
};

export const createZapierIntegration = async (zap: {
  name: string; webhook_url: string; active: boolean; events: string[];
}): Promise<DbZapierIntegration> => {
  return await apiFetchJson<DbZapierIntegration>("/seller/zapier-integrations", {
    method: "POST",
    body: JSON.stringify(zap),
  });
};

export const updateZapierIntegration = async (id: string, zap: {
  name?: string; webhook_url?: string; active?: boolean; events?: string[];
}): Promise<DbZapierIntegration> => {
  return await apiFetchJson<DbZapierIntegration>(`/seller/zapier-integrations/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(zap),
  });
};

export const deleteZapierIntegration = async (id: string): Promise<void> => {
  await apiFetchJson<{ ok: true }>(`/seller/zapier-integrations/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
};

export const fetchZapierLogs = async (integrationId: string): Promise<DbZapierLog[]> => {
  return await apiFetchJson<DbZapierLog[]>(`/seller/zapier-integrations/${encodeURIComponent(integrationId)}/logs`);
};

export const testZapierIntegration = async (integrationId: string): Promise<ZapierTestResult> => {
  return await apiFetchJson<ZapierTestResult>(`/seller/zapier-integrations/${encodeURIComponent(integrationId)}/test`, {
    method: "POST",
  });
};
