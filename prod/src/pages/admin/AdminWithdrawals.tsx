import { useState } from "react";
import PageContent from "@/components/layout/PageContent";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usePageMeta } from "@/contexts/PageMetaContext";
import StatCard from "@/components/shared/StatCard";
import DataTable, { DataTableColumn } from "@/components/shared/DataTable";
import StatusBadge from "@/components/shared/StatusBadge";
import FilterBar from "@/components/shared/FilterBar";
import LoadingState from "@/components/shared/LoadingState";
import EmptyState from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  DollarSign, Clock, CheckCircle, XCircle, AlertCircle,
  Banknote, CreditCard, User, Key, Building, Hash, Wallet, Search,
  Settings, Save, Percent, CalendarDays,
} from "lucide-react";
import {
  fetchAllWithdrawals, computeAdminWithdrawalMetrics, updateWithdrawalStatus,
  AdminWithdrawalRow, AdminWithdrawalMetrics,
} from "@/services/withdrawal.service";
import { getPlatformSettings, updatePlatformSettings } from "@/services/admin.service";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { maskCurrency, unmaskCurrency } from "@/lib/masks";
import { formatDatePtBr, formatDateTimeWithAtPtBr } from "@/lib/timezone";

const fmt = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (d: string) => formatDatePtBr(d);
const fmtDateTime = (d: string) => formatDateTimeWithAtPtBr(d);

const statusIcon: Record<string, React.ReactNode> = {
  pending: <Clock className="h-4 w-4" />,
  in_review: <AlertCircle className="h-4 w-4" />,
  approved: <CheckCircle className="h-4 w-4" />,
  rejected: <XCircle className="h-4 w-4" />,
};

const statusColor: Record<string, string> = {
  pending: "border-muted-foreground/40 text-muted-foreground bg-muted",
  in_review: "border-yellow-500 text-yellow-600 bg-yellow-50 dark:bg-yellow-950/30",
  approved: "border-emerald-500 text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30",
  rejected: "border-destructive text-destructive bg-destructive/10",
};

const statusLabel: Record<string, string> = {
  pending: "Solicitado",
  in_review: "Em Análise",
  approved: "Aprovado",
  rejected: "Rejeitado",
};

const TimelineStep = ({ event, isLast }: { event: { status: string; created_at: string; note: string }; isLast: boolean }) => (
  <div className="flex gap-3">
    <div className="flex flex-col items-center">
      <div className={cn("flex items-center justify-center h-8 w-8 rounded-full border-2 shrink-0", statusColor[event.status] || statusColor.pending)}>
        {statusIcon[event.status] || statusIcon.pending}
      </div>
      {!isLast && <div className="w-px flex-1 bg-border my-1" />}
    </div>
    <div className="pb-5">
      <p className="text-sm font-medium">{statusLabel[event.status] || event.status}</p>
      <p className="text-xs text-muted-foreground">{fmtDateTime(event.created_at)}</p>
      {event.note && <p className="text-xs text-muted-foreground mt-0.5">{event.note}</p>}
    </div>
  </div>
);

const InfoRow = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) => (
  <div className="flex items-start gap-3 py-2">
    <div className="text-muted-foreground mt-0.5 shrink-0">{icon}</div>
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium break-all">{value}</p>
    </div>
  </div>
);

