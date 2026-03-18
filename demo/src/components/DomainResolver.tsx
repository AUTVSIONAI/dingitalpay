import { useEffect, useState, type ReactNode } from "react";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import LoadingState from "@/components/shared/LoadingState";
import CheckoutPage from "@/pages/checkout/CheckoutPage";
import ThankYouPage from "@/pages/checkout/ThankYouPage";
import PixPaymentPage from "@/pages/checkout/PixPaymentPage";

interface DomainResolverProps {
  platformUrl: string | undefined;
  children: ReactNode;
}

/**
 * Detects if the current hostname is a custom product domain.
 * If so, renders the checkout page via a dedicated router.
 * Otherwise, renders the normal app (children).
 */
const DomainResolver = ({ platformUrl, children }: DomainResolverProps) => {
  const [state, setState] = useState<"loading" | "custom" | "platform">("loading");
  const [resolvedProductId, setResolvedProductId] = useState<string | null>(null);

  useEffect(() => {
    const currentHost = window.location.hostname;

    // Known development/preview hosts — always treat as platform
    const devHosts = ["localhost", "127.0.0.1"];
    const isDevHost = devHosts.includes(currentHost);
    const isDemoHost = currentHost === "demo.dingitalpay.com";

    if (isDevHost || isDemoHost) {
      setState("platform");
      return;
    }

    // Wait until platformUrl has loaded (undefined = still loading)
    if (platformUrl === undefined) return;

    // Extract platform hostname from platformUrl setting
    const platformHost = platformUrl
      ? platformUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "").split(":")[0]
      : null;

    // If no platformUrl configured, skip domain resolution
    if (!platformHost) {
      setState("platform");
      return;
    }

    // If current host matches the platform host, it's the main platform
    if (currentHost === platformHost || currentHost === `www.${platformHost}`) {
      setState("platform");
      return;
    }

    // Otherwise, try to resolve as a custom product domain
    const resolve = async () => {
      try {
        const response = await fetch(`/api/public/product-domains/resolve?host=${encodeURIComponent(currentHost)}`);
        const payload = await response.json().catch(() => null);
        const data = payload?.data as { product_id?: string } | null;
        if (!response.ok || !data?.product_id) {
          setState("platform");
          return;
        }
        setResolvedProductId(data.product_id);
        setState("custom");
      } catch {
        setState("platform");
      }
    };

    resolve();
  }, [platformUrl]);

  if (state === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingState />
      </div>
    );
  }

  if (state === "custom" && resolvedProductId) {
    return <CustomDomainRouter productId={resolvedProductId} />;
  }

  return <>{children}</>;
};

/**
 * Creates a minimal router that maps all paths to the checkout page
 * for the resolved product, so useParams/useNavigate work correctly.
 */
const CustomDomainRouter = ({ productId }: { productId: string }) => {
  // Rewrite URL BEFORE creating the router so useParams picks up productId
  useEffect(() => {
    const targetPath = `/checkout/${productId}${window.location.search}`;
    if (!window.location.pathname.startsWith("/checkout/") && !window.location.pathname.startsWith("/obrigado") && !window.location.pathname.startsWith("/pix/")) {
      window.history.replaceState(null, "", targetPath);
    }
  }, [productId]);

  const [router] = useState(() => {
    // Ensure the initial URL has the productId for the router to match
    if (!window.location.pathname.startsWith("/checkout/") && !window.location.pathname.startsWith("/obrigado") && !window.location.pathname.startsWith("/pix/")) {
      window.history.replaceState(null, "", `/checkout/${productId}${window.location.search}`);
    }

    return createBrowserRouter([
      { path: "/checkout/:productId", element: <CheckoutPage /> },
      { path: "/pix/:orderId", element: <PixPaymentPage /> },
      { path: "/obrigado/:orderId", element: <ThankYouPage /> },
      { path: "*", element: <CheckoutPage /> },
    ]);
  });

  return <RouterProvider router={router} />;
};

export default DomainResolver;
