import { useState, useEffect, useCallback, useRef } from "react";
import PageContent from "@/components/layout/PageContent";
import { usePageMeta } from "@/contexts/PageMetaContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import DataTable, { DataTableColumn } from "@/components/shared/DataTable";
import FilterBar from "@/components/shared/FilterBar";
import StatCard from "@/components/shared/StatCard";
import FileUploader from "@/components/shared/FileUploader";
import LoadingState from "@/components/shared/LoadingState";
import { Plus, Trophy, Gift, Clock, Send, Package, Award, Upload, X } from "lucide-react";
import { getRewards, getRewardClaims, createReward, updateReward, deleteReward, markRewardClaimSent } from "@/services/admin.service";
import type { Reward, RewardClaim, RewardType } from "@/types/api";
import { toast } from "sonner";
import { formatDatePtBr } from "@/lib/timezone";
import { maskCurrency, unmaskCurrency } from "@/lib/masks";
import { supabase } from "@/integrations/supabase/client";

const formatCurrency = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const DEFAULT_REWARD_IMAGE = "/placeholder.svg";

const AdminAchievements = () => {
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [claims, setClaims] = useState<RewardClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [claimSearch, setClaimSearch] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editReward, setEditReward] = useState<Reward | null>(null);
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formMinRevenue, setFormMinRevenue] = useState("");
  const [formMaxRevenue, setFormMaxRevenue] = useState("");
  const [formType, setFormType] = useState<RewardType>("congratulation");
  const [formDeliveryInstructions, setFormDeliveryInstructions] = useState("");
  const [formActive, setFormActive] = useState(true);
  const [formImageUrl, setFormImageUrl] = useState(DEFAULT_REWARD_IMAGE);
  const [uploadingImage, setUploadingImage] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [r, c] = await Promise.all([getRewards(), getRewardClaims()]);
        setRewards(r);
        setClaims(c);
      } catch {}
      setLoading(false);
    };
    load();
  }, []);

  const reload = async () => {
    const [r, c] = await Promise.all([getRewards(), getRewardClaims()]);
    setRewards(r);
    setClaims(c);
  };

  const openCreate = () => {
    setEditReward(null);
    setFormName(""); setFormDescription(""); setFormMinRevenue(""); setFormMaxRevenue("");
    setFormType("congratulation"); setFormDeliveryInstructions(""); setFormActive(true);
    setFormImageUrl(DEFAULT_REWARD_IMAGE);
    setSheetOpen(true);
  };

  const openEdit = (r: Reward) => {
    setEditReward(r);
    setFormName(r.name); setFormDescription(r.description);
    setFormMinRevenue(maskCurrency(String(Math.round(r.minRevenue * 100)))); setFormMaxRevenue(maskCurrency(String(Math.round(r.maxRevenue * 100))));
    setFormType(r.type); setFormDeliveryInstructions(r.deliveryInstructions || "");
    setFormActive(r.status === "active");
    setFormImageUrl(r.imageUrl || DEFAULT_REWARD_IMAGE);
    setSheetOpen(true);
  };

  const handleRejectUpload = useCallback((rejected: Array<{ file: File; reason: "size" }>) => {
    const names = rejected.map((entry) => entry.file.name).slice(0, 3).join(", ");
    toast.error(`Arquivo muito grande. Máx. 2MB. Rejeitado: ${names}${rejected.length > 3 ? "..." : ""}`);
  }, []);

  const handleImageUpload = useCallback(async (files: File[]) => {
    if (!files.length) return;
    const file = files[0];
    const ext = String(file.name.split(".").pop() || "png").toLowerCase();
    const safeExt = ext.replace(/[^a-z0-9]+/g, "").slice(0, 8) || "png";
    const objectPath = `branding/rewards/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${safeExt}`;

    setUploadingImage(true);
    try {
      if (formImageUrl) {
        try {
          const current = new URL(formImageUrl);
          const marker = "/api/storage/public/platform-assets/";
          const idx = current.pathname.indexOf(marker);
          if (idx !== -1) {
            const raw = current.pathname.slice(idx + marker.length);
            const prevPath = decodeURIComponent(raw);
            if (prevPath) {
              await supabase.storage.from("platform-assets").remove([prevPath]);
            }
          }
        } catch {
          // Ignore external/legacy URLs that are not served by our storage path.
        }
      }

      const { error } = await supabase.storage.from("platform-assets").upload(objectPath, file, { upsert: true });
      if (error) throw error;

      const { data } = supabase.storage.from("platform-assets").getPublicUrl(objectPath);
      setFormImageUrl(data.publicUrl);
      toast.success("Imagem enviada com sucesso.");
    } catch (error: any) {
      toast.error(error?.message || "Erro ao enviar imagem.");
    } finally {
      setUploadingImage(false);
    }
  }, [formImageUrl]);

  const handleSave = async () => {
    const data = {
      name: formName, description: formDescription, imageUrl: formImageUrl || DEFAULT_REWARD_IMAGE,
      minRevenue: unmaskCurrency(formMinRevenue), maxRevenue: unmaskCurrency(formMaxRevenue),
      type: formType, deliveryInstructions: formType === "delivery" ? formDeliveryInstructions : undefined,
      status: formActive ? "active" as const : "inactive" as const,
    };
    if (uploadingImage) {
      toast.error("Aguarde o upload da imagem terminar antes de salvar.");
      return;
    }
    try {
      if (editReward) {
        await updateReward(editReward.id, data);
        toast.success("Recompensa atualizada!");
      } else {
        await createReward(data);
        toast.success("Recompensa criada!");
      }
      await reload();
    } catch { toast.error("Erro ao salvar."); }
    setSheetOpen(false);
  };

  const handleDelete = async () => {
    if (!editReward) return;
    try {
      await deleteReward(editReward.id);
      toast.success("Recompensa excluída!");
      await reload();
    } catch { toast.error("Erro ao excluir."); }
    setSheetOpen(false);
  };

  const handleMarkSent = async (claimId: string) => {
    try {
      await markRewardClaimSent(claimId);
      toast.success("Marcado como enviado!");
      await reload();
    } catch { toast.error("Erro ao marcar."); }
  };

  const filteredRewards = rewards.filter((r) => r.name.toLowerCase().includes(search.toLowerCase()));
  const pendingClaims = claims.filter((c) => c.status === "pending" && c.sellerName.toLowerCase().includes(claimSearch.toLowerCase()));
  const sentClaims = claims.filter((c) => c.status === "sent" && c.sellerName.toLowerCase().includes(claimSearch.toLowerCase()));
  const hasCustomImage = Boolean(formImageUrl && formImageUrl !== DEFAULT_REWARD_IMAGE);

  const pendingColumns: DataTableColumn<RewardClaim>[] = [
    { key: "sellerName", header: "Vendedor", render: (row) => <div><p className="text-sm font-medium text-foreground">{row.sellerName}</p></div> },
    { key: "rewardName", header: "Recompensa" },
    { key: "revenueAchieved", header: "Faturamento", render: (row) => <span className="text-sm font-medium">{formatCurrency(row.revenueAchieved)}</span> },
    { key: "claimedAt", header: "Data", render: (row) => <span className="text-sm text-muted-foreground">{formatDatePtBr(row.claimedAt)}</span> },
    { key: "actions", header: "", className: "w-36", render: (row) => <Button size="sm" variant="outline" className="gap-1.5" onClick={() => handleMarkSent(row.id)}><Send className="h-3.5 w-3.5" /> Enviar</Button> },
  ];

  const sentColumns: DataTableColumn<RewardClaim>[] = [
    { key: "sellerName", header: "Vendedor", render: (row) => <p className="text-sm font-medium text-foreground">{row.sellerName}</p> },
    { key: "rewardName", header: "Recompensa" },
    { key: "revenueAchieved", header: "Faturamento", render: (row) => <span className="text-sm font-medium">{formatCurrency(row.revenueAchieved)}</span> },
    { key: "sentAt", header: "Enviado em", render: (row) => <span className="text-sm text-muted-foreground">{row.sentAt ? formatDatePtBr(row.sentAt) : "-"}</span> },
  ];

  usePageMeta([{ label: "Admin", path: "/admin" }, { label: "Recompensas" }], "Recompensas & Premiações");

  if (loading) return <LoadingState />;

  return (
    <PageContent>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard label="Total de Recompensas" value={String(rewards.length)} icon={<Trophy className="h-4 w-4" />} />
        <StatCard label="Vendedores Premiados" value={String(new Set(claims.map((c) => c.sellerName)).size)} icon={<Award className="h-4 w-4" />} />
        <StatCard label="Entregas Pendentes" value={String(pendingClaims.length)} icon={<Package className="h-4 w-4" />} />
      </div>

      <Tabs defaultValue="rewards" className="space-y-4">
        <TabsList>
          <TabsTrigger value="rewards" className="gap-1.5"><Gift className="h-4 w-4" /> Recompensas</TabsTrigger>
          <TabsTrigger value="pending" className="gap-1.5"><Clock className="h-4 w-4" /> Pendentes {pendingClaims.length > 0 && <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">{pendingClaims.length}</Badge>}</TabsTrigger>
          <TabsTrigger value="sent" className="gap-1.5"><Send className="h-4 w-4" /> Enviados</TabsTrigger>
        </TabsList>

        <TabsContent value="rewards">
          <FilterBar searchPlaceholder="Buscar recompensa..." searchValue={search} onSearchChange={setSearch} actions={<Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-1" /> Nova Recompensa</Button>} className="mb-4" />
          {filteredRewards.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">Nenhuma recompensa encontrada.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredRewards.map((r) => (
                <button key={r.id} onClick={() => openEdit(r)} className="group text-left rounded-lg border border-border bg-card p-0 overflow-hidden transition-all hover:shadow-md hover:border-primary/30 focus:outline-none focus:ring-2 focus:ring-ring">
                  <div className="aspect-[16/9] bg-muted flex items-center justify-center"><img src={r.imageUrl} alt={r.name} className="h-full w-full object-cover" /></div>
                  <div className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">{r.name}</h3>
                      <Badge variant={r.type === "delivery" ? "default" : "outline"} className="text-[10px]">{r.type === "delivery" ? "Entrega" : "Parabenização"}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">{r.description}</p>
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-xs font-medium text-muted-foreground">{formatCurrency(r.minRevenue)} – {formatCurrency(r.maxRevenue)}</span>
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${r.status === "active" ? "bg-success/10 text-success border-success/20" : "bg-muted text-muted-foreground border-border"}`}>{r.status === "active" ? "Ativa" : "Inativa"}</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="pending">
          <FilterBar searchPlaceholder="Buscar vendedor..." searchValue={claimSearch} onSearchChange={setClaimSearch} className="mb-4" />
          <DataTable columns={pendingColumns} data={pendingClaims} emptyMessage="Nenhuma entrega pendente." />
        </TabsContent>

        <TabsContent value="sent">
          <FilterBar searchPlaceholder="Buscar vendedor..." searchValue={claimSearch} onSearchChange={setClaimSearch} className="mb-4" />
          <DataTable columns={sentColumns} data={sentClaims} emptyMessage="Nenhuma entrega enviada." />
        </TabsContent>
      </Tabs>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{editReward ? "Editar Recompensa" : "Nova Recompensa"}</SheetTitle>
            <SheetDescription>{editReward ? "Atualize os dados." : "Preencha os dados."}</SheetDescription>
          </SheetHeader>
          <div className="space-y-4 mt-6">
            <div className="space-y-2">
              <Label>Imagem</Label>
              {hasCustomImage ? (
                <>
                  <div className="overflow-hidden rounded-lg border border-border bg-card">
                    <img src={formImageUrl} alt={formName || "Pré-visualização da recompensa"} className="aspect-[16/9] w-full object-cover" />
                  </div>
                  <div className="flex items-center gap-3">
                    <ReplaceImageButton accept="image/*" maxSizeMB={2} label="Substituir imagem" onReject={handleRejectUpload} onChange={handleImageUpload} />
                    <Button type="button" variant="ghost" size="icon" className="text-destructive hover:text-destructive shrink-0" onClick={() => setFormImageUrl(DEFAULT_REWARD_IMAGE)} aria-label="Remover imagem">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </>
              ) : (
                <FileUploader accept="image/*" maxSizeMB={2} onReject={handleRejectUpload} onChange={handleImageUpload} />
              )}
              {uploadingImage ? <p className="text-xs text-muted-foreground">Enviando imagem...</p> : null}
            </div>
            <div className="space-y-2"><Label>Nome</Label><Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Ex: Pulseira Exclusiva" /></div>
            <div className="space-y-2"><Label>Descrição</Label><Textarea value={formDescription} onChange={(e) => setFormDescription(e.target.value)} rows={3} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Fat. Mínimo (R$)</Label>
                <Input inputMode="numeric" placeholder="R$ 0,00" value={formMinRevenue} onChange={(e) => setFormMinRevenue(maskCurrency(e.target.value))} />
              </div>
              <div className="space-y-2">
                <Label>Fat. Máximo (R$)</Label>
                <Input inputMode="numeric" placeholder="R$ 0,00" value={formMaxRevenue} onChange={(e) => setFormMaxRevenue(maskCurrency(e.target.value))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={formType} onValueChange={(v) => setFormType(v as RewardType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="congratulation">Parabenização</SelectItem>
                  <SelectItem value="delivery">Entrega (física)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {formType === "delivery" && (
              <div className="space-y-2"><Label>Instruções de Envio</Label><Textarea value={formDeliveryInstructions} onChange={(e) => setFormDeliveryInstructions(e.target.value)} rows={2} /></div>
            )}
            <div className="flex items-center gap-2 pt-2"><Switch checked={formActive} onCheckedChange={setFormActive} /><Label>Ativa</Label></div>
            <div className="flex items-center gap-2 pt-4">
              <Button className="flex-1" onClick={handleSave}>Salvar</Button>
              {editReward && <Button variant="destructive" onClick={handleDelete}>Excluir</Button>}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </PageContent>
  );
};

type ReplaceImageButtonProps = {
  accept?: string;
  maxSizeMB: number;
  label: string;
  onChange: (files: File[]) => void;
  onReject?: (rejected: Array<{ file: File; reason: "size" }>) => void;
};

const ReplaceImageButton = ({ accept, maxSizeMB, label, onChange, onReject }: ReplaceImageButtonProps) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback((newFiles: FileList | null) => {
    if (!newFiles) return;
    const entries = Array.from(newFiles);
    const maxBytes = maxSizeMB * 1024 * 1024;
    const rejected = entries
      .filter((file) => file.size > maxBytes)
      .map((file) => ({ file, reason: "size" as const }));
    if (rejected.length) onReject?.(rejected);
    const valid = entries.filter((file) => file.size <= maxBytes).slice(0, 1);
    if (!valid.length) return;
    onChange(valid);
    if (inputRef.current) inputRef.current.value = "";
  }, [maxSizeMB, onChange, onReject]);

  return (
    <div className="flex items-center gap-3">
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
        <Upload className="mr-2 h-4 w-4" />
        {label}
      </Button>
      <span className="text-xs text-muted-foreground">Máx. {maxSizeMB}MB</span>
    </div>
  );
};

export default AdminAchievements;
