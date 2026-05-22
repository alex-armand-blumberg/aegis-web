import type { IntelPoint } from "@/lib/intel/types";
import {
  extractSourceUrl,
  inferEventClass,
  inferGeoPrecision,
  inferSourceFamily,
  sourceReliabilityFor,
} from "./sourceQuality";
import type { NormalizedSignal } from "./types";

function isValidLatLon(lat: unknown, lon: unknown): lat is number {
  if (typeof lat !== "number" || typeof lon !== "number") return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  if (lat < -90 || lat > 90) return false;
  if (lon < -180 || lon > 180) return false;
  if (lat === 0 && lon === 0) return false;
  return true;
}

function normalizeTimestamp(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const t = new Date(raw);
  if (!Number.isFinite(t.getTime())) return undefined;
  return t.toISOString();
}

export function normalizeSignal(point: IntelPoint): NormalizedSignal | null {
  if (!point || typeof point !== "object") return null;
  if (!isValidLatLon(point.lat, point.lon)) return null;
  const title = point.title?.trim();
  const source = point.source?.trim();
  if (!title || !source) return null;

  const timestamp = normalizeTimestamp(point.timestamp) ?? new Date(0).toISOString();
  const sourceFamily = inferSourceFamily(point);
  const eventClass = inferEventClass(point);
  const geoPrecision = inferGeoPrecision(point);
  const url = extractSourceUrl(point);

  const partial: NormalizedSignal = {
    id: point.id,
    originalPoint: point,
    title,
    layer: point.layer,
    eventClass,
    sourceFamily,
    source,
    timestamp,
    lat: point.lat,
    lon: point.lon,
    country: point.country,
    severity: point.severity,
    sourceReliability: 0,
    geoPrecision,
    confidence: point.confidence,
    url,
    metadata: point.metadata,
  };

  partial.sourceReliability = sourceReliabilityFor(partial);
  return partial;
}

export function normalizeSignals(points: IntelPoint[]): NormalizedSignal[] {
  if (!Array.isArray(points)) return [];
  const out: NormalizedSignal[] = [];
  const seen = new Set<string>();
  for (const p of points) {
    if (!p || typeof p !== "object") continue;
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    const n = normalizeSignal(p);
    if (n) out.push(n);
  }
  return out;
}
