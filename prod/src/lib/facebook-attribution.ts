export type FacebookAttribution = {
  fbc: string | null;
  fbp: string | null;
  fbclid: string | null;
  capturedAt: number;
};

type CaptureOptions = {
  searchParams?: URLSearchParams;
  cookieString?: string;
  nowMs?: number;
  storage?: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null;
  documentCookie?: {
    get value(): string;
    set value(next: string);
  } | null;
};

const STORAGE_KEY = "dingitalpay.meta.facebook";
const ATTRIBUTION_TTL_MS = 90 * 24 * 60 * 60 * 1000;

function safeWindow() {
  return typeof window === "undefined" ? null : window;
}

function safeDocument() {
  return typeof document === "undefined" ? null : document;
}

function getStorage(storage?: CaptureOptions["storage"]) {
  if (storage !== undefined) return storage;
  return safeWindow()?.localStorage ?? null;
}

function getDocumentCookieAccessor(documentCookie?: CaptureOptions["documentCookie"]) {
  if (documentCookie !== undefined) return documentCookie;
  const doc = safeDocument();
  if (!doc) return null;
  return {
    get value() {
      return doc.cookie;
    },
    set value(next: string) {
      doc.cookie = next;
    },
  };
}

function normalizeStoredAttribution(raw: string | null): FacebookAttribution | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<FacebookAttribution>;
    if (!parsed || typeof parsed !== "object") return null;
    const capturedAt = Number(parsed.capturedAt || 0);
    if (!capturedAt || Date.now() - capturedAt > ATTRIBUTION_TTL_MS) return null;
    return {
      fbc: typeof parsed.fbc === "string" && parsed.fbc.trim() ? parsed.fbc.trim() : null,
      fbp: typeof parsed.fbp === "string" && parsed.fbp.trim() ? parsed.fbp.trim() : null,
      fbclid: typeof parsed.fbclid === "string" && parsed.fbclid.trim() ? parsed.fbclid.trim() : null,
      capturedAt,
    };
  } catch {
    return null;
  }
}

export function buildFacebookClickId(fbclid: string, nowMs = Date.now()): string {
  return `fb.1.${Math.floor(nowMs)}.${String(fbclid || "").trim()}`;
}

export function buildFacebookBrowserId(nowMs = Date.now()): string {
  const randomPart = Math.floor(Math.random() * 1_000_000_000_000);
  return `fb.1.${Math.floor(nowMs)}.${randomPart}`;
}

export function readCookieValue(name: string, cookieString?: string): string | null {
  const source = cookieString ?? safeDocument()?.cookie ?? "";
  if (!source) return null;
  const cookie = source
    .split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${name}=`));
  if (!cookie) return null;
  const [, ...parts] = cookie.split("=");
  const value = parts.join("=").trim();
  return value ? decodeURIComponent(value) : null;
}

function writeCookie(name: string, value: string, documentCookie: NonNullable<CaptureOptions["documentCookie"]>) {
  const maxAge = ATTRIBUTION_TTL_MS / 1000;
  documentCookie.value = `${name}=${encodeURIComponent(value)}; Max-Age=${maxAge}; Path=/; SameSite=Lax`;
}

export function getFacebookAttribution(options: CaptureOptions = {}): FacebookAttribution {
  const nowMs = Number(options.nowMs || Date.now());
  const storage = getStorage(options.storage);
  const documentCookie = getDocumentCookieAccessor(options.documentCookie);
  const searchParams = options.searchParams ?? new URLSearchParams(safeWindow()?.location.search || "");
  const stored = normalizeStoredAttribution(storage?.getItem(STORAGE_KEY) ?? null);

  const fbclid = String(searchParams.get("fbclid") || "").trim() || null;
  const cookieFbc = readCookieValue("_fbc", options.cookieString ?? documentCookie?.value) || null;
  const cookieFbp = readCookieValue("_fbp", options.cookieString ?? documentCookie?.value) || null;

  let fbc = cookieFbc;
  if (fbclid) {
    fbc = buildFacebookClickId(fbclid, nowMs);
    if (documentCookie) writeCookie("_fbc", fbc, documentCookie);
  } else if (!fbc && stored?.fbc) {
    fbc = stored.fbc;
  }

  let fbp = cookieFbp || stored?.fbp || null;
  if (!fbp) {
    fbp = buildFacebookBrowserId(nowMs);
    if (documentCookie) writeCookie("_fbp", fbp, documentCookie);
  }
  const capturedAt = stored?.capturedAt && !fbclid ? stored.capturedAt : nowMs;
  const payload: FacebookAttribution = { fbc, fbp, fbclid, capturedAt };

  if (storage) {
    if (payload.fbc || payload.fbp || payload.fbclid) {
      storage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } else {
      storage.removeItem(STORAGE_KEY);
    }
  }

  return payload;
}

export function getFacebookAttributionParams(options: CaptureOptions = {}): Record<string, string> {
  const attribution = getFacebookAttribution(options);
  return {
    ...(attribution.fbc ? { fbc: attribution.fbc } : {}),
    ...(attribution.fbp ? { fbp: attribution.fbp } : {}),
  };
}
