import { ReactNode, useEffect, useState } from "react";
import { Bell, ChevronDown, LogOut, User, Sun, Moon, Check, CheckCheck, X } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useNavigate, useLocation } from "react-router-dom";
import { BreadcrumbItem } from "@/types";
import Breadcrumbs from "./Breadcrumbs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { useTheme } from "next-themes";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";

interface TopHeaderProps {
  breadcrumbs: BreadcrumbItem[];
  title: string;
  leadingAction?: ReactNode;
}

interface Notification {
  id: string;
  text: string;
  read: boolean;
  created_at: string;
}

const formatRelativeTime = (dateStr: string) => {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "agora";
  if (mins < 60) return `há ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `há ${hours}h`;
  return `há ${Math.floor(hours / 24)}d`;
};

const TopHeader = ({ breadcrumbs, title, leadingAction }: TopHeaderProps) => {
  const { theme, setTheme } = useTheme();
  const { user, profile, role, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isAdmin = location.pathname.startsWith("/admin");
  const profilePath = isAdmin ? "/admin/profile" : location.pathname.startsWith("/buyer") || location.pathname.startsWith("/members") ? "/buyer/profile" : "/app/profile";

  const [notifications, setNotifications] = useState<Notification[]>([]);

  const loadNotifications = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("notifications")
      .select("id, text, read, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);
    setNotifications(data ?? []);
  };

  useEffect(() => {
    loadNotifications();
  }, [user]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAsRead = async (id: string) => {
    await supabase.from("notifications").update({ read: true }).eq("id", id);
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
  };

  const markAllAsRead = async () => {
    const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id);
    if (unreadIds.length === 0) return;
    await supabase.from("notifications").update({ read: true }).in("id", unreadIds);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const removeNotification = async (id: string) => {
    await supabase.from("notifications").delete().eq("id", id);
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const initials = profile?.name ? profile.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase() : "??";

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background/80 backdrop-blur-sm px-4 md:px-6">
      <div className="flex items-center min-w-0">
        {leadingAction}
        <div className="flex flex-col justify-center min-w-0">
          <Breadcrumbs items={breadcrumbs} />
          <h1 className="text-lg font-semibold text-foreground leading-tight truncate">{title}</h1>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
          {theme === "dark" ? <Sun className="h-[18px] w-[18px] text-muted-foreground" /> : <Moon className="h-[18px] w-[18px] text-muted-foreground" />}
        </Button>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="h-[18px] w-[18px] text-muted-foreground" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-0">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <p className="text-sm font-semibold text-foreground">Notificações</p>
              {unreadCount > 0 && (
                <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground" onClick={markAllAsRead}>
                  <CheckCheck className="h-3.5 w-3.5" />
                  Marcar todas como lidas
                </Button>
              )}
            </div>
            <div className="max-h-80 overflow-y-auto">
              {notifications.length === 0 ? (
                <p className="text-xs text-muted-foreground py-8 text-center">Nenhuma notificação recente.</p>
              ) : (
                <AnimatePresence initial={false}>
                  {notifications.map((n) => (
                    <motion.div
                      key={n.id}
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0, marginTop: 0, marginBottom: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <div className={`group flex items-start gap-3 px-4 py-3 border-b border-border/50 last:border-0 transition-colors hover:bg-muted/50 ${n.read ? "opacity-60" : ""}`}>
                        <div className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${n.read ? "bg-muted-foreground/30" : "bg-primary"}`} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-foreground leading-snug">{n.text}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{formatRelativeTime(n.created_at)}</p>
                        </div>
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          {!n.read && (
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => markAsRead(n.id)} title="Marcar como lida">
                              <Check className="h-3.5 w-3.5 text-muted-foreground" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeNotification(n.id)} title="Remover">
                            <X className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              )}
            </div>
          </PopoverContent>
        </Popover>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="gap-2 px-2">
              <Avatar key={profile?.avatar_url || "no-avatar"} className="h-7 w-7">
                {profile?.avatar_url && <AvatarImage src={profile.avatar_url} alt={profile.name} />}
                <AvatarFallback className="text-xs font-medium bg-primary/10 text-primary">{initials}</AvatarFallback>
              </Avatar>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem className="gap-2" onClick={() => navigate(profilePath)}>
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
    </header>
  );
};

export default TopHeader;
