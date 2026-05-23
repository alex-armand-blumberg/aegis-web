import type { IntelPoint, IntelSeverity } from "@/lib/intel/types";
import {
  type AdapterResult,
  fetchJsonWithTimeout,
  isValidLatLon,
  isWithinRangeHours,
  makeErrorHealth,
  makeOkHealth,
} from "./_shared";

const NHC_URL = "https://www.nhc.noaa.gov/CurrentStorms.json";
const NHC_CAP = 80;
const PROVIDER = "NOAA NHC";

type NhcStorm = {
  id?: string;
  binNumber?: string;
  name?: string;
  classification?: string;
  intensity?: string;
  pressure?: string;
  latitude?: string;
  longitude?: string;
  latitudeNumeric?: number;
  longitudeNumeric?: number;
  movementDir?: number;
  movementSpeed?: number;
  lastUpdate?: string;
  publicAdvisory?: { url?: string; advNum?: string; issuance?: string };
  forecastTrack?: { url?: string };
};

type NhcResponse = {
  activeStorms?: NhcStorm[];
};

function parseKnots(intensity: string | undefined): number {
  if (!intensity) return 0;
  const m = intensity.match(/(\d+)\s*(kts?|knots?|mph)/i);
  if (!m) return 0;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return 0;
  if ((m[2] ?? "").toLowerCase().startsWith("mph")) return n * 0.868976;
  return n;
}

function classToSeverity(cls: string | undefined, knots: number): IntelSeverity {
  const c = (cls ?? "").toUpperCase();
  if (c === "HU" || knots >= 64) return "critical";
  if (c === "TS" || knots >= 34) return "high";
  if (c === "TD" || knots >= 20) return "medium";
  return "low";
}

function classToTitlePrefix(cls: string | undefined): string {
  const c = (cls ?? "").toUpperCase();
  if (c === "HU") return "Hurricane";
  if (c === "TS") return "Tropical storm";
  if (c === "TD") return "Tropical depression";
  if (c === "PT") return "Post-tropical cyclone";
  if (c === "STD") return "Subtropical depression";
  if (c === "STS") return "Subtropical storm";
  return "Tropical cyclone";
}

export async function fetchNoaaNhcSignals(rangeHours: number): Promise<AdapterResult> {
  const startedAt = Date.now();
  const res = await fetchJsonWithTimeout<NhcResponse>({ url: NHC_URL, timeoutMs: 9_000 });
  if (!res.ok || !res.data || !Array.isArray(res.data.activeStorms)) {
    return {
      points: [],
      health: makeErrorHealth(PROVIDER, res.message ?? "NHC fetch failed", res.latencyMs),
    };
  }

  const points: IntelPoint[] = [];
  for (let i = 0; i < res.data.activeStorms.length; i += 1) {
    if (points.length >= NHC_CAP) break;
    const storm = res.data.activeStorms[i];
    const lat =
      typeof storm.latitudeNumeric === "number"
        ? storm.latitudeNumeric
        : Number(storm.latitude);
    const lon =
      typeof storm.longitudeNumeric === "number"
        ? storm.longitudeNumeric
        : Number(storm.longitude);
    if (!isValidLatLon(lat, lon)) continue;

    const lastUpdate = storm.lastUpdate ?? storm.publicAdvisory?.issuance;
    if (!lastUpdate) continue;
    const ts = new Date(lastUpdate);
    if (!Number.isFinite(ts.getTime())) continue;
    const iso = ts.toISOString();
    // Active storms can be days old; use a generous floor (14 days) regardless of selected range.
    if (!isWithinRangeHours(iso, Math.max(rangeHours, 24 * 14))) continue;

    const knots = parseKnots(storm.intensity);
    const severity = classToSeverity(storm.classification, knots);
    const name = storm.name ?? "Tropical system";
    const title = `${classToTitlePrefix(storm.classification)} ${name}`;

    points.push({
      id: `nhc-${storm.id ?? storm.binNumber ?? i}-${iso}`,
      layer: "news",
      title,
      subtitle: storm.intensity
        ? `${storm.intensity}${storm.pressure ? `, ${storm.pressure}` : ""}`
        : undefined,
      lat,
      lon,
      severity,
      source: "NOAA National Hurricane Center",
      timestamp: iso,
      magnitude: knots,
      confidence: 0.9,
      metadata: {
        source_url: storm.publicAdvisory?.url ?? "https://www.nhc.noaa.gov/",
        nhc_storm_id: storm.id ?? null,
        nhc_classification: storm.classification ?? null,
        nhc_intensity: storm.intensity ?? null,
        nhc_advisory: storm.publicAdvisory?.advNum ?? null,
        geo_precision: "exact",
      },
    });
  }

  return {
    points,
    health: makeOkHealth(
      PROVIDER,
      `NOAA NHC: ${points.length} active tropical systems (cap ${NHC_CAP})`,
      Date.now() - startedAt
    ),
  };
}
