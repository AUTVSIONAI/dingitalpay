import { useMemo, useState } from "react";
import PageContent from "@/components/layout/PageContent";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usePageMeta } from "@/contexts/PageMetaContext";
import StatCard from "@/components/shared/StatCard";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import LoadingState from "@/components/shared/LoadingState";
import EmptyState from "@/components/shared/EmptyState";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Mail, Send, Users, MousePointerClick, Lock, ShoppingCart, BookOpen,
  UserCog, DollarSign, Trophy, ChevronRight, RotateCcw, Save, Copy, Wand2, Braces,
  Pencil, Trash2, Ban, Loader2, MoreHorizontal,
} from "lucide-react";
import {
  getEmailTemplates,
  getSmtpConfig,
  getSmtpLite,
  getSmtpStatus,
  updateEmailTemplate,
  sendTemplateTest,
  listEmailCampaignRows,
  createEmailCampaign,
  updateEmailCampaign,
  sendEmailCampaignNow,
  cancelEmailCampaign,
  deleteEmailCampaign,
  listEmailOutbox,
  listEmailLogs,
  requeueEmailOutbox,
  cancelEmailOutbox,
  type EmailCampaignRow,
  type EmailCampaignSegment,
} from "@/services/admin.service";
import type { EmailTemplate, EmailTemplateCategory } from "@/types/api";
import { useToast } from "@/hooks/use-toast";
import RichTextEditor from "@/components/shared/RichTextEditor";
import { Link } from "react-router-dom";
import { formatDateTimePtBr, fromDatetimeLocalValue, toDatetimeLocalValue } from "@/lib/timezone";

const CATEGORY_CONFIG: Record<EmailTemplateCategory, { label: string; icon: React.ReactNode }> = {
  auth: { label: "Autenticação", icon: <Lock className="h-5 w-5" /> },
  purchases: { label: "Compras", icon: <ShoppingCart className="h-5 w-5" /> },
  courses: { label: "Cursos / Área de Membros", icon: <BookOpen className="h-5 w-5" /> },
  profile: { label: "Perfil do Usuário", icon: <UserCog className="h-5 w-5" /> },
  seller: { label: "Vendedor", icon: <DollarSign className="h-5 w-5" /> },
  gamification: { label: "Gamificação", icon: <Trophy className="h-5 w-5" /> },
};

const CATEGORY_ORDER: EmailTemplateCategory[] = ["auth", "purchases", "courses", "profile", "seller", "gamification"];
const CATEGORY_INDEX = new Map(CATEGORY_ORDER.map((category, index) => [category, index] as const));

const extractTemplateVars = (text: string): string[] => {
  const src = String(text || "");
  const re = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) out.add(m[1]);
  return Array.from(out).sort((a, b) => a.localeCompare(b));
};

const getPlatformOrigin = (): string => {
  if (typeof window !== "undefined" && window.location?.origin) return window.location.origin;
  return "https://app.dingitalpay.com";
};

const buildExampleVars = (keys: string[]): Record<string, any> => {
  const platformOrigin = getPlatformOrigin();
  const defaults: Record<string, any> = {
    user_name: "Teste",
    seller_name: "Vendedor",
    platform_name: "DingitalPay",
    platform_url: platformOrigin,
    support_email: "suporte@dingitalpay.com",
    amount: "R$ 10,00",
    product_name: "Produto",
    course_name: "Curso",
    reward_name: "Conquista",
    reason: "Motivo",
    reset_link: `${platformOrigin}/auth/reset`,
    verify_link: `${platformOrigin}/auth/email-confirmation`,
  };
  const vars: Record<string, any> = {};
  for (const k of keys) vars[k] = defaults[k] ?? "";
  return vars;
};

const tryParseJson = (raw: string): { ok: true; value: any } | { ok: false; message: string } => {
  const text = String(raw || "");
  try {
    return { ok: true, value: JSON.parse(text || "{}") };
  } catch (e: any) {
    const msg = String(e?.message || "JSON inválido.");
    const posMatch = msg.match(/position\s+(\d+)/i);
    if (posMatch) {
      const pos = Number(posMatch[1]);
      if (Number.isFinite(pos) && pos >= 0) {
        const before = text.slice(0, pos);
        const line = before.split("\n").length;
        const col = before.length - before.lastIndexOf("\n");
        return { ok: false, message: `JSON inválido (linha ${line}, coluna ${col}).` };
      }
    }
    return { ok: false, message: "JSON inválido. Use o botão “Formatar JSON” para validar." };
  }
};

