import { useEffect, useState } from "react";
import PageContent from "@/components/layout/PageContent";
import { usePageMeta } from "@/contexts/PageMetaContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Bug,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileText,
  LoaderCircle,
  Mail,
  RefreshCw,
  Rocket,
  ServerCog,
  TrendingUp,
  TerminalSquare,
  Wrench,
  CircleDot,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { formatDatePtBr, formatDateTimeWithAtPtBr } from "@/lib/timezone";

type UpdateJob = {
  id: string;
  product_key: string;
  target_version: string;
  status: "queued" | "running" | "success" | "failed" | "canceled";
  attempts: number;
  max_attempts: number;
  created_at?: string;
  started_at?: string | null;
  finished_at?: string | null;
  last_error?: string | null;
};

type UpdateJobDetails = UpdateJob & { log?: string | null };

type AvailableRelease = {
  version: string;
  notes?: string | null;
  severity?: "low" | "normal" | "high" | "critical" | null;
  breaking?: boolean | null;
  min_version?: string | null;
  changelog?: string[] | null;
  created_at?: string;
};

type ChangelogKind = "feature" | "improvement" | "fix" | "ops" | "smtp";

type ChangelogItem = {
  id: string;
  title: string;
  description: string;
  publishedAt: string;
  kind: ChangelogKind;
  importance: "high" | "medium" | "normal";
};

type ChangelogVersion = {
  version: string;
  subtitle: string;
  items: ChangelogItem[];
};

const changelogKindConfig: Record<
  ChangelogKind,
  {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    accent: string;
    badgeClassName: string;
    iconClassName: string;
  }
> = {
  feature: {
    label: "Nova funcionalidade",
    icon: Rocket,
    accent: "from-sky-500/18 via-sky-500/6 to-transparent",
    badgeClassName: "border-sky-500/30 bg-sky-500/12 text-sky-300",
    iconClassName: "text-sky-300",
  },
  improvement: {
    label: "Melhoria",
    icon: TrendingUp,
    accent: "from-emerald-500/18 via-emerald-500/6 to-transparent",
    badgeClassName: "border-emerald-500/30 bg-emerald-500/12 text-emerald-300",
    iconClassName: "text-emerald-300",
  },
  fix: {
    label: "Correcao",
    icon: Bug,
    accent: "from-amber-500/18 via-amber-500/6 to-transparent",
    badgeClassName: "border-amber-500/30 bg-amber-500/12 text-amber-300",
    iconClassName: "text-amber-300",
  },
  ops: {
    label: "Infraestrutura",
    icon: ServerCog,
    accent: "from-violet-500/18 via-violet-500/6 to-transparent",
    badgeClassName: "border-violet-500/30 bg-violet-500/12 text-violet-300",
    iconClassName: "text-violet-300",
  },
  smtp: {
    label: "SMTP",
    icon: Mail,
    accent: "from-rose-500/18 via-rose-500/6 to-transparent",
    badgeClassName: "border-rose-500/30 bg-rose-500/12 text-rose-300",
    iconClassName: "text-rose-300",
  },
};

