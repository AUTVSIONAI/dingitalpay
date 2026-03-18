import { useState, useCallback, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { usePageMeta } from "@/contexts/PageMetaContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import FileUploader from "@/components/shared/FileUploader";
import RichTextEditor from "@/components/shared/RichTextEditor";
import LoadingState from "@/components/shared/LoadingState";
import PageContent from "@/components/layout/PageContent";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import { Globe, Palette, Shield, FileText, CheckCircle2, Loader2, Upload, X } from "lucide-react";
import {
  getPlatformSettings,
  getSmtpConfig,
  getSmtpStatus,
  invalidateSettingsCache,
  updatePlatformSettings,
} from "@/services/admin.service";
import { useThemeColor } from "@/contexts/ThemeColorContext";
import type { PaletteKey } from "@/contexts/ThemeColorContext";
import type { PlatformSettings } from "@/types/api";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { hasMeaningfulRichText } from "@/lib/rich-text";

const AdminPlatformSettings = () => {
  const [localSettings, setLocalSettings] = useState<PlatformSettings | null>(null);
  const { palette, setPalette, neonMode, setNeonMode, glowMode, setGlowMode, palettes } = useThemeColor();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Store original theme values to revert on cancel/unmount
  const savedThemeRef = useRef({ palette, neonMode, glowMode });

  usePageMeta([{ label: "Admin", path: "/admin" }, { label: "Plataforma" }], "Configurações da Plataforma");

  const { data: fetchedSettings, isLoading } = useQuery({
    queryKey: ["platform-settings"],
    queryFn: getPlatformSettings,
  });
  const { data: smtpConfig } = useQuery({ queryKey: ["smtp-config"], queryFn: getSmtpConfig });
  const { data: smtpStatus } = useQuery({ queryKey: ["smtp-status"], queryFn: getSmtpStatus });

  // Update savedThemeRef when fetchedSettings loads
  useEffect(() => {
    if (fetchedSettings) {
      savedThemeRef.current = {
        palette: (fetchedSettings.palette || palette) as PaletteKey,
        neonMode: fetchedSettings.neonMode ?? neonMode,
        glowMode: fetchedSettings.glowMode ?? glowMode,
      };
    }
  }, [fetchedSettings]);

  const settings = localSettings ?? fetchedSettings;
  const hasUnsavedChanges = localSettings !== null;
  const hasTermsContent = hasMeaningfulRichText(settings?.termsOfUse);
  const hasPrivacyContent = hasMeaningfulRichText(settings?.privacyPolicy);
  const canRequireTermsAcceptance = hasTermsContent && hasPrivacyContent;
  const smtpReadyForEmailVerification = Boolean(
    smtpConfig?.enabled &&
      String(smtpConfig?.host || "").trim() &&
      String(smtpConfig?.port || "").trim() &&
      String(smtpConfig?.username || "").trim() &&
      String(smtpConfig?.fromEmail || "").trim() &&
      smtpStatus?.lastTest &&
      smtpStatus.lastTest !== "-"
  );

  const update = (partial: Partial<PlatformSettings>) =>
    setLocalSettings((prev) => (prev ?? fetchedSettings) ? { ...(prev ?? fetchedSettings!), ...partial } : null);

  // Live preview: apply theme changes to context immediately
  const updateWithPreview = (partial: Partial<PlatformSettings>) => {
    update(partial);
    if (partial.palette) setPalette(partial.palette as PaletteKey);
    if (partial.neonMode !== undefined) setNeonMode(partial.neonMode);
    if (partial.glowMode !== undefined) setGlowMode(partial.glowMode);
  };

  // Revert theme to saved values
  const revertTheme = useCallback(() => {
    const saved = savedThemeRef.current;
    setPalette(saved.palette as PaletteKey);
    setNeonMode(saved.neonMode);
    setGlowMode(saved.glowMode);
  }, [setPalette, setNeonMode, setGlowMode]);

  // Revert on unmount if unsaved changes exist
  const hasUnsavedRef2 = useRef(hasUnsavedChanges);
  hasUnsavedRef2.current = hasUnsavedChanges;
  useEffect(() => {
    return () => {
      if (hasUnsavedRef2.current) {
        const saved = savedThemeRef.current;
        setPalette(saved.palette as PaletteKey);
        setNeonMode(saved.neonMode);
        setGlowMode(saved.glowMode);
      }
    };
  }, []);

  // Unsaved changes dialog state
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const pendingNavRef = useRef<string | null>(null);
  const navigate = useNavigate();
  const hasUnsavedRef = useRef(hasUnsavedChanges);
  hasUnsavedRef.current = hasUnsavedChanges;

  // Intercept sidebar navigation clicks
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (!hasUnsavedRef.current) return;

      const button = (e.target as HTMLElement).closest("button, a");
      if (!button) return;

      const sidebar = document.querySelector("aside");
      if (!sidebar?.contains(button)) return;

      // Prevent the default navigation
      e.preventDefault();
      e.stopPropagation();

      // Try to figure out where the button navigates
      // The sidebar buttons use onClick with navigate(), so we detect based on the text
      const href = button.getAttribute("href");
      if (href) {
        pendingNavRef.current = href;
      } else {
        // For programmatic nav, we'll just show the dialog and let user confirm
        pendingNavRef.current = null;
      }
      setShowUnsavedDialog(true);
    };

    document.addEventListener("click", handleClick, true); // capture phase
    return () => document.removeEventListener("click", handleClick, true);
  }, []);

  // Handle browser tab close
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasUnsavedChanges]);

  const handleConfirmLeave = () => {
    revertTheme();
    setLocalSettings(null);
    setShowUnsavedDialog(false);
    if (pendingNavRef.current) {
      navigate(pendingNavRef.current);
    }
  };

  const saveMutation = useMutation({
    mutationFn: (partial: Partial<PlatformSettings>) => updatePlatformSettings(partial),
    onSuccess: (_, variables) => {
      invalidateSettingsCache();
      queryClient.setQueryData(["platform-settings"], (prev: any) => prev ? ({ ...prev, ...variables }) : prev);
      queryClient.invalidateQueries({ queryKey: ["platform-settings"] });
      queryClient.invalidateQueries({ queryKey: ["platform-settings-terms"] });
      setLocalSettings(null);
      // Update saved ref so future reverts use the new values
      if (variables.palette) savedThemeRef.current.palette = variables.palette as PaletteKey;
      if (variables.neonMode !== undefined) savedThemeRef.current.neonMode = variables.neonMode;
      if (variables.glowMode !== undefined) savedThemeRef.current.glowMode = variables.glowMode;
      toast({ title: "Configurações salvas" });
    },
    onError: (err: any) => {
      revertTheme();
      toast({
        title: "Erro ao salvar",
        description: err?.message || "Não foi possível salvar as configurações da plataforma.",
        variant: "destructive",
      });
    },
  });

  const handleSaveGeneral = () => {
    if (!settings) return;
    saveMutation.mutate({
      platformName: settings.platformName,
      platformUrl: settings.platformUrl,
      supportEmail: settings.supportEmail,
      language: settings.language,
      maintenanceMode: settings.maintenanceMode,
      description: settings.description,
    });
  };

  const handleSaveAppearance = () => {
    if (!settings) return;
    saveMutation.mutate({
      logoUrl: settings.logoUrl,
      darkLogoUrl: settings.darkLogoUrl,
      whiteLogoUrl: settings.whiteLogoUrl,
      faviconUrl: settings.faviconUrl,
      palette: settings.palette,
      neonMode: settings.neonMode,
      glowMode: settings.glowMode,
    });
  };

  const handleSaveSecurity = () => {
    if (!settings) return;
    if (settings.emailVerification && !smtpReadyForEmailVerification) {
      toast({
        title: "SMTP obrigatório",
        description:
          "Para ativar a verificação obrigatória de e-mail, o SMTP precisa estar ativo, configurado e com teste de conexão concluído com sucesso.",
        variant: "destructive",
      });
      return;
    }
    saveMutation.mutate({
      registrationOpen: settings.registrationOpen,
      emailVerification: settings.emailVerification,
      twoFactor: settings.twoFactor,
    });
  };

  const handleSaveTerms = () => {
    if (!settings) return;
    if (settings.requireTermsAcceptance && !canRequireTermsAcceptance) {
      toast({
        title: "Não foi possível ativar o aceite obrigatório",
        description: "Preencha Termos de Uso e Política de Privacidade antes de salvar essa opção como ativa.",
        variant: "destructive",
      });
      return;
    }
    saveMutation.mutate({
      termsOfUse: settings.termsOfUse,
      privacyPolicy: settings.privacyPolicy,
      requireTermsAcceptance: settings.requireTermsAcceptance,
    });
  };

  const handleFileUpload = useCallback(async (files: File[], field: "logoUrl" | "darkLogoUrl" | "whiteLogoUrl" | "faviconUrl") => {
    if (!files.length) return;
    const file = files[0];
    const ext = String(file.name.split(".").pop() || "png").toLowerCase();
    const safeExt = ext.replace(/[^a-z0-9]+/g, "").slice(0, 8) || "png";

    const fixedName: Record<typeof field, string> = {
      logoUrl: "logo",
      darkLogoUrl: "dark-logo",
      whiteLogoUrl: "white-logo",
      faviconUrl: "favicon",
    };
    const objectPath = `branding/${fixedName[field]}.${safeExt}`;

    const prevUrl = settings?.[field];
    if (prevUrl) {
      try {
        const u = new URL(prevUrl);
        const marker = "/api/storage/public/platform-assets/";
        const idx = u.pathname.indexOf(marker);
        if (idx !== -1) {
          const raw = u.pathname.slice(idx + marker.length);
          const prevPath = decodeURIComponent(raw);
          if (prevPath && prevPath !== objectPath) {
            await supabase.storage.from("platform-assets").remove([prevPath]);
          }
        }
      } catch {
        // ignore non-URL / external assets
      }
    }

    const { error } = await supabase.storage.from("platform-assets").upload(objectPath, file, { upsert: true });
    if (error) {
      toast({ title: "Erro no upload", description: error.message, variant: "destructive" });
      return;
    }

    const { data } = supabase.storage.from("platform-assets").getPublicUrl(objectPath);
    const publicUrl = data.publicUrl;

    update({ [field]: publicUrl });

    try {
      await updatePlatformSettings({ [field]: publicUrl });
      invalidateSettingsCache();
      queryClient.setQueryData(["platform-settings"], (prev: any) => prev ? ({ ...prev, [field]: publicUrl }) : prev);
      queryClient.invalidateQueries({ queryKey: ["platform-settings"] });
      toast({ title: "Arquivo enviado e salvo" });
    } catch (persistError: any) {
      toast({
        title: "Arquivo enviado, mas não salvo",
        description: persistError?.message || "Não foi possível persistir a alteração no banco.",
        variant: "destructive",
      });
    }
  }, [settings, queryClient, fetchedSettings, toast]);

  const handleRejectUpload = useCallback((maxSizeMB: number) => {
    return (rejected: Array<{ file: File; reason: "size" }>) => {
      const names = rejected.map((r) => r.file.name).slice(0, 3).join(", ");
      toast({
        title: "Arquivo muito grande",
        description: `Máx. ${maxSizeMB}MB. Rejeitado: ${names}${rejected.length > 3 ? "..." : ""}`,
        variant: "destructive",
      });
    };
  }, [toast]);

  if (isLoading || !settings) return <LoadingState />;

  const SaveButton = ({ onClick }: { onClick: () => void }) => (
    <Button size="sm" onClick={onClick} disabled={saveMutation.isPending}>
      {saveMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
      {saveMutation.isPending ? "Salvando..." : "Salvar"}
    </Button>
  );

  return (
    <PageContent>
      {/* Unsaved changes dialog */}
      <ConfirmDialog
        open={showUnsavedDialog}
        onOpenChange={setShowUnsavedDialog}
        title="Alterações não salvas"
        description="Você tem alterações que ainda não foram salvas. Tem certeza que deseja sair sem salvar?"
        confirmLabel="Sair sem salvar"
        cancelLabel="Continuar editando"
        onConfirm={handleConfirmLeave}
        variant="destructive"
      />

      <Tabs defaultValue="general" className="space-y-6">
        <TabsList>
          <TabsTrigger value="general" className="gap-1.5"><Globe className="h-4 w-4" /> Geral</TabsTrigger>
          <TabsTrigger value="appearance" className="gap-1.5"><Palette className="h-4 w-4" /> Aparência</TabsTrigger>
          <TabsTrigger value="security" className="gap-1.5"><Shield className="h-4 w-4" /> Segurança</TabsTrigger>
          <TabsTrigger value="terms" className="gap-1.5"><FileText className="h-4 w-4" /> Termos & Políticas</TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <Card>
            <CardHeader><CardTitle className="text-base">Informações Gerais</CardTitle><CardDescription>Dados básicos da plataforma</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Nome da Plataforma</Label><Input value={settings.platformName} onChange={(e) => update({ platformName: e.target.value })} /></div>
                <div className="space-y-2"><Label>URL</Label><Input value={settings.platformUrl} onChange={(e) => update({ platformUrl: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2"><Label>E-mail de Suporte</Label><Input type="email" value={settings.supportEmail} onChange={(e) => update({ supportEmail: e.target.value })} /></div>
                <div className="space-y-2">
                  <Label>Idioma</Label>
                  <Select value={settings.language} onValueChange={(v) => update({ language: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="pt-BR">Português (BR)</SelectItem><SelectItem value="en-US">English (US)</SelectItem><SelectItem value="es">Español</SelectItem></SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-end gap-3 pb-1">
                <div className="flex items-center gap-2"><Switch checked={settings.maintenanceMode} onCheckedChange={(v) => update({ maintenanceMode: v })} /><Label>Modo Manutenção</Label></div>
              </div>
              <div className="space-y-2"><Label>Descrição</Label><Textarea value={settings.description} onChange={(e) => update({ description: e.target.value })} rows={3} /></div>
              <div className="flex justify-end"><SaveButton onClick={handleSaveGeneral} /></div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="appearance">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader><CardTitle className="text-base">Tema da Plataforma</CardTitle><CardDescription>Escolha a paleta de cores e efeitos visuais</CardDescription></CardHeader>
              <CardContent className="space-y-5">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {(Object.keys(palettes) as PaletteKey[]).map((key) => {
                    const p = palettes[key];
                    const isActive = (settings.palette) === key;
                    return (
                      <button key={key} onClick={() => updateWithPreview({ palette: key })}
                        className={`relative flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-all hover:scale-105 ${isActive ? "border-primary bg-primary/10 shadow-md" : "border-border bg-card hover:border-muted-foreground/30"}`}>
                        <div className="h-10 w-10 rounded-full shadow-sm border border-border" style={{ backgroundColor: p.swatch }} />
                        <span className="text-xs font-medium text-foreground">{p.label}</span>
                        {isActive && <div className="absolute top-1.5 right-1.5"><CheckCircle2 className="h-4 w-4 text-primary" /></div>}
                      </button>
                    );
                  })}
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div><p className="text-sm font-medium text-foreground">Modo Neon / Degradê</p><p className="text-xs text-muted-foreground">Aplica gradiente e brilho neon</p></div>
                  <Switch checked={settings.neonMode} onCheckedChange={(v) => updateWithPreview({ neonMode: v })} />
                </div>
                <div className="flex items-center justify-between">
                  <div><p className="text-sm font-medium text-foreground">Brilho Externo (Glow)</p><p className="text-xs text-muted-foreground">Sombra luminosa nos componentes</p></div>
                  <Switch checked={settings.glowMode} onCheckedChange={(v) => updateWithPreview({ glowMode: v })} />
                </div>
                <div className="flex justify-end pt-2"><SaveButton onClick={handleSaveAppearance} /></div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Logo & Favicon</CardTitle><CardDescription>Faça upload da identidade visual para cada tema</CardDescription></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Logo — Tema Escuro (Dark)</Label>
                  <p className="text-xs text-muted-foreground">Exibida quando o tema escuro está ativo (geralmente logo clara/branca)</p>
                  {settings.darkLogoUrl && (
                    <div className="mb-2 rounded-md border border-border p-2 bg-zinc-900 flex items-center justify-between">
                      <img src={settings.darkLogoUrl} alt="Logo Dark" className="max-h-16 object-contain" />
                      <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive shrink-0" onClick={() => update({ darkLogoUrl: "" })} aria-label="Remover logo dark">
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                  {settings.darkLogoUrl ? (
                    <ReplaceImageButton
                      accept="image/*"
                      maxSizeMB={2}
                      label="Substituir logo"
                      onReject={handleRejectUpload(2)}
                      onChange={(files) => handleFileUpload(files, "darkLogoUrl")}
                    />
                  ) : (
                    <FileUploader accept="image/*" maxSizeMB={2} onReject={handleRejectUpload(2)} onChange={(files) => handleFileUpload(files, "darkLogoUrl")} />
                  )}
                </div>
                <Separator />
                <div className="space-y-2">
                  <Label>Logo — Tema Claro (White)</Label>
                  <p className="text-xs text-muted-foreground">Exibida quando o tema claro está ativo (geralmente logo escura)</p>
                  {settings.whiteLogoUrl && (
                    <div className="mb-2 rounded-md border border-border p-2 bg-white flex items-center justify-between">
                      <img src={settings.whiteLogoUrl} alt="Logo White" className="max-h-16 object-contain" />
                      <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive shrink-0" onClick={() => update({ whiteLogoUrl: "" })} aria-label="Remover logo white">
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                  {settings.whiteLogoUrl ? (
                    <ReplaceImageButton
                      accept="image/*"
                      maxSizeMB={2}
                      label="Substituir logo"
                      onReject={handleRejectUpload(2)}
                      onChange={(files) => handleFileUpload(files, "whiteLogoUrl")}
                    />
                  ) : (
                    <FileUploader accept="image/*" maxSizeMB={2} onReject={handleRejectUpload(2)} onChange={(files) => handleFileUpload(files, "whiteLogoUrl")} />
                  )}
                </div>
                <Separator />
                <div className="space-y-2">
                  <Label>Favicon</Label>
                  {settings.faviconUrl && (
                    <div className="mb-2 rounded-md border border-border p-2 bg-muted/30 flex items-center justify-between">
                      <img src={settings.faviconUrl} alt="Favicon" className="max-h-8 object-contain" />
                      <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive shrink-0" onClick={() => update({ faviconUrl: "" })} aria-label="Remover favicon">
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                  {settings.faviconUrl ? (
                    <ReplaceImageButton
                      accept="image/*"
                      maxSizeMB={1}
                      label="Substituir favicon"
                      onReject={handleRejectUpload(1)}
                      onChange={(files) => handleFileUpload(files, "faviconUrl")}
                    />
                  ) : (
                    <FileUploader accept="image/*" maxSizeMB={1} onReject={handleRejectUpload(1)} onChange={(files) => handleFileUpload(files, "faviconUrl")} />
                  )}
                </div>
                <div className="flex justify-end pt-2"><SaveButton onClick={handleSaveAppearance} /></div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="security">
          <Card>
            <CardHeader><CardTitle className="text-base">Segurança & Acesso</CardTitle><CardDescription>Controle as políticas de segurança</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              {!smtpReadyForEmailVerification ? (
                <Alert variant="destructive">
                  <X className="h-4 w-4" />
                  <AlertTitle>SMTP obrigatório para verificação de e-mail</AlertTitle>
                  <AlertDescription>
                    Antes de ativar a verificação obrigatória de e-mail, configure o SMTP, deixe-o ativo e execute um teste de conexão com sucesso em <strong>/admin/smtp</strong>.
                  </AlertDescription>
                </Alert>
              ) : null}
              {([
                { label: "Verificação de e-mail obrigatória", key: "emailVerification" as const },
                { label: "Autenticação de dois fatores (2FA) obrigatória", key: "twoFactor" as const },
              ]).map((item) => (
                <div key={item.label} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <span className="text-sm text-foreground">{item.label}</span>
                  <Switch
                    checked={settings[item.key]}
                    onCheckedChange={(v) => {
                      if (item.key === "emailVerification" && v && !smtpReadyForEmailVerification) {
                        toast({
                          title: "Ativação bloqueada",
                          description:
                            "O SMTP precisa estar ativo, configurado e validado por teste antes de exigir verificação de e-mail.",
                          variant: "destructive",
                        });
                        return;
                      }
                      update({ [item.key]: v });
                    }}
                  />
                </div>
              ))}
              <div className="flex justify-end pt-2"><SaveButton onClick={handleSaveSecurity} /></div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="terms">
          <div className="space-y-6">
            <Card>
              <CardHeader><CardTitle className="text-base">Termos de Uso</CardTitle><CardDescription>Termos que os usuários devem aceitar</CardDescription></CardHeader>
              <CardContent><RichTextEditor value={settings.termsOfUse} onChange={(v) => update({ termsOfUse: v })} minHeight="200px" /></CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Política de Privacidade</CardTitle><CardDescription>Como os dados dos usuários são tratados</CardDescription></CardHeader>
              <CardContent><RichTextEditor value={settings.privacyPolicy} onChange={(v) => update({ privacyPolicy: v })} minHeight="200px" /></CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div><p className="text-sm font-medium text-foreground">Aceite obrigatório no cadastro</p><p className="text-xs text-muted-foreground">Exigir aceite ao se cadastrar</p></div>
                  <Switch
                    checked={settings.requireTermsAcceptance}
                    onCheckedChange={(v) => {
                      if (v && !canRequireTermsAcceptance) {
                        toast({
                          title: "Ativação bloqueada",
                          description: "Preencha Termos de Uso e Política de Privacidade antes de ativar o aceite obrigatório no cadastro.",
                          variant: "destructive",
                        });
                        return;
                      }
                      update({ requireTermsAcceptance: v });
                    }}
                  />
                </div>
                {!canRequireTermsAcceptance ? (
                  <Alert variant="destructive" className="mt-4">
                    <X className="h-4 w-4" />
                    <AlertTitle>Preenchimento obrigatório</AlertTitle>
                    <AlertDescription>
                      Para ativar o aceite obrigatório no cadastro, preencha os dois campos: Termos de Uso e Política de Privacidade.
                    </AlertDescription>
                  </Alert>
                ) : null}
                <div className="flex justify-end pt-4"><SaveButton onClick={handleSaveTerms} /></div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
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

  const handleFiles = useCallback(
    (newFiles: FileList | null) => {
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
    },
    [maxSizeMB, onChange, onReject]
  );

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

export default AdminPlatformSettings;
