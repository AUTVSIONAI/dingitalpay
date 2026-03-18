import { Link, useSearchParams } from "react-router-dom";
import { MailCheck, ArrowLeft, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";

const EmailConfirmation = () => {
  const [searchParams] = useSearchParams();
  const loginPath = searchParams.get("login") || "/auth/login";
  const { theme, setTheme } = useTheme();

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 relative">
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-4 left-4 z-20"
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        aria-label="Alternar tema"
      >
        {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
      </Button>

      <Card className="w-full max-w-md text-center">
        <CardContent className="pt-8 pb-8 space-y-6">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <MailCheck className="h-8 w-8 text-primary" />
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight">Verifique seu e-mail</h1>
            <p className="text-muted-foreground">
              Enviamos um e-mail de confirmação para você. Clique no link contido no e-mail para ativar sua conta.
            </p>
          </div>

          <div className="rounded-lg border border-border bg-muted/50 p-4 text-sm text-muted-foreground space-y-2">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-yellow-500" />
              <p>
                Não recebeu o e-mail? Verifique sua <strong>caixa de spam</strong> ou <strong>lixo eletrônico</strong>. O e-mail pode levar alguns minutos para chegar.
              </p>
            </div>
          </div>

          <Button asChild variant="outline" className="w-full">
            <Link to={loginPath}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar para o login
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default EmailConfirmation;
