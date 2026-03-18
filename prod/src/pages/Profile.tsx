import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import PageContent from "@/components/layout/PageContent";
import { usePageMeta } from "@/contexts/PageMetaContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "react-router-dom";
import { Camera, Trash2, User, Shield, Bell, MapPin, Building, Globe, Smartphone } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { maskPhone, maskCPF } from "@/lib/masks";
import { TwoFactorSettings } from "@/components/auth/TwoFactorSettings";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { getSmtpConfig, getSmtpStatus } from "@/services/admin.service";

const normalizeDateInputValue = (value: string | null | undefined) => {
  const v = String(value || "").trim();
  if (!v) return "";
  // Accept "YYYY-MM-DD" (native <input type="date">) or ISO strings and normalize.
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  if (/^\d{4}-\d{2}-\d{2}T/.test(v)) return v.slice(0, 10);
  return v;
};

const Profile = () => {
  const location = useLocation();
  const isAdmin = location.pathname.startsWith("/admin");
  usePageMeta([{ label: isAdmin ? "Admin" : "Painel" }, { label: "Meu Perfil" }], "Meu Perfil");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { user, profile, refreshProfile, loading: authLoading } = useAuth();
  const { data: smtpConfig, isLoading: smtpConfigLoading } = useQuery({ queryKey: ["smtp-config"], queryFn: getSmtpConfig, enabled: isAdmin });
  const { data: smtpStatus, isLoading: smtpStatusLoading } = useQuery({ queryKey: ["smtp-status"], queryFn: getSmtpStatus, enabled: isAdmin });

  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [cpf, setCpf] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [bio, setBio] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [country, setCountry] = useState("Brasil");
  const [company, setCompany] = useState("");
  const [website, setWebsite] = useState("");
  const [timezone, setTimezone] = useState("America/Sao_Paulo");

  const [emailNotifications, setEmailNotifications] = useState(false);
  const [smsNotifications, setSmsNotifications] = useState(false);
  const [marketingEmails, setMarketingEmails] = useState(true);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [savingEmailNotifications, setSavingEmailNotifications] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [profileHydrated, setProfileHydrated] = useState(false);
  const { toast } = useToast();
  const smtpGuardHydrated = !isAdmin || (!smtpConfigLoading && !smtpStatusLoading);
  const emailNotificationsReady = !authLoading && profileHydrated && smtpGuardHydrated;
  const smtpReadyForEmailNotifications = Boolean(
    smtpConfig?.enabled &&
      String(smtpConfig?.host || "").trim() &&
      String(smtpConfig?.port || "").trim() &&
      String(smtpConfig?.username || "").trim() &&
      String(smtpConfig?.fromEmail || "").trim() &&
      (String(smtpConfig?.password || "").trim() || (smtpStatus?.lastTest && smtpStatus.lastTest !== "-"))
  );

  // Load profile data from auth context
  useEffect(() => {
    if (!profile) return;
    setName(profile.name || "");
    setPhone(profile.phone || "");
    setCpf(profile.cpf || "");
    setBirthDate(normalizeDateInputValue(profile.birth_date));
    setBio(profile.bio || "");
    setCity(profile.city || "");
    setState(profile.state || "");
    setCountry(profile.country || "Brasil");
    setCompany(profile.company || "");
    setWebsite(profile.website || "");
    setTimezone(profile.timezone || "America/Sao_Paulo");
    setAvatarUrl(profile.avatar_url || null);
    setEmailNotifications(Boolean(profile.email_notifications));
    setSmsNotifications(profile.sms_notifications ?? false);
    setMarketingEmails(profile.marketing_emails ?? true);
    setProfileHydrated(true);
  }, [profile]);

  useEffect(() => {
    setEmail(user?.email || "");
  }, [user?.email]);

  useEffect(() => {
    if (authLoading) return;
    if (profile) return;
    setProfileHydrated(true);
  }, [authLoading, profile]);

  useEffect(() => {
    if (!isAdmin) return;
    if (!profileHydrated || !smtpGuardHydrated) return;
    if (smtpReadyForEmailNotifications) return;
    if (!emailNotifications) return;
    setEmailNotifications(false);
    void refreshProfile();
  }, [
    isAdmin,
    profileHydrated,
    smtpGuardHydrated,
    smtpReadyForEmailNotifications,
    emailNotifications,
    refreshProfile,
  ]);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    const fileExt = file.name.split(".").pop();
    const filePath = `${user.id}/avatar.${fileExt}`;
    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(filePath, file, { upsert: true });
    if (uploadError) {
      toast({ title: "Erro", description: "Falha ao enviar a imagem.", variant: "destructive" });
      return;
    }
    const { data: publicUrlData } = supabase.storage.from("avatars").getPublicUrl(filePath);
    const newUrl = `${publicUrlData.publicUrl}?t=${Date.now()}`;
    await supabase.from("profiles").upsert(
      {
        user_id: user.id,
        name: profile?.name || user.user_metadata?.name || "",
        avatar_url: newUrl,
      },
      { onConflict: "user_id" }
    );
    setAvatarUrl(newUrl);
    await refreshProfile();
    toast({ title: "Foto atualizada!", description: "Sua foto de perfil foi alterada." });
  };

  const handleAvatarRemove = async () => {
    if (!user || !avatarUrl) return;
    // List and remove files in user folder
    const { data: files } = await supabase.storage.from("avatars").list(user.id);
    if (files?.length) {
      await supabase.storage.from("avatars").remove(files.map(f => `${user.id}/${f.name}`));
    }
    await supabase.from("profiles").upsert(
      {
        user_id: user.id,
        name: profile?.name || user.user_metadata?.name || "",
        avatar_url: null,
      },
      { onConflict: "user_id" }
    );
    setAvatarUrl(null);
    await refreshProfile();
    toast({ title: "Foto removida!", description: "Sua foto de perfil foi excluída." });
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const wasEmailNotificationsEnabled = Boolean(profile?.email_notifications);
    if (isAdmin && emailNotifications && !wasEmailNotificationsEnabled && !smtpReadyForEmailNotifications) {
      toast({
        title: "SMTP obrigatório",
        description:
          "Para ativar notificações por e-mail, o SMTP precisa estar ativo, configurado e com teste de conexão concluído com sucesso.",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .upsert({
        user_id: user.id,
        name,
        phone,
        cpf,
        birth_date: normalizeDateInputValue(birthDate) || null,
        bio,
        city,
        state,
        country,
        company,
        website,
        timezone,
        email_notifications: emailNotifications,
        sms_notifications: smsNotifications,
        marketing_emails: marketingEmails,
      }, { onConflict: "user_id" });

    if (error) {
      toast({ title: "Erro", description: "Não foi possível salvar o perfil.", variant: "destructive" });
    } else {
      toast({ title: "Perfil atualizado!", description: "Seus dados foram salvos com sucesso." });
      await refreshProfile();
    }
    setSaving(false);
  };

  const translateSupabasePasswordError = (msg: string): string => {
    if (msg.includes("at least 6 characters")) return "A senha deve ter no mínimo 6 caracteres.";
    if (msg.includes("same as the old password")) return "A nova senha não pode ser igual à anterior.";
    if (msg.includes("too weak")) return "A senha é muito fraca. Use letras, números e símbolos.";
    return "Ocorreu um erro ao alterar a senha. Tente novamente.";
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || !confirmPassword) {
      toast({ title: "Campos obrigatórios", description: "Preencha a nova senha e a confirmação.", variant: "destructive" });
      return;
    }
    if (newPassword.length < 6) {
      toast({ title: "Senha muito curta", description: "A senha deve ter no mínimo 6 caracteres.", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "Senhas diferentes", description: "A nova senha e a confirmação não coincidem.", variant: "destructive" });
      return;
    }
    setChangingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setChangingPassword(false);
    if (error) {
      toast({ title: "Erro ao alterar senha", description: translateSupabasePasswordError(error.message), variant: "destructive" });
    } else {
      toast({ title: "Senha alterada!", description: "Sua senha foi atualizada com sucesso." });
      setNewPassword("");
      setConfirmPassword("");
    }
  };

  const handleEmailNotificationsToggle = async (checked: boolean) => {
    if (!user) return;
    if (!emailNotificationsReady) return;
    if (savingEmailNotifications) return;

    if (isAdmin && checked && !smtpReadyForEmailNotifications) {
      toast({
        title: "Ativação bloqueada",
        description:
          "O SMTP precisa estar ativo, configurado e validado por teste antes de ativar notificações por e-mail.",
        variant: "destructive",
      });
      setEmailNotifications(false);
      return;
    }

    const previous = emailNotifications;
    setEmailNotifications(checked);
    setSavingEmailNotifications(true);

    const { error } = await supabase
      .from("profiles")
      .upsert({
        user_id: user.id,
        name: profile?.name || user.user_metadata?.name || "",
        email_notifications: checked,
      }, { onConflict: "user_id" });

    setSavingEmailNotifications(false);

    if (error) {
      setEmailNotifications(previous);
      toast({
        title: "Erro ao salvar",
        description: error.message || "Não foi possível atualizar as notificações por e-mail.",
        variant: "destructive",
      });
      return;
    }

    await refreshProfile();
    toast({
      title: checked ? "Notificações ativadas" : "Notificações desativadas",
      description: checked
        ? "As notificações por e-mail foram ativadas com sucesso."
        : "As notificações por e-mail foram desativadas com sucesso.",
    });
  };

  const initials = name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase() || "?";

  return (
    <PageContent>
      <div className="max-w-4xl space-y-6">
        {/* Avatar + resumo */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row items-center gap-6">
              <div className="relative group">
                <Avatar key={avatarUrl || "no-avatar"} className="h-24 w-24 ring-4 ring-primary/10">
                  {avatarUrl ? (
                    <AvatarImage src={avatarUrl} alt={name} />
                  ) : null}
                  <AvatarFallback className="text-2xl font-bold bg-primary/10 text-primary">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                {avatarUrl && (
                  <button
                    type="button"
                    onClick={handleAvatarRemove}
                    className="absolute -top-1 -right-1 z-10 h-6 w-6 rounded-full bg-destructive flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer shadow-sm"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive-foreground" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                >
                  <Camera className="h-6 w-6 text-white" />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarChange}
                />
              </div>
              <div className="text-center sm:text-left flex-1">
                <h2 className="text-xl font-semibold text-foreground">{name}</h2>
                <p className="text-sm text-muted-foreground">{email}</p>
                <p className="text-sm text-muted-foreground mt-1">{bio}</p>
                <div className="flex flex-wrap gap-2 mt-3 justify-center sm:justify-start">
                  <span className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary px-2.5 py-1 rounded-full font-medium">
                    <User className="h-3 w-3" />
                    {isAdmin ? "Administrador" : "Vendedor"}
                  </span>
                  {city && (
                    <span className="inline-flex items-center gap-1 text-xs bg-muted text-muted-foreground px-2.5 py-1 rounded-full">
                      <MapPin className="h-3 w-3" />
                      {city}{state ? `, ${state}` : ""}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Dados pessoais */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <User className="h-5 w-5 text-primary" />
              <div>
                <CardTitle className="text-base">Dados pessoais</CardTitle>
                <CardDescription>Informações básicas do seu perfil</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome completo</Label>
                  <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">E-mail</Label>
                  <Input id="email" value={email} disabled className="opacity-60" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Telefone</Label>
                  <Input id="phone" value={phone} onChange={(e) => setPhone(maskPhone(e.target.value))} placeholder="(00) 00000-0000" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cpf">CPF</Label>
                  <Input id="cpf" value={cpf} onChange={(e) => setCpf(maskCPF(e.target.value))} placeholder="000.000.000-00" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="birthDate">Data de nascimento</Label>
                  <Input id="birthDate" type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="bio">Biografia</Label>
                <Textarea id="bio" value={bio} onChange={(e) => setBio(e.target.value)} rows={3} placeholder="Conte um pouco sobre você..." />
              </div>

              <Separator />

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="city" className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> Cidade</Label>
                  <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="state" className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> Estado</Label>
                  <Input id="state" value={state} onChange={(e) => setState(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="country" className="flex items-center gap-1"><Globe className="h-3.5 w-3.5" /> País</Label>
                  <Input id="country" value={country} onChange={(e) => setCountry(e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="company" className="flex items-center gap-1"><Building className="h-3.5 w-3.5" /> Empresa</Label>
                  <Input id="company" value={company} onChange={(e) => setCompany(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="website" className="flex items-center gap-1"><Globe className="h-3.5 w-3.5" /> Website</Label>
                  <Input id="website" value={website} onChange={(e) => setWebsite(e.target.value)} />
                </div>
              </div>

              <div className="flex justify-end">
                <Button type="submit" size="sm" disabled={saving}>
                  {saving ? "Salvando..." : "Salvar alterações"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Notificações */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-primary" />
              <div>
                <CardTitle className="text-base">Notificações</CardTitle>
                <CardDescription>Gerencie como você recebe alertas</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {isAdmin && !smtpReadyForEmailNotifications ? (
              <Alert>
                <AlertTitle>SMTP necessário</AlertTitle>
                <AlertDescription>
                  As notificações por e-mail só podem ser ativadas quando o SMTP estiver ativo, configurado e validado por teste.
                </AlertDescription>
              </Alert>
            ) : null}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Notificações por e-mail</p>
                <p className="text-xs text-muted-foreground">
                  {emailNotificationsReady ? "Receba alertas de vendas e atividades" : "Carregando preferência salva..."}
                </p>
              </div>
              <Switch
                checked={emailNotifications}
                disabled={!emailNotificationsReady || savingEmailNotifications}
                onCheckedChange={handleEmailNotificationsToggle}
              />
            </div>
          </CardContent>
        </Card>

        {/* Autenticação de dois fatores */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Smartphone className="h-5 w-5 text-primary" />
              <div>
                <CardTitle className="text-base">Autenticação de dois fatores (2FA)</CardTitle>
                <CardDescription>Adicione uma camada extra de segurança à sua conta</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <TwoFactorSettings hideHeader policyHint="Você pode ativar e desativar no seu perfil." />
          </CardContent>
        </Card>

        {/* Segurança */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              <div>
                <CardTitle className="text-base">Segurança</CardTitle>
                <CardDescription>Altere sua senha de acesso</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="newPassword">Nova senha</Label>
                  <PasswordInput id="newPassword" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Mínimo 6 caracteres" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirmar nova senha</Label>
                  <PasswordInput id="confirmPassword" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Repita a nova senha" />
                </div>
              </div>
              <div className="flex justify-end">
                <Button type="submit" variant="outline" size="sm" disabled={changingPassword}>
                  {changingPassword ? "Alterando..." : "Alterar senha"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </PageContent>
  );
};

export default Profile;
