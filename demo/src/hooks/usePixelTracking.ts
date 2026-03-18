import { useEffect, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchProductPixelsPublic } from "@/services/product.service";
import {
  initFacebookPixel,
  removeFacebookPixel,
  trackFbEvent,
  generateEventId,
} from "@/lib/facebook-pixel";
import type { FacebookAttribution } from "@/lib/facebook-attribution";
import { getFacebookAttributionParams } from "@/lib/facebook-attribution";

/**
 * Hook that manages pixel injection and event tracking for a product.
 * Handles browser-side (fbq). Server-side Purchase (CAPI) is emitted by the backend on status=approved.
 */
export const usePixelTracking = (productId: string | undefined) => {
  const initializedPixels = useRef<Set<string>>(new Set());

  const { data: pixels = [] } = useQuery({
    queryKey: ["checkout-pixels", productId],
    queryFn: () => fetchProductPixelsPublic(productId!),
    enabled: !!productId,
  });

  const fbPixels = pixels.filter((p) => p.platform === "facebook" && p.active);

  // Inject FB Pixel scripts on mount
  useEffect(() => {
    fbPixels.forEach((pixel) => {
      if (!initializedPixels.current.has(pixel.pixel_id)) {
        initFacebookPixel(pixel.pixel_id);
        initializedPixels.current.add(pixel.pixel_id);
      }
    });

    // Track PageView on init
    if (fbPixels.length > 0) {
      trackFbEvent("PageView", getFacebookAttributionParams());
    }

    return () => {
      initializedPixels.current.forEach((pixelId) => {
        removeFacebookPixel(pixelId);
      });
      initializedPixels.current.clear();
    };
  }, [fbPixels.map((p) => p.pixel_id).join(",")]);

  /**
   * Track a conversion event.
   * Fires browser-side fbq only.
   */
  const trackEvent = useCallback(
    (
      eventName: string,
      eventData?: Record<string, any>,
      options?: {
        eventId?: string;
        userData?: unknown;
        attribution?: Partial<FacebookAttribution> | null;
      }
    ) => {
      if (!productId || fbPixels.length === 0) return;

      const eventId = options?.eventId || generateEventId();
      const attributionParams = {
        ...(options?.attribution?.fbc ? { fbc: String(options.attribution.fbc) } : {}),
        ...(options?.attribution?.fbp ? { fbp: String(options.attribution.fbp) } : {}),
      };

      // 1. Browser-side tracking
      trackFbEvent(eventName, { ...(eventData || {}), ...attributionParams }, eventId);

      return eventId;
    },
    [productId, fbPixels.length]
  );

  return { trackEvent, hasPixels: fbPixels.length > 0 };
};
