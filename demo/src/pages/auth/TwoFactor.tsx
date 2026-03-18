import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import AuthLayout from "@/components/layout/AuthLayout";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

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

const TwoFactor = () => {
  const { user, session, role } = useAuth();
  const [otp, setOtp] = useState("");
  const [useRecovery, setUseRecovery] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState("");
  const [rememberDevice, setRememberDevice] = useState(() => {
    try {
      return sessionStorage.getItem("__mfa_remember_device__") === "1";
    } catch {
      return false;
    }
  });
  const [loading, setLoading] = useState(false);

  const pending = Boolean((session as any)?.mfa_pending);
  const setupRequired = Boolean((session as any)?.mfa_setup_required);

  const nextPath = useMemo(() => getNextPath(role), [role]);

  if (!user) return <Navigate to="/auth/login" replace />;
  if (!pending) return <Navigate to={nextPath} replace />;
  if (setupRequired) return <Navigate to="/auth/2fa/setup" replace />;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = useRecovery
        ? { recovery_code: recoveryCode, remember_device: rememberDevice }
        : { code: otp, remember_device: rememberDevice };
      const { error } = await (supabase.auth as any).verifyTwoFactor(payload);
      if (error) {
        toast.error(error.message || "Código inválido.");
        return;
      }
      try { sessionStorage.removeItem("__mfa_remember_device__"); } catch { /* ignore */ }
      try { sessionStorage.removeItem("__mfa_next__"); } catch { /* ignore */ }
      window.location.assign(nextPath);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Verificação em 2 etapas"
      subtitle="Digite o código do seu autenticador para continuar."
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="flex items-center gap-2">
          <Checkbox
            id="use-recovery"
            checked={useRecovery}
            onCheckedChange={(v) => setUseRecovery(Boolean(v))}
          />
          <Label htmlFor="use-recovery">Usar código de recuperação</Label>
        </div>

        {!useRecovery ? (
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
        ) : (
          <div className="space-y-2">
            <Label htmlFor="recovery">Código de recuperação</Label>
            <Input
              id="recovery"
              placeholder="ABCD-EFGH-IJKL"
              value={recoveryCode}
              onChange={(e) => setRecoveryCode(e.target.value)}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Cada código de recuperação pode ser usado apenas 1 vez.
            </p>
          </div>
        )}

        <div className="flex items-center gap-2">
          <Checkbox
            id="remember-device"
            checked={rememberDevice}
            onCheckedChange={(v) => setRememberDevice(Boolean(v))}
          />
          <Label htmlFor="remember-device">Lembrar este dispositivo</Label>
        </div>

        <Button type="submit" className="w-full" disabled={loading || (!useRecovery && otp.length !== 6) || (useRecovery && !recoveryCode.trim())}>
          {loading ? "Verificando..." : "Confirmar"}
        </Button>
      </form>
    </AuthLayout>
  );
};

export default TwoFactor;
