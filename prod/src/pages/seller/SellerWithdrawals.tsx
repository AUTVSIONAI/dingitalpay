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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DollarSign, Clock, CheckCircle, ArrowUpRight, XCircle, AlertCircle,
  Banknote, CreditCard, User, Key, Building, Hash, Wallet, ArrowLeft, ArrowRight, Receipt,
} from "lucide-react";
import {
  fetchSellerWithdrawals, createWithdrawalRequest, computeWithdrawalMetrics,
  WithdrawalWithHistory, WithdrawalMetrics,
} from "@/services/withdrawal.service";
import { getPlatformSettings } from "@/services/admin.service";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { maskCurrency, unmaskCurrency } from "@/lib/masks";
import { motion, AnimatePresence } from "framer-motion";
import { formatDatePtBr, formatDateTimeWithAtPtBr } from "@/lib/timezone";
import { useAuth } from "@/contexts/AuthContext";

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

const StepIndicator = ({ current }: { current: 1 | 2 }) => (
  <div className="flex items-center justify-center gap-2 mb-2">
    <div className={cn("h-2 w-2 rounded-full transition-colors", current === 1 ? "bg-primary" : "bg-muted-foreground/30")} />
    <div className={cn("h-2 w-2 rounded-full transition-colors", current === 2 ? "bg-primary" : "bg-muted-foreground/30")} />
  </div>
);

const columns: DataTableColumn<WithdrawalWithHistory>[] = [
  { key: "id", header: "ID", render: (row) => row.id.slice(0, 8) + "..." },
  { key: "net_amount", header: "Valor", className: "text-right", render: (row) => fmt(Number(row.net_amount)) },
  { key: "method", header: "Método" },
  { key: "status", header: "Status", render: (row) => <StatusBadge status={row.status} /> },
  { key: "requested_at", header: "Solicitado", render: (row) => fmtDate(row.requested_at) },
  { key: "processed_at", header: "Processado", className: "text-right", render: (row) => row.processed_at ? fmtDate(row.processed_at) : "—" },
];

