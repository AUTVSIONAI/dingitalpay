import { useState, useEffect, useCallback } from "react";
import { usePageMeta } from "@/contexts/PageMetaContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import StatusBadge from "@/components/shared/StatusBadge";
import CopyToClipboardField from "@/components/shared/CopyToClipboardField";

import {
  Plus, FileCode, BookOpen, Trash2, Pencil, Send, CheckCircle2, XCircle,
  Activity, Shield, ArrowLeft, Copy, RefreshCw, Loader2,
} from "lucide-react";
import {
  fetchWebhookEndpoints, createWebhookEndpoint, updateWebhookEndpoint,
  deleteWebhookEndpoint, fetchWebhookLogs, testWebhookEndpoint,
  type DbWebhookEndpoint, type DbWebhookLog,
} from "@/services/integration.service";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import PageContent from "@/components/layout/PageContent";
import { formatDateTimePtBr } from "@/lib/timezone";

// ─── Webhook Events ───
const WEBHOOK_EVENTS = [
  { key: "transaction.authorized", label: "Transação Autorizada", desc: "Quando uma transação é aprovada" },
  { key: "transaction.pending", label: "Transação Pendente", desc: "Quando uma transação está aguardando pagamento" },
  { key: "transaction.refunded", label: "Transação Reembolsada", desc: "Quando uma transação é reembolsada" },
  { key: "transaction.chargeback", label: "Chargeback", desc: "Quando um chargeback é aberto" },
  { key: "transaction.expired", label: "Transação Expirada", desc: "Quando uma transação expira" },
  { key: "transaction.canceled", label: "Transação Cancelada", desc: "Quando uma transação é cancelada" },
];

// ─── Documentation constants ───
const PAYLOAD_EXAMPLE = `{
  "payload_version": "2026-02-24",
  "id": "txn_a1b2c3d4e5f6",
  "value": 297.00,
  "payment_method": "PIX",
  "status": "AUTHORIZED",
  "payment_details": {
    "pix_key": "vendedor@email.com"
  },
  "customer": {
    "name": "Maria Silva",
    "email": "maria@email.com",
    "cpf": "123.456.789-00",
    "phone": "(11) 99999-0001"
  },
  "product": {
    "id": "prod_001",
    "name": "Curso Marketing Digital"
  },
  "created_at": "2024-01-15T10:30:00Z",
  "approved_at": "2024-01-15T10:30:05Z"
}`;

const STATUS_TABLE = [
  { status: "AUTHORIZED", desc: "Transação autorizada e concluída com sucesso" },
  { status: "PENDING", desc: "Transação pendente de pagamento" },
  { status: "REFUNDED", desc: "Transação reembolsada ao cliente" },
  { status: "CHARGEBACK", desc: "Transação contestada pelo cliente junto à operadora" },
  { status: "IN_DISPUTE", desc: "Transação em processo de disputa" },
  { status: "EXPIRED", desc: "Transação expirada por falta de pagamento" },
  { status: "CANCELED", desc: "Transação cancelada antes da conclusão" },
];

const PAYMENT_METHODS = [
  {
    name: "PIX", code: "PIX", label: "Pagamento Instantâneo",
    fields: [
      { field: "payment_details.pix_key", type: "string", note: "Apenas se URL tiver include_pix_key=1" },
    ],
  },
  {
    name: "Cartão de Crédito", code: "CREDIT_CARD", label: "Crédito",
    fields: [
      { field: "payment_details.card_brand", type: "string", note: "Bandeira do cartão (Visa, Mastercard...)" },
      { field: "payment_details.installments", type: "number", note: "Número de parcelas" },
      { field: "payment_details.last_digits", type: "string", note: "Últimos 4 dígitos" },
    ],
  },
  {
    name: "Cartão de Débito", code: "DEBIT_CARD", label: "Débito",
    fields: [
      { field: "payment_details.card_brand", type: "string", note: "Bandeira do cartão" },
    ],
  },
  {
    name: "Boleto Bancário", code: "BANK_SLIP", label: "Boleto",
    fields: [
      { field: "payment_details.barcode", type: "string", note: "Código de barras" },
      { field: "payment_details.expiration_date", type: "string", note: "Data de vencimento (ISO 8601)" },
      { field: "payment_details.pdf_url", type: "string", note: "URL do boleto em PDF" },
    ],
  },
];

// ─── Empty form ───
const emptyForm = () => ({
  name: "", url: "", active: true, events: [] as string[],
});

