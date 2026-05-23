import type { IntelPoint, IntelSeverity } from "@/lib/intel/types";
import {
  type AdapterResult,
  fetchJsonWithTimeout,
  isValidLatLon,
  isWithinRangeHours,
  makeErrorHealth,
  makeOkHealth,
  makeSkippedHealth,
} from "./_shared";

const GDACS_URL = "https://www.gdacs.org/gdacsapi/api/Events/geteventlist/SEARCH";
const GDACS_CAP = 150;
const PROVIDER = "GDACS";

function isEnabled(): boolean {
  const v = (process.env.ESCALATION_ENABLE_GDACS ?? "true").toLowerCase().trim();
  return v !== "false" && v !== "0" && v !== "off" && v !== "no";
}

function gdacsAlertToSeverity(level: string | undefined | null): IntelSeverity {
  const l = (level ?? "").toLowerCase();
  if (l === "red") return "critical";
  if (l === "orange") return "high";
  if (l === "green") return "medium";
  return "low";
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

type GdacsResponse =
  | Array<Record<string, unknown>>
  | { features?: Array<Record<string, unknown>> };

function extractList(json: GdacsResponse): Array<Record<string, unknown>> {
  if (Array.isArray(json)) return json;
  if (json && typeof json === "object" && Array.isArray((json as { features?: unknown[] }).features)) {
    return (json as { features: Array<Record<string, unknown>> }).features;
  }
  return [];
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function str(value: unknown): string | null {
  if (typeof value === "string" && value.trim() !== "") return value.trim();
  return null;
}

export async function fetchGdacsSignals(rangeHours: number): Promise<AdapterResult> {
  if (!isEnabled()) {
    return {
      points: [],
      health: makeSkippedHealth(PROVIDER, "ESCALATION_ENABLE_GDACS=false"),
    };
  }

  const startedAt = Date.now();
  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - Math.max(1, rangeHours) * 3_600_000);
  const params = new URLSearchParams({
    fromdate: isoDate(startDate),
    todate: isoDate(endDate),
    pagesize: "150",
  });

  const res = await fetchJsonWithTimeout<GdacsResponse>({
    url: `${GDACS_URL}?${params.toString()}`,
    timeoutMs: 9_000,
  });

  if (!res.ok || !res.data) {
    return {
      points: [],
      health: makeErrorHealth(PROVIDER, res.message ?? "GDACS fetch failed", res.latencyMs),
    };
  }

  const list = extractList(res.data);
  const points: IntelPoint[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < list.length; i += 1) {
    if (points.length >= GDACS_CAP) break;
    const raw = list[i];
    const props = ((raw.properties as Record<string, unknown> | undefined) ?? raw) as Record<
      string,
      unknown
    >;
    const geom = raw.geometry as { type?: string; coordinates?: unknown } | undefined;
    const coords = (geom?.coordinates ?? null) as unknown;

    let lat: number | null = num(props.latitude ?? props.lat ?? null);
    let lon: number | null = num(props.longitude ?? props.lon ?? null);
    if ((lat == null || lon == null) && Array.isArray(coords) && coords.length >= 2) {
      const c0 = num(coords[0]);
      const c1 = num(coords[1]);
      if (c0 != null && c1 != null) {
        // GeoJSON convention: [lon, lat]
        lon = c0;
        lat = c1;
      }
    }
    if (lat == null || lon == null) continue;
    if (!isValidLatLon(lat, lon)) continue;

    const dateStr =
      str(props.fromdate) ??
      str(props.fromDate) ??
      str(props.todate) ??
      str(props.toDate) ??
      str(props.datetime) ??
      str(props.eventDate) ??
      str(props.eventdate) ??
      null;
    if (!dateStr) continue;
    const date = new Date(dateStr);
    if (!Number.isFinite(date.getTime())) continue;
    if (!isWithinRangeHours(date.toISOString(), rangeHours)) continue;

    const eventType = str(props.eventtype) ?? str(props.eventType) ?? "Disaster";
    const eventName = str(props.name) ?? str(props.eventname) ?? "GDACS event";
    const country = str(props.country);
    const eventId = str(props.eventid) ?? str(props.eventId) ?? `${i}`;
    const alertLevel = str(props.alertlevel) ?? str(props.alertLevel);
    const url = str(props.url) ?? null;

    const dedupeKey = `${eventType}|${eventId}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const severity = gdacsAlertToSeverity(alertLevel);
    const subtitleParts: string[] = [];
    if (country) subtitleParts.push(country);
    if (alertLevel) subtitleParts.push(`alert ${alertLevel.toLowerCase()}`);
    const subtitle = subtitleParts.length > 0 ? subtitleParts.join(" · ") : undefined;

    points.push({
      id: `gdacs-${eventType.toLowerCase().replace(/\s+/g, "_")}-${eventId}`,
      layer: "news",
      title: `${eventType} alert: ${eventName}`,
      subtitle,
      lat,
      lon,
      country: country ?? undefined,
      severity,
      source: "GDACS",
      timestamp: date.toISOString(),
      confidence: 0.7,
      metadata: {
        source_url: url,
        gdacs_event_id: eventId,
        gdacs_event_type: eventType,
        gdacs_alert_level: alertLevel ?? null,
        geo_precision: "city",
      },
    });
  }

  return {
    points,
    health: makeOkHealth(
      PROVIDER,
      `GDACS returned ${points.length} disaster alerts in last ${rangeHours}h (cap ${GDACS_CAP})`,
      Date.now() - startedAt
    ),
  };
}
