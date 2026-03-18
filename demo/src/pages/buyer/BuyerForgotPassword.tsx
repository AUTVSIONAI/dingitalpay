import { useState } from "react";
import { Link } from "react-router-dom";
import AuthLayout from "@/components/layout/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, UserPlus } from "lucide-react";
import { getBaseUrl } from "@/lib/get-base-url";
import { supabase } from "@/integrations/supabase/client";
import Turnstile, { getTurnstileSiteKey } from "@/components/shared/Turnstile";

const BuyerForgotPassword = () => {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const { toast } = useToast();
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstileSiteKey = getTurnstileSiteKey();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setNotFound(false);

    try {
      const { data } = await supabase.functions.invoke("check-email-exists", {
        body: { email },
      });

      if (!data?.exists) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      const { error } = await supabase.auth.resetPasswordForEmail(
        email,
        {
        redirectTo: `${getBaseUrl()}/buyer/reset`,
        },
        turnstileToken || undefined
      );

      if (error) {
        toast({ title: "Erro", description: error.message, variant: "destructive" });
      } else {
        setSent(true);
        toast({ title: "E-mail enviado!", description: "Verifique sua caixa de entrada." });
      }
    } catch {
      toast({ title: "Erro", description: "Ocorreu um erro. Tente novamente.", variant: "destructive" });
    }
    setLoading(false);
  };

  return (
    <AuthLayout title="Esqueci minha senha" subtitle="Enviaremos um link para redefinir sua senha">
      {sent ? (
        <div className="space-y-4 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <span className="text-2xl">✉️</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Se o e-mail <span className="font-medium text-foreground">{email}</span> estiver cadastrado, você receberá um link de redefinição.
          </p>
          <Link to="/buyer/login">
            <Button variant="outline" className="mt-4 gap-2">
              <ArrowLeft className="h-4 w-4" /> Voltar ao login
            </Button>
          </Link>
        </div>
      ) : notFound ? (
        <div className="space-y-4 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
            <span className="text-2xl">😕</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Não encontramos nenhuma conta com o e-mail <span className="font-medium text-foreground">{email}</span> na plataforma.
          </p>
          <div className="flex flex-col gap-2">
            <Link to="/buyer/register">
              <Button className="w-full gap-2">
                <UserPlus className="h-4 w-4" /> Criar conta
              </Button>
            </Link>
            <Button variant="outline" className="w-full" onClick={() => setNotFound(false)}>
              Tentar outro e-mail
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" type="email" placeholder="seu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <Turnstile onToken={setTurnstileToken} />

          <Button
            type="submit"
            className="w-full"
            disabled={loading || (Boolean(turnstileSiteKey) && !turnstileToken)}
          >
            {loading ? "Verificando..." : "Enviar link"}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            <Link to="/buyer/login" className="text-primary hover:underline">
              Voltar ao login
            </Link>
          </p>
        </form>
      )}
    </AuthLayout>
  );
};

export default BuyerForgotPassword;
