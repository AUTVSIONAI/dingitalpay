import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, RouterProvider, Navigate, Outlet } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/layout/ProtectedRoute";
import DomainResolver from "@/components/DomainResolver";
import MaintenanceGuard from "@/components/layout/MaintenanceGuard";
import MaintenancePage from "./pages/MaintenancePage";
import { usePlatformUrl } from "@/hooks/usePlatformSettings";
import LoadingState from "@/components/shared/LoadingState";
import FaviconManager from "@/components/FaviconManager";

// Eagerly loaded (critical path)
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";

// Lazy loaded layouts
const AdminLayout = lazy(() => import("@/components/layout/AdminLayout"));
const SellerLayout = lazy(() => import("@/components/layout/SellerLayout"));
const BuyerLayout = lazy(() => import("@/components/layout/BuyerLayout"));

// Lazy loaded pages — auth
const Login = lazy(() => import("./pages/auth/Login"));
const Register = lazy(() => import("./pages/auth/Register"));
const ForgotPassword = lazy(() => import("./pages/auth/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/auth/ResetPassword"));
const EmailConfirmation = lazy(() => import("./pages/auth/EmailConfirmation"));
const EmailVerified = lazy(() => import("./pages/auth/EmailVerified"));
const TwoFactor = lazy(() => import("./pages/auth/TwoFactor"));
const TwoFactorSetup = lazy(() => import("./pages/auth/TwoFactorSetup"));

// Lazy loaded pages — seller
const Profile = lazy(() => import("./pages/Profile"));
const SellerDashboard = lazy(() => import("./pages/seller/SellerDashboard"));
const SellerSales = lazy(() => import("./pages/seller/SellerSales"));
const SellerProducts = lazy(() => import("./pages/seller/SellerProducts"));
const SellerWithdrawals = lazy(() => import("./pages/seller/SellerWithdrawals"));
const SellerIntegrations = lazy(() => import("./pages/seller/SellerIntegrations"));
const SellerWebhooks = lazy(() => import("./pages/seller/SellerWebhooks"));
const SellerWhatsApp = lazy(() => import("./pages/seller/SellerWhatsApp"));
const SellerZapier = lazy(() => import("./pages/seller/SellerZapier"));
const SellerProductDetail = lazy(() => import("./pages/seller/SellerProductDetail"));
const ProductPreviewPage = lazy(() => import("./pages/seller/product/ProductPreviewPage"));

// Lazy loaded pages — admin
const AdminLogin = lazy(() => import("./pages/admin/AdminLogin"));
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const AdminUsers = lazy(() => import("./pages/admin/AdminUsers"));
const AdminReports = lazy(() => import("./pages/admin/AdminReports"));
const AdminProducts = lazy(() => import("./pages/admin/AdminProducts"));
const AdminSmtp = lazy(() => import("./pages/admin/AdminSmtp"));
const AdminEmailCampaigns = lazy(() => import("./pages/admin/AdminEmailCampaigns"));
const AdminPlatformSettings = lazy(() => import("./pages/admin/AdminPlatformSettings"));
const AdminAchievements = lazy(() => import("./pages/admin/AdminAchievements"));
const AdminUpdates = lazy(() => import("./pages/admin/AdminUpdates"));
const AdminAcquirers = lazy(() => import("./pages/admin/AdminAcquirers"));
const AdminWithdrawals = lazy(() => import("./pages/admin/AdminWithdrawals"));
const AdminFinances = lazy(() => import("./pages/admin/AdminFinances"));

// Lazy loaded pages — buyer
const BuyerPurchases = lazy(() => import("./pages/buyer/BuyerPurchases"));
const BuyerProfile = lazy(() => import("./pages/buyer/BuyerProfile"));
const BuyerLogin = lazy(() => import("./pages/buyer/BuyerLogin"));
const BuyerRegister = lazy(() => import("./pages/buyer/BuyerRegister"));
const BuyerForgotPassword = lazy(() => import("./pages/buyer/BuyerForgotPassword"));
const BuyerResetPassword = lazy(() => import("./pages/buyer/BuyerResetPassword"));

// Lazy loaded pages — members
const MembersCourses = lazy(() => import("./pages/members/MembersCourses"));
const CoursePage = lazy(() => import("./pages/members/CoursePage"));
const LessonPlayer = lazy(() => import("./pages/members/LessonPlayer"));

// Lazy loaded pages — checkout
const CheckoutPage = lazy(() => import("./pages/checkout/CheckoutPage"));
const CheckoutBySlug = lazy(() => import("./pages/checkout/CheckoutBySlug"));
const ThankYouPage = lazy(() => import("./pages/checkout/ThankYouPage"));
const PixPaymentPage = lazy(() => import("./pages/checkout/PixPaymentPage"));

// Lazy loaded pages — misc

const queryClient = new QueryClient();

