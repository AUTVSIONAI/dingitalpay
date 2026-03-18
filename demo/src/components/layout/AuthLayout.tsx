import { ReactNode } from "react";
import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";

interface AuthLayoutProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
}

const AuthLayout = ({ children, title, subtitle }: AuthLayoutProps) => {
  const { resolvedTheme, setTheme } = useTheme();
  const { data: settings } = usePlatformSettings();

  const isDark = resolvedTheme === "dark";
  const logoUrl = isDark
    ? (settings?.darkLogoUrl || settings?.logoUrl || null)
    : (settings?.whiteLogoUrl || settings?.logoUrl || null);

  return (
    <div className="min-h-screen flex relative">
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-4 left-4 z-20 lg:left-4 lg:right-auto right-4"
        onClick={() => setTheme(isDark ? "light" : "dark")}
        aria-label="Alternar tema"
      >
        {isDark ? <Sun className="h-5 w-5 text-muted-foreground" /> : <Moon className="h-5 w-5 text-muted-foreground" />}
      </Button>

      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-md space-y-8">
          <div className="flex flex-col items-center gap-3">
            {logoUrl ? (
              <img
                key={`logo-${isDark ? "dark" : "light"}`}
                src={logoUrl}
                alt={settings?.platformName || "Logo"}
                className="h-10 w-auto object-contain"
              />
            ) : null}
            <h1 className="text-2xl font-bold text-foreground">{title}</h1>
            {subtitle && (
              <p className="text-sm text-muted-foreground text-center">{subtitle}</p>
            )}
          </div>
          {children}
        </div>
      </div>

      <div className="hidden lg:flex lg:flex-1 items-center justify-center bg-primary/5 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent" />
        <div className="relative z-10 max-w-md text-center space-y-4 px-8">
          <h2 className="text-xl font-semibold text-foreground">Plataforma de Infoprodutos</h2>
          <p className="text-sm text-muted-foreground">Gerencie seus produtos digitais, vendas e alunos em um só lugar.</p>
        </div>
      </div>
    </div>
  );
};

export default AuthLayout;
