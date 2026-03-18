export type AcquirerConfigPayload = {
  acquirer_name: string;
  active: boolean;
  credentials: Record<string, any>;
};

export function unwrapAcquirerConfigPayload(resp: unknown): AcquirerConfigPayload | null {
  const maybeWrapped = resp as any;
  const payload = maybeWrapped?.data ?? maybeWrapped;
  if (!payload || typeof payload !== "object") return null;
  return payload as AcquirerConfigPayload;
}

