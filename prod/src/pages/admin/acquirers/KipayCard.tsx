import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { Badge } from "@/components/ui/badge";
import { QrCode, Settings, Save, CheckCircle, AlertCircle, Loader2, Wifi } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { unwrapAcquirerConfigPayload } from "./unwrapAcquirerConfigPayload";
import type { AcquirerStatus, BackendAcquirerStatus } from "./types";

const methods = [
  { name: "PIX", icon: <QrCode className="h-5 w-5 text-primary" /> },
];

const DEFAULT_API_URL = "https://api.kipaybr.com";

function getJwtExpMs(token: string): number | null {
  try {
    const parts = String(token || "").split(".");
    if (parts.length < 2) return null;
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "===".slice((b64.length + 3) % 4);
    const json = atob(padded);
    const payload = JSON.parse(json);
    const expSec = Number(payload?.exp || 0);
    return expSec ? expSec * 1000 : null;
  } catch {
    return null;
  }
}

function deriveStatus(active: boolean, hasCredentials: boolean): AcquirerStatus {
  if (hasCredentials && active) return "connected";
  if (hasCredentials) return "inactive";
  return "not_configured";
}

function StatusBadge({ status }: { status: AcquirerStatus }) {
  if (status === "connected") {
    return (
      <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 gap-1.5 text-xs font-medium">
        <CheckCircle className="h-3 w-3" />
        Conectado
      </Badge>
    );
  }
  if (status === "inactive") {
    return (
      <Badge variant="outline" className="border-yellow-500/30 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 gap-1.5 text-xs font-medium">
        <AlertCircle className="h-3 w-3" />
        Inativo
      </Badge>
    );
  }
  if (status === "test_failed") {
    return (
      <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-destructive gap-1.5 text-xs font-medium">
        <AlertCircle className="h-3 w-3" />
        Falha no teste
      </Badge>
    );
  }
  if (status === "pending_test") {
    return (
      <Badge variant="outline" className="border-yellow-500/30 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 gap-1.5 text-xs font-medium">
        <AlertCircle className="h-3 w-3" />
        Teste pendente
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-muted-foreground/30 bg-muted/50 text-muted-foreground text-xs font-medium">
      Pendente
    </Badge>
  );
}

interface KipayCardProps {
  backendStatus?: BackendAcquirerStatus;
  onOverviewChange?: () => Promise<void> | void;
}

function getMethodStatusText(status: BackendAcquirerStatus["status"] | AcquirerStatus) {
  if (status === "connected") return "Ativo";
  if (status === "inactive") return "Inativo";
  if (status === "pending_test") return "Teste pendente";
  if (status === "test_failed") return "Falha no teste";
  return "Disponível mediante configuração";
}

const KipayCard = ({ backendStatus, onOverviewChange }: KipayCardProps) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [webhookTesting, setWebhookTesting] = useState(false);
  const [active, setActive] = useState(!!backendStatus?.active);
  const [hasCredentials, setHasCredentials] = useState(!!backendStatus?.configured);
  const [awaitingTest, setAwaitingTest] = useState(false);
  const [statusOverride, setStatusOverride] = useState<BackendAcquirerStatus["status"] | AcquirerStatus | null>(null);

  const [apiUrl, setApiUrl] = useState(DEFAULT_API_URL);
  const [apiSecret, setApiSecret] = useState("");
  const [webhookToken, setWebhookToken] = useState("");

  const localStatus = deriveStatus(active, hasCredentials);
  const status = (statusOverride ?? (awaitingTest ? "pending_test" : backendStatus?.status ?? localStatus)) as any;

  useEffect(() => {
    if (!backendStatus) return;
    if (backendStatus.status !== "pending_test") setAwaitingTest(false);
    setActive(!!backendStatus.active);
    setHasCredentials(!!backendStatus.configured);
    setStatusOverride(null);
  }, [backendStatus]);

  const getValidAccessToken = async (): Promise<string | null> => {
    const { data } = await supabase.auth.getSession();
    const session = data.session;
    if (!session?.access_token) return null;

    const expMs = getJwtExpMs(session.access_token);
    const needsRefresh = expMs ? expMs <= Date.now() + 60_000 : false;
    if (!needsRefresh) return session.access_token;

    await supabase.auth.refreshSession().catch(() => null);
    const refreshed = await supabase.auth.getSession();
    return refreshed.data.session?.access_token || null;
  };

  const loadConfig = async ({ showToast }: { showToast: boolean }) => {
    setLoading(true);
    const accessToken = await getValidAccessToken();
    if (!accessToken) {
      setLoading(false);
      return;
    }
    supabase.functions.setAuth(accessToken);
    const invoke = async () =>
      supabase.functions.invoke("admin-acquirer-config", {
        body: { action: "get", acquirer_name: "KIPAY" },
      });

    let { data: resp, error, response } = await invoke();
    const respStatus = (response as any)?.status;
    if (error && respStatus === 401) {
      const newToken = await getValidAccessToken();
      if (newToken && newToken !== accessToken) {
        supabase.functions.setAuth(newToken);
        ({ data: resp, error, response } = await supabase.functions.invoke("admin-acquirer-config", {
          body: { action: "get", acquirer_name: "KIPAY" },
        }));
      }
    }

    if (error) {
      console.error("KipayCard loadConfig error:", error);
      const respStatus = (response as any)?.status;
      if (showToast) {
        if (respStatus === 401) toast.error("Sessão expirada. Faça login novamente.");
        else if (respStatus === 403) toast.error("Seu usuário não é admin. Entre em /admin/login com um usuário admin.");
        else toast.error("Erro ao buscar credenciais. Tente novamente.");
      }
    } else if (resp) {
      const payload = unwrapAcquirerConfigPayload(resp);
      const creds = (payload?.credentials || {}) as Record<string, string>;
      const secret = creds?.api_secret || "";
      const wt = creds?.webhook_token || "";
      setApiUrl(creds?.api_url || DEFAULT_API_URL);
      setApiSecret(secret);
      setWebhookToken(wt);
      setActive(!!payload?.active);
      setHasCredentials(!!(secret.trim() || wt.trim()));
    }
    setLoading(false);
  };

  const handleSave = async () => {
    if (!apiSecret.trim() || !webhookToken.trim()) {
      toast.error("Preencha os campos obrigatórios.");
      return;
    }

    setSaving(true);
    const credentials = {
      api_url: (apiUrl || DEFAULT_API_URL).trim(),
      api_secret: apiSecret.trim(),
      webhook_token: webhookToken.trim(),
    };

    const sessionToken = await getValidAccessToken();
    if (!sessionToken) {
      toast.error("Sua sessão expirou. Faça login novamente.");
      setSaving(false);
      return;
    }
    supabase.functions.setAuth(sessionToken);

    const invoke = async (token: string) =>
      supabase.functions.invoke("admin-acquirer-config", {
        body: { action: "upsert", acquirer_name: "KIPAY", credentials, active: true },
      });

    let { data: resp, error, response } = await invoke(sessionToken);
    const respStatus = (response as any)?.status;
    if (error && respStatus === 401) {
      const newToken = await getValidAccessToken();
      if (newToken && newToken !== sessionToken) {
        supabase.functions.setAuth(newToken);
        ({ data: resp, error, response } = await invoke(newToken));
      }
    }

    if (error) {
      console.error("KipayCard handleSave error:", error);
      const respStatus = (response as any)?.status;
      if (respStatus === 401) toast.error("Sessão expirada. Faça login novamente.");
      else if (respStatus === 403) toast.error("Seu usuário não é admin. Entre em /admin/login com um usuário admin.");
      else toast.error("Erro ao salvar configuração.");
    } else {
      toast.success("Kipay configurada com sucesso!");
      const payload = unwrapAcquirerConfigPayload(resp);
      setActive(!!payload?.active);
      setHasCredentials(true);
      setAwaitingTest(true);
      setStatusOverride("pending_test");
      await onOverviewChange?.();
    }
    setSaving(false);
  };

  const handleTest = async () => {
    setTesting(true);
    const authToken = await getValidAccessToken();
    if (!authToken) {
      toast.error("Sessão expirada. Faça login novamente.");
      setTesting(false);
      return;
    }
    supabase.functions.setAuth(authToken);

    const invoke = async () =>
      supabase.functions.invoke("test-acquirer-connection", {
        body: { acquirer_name: "KIPAY" },
      });

    let { data: resp, error, response } = await invoke();
    const respStatus = (response as any)?.status;

    // Retry on 401 with refreshed token
    if (error && respStatus === 401) {
      const newToken = await getValidAccessToken();
      if (newToken && newToken !== authToken) {
        supabase.functions.setAuth(newToken);
        ({ data: resp, error, response } = await invoke());
      }
    }

    if (error) {
      console.error("KipayCard handleTest error:", error);
      const status = (response as any)?.status;
      if (status === 401) toast.error("Sessão expirada. Faça login novamente.");
      else if (status === 403) toast.error("Seu usuário não é admin.");
      else toast.error("Erro ao testar conexão. Verifique os logs.");
    } else if (resp?.ok) {
      toast.success(resp.message || "Conexão OK!");
      setAwaitingTest(false);
      setStatusOverride("connected");
      await onOverviewChange?.();
    } else {
      toast.error(resp?.message || "Falha na conexão.");
      setStatusOverride("test_failed");
      await onOverviewChange?.();
    }
    setTesting(false);
  };

  const handleWebhookTest = async () => {
    setWebhookTesting(true);
    const authToken = await getValidAccessToken();
    if (!authToken) {
      toast.error("Sessão expirada. Faça login novamente.");
      setWebhookTesting(false);
      return;
    }
    supabase.functions.setAuth(authToken);
    const { data: resp, error } = await supabase.functions.invoke("test-kipay-webhook", { body: {} });
    if (error) {
      toast.error("Erro ao testar webhook.");
    } else if ((resp as any)?.ok) {
      toast.success((resp as any)?.message || "Webhook OK!");
      await onOverviewChange?.();
    } else {
      toast.error((resp as any)?.message || "Falha no webhook.");
    }
    setWebhookTesting(false);
  };

  return (
    <Card className="p-5 flex flex-col gap-4 h-full">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-card-foreground">KIPAY</h3>
          <p className="text-xs text-muted-foreground mt-1">
            {backendStatus?.reason
              ? backendStatus.reason
              : status === "connected"
                ? "Integração ativa"
                : status === "inactive"
                  ? "Credenciais salvas, mas inativo"
                  : "Configure suas credenciais para ativar"}
          </p>
        </div>
        <StatusBadge status={status} />
      </div>

      <div className="space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Métodos de pagamento
        </p>
        <div className="space-y-1.5">
          {methods.map((m) => (
            <div key={m.name} className="flex items-center gap-3 rounded-lg border border-border bg-muted/50 px-3 py-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">{m.icon}</div>
              <div>
                <p className="text-sm font-medium text-card-foreground">{m.name}</p>
                <p className="text-[11px] text-muted-foreground">{getMethodStatusText(status)}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {open && (
        <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
          <div className="space-y-1.5">
            <Label htmlFor="kipay-api-url" className="text-xs">API URL</Label>
            <Input
              id="kipay-api-url"
              type="text"
              placeholder={DEFAULT_API_URL}
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="kipay-api-secret" className="text-xs">API Secret</Label>
            <PasswordInput
              id="kipay-api-secret"
              placeholder="kp_... / chave secreta"
              value={apiSecret}
              onChange={(e) => setApiSecret(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="kipay-webhook-token" className="text-xs">Webhook Token</Label>
            <PasswordInput
              id="kipay-webhook-token"
              placeholder="token usado na URL do webhook"
              value={webhookToken}
              onChange={(e) => setWebhookToken(e.target.value)}
            />
          </div>

          <Button className="w-full" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            Salvar credenciais
          </Button>
          <Button variant="outline" className="w-full" onClick={handleTest} disabled={testing}>
            {testing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Wifi className="h-4 w-4 mr-2" />}
            Testar conexão
          </Button>
          <Button variant="outline" className="w-full" onClick={handleWebhookTest} disabled={webhookTesting}>
            {webhookTesting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Wifi className="h-4 w-4 mr-2" />}
            Testar webhook
          </Button>
        </div>
      )}

      <Button
        variant={open ? "ghost" : "outline"}
        className="mt-auto w-full"
        onClick={async () => {
          if (!open) await loadConfig({ showToast: true });
          setOpen((v) => !v);
        }}
        disabled={loading}
      >
        <Settings className="h-4 w-4 mr-2" />
        {open ? "Fechar" : "Configurar"}
      </Button>
    </Card>
  );
};

export default KipayCard;
