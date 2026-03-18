import { useState, useRef, useEffect } from "react";
import PageContent from "@/components/layout/PageContent";
import { usePageMeta } from "@/contexts/PageMetaContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { Camera, Trash2, User, Shield } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { maskPhone } from "@/lib/masks";
import { TwoFactorSettings } from "@/components/auth/TwoFactorSettings";

const BuyerProfile = () => {
  const { user, profile, refreshProfile } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!profile) return;
    setName(profile.name || "");
    setPhone(profile.phone || "");
    setAvatarUrl(profile.avatar_url || null);
  }, [profile]);

  useEffect(() => {
    setEmail(user?.email || "");
  }, [user?.email]);

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
    toast({ title: "Foto atualizada!" });
  };

  const handleAvatarRemove = async () => {
    if (!user || !avatarUrl) return;
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
    toast({ title: "Foto removida!" });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .upsert({ user_id: user.id, name, phone }, { onConflict: "user_id" });
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    } else {
      await refreshProfile();
      toast({ title: "Perfil salvo!", description: "Seus dados foram atualizados." });
    }
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

  const initials = name ? name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase() : "?";

  usePageMeta([{ label: "Comprador" }, { label: "Meu Perfil" }], "Meu Perfil");

  return (
    <PageContent className="max-w-2xl space-y-6">
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-5">
            <div className="relative group">
              <Avatar key={avatarUrl || "no-avatar"} className="h-20 w-20 ring-4 ring-primary/10">
                {avatarUrl && <AvatarImage src={avatarUrl} alt={name} />}
                <AvatarFallback className="text-xl font-bold bg-primary/10 text-primary">{initials}</AvatarFallback>
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
                <Camera className="h-5 w-5 text-white" />
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">{name || "—"}</h2>
              <p className="text-sm text-muted-foreground">{email}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-base">Dados pessoais</CardTitle>
              <CardDescription>Atualize suas informações</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome</Label>
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
            </div>
            <div className="flex justify-end">
              <Button type="submit" size="sm" disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-base">Segurança</CardTitle>
              <CardDescription>Altere sua senha e configure 2FA</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="new">Nova senha</Label>
                <PasswordInput id="new" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Mínimo 6 caracteres" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="conf">Confirmar nova senha</Label>
                <PasswordInput id="conf" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Repita a nova senha" />
              </div>
            </div>
            <div className="flex justify-end">
              <Button type="submit" size="sm" variant="outline" disabled={changingPassword}>
                {changingPassword ? "Alterando..." : "Alterar senha"}
              </Button>
            </div>
          </form>

          <div className="mt-6 border-t border-border pt-6 space-y-3">
            <TwoFactorSettings hideHeader policyHint="Opcional para compradores." />
          </div>
        </CardContent>
      </Card>
    </PageContent>
  );
};

export default BuyerProfile;
