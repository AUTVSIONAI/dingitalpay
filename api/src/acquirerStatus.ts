export type AcquirerConnectionStatus =
  | "connected"
  | "inactive"
  | "not_configured"
  | "not_implemented"
  | "pending_test"
  | "test_failed";

export function toMs(v: string | Date | null | undefined): number | null {
  if (!v) return null;
  const d = typeof v === "string" ? new Date(v) : v;
  const ms = d.getTime();
  return Number.isFinite(ms) ? ms : null;
}

export function computeAcquirerConnectionStatus(input: {
  implemented: boolean;
  active: boolean;
  hasRequiredCredentials: boolean;
  configUpdatedAt: string | Date | null;
  healthOk: boolean | null;
  healthMessage: string;
  healthCheckedAt: string | Date | null;
}): {
  status: AcquirerConnectionStatus;
  reason: string;
  isFreshTest: boolean;
  needsRetest: boolean;
} {
  const cfgUpdatedMs = toMs(input.configUpdatedAt);
  const healthCheckedMs = toMs(input.healthCheckedAt);
  const isFreshTest =
    cfgUpdatedMs !== null &&
    healthCheckedMs !== null &&
    healthCheckedMs >= cfgUpdatedMs;
  const needsRetest = !isFreshTest;

  if (!input.implemented) {
    return { status: "not_implemented", reason: "Integração em desenvolvimento.", isFreshTest, needsRetest };
  }
  if (!input.hasRequiredCredentials) {
    return { status: "not_configured", reason: "Credenciais pendentes.", isFreshTest, needsRetest };
  }
  if (!input.active) {
    return { status: "inactive", reason: "Desativado.", isFreshTest, needsRetest };
  }

  // Active + creds present, but no fresh test → pending_test (even if there was an old OK).
  if (!isFreshTest) {
    const reason = healthCheckedMs
      ? "Teste pendente (credenciais alteradas)."
      : "Teste pendente.";
    return { status: "pending_test", reason, isFreshTest, needsRetest };
  }

  if (!input.healthOk) {
    return { status: "test_failed", reason: input.healthMessage || "Falha no teste de conexão.", isFreshTest, needsRetest };
  }

  return { status: "connected", reason: "Conectado.", isFreshTest, needsRetest };
}

