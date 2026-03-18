import { useLocation, useNavigate } from "react-router-dom";
import { SidebarMenuItem } from "@/data/sidebar-menus";
import { motion } from "framer-motion";
import {
  LayoutDashboard, Users, BarChart3, Mail, Megaphone, Palette,
  Trophy, RefreshCw, ShoppingCart, Package, Plug, Wallet,
  ShoppingBag, GraduationCap, User, CreditCard,
} from "lucide-react";
import { cn } from "@/lib/utils";

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard, Users, BarChart3, Mail, Megaphone, Palette,
  Trophy, RefreshCw, ShoppingCart, Package, Plug, Wallet,
  ShoppingBag, GraduationCap, User, CreditCard,
};

interface MobileBottomNavProps {
  items: SidebarMenuItem[];
}

const MobileBottomNav = ({ items }: MobileBottomNavProps) => {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/80 backdrop-blur-lg"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="flex items-center px-1 h-16 overflow-x-auto scrollbar-none">
        {items.map((item) => {
          const Icon = iconMap[item.icon];
          const isActive = location.pathname === item.path;

          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className="relative flex flex-col items-center justify-center gap-0.5 min-w-[64px] flex-shrink-0 flex-1 h-full"
            >
              {/* Active indicator pill */}
              {isActive && (
                <motion.div
                  layoutId="bottomNavIndicator"
                  className="absolute top-0 inset-x-0 mx-auto h-[3px] w-8 rounded-full bg-primary"
                  transition={{ type: "spring", stiffness: 500, damping: 35 }}
                />
              )}

              <motion.div
                animate={isActive ? { scale: 1.15 } : { scale: 1 }}
                transition={{ type: "spring", stiffness: 400, damping: 20 }}
              >
                {Icon && (
                  <Icon
                    className={cn(
                      "h-5 w-5 transition-colors duration-200",
                      isActive ? "text-primary" : "text-muted-foreground"
                    )}
                  />
                )}
              </motion.div>

              <motion.span
                className={cn(
                  "text-[10px] font-medium transition-colors duration-200 leading-tight",
                  isActive ? "text-primary" : "text-muted-foreground"
                )}
                animate={isActive ? { scale: 1.05 } : { scale: 1 }}
                transition={{ type: "spring", stiffness: 400, damping: 20 }}
              >
                {item.label}
              </motion.span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default MobileBottomNav;