const SuspenseWrapper = ({ children }: { children: React.ReactNode }) => (
  <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><LoadingState /></div>}>
    {children}
  </Suspense>
);

// Root layout that wraps everything with AuthProvider
const RootLayout = () => (
  <AuthProvider>
    <div>
      <SuspenseWrapper>
        <Outlet />
      </SuspenseWrapper>
    </div>
  </AuthProvider>
);

const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      { path: "/maintenance", element: <MaintenancePage /> },

      {
        element: <MaintenanceGuard />,
        children: [
          { path: "/", element: <Index /> },
          { path: "/auth/login", element: <Login /> },
          { path: "/auth/register", element: <Register /> },
          { path: "/auth/forgot", element: <ForgotPassword /> },
          { path: "/auth/reset", element: <ResetPassword /> },
          { path: "/auth/2fa", element: <TwoFactor /> },
          { path: "/auth/2fa/setup", element: <TwoFactorSetup /> },
          { path: "/buyer/login", element: <BuyerLogin /> },
          { path: "/buyer/register", element: <BuyerRegister /> },
          { path: "/buyer/forgot", element: <BuyerForgotPassword /> },
          { path: "/buyer/reset", element: <BuyerResetPassword /> },
          { path: "/auth/email-confirmation", element: <EmailConfirmation /> },
          { path: "/auth/email-verified", element: <EmailVerified /> },
          { path: "/offer/:offerId", element: <CheckoutPage /> },
          { path: "/checkout/offer/:offerId", element: <CheckoutPage /> },
          { path: "/checkout/:productId", element: <CheckoutPage /> },
          { path: "/c/:slug", element: <CheckoutBySlug /> },
          { path: "/pix/:orderId", element: <PixPaymentPage /> },
          { path: "/obrigado/:orderId", element: <ThankYouPage /> },
          {
            path: "/app",
            element: <ProtectedRoute allowedRoles={["seller"]}><SellerLayout /></ProtectedRoute>,
            children: [
              { index: true, element: <Navigate to="dashboard" replace /> },
              { path: "dashboard", element: <SellerDashboard /> },
              { path: "sales", element: <SellerSales /> },
              { path: "products", element: <SellerProducts /> },
              { path: "products/:productId", element: <SellerProductDetail /> },
              { path: "products/:productId/preview", element: <ProductPreviewPage /> },
              { path: "withdrawals", element: <SellerWithdrawals /> },
              { path: "integrations", element: <SellerIntegrations /> },
              { path: "integrations/webhooks", element: <SellerWebhooks /> },
              { path: "integrations/whatsapp", element: <SellerWhatsApp /> },
              { path: "integrations/zapier", element: <SellerZapier /> },
              { path: "profile", element: <Profile /> },
            ],
          },
          {
            path: "/buyer",
            element: <ProtectedRoute allowedRoles={["buyer"]}><BuyerLayout /></ProtectedRoute>,
            children: [
              { path: "purchases", element: <BuyerPurchases /> },
              { path: "profile", element: <BuyerProfile /> },
            ],
          },
          {
            path: "/members",
            element: <ProtectedRoute allowedRoles={["buyer"]}><BuyerLayout /></ProtectedRoute>,
            children: [
              { path: "courses", element: <MembersCourses /> },
              { path: "courses/:courseId", element: <CoursePage /> },
              { path: "courses/:courseId/lessons/:lessonId", element: <LessonPlayer /> },
            ],
          },
        ],
      },

      { path: "/admin/login", element: <AdminLogin /> },
      {
        path: "/admin",
        element: <ProtectedRoute allowedRoles={["admin"]}><AdminLayout /></ProtectedRoute>,
        children: [
          { index: true, element: <Navigate to="dashboard" replace /> },
          { path: "dashboard", element: <AdminDashboard /> },
          { path: "users", element: <AdminUsers /> },
          { path: "withdrawals", element: <AdminWithdrawals /> },
          { path: "reports", element: <AdminReports /> },
          { path: "finances", element: <AdminFinances /> },
          { path: "products", element: <AdminProducts /> },
          { path: "smtp", element: <AdminSmtp /> },
          { path: "email-campaigns", element: <AdminEmailCampaigns /> },
          { path: "platform-settings", element: <AdminPlatformSettings /> },
          { path: "achievements", element: <AdminAchievements /> },
          { path: "acquirers", element: <AdminAcquirers /> },
          { path: "updates", element: <AdminUpdates /> },
          { path: "profile", element: <Profile /> },
        ],
      },

      { path: "*", element: <NotFound /> },
    ],
  },
]);

const AppWithDomainResolver = () => {
  const { platformUrl } = usePlatformUrl();

  return (
    <DomainResolver platformUrl={platformUrl}>
      <RouterProvider router={router} />
    </DomainResolver>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
        <Toaster />
        <Sonner />
        <FaviconManager />
        <AppWithDomainResolver />
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
