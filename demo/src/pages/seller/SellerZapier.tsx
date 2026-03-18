import { useState, useEffect } from "react";
import { usePageMeta } from "@/contexts/PageMetaContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import StatusBadge from "@/components/shared/StatusBadge";
import CopyToClipboardField from "@/components/shared/CopyToClipboardField";
import {
  Plus, ArrowLeft, BookOpen, FileCode, Pencil, Trash2, Send, CheckCircle2, XCircle,
  Zap, Copy, Loader2, ExternalLink,
} from "lucide-react";
import {
  fetchZapierIntegrations, createZapierIntegration, updateZapierIntegration,
  deleteZapierIntegration, fetchZapierLogs, testZapierIntegration,
  type DbZapierIntegration, type DbZapierLog,
} from "@/services/integration.service";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import PageContent from "@/components/layout/PageContent";
import { formatDatePtBr, formatDateTimePtBr } from "@/lib/timezone";

// ─── Events ───
const ZAPIER_EVENTS = [
  { key: "transaction.authorized", label: "Transação Autorizada", desc: "Quando uma transação é aprovada" },
  { key: "transaction.pending", label: "Transação Pendente", desc: "Aguardando pagamento" },
  { key: "transaction.refunded", label: "Transação Reembolsada", desc: "Quando uma transação é reembolsada" },
  { key: "transaction.chargeback", label: "Chargeback", desc: "Quando um chargeback é aberto" },
  { key: "transaction.expired", label: "Transação Expirada", desc: "Quando uma transação expira" },
  { key: "transaction.canceled", label: "Transação Cancelada", desc: "Quando uma transação é cancelada" },
];

const PAYLOAD_EXAMPLE = `{
  "event": "transaction.authorized",
  "payload_version": "2026-02-24",
  "id": "txn_a1b2c3d4e5f6",
  "value": 297.00,
  "payment_method": "PIX",
  "status": "AUTHORIZED",
  "customer": {
    "name": "Maria Silva",
    "email": "maria@email.com"
  },
  "product": {
    "id": "prod_001",
    "name": "Curso Marketing Digital"
  },
  "created_at": "2024-01-15T10:30:00Z"
}`;

const emptyForm = (): { name: string; webhookUrl: string; active: boolean; events: string[] } => ({
  name: "", webhookUrl: "", active: true, events: [],
});

