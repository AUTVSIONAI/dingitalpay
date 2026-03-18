import { useCallback, useEffect, useMemo, useState } from "react";
import PageContent from "@/components/layout/PageContent";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Skeleton } from "@/components/ui/skeleton";
import { usePageMeta } from "@/contexts/PageMetaContext";
import { Banknote, Barcode, CreditCard, Loader2, QrCode } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import KipayCard from "./acquirers/KipayCard";
import MercadoPagoCard from "./acquirers/MercadoPagoCard";
import { ACQUIRERS_CATALOG, PAYMENT_METHODS_CATALOG, type PaymentMethodLabel } from "@/data/acquirersCatalog";
import type { AdminAcquirersOverview, BackendAcquirerStatus, PaymentMethodOverview } from "./acquirers/types";

type PaymentMethodCard = {
  name: string;
  icon: React.ReactNode;
  methodLabel: PaymentMethodLabel;
};

const METHOD_ICONS: Record<PaymentMethodLabel, React.ReactNode> = {
  PIX: <QrCode className="h-5 w-5 text-primary" />,
  Cartão: <CreditCard className="h-5 w-5 text-primary" />,
  Boleto: <Barcode className="h-5 w-5 text-primary" />,
  Cashout: <Banknote className="h-5 w-5 text-primary" />,
};

const paymentMethods: PaymentMethodCard[] = PAYMENT_METHODS_CATALOG.map((method) => ({
  name: method.name,
  methodLabel: method.methodLabel,
  icon: METHOD_ICONS[method.methodLabel],
}));

function normalizeAcquirerName(name: string) {
  return String(name || "").trim().toUpperCase();
}

function unwrapOverviewPayload(resp: unknown): AdminAcquirersOverview | null {
  const payload = (resp as any)?.data ?? resp;
  if (!payload || typeof payload !== "object") return null;
  return payload as AdminAcquirersOverview;
}

