import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import StatusBadge from "@/components/shared/StatusBadge";
import EmptyState from "@/components/shared/EmptyState";
import LoadingState from "@/components/shared/LoadingState";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import { useProductPixels, useCreateProductPixel, useUpdateProductPixel, useDeleteProductPixel } from "@/hooks/useProducts";
import {
  BarChart3, PlusCircle, Pencil, Trash2, Save, Activity, Loader2, Eye, EyeOff, Info,
} from "lucide-react";

/* ── Constants ── */
const platforms = [
  { value: "facebook", label: "Facebook Pixel", placeholder: "Ex: 123456789012345", hasToken: true },
  { value: "google_analytics", label: "Google Analytics (GA4)", placeholder: "Ex: G-XXXXXXXXXX", hasToken: false },
  { value: "gtm", label: "Google Tag Manager", placeholder: "Ex: GTM-XXXXXXX", hasToken: false },
  { value: "tiktok", label: "TikTok Pixel", placeholder: "Ex: CXXXXXXXXXXXXXXXXX", hasToken: false },
  { value: "taboola", label: "Taboola Pixel", placeholder: "Ex: 1234567", hasToken: false },
  { value: "kwai", label: "Kwai Pixel", placeholder: "Ex: kwai_pixel_id", hasToken: false },
  { value: "other", label: "Outro", placeholder: "ID do pixel", hasToken: false },
];

const getPlatform = (value: string) => platforms.find((p) => p.value === value);

interface Props {
  productId: string;
}

const ProductPixelsTab = ({ productId }: Props) => {
  const { data: pixels = [], isLoading } = useProductPixels(productId);
  const createPixel = useCreateProductPixel(productId);
  const updatePixel = useUpdateProductPixel(productId);
  const deletePixel = useDeleteProductPixel(productId);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const [formPlatform, setFormPlatform] = useState("");
  const [formPixelId, setFormPixelId] = useState("");
  const [formAccessToken, setFormAccessToken] = useState("");
  const [formActive, setFormActive] = useState(true);
  const [showToken, setShowToken] = useState(false);

  const openCreate = () => {
    setEditingId(null);
    setFormPlatform("");
    setFormPixelId("");
    setFormAccessToken("");
    setFormActive(true);
    setShowToken(false);
    setSheetOpen(true);
  };

  const openEdit = (pixel: typeof pixels[0]) => {
    setEditingId(pixel.id);
    setFormPlatform(pixel.platform);
    setFormPixelId(pixel.pixel_id);
    setFormAccessToken((pixel as any).access_token || "");
    setFormActive(pixel.active);
    setShowToken(false);
    setSheetOpen(true);
  };

  const handleSave = () => {
    if (!formPlatform || !formPixelId) return;
    if (editingId) {
      updatePixel.mutate({ id: editingId, updates: { platform: formPlatform, pixel_id: formPixelId, active: formActive, access_token: formAccessToken } }, {
        onSuccess: () => setSheetOpen(false),
      });
    } else {
      createPixel.mutate({ platform: formPlatform, pixel_id: formPixelId, access_token: formAccessToken }, {
        onSuccess: () => setSheetOpen(false),
      });
    }
  };

  const currentPlatform = getPlatform(formPlatform);

  if (isLoading) return <LoadingState />;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />Pixels de Rastreamento
              </CardTitle>
              <CardDescription>Gerencie os pixels de conversão vinculados a este produto</CardDescription>
            </div>
            <Button size="sm" onClick={openCreate}><PlusCircle className="h-4 w-4 mr-1" />Adicionar Pixel</Button>
          </div>
        </CardHeader>
        <CardContent>
          {pixels.length === 0 ? (
            <EmptyState
              icon={<Activity className="h-6 w-6 text-muted-foreground" />}
              title="Nenhum pixel cadastrado"
              description="Adicione pixels para rastrear conversões e otimizar suas campanhas."
              action={<Button variant="outline" size="sm" onClick={openCreate}><PlusCircle className="h-4 w-4 mr-1" />Adicionar Pixel</Button>}
            />
          ) : (
            <div className="space-y-3">
              {pixels.map((pixel) => {
                const plat = getPlatform(pixel.platform);
                const hasApiToken = !!(pixel as any).access_token;
                return (
                  <div key={pixel.id} className="flex items-center justify-between rounded-lg border border-border p-4 hover:bg-muted/30 transition-colors">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-foreground truncate">{plat?.label || pixel.platform}</p>
                          <StatusBadge status={pixel.active ? "active" : "inactive"} />
                          {pixel.platform === "facebook" && hasApiToken && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary text-[10px] font-medium px-2 py-0.5">
                              CAPI
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground font-mono truncate">{pixel.pixel_id}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-4">
                      <Switch checked={pixel.active} onCheckedChange={() => updatePixel.mutate({ id: pixel.id, updates: { active: !pixel.active } })} />
                      <Button variant="ghost" size="icon" onClick={() => openEdit(pixel)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(pixel.id)} className="text-destructive hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editingId ? "Editar Pixel" : "Adicionar Pixel"}</SheetTitle>
            <SheetDescription>{editingId ? "Atualize as configurações deste pixel." : "Configure um novo pixel de rastreamento."}</SheetDescription>
          </SheetHeader>
          <div className="space-y-5 py-6">
            <div className="space-y-2">
              <Label>Plataforma</Label>
              <Select value={formPlatform} onValueChange={setFormPlatform}>
                <SelectTrigger><SelectValue placeholder="Selecione a plataforma" /></SelectTrigger>
                <SelectContent>
                  {platforms.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>ID do Pixel</Label>
              <Input placeholder={currentPlatform?.placeholder ?? "ID do pixel"} value={formPixelId} onChange={(e) => setFormPixelId(e.target.value)} className="font-mono" />
            </div>

            {/* Facebook Conversions API Token */}
            {formPlatform === "facebook" && (
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  Token da API de Conversão
                  <span className="text-xs text-muted-foreground font-normal">(opcional)</span>
                </Label>
                <div className="relative">
                  <Input
                    type={showToken ? "text" : "password"}
                    placeholder="EAAxxxxxxxxxx..."
                    value={formAccessToken}
                    onChange={(e) => setFormAccessToken(e.target.value)}
                    className="font-mono pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken(!showToken)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <div className="flex items-start gap-2 rounded-lg bg-muted/50 border border-border p-3">
                  <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p>Gere o token no <span className="font-medium text-foreground">Gerenciador de Eventos do Facebook</span> → Configurações → API de Conversões.</p>
                    <p>Com este token, os eventos serão enviados também via servidor (CAPI), aumentando a precisão do rastreamento mesmo com bloqueadores de anúncios.</p>
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Ativo</p>
                <p className="text-xs text-muted-foreground">O pixel será disparado nas páginas</p>
              </div>
              <Switch checked={formActive} onCheckedChange={setFormActive} />
            </div>
          </div>
          <SheetFooter>
            <Button className="w-full" onClick={handleSave} disabled={!formPlatform || !formPixelId || createPixel.isPending || updatePixel.isPending}>
              {(createPixel.isPending || updatePixel.isPending) ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
              {editingId ? "Salvar alterações" : "Adicionar pixel"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Excluir pixel"
        description="Tem certeza que deseja excluir este pixel?"
        confirmLabel="Excluir"
        variant="destructive"
        onConfirm={() => {
          if (deleteTarget) deletePixel.mutate(deleteTarget, { onSuccess: () => setDeleteTarget(null) });
        }}
      />
    </div>
  );
};

export default ProductPixelsTab;
