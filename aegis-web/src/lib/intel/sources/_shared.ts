import type { IntelPoint, IntelSeverity, ProviderHealth } from "@/lib/intel/types";

export const PHASE2C2_USER_AGENT = "AEGIS-impact-2C2/1.0";

/** Master switch read at request time (not module import time) so missing values never crash the route. */
export function isPhase2C2SourcesEnabled(): boolean {
  const val = (process.env.ENABLE_PHASE2C2_SOURCES ?? "true").toLowerCase().trim();
  return val !== "false" && val !== "0" && val !== "off" && val !== "no";
}

export function isValidLatLon(lat: unknown, lon: unknown): boolean {
  if (typeof lat !== "number" || typeof lon !== "number") return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  if (lat < -90 || lat > 90) return false;
  if (lon < -180 || lon > 180) return false;
  if (lat === 0 && lon === 0) return false;
  return true;
}

export type AdapterResult = {
  points: IntelPoint[];
  health: ProviderHealth;
};

type FetchOpts = {
  url: string;
  timeoutMs?: number;
  init?: RequestInit;
};

type FetchTextResult = {
  ok: boolean;
  text?: string;
  status?: number;
  message?: string;
  latencyMs: number;
};

export async function fetchTextWithTimeout(opts: FetchOpts): Promise<FetchTextResult> {
  const started = Date.now();
  const timeoutMs = opts.timeoutMs ?? 8_000;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const baseHeaders: Record<string, string> = { "User-Agent": PHASE2C2_USER_AGENT };
    const initHeaders = (opts.init?.headers ?? {}) as Record<string, string>;
    const res = await fetch(opts.url, {
      ...(opts.init ?? {}),
      cache: "no-store",
      signal: ctl.signal,
      headers: { ...baseHeaders, ...initHeaders },
    });
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        message: `HTTP ${res.status}`,
        latencyMs: Date.now() - started,
      };
    }
    const text = await res.text();
    return { ok: true, text, status: res.status, latencyMs: Date.now() - started };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "fetch failed",
      latencyMs: Date.now() - started,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchJsonWithTimeout<T>(opts: FetchOpts): Promise<{
  ok: boolean;
  data?: T;
  status?: number;
  message?: string;
  latencyMs: number;
}> {
  const res = await fetchTextWithTimeout(opts);
  if (!res.ok || !res.text) {
    return {
      ok: false,
      status: res.status,
      message: res.message ?? "no body",
      latencyMs: res.latencyMs,
    };
  }
  try {
    const data = JSON.parse(res.text) as T;
    return { ok: true, data, status: res.status, latencyMs: res.latencyMs };
  } catch (err) {
    return {
      ok: false,
      status: res.status,
      message: err instanceof Error ? err.message : "json parse failed",
      latencyMs: res.latencyMs,
    };
  }
}

export function isWithinRangeHours(timestamp: string, rangeHours: number): boolean {
  const t = new Date(timestamp).getTime();
  if (!Number.isFinite(t)) return false;
  const ageHours = (Date.now() - t) / 3_600_000;
  return ageHours >= -1 && ageHours <= rangeHours + 1;
}

export function rangeHoursToDays(rangeHours: number, max = 10): number {
  if (!Number.isFinite(rangeHours) || rangeHours <= 0) return 1;
  const days = Math.ceil(rangeHours / 24);
  return Math.max(1, Math.min(max, days));
}

export function makeSkippedHealth(provider: string, message: string): ProviderHealth {
  return {
    provider,
    ok: true,
    updatedAt: new Date().toISOString(),
    message: `Skipped: ${message} [reason=skipped]`,
  };
}

export function makeErrorHealth(
  provider: string,
  message: string,
  latencyMs?: number
): ProviderHealth {
  return {
    provider,
    ok: false,
    updatedAt: new Date().toISOString(),
    latencyMs,
    message: `${message} [reason=upstream_error]`,
  };
}

export function makeOkHealth(
  provider: string,
  message: string,
  latencyMs?: number
): ProviderHealth {
  return {
    provider,
    ok: true,
    updatedAt: new Date().toISOString(),
    latencyMs,
    message,
  };
}

const RSS_ITEM_RE = /<item\b[\s\S]*?<\/item>/gi;
const ATOM_ENTRY_RE = /<entry\b[\s\S]*?<\/entry>/gi;

export function splitRssItems(xml: string): string[] {
  const items = xml.match(RSS_ITEM_RE) ?? [];
  if (items.length > 0) return items;
  return xml.match(ATOM_ENTRY_RE) ?? [];
}

export function rssTag(block: string, tag: string): string | null {
  const cdata = block.match(
    new RegExp(`<${tag}\\b[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*<\\/${tag}>`, "i")
  );
  if (cdata && cdata[1]) return cdata[1].trim();
  const plain = block.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  if (!plain || plain[1] == null) return null;
  return plain[1]
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

export type SeverityFromMagnitudeOpts = {
  critical: number;
  high: number;
  medium: number;
};

export function severityFromMagnitude(
  mag: number,
  opts: SeverityFromMagnitudeOpts
): IntelSeverity {
  if (!Number.isFinite(mag)) return "low";
  if (mag >= opts.critical) return "critical";
  if (mag >= opts.high) return "high";
  if (mag >= opts.medium) return "medium";
  return "low";
}
