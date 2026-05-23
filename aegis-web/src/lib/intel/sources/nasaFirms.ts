import type { IntelPoint, IntelSeverity } from "@/lib/intel/types";
import {
  type AdapterResult,
  fetchTextWithTimeout,
  isValidLatLon,
  makeErrorHealth,
  makeOkHealth,
  makeSkippedHealth,
  rangeHoursToDays,
} from "./_shared";

const FIRMS_BASE = "https://firms.modaps.eosdis.nasa.gov/api/area/csv";
const FIRMS_PRODUCT_DEFAULT = "VIIRS_NOAA20_NRT";
const FIRMS_CAP = 300;
const PROVIDER = "NASA FIRMS";

function readMapKey(): string | null {
  const v = process.env.NASA_FIRMS_MAP_KEY?.trim();
  return v ? v : null;
}

function frpToSeverity(frp: number, confidence: string): IntelSeverity {
  const c = (confidence ?? "").toLowerCase();
  if (c === "high" && frp >= 200) return "critical";
  if (c === "high" && frp >= 50) return "high";
  if (c === "high") return "medium";
  if (c === "nominal" || c === "n") return frp >= 50 ? "medium" : "low";
  return "low";
}

function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = lines[0].split(",").map((h) => h.trim());
  const rows: string[][] = [];
  for (let i = 1; i < lines.length; i += 1) {
    rows.push(lines[i].split(",").map((c) => c.trim()));
  }
  return { headers, rows };
}

export async function fetchNasaFirmsSignals(rangeHours: number): Promise<AdapterResult> {
  const mapKey = readMapKey();
  if (!mapKey) {
    return {
      points: [],
      health: makeSkippedHealth(PROVIDER, "NASA_FIRMS_MAP_KEY not set"),
    };
  }
  // Bandwidth guardrail: never request more than 2 days of worldwide fires.
  const days = Math.min(2, rangeHoursToDays(rangeHours, 10));
  const url = `${FIRMS_BASE}/${mapKey}/${FIRMS_PRODUCT_DEFAULT}/world/${days}`;

  const startedAt = Date.now();
  const res = await fetchTextWithTimeout({ url, timeoutMs: 12_000 });
  if (!res.ok || !res.text) {
    return {
      points: [],
      health: makeErrorHealth(PROVIDER, res.message ?? "FIRMS fetch failed", res.latencyMs),
    };
  }

  const trimmed = res.text.trim();
  const lower = trimmed.slice(0, 200).toLowerCase();
  if (
    trimmed.startsWith("<") ||
    lower.startsWith("invalid") ||
    lower.includes("error")
  ) {
    return {
      points: [],
      health: makeErrorHealth(PROVIDER, trimmed.slice(0, 160), res.latencyMs),
    };
  }

  const { headers, rows } = parseCsv(trimmed);
  if (headers.length === 0) {
    return {
      points: [],
      health: makeOkHealth(PROVIDER, "FIRMS empty response", res.latencyMs),
    };
  }

  const idx = (key: string) => headers.indexOf(key);
  const latIdx = idx("latitude");
  const lonIdx = idx("longitude");
  const acqDateIdx = idx("acq_date");
  const acqTimeIdx = idx("acq_time");
  const frpIdx = idx("frp");
  const confIdx = idx("confidence");
  const satIdx = idx("satellite");
  if (latIdx < 0 || lonIdx < 0 || acqDateIdx < 0) {
    return {
      points: [],
      health: makeErrorHealth(PROVIDER, "FIRMS missing required CSV columns", res.latencyMs),
    };
  }

  type FirmsRow = {
    lat: number;
    lon: number;
    frp: number;
    confidence: string;
    satellite: string;
    timestamp: string;
  };

  const parsed: FirmsRow[] = [];
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const lat = Number(row[latIdx]);
    const lon = Number(row[lonIdx]);
    if (!isValidLatLon(lat, lon)) continue;
    const acqDate = row[acqDateIdx];
    const acqTime = (acqTimeIdx >= 0 ? row[acqTimeIdx] : "0000") || "0000";
    if (!acqDate) continue;
    const padded = acqTime.padStart(4, "0");
    const hh = padded.slice(0, 2);
    const mm = padded.slice(2, 4);
    const iso = `${acqDate}T${hh}:${mm}:00Z`;
    const ts = new Date(iso);
    if (!Number.isFinite(ts.getTime())) continue;
    const frp = Number(frpIdx >= 0 ? row[frpIdx] : 0);
    const confidence = (confIdx >= 0 ? row[confIdx] : "n").toString();
    const satellite = (satIdx >= 0 ? row[satIdx] : FIRMS_PRODUCT_DEFAULT).toString();
    parsed.push({
      lat,
      lon,
      frp: Number.isFinite(frp) ? frp : 0,
      confidence,
      satellite,
      timestamp: ts.toISOString(),
    });
  }

  parsed.sort((a, b) => b.frp - a.frp);
  const limited = parsed.slice(0, FIRMS_CAP);
  const points: IntelPoint[] = limited.map((row, i) => ({
    id: `firms-${row.satellite}-${row.timestamp}-${i}`,
    layer: "news",
    title: `Active wildfire detection (FRP ${row.frp.toFixed(1)} MW, ${row.confidence} confidence)`,
    subtitle: `NASA FIRMS · ${row.satellite}`,
    lat: row.lat,
    lon: row.lon,
    severity: frpToSeverity(row.frp, row.confidence),
    source: `NASA FIRMS (wildfire) ${row.satellite}`,
    timestamp: row.timestamp,
    magnitude: row.frp,
    confidence:
      row.confidence === "high" ? 0.9 : row.confidence === "nominal" ? 0.7 : 0.5,
    metadata: {
      source_url: "https://firms.modaps.eosdis.nasa.gov/",
      firms_satellite: row.satellite,
      firms_frp_mw: row.frp,
      firms_confidence: row.confidence,
      geo_precision: "exact",
    },
  }));

  return {
    points,
    health: makeOkHealth(
      PROVIDER,
      `NASA FIRMS ${FIRMS_PRODUCT_DEFAULT} ${days}d worldwide: ${points.length}/${parsed.length} fires (cap ${FIRMS_CAP})`,
      Date.now() - startedAt
    ),
  };
}