const columns: DataTableColumn<AdminWithdrawalRow>[] = [
  {
    key: "sellerName", header: "Vendedor",
    render: (row) => (
      <div className="flex items-center gap-2">
        <div className="flex items-center justify-center h-7 w-7 rounded-full bg-primary/10 text-primary text-xs font-medium shrink-0">
          {row.sellerName.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
        </div>
        <span className="truncate">{row.sellerName}</span>
      </div>
    ),
  },
  { key: "net_amount", header: "Valor", className: "text-right", render: (row) => fmt(Number(row.net_amount)) },
  { key: "method", header: "Método" },
  { key: "status", header: "Status", render: (row) => <StatusBadge status={row.status} /> },
  { key: "requested_at", header: "Solicitado", render: (row) => fmtDate(row.requested_at) },
  { key: "processed_at", header: "Processado", className: "text-right", render: (row) => row.processed_at ? fmtDate(row.processed_at) : "—" },
];

// ========== Withdrawal Settings Tab ==========

const WithdrawalSettingsTab = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: ["platform-settings"],
    queryFn: getPlatformSettings,
  });

  const [minWithdrawal, setMinWithdrawal] = useState<string>("");
  const [maxWithdrawal, setMaxWithdrawal] = useState<string>("");
  const [feeType, setFeeType] = useState<"percent" | "fixed">("percent");
  const [feePercent, setFeePercent] = useState<string>("");
  const [processingDays, setProcessingDays] = useState<string>("");
  const [pixEnabled, setPixEnabled] = useState(true);
  const [tedEnabled, setTedEnabled] = useState(true);
  const [initialized, setInitialized] = useState(false);

  // Sync state when data loads
  if (settings && !initialized) {
    setMinWithdrawal(maskCurrency(String(settings.minWithdrawal * 100)));
    setMaxWithdrawal(maskCurrency(String(settings.maxWithdrawal * 100)));
    setFeeType(settings.withdrawalFeeType || "percent");
    setFeePercent(settings.withdrawalFeeType === "fixed" ? maskCurrency(String(settings.withdrawalFeePercent * 100)) : String(settings.withdrawalFeePercent));
    setProcessingDays(String(settings.withdrawalProcessingDays));
    setPixEnabled(settings.withdrawalPixEnabled);
    setTedEnabled(settings.withdrawalTedEnabled);
    setInitialized(true);
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      updatePlatformSettings({
        minWithdrawal: unmaskCurrency(minWithdrawal),
        maxWithdrawal: unmaskCurrency(maxWithdrawal),
        withdrawalFeeType: feeType,
        withdrawalFeePercent: feeType === "fixed" ? unmaskCurrency(feePercent) : Number(feePercent),
        withdrawalProcessingDays: Number(processingDays),
        withdrawalPixEnabled: pixEnabled,
        withdrawalTedEnabled: tedEnabled,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-settings"] });
      toast({ title: "Configurações salvas com sucesso" });
    },
    onError: (err: Error) => {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) return <LoadingState />;

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {/* Limites de valor */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <DollarSign className="h-4 w-4" /> Limites de Valor
          </CardTitle>
          <CardDescription>Defina os valores mínimo e máximo permitidos para saques.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="min-withdrawal">Valor mínimo (R$)</Label>
            <Input
              id="min-withdrawal"
              inputMode="numeric"
              value={minWithdrawal}
              onChange={(e) => setMinWithdrawal(maskCurrency(e.target.value))}
              placeholder="R$ 0,00"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="max-withdrawal">Valor máximo (R$)</Label>
            <Input
              id="max-withdrawal"
              inputMode="numeric"
              value={maxWithdrawal}
              onChange={(e) => setMaxWithdrawal(maskCurrency(e.target.value))}
              placeholder="R$ 0,00"
            />
          </div>
        </CardContent>
      </Card>

      {/* Taxa de saque */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Percent className="h-4 w-4" /> Taxa de Saque
          </CardTitle>
          <CardDescription>Valor retido pela plataforma em cada saque realizado.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <RadioGroup value={feeType} onValueChange={(v) => {
            setFeeType(v as "percent" | "fixed");
            setFeePercent("");
          }} className="grid grid-cols-2 gap-3">
            <label
              htmlFor="fee-percent-type"
              className={cn(
                "relative flex flex-col items-center gap-2 rounded-lg border-2 p-4 cursor-pointer transition-all hover:border-primary/50",
                feeType === "percent"
                  ? "border-primary bg-primary/5 shadow-sm"
                  : "border-border bg-card"
              )}
            >
              <RadioGroupItem value="percent" id="fee-percent-type" className="sr-only" />
              <div className={cn(
                "flex items-center justify-center h-10 w-10 rounded-full transition-colors",
                feeType === "percent" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
              )}>
                <Percent className="h-5 w-5" />
              </div>
              <span className={cn("text-sm font-medium", feeType === "percent" ? "text-primary" : "text-foreground")}>Percentual</span>
              <span className="text-xs text-muted-foreground">Cobra % do valor</span>
            </label>
            <label
              htmlFor="fee-fixed-type"
              className={cn(
                "relative flex flex-col items-center gap-2 rounded-lg border-2 p-4 cursor-pointer transition-all hover:border-primary/50",
                feeType === "fixed"
                  ? "border-primary bg-primary/5 shadow-sm"
                  : "border-border bg-card"
              )}
            >
              <RadioGroupItem value="fixed" id="fee-fixed-type" className="sr-only" />
              <div className={cn(
                "flex items-center justify-center h-10 w-10 rounded-full transition-colors",
                feeType === "fixed" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
              )}>
                <Banknote className="h-5 w-5" />
              </div>
              <span className={cn("text-sm font-medium", feeType === "fixed" ? "text-primary" : "text-foreground")}>Valor Fixo</span>
              <span className="text-xs text-muted-foreground">Cobra R$ por saque</span>
            </label>
          </RadioGroup>

          {feeType === "percent" ? (
            <div className="space-y-2">
              <Label htmlFor="fee-value">Taxa (%)</Label>
              <Input
                id="fee-value"
                type="number"
                min={0}
                max={100}
                step={0.1}
                value={feePercent}
                onChange={(e) => setFeePercent(e.target.value)}
                placeholder="0"
              />
              <p className="text-xs text-muted-foreground">
                Ex: 5% — em um saque de R$ 1.000, a plataforma retém R$ 50.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="fee-value">Valor fixo por saque</Label>
              <Input
                id="fee-value"
                inputMode="numeric"
                value={feePercent}
                onChange={(e) => setFeePercent(maskCurrency(e.target.value))}
                placeholder="R$ 0,00"
              />
              <p className="text-xs text-muted-foreground">
                Ex: R$ 3,00 — cobrado em cada saque independente do valor.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Prazo de processamento */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarDays className="h-4 w-4" /> Prazo de Processamento
          </CardTitle>
          <CardDescription>Prazo estimado exibido ao vendedor após solicitar o saque.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="processing-days">Dias úteis</Label>
            <Input
              id="processing-days"
              type="number"
              min={1}
              max={30}
              value={processingDays}
              onChange={(e) => setProcessingDays(e.target.value)}
              placeholder="3"
            />
          </div>
        </CardContent>
      </Card>

      {/* Métodos permitidos */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CreditCard className="h-4 w-4" /> Métodos Permitidos
          </CardTitle>
          <CardDescription>Habilite ou desabilite métodos de saque disponíveis para vendedores.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">PIX</p>
              <p className="text-xs text-muted-foreground">Transferência instantânea via chave PIX</p>
            </div>
            <Switch checked={pixEnabled} onCheckedChange={setPixEnabled} />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">TED</p>
              <p className="text-xs text-muted-foreground">Transferência bancária tradicional</p>
            </div>
            <Switch checked={tedEnabled} onCheckedChange={setTedEnabled} />
          </div>
        </CardContent>
      </Card>

      {/* Save button full width */}
      <div className="md:col-span-2 flex justify-end">
        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="gap-2">
          <Save className="h-4 w-4" />
          {saveMutation.isPending ? "Salvando..." : "Salvar configurações"}
        </Button>
      </div>
    </div>
  );
};

// ========== Main Component ==========

const AdminWithdrawals = () => {
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedWithdrawal, setSelectedWithdrawal] = useState<AdminWithdrawalRow | null>(null);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const { toast } = useToast();
  const queryClient = useQueryClient();

  usePageMeta([{ label: "Admin", path: "/admin" }, { label: "Saques" }], "Saques");

  const { data: withdrawals = [], isLoading } = useQuery({
    queryKey: ["admin-withdrawals"],
    queryFn: fetchAllWithdrawals,
  });

  const metrics: AdminWithdrawalMetrics = computeAdminWithdrawalMetrics(withdrawals);

  const statusMutation = useMutation({
    mutationFn: ({ id, status, note, reason }: { id: string; status: "pending" | "in_review" | "approved" | "rejected"; note?: string; reason?: string }) =>
      updateWithdrawalStatus(id, status, note, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-withdrawals"] });
      toast({ title: "Status atualizado com sucesso" });
      setSelectedWithdrawal(null);
      setRejectDialogOpen(false);
      setRejectReason("");
    },
    onError: (error: Error) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
  });

  const filtered = withdrawals.filter((w) => {
    const matchStatus = statusFilter === "all" || w.status === statusFilter;
    const matchSearch = !search || w.sellerName.toLowerCase().includes(search.toLowerCase()) || w.id.toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });

  const isFinal = (status: string) => status === "approved" || status === "rejected";

  const handleApprove = (w: AdminWithdrawalRow) => {
    statusMutation.mutate({ id: w.id, status: "approved", note: "Saque aprovado pelo administrador" });
  };

  const handleInReview = (w: AdminWithdrawalRow) => {
    statusMutation.mutate({ id: w.id, status: "in_review", note: "Saque em análise" });
  };

  const handleReject = () => {
    if (!selectedWithdrawal || !rejectReason.trim()) return;
    statusMutation.mutate({ id: selectedWithdrawal.id, status: "rejected", note: rejectReason, reason: rejectReason });
  };

  return (
    <PageContent>
      <Tabs defaultValue="requests" className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="requests" className="gap-2">
            <Wallet className="h-4 w-4" /> Solicitações
          </TabsTrigger>
          <TabsTrigger value="settings" className="gap-2">
            <Settings className="h-4 w-4" /> Configurações
          </TabsTrigger>
        </TabsList>

        <TabsContent value="requests">
          {isLoading ? (
            <LoadingState />
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
                <StatCard label="Pendentes" value={fmt(metrics.totalPending)} subtitle={`${metrics.totalPendingCount} solicitações`} icon={<Clock className="h-5 w-5" />} />
                <StatCard label="Em análise" value={fmt(metrics.totalInReview)} subtitle={`${metrics.totalInReviewCount} saques`} icon={<AlertCircle className="h-5 w-5" />} />
                <StatCard label="Aprovados" value={fmt(metrics.totalApproved)} subtitle={`${metrics.totalApprovedCount} saques`} icon={<CheckCircle className="h-5 w-5" />} />
                <StatCard label="Rejeitados" value={`${metrics.totalRejectedCount}`} icon={<XCircle className="h-5 w-5" />} />
                <StatCard label="Volume total" value={fmt(metrics.totalVolume)} icon={<DollarSign className="h-5 w-5" />} />
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <FilterBar filters={[{
                  label: "Status", value: statusFilter, onChange: setStatusFilter,
                  options: [
                    { label: "Todos", value: "all" },
                    { label: "Pendente", value: "pending" },
                    { label: "Em Análise", value: "in_review" },
                    { label: "Aprovado", value: "approved" },
                    { label: "Rejeitado", value: "rejected" },
                  ],
                }]} />
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Buscar vendedor..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
                </div>
              </div>

              {filtered.length === 0 ? (
                <EmptyState icon={<Wallet className="h-12 w-12" />} title="Nenhum saque encontrado" description="Os saques solicitados pelos vendedores aparecerão aqui." />
              ) : (
                <DataTable columns={columns} data={filtered} emptyMessage="Nenhum saque encontrado" onRowClick={(row) => setSelectedWithdrawal(row)} />
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="settings">
          <WithdrawalSettingsTab />
        </TabsContent>
      </Tabs>

      {/* Detail Sheet */}
      <Sheet open={!!selectedWithdrawal} onOpenChange={(open) => !open && setSelectedWithdrawal(null)}>
        <SheetContent className="sm:max-w-md overflow-y-auto">
          {selectedWithdrawal && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  {selectedWithdrawal.id.slice(0, 8)}...
                  <StatusBadge status={selectedWithdrawal.status} />
                </SheetTitle>
                <SheetDescription>Detalhes do saque</SheetDescription>
              </SheetHeader>

              <div className="mt-6 space-y-6">
                <div className="space-y-1">
                  <p className="text-sm font-semibold mb-2">Vendedor</p>
                  <InfoRow icon={<User className="h-4 w-4" />} label="Nome" value={selectedWithdrawal.sellerName} />
                </div>

                <Separator />

                <div className="space-y-1">
                  <InfoRow icon={<Banknote className="h-4 w-4" />} label="Valor solicitado" value={fmt(Number(selectedWithdrawal.amount))} />
                  {Number(selectedWithdrawal.fee_amount) > 0 && (
                    <InfoRow icon={<Percent className="h-4 w-4" />} label="Taxa da plataforma" value={`- ${fmt(Number(selectedWithdrawal.fee_amount))}`} />
                  )}
                  <InfoRow icon={<DollarSign className="h-4 w-4" />} label="Valor líquido" value={fmt(Number(selectedWithdrawal.net_amount))} />
                  <InfoRow icon={<CreditCard className="h-4 w-4" />} label="Método" value={selectedWithdrawal.method} />
                  <InfoRow icon={<Clock className="h-4 w-4" />} label="Solicitado em" value={fmtDateTime(selectedWithdrawal.requested_at)} />
                  {selectedWithdrawal.processed_at && (
                    <InfoRow icon={<CheckCircle className="h-4 w-4" />} label="Processado em" value={fmtDateTime(selectedWithdrawal.processed_at)} />
                  )}
                </div>

                {selectedWithdrawal.bank_info && (
                  <>
                    <Separator />
                    <div>
                      <p className="text-sm font-semibold mb-2">Dados Bancários</p>
                      <div className="space-y-1">
                        <InfoRow icon={<Key className="h-4 w-4" />} label="Tipo" value={selectedWithdrawal.bank_info.type || selectedWithdrawal.method} />
                        {selectedWithdrawal.bank_info.pixKey && <InfoRow icon={<Hash className="h-4 w-4" />} label="Chave PIX" value={selectedWithdrawal.bank_info.pixKey} />}
                        {selectedWithdrawal.bank_info.bankName && <InfoRow icon={<Building className="h-4 w-4" />} label="Banco" value={selectedWithdrawal.bank_info.bankName} />}
                        {selectedWithdrawal.bank_info.agency && <InfoRow icon={<Hash className="h-4 w-4" />} label="Agência" value={selectedWithdrawal.bank_info.agency} />}
                        {selectedWithdrawal.bank_info.account && <InfoRow icon={<Hash className="h-4 w-4" />} label="Conta" value={selectedWithdrawal.bank_info.account} />}
                        {selectedWithdrawal.bank_info.holder && <InfoRow icon={<User className="h-4 w-4" />} label="Titular" value={selectedWithdrawal.bank_info.holder} />}
                      </div>
                    </div>
                  </>
                )}

                {selectedWithdrawal.rejection_reason && (
                  <>
                    <Separator />
                    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                      <p className="text-sm font-medium text-destructive flex items-center gap-2">
                        <XCircle className="h-4 w-4" /> Motivo da rejeição
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">{selectedWithdrawal.rejection_reason}</p>
                    </div>
                  </>
                )}

                {selectedWithdrawal.statusHistory.length > 0 && (
                  <>
                    <Separator />
                    <div>
                      <p className="text-sm font-semibold mb-3">Histórico de Status</p>
                      <div>
                        {selectedWithdrawal.statusHistory.map((event, i) => (
                          <TimelineStep key={i} event={event} isLast={i === selectedWithdrawal.statusHistory.length - 1} />
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {!isFinal(selectedWithdrawal.status) && (
                  <>
                    <Separator />
                    <div className="flex flex-col gap-2">
                      <p className="text-sm font-semibold">Ações</p>
                      <div className="flex gap-2">
                        {selectedWithdrawal.status === "pending" && (
                          <Button
                            variant="outline"
                            className="flex-1 border-yellow-500 text-yellow-600 hover:bg-yellow-50 dark:hover:bg-yellow-950/30"
                            onClick={() => handleInReview(selectedWithdrawal)}
                            disabled={statusMutation.isPending}
                          >
                            <AlertCircle className="h-4 w-4 mr-1.5" /> Em Análise
                          </Button>
                        )}
                        <Button
                          className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                          onClick={() => handleApprove(selectedWithdrawal)}
                          disabled={statusMutation.isPending}
                        >
                          <CheckCircle className="h-4 w-4 mr-1.5" /> Aprovar
                        </Button>
                        <Button
                          variant="destructive"
                          className="flex-1"
                          onClick={() => { setRejectDialogOpen(true); setRejectReason(""); }}
                          disabled={statusMutation.isPending}
                        >
                          <XCircle className="h-4 w-4 mr-1.5" /> Rejeitar
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rejeitar Saque</DialogTitle>
            <DialogDescription>
              Informe o motivo da rejeição. O vendedor será notificado.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="reject-reason">Motivo</Label>
            <Textarea
              id="reject-reason"
              placeholder="Descreva o motivo da rejeição..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleReject} disabled={!rejectReason.trim() || statusMutation.isPending}>
              {statusMutation.isPending ? "Rejeitando..." : "Confirmar rejeição"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContent>
  );
};

export default AdminWithdrawals;
