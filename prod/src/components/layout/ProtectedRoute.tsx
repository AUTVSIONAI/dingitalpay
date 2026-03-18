import { Navigate } from "react-router-dom";
import { useAuth, AppRole } from "@/contexts/AuthContext";
import LoadingState from "@/components/shared/LoadingState";

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: AppRole[];
}

const DEV_MODE = false;

const ProtectedRoute = ({ children, allowedRoles }: ProtectedRouteProps) => {
  const { user, role, session, loading } = useAuth();

  // Skip auth checks during development
  if (DEV_MODE) {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingState />
      </div>
    );
  }

  if (!user) {
    const path = window.location.pathname;
    if (path.startsWith("/admin")) return <Navigate to="/admin/login" replace />;
    if (path.startsWith("/buyer") || path.startsWith("/members")) return <Navigate to="/buyer/login" replace />;
    return <Navigate to="/auth/login" replace />;
  }

  // Enforce MFA on protected areas (server also blocks /api/* for pending sessions)
  if ((session as any)?.mfa_pending) {
    try {
      const next = `${window.location.pathname}${window.location.search || ""}`;
      sessionStorage.setItem("__mfa_next__", next);
    } catch {
      // ignore
    }
    const setup = Boolean((session as any)?.mfa_setup_required);
    return <Navigate to={setup ? "/auth/2fa/setup" : "/auth/2fa"} replace />;
  }

  if (allowedRoles && !role) {
    const path = window.location.pathname;
    if (path.startsWith("/admin")) return <Navigate to="/admin/login" replace />;
    if (path.startsWith("/buyer") || path.startsWith("/members")) return <Navigate to="/buyer/login" replace />;
    return <Navigate to="/auth/login" replace />;
  }

  if (allowedRoles && role && !allowedRoles.includes(role)) {
    const homeMap: Record<AppRole, string> = {
      admin: "/admin/dashboard",
      seller: "/app/dashboard",
      buyer: "/buyer/purchases",
    };
    return <Navigate to={homeMap[role] || "/auth/login"} replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
