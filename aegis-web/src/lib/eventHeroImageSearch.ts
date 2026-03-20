const FETCH_TIMEOUT_MS = 8_000;
const MAX_HTML_BYTES = 512 * 1024;

function isBlockedHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local")) return true;
  if (h === "0.0.0.0") return true;
  const ipv4 = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
  }
  return false;
}

function isLikelyNonHeroIcon(url: string): boolean {
  const u = url.toLowerCase();
  if (u.includes("favicon") || u.includes("logo") || u.includes("avatar") || u.includes("icon"))
    return true;
  if (u.includes("1x1") || u.includes("pixel") || u.includes("spacer")) return true;
  // Common tiny thumbs
  if (u.includes("/thumbnail") || u.includes("tbn=")) return true;
  return false;
}

function coerceHttpUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.href;
  } catch {
    return null;
  }
}

export function buildEventHeroImageQuery(params: {
  title: string;
  country?: string;
  layer?: string;
  eventType?: string;
}): string {
  const title = (params.title ?? "").trim();
  if (!title) return "";
  const bits = [
    title,
    params.country ? `(${params.country})` : "",
    params.layer ? params.layer : "",
    params.eventType ? String(params.eventType) : "",
    "news photo",
  ]
    .filter(Boolean)
    .join(" ");
  // Keep this small to avoid over-specific or long queries.
  return bits.replace(/\s+/g, " ").slice(0, 220);
}

function extractImageUrlsFromAnyJson(value: unknown): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();

  const walk = (v: unknown, depth: number) => {
    if (depth > 6) return;
    if (typeof v === "string") {
      if (v.startsWith("http://") || v.startsWith("https://")) {
        if (!seen.has(v)) {
          seen.add(v);
          urls.push(v);
        }
      }
      return;
    }
    if (Array.isArray(v)) {
      for (const item of v) walk(item, depth + 1);
      return;
    }
    if (typeof v === "object" && v) {
      const obj = v as Record<string, unknown>;
      for (const k of Object.keys(obj)) {
        walk(obj[k], depth + 1);
      }
    }
  };

  walk(value, 0);
  return urls;
}

export async function fetchSerperImageUrls(query: string, apiKey: string): Promise<string[]> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": apiKey,
      },
      body: JSON.stringify({
        q: query.slice(0, 400),
        num: 8,
        type: "images",
      }),
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(t);
    if (!res.ok) return [];
    const json = (await res.json()) as unknown;

    // Serper's response shape can vary; extract http(s) URLs and then filter.
    const urls = extractImageUrlsFromAnyJson(json);
    const filtered = urls
      .map((u) => coerceHttpUrl(u) ?? "")
      .filter(Boolean)
      .filter((u) => !isLikelyNonHeroIcon(u))
      .filter((u) => {
        try {
          return !isBlockedHostname(new URL(u).hostname);
        } catch {
          return false;
        }
      });

    return filtered.slice(0, 10);
  } catch {
    clearTimeout(t);
    return [];
  }
}

export function pickFirstNonExcludedImageUrl(opts: {
  candidates: string[];
  exclude: Set<string>;
}): string | null {
  for (const c of opts.candidates) {
    const url = coerceHttpUrl(c);
    if (!url) continue;
    if (opts.exclude.has(url)) continue;
    if (isLikelyNonHeroIcon(url)) continue;
    try {
      if (isBlockedHostname(new URL(url).hostname)) continue;
    } catch {
      continue;
    }
    return url;
  }
  return null;
}

