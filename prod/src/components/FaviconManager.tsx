import { useEffect } from "react";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";

function upsertLink(rel: string, href: string) {
  if (typeof document === "undefined") return;
  const head = document.head;
  if (!head) return;

  let link = head.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement("link");
    link.rel = rel;
    head.appendChild(link);
  }
  // eslint-disable-next-line no-param-reassign
  link.href = href;
}

export default function FaviconManager() {
  const { data } = usePlatformSettings();

  useEffect(() => {
    const href = String(data?.faviconUrl || "/favicon.ico").trim() || "/favicon.ico";
    upsertLink("icon", href);
    upsertLink("shortcut icon", href);
  }, [data?.faviconUrl]);

  return null;
}

