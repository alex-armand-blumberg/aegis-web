import type { IntelPoint, IntelSeverity } from "@/lib/intel/types";
import {
  type AdapterResult,
  fetchJsonWithTimeout,
  isValidLatLon,
  isWithinRangeHours,
  makeErrorHealth,
  makeOkHealth,
} from "./_shared";

const USGS_FEED_BASE = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary";
const USGS_CAP = 200;
const PROVIDER = "USGS Earthquakes";

function selectFeed(rangeHours: number): { url: string; description: string } {
  if (rangeHours <= 25) {
    return {
      url: `${USGS_FEED_BASE}/2.5_day.geojson`,
      description: "M2.5+ past 24h",
    };
  }
  if (rangeHours <= 24 * 8) {
    return {
      url: `${USGS_FEED_BASE}/4.5_week.geojson`,
      description: "M4.5+ past 7d",
    };
  }
  return {
    url: `${USGS_FEED_BASE}/4.5_month.geojson`,
    description: "M4.5+ past 30d",
  };
}

function magnitudeToSeverity(mag: number): IntelSeverity {
  if (!Number.isFinite(mag)) return "low";
  if (mag >= 6.5) return "critical";
  if (mag >= 5.5) return "high";
  if (mag >= 4.5) return "medium";
  return "low";
}

type UsgsFeature = {
  id?: string;
  properties?: {
    mag?: number;
    place?: string;
    time?: number;
    updated?: number;
    url?: string;
    title?: string;
    sig?: number;
    tsunami?: number;
    code?: string;
  };
  geometry?: {
    type?: string;
    coordinates?: number[];
  };
};

type UsgsResponse = {
  features?: UsgsFeature[];
};

function placeToCountry(place: string | undefined): string | undefined {
  if (!place) return undefined;
  const tail = place.split(",").pop()?.trim();
  if (!tail) return undefined;
  if (/^[A-Za-z .'\-]+$/.test(tail)) return tail;
  return undefined;
}

export async function fetchUsgsEarthquakeSignals(rangeHours: number): Promise<AdapterResult> {
  const startedAt = Date.now();
  const feed = selectFeed(rangeHours);
  const res = await fetchJsonWithTimeout<UsgsResponse>({
    url: feed.url,
    timeoutMs: 9_000,
  });
  if (!res.ok || !res.data || !Array.isArray(res.data.features)) {
    return {
      points: [],
      health: makeErrorHealth(PROVIDER, res.message ?? "USGS fetch failed", res.latencyMs),
    };
  }

  const sorted = res.data.features
    .filter((f): f is UsgsFeature => f != null && typeof f === "object")
    .sort((a, b) => (b.properties?.mag ?? 0) - (a.properties?.mag ?? 0));

  const points: IntelPoint[] = [];
  for (let i = 0; i < sorted.length; i += 1) {
    if (points.length >= USGS_CAP) break;
    const f = sorted[i];
    const props = f.properties ?? {};
    const coords = f.geometry?.coordinates ?? [];
    if (!Array.isArray(coords) || coords.length < 2) continue;
    const lon = Number(coords[0]);
    const lat = Number(coords[1]);
    if (!isValidLatLon(lat, lon)) continue;

    const time = typeof props.time === "number" ? new Date(props.time).toISOString() : null;
    if (!time) continue;
    if (!isWithinRangeHours(time, rangeHours)) continue;

    const mag = Number(props.mag ?? 0);
    const place = props.place ?? "Unknown location";
    const country = placeToCountry(place);
    const title = `M${mag.toFixed(1)} earthquake — ${place}`;

    points.push({
      id: `usgs-eq-${f.id ?? i}`,
      layer: "news",
      title,
      subtitle: place,
      lat,
      lon,
      country,
      severity: magnitudeToSeverity(mag),
      source: "USGS Earthquake Hazards Program",
      timestamp: time,
      magnitude: mag,
      confidence: 0.92,
      metadata: {
        source_url: typeof props.url === "string" ? props.url : null,
        usgs_id: f.id ?? null,
        usgs_significance: typeof props.sig === "number" ? props.sig : null,
        usgs_tsunami: typeof props.tsunami === "number" ? props.tsunami : null,
        usgs_feed: feed.description,
        geo_precision: "exact",
      },
    });
  }

  return {
    points,
    health: makeOkHealth(
      PROVIDER,
      `USGS ${feed.description}: ${points.length} earthquakes (cap ${USGS_CAP})`,
      Date.now() - startedAt
    ),
  };
}
