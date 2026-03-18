import { useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const EmailVerified = () => {
  const [searchParams] = useSearchParams();
  const loginPath = searchParams.get("login") || "/auth/login";
  const { theme, setTheme } = useTheme();

  // Sign out any existing session to prevent cross-session contamination
  useEffect(() => {
    supabase.auth.signOut();
  }, []);

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
            <CheckCircle2 className="h-8 w-8 text-primary" />
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight">E-mail verificado!</h1>
            <p className="text-muted-foreground">
              Seu e-mail foi verificado com sucesso. Agora você pode fazer login e começar a usar a plataforma.
            </p>
          </div>

          <Button asChild className="w-full">
            <Link to={loginPath}>
              <LogIn className="h-4 w-4 mr-2" />
              Fazer login
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default EmailVerified;
