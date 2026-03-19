import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, Sun, Moon, Check, CheckCheck, X, LogOut, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "next-themes";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface MobileHeaderProps {
  title: string;
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

const MobileHeader = ({ title }: MobileHeaderProps) => {
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const { user, profile, role, signOut } = useAuth();
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
  const displayName = profile?.name || user?.email?.split("@")[0] || "Usuário";
  const initials = useMemo(() => displayName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase(), [displayName]);
  const profilePath = role === "admin" ? "/admin/profile" : role === "buyer" ? "/buyer/profile" : "/app/profile";

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

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/80 backdrop-blur-sm px-4">
      <h1 className="text-base font-semibold text-foreground truncate">{title}</h1>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
          {theme === "dark" ? <Sun className="h-4 w-4 text-muted-foreground" /> : <Moon className="h-4 w-4 text-muted-foreground" />}
        </Button>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="relative h-9 w-9">
              <Bell className="h-4 w-4 text-muted-foreground" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 p-0">
            <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
              <p className="text-sm font-semibold text-foreground">Notificações</p>
              {unreadCount > 0 && (
                <Button variant="ghost" size="sm" className="h-6 gap-1 text-[11px] text-muted-foreground hover:text-foreground px-2" onClick={markAllAsRead}>
                  <CheckCheck className="h-3 w-3" />
                  Todas lidas
                </Button>
              )}
            </div>
            <div className="max-h-72 overflow-y-auto">
              {notifications.length === 0 ? (
                <p className="text-xs text-muted-foreground py-6 text-center">Nenhuma notificação recente.</p>
              ) : (
                <>
                  {notifications.map((n) => (
                    <div
                      key={n.id}
                      className={`group flex items-start gap-2 px-3 py-2.5 border-b border-border/50 last:border-0 transition-colors hover:bg-muted/50 ${n.read ? "opacity-60" : ""}`}
                    >
                      <div className={`mt-1 h-2 w-2 rounded-full shrink-0 ${n.read ? "bg-muted-foreground/30" : "bg-primary"}`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-foreground leading-snug">{n.text}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{formatRelativeTime(n.created_at)}</p>
                      </div>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        {!n.read && (
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => markAsRead(n.id)}>
                            <Check className="h-3 w-3 text-muted-foreground" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeNotification(n.id)}>
                          <X className="h-3 w-3 text-muted-foreground" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </PopoverContent>
        </Popover>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="h-9 w-9">
              <Avatar className="h-7 w-7">
                {profile?.avatar_url && <AvatarImage src={profile.avatar_url} alt={displayName} />}
                <AvatarFallback className="text-[10px] font-semibold bg-primary/10 text-primary">{initials}</AvatarFallback>
              </Avatar>
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-56 p-2">
            <div className="px-2 py-2">
              <p className="text-sm font-semibold text-foreground truncate">{displayName}</p>
              <p className="text-xs text-muted-foreground truncate">{user?.email || ""}</p>
            </div>
            <div className="h-px bg-border my-1" />
            <Button
              variant="ghost"
              className="w-full justify-start gap-2"
              onClick={() => navigate(profilePath)}
            >
              <User className="h-4 w-4" />
              Meu perfil
            </Button>
            <Button
              variant="ghost"
              className="w-full justify-start gap-2 text-destructive hover:text-destructive"
              onClick={async () => {
                const to = role === "admin" ? "/admin/login" : role === "buyer" ? "/buyer/login" : "/auth/login";
                await signOut();
                navigate(to, { replace: true });
              }}
            >
              <LogOut className="h-4 w-4" />
              Sair
            </Button>
          </PopoverContent>
        </Popover>
      </div>
    </header>
  );
};

export default MobileHeader;