const SellerWithdrawals = () => {
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedWithdrawal, setSelectedWithdrawal] = useState<WithdrawalWithHistory | null>(null);
  const [requestOpen, setRequestOpen] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);
  const [reqStep, setReqStep] = useState<1 | 2>(1);
  const [reqAmount, setReqAmount] = useState("");
  const [reqMethod, setReqMethod] = useState<"PIX" | "TED">("PIX");
  const [reqError, setReqError] = useState("");

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  usePageMeta([{ label: "Vendedor", path: "/app" }, { label: "Saques" }], "Saques");

  const { data: withdrawals = [], isLoading } = useQuery({
    queryKey: ["seller-withdrawals"],
    queryFn: fetchSellerWithdrawals,
  });

  const { data: platformSettings } = useQuery({
    queryKey: ["platform-settings"],
    queryFn: getPlatformSettings,
    staleTime: 5 * 60 * 1000,
  });

  const minWithdrawal = platformSettings?.minWithdrawal ?? 50;
  const maxWithdrawal = platformSettings?.maxWithdrawal ?? 10000;
  const pixEnabled = platformSettings?.withdrawalPixEnabled ?? true;
  const tedEnabled = platformSettings?.withdrawalTedEnabled ?? true;
  const processingDays = platformSettings?.withdrawalProcessingDays ?? 3;
  const feeType = platformSettings?.withdrawalFeeType ?? "percent";
  const feePercent = platformSettings?.withdrawalFeePercent ?? 0;

  const { data: metrics } = useQuery({
    queryKey: ["withdrawal-metrics", withdrawals],
    queryFn: () => computeWithdrawalMetrics(withdrawals),
    enabled: !isLoading,
  });

  const createMutation = useMutation({
    mutationFn: createWithdrawalRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["seller-withdrawals"] });
      setRequestOpen(false);
      setSuccessOpen(true);
      setReqAmount("");
      setReqMethod("PIX");
      setReqStep(1);
    },
    onError: (error: Error) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
  });

  const filtered = withdrawals.filter((w) => statusFilter === "all" || w.status === statusFilter);

  // Fee calculation
  const parsedAmount = unmaskCurrency(reqAmount);
  const feeValue = feeType === "percent" ? (parsedAmount * feePercent / 100) : feePercent;
  const netAmount = Math.max(parsedAmount - feeValue, 0);
  const feeLabel = feeType === "percent" ? `${feePercent}%` : fmt(feePercent);

  const handleGoToStep2 = () => {
    const amount = unmaskCurrency(reqAmount);
    if (isNaN(amount) || amount < minWithdrawal) {
      setReqError(`O valor mínimo para saque é ${fmt(minWithdrawal)}`);
      return;
    }
    if (amount > maxWithdrawal) {
      setReqError(`O valor máximo para saque é ${fmt(maxWithdrawal)}`);
      return;
    }
    const balance = metrics?.availableBalance ?? 0;
    if (amount > balance) {
      setReqError("Valor excede o saldo disponível");
      return;
    }
    setReqError("");
    setReqStep(2);
  };

  const handleConfirm = async () => {
    if (!user) {
      setReqError("Usuário não autenticado");
      setReqStep(1);
      return;
    }

    createMutation.mutate({
      seller_id: user.id,
      amount: unmaskCurrency(reqAmount),
      method: reqMethod,
      bank_info: { type: reqMethod, holder: "" },
    });
  };

  const openRequest = () => {
    setReqAmount("");
    setReqMethod("PIX");
    setReqError("");
    setReqStep(1);
    setRequestOpen(true);
  };

  if (isLoading) return <LoadingState />;

  const safeMetrics: WithdrawalMetrics = metrics || {
    availableBalance: 0, pending: 0, totalWithdrawn: 0, lastWithdrawal: null, lastWithdrawalDate: null,
  };

  return (
    <PageContent>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Saldo disponível" value={fmt(safeMetrics.availableBalance)} icon={<DollarSign className="h-5 w-5" />} />
        <StatCard label="Pendente" value={fmt(safeMetrics.pending)} icon={<Clock className="h-5 w-5" />} />
        <StatCard label="Sacado total" value={fmt(safeMetrics.totalWithdrawn)} icon={<CheckCircle className="h-5 w-5" />} />
        <StatCard
          label="Último saque"
          value={safeMetrics.lastWithdrawal !== null ? fmt(safeMetrics.lastWithdrawal) : "—"}
          subtitle={safeMetrics.lastWithdrawalDate ? fmtDate(safeMetrics.lastWithdrawalDate) : undefined}
          icon={<ArrowUpRight className="h-5 w-5" />}
        />
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <FilterBar filters={[{ label: "Status", value: statusFilter, onChange: setStatusFilter, options: [{ label: "Todos", value: "all" }, { label: "Aprovado", value: "approved" }, { label: "Pendente", value: "pending" }, { label: "Rejeitado", value: "rejected" }] }]} />
        <Button className="w-full sm:w-auto" onClick={openRequest}>
          <ArrowUpRight className="h-4 w-4 mr-2" />Solicitar saque
        </Button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={<Wallet className="h-12 w-12" />} title="Nenhum saque encontrado" description="Seus saques aparecerão aqui quando você fizer sua primeira solicitação." />
      ) : (
        <DataTable columns={columns} data={filtered} emptyMessage="Nenhum saque encontrado" onRowClick={(row) => setSelectedWithdrawal(row)} />
      )}

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
                <SheetDescription>Detalhes completos do saque</SheetDescription>
              </SheetHeader>

              <div className="mt-6 space-y-6">
                <div className="space-y-1">
                  <InfoRow icon={<Banknote className="h-4 w-4" />} label="Valor solicitado" value={fmt(Number(selectedWithdrawal.amount))} />
                  {Number(selectedWithdrawal.fee_amount) > 0 && (
                    <InfoRow icon={<Receipt className="h-4 w-4" />} label="Taxa da plataforma" value={`- ${fmt(Number(selectedWithdrawal.fee_amount))}`} />
                  )}
                  <InfoRow icon={<DollarSign className="h-4 w-4" />} label="Valor líquido" value={fmt(Number(selectedWithdrawal.net_amount))} />
                  <InfoRow icon={<CreditCard className="h-4 w-4" />} label="Método" value={selectedWithdrawal.method} />
                  <InfoRow icon={<Clock className="h-4 w-4" />} label="Solicitado em" value={fmtDateTime(selectedWithdrawal.requested_at)} />
                  {selectedWithdrawal.processed_at && (
                    <InfoRow icon={<CheckCircle className="h-4 w-4" />} label="Processado em" value={fmtDateTime(selectedWithdrawal.processed_at)} />
                  )}
                </div>

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

                {selectedWithdrawal.statusHistory.length > 0 && (
                  <>
                    <Separator />
                    <div>
                      <p className="text-sm font-semibold mb-3">Histórico de Status</p>
                      <div>
                        {selectedWithdrawal.statusHistory.map((event, i) => (
                          <TimelineStep key={event.id || i} event={event} isLast={i === selectedWithdrawal.statusHistory.length - 1} />
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* 2-Step Request Dialog */}
      <Dialog open={requestOpen} onOpenChange={(open) => { if (!open) { setRequestOpen(false); setReqStep(1); } }}>
        <DialogContent className="sm:max-w-md overflow-hidden">
          <StepIndicator current={reqStep} />

          <AnimatePresence mode="wait" initial={false}>
            {reqStep === 1 ? (
              <motion.div
                key="step1"
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -20, opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <DialogHeader>
                  <DialogTitle>Solicitar Saque</DialogTitle>
                  <DialogDescription>
                    Saldo disponível: <span className="font-semibold text-foreground">{fmt(safeMetrics.availableBalance)}</span> · Mín: {fmt(minWithdrawal)} · Máx: {fmt(maxWithdrawal)}
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="req-amount">Valor do saque</Label>
                    <Input id="req-amount" placeholder="R$ 0,00" inputMode="numeric" value={reqAmount} onChange={(e) => { setReqAmount(maskCurrency(e.target.value)); setReqError(""); }} />
                  </div>
                  <div className="space-y-2">
                    <Label>Método</Label>
                    <Select value={reqMethod} onValueChange={(v) => setReqMethod(v as "PIX" | "TED")}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {pixEnabled && <SelectItem value="PIX">PIX</SelectItem>}
                        {tedEnabled && <SelectItem value="TED">TED</SelectItem>}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-muted-foreground rounded-lg bg-muted/50 p-3">
                    <Receipt className="h-4 w-4 shrink-0" />
                    <span>Taxa por saque: <span className="font-semibold text-foreground">{feeLabel}</span> · Prazo: <span className="font-semibold text-foreground">{processingDays} dias úteis</span></span>
                  </div>

                  {reqError && (
                    <p className="text-sm text-destructive flex items-center gap-1">
                      <AlertCircle className="h-3.5 w-3.5" /> {reqError}
                    </p>
                  )}
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setRequestOpen(false)}>Cancelar</Button>
                  <Button onClick={handleGoToStep2}>
                    Simular saque <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                </DialogFooter>
              </motion.div>
            ) : (
              <motion.div
                key="step2"
                initial={{ x: 20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: 20, opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <DialogHeader>
                  <DialogTitle>Simulação do Saque</DialogTitle>
                  <DialogDescription>Confira os valores antes de confirmar.</DialogDescription>
                </DialogHeader>

                <div className="py-4">
                  <div className="rounded-xl border bg-card p-5 space-y-4">
                    {/* Requested amount */}
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Valor solicitado</span>
                      <span className="text-sm font-semibold">{fmt(parsedAmount)}</span>
                    </div>

                    {/* Fee */}
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                        <Receipt className="h-3.5 w-3.5" />
                        Taxa da plataforma ({feeLabel})
                      </span>
                      <span className="text-sm font-medium text-destructive">- {fmt(feeValue)}</span>
                    </div>

                    <Separator />

                    {/* Net amount */}
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold">Você receberá</span>
                      <span className="text-xl font-bold text-primary">{fmt(netAmount)}</span>
                    </div>

                    {/* Method + processing */}
                    <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
                      <span className="flex items-center gap-1"><CreditCard className="h-3 w-3" /> {reqMethod}</span>
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {processingDays} dias úteis</span>
                    </div>
                  </div>
                </div>

                <DialogFooter className="flex-col sm:flex-row gap-2">
                  <Button variant="outline" onClick={() => setReqStep(1)} className="w-full sm:w-auto">
                    <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
                  </Button>
                  <Button onClick={handleConfirm} disabled={createMutation.isPending} className="w-full sm:w-auto">
                    {createMutation.isPending ? "Enviando..." : "Confirmar saque"}
                  </Button>
                </DialogFooter>
              </motion.div>
            )}
          </AnimatePresence>
        </DialogContent>
      </Dialog>

      {/* Success Dialog */}
      <Dialog open={successOpen} onOpenChange={setSuccessOpen}>
        <DialogContent className="sm:max-w-sm text-center">
          <div className="flex flex-col items-center gap-3 py-4">
            <div className="flex items-center justify-center h-14 w-14 rounded-full bg-primary/10">
              <CheckCircle className="h-7 w-7 text-primary" />
            </div>
            <DialogHeader className="sm:text-center">
              <DialogTitle>Solicitação Enviada!</DialogTitle>
              <DialogDescription>
                Sua solicitação de saque foi registrada com sucesso. O processamento será realizado em até <span className="font-semibold text-foreground">{processingDays} dias úteis</span>.
              </DialogDescription>
            </DialogHeader>
          </div>
          <DialogFooter className="sm:justify-center">
            <Button onClick={() => setSuccessOpen(false)}>Entendido</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContent>
  );
};

export default SellerWithdrawals;