const SellerZapier = () => {
  usePageMeta(
    [{ label: "Vendedor", path: "/app" }, { label: "Integrações", path: "/app/integrations" }, { label: "Zapier" }],
    "Zapier"
  );

  const navigate = useNavigate();
  const [zaps, setZaps] = useState<DbZapierIntegration[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [detailZap, setDetailZap] = useState<DbZapierIntegration | null>(null);
  const [detailLogs, setDetailLogs] = useState<DbZapierLog[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<DbZapierIntegration | null>(null);
  const [successOpen, setSuccessOpen] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchZapierIntegrations().then(setZaps).catch(() => toast.error("Erro ao carregar Zaps")).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!detailZap) { setDetailLogs([]); return; }
    fetchZapierLogs(detailZap.id).then(setDetailLogs).catch(() => {});
  }, [detailZap?.id]);

  // ─── Handlers ───
  const openCreate = () => { setEditingId(null); setForm(emptyForm()); setSheetOpen(true); };
  const openEdit = (zap: DbZapierIntegration) => {
    setEditingId(zap.id);
    setForm({ name: zap.name, webhookUrl: zap.webhook_url, active: zap.active, events: [...zap.events] });
    setSheetOpen(true);
  };

  const toggleEvent = (key: string) => {
    setForm((prev) => ({
      ...prev,
      events: prev.events.includes(key) ? prev.events.filter((e) => e !== key) : [...prev.events, key],
    }));
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error("Informe o nome do Zap"); return; }
    if (!form.webhookUrl.trim()) { toast.error("Informe a URL do webhook Zapier"); return; }
    try { new URL(form.webhookUrl); } catch { toast.error("URL inválida"); return; }
    if (form.events.length === 0) { toast.error("Selecione pelo menos um evento"); return; }

    setSaving(true);
    try {
      if (editingId) {
        const updated = await updateZapierIntegration(editingId, {
          name: form.name, webhook_url: form.webhookUrl, active: form.active, events: form.events,
        });
        setZaps((prev) => prev.map((z) => z.id === editingId ? updated : z));
      } else {
        const created = await createZapierIntegration({
          name: form.name, webhook_url: form.webhookUrl, active: form.active, events: form.events,
        });
        setZaps((prev) => [created, ...prev]);
      }
      setSheetOpen(false);
      setSuccessOpen(true);
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar Zap");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteZapierIntegration(deleteTarget.id);
      setZaps((prev) => prev.filter((z) => z.id !== deleteTarget.id));
      if (detailZap?.id === deleteTarget.id) setDetailZap(null);
      setDeleteTarget(null);
      toast.success("Zap removido");
    } catch { toast.error("Erro ao remover"); }
  };

  const handleTest = async (zap: DbZapierIntegration) => {
    setTestingId(zap.id);
    try {
      const result = await testZapierIntegration(zap.id);
      if (result.success) {
        toast.success("Requisição enviada ao endpoint do Zapier com sucesso.");
      } else {
        toast.error("Falha ao enviar requisição. Verifique a URL e tente novamente.");
      }
    } catch {
      toast.error("Falha ao enviar requisição. Verifique a URL e tente novamente.");
    } finally {
      setTestingId(null);
    }
  };

  const toggleActive = async (id: string) => {
    const zap = zaps.find((z) => z.id === id);
    if (!zap) return;
    try {
      const updated = await updateZapierIntegration(id, { active: !zap.active });
      setZaps((prev) => prev.map((z) => z.id === id ? updated : z));
      if (detailZap?.id === id) setDetailZap(updated);
    } catch { toast.error("Erro ao alterar status"); }
  };

  // ─── Table columns ───
  const columns = [
    {
      key: "name", header: "Nome",
      render: (z: DbZapierIntegration) => (
        <div>
          <span className="font-medium text-sm">{z.name}</span>
          <p className="text-xs text-muted-foreground truncate max-w-[220px]">{z.webhook_url}</p>
        </div>
      ),
    },
    {
      key: "events", header: "Eventos",
      render: (z: DbZapierIntegration) => (
        <div className="flex flex-wrap gap-1">
          {z.events.slice(0, 2).map((e) => (
            <Badge key={e} variant="secondary" className="text-[10px]">{e.split(".")[1]}</Badge>
          ))}
          {z.events.length > 2 && <Badge variant="outline" className="text-[10px]">+{z.events.length - 2}</Badge>}
        </div>
      ),
    },
    {
      key: "last_triggered_at", header: "Último disparo",
      render: (z: DbZapierIntegration) => (
        <span className="text-xs text-muted-foreground">
          {z.last_triggered_at ? formatDatePtBr(z.last_triggered_at) : "Nunca"}
        </span>
      ),
    },
    {
      key: "active", header: "Status",
      render: (z: DbZapierIntegration) => <StatusBadge status={z.active ? "active" : "inactive"} />,
    },
  ];

  if (loading) return <div className="text-center py-12 text-sm text-muted-foreground">Carregando...</div>;

  return (
    <PageContent>
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/app/integrations")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <p className="text-sm text-muted-foreground">Conecte com 5.000+ apps automatizando ações via Zapier.</p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" asChild>
          <a href="https://zapier.com/apps" target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-3.5 w-3.5" /> Zapier Apps
          </a>
        </Button>
      </div>

      {/* Documentation */}
      <Accordion type="single" collapsible className="mb-6">
        <AccordionItem value="docs" className="border rounded-lg">
          <AccordionTrigger className="px-4 hover:no-underline">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Como configurar o Zapier</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <Tabs defaultValue="steps">
              <TabsList className="mb-3">
                <TabsTrigger value="steps">Passo a passo</TabsTrigger>
                <TabsTrigger value="payload"><FileCode className="h-3.5 w-3.5 mr-1.5" />Payload</TabsTrigger>
                <TabsTrigger value="events">Eventos</TabsTrigger>
              </TabsList>

              <TabsContent value="steps">
                <div className="space-y-3">
                  {[
                    { step: 1, title: "Crie um Zap", desc: 'Acesse zapier.com e clique em "Create Zap"' },
                    { step: 2, title: "Adicione o trigger", desc: 'Busque "Webhooks by Zapier" e selecione "Catch Hook"' },
                    { step: 3, title: "Copie a URL", desc: "O Zapier vai gerar uma URL de webhook. Copie-a." },
                    { step: 4, title: "Configure aqui", desc: "Cole a URL aqui, selecione os eventos e salve" },
                    { step: 5, title: "Teste e publique", desc: 'Use o botão "Testar" aqui e publique seu Zap no Zapier' },
                  ].map((s) => (
                    <div key={s.step} className="flex items-start gap-3">
                      <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <span className="text-xs font-bold text-primary">{s.step}</span>
                      </div>
                      <div>
                        <p className="text-sm font-medium">{s.title}</p>
                        <p className="text-xs text-muted-foreground">{s.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="payload">
                <p className="text-xs text-muted-foreground mb-2">Payload enviado ao Zapier a cada evento. Mesma estrutura dos webhooks para consistência.</p>
                <div className="relative">
                  <pre className="bg-muted rounded-lg p-4 text-xs overflow-x-auto font-mono leading-relaxed">{PAYLOAD_EXAMPLE}</pre>
                  <Button
                    variant="ghost" size="icon" className="absolute top-2 right-2 h-7 w-7"
                    onClick={() => { navigator.clipboard.writeText(PAYLOAD_EXAMPLE); toast.success("Copiado!"); }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="events">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Evento</TableHead>
                      <TableHead className="text-xs">Descrição</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ZAPIER_EVENTS.map((ev) => (
                      <TableRow key={ev.key}>
                        <TableCell><Badge variant="outline" className="text-[10px] font-mono">{ev.key}</Badge></TableCell>
                        <TableCell className="text-xs text-muted-foreground">{ev.desc}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TabsContent>
            </Tabs>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {/* Listing */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Zaps configurados</CardTitle>
            <Button size="sm" onClick={openCreate} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Novo Zap
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {zaps.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">Nenhum Zap configurado</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  {columns.map((col) => <TableHead key={col.key} className="text-xs">{col.header}</TableHead>)}
                  <TableHead className="text-xs w-[80px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {zaps.map((zap) => (
                  <TableRow key={zap.id} className="cursor-pointer" onClick={() => setDetailZap(zap)}>
                    {columns.map((col) => (
                      <TableCell key={col.key}>{col.render(zap)}</TableCell>
                    ))}
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); handleTest(zap); }} disabled={testingId === zap.id}>
                          {testingId === zap.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); openEdit(zap); }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); setDeleteTarget(zap); }}>
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
      <Sheet open={!!detailZap} onOpenChange={(open) => !open && setDetailZap(null)}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          {detailZap && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-warning" />
                  {detailZap.name}
                  <StatusBadge status={detailZap.active ? "active" : "inactive"} />
                </SheetTitle>
                <SheetDescription className="truncate">{detailZap.webhook_url}</SheetDescription>
              </SheetHeader>

              <div className="mt-4 space-y-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Webhook URL</Label>
                  <CopyToClipboardField value={detailZap.webhook_url} label="" />
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">Eventos inscritos</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {detailZap.events.map((e) => (
                      <Badge key={e} variant="secondary" className="text-[10px] font-mono">{e}</Badge>
                    ))}
                  </div>
                </div>

                <Separator />

                {/* Logs */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-xs text-muted-foreground">Histórico de disparos</Label>
                    <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => handleTest(detailZap)} disabled={testingId === detailZap.id}>
                      {testingId === detailZap.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />} Testar
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {detailLogs.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-4">Nenhum disparo registrado</p>
                    )}
                    {detailLogs.map((log) => (
                      <div key={log.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/40 border border-border/50">
                        {log.success ? (
                          <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                        ) : (
                          <XCircle className="h-4 w-4 text-destructive shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <Badge variant="outline" className="text-[10px] font-mono">{log.event.split(".")[1]}</Badge>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {formatDateTimePtBr(log.triggered_at)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <Separator />

                <div className="space-y-2 text-xs">
                  <div className="flex justify-between"><span className="text-muted-foreground">Criado em</span><span>{formatDatePtBr(detailZap.created_at)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Último disparo</span><span>{detailZap.last_triggered_at ? formatDateTimePtBr(detailZap.last_triggered_at) : "Nunca"}</span></div>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button variant="outline" size="sm" className="flex-1 gap-1.5" onClick={() => { setDetailZap(null); openEdit(detailZap); }}>
                    <Pencil className="h-3.5 w-3.5" /> Editar
                  </Button>
                  <Button size="sm" className="flex-1 gap-1.5" onClick={() => toggleActive(detailZap.id)}>
                    {detailZap.active ? "Desativar" : "Ativar"}
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* ─── Create/Edit Sheet ─── */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editingId ? "Editar Zap" : "Novo Zap"}</SheetTitle>
            <SheetDescription>Configure a integração com o Zapier.</SheetDescription>
          </SheetHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="zap-name">Nome</Label>
              <Input id="zap-name" placeholder="Ex: Venda → Planilha Google" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="zap-url">URL do webhook Zapier</Label>
              <Input id="zap-url" placeholder="https://hooks.zapier.com/hooks/catch/..." value={form.webhookUrl} onChange={(e) => setForm((p) => ({ ...p, webhookUrl: e.target.value }))} />
              <p className="text-[10px] text-muted-foreground">Encontre essa URL no trigger "Webhooks by Zapier" → "Catch Hook" do seu Zap.</p>
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="zap-active">Ativo</Label>
              <Switch id="zap-active" checked={form.active} onCheckedChange={(v) => setForm((p) => ({ ...p, active: v }))} />
            </div>
            <Separator />
            <div>
              <Label className="text-xs text-muted-foreground mb-2 block">Eventos</Label>
              <div className="space-y-2">
                {ZAPIER_EVENTS.map((ev) => (
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
            <Button variant="outline" className="flex-1" onClick={() => setSheetOpen(false)}>Cancelar</Button>
            <Button className="flex-1" onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              {editingId ? "Salvar" : "Criar Zap"}
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
            <DialogTitle>{editingId ? "Zap atualizado!" : "Zap configurado!"}</DialogTitle>
            <DialogDescription>
              {editingId
                ? "As alterações foram salvas com sucesso."
                : "Toda vez que um evento ocorrer, o Zapier executará seu fluxo automaticamente."}
            </DialogDescription>
            <Button className="mt-2" onClick={() => setSuccessOpen(false)}>Entendi</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Delete Dialog ─── */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Excluir Zap</DialogTitle>
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

export default SellerZapier;
