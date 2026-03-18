import { ReactNode } from "react";
import { useState } from "react";
import SidebarNav from "./SidebarNav";
import TopHeader from "./TopHeader";
import MobileHeader from "./MobileHeader";
import MobileBottomNav from "./MobileBottomNav";
import { SidebarMenuItem } from "@/data/sidebar-menus";
import { useBreakpoint } from "@/hooks/use-breakpoint";
import { usePageMetaValues } from "@/contexts/PageMetaContext";
import { Menu, AlertTriangle } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useMaintenanceGuard } from "@/hooks/useMaintenanceGuard";

interface AppShellProps {
  children: ReactNode;
  menuItems: SidebarMenuItem[];
  menuTitle: string;
}

const MaintenanceBanner = () => {
  const { isMaintenanceMode } = useMaintenanceGuard();
  if (!isMaintenanceMode) return null;
  return (
    <div className="bg-destructive/10 border-b border-destructive/20 px-4 py-2 flex items-center gap-2 text-sm text-destructive">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span className="font-medium">Modo Manutenção ativo</span>
      <span className="text-destructive/70">— O site está inacessível para usuários não-admin.</span>
    </div>
  );
};

const AppShell = ({ children, menuItems, menuTitle }: AppShellProps) => {
  const { isMobile, isTablet } = useBreakpoint();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { breadcrumbs, pageTitle } = usePageMetaValues();

  // Mobile layout
  if (isMobile) {
    return (
      <div
        className="bg-background"
        style={{ minHeight: '100dvh', paddingBottom: 'calc(4rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <MaintenanceBanner />
        <MobileHeader title={pageTitle} />
        <main className="p-4">
          {children}
        </main>
        <MobileBottomNav items={menuItems} />
      </div>
    );
  }

  // Tablet layout
  if (isTablet) {
    return (
      <div className="min-h-screen bg-background">
        <MaintenanceBanner />
        <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
          <SheetContent side="left" className="p-0 w-60">
            <SidebarNav items={menuItems} title={menuTitle} onNavigate={() => setSidebarOpen(false)} />
          </SheetContent>
        </Sheet>
        <TopHeader
          breadcrumbs={breadcrumbs}
          title={pageTitle}
          leadingAction={
            <Button variant="ghost" size="icon" className="mr-2" onClick={() => setSidebarOpen(true)}>
              <Menu className="h-5 w-5" />
            </Button>
          }
        />
        <main className="p-5">
          {children}
        </main>
      </div>
    );
  }

  // Desktop layout
  return (
    <div className="min-h-screen bg-background">
      <SidebarNav items={menuItems} title={menuTitle} />
      <div className="pl-60">
        <MaintenanceBanner />
        <TopHeader breadcrumbs={breadcrumbs} title={pageTitle} />
        <main className="p-6">
          {children}
        </main>
      </div>
    </div>
  );
};

export default AppShell;
