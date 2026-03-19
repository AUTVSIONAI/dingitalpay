import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import LandingPage from "./LandingPage";

const Index = () => {
  const { user, role, session } = useAuth();
  const mfaPending = Boolean((session as any)?.mfa_pending);

  if (user && !mfaPending) {
    if (role === "seller") return <Navigate to="/app/dashboard" replace />;
    if (role === "buyer") return <Navigate to="/buyer/purchases" replace />;
    if (role === "admin") return <Navigate to="/admin/dashboard" replace />;
  }

  return <LandingPage />;
};

export default Index;
