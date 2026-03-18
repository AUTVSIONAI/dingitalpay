import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import AdminAuthLayout from "@/components/layout/AdminAuthLayout";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import Turnstile, { getTurnstileSiteKey } from "@/components/shared/Turnstile";
import { LoginTwoFactorInline } from "@/components/auth/LoginTwoFactorInline";

const AdminLogin = () => {
  const REMEMBER_DEVICE_KEY = "dingitalpay_remember_device";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberDevice, setRememberDevice] = useState(() => {
    try {
      return localStorage.getItem(REMEMBER_DEVICE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [step, setStep] = useState<"credentials" | "mfa">("credentials");
  const [loading, setLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { signIn, signOut, user, role, session } = useAuth();
  const turnstileSiteKey = getTurnstileSiteKey();

  // If already authenticated as admin, redirect immediately
  useEffect(() => {
    const pending = Boolean((session as any)?.mfa_pending);
    if (user && role === "admin" && !pending) {
      navigate("/admin/dashboard", { replace: true });
    }
  }, [user, role, session, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { error } = await signIn(email, password, { turnstileToken, useTrustedDevice: rememberDevice });

    if (error) {
      toast({ title: "Erro", description: error.message || "Credenciais inválidas.", variant: "destructive" });
      setLoading(false);
      return;
    }

    const { data: { session } } = await supabase.auth.getSession();
    const metaRole = (session?.user?.user_metadata as any)?.role as string | undefined;
    const mfaPending = Boolean((session as any)?.mfa_pending);
    const mfaSetupRequired = Boolean((session as any)?.mfa_setup_required);
    if (mfaPending) {
      if (metaRole && metaRole !== "admin") {
        await signOut();
        toast({
          title: "Acesso negado",
          description: "Esta área é restrita a administradores.",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      if (mfaSetupRequired) {
        navigate("/auth/2fa/setup", { replace: true });
        setLoading(false);
        return;
      }

      setStep("mfa");
      setLoading(false);
      return;
    }

    // Verify admin role - wait a moment for auth state to settle
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (authUser) {
      const { data: userRole } = await supabase.rpc("get_user_role", { _user_id: authUser.id });
      if (userRole !== "admin") {
        await signOut();
        toast({
          title: "Acesso negado",
          description: "Esta área é restrita a administradores.",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }
      toast({ title: "Bem-vindo, Admin!", description: "Acesso autorizado ao painel." });
      // Use replace to avoid back-button issues, and navigate immediately
      navigate("/admin/dashboard", { replace: true });
    }
    setLoading(false);
  };

  return (
    <AdminAuthLayout title="Acesso Admin" subtitle="Entre com suas credenciais de administrador">
      {step === "credentials" ? (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              placeholder="admin@plataforma.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <PasswordInput
              id="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="remember-device-admin-login"
              checked={rememberDevice}
              onCheckedChange={(v) => {
                const next = Boolean(v);
                setRememberDevice(next);
                try {
                  localStorage.setItem(REMEMBER_DEVICE_KEY, next ? "1" : "0");
                } catch {
                  // ignore
                }
              }}
            />
            <Label htmlFor="remember-device-admin-login">Lembrar este dispositivo</Label>
          </div>

          <Turnstile onToken={setTurnstileToken} />

          <Button
            type="submit"
            className="w-full"
            disabled={loading || (Boolean(turnstileSiteKey) && !turnstileToken)}
          >
            {loading ? "Verificando..." : "Entrar no Painel"}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            Não é administrador?{" "}
            <Link to="/auth/login" className="text-primary hover:underline font-medium">
              Login padrão
            </Link>
          </p>
        </form>
      ) : (
        <LoginTwoFactorInline
          rememberDevice={rememberDevice}
          onBack={async () => {
            await signOut();
            setStep("credentials");
          }}
          onVerified={async () => {
            const { data: { user: authUser } } = await supabase.auth.getUser();
            if (!authUser) {
              await signOut();
              setStep("credentials");
              return;
            }
            const { data: userRole } = await supabase.rpc("get_user_role", { _user_id: authUser.id });
            if (userRole !== "admin") {
              await signOut();
              toast({
                title: "Acesso negado",
                description: "Esta área é restrita a administradores.",
                variant: "destructive",
              });
              setStep("credentials");
              return;
            }
            toast({ title: "Bem-vindo, Admin!", description: "Acesso autorizado ao painel." });
            navigate("/admin/dashboard", { replace: true });
          }}
        />
      )}
    </AdminAuthLayout>
  );
};

export default AdminLogin;
