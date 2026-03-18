import { useState, useEffect } from "react";
import { usePageMeta } from "@/contexts/PageMetaContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Plus, ArrowLeft, Smartphone, QrCode, CheckCircle2, Wifi, WifiOff,
  RefreshCw, Trash2, Clock, AlertTriangle,
} from "lucide-react";
import {
  fetchWhatsAppInstances, createWhatsAppInstance, deleteWhatsAppInstance,
  type DbWhatsAppInstance,
} from "@/services/integration.service";
import type { WhatsAppInstanceStatus } from "@/types/api";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import PageContent from "@/components/layout/PageContent";
import { formatDatePtBr, formatDateTimePtBr } from "@/lib/timezone";

const statusConfig: Record<WhatsAppInstanceStatus, { label: string; color: string; icon: typeof Wifi }> = {
  connected: { label: "Conectado", color: "text-success", icon: Wifi },
  disconnected: { label: "Desconectado", color: "text-destructive", icon: WifiOff },
  qr_pending: { label: "Aguardando QR", color: "text-warning", icon: QrCode },
};

const emptyForm = () => ({ name: "" });

const SellerWhatsApp = () => {
  usePageMeta(
    [{ label: "Vendedor", path: "/app" }, { label: "Integrações", path: "/app/integrations" }, { label: "WhatsApp" }],
    "WhatsApp"
  );

  const navigate = useNavigate();
  const [instances, setInstances] = useState<DbWhatsAppInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [createStep, setCreateStep] = useState<1 | 2>(1);
  const [form, setForm] = useState(emptyForm());
  const [qrTimer, setQrTimer] = useState(120);
  const [connecting, setConnecting] = useState(false);
  const [detailInstance, setDetailInstance] = useState<DbWhatsAppInstance | null>(null);
  const [disconnectTarget, setDisconnectTarget] = useState<DbWhatsAppInstance | null>(null);

  useEffect(() => {
    fetchWhatsAppInstances().then(setInstances).catch(() => toast.error("Erro ao carregar instâncias")).finally(() => setLoading(false));
  }, []);

  // ─── QR Timer ───
  useEffect(() => {
    if (createStep !== 2 || !createOpen) return;
    if (qrTimer <= 0) return;
    const t = setTimeout(() => setQrTimer((v) => v - 1), 1000);
    return () => clearTimeout(t);
  }, [qrTimer, createStep, createOpen]);

  const openCreate = () => {
    setForm(emptyForm());
    setCreateStep(1);
    setQrTimer(120);
    setConnecting(false);
    setCreateOpen(true);
  };

  const goToQR = () => {
    if (!form.name.trim()) { toast.error("Informe o nome da instância"); return; }
    setCreateStep(2);
    setQrTimer(120);
  };

  const refreshQR = () => setQrTimer(120);

  const simulateConnect = async () => {
    setConnecting(true);
    try {
      const phone = `+55 11 9${Math.floor(Math.random() * 9000 + 1000)}-${Math.floor(Math.random() * 9000 + 1000)}`;
      const created = await createWhatsAppInstance({ name: form.name, phone, status: "connected" });
      setInstances((prev) => [created, ...prev]);
      setCreateOpen(false);
      toast.success(`WhatsApp "${form.name}" conectado com sucesso!`);
    } catch (err: any) {
      toast.error(err.message || "Erro ao conectar");
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!disconnectTarget) return;
    try {
      await deleteWhatsAppInstance(disconnectTarget.id);
      setInstances((prev) => prev.filter((i) => i.id !== disconnectTarget.id));
      if (detailInstance?.id === disconnectTarget.id) setDetailInstance(null);
      setDisconnectTarget(null);
      toast.success("Instância desconectada");
    } catch { toast.error("Erro ao desconectar"); }
  };

  const healthColor = (rate: number) =>
    rate >= 90 ? "text-success" : rate >= 70 ? "text-warning" : "text-destructive";

  const healthBg = (status: string) =>
    status === "connected" ? "bg-success" : status === "disconnected" ? "bg-destructive" : "bg-warning";

  if (loading) return <div className="text-center py-12 text-sm text-muted-foreground">Carregando...</div>;

  return (
    <PageContent>
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/app/integrations")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <p className="text-sm text-muted-foreground">Conecte seu WhatsApp para enviar mensagens automáticas aos seus clientes.</p>
        </div>
      </div>

      {/* Offline alert */}
      {instances.some((i) => i.status === "disconnected") && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 mb-4">
          <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
          <p className="text-xs text-destructive">Uma ou mais instâncias estão desconectadas. Campanhas e automações associadas estão pausadas.</p>
        </div>
      )}

      {/* Listing */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Instâncias conectadas</CardTitle>
            <Button size="sm" onClick={openCreate} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Nova instância
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {instances.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">Nenhuma instância configurada</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Instância</TableHead>
                  <TableHead className="text-xs">Número</TableHead>
                  <TableHead className="text-xs">Msgs (24h)</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs w-[60px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {instances.map((inst) => {
                  const sc = statusConfig[inst.status as WhatsAppInstanceStatus] ?? statusConfig.qr_pending;
                  return (
                    <TableRow key={inst.id} className="cursor-pointer" onClick={() => setDetailInstance(inst)}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className={`h-2 w-2 rounded-full ${healthBg(inst.status)}`} />
                          <span className="font-medium text-sm">{inst.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{inst.phone || "—"}</TableCell>
                      <TableCell className="text-sm">{inst.messages_sent_24h}</TableCell>
                      <TableCell><span className={`text-xs font-medium ${sc.color}`}>{sc.label}</span></TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); setDisconnectTarget(inst); }}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ─── Create Sheet ─── */}
      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent className="sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{createStep === 1 ? "Nova instância" : "Conectar WhatsApp"}</SheetTitle>
            <SheetDescription>
              {createStep === 1 ? "Configure sua instância antes de conectar." : "Escaneie o QR code com seu WhatsApp."}
            </SheetDescription>
          </SheetHeader>

          {createStep === 1 ? (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="wa-name">Nome da instância</Label>
                <Input id="wa-name" placeholder="Ex: WhatsApp Comercial" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
              </div>
              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => setCreateOpen(false)}>Cancelar</Button>
                <Button className="flex-1 gap-1.5" onClick={goToQR}><QrCode className="h-3.5 w-3.5" /> Gerar QR Code</Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center py-6 space-y-4">
              <div className="w-56 h-56 rounded-xl border-2 border-dashed border-border flex items-center justify-center bg-muted/30 relative">
                {connecting ? (
                  <div className="flex flex-col items-center gap-2">
                    <RefreshCw className="h-8 w-8 text-primary animate-spin" />
                    <p className="text-xs text-muted-foreground">Conectando...</p>
                  </div>
                ) : qrTimer <= 0 ? (
                  <div className="flex flex-col items-center gap-2">
                    <Clock className="h-8 w-8 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">QR expirado</p>
                    <Button variant="outline" size="sm" onClick={refreshQR} className="gap-1"><RefreshCw className="h-3 w-3" /> Novo QR</Button>
                  </div>
                ) : (
                  <div className="grid grid-cols-8 gap-0.5 w-40 h-40">
                    {Array.from({ length: 64 }).map((_, i) => (
                      <div key={i} className={`rounded-[1px] ${Math.random() > 0.4 ? "bg-foreground" : "bg-transparent"}`} />
                    ))}
                  </div>
                )}
              </div>

              {qrTimer > 0 && !connecting && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  Expira em {Math.floor(qrTimer / 60)}:{String(qrTimer % 60).padStart(2, "0")}
                </div>
              )}

              <div className="bg-muted/50 rounded-lg p-3 w-full space-y-1.5">
                <p className="text-xs font-medium flex items-center gap-1.5"><Smartphone className="h-3.5 w-3.5" /> Como conectar</p>
                <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                  <li>Abra o WhatsApp no seu celular</li>
                  <li>Toque em <strong>Dispositivos conectados</strong></li>
                  <li>Toque em <strong>Conectar dispositivo</strong></li>
                  <li>Aponte a câmera para o QR code acima</li>
                </ol>
              </div>

              <div className="flex gap-2 w-full pt-2">
                <Button variant="outline" className="flex-1" onClick={() => setCreateStep(1)}>Voltar</Button>
                <Button className="flex-1 gap-1.5" onClick={simulateConnect} disabled={connecting || qrTimer <= 0}>
                  <CheckCircle2 className="h-3.5 w-3.5" /> Simular conexão
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* ─── Detail Sheet ─── */}
      <Sheet open={!!detailInstance} onOpenChange={(open) => !open && setDetailInstance(null)}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          {detailInstance && (() => {
            const sc = statusConfig[detailInstance.status as WhatsAppInstanceStatus] ?? statusConfig.qr_pending;
            const StatusIcon = sc.icon;
            return (
              <>
                <SheetHeader>
                  <SheetTitle className="flex items-center gap-2">
                    {detailInstance.name}
                    <span className={`inline-flex items-center gap-1 text-xs font-medium ${sc.color}`}>
                      <StatusIcon className="h-3 w-3" /> {sc.label}
                    </span>
                  </SheetTitle>
                  <SheetDescription>{detailInstance.phone || "Sem número conectado"}</SheetDescription>
                </SheetHeader>

                <div className="mt-4 space-y-4">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3 bg-muted/50 rounded-lg text-center">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Msgs 24h</p>
                      <p className="text-lg font-bold">{detailInstance.messages_sent_24h}</p>
                    </div>
                    <div className="p-3 bg-muted/50 rounded-lg text-center">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Entrega</p>
                      <p className={`text-lg font-bold ${healthColor(detailInstance.delivery_rate)}`}>{detailInstance.delivery_rate}%</p>
                    </div>
                    <div className="p-3 bg-muted/50 rounded-lg text-center">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Última msg</p>
                      <p className="text-xs font-medium mt-1">
                        {detailInstance.last_message_at ? formatDatePtBr(detailInstance.last_message_at) : "—"}
                      </p>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between"><span className="text-muted-foreground">Criada em</span><span>{formatDatePtBr(detailInstance.created_at)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Última atividade</span><span>{detailInstance.last_active_at ? formatDateTimePtBr(detailInstance.last_active_at) : "—"}</span></div>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <Button variant="destructive" size="sm" className="flex-1 gap-1.5" onClick={() => { setDetailInstance(null); setDisconnectTarget(detailInstance); }}>
                      <WifiOff className="h-3.5 w-3.5" /> Desconectar
                    </Button>
                  </div>
                </div>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>

      {/* ─── Disconnect Dialog ─── */}
      <Dialog open={!!disconnectTarget} onOpenChange={(open) => !open && setDisconnectTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Desconectar instância</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja desconectar <strong>{disconnectTarget?.name}</strong>? Todas as campanhas e automações usando esta instância serão pausadas.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisconnectTarget(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDisconnect}>Desconectar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContent>
  );
};

export default SellerWhatsApp;