const AdminAcquirers = () => {
  usePageMeta(
    [
      { label: "Admin", path: "/admin/dashboard" },
      { label: "Adquirentes" },
    ],
    "Adquirentes"
  );

  const [overview, setOverview] = useState<AdminAcquirersOverview | null>(null);
  const [selectedAcquirers, setSelectedAcquirers] = useState<Record<string, string>>({});
  const [savedAcquirers, setSavedAcquirers] = useState<Record<string, string>>({});
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [savingMethod, setSavingMethod] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    setLoadingOverview(true);
    const { data, error } = await supabase.functions.invoke("admin-acquirers-overview", { body: {} });
    if (error) {
      console.error("admin-acquirers-overview error:", error);
      setLoadingOverview(false);
      return;
    }

    const payload = unwrapOverviewPayload(data);
    if (payload) {
      setOverview(payload);
      const mapping = Object.fromEntries(
        (payload.paymentMethods || []).map((method) => [
          method.method,
          method.current_acquirer_name || "none",
        ])
      );
      setSelectedAcquirers(mapping);
      setSavedAcquirers(mapping);
    }

    setLoadingOverview(false);
  }, []);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  const methodMap = useMemo(() => {
    const map = new Map<PaymentMethodLabel, PaymentMethodOverview>();
    for (const method of overview?.paymentMethods || []) {
      map.set(method.method, method);
    }
    return map;
  }, [overview]);

  const statusMap = useMemo(() => {
    const map = new Map<string, BackendAcquirerStatus>();
    for (const acquirer of overview?.configurableAcquirers || []) {
      map.set(normalizeAcquirerName(acquirer.acquirer_name), acquirer);
    }
    return map;
  }, [overview]);

  const activeAcquirersCount = useMemo(
    () => (overview?.configurableAcquirers || []).filter((acquirer) => acquirer.status === "connected").length,
    [overview]
  );

  const availableForActivation = useMemo(
    () =>
      (overview?.availableForActivation || []).map((entry) => {
        const catalog = ACQUIRERS_CATALOG.find(
          (item) => normalizeAcquirerName(item.name) === normalizeAcquirerName(entry.acquirer_name)
        );
        return {
          acquirer_name: entry.acquirer_name,
          methods_supported: entry.methods_supported,
          description: catalog?.description || "Entre em contato com o suporte para ativar esta adquirente.",
        };
      }),
    [overview]
  );

  const getEligibleAcquirers = useCallback(
    (method: PaymentMethodLabel) =>
      (methodMap.get(method)?.options || []).filter((option) => option.selectable),
    [methodMap]
  );

  const getMethodAcquirerStatus = useCallback(
    (method: PaymentMethodLabel) => {
      const currentAcquirer = savedAcquirers[method];
      if (!currentAcquirer || currentAcquirer === "none") return null;
      return statusMap.get(normalizeAcquirerName(currentAcquirer)) || null;
    },
    [savedAcquirers, statusMap]
  );

  const handleApply = async (method: PaymentMethodLabel) => {
    const acquirer = selectedAcquirers[method];
    if (!acquirer) {
      toast.error("Selecione uma adquirente.");
      return;
    }

    setSavingMethod(method);
    const { data, error } = await supabase.functions.invoke("admin-payment-method-acquirers", {
      body: { action: "upsert", method, acquirer_name: acquirer },
    });

    if (error) {
      const msg = String((error as any)?.message || error || "Erro ao salvar configuração.");
      toast.error(msg);
    } else if (data) {
      if (acquirer === "none") {
        toast.success(`Nenhuma adquirente vinculada ao método ${method}.`);
      } else {
        toast.success(`Adquirente ${acquirer} vinculada ao método ${method}.`);
      }
      await loadOverview();
    } else {
      toast.error("Erro ao salvar configuração.");
    }

    setSavingMethod(null);
  };

  return (
    <PageContent className="space-y-6">
      <Tabs defaultValue="acquirers">
        <TabsList>
          <TabsTrigger value="acquirers">Adquirentes disponíveis</TabsTrigger>
          <TabsTrigger value="methods">Método de pagamento</TabsTrigger>
        </TabsList>

        <TabsContent value="acquirers">
          <div className="space-y-6 mt-4">
            {loadingOverview && !overview ? (
              <>
                <div className="flex items-center gap-2">
                  <Skeleton className="h-5 w-36" />
                  <Skeleton className="h-5 w-8 rounded-full" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-stretch">
                  {Array.from({ length: 2 }).map((_, index) => (
                    <Card key={`acquirer-skeleton-${index}`} className="p-5 flex flex-col gap-4 h-full">
                      <div className="flex items-center justify-between">
                        <div className="space-y-2">
                          <Skeleton className="h-5 w-32" />
                          <Skeleton className="h-4 w-44" />
                        </div>
                        <Skeleton className="h-6 w-24 rounded-full" />
                      </div>
                      <div className="space-y-2">
                        <Skeleton className="h-3 w-28" />
                        <div className="space-y-1.5">
                          {Array.from({ length: 2 }).map((_, itemIndex) => (
                            <div key={`method-skeleton-${itemIndex}`} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5">
                              <Skeleton className="h-8 w-8 rounded-md" />
                              <div className="space-y-1.5">
                                <Skeleton className="h-4 w-24" />
                                <Skeleton className="h-3 w-32" />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                      <Skeleton className="mt-auto h-10 w-full rounded-md" />
                    </Card>
                  ))}
                </div>
              </>
            ) : (
              <>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-foreground">Adquirentes ativas</h2>
              <Badge variant="secondary" className="text-[10px] px-2 py-0.5">
                {activeAcquirersCount}
              </Badge>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-stretch">
              <div className="relative h-full">
                <Badge className="absolute -top-3 left-4 z-10 bg-primary text-primary-foreground text-[10px] px-2 py-0.5">
                  Recomendado
                </Badge>
                <KipayCard
                  backendStatus={statusMap.get("KIPAY")}
                  onOverviewChange={loadOverview}
                />
              </div>
              <MercadoPagoCard
                backendStatus={statusMap.get("MERCADO PAGO")}
                onOverviewChange={loadOverview}
              />
            </div>

            <Accordion type="single" collapsible className="rounded-lg border border-border bg-card">
              <AccordionItem value="available" className="border-b-0">
                <AccordionTrigger className="px-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">Disponíveis para ativação</span>
                    <Badge variant="secondary" className="text-[10px] px-2 py-0.5">
                      {availableForActivation.length}
                    </Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-4">
                  <p className="text-xs text-muted-foreground mb-4">
                    Como ativar: para habilitar qualquer uma dessas adquirentes, entre em contato com o suporte.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {availableForActivation.map((acq) => (
                      <Card
                        key={acq.acquirer_name}
                        className="p-5 flex flex-col gap-4 border-dashed bg-muted/20 opacity-80"
                      >
                        <div>
                          <h3 className="text-base font-bold text-card-foreground">{acq.acquirer_name}</h3>
                          <p className="text-xs text-muted-foreground mt-1">{acq.description}</p>
                        </div>
                        <div className="space-y-2">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Métodos de pagamento
                          </p>
                          <div className="space-y-1.5">
                            {acq.methods_supported.map((method) => (
                              <div
                                key={method}
                                className="flex items-center gap-3 rounded-lg border border-border bg-background/40 px-3 py-2.5"
                              >
                                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
                                  {METHOD_ICONS[method]}
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-card-foreground">{method}</p>
                                  <p className="text-[11px] text-muted-foreground">Disponível mediante ativação</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                        <Button variant="outline" className="mt-auto w-full">
                          Contatar suporte para ativar
                        </Button>
                      </Card>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
              </>
            )}
          </div>
        </TabsContent>

        <TabsContent value="methods">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
            {paymentMethods.map((method) => {
              const methodOverview = methodMap.get(method.methodLabel);
              const isSaving = savingMethod === method.methodLabel;
              const hasChanges = selectedAcquirers[method.methodLabel] !== savedAcquirers[method.methodLabel];
              const currentStatus = getMethodAcquirerStatus(method.methodLabel);
              const eligibleAcquirers = getEligibleAcquirers(method.methodLabel);
              const currentOption = (methodOverview?.options || []).find(
                (option) => normalizeAcquirerName(option.acquirer_name) === normalizeAcquirerName(selectedAcquirers[method.methodLabel])
              );
              const currentSelection = selectedAcquirers[method.methodLabel] || "none";
              const currentConfigured = !!(savedAcquirers[method.methodLabel] && savedAcquirers[method.methodLabel] !== "none");
              const canApply = currentSelection === "none" || !!currentOption?.selectable;
              const helperText =
                currentSelection !== "none" && currentOption && !currentOption.selectable
                  ? currentOption.reason
                  : currentStatus?.status === "connected"
                    ? `Ativa: ${savedAcquirers[method.methodLabel]}`
                    : currentStatus?.reason
                      ? `Configuração atual exige atenção: ${currentStatus.reason}`
                      : eligibleAcquirers.length > 0
                        ? "Selecione uma adquirente conectada para este método."
                        : "Nenhuma adquirente conectada suporta este método no momento.";

              return (
                <Card key={method.name} className="p-5 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
                        {method.icon}
                      </div>
                      <h3 className="text-sm font-bold text-card-foreground">{method.name}</h3>
                    </div>

                    {currentStatus?.status === "connected" && (
                      <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-emerald-500/20" title="Adquirente conectada" />
                    )}
                    {currentStatus?.status === "inactive" && (
                      <span className="h-2.5 w-2.5 rounded-full bg-yellow-500 ring-2 ring-yellow-500/20" title="Adquirente inativa" />
                    )}
                    {currentStatus?.status === "pending_test" && (
                      <span className="h-2.5 w-2.5 rounded-full bg-yellow-500 ring-2 ring-yellow-500/20" title="Teste de conexão pendente" />
                    )}
                    {(currentStatus?.status === "not_configured" || currentStatus?.status === "test_failed") && (
                      <span className="h-2.5 w-2.5 rounded-full bg-destructive ring-2 ring-destructive/20" title="Adquirente não configurada" />
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground">Adquirente</label>
                    <Select
                      value={currentSelection}
                      onValueChange={(value) =>
                        setSelectedAcquirers((prev) => ({ ...prev, [method.methodLabel]: value }))
                      }
                      disabled={loadingOverview || isSaving || eligibleAcquirers.length === 0}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={eligibleAcquirers.length > 0 ? "Selecione..." : "Nenhuma disponível"} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Selecione</SelectItem>
                        {(methodOverview?.options || []).map((option) => (
                          <SelectItem
                            key={option.acquirer_name}
                            value={option.acquirer_name}
                            disabled={!option.selectable}
                          >
                            <div className="flex flex-col">
                              <span>{option.acquirer_name}</span>
                              {!option.selectable && (
                                <span className="text-[11px] text-muted-foreground">{option.reason}</span>
                              )}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p
                      className={`text-[11px] ${
                        currentSelection !== "none" && currentOption && !currentOption.selectable
                          ? "text-destructive"
                          : "text-muted-foreground"
                      }`}
                    >
                      {helperText}
                    </p>
                  </div>

                  <Button
                    className="w-full"
                    onClick={() => handleApply(method.methodLabel)}
                    disabled={isSaving || !hasChanges || !canApply || (eligibleAcquirers.length === 0 && !currentConfigured)}
                  >
                    {isSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                    {hasChanges ? "Aplicar alteração" : currentConfigured ? "Sem alterações" : "Selecione uma adquirente"}
                  </Button>

                  {currentConfigured && currentStatus?.status === "connected" && (
                    <p className="text-xs text-muted-foreground">
                      Ativa: <span className="font-medium text-foreground">{savedAcquirers[method.methodLabel]}</span>
                    </p>
                  )}
                </Card>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>
    </PageContent>
  );
};

export default AdminAcquirers;
