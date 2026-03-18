import net from "node:net";
import dns from "node:dns/promises";

type LookupFn = typeof dns.lookup;

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts;

  // 0.0.0.0/8, 10.0.0.0/8, 127.0.0.0/8
  if (a === 0 || a === 10 || a === 127) return true;
  // 100.64.0.0/10 (CGNAT)
  if (a === 100 && b >= 64 && b <= 127) return true;
  // 169.254.0.0/16 (link-local)
  if (a === 169 && b === 254) return true;
  // 172.16.0.0/12
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.168.0.0/16
  if (a === 192 && b === 168) return true;
  // 198.18.0.0/15 (benchmark)
  if (a === 198 && (b === 18 || b === 19)) return true;
  return false;
}

function isPrivateIpv6(ip: string): boolean {
  const v = ip.toLowerCase();
  if (v === "::1") return true;
  if (v.startsWith("fe80:")) return true; // link-local
  if (v.startsWith("fc") || v.startsWith("fd")) return true; // unique local fc00::/7
  if (v === "::" || v.startsWith("::ffff:127.")) return true; // unspecified / mapped loopback
  return false;
}

export function isPrivateIp(ip: string): boolean {
  const kind = net.isIP(ip);
  if (kind === 4) return isPrivateIpv4(ip);
  if (kind === 6) return isPrivateIpv6(ip);
  return true;
}

export async function assertSafeOutboundWebhookUrl(
  rawUrl: string,
  opts?: {
    allowHttp?: boolean;
    lookup?: LookupFn;
  }
): Promise<URL> {
  const allowHttp = Boolean(opts?.allowHttp);
  const lookup = opts?.lookup || dns.lookup;

  let url: URL;
  try {
    url = new URL(String(rawUrl || "").trim());
  } catch {
    throw new Error("URL inválida");
  }

  if (url.username || url.password) throw new Error("URL com credenciais não é permitida");

  const protocol = url.protocol.toLowerCase();
  if (protocol === "http:" && !allowHttp) throw new Error("Apenas https é permitido");
  if (protocol !== "https:" && protocol !== "http:") throw new Error("Protocolo não permitido");

  const hostname = url.hostname.toLowerCase();
  if (!hostname) throw new Error("Host inválido");
  if (hostname === "localhost" || hostname.endsWith(".localhost")) throw new Error("Host não permitido");

  // Block well-known metadata hosts
  const metadataHosts = new Set([
    "169.254.169.254",
    "metadata.google.internal",
    "metadata",
  ]);
  if (metadataHosts.has(hostname)) throw new Error("Host não permitido");

  // If host is an IP literal, validate directly
  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) throw new Error("IP privado/loopback não permitido");
    return url;
  }

  // Resolve A/AAAA and block private ranges
  const resolved = await lookup(hostname, { all: true, verbatim: true });
  const ips = resolved.map((r: any) => String(r.address || "")).filter(Boolean);
  if (!ips.length) throw new Error("Host sem resolução DNS");
  if (ips.some((ip) => isPrivateIp(ip))) throw new Error("Host resolve para IP privado/loopback");

  return url;
}

