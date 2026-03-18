import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import AuthLayout from "@/components/layout/AuthLayout";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import Turnstile, { getTurnstileSiteKey } from "@/components/shared/Turnstile";

const ResetPassword = () => {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [isRecovery, setIsRecovery] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();
  const turnstileSiteKey = getTurnstileSiteKey();

  useEffect(() => {
    // Check if this is a recovery flow from the URL hash
    const hash = window.location.hash;
    if (hash.includes("type=recovery")) {
      setIsRecovery(true);
    }

    // Listen for PASSWORD_RECOVERY event
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setIsRecovery(true);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast({ title: "Erro", description: "As senhas não coincidem.", variant: "destructive" });
      return;
    }
    setLoading(true);

    const { error } = await supabase.auth.updateUser(
      { password },
      turnstileToken || undefined
    );

    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Senha redefinida!", description: "Faça login com sua nova senha." });
      await supabase.auth.signOut();
      navigate("/auth/login");
    }
    setLoading(false);
  };

  if (!isRecovery) {
    return (
      <AuthLayout title="Link inválido" subtitle="Este link de redefinição não é válido ou expirou.">
        <div className="text-center">
          <Button onClick={() => navigate("/auth/forgot")} variant="outline">
            Solicitar novo link
          </Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Redefinir senha" subtitle="Escolha uma nova senha para sua conta">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="password">Nova senha</Label>
          <PasswordInput id="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirmar nova senha</Label>
          <PasswordInput id="confirmPassword" placeholder="••••••••" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
        </div>
        <Turnstile onToken={setTurnstileToken} />
        <Button
          type="submit"
          className="w-full"
          disabled={loading || (Boolean(turnstileSiteKey) && !turnstileToken)}
        >
          {loading ? "Salvando..." : "Redefinir senha"}
        </Button>
      </form>
    </AuthLayout>
  );
};

export default ResetPassword;
