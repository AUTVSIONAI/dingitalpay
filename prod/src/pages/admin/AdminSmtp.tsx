import { useState } from "react";
import PageContent from "@/components/layout/PageContent";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usePageMeta } from "@/contexts/PageMetaContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Mail, ShieldCheck, Send, RefreshCw, Loader2 } from "lucide-react";
import CopyToClipboardField from "@/components/shared/CopyToClipboardField";
import LoadingState from "@/components/shared/LoadingState";
import {
  getDnsRecords,
  getPlatformSettings,
  getSmtpConfig,
  getSmtpStatus,
  updateSmtpConfig,
} from "@/services/admin.service";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { SmtpConfig } from "@/types/api";

const AdminSmtp = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { refreshProfile } = useAuth();
  const [testEmail, setTestEmail] = useState("");

  usePageMeta([{ label: "Admin", path: "/admin" }, { label: "SMTP" }], "Configurações de SMTP");

  const { data: smtpConfig, isLoading: loadingConfig } = useQuery({ queryKey: ["smtp-config"], queryFn: getSmtpConfig });
  const { data: smtpStatus } = useQuery({ queryKey: ["smtp-status"], queryFn: getSmtpStatus });
  const { data: dnsRecords = [] } = useQuery({ queryKey: ["smtp-dns"], queryFn: getDnsRecords });
  const { data: platformSettings } = useQuery({ queryKey: ["platform-settings"], queryFn: getPlatformSettings });

  const [localConfig, setLocalConfig] = useState<SmtpConfig | null>(null);
  const config = localConfig ?? smtpConfig;
  const emailVerificationRequired = Boolean(platformSettings?.emailVerification);
  const canSupportEmailVerification = (candidate: SmtpConfig) =>
    Boolean(
      candidate.enabled &&
        String(candidate.host || "").trim() &&
        String(candidate.port || "").trim() &&
        String(candidate.username || "").trim() &&
        String(candidate.fromEmail || "").trim() &&
        (String(candidate.password || "").trim() || (smtpStatus?.lastTest && smtpStatus.lastTest !== "-"))
    );

  const updateField = (field: keyof SmtpConfig, value: string | boolean) => {
    if (!config) return;
    if (
      field === "enabled" &&
      value === false &&
      emailVerificationRequired
    ) {
      toast({
        title: "Desativação bloqueada",
        description:
          "Não é possível desativar o SMTP enquanto a verificação obrigatória de e-mail estiver ativa.",
        variant: "destructive",
      });
      return;
    }
    setLocalConfig({ ...config, [field]: value });
  };

  const saveMutation = useMutation({
    mutationFn: async (c: SmtpConfig) => {
      if (emailVerificationRequired && !canSupportEmailVerification(c)) {
        throw new Error(
          "Não é possível salvar um SMTP desativado ou incompleto enquanto a verificação obrigatória de e-mail estiver ativa."
        );
      }
      return updateSmtpConfig(c);
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["smtp-config"] });
      queryClient.invalidateQueries({ queryKey: ["smtp-status"] });
      queryClient.invalidateQueries({ queryKey: ["smtp-lite"] });
      queryClient.invalidateQueries({ queryKey: ["email-templates"] });
      setLocalConfig(null);
      await refreshProfile();
      toast({ title: "Configurações salvas" });
    },
    onError: (err: any) =>
      toast({
        title: "Erro ao salvar",
        description: err?.message || "Não foi possível salvar as configurações de SMTP.",
        variant: "destructive",
      }),
  });

  const testConnectionMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("send-test-email", {
        body: { action: "test-connection" },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Falha na conexão");
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["smtp-status"] });
      toast({ title: "Conexão bem-sucedida!", description: data.message });
    },
    onError: (err: Error) => toast({ title: "Falha na conexão", description: err.message, variant: "destructive" }),
  });

  const sendTestMutation = useMutation({
    mutationFn: async (to: string) => {
      const { data, error } = await supabase.functions.invoke("send-test-email", {
        body: { action: "send-test", to },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Falha no envio");
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["smtp-status"] });
      toast({ title: "E-mail enviado!", description: data.message });
      setTestEmail("");
    },
    onError: (err: Error) => toast({ title: "Falha no envio", description: err.message, variant: "destructive" }),
  });

  if (loadingConfig || !config) return <LoadingState />;

  return (
    <PageContent>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Servidor SMTP</CardTitle>
                  <CardDescription>Configure o servidor de envio de e-mails da plataforma</CardDescription>
                </div>
                <Badge variant={config.enabled ? "default" : "secondary"} className="gap-1">
                  <ShieldCheck className="h-3 w-3" />
                  {config.enabled ? "Ativo" : "Inativo"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {emailVerificationRequired ? (
                <Alert>
                  <AlertTitle>Verificação de e-mail ativa</AlertTitle>
                  <AlertDescription>
                    Enquanto essa política estiver ativa, o SMTP não pode ser salvo como desligado ou incompleto.
                  </AlertDescription>
                </Alert>
              ) : null}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="host">Host SMTP</Label>
                  <Input id="host" value={config.host} onChange={(e) => updateField("host", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="port">Porta</Label>
                  <Input id="port" value={config.port} onChange={(e) => updateField("port", e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="username">Usuário</Label>
                  <Input id="username" value={config.username} onChange={(e) => updateField("username", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Senha</Label>
                  <PasswordInput id="password" value={config.password} onChange={(e) => updateField("password", e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Criptografia</Label>
                  <Select value="ssl_tls" disabled>
                    <SelectTrigger><SelectValue placeholder="SSL/TLS (automático)" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ssl_tls">SSL/TLS (automático)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    A criptografia é detectada automaticamente pela porta: 465 (SSL) ou 587 (STARTTLS/TLS).
                  </p>
                </div>
                <div className="flex items-end gap-3 pb-1">
                  <div className="flex items-center gap-2">
                    <Switch checked={config.enabled} onCheckedChange={(v) => updateField("enabled", v)} />
                    <Label>SMTP Ativo</Label>
                  </div>
                </div>
              </div>
              <div className="border-t border-border pt-4 mt-2">
                <p className="text-sm font-medium text-foreground mb-3">Remetente padrão</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="fromName">Nome do Remetente</Label>
                    <Input id="fromName" value={config.fromName} onChange={(e) => updateField("fromName", e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="fromEmail">E-mail do Remetente</Label>
                    <Input id="fromEmail" type="email" value={config.fromEmail} onChange={(e) => updateField("fromEmail", e.target.value)} />
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => testConnectionMutation.mutate()} disabled={testConnectionMutation.isPending}>
                  {testConnectionMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
                  {testConnectionMutation.isPending ? "Testando..." : "Testar Conexão"}
                </Button>
                <Button size="sm" onClick={() => saveMutation.mutate(config)} disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? "Salvando..." : "Salvar Configurações"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Enviar E-mail de Teste</CardTitle>
              <CardDescription>Envie um e-mail de teste para verificar se a configuração está funcionando</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-3">
                <Input placeholder="seuemail@exemplo.com" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} className="flex-1" />
                <Button size="sm" onClick={() => testEmail && sendTestMutation.mutate(testEmail)} disabled={sendTestMutation.isPending || !testEmail}>
                  {sendTestMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
                  {sendTestMutation.isPending ? "Enviando..." : "Enviar Teste"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Mail className="h-4 w-4" /> Status do Serviço</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">E-mails enviados (hoje)</span><span className="font-medium text-foreground">{smtpStatus?.emailsSentToday ?? "0"}</span></div>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Taxa de entrega</span><span className="font-medium text-foreground">{smtpStatus?.deliveryRate ?? "-"}</span></div>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Bounces</span><span className="font-medium text-destructive">{smtpStatus?.bounces ?? "0"}</span></div>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Último teste</span><span className="font-medium text-foreground">{smtpStatus?.lastTest ?? "-"}</span></div>
            </CardContent>
          </Card>

          {dnsRecords.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">DNS & Autenticação</CardTitle>
                <CardDescription>Registros necessários para autenticação</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {dnsRecords.map((record) => (
                  <div key={record.type}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-muted-foreground">{record.type}</span>
                      <Badge variant="outline" className={`text-[10px] ${record.status === "valid" ? "text-emerald-600 border-emerald-500/20" : "text-yellow-600 border-yellow-500/20"}`}>
                        {record.status === "valid" ? "Válido" : "Pendente"}
                      </Badge>
                    </div>
                    <CopyToClipboardField value={record.value} />
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </PageContent>
  );
};

export default AdminSmtp;
