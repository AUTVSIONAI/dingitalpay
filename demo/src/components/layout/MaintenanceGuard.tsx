import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useMaintenanceGuard } from "@/hooks/useMaintenanceGuard";
import { useAuth } from "@/contexts/AuthContext";

const MaintenanceGuard = () => {
  const { isMaintenanceMode, isLoading } = useMaintenanceGuard();
  const { role, loading: authLoading } = useAuth();
  const location = useLocation();

  // Don't block while loading
  if (isLoading || authLoading) return <Outlet />;

  // Admin routes and admin login are always accessible
  const isAdminPath = location.pathname.startsWith("/admin");
  if (isAdminPath) return <Outlet />;

  // If maintenance mode is on and user is NOT admin, redirect
  if (isMaintenanceMode && role !== "admin") {
    return <Navigate to="/maintenance" replace />;
  }

  return <Outlet />;
};

export default MaintenanceGuard;
