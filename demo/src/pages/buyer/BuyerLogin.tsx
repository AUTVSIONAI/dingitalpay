import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import AuthLayout from "@/components/layout/AuthLayout";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import TermsAndPrivacy from "@/components/shared/TermsAndPrivacy";
import Turnstile, { getTurnstileSiteKey } from "@/components/shared/Turnstile";
import { LoginTwoFactorInline } from "@/components/auth/LoginTwoFactorInline";

const BuyerLogin = () => {
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
  const { signIn, user, role, session } = useAuth();
  const turnstileSiteKey = getTurnstileSiteKey();

  // If already authenticated as buyer, redirect immediately
  useEffect(() => {
    const pending = Boolean((session as any)?.mfa_pending);
    if (user && role === "buyer" && !pending) {
      navigate("/buyer/purchases", { replace: true });
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
      if (metaRole && metaRole !== "buyer") {
        await supabase.auth.signOut();
        toast({
          title: "Acesso restrito",
          description: metaRole === "admin"
            ? "Administradores devem acessar pelo painel admin."
            : "Vendedores devem acessar pelo painel de vendas.",
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

    // Verify role
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (authUser) {
      const { data: userRole } = await supabase.rpc("get_user_role", { _user_id: authUser.id });
      if (userRole !== "buyer") {
        await supabase.auth.signOut();
        toast({
          title: "Acesso restrito",
          description: userRole === "admin"
            ? "Administradores devem acessar pelo painel admin."
            : "Vendedores devem acessar pelo painel de vendas.",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }
      toast({ title: "Login realizado!", description: "Bem-vindo de volta." });
      navigate("/buyer/purchases", { replace: true });
    }
    setLoading(false);
  };

  return (
    <AuthLayout title="Área do cliente" subtitle="Acesse suas compras e cursos">
      {step === "credentials" ? (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              placeholder="seu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Senha</Label>
              <Link to="/buyer/forgot" className="text-xs text-primary hover:underline">
                Esqueceu a senha?
              </Link>
            </div>
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
              id="remember-device-buyer-login"
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
            <Label htmlFor="remember-device-buyer-login">Lembrar este dispositivo</Label>
          </div>

          <Turnstile onToken={setTurnstileToken} />

          <Button
            type="submit"
            className="w-full"
            disabled={loading || (Boolean(turnstileSiteKey) && !turnstileToken)}
          >
            {loading ? "Entrando..." : "Entrar"}
          </Button>

          <TermsAndPrivacy mode="login" />

          <p className="text-center text-sm text-muted-foreground">
            Não tem conta?{" "}
            <Link to="/buyer/register" className="text-primary hover:underline font-medium">
              Cadastre-se
            </Link>
          </p>
        </form>
      ) : (
        <LoginTwoFactorInline
          rememberDevice={rememberDevice}
          onBack={async () => {
            await supabase.auth.signOut();
            setStep("credentials");
          }}
          onVerified={async () => {
            const { data: { user: authUser } } = await supabase.auth.getUser();
            if (!authUser) {
              await supabase.auth.signOut();
              setStep("credentials");
              return;
            }
            const { data: userRole } = await supabase.rpc("get_user_role", { _user_id: authUser.id });
            if (userRole !== "buyer") {
              await supabase.auth.signOut();
              toast({
                title: "Acesso restrito",
                description: userRole === "admin"
                  ? "Administradores devem acessar pelo painel admin."
                  : "Vendedores devem acessar pelo painel de vendas.",
                variant: "destructive",
              });
              setStep("credentials");
              return;
            }
            toast({ title: "Login realizado!", description: "Bem-vindo de volta." });
            navigate("/buyer/purchases", { replace: true });
          }}
        />
      )}
    </AuthLayout>
  );
};

export default BuyerLogin;
