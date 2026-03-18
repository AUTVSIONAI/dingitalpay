import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, any>) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}
declare const __TURNSTILE_SITE_KEY__: string | undefined;

type TurnstileProps = {
  onToken: (token: string | null) => void;
};

export function getTurnstileSiteKey(): string | undefined {
  const injectedSiteKey = String(__TURNSTILE_SITE_KEY__ || "").trim();
  if (injectedSiteKey) return injectedSiteKey;
  return String(
    (import.meta as any).env?.VITE_TURNSTILE_SITE_KEY ||
      (import.meta as any).env?.TURNSTILE_SITE_KEY ||
      ""
  ).trim() || undefined;
}

export default function Turnstile({ onToken }: TurnstileProps) {
  const siteKey = getTurnstileSiteKey();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!siteKey) return;

    const id = "cf-turnstile-script";
    const existing = document.getElementById(id) as HTMLScriptElement | null;
    if (existing) {
      if ((window as any).turnstile) setReady(true);
      else existing.addEventListener("load", () => setReady(true), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = id;
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.addEventListener("load", () => setReady(true), { once: true });
    document.head.appendChild(script);
  }, [siteKey]);

  useEffect(() => {
    if (!siteKey) return;
    if (!ready) return;
    if (!containerRef.current) return;
    if (!window.turnstile) return;

    // Clean existing widget on rerender
    if (widgetIdRef.current) {
      try { window.turnstile.remove(widgetIdRef.current); } catch { /* ignore */ }
      widgetIdRef.current = null;
    }

    const widgetId = window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      theme: "auto",
      callback: (token: string) => onToken(token),
      "expired-callback": () => onToken(null),
      "error-callback": () => onToken(null),
    });
    widgetIdRef.current = widgetId;

    return () => {
      if (widgetIdRef.current) {
        try { window.turnstile.remove(widgetIdRef.current); } catch { /* ignore */ }
        widgetIdRef.current = null;
      }
    };
  }, [siteKey, ready, onToken]);

  if (!siteKey) return null;
  return <div ref={containerRef} className="flex justify-center" />;
}
