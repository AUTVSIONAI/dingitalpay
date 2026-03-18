import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

export function LoginTwoFactorInline(props: {
  rememberDevice: boolean;
  onBack: () => Promise<void> | void;
  onVerified: () => Promise<void> | void;
}) {
  const { toast } = useToast();
  const [otp, setOtp] = useState("");
  const [useRecovery, setUseRecovery] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = useRecovery
        ? { recovery_code: recoveryCode, remember_device: props.rememberDevice }
        : { code: otp, remember_device: props.rememberDevice };
      const { error } = await (supabase.auth as any).verifyTwoFactor(payload);
      if (error) {
        toast({ title: "Erro", description: error.message || "Código inválido.", variant: "destructive" });
        return;
      }

      await (supabase.auth as any).refreshSession?.();
      await props.onVerified();
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
        <p className="text-sm font-semibold text-foreground">Verificação em 2 etapas</p>
        <p className="text-xs text-muted-foreground">
          Digite o código do seu autenticador para continuar.
        </p>

        <div className="flex items-center gap-2">
          <Checkbox
            id="use-recovery-inline"
            checked={useRecovery}
            onCheckedChange={(v) => setUseRecovery(Boolean(v))}
          />
          <Label htmlFor="use-recovery-inline">Usar código de recuperação</Label>
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
            <Label htmlFor="recovery-inline">Código de recuperação</Label>
            <Input
              id="recovery-inline"
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
      </div>

      <div className="flex flex-col sm:flex-row gap-2 justify-end">
        <Button type="button" variant="outline" onClick={() => props.onBack()} disabled={loading}>
          Voltar
        </Button>
        <Button
          type="submit"
          disabled={loading || (!useRecovery && otp.length !== 6) || (useRecovery && !recoveryCode.trim())}
        >
          {loading ? "Verificando..." : "Confirmar"}
        </Button>
      </div>
    </form>
  );
}

