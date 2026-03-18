import { Navigate } from "react-router-dom";
import { Wrench } from "lucide-react";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";

const MaintenancePage = () => {
  const { data: settings, isLoading, isError } = usePlatformSettings();

  // If maintenance is off, redirect to home
  if (!isLoading && (isError || !settings?.maintenanceMode)) {
    return <Navigate to="/" replace />;
  }

  const logoUrl = settings?.darkLogoUrl || settings?.whiteLogoUrl || settings?.logoUrl || "";
  const platformName = settings?.platformName || "Plataforma";

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 text-center">
      {logoUrl ? (
        <img src={logoUrl} alt={platformName} className="max-h-12 mb-8 object-contain" />
      ) : null}
      <div className="rounded-full bg-muted p-4 mb-6">
        <Wrench className="h-10 w-10 text-muted-foreground" />
      </div>
      <h1 className="text-2xl font-bold text-foreground mb-2">Sistema em Manutenção</h1>
      <p className="text-muted-foreground max-w-md">
        Estamos realizando melhorias na plataforma. Por favor, tente novamente em alguns minutos.
      </p>
    </div>
  );
};

export default MaintenancePage;
