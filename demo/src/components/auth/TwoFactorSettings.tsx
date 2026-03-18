import { useEffect, useState } from "react";
import { Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import CopyToClipboardField from "@/components/shared/CopyToClipboardField";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { QRCodeSVG } from "qrcode.react";

type SetupData = {
  otpauth_uri: string;
  secret_base32: string;
  issuer: string;
  account_name: string;
};

export function TwoFactorSettings(props: { policyHint?: string; hideHeader?: boolean }) {
  const { toast } = useToast();
  const { profile, refreshProfile } = useAuth();

  const twoFactorEnabled = Boolean(profile?.two_factor_enabled);

  const [setupOpen, setSetupOpen] = useState(false);
  const [setupLoading, setSetupLoading] = useState(false);
  const [setupBusy, setSetupBusy] = useState(false);
  const [setup, setSetup] = useState<SetupData | null>(null);
  const [setupOtp, setSetupOtp] = useState("");
  const [setupRecoveryCodes, setSetupRecoveryCodes] = useState<string[] | null>(null);

  const [regenOpen, setRegenOpen] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);
  const [mfaOtp, setMfaOtp] = useState("");
  const [mfaUseRecovery, setMfaUseRecovery] = useState(false);
  const [mfaRecovery, setMfaRecovery] = useState("");
  const [mfaBusy, setMfaBusy] = useState(false);
  const [newRecoveryCodes, setNewRecoveryCodes] = useState<string[] | null>(null);

  const startSetup = async () => {
    setSetupLoading(true);
    try {
      const { data, error } = await (supabase.auth as any).startTwoFactorSetup();
      if (error) {
        toast({ title: "Erro", description: error.message || "Não foi possível iniciar o 2FA.", variant: "destructive" });
        return;
      }
      setSetup(data as SetupData);
    } finally {
      setSetupLoading(false);
    }
  };

  useEffect(() => {
    if (!setupOpen) return;
    if (twoFactorEnabled) return;
    if (setupRecoveryCodes) return;
    if (setup || setupLoading) return;
    void startSetup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setupOpen, twoFactorEnabled, setupRecoveryCodes]);

  const confirmSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!setup) return;
    setSetupBusy(true);
    try {
      const { data, error } = await (supabase.auth as any).confirmTwoFactorSetup({ code: setupOtp });
      if (error) {
        toast({ title: "Erro", description: error.message || "Código inválido.", variant: "destructive" });
        return;
      }
      setSetupRecoveryCodes(((data?.recovery_codes || []) as string[]) || []);
      await refreshProfile();
      toast({ title: "2FA ativado", description: "Salve seus códigos de recuperação." });
    } finally {
      setSetupBusy(false);
    }
  };

  const closeSetup = () => {
    setSetupOpen(false);
    setSetupLoading(false);
    setSetupBusy(false);
    setSetup(null);
    setSetupOtp("");
    setSetupRecoveryCodes(null);
  };

  const handleRegenerateRecoveryCodes = async () => {
    setMfaBusy(true);
    try {
      const { data, error } = await (supabase.auth as any).regenerateTwoFactorRecoveryCodes({ code: mfaOtp });
      if (error) {
        toast({ title: "Erro", description: error.message || "Código inválido.", variant: "destructive" });
        return;
      }
      setNewRecoveryCodes((data?.recovery_codes || []) as string[]);
      toast({ title: "Códigos gerados", description: "Salve os novos códigos em um local seguro." });
    } finally {
      setMfaBusy(false);
    }
  };

  const handleDisableTwoFactor = async () => {
    setMfaBusy(true);
    try {
      const payload = mfaUseRecovery ? { recovery_code: mfaRecovery } : { code: mfaOtp };
      const { error } = await (supabase.auth as any).disableTwoFactor(payload);
      if (error) {
        toast({ title: "Erro", description: error.message || "Código inválido.", variant: "destructive" });
        return;
      }
      toast({ title: "2FA desativado" });
      setDisableOpen(false);
      setMfaOtp("");
      setMfaRecovery("");
      setMfaUseRecovery(false);
      await refreshProfile();
    } finally {
      setMfaBusy(false);
    }
  };

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        {!props.hideHeader ? (
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary shrink-0" />
              <p className="text-sm font-semibold text-foreground">Autenticação em 2 fatores (2FA)</p>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Use um app autenticador (Google Authenticator/Authy). {props.policyHint ? props.policyHint : "Opcional por enquanto."}
            </p>
          </div>
        ) : (
          <div />
        )}
        {!twoFactorEnabled ? (
          <Button
            size="sm"
            onClick={() => {
              setSetupOpen((v) => !v);
            }}
          >
            {setupOpen ? "Fechar" : "Ativar 2FA"}
          </Button>
        ) : (
          <div className="flex gap-2 shrink-0">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setNewRecoveryCodes(null);
                setMfaOtp("");
                setRegenOpen(true);
              }}
            >
              Códigos
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => {
                setMfaOtp("");
                setMfaRecovery("");
                setMfaUseRecovery(false);
                setDisableOpen(true);
              }}
            >
              Desativar
            </Button>
          </div>
        )}
      </div>

      {!twoFactorEnabled && (
        <Collapsible open={setupOpen} onOpenChange={setSetupOpen}>
          <CollapsibleContent>
            <div className="mt-4 rounded-lg border border-border bg-muted/30 p-4 space-y-4">
              {setupRecoveryCodes ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">Códigos de recuperação</p>
                      <p className="text-xs text-muted-foreground">
                        Salve estes códigos em um local seguro. Cada código pode ser usado apenas 1 vez.
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const text = setupRecoveryCodes.join("\n");
                        navigator.clipboard.writeText(text);
                        toast({ title: "Copiado", description: "Códigos copiados para a área de transferência." });
                      }}
                    >
                      Copiar
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 gap-2 font-mono text-sm">
                    {setupRecoveryCodes.map((c) => (
                      <div key={c} className="rounded-md border border-border bg-background px-2 py-1 text-center">
                        {c}
                      </div>
                    ))}
                  </div>

                  <div className="flex justify-end gap-2 pt-1">
                    <Button variant="outline" onClick={closeSetup}>
                      Concluir
                    </Button>
                  </div>
                </div>
              ) : (
                <form onSubmit={confirmSetup} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-[220px,1fr] gap-4">
                    <div className="rounded-lg border border-border bg-background p-3 flex items-center justify-center">
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
                          {setupLoading ? "Gerando QR Code..." : "QR Code indisponível"}
                        </div>
                      )}
                    </div>

                    <div className="space-y-3">
                      <CopyToClipboardField value={setup?.secret_base32 || ""} label="Chave (manual)" />
                      <p className="text-xs text-muted-foreground">
                        Se preferir, digite a chave manualmente no Google Authenticator.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Código (6 dígitos)</Label>
                    <div className="flex justify-center">
                      <InputOTP
                        maxLength={6}
                        value={setupOtp}
                        onChange={(v) => setSetupOtp(v)}
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

                  <div className="flex flex-col sm:flex-row gap-2 justify-end">
                    <Button type="button" variant="outline" onClick={closeSetup}>
                      Cancelar
                    </Button>
                    <Button type="submit" disabled={setupBusy || setupLoading || !setup || setupOtp.length !== 6}>
                      {setupBusy ? "Ativando..." : "Ativar 2FA"}
                    </Button>
                  </div>
                </form>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      <Dialog open={regenOpen} onOpenChange={setRegenOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Gerar novos códigos de recuperação</DialogTitle>
            <DialogDescription>Digite um código do autenticador para confirmar.</DialogDescription>
          </DialogHeader>

          {newRecoveryCodes ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 font-mono text-sm">
                {newRecoveryCodes.map((c) => (
                  <div key={c} className="rounded-md border border-border bg-muted/30 px-2 py-1 text-center">
                    {c}
                  </div>
                ))}
              </div>
              <DialogFooter>
                <Button onClick={() => setRegenOpen(false)}>Fechar</Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Código (6 dígitos)</Label>
                <div className="flex justify-center">
                  <InputOTP maxLength={6} value={mfaOtp} onChange={setMfaOtp} containerClassName="justify-center" autoFocus>
                    <InputOTPGroup>
                      {Array.from({ length: 6 }).map((_, idx) => (
                        <InputOTPSlot key={idx} index={idx} />
                      ))}
                    </InputOTPGroup>
                  </InputOTP>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setRegenOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleRegenerateRecoveryCodes} disabled={mfaBusy || mfaOtp.length !== 6}>
                  {mfaBusy ? "Gerando..." : "Gerar"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={disableOpen} onOpenChange={setDisableOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Desativar 2FA</DialogTitle>
            <DialogDescription>Confirme com um código do autenticador (ou um código de recuperação).</DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-2">
            <Checkbox checked={mfaUseRecovery} onCheckedChange={(v) => setMfaUseRecovery(Boolean(v))} id="use-recovery-disable" />
            <Label htmlFor="use-recovery-disable">Usar código de recuperação</Label>
          </div>

          {!mfaUseRecovery ? (
            <div className="space-y-2">
              <Label>Código (6 dígitos)</Label>
              <div className="flex justify-center">
                <InputOTP maxLength={6} value={mfaOtp} onChange={setMfaOtp} containerClassName="justify-center" autoFocus>
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
              <Label htmlFor="recovery-disable">Código de recuperação</Label>
              <Input
                id="recovery-disable"
                value={mfaRecovery}
                onChange={(e) => setMfaRecovery(e.target.value)}
                placeholder="ABCD-EFGH-IJKL"
                autoFocus
              />
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDisableOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleDisableTwoFactor}
              disabled={mfaBusy || (!mfaUseRecovery && mfaOtp.length !== 6) || (mfaUseRecovery && !mfaRecovery.trim())}
            >
              {mfaBusy ? "Desativando..." : "Desativar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