const changelogTimeline: ChangelogVersion[] = [
  {
    version: "v1.1.4",
    subtitle: "",
    items: [
      {
        id: "job-details-label-fix",
        title: "Correcao de erro ao abrir detalhes do job",
        description:
          "Foi corrigida uma falha no frontend da tela de updates que podia derrubar a pagina ao abrir os detalhes de uma versao aplicada.",
        publishedAt: "2026-03-17T06:20:00.000Z",
        kind: "fix",
        importance: "high",
      },
      {
        id: "updates-operacional",
        title: "Atualizacoes server-side ficaram mais operacionais",
        description:
          "A pagina de updates agora oferece acompanhamento mais claro do job, incluindo detalhes da execucao, log incremental e acoes diretas sem depender do terminal.",
        publishedAt: "2026-03-16T13:10:00.000Z",
        kind: "feature",
        importance: "high",
      },
      {
        id: "cancelamento-jobs",
        title: "Cancelamento de jobs presos ou em execucao",
        description:
          "Foi adicionado suporte a cancelamento de jobs de update, reduzindo a necessidade de intervencao manual na VPS quando uma tentativa trava ou precisa ser interrompida.",
        publishedAt: "2026-03-16T13:18:00.000Z",
        kind: "improvement",
        importance: "high",
      },
      {
        id: "worker-split",
        title: "Split entre worker de email e runner de updates",
        description:
          "A stack do cliente agora separa melhor o envio de emails do processamento de updates, deixando a operacao mais previsivel e reduzindo conflitos entre filas.",
        publishedAt: "2026-03-16T13:26:00.000Z",
        kind: "ops",
        importance: "high",
      },
      {
        id: "runner-default",
        title: "Runner de updates habilitado por padrao",
        description:
          "A instalacao do cliente passou a sair pronta para consumir jobs de update sem exigir habilitacao manual posterior.",
        publishedAt: "2026-03-16T13:34:00.000Z",
        kind: "ops",
        importance: "medium",
      },
      {
        id: "tls-topology",
        title: "Instalacao e update respeitam melhor a topologia da VPS",
        description:
          "Foram corrigidos cenarios em que a plataforma podia tentar subir proxy ou TLS errados em servidores que usam Nginx no host ou ja passaram por reinstalacoes anteriores.",
        publishedAt: "2026-03-16T13:42:00.000Z",
        kind: "fix",
        importance: "high",
      },
      {
        id: "stale-upstream",
        title: "Correcao de falhas por upstream antigo da API",
        description:
          "O fluxo de update/reinstall ficou mais robusto contra estados em que o frontend permanecia apontando para um endereco antigo da API, causando erro 502.",
        publishedAt: "2026-03-16T13:48:00.000Z",
        kind: "fix",
        importance: "high",
      },
      {
        id: "smtp-feedback",
        title: "Validacao de SMTP mais clara",
        description:
          "A plataforma passou a expor melhor erros de configuracao SMTP e o worker de email foi endurecido para subir de forma mais previsivel na instancia do cliente.",
        publishedAt: "2026-03-16T13:56:00.000Z",
        kind: "smtp",
        importance: "medium",
      },
      {
        id: "release-list",
        title: "Experiencia visual da tela de updates refinada",
        description:
          "A tela ficou mais organizada, com melhor leitura da versao atual, das releases disponiveis e do estado operacional da instalacao.",
        publishedAt: "2026-03-16T14:04:00.000Z",
        kind: "improvement",
        importance: "normal",
      },
    ],
  },
];

const jobStatusConfig: Record<
  UpdateJob["status"],
  {
    label: string;
    badgeVariant: "default" | "secondary" | "outline" | "destructive";
    icon: React.ComponentType<{ className?: string }>;
    hint: string;
  }
> = {
  queued: {
    label: "Na fila",
    badgeVariant: "secondary",
    icon: CircleDot,
    hint: "Aguardando o runner consumir o job.",
  },
  running: {
    label: "Executando",
    badgeVariant: "default",
    icon: LoaderCircle,
    hint: "Aplicando a release no servidor agora.",
  },
  success: {
    label: "Concluída",
    badgeVariant: "outline",
    icon: CircleDot,
    hint: "Release aplicada com sucesso.",
  },
  failed: {
    label: "Falhou",
    badgeVariant: "destructive",
    icon: XCircle,
    hint: "O job terminou com erro.",
  },
  canceled: {
    label: "Cancelada",
    badgeVariant: "outline",
    icon: XCircle,
    hint: "Execução interrompida manualmente.",
  },
};

const isActiveJob = (job?: Pick<UpdateJob, "status"> | null) => job?.status === "queued" || job?.status === "running";

const formatJobTimestamp = (value?: string | null) => (value ? formatDatePtBr(value) : "—");

