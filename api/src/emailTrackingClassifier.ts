export type EmailTrackingEventType = "open" | "click";
export type EmailTrackingSource =
  | "gmail_proxy"
  | "outlook_safelinks"
  | "outlook_proxy"
  | "apple_mpp"
  | "scanner"
  | "unknown"
  | "direct";

function norm(s: string | undefined | null): string {
  return String(s || "").trim();
}

function lc(s: string | undefined | null): string {
  return norm(s).toLowerCase();
}

export function classifyEmailTrackingSource(input: {
  type: EmailTrackingEventType;
  userAgent?: string | null;
  referer?: string | null;
  url?: string | null; // click destination (if known)
}): EmailTrackingSource {
  const ua = lc(input.userAgent);
  const ref = lc(input.referer);
  const url = lc(input.url);

  // Gmail image proxy frequently loads the tracking pixel.
  if (ua.includes("googleimageproxy") || ua.includes("via ggpht.com googleimageproxy") || ref.includes("ggpht.com")) {
    return "gmail_proxy";
  }

  // Outlook Safe Links / Microsoft Defender link scanning often hits click redirects.
  if (
    input.type === "click" &&
    (ref.includes("safelinks.protection.outlook.com") ||
      url.includes("safelinks.protection.outlook.com") ||
      ua.includes("safelinks") ||
      ua.includes("microsoft office") ||
      ua.includes("officeclicktorun"))
  ) {
    return "outlook_safelinks";
  }

  // Outlook / Microsoft image proxy patterns (best-effort; UA can vary).
  if (
    input.type === "open" &&
    (ua.includes("microsoft") && ua.includes("outlook") ||
      ua.includes("ms-office") ||
      ref.includes("outlook.office.com"))
  ) {
    return "outlook_proxy";
  }

  // Apple Mail Privacy Protection (MPP) is hard to detect reliably without IP ranges.
  // Keep a small heuristic and otherwise fall back to unknown.
  if (input.type === "open" && (ua.includes("applemail") || ua.includes("mailprivacyprotection") || ref.includes("icloud.com"))) {
    return "apple_mpp";
  }

  // Generic scanners/bots.
  const scannerHints = [
    "barracuda",
    "proofpoint",
    "mimecast",
    "cisco",
    "sophos",
    "trendmicro",
    "symantec",
    "mcafee",
    "clamav",
    "spider",
    "crawler",
    "bot",
    "scanner",
    "security",
    "urlscan",
  ];
  if (scannerHints.some((h) => ua.includes(h))) return "scanner";

  // If it looks like a regular client/browser and none of the proxy/scanner rules matched,
  // treat as direct.
  const directHints = ["mozilla/", "applewebkit", "chrome/", "safari/", "firefox/", "edg/", "thunderbird", "outlook-ios", "gsa/"];
  if (directHints.some((h) => ua.includes(h))) return "direct";

  return "unknown";
}

export function isHumanTrackingEvent(input: {
  type: EmailTrackingEventType;
  source: EmailTrackingSource;
}): boolean {
  // "human" here means "not clearly a proxy/scanner". This is an estimate.
  // We still keep total counts for transparency.
  if (input.source === "scanner") return false;
  if (input.source === "outlook_safelinks") return false;
  if (input.source === "gmail_proxy") return false;
  if (input.source === "outlook_proxy") return false;
  if (input.source === "apple_mpp") return false;
  return true; // unknown/direct => treated as human estimate
}

export function truncateHeaderValue(value: string, maxLen = 512): string {
  const s = norm(value);
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen);
}