// ─── Component ───
const SellerWebhooks = () => {
  usePageMeta(
    [{ label: "Vendedor", path: "/app" }, { label: "Integrações", path: "/app/integrations" }, { label: "Webhooks" }],
    "Webhooks"
  );

  const navigate = useNavigate();
  const [endpoints, setEndpoints] = useState<DbWebhookEndpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [sheetEndpoint, setSheetEndpoint] = useState<DbWebhookEndpoint | null>(null);
  const [sheetLogs, setSheetLogs] = useState<DbWebhookLog[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<DbWebhookEndpoint | null>(null);
  const [successOpen, setSuccessOpen] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // ─── Load data ───
  useEffect(() => {
    fetchWebhookEndpoints().then(setEndpoints).catch(() => toast.error("Erro ao carregar webhooks")).finally(() => setLoading(false));
  }, []);

  // ─── Load logs when detail opens ───
  useEffect(() => {
    if (!sheetEndpoint) { setSheetLogs([]); return; }
    fetchWebhookLogs(sheetEndpoint.id).then(setSheetLogs).catch(() => {});
  }, [sheetEndpoint?.id]);

  // ─── Handlers ───
  const openCreate = () => { setEditingId(null); setForm(emptyForm()); setDialogOpen(true); };
  const openEdit = (ep: DbWebhookEndpoint) => {
    setEditingId(ep.id);
    setForm({ name: ep.name, url: ep.url, active: ep.active, events: [...ep.events] });
    setDialogOpen(true);
  };

  const toggleEvent = (key: string) => {
    setForm((prev) => ({
      ...prev,
      events: prev.events.includes(key) ? prev.events.filter((e) => e !== key) : [...prev.events, key],
    }));
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.url.trim()) { toast.error("Preencha nome e URL"); return; }
    try { new URL(form.url); } catch { toast.error("URL inválida"); return; }
    if (form.events.length === 0) { toast.error("Selecione pelo menos um evento"); return; }

    setSaving(true);
    try {
      if (editingId) {
        const updated = await updateWebhookEndpoint(editingId, form);
        setEndpoints((prev) => prev.map((ep) => ep.id === editingId ? updated : ep));
      } else {
        const created = await createWebhookEndpoint(form);
        setEndpoints((prev) => [created, ...prev]);
      }
      setDialogOpen(false);
      setSuccessOpen(true);
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar webhook");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteWebhookEndpoint(deleteTarget.id);
      setEndpoints((prev) => prev.filter((ep) => ep.id !== deleteTarget.id));
      setDeleteTarget(null);
      toast.success("Webhook removido");
    } catch { toast.error("Erro ao remover"); }
  };

  const toggleActive = async (id: string) => {
    const ep = endpoints.find((e) => e.id === id);
    if (!ep) return;
    try {
      const updated = await updateWebhookEndpoint(id, { active: !ep.active });
      setEndpoints((prev) => prev.map((e) => e.id === id ? updated : e));
      if (sheetEndpoint?.id === id) setSheetEndpoint(updated);
    } catch { toast.error("Erro ao alterar status"); }
  };

  const handleTest = useCallback(async (ep: DbWebhookEndpoint) => {
    setTestingId(ep.id);
    try {
      const data = await testWebhookEndpoint(ep.id);
      if (data.success) {
        toast.success(`Webhook "${ep.name}" testado — ${data.status_code} OK (${data.response_time}ms)`);
      } else {
        toast.error(`Webhook "${ep.name}" falhou — ${data.status_code || "timeout"} (${data.response_time}ms)${data.error ? ": " + data.error : ""}`);
      }
    } catch (err: any) {
      toast.error(err.message || "Erro ao testar webhook");
    } finally {
      setTestingId(null);
    }
  }, []);

  // ─── Table columns ───
  const columns = [
    {
      key: "name" as const, header: "Nome",
      render: (ep: DbWebhookEndpoint) => (
        <div>
          <span className="font-medium text-sm">{ep.name}</span>
          <p className="text-xs text-muted-foreground truncate max-w-[240px]">{ep.url}</p>
        </div>
      ),
    },
    {
      key: "events" as const, header: "Eventos",
      render: (ep: DbWebhookEndpoint) => (
        <div className="flex flex-wrap gap-1">
          {ep.events.slice(0, 2).map((e) => (
            <Badge key={e} variant="secondary" className="text-[10px]">{e.split(".")[1]}</Badge>
          ))}
          {ep.events.length > 2 && <Badge variant="outline" className="text-[10px]">+{ep.events.length - 2}</Badge>}
        </div>
      ),
    },
    {
      key: "success_rate" as const, header: "Saúde",
      render: (ep: DbWebhookEndpoint) => {
        const color = ep.success_rate >= 90 ? "text-success" : ep.success_rate >= 70 ? "text-warning" : "text-destructive";
        return <span className={`text-sm font-medium ${color}`}>{ep.success_rate}%</span>;
      },
    },
    {
      key: "active" as const, header: "Status",
      render: (ep: DbWebhookEndpoint) => (
        <StatusBadge status={ep.active ? "active" : "inactive"} />
      ),
    },
  ];

  if (loading) return <div className="text-center py-12 text-sm text-muted-foreground">Carregando...</div>;

  return (
    <PageContent>
      {/* Back + Header */}
      <div className="flex items-center gap-2 mb-1">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/app/integrations")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <p className="text-sm text-muted-foreground">Gerencie endpoints de webhook para receber notificações em tempo real.</p>
      </div>

      {/* Documentation Accordion */}
      <Accordion type="single" collapsible className="mb-6">
        <AccordionItem value="docs" className="border rounded-lg">
          <AccordionTrigger className="px-4 hover:no-underline">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Documentação da API de Webhooks</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <Tabs defaultValue="payload">
              <TabsList className="mb-3">
                <TabsTrigger value="payload"><FileCode className="h-3.5 w-3.5 mr-1.5" />Payload</TabsTrigger>
                <TabsTrigger value="status">Status</TabsTrigger>
                <TabsTrigger value="methods">Métodos</TabsTrigger>
              </TabsList>

              <TabsContent value="payload">
                <p className="text-xs text-muted-foreground mb-2">Modelo de payload enviado via POST ao seu endpoint. O header <code className="text-xs bg-muted px-1 rounded">X-Webhook-Signature</code> contém a assinatura HMAC-SHA256.</p>
                <div className="relative">
                  <pre className="bg-muted rounded-lg p-4 text-xs overflow-x-auto font-mono leading-relaxed">{PAYLOAD_EXAMPLE}</pre>
                  <Button
                    variant="ghost" size="icon" className="absolute top-2 right-2 h-7 w-7"
                    onClick={() => { navigator.clipboard.writeText(PAYLOAD_EXAMPLE); toast.success("Copiado!"); }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="mt-3 p-3 bg-muted/50 rounded-lg">
                  <p className="text-xs font-medium mb-1 flex items-center gap-1.5"><Shield className="h-3.5 w-3.5" /> Verificação de assinatura</p>
                  <p className="text-xs text-muted-foreground">Compare o header <code className="bg-muted px-1 rounded">X-Webhook-Signature</code> com o HMAC-SHA256 do body usando seu secret. Reenvio automático em caso de falha: até 3 tentativas com backoff exponencial (5s, 30s, 5min).</p>
                </div>
              </TabsContent>

              <TabsContent value="status">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs">Descrição</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {STATUS_TABLE.map((s) => (
                      <TableRow key={s.status}>
                        <TableCell><Badge variant="outline" className="text-[10px] font-mono">{s.status}</Badge></TableCell>
                        <TableCell className="text-xs text-muted-foreground">{s.desc}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TabsContent>

              <TabsContent value="methods">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {PAYMENT_METHODS.map((m) => (
                    <Card key={m.code} className="border-dashed">
                      <CardHeader className="pb-2 pt-3 px-4">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-sm">{m.name}</CardTitle>
                          <Badge variant="secondary" className="text-[10px] font-mono">{m.code}</Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="px-4 pb-3">
                        <div className="space-y-1.5">
                          {m.fields.map((f) => (
                            <div key={f.field} className="flex items-start gap-2">
                              <code className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono shrink-0">{f.field}</code>
                              <span className="text-[10px] text-muted-foreground">{f.type} — {f.note}</span>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </TabsContent>
            </Tabs>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {/* Listing */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Endpoints configurados</CardTitle>
            <Button size="sm" onClick={openCreate} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Novo webhook
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {endpoints.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">Nenhum webhook configurado</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  {columns.map((col) => <TableHead key={col.key} className="text-xs">{col.header}</TableHead>)}
                  <TableHead className="text-xs w-[60px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {endpoints.map((ep) => (
                  <TableRow key={ep.id} className="cursor-pointer" onClick={() => setSheetEndpoint(ep)}>
                    {columns.map((col) => (
                      <TableCell key={col.key}>{col.render(ep)}</TableCell>
                    ))}
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); openEdit(ep); }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); setDeleteTarget(ep); }}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ─── Detail Sheet ─── */}
      <Sheet open={!!sheetEndpoint} onOpenChange={(open) => !open && setSheetEndpoint(null)}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          {sheetEndpoint && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  {sheetEndpoint.name}
                  <StatusBadge status={sheetEndpoint.active ? "active" : "inactive"} />
                </SheetTitle>
                <SheetDescription className="truncate">{sheetEndpoint.url}</SheetDescription>
              </SheetHeader>

              <div className="mt-4 space-y-4">
                {/* Info */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Saúde</p>
                    <p className={`text-lg font-bold ${sheetEndpoint.success_rate >= 90 ? "text-success" : sheetEndpoint.success_rate >= 70 ? "text-warning" : "text-destructive"}`}>
                      {sheetEndpoint.success_rate}%
                    </p>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Disparos</p>
                    <p className="text-lg font-bold">{sheetLogs.length}</p>
                  </div>
                </div>

                {/* Secret */}
                <div>
                  <Label className="text-xs text-muted-foreground">Secret (HMAC-SHA256)</Label>
                  <CopyToClipboardField value={sheetEndpoint.secret} label="" />
                </div>

                {/* Events */}
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">Eventos inscritos</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {sheetEndpoint.events.map((e) => (
                      <Badge key={e} variant="secondary" className="text-[10px] font-mono">{e}</Badge>
                    ))}
                  </div>
                </div>

                <Separator />

                {/* Logs */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-xs text-muted-foreground">Últimos disparos</Label>
                    <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => handleTest(sheetEndpoint)} disabled={testingId === sheetEndpoint.id}>
                      {testingId === sheetEndpoint.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />} Testar
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {sheetLogs.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-4">Nenhum disparo registrado</p>
                    )}
                    {sheetLogs.map((log) => (
                      <div key={log.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/40 border border-border/50">
                        {log.success ? (
                          <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                        ) : (
                          <XCircle className="h-4 w-4 text-destructive shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-[10px] font-mono">{log.event.split(".")[1]}</Badge>
                            <Badge variant={log.success ? "secondary" : "destructive"} className="text-[10px]">{log.status_code}</Badge>
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {formatDateTimePtBr(log.triggered_at)} · {log.response_time}ms
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-2">
                  <Button variant="outline" size="sm" className="flex-1 gap-1.5" onClick={() => { setSheetEndpoint(null); openEdit(sheetEndpoint); }}>
                    <Pencil className="h-3.5 w-3.5" /> Editar
                  </Button>
                  <Button size="sm" className="flex-1 gap-1.5" onClick={() => toggleActive(sheetEndpoint.id)}>
                    <RefreshCw className="h-3.5 w-3.5" /> {sheetEndpoint.active ? "Desativar" : "Ativar"}
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* ─── Create/Edit Sheet ─── */}
      <Sheet open={dialogOpen} onOpenChange={setDialogOpen}>
        <SheetContent className="sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editingId ? "Editar webhook" : "Novo webhook"}</SheetTitle>
            <SheetDescription>Configure o endpoint para receber notificações.</SheetDescription>
          </SheetHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="wh-name">Nome</Label>
              <Input id="wh-name" placeholder="Ex: Notificação principal" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wh-url">URL do endpoint</Label>
              <Input id="wh-url" placeholder="https://api.seusite.com/webhook" value={form.url} onChange={(e) => setForm((p) => ({ ...p, url: e.target.value }))} />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="wh-active">Ativo</Label>
              <Switch id="wh-active" checked={form.active} onCheckedChange={(v) => setForm((p) => ({ ...p, active: v }))} />
            </div>
            <Separator />
            <div>
              <Label className="text-xs text-muted-foreground mb-2 block">Eventos</Label>
              <div className="space-y-2">
                {WEBHOOK_EVENTS.map((ev) => (
                  <label key={ev.key} className="flex items-start gap-2.5 cursor-pointer">
                    <Checkbox checked={form.events.includes(ev.key)} onCheckedChange={() => toggleEvent(ev.key)} className="mt-0.5" />
                    <div>
                      <p className="text-sm font-medium leading-none">{ev.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{ev.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button className="flex-1" onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              {editingId ? "Salvar" : "Criar webhook"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* ─── Success Dialog ─── */}
      <Dialog open={successOpen} onOpenChange={setSuccessOpen}>
        <DialogContent className="sm:max-w-sm text-center">
          <div className="flex flex-col items-center gap-3 py-4">
            <div className="h-12 w-12 rounded-full bg-success/10 flex items-center justify-center">
              <CheckCircle2 className="h-6 w-6 text-success" />
            </div>
            <DialogTitle>{editingId ? "Webhook atualizado!" : "Webhook criado!"}</DialogTitle>
            <DialogDescription>
              {editingId
                ? "As alterações foram salvas com sucesso."
                : "Seu endpoint está configurado e pronto para receber notificações."}
            </DialogDescription>
            <Button className="mt-2" onClick={() => setSuccessOpen(false)}>Entendi</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Delete Confirmation ─── */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Excluir webhook</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir <strong>{deleteTarget?.name}</strong>? Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete}>Excluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContent>
  );
};

export default SellerWebhooks;