const outboxStatusLabel = (status: string) => {
  switch (status) {
    case "queued": return "Na fila";
    case "sending": return "Enviando";
    case "sent": return "Enviado";
    case "failed": return "Falhou";
    case "canceled": return "Cancelado";
    default: return status;
  }
};

const campaignStatusLabel = (status: string) => {
  switch (status) {
    case "draft": return "Rascunho";
    case "scheduled": return "Agendada";
    case "sending": return "Enviando";
    case "sent": return "Enviada";
    case "canceled": return "Cancelada";
    default: return status;
  }
};

const campaignStatusVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
  switch (status) {
    case "sending":
      return "default";
    case "sent":
      return "secondary";
    case "canceled":
      return "destructive";
    default:
      return "outline";
  }
};

const logLevelLabel = (level: string) => {
  switch (level) {
    case "info": return "Info";
    case "error": return "Erro";
    default: return level;
  }
};

const AdminEmailCampaigns = () => {
  const [editSheet, setEditSheet] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [testTo, setTestTo] = useState("");
  const [varsAdvancedOpen, setVarsAdvancedOpen] = useState(false);
  const [testVars, setTestVars] = useState<string>(JSON.stringify({ user_name: "Teste" }, null, 2));

  const [campaignSheet, setCampaignSheet] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<EmailCampaignRow | null>(null);
  const [campaignName, setCampaignName] = useState("");
  const [campaignSubject, setCampaignSubject] = useState("");
  const [campaignBody, setCampaignBody] = useState("");
  const [campaignSegment, setCampaignSegment] = useState<EmailCampaignSegment>("buyers");
  const [campaignScheduledAt, setCampaignScheduledAt] = useState<string>("");
  const [campaignToDelete, setCampaignToDelete] = useState<EmailCampaignRow | null>(null);

  const [outboxSheet, setOutboxSheet] = useState(false);
  const [selectedOutboxId, setSelectedOutboxId] = useState<string>("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  usePageMeta([{ label: "Admin", path: "/admin" }, { label: "E-mail Marketing" }], "E-mail Marketing");

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["email-templates"],
    queryFn: getEmailTemplates,
  });

  const { data: smtpLite } = useQuery({
    queryKey: ["smtp-lite"],
    queryFn: getSmtpLite,
  });
  const { data: smtpConfig, isLoading: smtpConfigLoading } = useQuery({
    queryKey: ["smtp-config"],
    queryFn: getSmtpConfig,
  });
  const { data: smtpStatus, isLoading: smtpStatusLoading } = useQuery({
    queryKey: ["smtp-status"],
    queryFn: getSmtpStatus,
  });
  const smtpReadyForTemplates = Boolean(
    smtpConfig?.enabled &&
      String(smtpConfig?.host || "").trim() &&
      String(smtpConfig?.port || "").trim() &&
      String(smtpConfig?.username || "").trim() &&
      String(smtpConfig?.fromEmail || "").trim() &&
      (String(smtpConfig?.password || "").trim() || (smtpStatus?.lastTest && smtpStatus.lastTest !== "-"))
  );
  const smtpTemplatesHydrated = !smtpConfigLoading && !smtpStatusLoading;

  const detectedVars = useMemo(() => extractTemplateVars(`${editSubject}\n${editBody}`), [editSubject, editBody]);
  const defaultVarsObject = useMemo(() => buildExampleVars(detectedVars), [detectedVars]);
  const parsedCustomVars = useMemo(() => tryParseJson(testVars), [testVars]);
  const isValidEmail = useMemo(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(testTo || "").trim()), [testTo]);
  const effectiveTemplates = useMemo(
    () =>
      templates
        .map((tpl) => ({ ...tpl, enabled: smtpReadyForTemplates ? tpl.enabled : false }))
        .sort((a, b) => {
          const categoryDiff = (CATEGORY_INDEX.get(a.category) ?? 99) - (CATEGORY_INDEX.get(b.category) ?? 99);
          if (categoryDiff !== 0) return categoryDiff;
          const eventKeyDiff = a.eventKey.localeCompare(b.eventKey, "pt-BR");
          if (eventKeyDiff !== 0) return eventKeyDiff;
          return a.id.localeCompare(b.id, "pt-BR");
        }),
    [templates, smtpReadyForTemplates]
  );

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => updateEmailTemplate(id, { enabled }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["email-templates"] });
      const tpl = effectiveTemplates.find((t) => t.id === variables.id);
      toast({
        title: variables.enabled ? "E-mail ativado" : "E-mail desativado",
        description: `"${tpl?.title}" foi ${variables.enabled ? "ativado" : "desativado"}.`,
      });
    },
    onError: () => {
      toast({ title: "Erro ao alterar status", variant: "destructive" });
    },
  });

  const saveMutation = useMutation({
    mutationFn: ({ id, subject, body }: { id: string; subject: string; body: string }) =>
      updateEmailTemplate(id, { subject, body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-templates"] });
      toast({ title: "Template salvo" });
      setEditSheet(false);
    },
    onError: () => {
      toast({ title: "Erro ao salvar template", variant: "destructive" });
    },
  });

  const sendTestMutation = useMutation({
    mutationFn: async () => {
      if (!editingTemplate) throw new Error("Selecione um template.");
      const to = String(testTo || "").trim();
      if (!isValidEmail) throw new Error("Informe um e-mail válido.");

      const vars = varsAdvancedOpen
        ? (parsedCustomVars.ok ? (parsedCustomVars.value || {}) : null)
        : defaultVarsObject;
      if (varsAdvancedOpen && !vars) throw new Error("JSON de variáveis inválido.");

      return sendTemplateTest({ eventKey: editingTemplate.eventKey, to, vars: vars || {} });
    },
    onSuccess: (data: any) => {
      const payload = data?.data ?? data;
      if (payload?.ok === true && payload?.queued === false) {
        toast({
          title: "Não enfileirado",
          description: payload?.reason === "smtp_disabled"
            ? "SMTP está desabilitado. Ative em /admin/smtp."
            : "Template desabilitado.",
          variant: "destructive",
        });
        return;
      }
      toast({ title: "Teste enfileirado", description: payload?.outbox_id ? `Job: ${payload.outbox_id}` : undefined });
      queryClient.invalidateQueries({ queryKey: ["email-outbox"] });
    },
    onError: (err: any) => toast({ title: "Falha ao enviar teste", description: err.message, variant: "destructive" }),
  });

  const { data: campaigns = [] } = useQuery({
    queryKey: ["email-campaign-rows"],
    queryFn: () => listEmailCampaignRows(50),
  });

  const saveCampaignMutation = useMutation({
    mutationFn: async () => {
      const scheduledAt = campaignScheduledAt ? fromDatetimeLocalValue(campaignScheduledAt) : undefined;
      if (editingCampaign) {
        return updateEmailCampaign({
          campaignId: editingCampaign.id,
          name: campaignName,
          subject: campaignSubject,
          body: campaignBody,
          segment: campaignSegment,
          scheduledAt: scheduledAt ?? null,
          status: scheduledAt ? "scheduled" : "draft",
        });
      }
      return createEmailCampaign({
        name: campaignName,
        subject: campaignSubject,
        body: campaignBody,
        segment: campaignSegment,
        scheduledAt,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-campaign-rows"] });
      toast({ title: "Campanha salva" });
      setCampaignSheet(false);
    },
    onError: (err: any) => toast({ title: "Erro ao salvar campanha", description: err.message, variant: "destructive" }),
  });

  const sendCampaignMutation = useMutation({
    mutationFn: (campaignId: string) => sendEmailCampaignNow(campaignId),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["email-campaign-rows"] });
      queryClient.invalidateQueries({ queryKey: ["email-outbox"] });
      toast({ title: "Campanha enfileirada", description: data?.queued ? `${data.queued} destinatários` : undefined });
    },
    onError: (err: any) => toast({ title: "Erro ao enviar campanha", description: err.message, variant: "destructive" }),
  });

  const cancelCampaignMutation = useMutation({
    mutationFn: (campaignId: string) => cancelEmailCampaign(campaignId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-campaign-rows"] });
      toast({ title: "Campanha cancelada" });
    },
    onError: (err: any) => toast({ title: "Erro ao cancelar", description: err.message, variant: "destructive" }),
  });

  const deleteCampaignMutation = useMutation({
    mutationFn: (campaignId: string) => deleteEmailCampaign(campaignId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-campaign-rows"] });
      queryClient.invalidateQueries({ queryKey: ["email-outbox"] });
      toast({ title: "Campanha excluida" });
      setCampaignToDelete(null);
    },
    onError: (err: any) => toast({ title: "Erro ao excluir", description: err.message, variant: "destructive" }),
  });

  const { data: outbox = [], isLoading: outboxLoading } = useQuery({
    queryKey: ["email-outbox"],
    queryFn: () => listEmailOutbox(80),
  });

  const { data: outboxLogs = [], isLoading: logsLoading } = useQuery({
    queryKey: ["email-logs", selectedOutboxId],
    queryFn: () => selectedOutboxId ? listEmailLogs(selectedOutboxId, 50) : Promise.resolve([]),
    enabled: !!selectedOutboxId,
  });

  const requeueMutation = useMutation({
    mutationFn: (id: string) => requeueEmailOutbox(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-outbox"] });
      toast({ title: "Reenfileirado" });
    },
    onError: (err: any) => toast({ title: "Erro ao reenfileirar", description: err.message, variant: "destructive" }),
  });

  const cancelOutboxMutation = useMutation({
    mutationFn: (id: string) => cancelEmailOutbox(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-outbox"] });
      toast({ title: "Cancelado" });
      setOutboxSheet(false);
    },
    onError: (err: any) => toast({ title: "Erro ao cancelar", description: err.message, variant: "destructive" }),
  });

  const handleOpenEdit = (template: EmailTemplate) => {
    setEditingTemplate(template);
    setEditSubject(template.subject);
    setEditBody(template.body);
    setTestTo("");
    setVarsAdvancedOpen(false);
    const vars = buildExampleVars(extractTemplateVars(`${template.subject}\n${template.body}`));
    setTestVars(JSON.stringify(vars, null, 2));
    setEditSheet(true);
  };

  const handleSave = () => {
    if (!editingTemplate) return;
    saveMutation.mutate({ id: editingTemplate.id, subject: editSubject, body: editBody });
  };

  const handleRestore = () => {
    if (!editingTemplate) return;
    setEditSubject(editingTemplate.defaultSubject);
    setEditBody(editingTemplate.defaultBody);
    toast({ title: "Restaurado", description: "O template foi restaurado ao padrão original." });
  };

  if (isLoading) return <LoadingState />;

  const activeCount = effectiveTemplates.filter((t) => t.enabled).length;
  const totalSent = effectiveTemplates.reduce((acc, t) => acc + t.sentCount, 0);

  // Calculate real averages
  const templatesWithData = effectiveTemplates.filter((t) => t.openRate !== "-" && t.sentCount > 0);
  const avgOpenRate = templatesWithData.length > 0
    ? (templatesWithData.reduce((acc, t) => acc + parseFloat(t.openRate), 0) / templatesWithData.length).toFixed(1) + "%"
    : "-";
  const avgClickRate = templatesWithData.length > 0
    ? (templatesWithData.reduce((acc, t) => acc + parseFloat(t.clickRate), 0) / templatesWithData.length).toFixed(1) + "%"
    : "-";

  const grouped = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    ...CATEGORY_CONFIG[cat],
    templates: effectiveTemplates.filter((t) => t.category === cat),
  })).filter((g) => g.templates.length > 0);

  const openCampaignSheet = (c?: EmailCampaignRow) => {
    setEditingCampaign(c || null);
    setCampaignName(c?.name || "");
    setCampaignSubject(c?.subject || "");
    setCampaignBody(c?.body || "");
    setCampaignSegment((c?.segment as any) || "buyers");
    setCampaignScheduledAt(c?.scheduled_at ? toDatetimeLocalValue(c.scheduled_at) : "");
    setCampaignSheet(true);
  };

  const openOutboxSheet = (id: string) => {
    setSelectedOutboxId(id);
    setOutboxSheet(true);
  };

  const selectedOutbox = selectedOutboxId ? outbox.find((o) => o.id === selectedOutboxId) : undefined;

  return (
    <PageContent>
      <ConfirmDialog
        open={!!campaignToDelete}
        onOpenChange={(open) => {
          if (!open) setCampaignToDelete(null);
        }}
        title="Excluir campanha"
        description={`A campanha "${campaignToDelete?.name || ""}" será removida. Envios em fila relacionados serão cancelados antes da exclusão.`}
        confirmLabel={deleteCampaignMutation.isPending ? "Excluindo..." : "Excluir campanha"}
        onConfirm={() => {
          if (!campaignToDelete || deleteCampaignMutation.isPending) return;
          deleteCampaignMutation.mutate(campaignToDelete.id);
        }}
        variant="destructive"
      />

      <Tabs defaultValue="templates" className="space-y-6">
        <TabsList>
          <TabsTrigger value="templates" className="gap-2"><Mail className="h-4 w-4" /> Templates</TabsTrigger>
          <TabsTrigger value="campaigns" className="gap-2"><Send className="h-4 w-4" /> Campanhas</TabsTrigger>
          <TabsTrigger value="outbox" className="gap-2"><Users className="h-4 w-4" /> Fila/Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="templates" className="space-y-6">
          {smtpTemplatesHydrated && !smtpReadyForTemplates ? (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-100">
              Os templates de e-mail ficam desativados enquanto o SMTP estiver desligado, incompleto ou sem teste válido.
            </div>
          ) : null}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="E-mails ativos" value={`${activeCount} / ${effectiveTemplates.length}`} icon={<Mail className="h-5 w-5" />} />
            <StatCard label="E-mails enviados" value={totalSent.toLocaleString("pt-BR")} icon={<Send className="h-5 w-5" />} />
            <StatCard label="Taxa de abertura média" value={avgOpenRate} icon={<Users className="h-5 w-5" />} />
            <StatCard label="Taxa de clique média" value={avgClickRate} icon={<MousePointerClick className="h-5 w-5" />} />
          </div>

          {grouped.length === 0 ? (
            <EmptyState icon={<Mail className="h-5 w-5" />} title="Nenhum template configurado" description="Adicione templates de e-mail para começar a automatizar suas comunicações." />
          ) : (
            <div className="space-y-6">
              {grouped.map((group) => (
                <div key={group.category} className="rounded-xl border border-border bg-card shadow-card">
                  <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      {group.icon}
                    </div>
                    <h2 className="text-base font-semibold text-card-foreground">{group.label}</h2>
                    <span className="text-xs text-muted-foreground ml-auto">
                      {group.templates.filter((t) => t.enabled).length} de {group.templates.length} ativos
                    </span>
                  </div>

                  <div className="divide-y divide-border">
                    {group.templates.map((tpl) => (
                      <div
                        key={tpl.id}
                        className="flex items-center gap-4 px-5 py-3.5 hover:bg-muted/50 transition-colors cursor-pointer group"
                        onClick={() => handleOpenEdit(tpl)}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{tpl.title}</p>
                          <p className="text-xs text-muted-foreground truncate">{tpl.description}</p>
                        </div>
                        {tpl.sentCount > 0 && (
                          <div className="hidden sm:flex items-center gap-4 text-xs text-muted-foreground shrink-0">
                            <span>{tpl.sentCount.toLocaleString("pt-BR")} envios</span>
                            <span>Abertura: {tpl.openRate}</span>
                            <span>Cliques: {tpl.clickRate}</span>
                          </div>
                        )}
                        <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                          <Switch
                            checked={tpl.enabled}
                            onCheckedChange={(checked) => {
                              if (checked && !smtpReadyForTemplates) {
                                toast({
                                  title: "Ativação bloqueada",
                                  description:
                                    "Para ativar templates de e-mail, o SMTP precisa estar ativo, configurado e com teste válido.",
                                  variant: "destructive",
                                });
                                return;
                              }
                              toggleMutation.mutate({ id: tpl.id, enabled: checked });
                            }}
                            disabled={toggleMutation.isPending || !smtpTemplatesHydrated}
                          />
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="campaigns" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Campanhas</h2>
              <p className="text-sm text-muted-foreground">Envio em lote (buyers/sellers). Use com cuidado para não cair em spam.</p>
            </div>
            <Button onClick={() => openCampaignSheet()}><Send className="h-4 w-4 mr-2" /> Nova campanha</Button>
          </div>

          {campaigns.length === 0 ? (
            <EmptyState icon={<Send className="h-5 w-5" />} title="Nenhuma campanha" description="Crie uma campanha para enviar e-mails em lote." />
          ) : (
            <div className="space-y-3">
              {campaigns.map((c) => (
                <div key={c.id} className="rounded-xl border border-border bg-card p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                  {(() => {
                    const status = c.display_status || c.status;
                    const sent = Number((c as any).sent_count ?? 0);
                    const queued = Number((c as any).queued_count ?? 0);
                    const sending = Number((c as any).sending_count ?? 0);
                    const failed = Number((c as any).failed_count ?? 0);
                    const canceled = Number((c as any).canceled_count ?? 0);
                    const base = sent > 0 ? sent : Number(c.recipients_count || 0);
                    const opens = Number((c as any).open_unique_count ?? c.open_count ?? 0);
                    const clicks = Number((c as any).click_unique_count ?? c.click_count ?? 0);
                    const openRate = base > 0 ? `${Math.round((opens / base) * 100)}%` : "-";
                    const clickRate = base > 0 ? `${Math.round((clicks / base) * 100)}%` : "-";
                    const statusDescription =
                      status === "scheduled" && c.scheduled_at
                        ? `Agendada para ${formatDateTimePtBr(c.scheduled_at)}`
                        : status === "canceled"
                          ? `Cancelada${c.canceled_at ? ` em ${formatDateTimePtBr(c.canceled_at)}` : ""}${canceled > 0 ? ` • ${canceled} cancelados` : ""}`
                          : status === "sent"
                            ? `Enviada${(c.sent_at || c.last_sent_at) ? ` em ${formatDateTimePtBr(c.sent_at || c.last_sent_at || "")}` : ""}${failed > 0 ? ` • ${failed} falhas` : ""}`
                            : status === "sending"
                              ? `Em envio • ${sent} enviados${queued + sending > 0 ? ` • ${queued + sending} na fila` : ""}${failed > 0 ? ` • ${failed} falhas` : ""}`
                              : "Pronta para envio";
                    const canSend = status === "draft" || status === "scheduled";
                    const canCancel = status === "scheduled" || status === "sending";
                    const canDelete = status !== "sending";
                    const canEdit = status !== "sending";
                    return (
                      <>
                        <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium truncate">{c.name}</p>
                      <Badge variant={campaignStatusVariant(status)}>{campaignStatusLabel(status)}</Badge>
                      <Badge variant="outline">{(c.segment || "buyers").toUpperCase()}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{c.subject}</p>
                    <p className="text-xs text-muted-foreground">
                      {base} envios • aberturas {opens} ({openRate}) • cliques {clicks} ({clickRate})
                    </p>
                    <p className="text-xs text-muted-foreground/80">
                      {statusDescription}
                    </p>
                  </div>
                  <div className="flex items-center">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-9 w-9">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openCampaignSheet(c)} disabled={!canEdit}>
                          <Pencil className="h-4 w-4 mr-2" /> Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => sendCampaignMutation.mutate(c.id)}
                          disabled={!canSend || sendCampaignMutation.isPending}
                        >
                          {sendCampaignMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                          Enviar
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => cancelCampaignMutation.mutate(c.id)}
                          disabled={!canCancel || cancelCampaignMutation.isPending}
                        >
                          {cancelCampaignMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Ban className="h-4 w-4 mr-2" />}
                          Cancelar
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive" onClick={() => setCampaignToDelete(c)} disabled={!canDelete}>
                          {deleteCampaignMutation.isPending && campaignToDelete?.id === c.id ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
                          Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                      </>
                    );
                  })()}
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="outbox" className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold">Fila/Logs</h2>
            <p className="text-sm text-muted-foreground">Acompanhe envios, falhas e reenfileire quando necessário.</p>
          </div>
          {outboxLoading ? (
            <LoadingState />
          ) : outbox.length === 0 ? (
            <EmptyState icon={<Mail className="h-5 w-5" />} title="Fila vazia" description="Nenhum e-mail enfileirado recentemente." />
          ) : (
            <div className="rounded-xl border border-border overflow-hidden">
              <div className="divide-y divide-border">
                {outbox.map((j) => (
                  <button
                    key={j.id}
                    className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors flex items-center gap-3"
                    onClick={() => openOutboxSheet(j.id)}
                  >
                    <Badge variant={j.status === "sent" ? "secondary" : j.status === "failed" ? "destructive" : "outline"}>{outboxStatusLabel(j.status)}</Badge>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{j.subject}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {j.toEmail} • {j.templateEventKey || "campaign"} • aberturas {j.openHumanCount}/{j.openCount} • cliques {j.clickHumanCount}/{j.clickCount} • tentativas {j.attempts}/{j.maxAttempts}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Edit Sheet */}
      <Sheet open={editSheet} onOpenChange={setEditSheet}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          {editingTemplate && (
            <>
              <SheetHeader>
                <SheetTitle>{editingTemplate.title}</SheetTitle>
                <SheetDescription>{editingTemplate.description}</SheetDescription>
              </SheetHeader>
              <div className="py-6 space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="tpl-subject">Assunto do e-mail</Label>
                  <Input id="tpl-subject" value={editSubject} onChange={(e) => setEditSubject(e.target.value)} placeholder="Assunto do e-mail" />
                  <p className="text-xs text-muted-foreground">Use variáveis como {"{{user_name}}"}, {"{{platform_name}}"}, etc.</p>
                </div>

                <div className="space-y-2">
                  <Label>Corpo do e-mail</Label>
                  <RichTextEditor value={editBody} onChange={setEditBody} placeholder="Conteúdo do e-mail..." minHeight="250px" />
                </div>

                <Separator />

                {editingTemplate.sentCount > 0 && (
                  <>
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Métricas</p>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="rounded-lg border border-border p-3 text-center">
                          <p className="text-lg font-bold text-foreground">{editingTemplate.sentCount.toLocaleString("pt-BR")}</p>
                          <p className="text-xs text-muted-foreground">Envios</p>
                        </div>
                        <div className="rounded-lg border border-border p-3 text-center">
                          <p className="text-lg font-bold text-foreground">{editingTemplate.openRate}</p>
                          <p className="text-xs text-muted-foreground">Abertura</p>
                        </div>
                        <div className="rounded-lg border border-border p-3 text-center">
                          <p className="text-lg font-bold text-foreground">{editingTemplate.clickRate}</p>
                          <p className="text-xs text-muted-foreground">Cliques</p>
                        </div>
                      </div>
                    </div>
                    <Separator />
                  </>
                )}

                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={handleRestore}>
                    <RotateCcw className="h-4 w-4 mr-1" /> Restaurar padrão
                  </Button>
                  <Button size="sm" className="flex-1" onClick={handleSave} disabled={saveMutation.isPending}>
                    <Save className="h-4 w-4 mr-1" /> {saveMutation.isPending ? "Salvando..." : "Salvar"}
                  </Button>
                </div>

                <Separator />

                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Teste do template</p>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-foreground">Passo 1</p>
                      <div className="flex items-center gap-2">
                        <Badge variant={smtpLite?.enabled && smtpLite?.host && smtpLite?.fromEmail ? "secondary" : "destructive"}>
                          SMTP {smtpLite?.enabled && smtpLite?.host && smtpLite?.fromEmail ? "ativo" : "desligado"}
                        </Badge>
                        <Button asChild variant="outline" size="sm">
                          <Link to="/admin/smtp">Abrir SMTP</Link>
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="test-to">Enviar teste para</Label>
                      <Input
                        id="test-to"
                        type="email"
                        value={testTo}
                        onChange={(e) => setTestTo(e.target.value)}
                        placeholder="email@dominio.com"
                      />
                      {!isValidEmail && testTo.trim().length > 0 && (
                        <p className="text-xs text-destructive">Informe um e-mail válido.</p>
                      )}
                    </div>

                    <Separator />

                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-foreground">Passo 2</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Braces className="h-3.5 w-3.5" />
                        Variáveis detectadas: {detectedVars.length}
                      </div>
                    </div>

                    {detectedVars.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {detectedVars.slice(0, 10).map((k) => (
                          <Badge key={k} variant="outline" className="font-mono text-[11px]">{k}</Badge>
                        ))}
                        {detectedVars.length > 10 && (
                          <Badge variant="outline" className="text-[11px]">+{detectedVars.length - 10}</Badge>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">Nenhuma variável {"{{...}}"} detectada neste template.</p>
                    )}

                    <Collapsible open={varsAdvancedOpen} onOpenChange={setVarsAdvancedOpen}>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs text-muted-foreground">
                          {varsAdvancedOpen ? "Modo avançado: editar JSON manualmente" : "Usando variáveis padrão (recomendado)"}
                        </p>
                        <CollapsibleTrigger asChild>
                          <Button variant="outline" size="sm">
                            <Wand2 className="h-4 w-4 mr-2" />
                            {varsAdvancedOpen ? "Fechar avançado" : "Editar variáveis (JSON)"}
                          </Button>
                        </CollapsibleTrigger>
                      </div>

                      <CollapsibleContent className="mt-3 space-y-2">
                        <Label htmlFor="test-vars">Variáveis (JSON)</Label>
                        <Textarea
                          id="test-vars"
                          value={testVars}
                          onChange={(e) => setTestVars(e.target.value)}
                          className={`min-h-40 font-mono text-xs ${parsedCustomVars.ok ? "" : "border-destructive focus-visible:ring-destructive"}`}
                          placeholder={JSON.stringify(defaultVarsObject, null, 2)}
                        />
                        {!parsedCustomVars.ok && (
                          <p className="text-xs text-destructive">{parsedCustomVars.message}</p>
                        )}
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              if (!parsedCustomVars.ok) return;
                              setTestVars(JSON.stringify(parsedCustomVars.value, null, 2));
                              toast({ title: "JSON formatado" });
                            }}
                            disabled={!parsedCustomVars.ok}
                          >
                            <Braces className="h-4 w-4 mr-2" /> Formatar JSON
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setTestVars(JSON.stringify(defaultVarsObject, null, 2));
                              toast({ title: "Exemplo restaurado" });
                            }}
                          >
                            <RotateCcw className="h-4 w-4 mr-2" /> Resetar exemplo
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(testVars);
                                toast({ title: "Copiado" });
                              } catch {
                                toast({ title: "Falha ao copiar", variant: "destructive" });
                              }
                            }}
                          >
                            <Copy className="h-4 w-4 mr-2" /> Copiar JSON
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Dica: cliques só contam em links absolutos (<span className="font-mono">https://...</span>).
                        </p>
                      </CollapsibleContent>
                    </Collapsible>

                    <Button
                      onClick={() => sendTestMutation.mutate()}
                      disabled={sendTestMutation.isPending || !isValidEmail || (varsAdvancedOpen && !parsedCustomVars.ok)}
                      className="w-full"
                    >
                      <Send className="h-4 w-4 mr-2" /> {sendTestMutation.isPending ? "Enviando..." : "Enviar teste"}
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      O envio real depende de SMTP ativo e do worker rodando. Se não chegar, confira Fila/Logs.
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Campaign Sheet */}
      <Sheet open={campaignSheet} onOpenChange={setCampaignSheet}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editingCampaign ? "Editar campanha" : "Nova campanha"}</SheetTitle>
            <SheetDescription>Campanhas enviam e-mails em lote para um segmento.</SheetDescription>
          </SheetHeader>
          <div className="py-6 space-y-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={campaignName} onChange={(e) => setCampaignName(e.target.value)} placeholder="Nome da campanha" />
            </div>
            <div className="space-y-2">
              <Label>Segmento</Label>
              <Select value={campaignSegment} onValueChange={(v) => setCampaignSegment(v as EmailCampaignSegment)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="buyers">Compradores</SelectItem>
                  <SelectItem value="sellers">Vendedores</SelectItem>
                  <SelectItem value="all">Todos</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Agendar (opcional)</Label>
              <Input type="datetime-local" value={campaignScheduledAt} onChange={(e) => setCampaignScheduledAt(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Assunto</Label>
              <Input value={campaignSubject} onChange={(e) => setCampaignSubject(e.target.value)} placeholder="Assunto do e-mail" />
            </div>
            <div className="space-y-2">
              <Label>Corpo (HTML)</Label>
              <RichTextEditor value={campaignBody} onChange={setCampaignBody} placeholder="Conteúdo da campanha..." minHeight="260px" />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setCampaignSheet(false)}>Fechar</Button>
              <Button className="flex-1" onClick={() => saveCampaignMutation.mutate()} disabled={saveCampaignMutation.isPending || !campaignName || !campaignSubject || !campaignBody}>
                <Save className="h-4 w-4 mr-2" /> {saveCampaignMutation.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Outbox Sheet */}
      <Sheet open={outboxSheet} onOpenChange={setOutboxSheet}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Detalhes do envio</SheetTitle>
            <SheetDescription>Logs e ações do job de e-mail.</SheetDescription>
          </SheetHeader>
          <div className="py-6 space-y-4">
            {selectedOutboxId ? (
              <>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => requeueMutation.mutate(selectedOutboxId)} disabled={requeueMutation.isPending}>
                    Reenfileirar
                  </Button>
                  <Button variant="destructive" className="flex-1" onClick={() => cancelOutboxMutation.mutate(selectedOutboxId)} disabled={cancelOutboxMutation.isPending}>
                    Cancelar
                  </Button>
                </div>
                <Separator />
                {selectedOutbox && (
                  <>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="rounded-lg border border-border p-3 text-center">
                        <p className="text-lg font-bold text-foreground">{selectedOutbox.openHumanCount}</p>
                        <p className="text-xs text-muted-foreground">Aberturas (humanas)</p>
                        <p className="text-[11px] text-muted-foreground mt-1">Rastreamento: {selectedOutbox.openCount}</p>
                      </div>
                      <div className="rounded-lg border border-border p-3 text-center">
                        <p className="text-lg font-bold text-foreground">{selectedOutbox.clickHumanCount}</p>
                        <p className="text-xs text-muted-foreground">Cliques (humanos)</p>
                        <p className="text-[11px] text-muted-foreground mt-1">Rastreamento: {selectedOutbox.clickCount}</p>
                      </div>
                      <div className="rounded-lg border border-border p-3 text-center">
                        <p className="text-lg font-bold text-foreground">{outboxStatusLabel(selectedOutbox.status)}</p>
                        <p className="text-xs text-muted-foreground">Status</p>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Observação: alguns provedores (Gmail/Outlook/iCloud) podem pré-carregar imagens e links por segurança, o que pode aumentar o “rastreamento”.
                    </p>
                    <Separator />
                  </>
                )}
                {logsLoading ? (
                  <LoadingState />
                ) : outboxLogs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sem logs.</p>
                ) : (
                  <div className="space-y-2">
                    {outboxLogs.map((l) => (
                      <div key={l.id} className="rounded-lg border border-border p-3">
                        <div className="flex items-center justify-between">
                          <Badge variant={l.level === "error" ? "destructive" : "secondary"}>{logLevelLabel(l.level)}</Badge>
                          <span className="text-xs text-muted-foreground">{formatDateTimePtBr(l.createdAt)}</span>
                        </div>
                        <p className="text-sm mt-2">{l.message}</p>
                        {l.meta && Object.keys(l.meta).length > 0 && (
                          <pre className="mt-2 text-xs bg-muted p-2 rounded overflow-auto">{JSON.stringify(l.meta, null, 2)}</pre>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
    </PageContent>
  );
};

export default AdminEmailCampaigns;