const AdminUpdates = () => {
  const [configured, setConfigured] = useState(false);
  const [tokenSetAt, setTokenSetAt] = useState<string | null>(null);
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  const [updateTokenInput, setUpdateTokenInput] = useState("");
  const [showUpdateToken, setShowUpdateToken] = useState(false);
  const [checking, setChecking] = useState(false);
  const [releases, setReleases] = useState<AvailableRelease[]>([]);
  const [jobs, setJobs] = useState<UpdateJob[]>([]);
  const [applyingVersion, setApplyingVersion] = useState<string | null>(null);
  const [cancelingJobId, setCancelingJobId] = useState<string | null>(null);

  const [jobDetailsOpen, setJobDetailsOpen] = useState(false);
  const [jobDetailsLoading, setJobDetailsLoading] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [jobDetails, setJobDetails] = useState<UpdateJobDetails | null>(null);

  usePageMeta([{ label: "Admin", path: "/admin" }, { label: "Atualizações" }], "Atualizações & Changelog");

  useEffect(() => {
    const loadStatus = async () => {
      try {
        const res = await fetch("/api/admin/updates/status", { credentials: "include" });
        const payload = await res.json().catch(() => ({}));
        if (res.ok && payload?.ok === true) {
          setConfigured(Boolean(payload.configured));
          setTokenSetAt(payload.tokenSetAt || null);
          setCurrentVersion(payload.currentVersion || null);
        }
      } catch {
        // ignore
      }
    };
    void loadStatus();
  }, []);

  const loadJobs = async () => {
    try {
      const res = await fetch("/api/admin/updates/jobs", { credentials: "include" });
      const payload = await res.json().catch(() => ({}));
      if (res.ok && payload?.ok === true) {
        setJobs(payload.jobs || []);
      }
    } catch {
      // ignore
    }
  };

  const loadJobDetails = async (jobId: string, options?: { silent?: boolean }) => {
    const silent = Boolean(options?.silent);
    if (!silent) {
      setJobDetailsLoading(true);
      setJobDetails(null);
    }

    try {
      const res = await fetch(`/api/admin/updates/jobs/${jobId}`, { credentials: "include" });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || payload?.ok !== true) throw new Error(payload?.error || "Falha ao carregar detalhes do job");
      setJobDetails(payload.job || null);
    } catch (e: any) {
      if (!silent) {
        toast.error(e?.message || "Erro ao carregar detalhes do job");
      }
    } finally {
      if (!silent) setJobDetailsLoading(false);
    }
  };

  useEffect(() => {
    void loadJobs();
  }, []);

  useEffect(() => {
    if (!jobs.some((job) => isActiveJob(job))) return;
    const intervalId = window.setInterval(() => {
      void loadJobs();
    }, 2500);
    return () => window.clearInterval(intervalId);
  }, [jobs]);

  useEffect(() => {
    if (!jobDetailsOpen || !selectedJobId) return;
    const currentJob = jobDetails?.id === selectedJobId ? jobDetails : jobs.find((job) => job.id === selectedJobId);
    if (!isActiveJob(currentJob || null)) return;

    const intervalId = window.setInterval(() => {
      void loadJobs();
      void loadJobDetails(selectedJobId, { silent: true });
    }, 2500);
    return () => window.clearInterval(intervalId);
  }, [jobDetailsOpen, selectedJobId, jobDetails, jobs]);

  const handleSaveToken = async () => {
    const token = updateTokenInput.trim();
    if (!token) {
      toast.error("Informe seu token de atualização.");
      return;
    }
    try {
      const res = await fetch("/api/admin/updates/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || payload?.ok !== true) throw new Error(payload?.error || "Falha ao salvar token");
      setUpdateTokenInput("");
      setShowUpdateToken(false);
      setConfigured(true);
      setTokenSetAt(new Date().toISOString());
      toast.success("Token salvo com sucesso.");
    } catch (e: any) {
      toast.error(e?.message || "Erro ao salvar token");
    }
  };

  const handleClearToken = async () => {
    try {
      const res = await fetch("/api/admin/updates/token", { method: "DELETE", credentials: "include" });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || payload?.ok !== true) throw new Error(payload?.error || "Falha ao remover token");
      setConfigured(false);
      setTokenSetAt(null);
      setReleases([]);
      toast.success("Token removido.");
    } catch (e: any) {
      toast.error(e?.message || "Erro ao remover token");
    }
  };

  const handleCheckUpdates = async () => {
    if (!configured) {
      toast.error("Configure o token de atualização primeiro.");
      return;
    }
    setChecking(true);
    try {
      const res = await fetch("/api/admin/updates/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ productKey: "dingitalpay-platform" }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || payload?.ok !== true) throw new Error(payload?.error || "Falha ao buscar atualizações");
      setReleases(payload.releases || []);
      toast.success("Atualizações carregadas.");
    } catch (e: any) {
      toast.error(e?.message || "Erro ao buscar atualizações");
    } finally {
      setChecking(false);
    }
  };

  const copyUpdateCommand = async (version: string) => {
    const command = `sudo dingitalpay-updater apply --version ${version}`;
    try {
      await navigator.clipboard.writeText(command);
      toast.success("Comando copiado.");
    } catch {
      toast.error("Não foi possível copiar o comando.");
    }
  };

  const handleApplyUpdate = async (version: string) => {
    if (!configured) {
      toast.error("Configure o token de atualização primeiro.");
      return;
    }

    setApplyingVersion(version);
    try {
      const res = await fetch("/api/admin/updates/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ productKey: "dingitalpay-platform", version }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || payload?.ok !== true) throw new Error(payload?.error || "Falha ao enfileirar atualização");

      await loadJobs();
      toast.success(payload?.message || "Atualização enfileirada.");

      if (payload?.job?.id) {
        setSelectedJobId(payload.job.id);
        setJobDetailsOpen(true);
        await loadJobDetails(payload.job.id);
      }

    } catch (e: any) {
      if (e?.message === "runner_disabled") {
        toast.error("Execucao server-side indisponivel nesta instancia.");
      } else {
        toast.error(e?.message || "Erro ao aplicar atualização");
      }
    } finally {
      setApplyingVersion(null);
    }
  };

  const handleCancelJob = async (jobId: string) => {
    setCancelingJobId(jobId);
    try {
      const res = await fetch(`/api/admin/updates/jobs/${jobId}/cancel`, {
        method: "POST",
        credentials: "include",
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || payload?.ok !== true) throw new Error(payload?.error || "Falha ao cancelar job");
      await loadJobs();
      if (selectedJobId === jobId) {
        await loadJobDetails(jobId);
      }
      toast.success(payload?.message || "Job cancelado.");
    } catch (e: any) {
      toast.error(e?.message || "Erro ao cancelar job");
    } finally {
      setCancelingJobId(null);
    }
  };

  const openJobDetails = async (jobId: string) => {
    setSelectedJobId(jobId);
    setJobDetailsOpen(true);
    await loadJobDetails(jobId);
  };

  const copyJobLog = async () => {
    const logText = String(jobDetails?.log || "").trim();
    if (!logText) {
      toast.error("Sem log para copiar.");
      return;
    }
    try {
      await navigator.clipboard.writeText(logText);
      toast.success("Log copiado.");
    } catch {
      toast.error("Não foi possível copiar o log.");
    }
  };

  const jobForVersion = (version: string) => jobs.find((job) => job.target_version === version);
  const activeJobsCount = jobs.filter((job) => isActiveJob(job)).length;
  const latestJob = jobs[0] || null;

  return (
    <PageContent>
      <Card className="mb-6 overflow-hidden">
        <CardHeader className="border-b border-border/70 bg-gradient-to-r from-background via-background to-primary/5 pb-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-primary/20 bg-primary/10">
                  <Download className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-foreground">Atualizações do sistema</h2>
                </div>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-3 xl:min-w-[420px]">
              <div className="rounded-xl border border-border/70 bg-background/80 px-3 py-2">
                <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Token</p>
                <p className="mt-1 text-sm font-medium text-foreground">{configured ? "Configurado" : "Pendente"}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">{tokenSetAt ? formatDatePtBr(tokenSetAt) : "Sem registro"}</p>
              </div>
              <div className="rounded-xl border border-border/70 bg-background/80 px-3 py-2">
                <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Versao atual</p>
                <p className="mt-1 text-sm font-medium text-foreground">{currentVersion || "—"}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Plataforma instalada no momento.
                </p>
              </div>
              <div className="rounded-xl border border-border/70 bg-background/80 px-3 py-2">
                <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Jobs ativos</p>
                <p className="mt-1 text-sm font-medium text-foreground">{activeJobsCount}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {latestJob ? `Último status: ${jobStatusConfig[latestJob.status].label}` : "Nenhum job recente."}
                </p>
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4 pt-5">
          <div className="flex flex-col gap-2 lg:flex-row">
            <div className="relative flex-1">
              <Input
                value={updateTokenInput}
                onChange={(event) => setUpdateTokenInput(event.target.value)}
                placeholder={configured ? "Token já configurado. Cole um novo para substituir." : "Token de atualização"}
                type={showUpdateToken ? "text" : "password"}
              />
              <button
                type="button"
                onClick={() => setShowUpdateToken((value) => !value)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label={showUpdateToken ? "Ocultar token" : "Mostrar token"}
                title={showUpdateToken ? "Ocultar token" : "Mostrar token"}
              >
                {showUpdateToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <Button onClick={handleSaveToken} variant="outline" className="lg:min-w-[140px]">
              Salvar token
            </Button>
            <Button onClick={handleCheckUpdates} disabled={checking} className="lg:min-w-[180px]">
              {checking ? "Buscando..." : "Buscar atualizações"}
            </Button>
          </div>
          {configured && (
            <div className="flex justify-start lg:justify-end">
              <Button variant="ghost" size="sm" onClick={handleClearToken}>
                Remover token
              </Button>
            </div>
          )}

          {releases.length > 0 && (
            <div className="rounded-2xl border border-border/70 bg-background/60">
              {releases.map((release, index) => {
                const relatedJob = jobForVersion(release.version);
                const jobStatus = relatedJob ? jobStatusConfig[relatedJob.status] : null;
                const active = isActiveJob(relatedJob);
                const JobStatusIcon = jobStatus?.icon;

                return (
                  <div
                    key={release.version}
                    className={`grid gap-4 px-4 py-4 xl:grid-cols-[minmax(0,1fr)_auto] ${index !== releases.length - 1 ? "border-b border-border/70" : ""}`}
                  >
                    <div className="min-w-0 space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-lg font-semibold text-foreground">{release.version}</p>
                        {release.breaking && (
                          <Badge variant="destructive" className="text-[10px]">
                            Breaking
                          </Badge>
                        )}
                        {jobStatus && (
                          <Badge variant={jobStatus.badgeVariant} className="gap-1.5 text-[10px]">
                            {JobStatusIcon && <JobStatusIcon className={`h-3 w-3 ${relatedJob?.status === "running" ? "animate-spin" : ""}`} />}
                            {jobStatus.label}
                          </Badge>
                        )}
                      </div>

                      {release.notes && <p className="text-sm text-muted-foreground">{release.notes}</p>}

                      <div className="flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground">
                        {release.min_version && <span>Mín. versão: {release.min_version}</span>}
                        {relatedJob?.created_at && <span>Job criado: {formatDatePtBr(relatedJob.created_at)}</span>}
                        {relatedJob?.started_at && <span>Início: {formatDatePtBr(relatedJob.started_at)}</span>}
                        {relatedJob?.finished_at && <span>Fim: {formatDatePtBr(relatedJob.finished_at)}</span>}
                      </div>

                      {relatedJob && (
                        <div className="rounded-xl border border-border/70 bg-muted/20 px-3 py-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Job atual</p>
                            <Badge variant={jobStatus!.badgeVariant} className="gap-1.5 text-[10px]">
                              {JobStatusIcon && <JobStatusIcon className={`h-3 w-3 ${relatedJob.status === "running" ? "animate-spin" : ""}`} />}
                              {jobStatus!.label}
                            </Badge>
                          </div>
                          <p className="mt-2 text-sm text-foreground">{jobStatus!.hint}</p>
                          {relatedJob.last_error && (
                            <p className="mt-2 text-xs text-destructive">
                              Motivo operacional: {relatedJob.last_error}
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => handleApplyUpdate(release.version)}
                        disabled={Boolean(applyingVersion) || active}
                        className="min-w-[110px]"
                        title="Aplicar no servidor"
                      >
                        {applyingVersion === release.version ? "Enfileirando..." : "Aplicar"}
                      </Button>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => (relatedJob ? void openJobDetails(relatedJob.id) : toast.message("Sem job nessa release ainda."))}
                        className="gap-2"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        Detalhes
                      </Button>

                      {relatedJob && active && (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleCancelJob(relatedJob.id)}
                          disabled={cancelingJobId === relatedJob.id}
                          className="gap-2"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          {cancelingJobId === relatedJob.id ? "Cancelando..." : "Cancelar"}
                        </Button>
                      )}

                      <Button variant="outline" size="sm" onClick={() => copyUpdateCommand(release.version)} className="gap-2">
                        <TerminalSquare className="h-3.5 w-3.5" />
                        CLI
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mb-6 overflow-hidden">
        <CardHeader className="border-b border-border/70 bg-gradient-to-r from-background via-background to-emerald-500/5 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10">
              <Wrench className="h-4.5 w-4.5 text-emerald-300" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">Changelogs</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Linha do tempo das mudancas mais importantes aplicadas na versao atual da plataforma.
              </p>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6 pt-5">
          {changelogTimeline.map((releaseGroup) => (
            <section key={releaseGroup.version} className="space-y-4">
              <div className="flex flex-col gap-2 rounded-2xl border border-border/70 bg-background/60 px-4 py-4 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="text-xl font-semibold text-foreground">{releaseGroup.version}</p>
                  {releaseGroup.subtitle ? <p className="mt-1 text-sm text-muted-foreground">{releaseGroup.subtitle}</p> : null}
                </div>
                <Badge variant="outline" className="w-fit border-border/70 bg-background/80 text-muted-foreground">
                  {releaseGroup.items.length} itens publicados
                </Badge>
              </div>

              <div className="relative pl-5 md:pl-7">
                <div className="absolute left-[7px] top-1 bottom-1 w-px bg-border/80 md:left-[11px]" />
                <div className="space-y-4">
                  {releaseGroup.items.map((item) => {
                    const config = changelogKindConfig[item.kind];
                    const ItemIcon = config.icon;

                    return (
                      <div key={item.id} className="relative">
                        <span className="absolute -left-5 top-6 flex h-4 w-4 items-center justify-center rounded-full border border-border bg-background md:-left-7">
                          <span className={`h-2 w-2 rounded-full ${item.importance === "high" ? "bg-primary" : item.importance === "medium" ? "bg-emerald-400" : "bg-muted-foreground/60"}`} />
                        </span>

                        <div className={`overflow-hidden rounded-2xl border border-border/70 bg-gradient-to-r ${config.accent}`}>
                          <div className="bg-background/90 px-4 py-4">
                            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-start gap-3">
                                  <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-background/80">
                                    <ItemIcon className={`h-4.5 w-4.5 ${config.iconClassName}`} />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <h3 className="text-sm font-semibold text-foreground">{item.title}</h3>
                                      <Badge className={config.badgeClassName}>{config.label}</Badge>
                                    </div>
                                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.description}</p>
                                  </div>
                                </div>
                              </div>

                              <div className="xl:w-[190px] xl:text-right">
                                <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Publicado em</p>
                                <p className="mt-2 text-sm font-medium text-foreground">{formatDateTimeWithAtPtBr(item.publishedAt)}</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          ))}
        </CardContent>
      </Card>

      <Sheet
        open={jobDetailsOpen}
        onOpenChange={(open) => {
          setJobDetailsOpen(open);
          if (!open) {
            setSelectedJobId(null);
            setJobDetails(null);
          }
        }}
      >
        <SheetContent className="overflow-y-auto border-l border-border/70 bg-background sm:max-w-2xl">
          <SheetHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <SheetTitle>Detalhes do job</SheetTitle>
                <SheetDescription>
                  Estado operacional do update no servidor. Enquanto o job estiver ativo, os detalhes e o log são atualizados automaticamente.
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>

          <div className="mt-6 space-y-4">
            {jobDetailsLoading && <p className="text-sm text-muted-foreground">Carregando detalhes do job...</p>}
            {!jobDetailsLoading && !jobDetails && <p className="text-sm text-muted-foreground">Nenhum detalhe disponível.</p>}

            {!jobDetailsLoading && jobDetails && (() => {
              const JobDetailsStatusIcon = jobStatusConfig[jobDetails.status].icon;
              return (
                <>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Versão</p>
                    <p className="mt-2 text-lg font-semibold text-foreground">{jobDetails.target_version}</p>
                  </div>
                  <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Status</p>
                    <div className="mt-2 flex items-center gap-2">
                      <Badge variant={jobStatusConfig[jobDetails.status].badgeVariant} className="gap-1.5">
                        <JobDetailsStatusIcon className={`h-3.5 w-3.5 ${jobDetails.status === "running" ? "animate-spin" : ""}`} />
                        {jobStatusConfig[jobDetails.status].label}
                      </Badge>
                      <span className="text-sm text-muted-foreground">{jobStatusConfig[jobDetails.status].hint}</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => selectedJobId && loadJobDetails(selectedJobId)}
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Atualizar agora
                  </Button>
                  {isActiveJob(jobDetails) && (
                    <Button
                      variant="destructive"
                      size="sm"
                      className="gap-2"
                      onClick={() => handleCancelJob(jobDetails.id)}
                      disabled={cancelingJobId === jobDetails.id}
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      {cancelingJobId === jobDetails.id ? "Cancelando..." : "Cancelar job"}
                    </Button>
                  )}
                  <Button variant="outline" size="sm" className="gap-2" onClick={copyJobLog} disabled={!String(jobDetails.log || "").trim()}>
                    <Copy className="h-3.5 w-3.5" />
                    Copiar log
                  </Button>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl border border-border/70 p-4">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Linha do tempo</p>
                    <div className="mt-3 space-y-2 text-sm text-foreground">
                      <p><span className="text-muted-foreground">Criado em:</span> {formatJobTimestamp(jobDetails.created_at)}</p>
                      <p><span className="text-muted-foreground">Iniciado em:</span> {formatJobTimestamp(jobDetails.started_at)}</p>
                      <p><span className="text-muted-foreground">Finalizado em:</span> {formatJobTimestamp(jobDetails.finished_at)}</p>
                      <p><span className="text-muted-foreground">Tentativas:</span> {jobDetails.attempts}/{jobDetails.max_attempts}</p>
                    </div>
                  </div>
                  <div className="rounded-xl border border-border/70 p-4">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Diagnóstico</p>
                    <div className="mt-3 space-y-2 text-sm">
                      <p className="text-foreground">{jobStatusConfig[jobDetails.status].hint}</p>
                      {jobDetails.last_error ? (
                        <p className="text-destructive">{jobDetails.last_error}</p>
                      ) : (
                        <p className="text-muted-foreground">Sem erro registrado até agora.</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <Label>Log em tempo real</Label>
                      <p className="text-xs text-muted-foreground">
                        O conteúdo abaixo é atualizado automaticamente enquanto o job estiver em fila ou em execução.
                      </p>
                    </div>
                    {isActiveJob(jobDetails) && (
                      <Badge variant="default" className="gap-1.5">
                        <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                        Ao vivo
                      </Badge>
                    )}
                  </div>
                  <div className="max-h-[52vh] overflow-auto rounded-2xl border border-border/70 bg-[#05070b] p-4">
                    <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-6 text-slate-200">
                      {String(jobDetails.log || "").trim() || "Ainda sem saída do runner para este job."}
                    </pre>
                  </div>
                </div>
                </>
              );
            })()}
          </div>
        </SheetContent>
      </Sheet>
    </PageContent>
  );
};

export default AdminUpdates;
