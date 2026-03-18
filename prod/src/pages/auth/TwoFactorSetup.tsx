import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import AuthLayout from "@/components/layout/AuthLayout";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";

function getNextPath(role: string | null): string {
  try {
    const next = sessionStorage.getItem("__mfa_next__");
    if (next) return next;
  } catch {
    // ignore
  }
  if (role === "admin") return "/admin/dashboard";
  if (role === "seller") return "/app/dashboard";
  return "/buyer/purchases";
}

type SetupData = {
  otpauth_uri: string;
  secret_base32: string;
  issuer: string;
  account_name: string;
};

const TwoFactorSetup = () => {
  const { user, session, role } = useAuth();
  const [setup, setSetup] = useState<SetupData | null>(null);
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);

  const pending = Boolean((session as any)?.mfa_pending);
  const setupRequired = Boolean((session as any)?.mfa_setup_required);

  const nextPath = useMemo(() => getNextPath(role), [role]);

  useEffect(() => {
    if (!user) return;
    if (recoveryCodes) return;
    if (setup) return;
    setLoading(true);
    (async () => {
      const { data, error } = await (supabase.auth as any).startTwoFactorSetup();
      if (error) {
        toast.error(error.message || "Não foi possível iniciar o 2FA.");
      } else {
        setSetup(data as SetupData);
      }
      setLoading(false);
    })();
  }, [user, setup, recoveryCodes]);

  if (!user) return <Navigate to="/auth/login" replace />;

  // Optional: if user is not pending/setup-required, allow setup anyway (buyer opt-in)
  if (!pending && setupRequired) return <Navigate to="/auth/2fa" replace />;

  const onConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data, error } = await (supabase.auth as any).confirmTwoFactorSetup({ code: otp });
      if (error) {
        toast.error(error.message || "Código inválido.");
        return;
      }
      const codes = (data?.recovery_codes || []) as string[];
      setRecoveryCodes(codes);
      toast.success("2FA ativado com sucesso.");
    } finally {
      setLoading(false);
    }
  };

  const onContinue = () => {
    try { sessionStorage.removeItem("__mfa_next__"); } catch { /* ignore */ }
    window.location.assign(nextPath);
  };

  return (
    <AuthLayout
      title="Ativar autenticação em 2 fatores"
      subtitle="Obrigatório para vendedores e compradores. Recomendado para todos."
    >
      {recoveryCodes ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <h3 className="font-semibold text-foreground mb-2">Códigos de recuperação</h3>
            <p className="text-sm text-muted-foreground mb-3">
              Salve estes códigos em um local seguro. Cada código pode ser usado apenas 1 vez.
            </p>
            <div className="grid grid-cols-2 gap-2 font-mono text-sm">
              {recoveryCodes.map((c) => (
                <div key={c} className="rounded-md border border-border bg-background px-2 py-1 text-center">
                  {c}
                </div>
              ))}
            </div>
          </div>
          <Button className="w-full" onClick={onContinue}>
            Continuar
          </Button>
        </div>
      ) : (
        <form onSubmit={onConfirm} className="space-y-4">
          <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
            <div className="flex justify-center">
              {setup?.otpauth_uri ? (
                <div className="rounded-xl bg-white p-3 shadow-sm">
                  <QRCodeSVG
                    value={setup.otpauth_uri}
                    size={188}
                    level="M"
                    includeMargin
                    bgColor="#FFFFFF"
                    fgColor="#000000"
                  />
                </div>
              ) : (
                <div className="h-[188px] w-[188px] flex items-center justify-center text-sm text-muted-foreground">
                  {loading ? "Gerando QR Code..." : "QR Code indisponível"}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="secret">Chave (manual)</Label>
              <Input id="secret" value={setup?.secret_base32 || ""} readOnly />
              <p className="text-xs text-muted-foreground">
                Se preferir, digite esta chave manualmente no Google Authenticator.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Código (6 dígitos)</Label>
            <div className="flex justify-center">
              <InputOTP
                maxLength={6}
                value={otp}
                onChange={(v) => setOtp(v)}
                containerClassName="justify-center"
                autoFocus
              >
                <InputOTPGroup>
                  {Array.from({ length: 6 }).map((_, idx) => (
                    <InputOTPSlot key={idx} index={idx} />
                  ))}
                </InputOTPGroup>
              </InputOTP>
            </div>
          </div>

          <Button type="submit" className="w-full" disabled={loading || otp.length !== 6 || !setup}>
            {loading ? "Ativando..." : "Ativar 2FA"}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
};

export default TwoFactorSetup;
