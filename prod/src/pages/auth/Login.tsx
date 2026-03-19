import { useMemo, useState, useEffect } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import AuthLayout from "@/components/layout/AuthLayout";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Separator } from "@/components/ui/separator";
import { useAuth, AppRole } from "@/contexts/AuthContext";
import TermsAndPrivacy from "@/components/shared/TermsAndPrivacy";
import Turnstile, { getTurnstileSiteKey } from "@/components/shared/Turnstile";
import { LoginTwoFactorInline } from "@/components/auth/LoginTwoFactorInline";

const Login = () => {
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
  const location = useLocation();
  const { toast } = useToast();
  const { signIn, signOut, user, role, session } = useAuth();
  const turnstileSiteKey = getTurnstileSiteKey();
  const safeReturnTo = useMemo(() => {
    const value = new URLSearchParams(location.search).get("returnTo");
    if (!value) return null;
    if (!value.startsWith("/") || value.startsWith("//")) return null;
    return value;
  }, [location.search]);

  // If already authenticated as seller, redirect immediately
  useEffect(() => {
    const pending = Boolean((session as any)?.mfa_pending);
    if (user && role === "seller" && !pending) {
      navigate(safeReturnTo || "/app/dashboard", { replace: true });
    }
  }, [user, role, session, navigate, safeReturnTo]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { error } = await signIn(email, password, { turnstileToken, useTrustedDevice: rememberDevice });

    if (error) {
      toast({ title: "Erro", description: error.message || "Credenciais inválidas.", variant: "destructive" });
      setLoading(false);
      return;
    }

    const { supabase } = await import("@/integrations/supabase/client");
    const { data: { session } } = await supabase.auth.getSession();
    const mfaPending = Boolean((session as any)?.mfa_pending);
    const mfaSetupRequired = Boolean((session as any)?.mfa_setup_required);
    const metaRole = (session?.user?.user_metadata as any)?.role as AppRole | undefined;

    if (mfaPending) {
      // Best-effort role gate before MFA (avoid calling RPC while pending).
      if (metaRole && metaRole !== "seller") {
        await signOut();
        const messages: Record<string, string> = {
          admin: "Administradores devem acessar pelo painel admin.",
          buyer: "Compradores devem acessar pela área de compras.",
        };
        toast({
          title: "Acesso restrito",
          description: messages[(metaRole as string)] || "Tipo de conta incompatível.",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      // If setup is required, keep the existing setup page (fallback).
      if (mfaSetupRequired) {
        navigate("/auth/2fa/setup", { replace: true });
        setLoading(false);
        return;
      }

      setStep("mfa");
      setLoading(false);
      return;
    }

    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (authUser) {
      const { data: userRole } = await supabase.rpc("get_user_role", { _user_id: authUser.id });
      if (userRole !== "seller") {
        await signOut();
        const messages: Record<string, string> = {
          admin: "Administradores devem acessar pelo painel admin.",
          buyer: "Compradores devem acessar pela área de compras.",
        };
        toast({
          title: "Acesso restrito",
          description: messages[(userRole as string)] || "Tipo de conta incompatível.",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }
      toast({ title: "Login realizado!", description: "Bem-vindo de volta." });
      navigate(safeReturnTo || "/app/dashboard", { replace: true });
    }
    setLoading(false);
  };

  return (
    <AuthLayout title="Acessar sua conta" subtitle="É muito bom ter você de volta!">
      {step === "credentials" ? (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <Button asChild variant="ghost">
              <Link to="/">Voltar ao site</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/buyer/login">Sou comprador</Link>
            </Button>
          </div>

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
              <Link to="/auth/forgot" className="text-xs text-primary hover:underline">
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
              id="remember-device-login"
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
            <Label htmlFor="remember-device-login">Lembrar este dispositivo</Label>
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
            <Link to="/auth/register" className="text-primary hover:underline font-medium">
              Cadastre-se
            </Link>
          </p>

          <Separator className="my-4" />

          <p className="text-center text-sm text-muted-foreground">
            É cliente?{" "}
            <Link to="/buyer/login" className="text-primary hover:underline font-medium">
              Acesse a área do cliente
            </Link>
            {" "}ou{" "}
            <Link to="/buyer/register" className="text-primary hover:underline font-medium">
              crie uma conta
            </Link>
            .
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
            const { supabase } = await import("@/integrations/supabase/client");
            const { data: { user: authUser } } = await supabase.auth.getUser();
            if (!authUser) {
              await signOut();
              setStep("credentials");
              return;
            }
            const { data: userRole } = await supabase.rpc("get_user_role", { _user_id: authUser.id });
            if (userRole !== "seller") {
              await signOut();
              const messages: Record<string, string> = {
                admin: "Administradores devem acessar pelo painel admin.",
                buyer: "Compradores devem acessar pela área de compras.",
              };
              toast({
                title: "Acesso restrito",
                description: messages[(userRole as string)] || "Tipo de conta incompatível.",
                variant: "destructive",
              });
              setStep("credentials");
              return;
            }
            toast({ title: "Login realizado!", description: "Bem-vindo de volta." });
            navigate(safeReturnTo || "/app/dashboard", { replace: true });
          }}
        />
      )}
    </AuthLayout>
  );
};

export default Login;
