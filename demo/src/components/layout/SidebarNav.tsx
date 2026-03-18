import { useLocation, useNavigate } from "react-router-dom";
import { useTheme } from "next-themes";
import { SidebarMenuItem } from "@/data/sidebar-menus";
import {
  LayoutDashboard, Users, BarChart3, Mail, Megaphone, Palette,
  Trophy, RefreshCw, ShoppingCart, Package, Plug, Wallet,
  ShoppingBag, GraduationCap, User, CreditCard, LogOut, ChevronDown,
  Landmark,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";
import { useAuth } from "@/contexts/AuthContext";

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard, Users, BarChart3, Mail, Megaphone, Palette,
  Trophy, RefreshCw, ShoppingCart, Package, Plug, Wallet,
  ShoppingBag, GraduationCap, User, CreditCard, Landmark,
};

interface SidebarNavProps {
  items: SidebarMenuItem[];
  title: string;
  collapsed?: boolean;
  onNavigate?: () => void;
}

const SidebarNav = ({ items, title, collapsed = false, onNavigate }: SidebarNavProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { resolvedTheme } = useTheme();
  const isAdmin = location.pathname.startsWith("/admin");
  const isBuyer = location.pathname.startsWith("/buyer") || location.pathname.startsWith("/members");
  const profilePath = isAdmin ? "/admin/profile" : isBuyer ? "/buyer/profile" : "/app/profile";
  const { user, profile, role, signOut } = useAuth();

  const displayName = profile?.name || user?.email?.split("@")[0] || "Usuário";
  const displayEmail = user?.email || "";
  const initials = displayName.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();

  const { data: platformSettings } = usePlatformSettings();

  const logoUrl = resolvedTheme === "dark"
    ? (platformSettings?.darkLogoUrl || platformSettings?.logoUrl || null)
    : (platformSettings?.whiteLogoUrl || platformSettings?.logoUrl || null);

  const handleNav = (path: string) => {
    navigate(path);
    onNavigate?.();
  };

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-40 h-screen bg-sidebar-surface border-r border-border flex flex-col transition-all duration-200",
        collapsed ? "w-16" : "w-60"
      )}
    >
      <div className="flex h-16 items-center gap-2 px-4 border-b border-border">
        {logoUrl ? (
          <img src={logoUrl} alt={title} className="h-8 max-w-[140px] object-contain" />
        ) : (
          <>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <span className="text-sm font-bold text-primary-foreground">
                {title.charAt(0)}
              </span>
            </div>
            {!collapsed && (
              <span className="text-sm font-semibold text-foreground truncate">
                {title}
              </span>
            )}
          </>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {items.map((item) => {
          const Icon = iconMap[item.icon];
          const isActive = location.pathname === item.path;

          return (
            <button
              key={item.path}
              onClick={() => handleNav(item.path)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary/15 text-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {Icon && (
                <Icon
                  className={cn(
                    "h-[18px] w-[18px] shrink-0",
                    isActive ? "text-primary" : ""
                  )}
                />
              )}
              {!collapsed && <span className="truncate">{item.label}</span>}
            </button>
          );
        })}
      </nav>

      <div className="border-t border-border p-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2 hover:bg-muted transition-colors cursor-pointer">
              <Avatar key={profile?.avatar_url || "no-avatar"} className="h-8 w-8 shrink-0">
                {profile?.avatar_url && <AvatarImage src={profile.avatar_url} alt={displayName} />}
                <AvatarFallback className="text-xs font-medium bg-primary/10 text-primary">{initials}</AvatarFallback>
              </Avatar>
              {!collapsed && (
                <>
                  <div className="min-w-0 flex-1 text-left">
                    <p className="text-xs font-medium text-foreground truncate">{displayName}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{displayEmail}</p>
                  </div>
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                </>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-48">
            <DropdownMenuItem className="gap-2" onClick={() => { navigate(profilePath); onNavigate?.(); }}>
              <User className="h-4 w-4" />
              Meu perfil
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="gap-2 text-destructive" onClick={async () => { const to = role === "admin" ? "/admin/login" : role === "buyer" ? "/buyer/login" : "/auth/login"; await signOut(); navigate(to, { replace: true }); }}>
              <LogOut className="h-4 w-4" />
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  );
};

export default SidebarNav;
