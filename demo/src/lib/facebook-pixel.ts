/**
 * Facebook Pixel client-side utilities.
 * Handles script injection, event tracking, and deduplication.
 */

declare global {
  interface Window {
    fbq: (...args: any[]) => void;
    _fbq: any;
  }
}

/** Generate a unique event ID for deduplication between browser and server */
export const generateEventId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
};

/** Inject the Facebook Pixel base script and initialize with the given pixel ID */
export const initFacebookPixel = (pixelId: string): void => {
  // Skip if already initialized for this pixel
  if (document.querySelector(`script[data-fb-pixel="${pixelId}"]`)) return;

  // Inject fbq loader if not present
  if (!window.fbq) {
    const n: any = (window.fbq = function (...args: any[]) {
      n.callMethod ? n.callMethod.apply(n, args) : n.queue.push(args);
    });
    if (!window._fbq) window._fbq = n;
    n.push = n;
    n.loaded = true;
    n.version = "2.0";
    n.queue = [];
  }

  // Load the FB Pixel script
  const script = document.createElement("script");
  script.async = true;
  script.src = "https://connect.facebook.net/en_US/fbevents.js";
  script.dataset.fbPixel = pixelId;
  // Prefer <head> for discoverability and compatibility; fallback to <body>.
  const target = document.head || document.body;
  target?.appendChild(script);

  // Init pixel
  window.fbq("init", pixelId);
};

/** Remove a specific pixel script from the DOM */
export const removeFacebookPixel = (pixelId: string): void => {
  const script = document.querySelector(`script[data-fb-pixel="${pixelId}"]`);
  script?.remove();
};

/**
 * Track a Facebook Pixel event (browser-side).
 * Uses eventID for deduplication with Conversions API.
 */
export const trackFbEvent = (
  eventName: string,
  params?: Record<string, any>,
  eventId?: string
): void => {
  if (typeof window === "undefined" || !window.fbq) return;

  if (eventId) {
    window.fbq("track", eventName, params || {}, { eventID: eventId });
  } else {
    window.fbq("track", eventName, params || {});
  }
};

/** Hash a string with SHA-256 (for PII normalization before sending to CAPI) */
export const hashSHA256 = async (value: string): Promise<string> => {
  const normalized = value.trim().toLowerCase();
  const encoder = new TextEncoder();
  const data = encoder.encode(normalized);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
};
