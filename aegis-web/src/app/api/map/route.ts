import { NextResponse } from "next/server";
import { COUNTRY_BBOX } from "@/lib/countryBounds";
import { formatCountryDisplayName, normalizeCountryKey } from "@/lib/countryDisplay";
import { countryFromIcao24Hex } from "@/lib/icao24HexCountry";
import { countryFromMmsi } from "@/lib/mmsiMidCountry";
import { countryFromNavalOrCommercialName } from "@/lib/vesselNameCountry";
import { aisShipTypeCodeToLabel } from "@/lib/aisShipType";
import {
  getNaturalEarthCountryCentersMap,
} from "@/lib/naturalEarthCountryCenters";
import type {
  ActiveConflictCountry,
  EscalationRiskCountry,
  FrontlineOverlay,
  IntelLayerKey,
  IntelPoint,
  MapApiResponse,
  ProviderHealth,
} from "@/lib/intel/types";
import {
  MAP_SOURCE_FAMILY_MATRIX,
  REQUESTED_SOURCE_ACCESS_MATRIX,
  WORLDMONITOR_RSS_NETWORK,
} from "@/lib/intel/sourceRegistry";

const ACLED_ARCGIS_QUERY_URL =
  "https://services8.arcgis.com/xu983xJB6fIDCjpX/arcgis/rest/services/ACLED/FeatureServer/0/query";

const ACLED_FIELDS =
  "country,admin1,event_month,battles,explosions_remote_violence,protests,riots,strategic_developments,violence_against_civilians,violent_actors,fatalities,centroid_longitude,centroid_latitude,ObjectId";

const COUNTRY_NAMES = Object.keys(COUNTRY_BBOX);
const ISW_UKRAINE_FRONTLINE_GEOJSON_URL =
  "https://services-eu1.arcgis.com/fppoCYaq7HfVFbIV/ArcGIS/rest/services/UKR_Frontline_27072025/FeatureServer/0/query?where=1%3D1&outFields=Date,Source&f=geojson";

function rangeToHours(range: string): number {
  switch ((range || "").toLowerCase()) {
    case "1h":
      return 1;
    case "6h":
      return 6;
    case "24h":
      return 24;
    case "7d":
      return 24 * 7;
    case "30d":
      return 24 * 30;
    default:
      return 24 * 7;
  }
}

function parseLayers(raw: string | null): IntelLayerKey[] {
  const defaults: IntelLayerKey[] = [
    "conflicts",
    "liveStrikes",
    "flights",
    "vessels",
    "carriers",
    "news",
    "escalationRisk",
    "hotspots",
    "infrastructure",
  ];
  if (!raw?.trim()) return defaults;
  const allowed = new Set(defaults);
  const out = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is IntelLayerKey => allowed.has(s as IntelLayerKey));
  return out.length ? out : defaults;
}

type SourcePackKey = "core" | "openSourceIntel" | "lawfareTroops" | "experimentalTrackers";

const DEFAULT_SOURCE_PACKS: SourcePackKey[] = [
  "core",
  "openSourceIntel",
  "lawfareTroops",
  "experimentalTrackers",
];
const AVAILABLE_SOURCE_PACKS: SourcePackKey[] = [
  "core",
  "openSourceIntel",
  "lawfareTroops",
  "experimentalTrackers",
];

function parseSourcePacks(raw: string | null): SourcePackKey[] {
  if (!raw?.trim()) return DEFAULT_SOURCE_PACKS;
  const allowed = new Set<SourcePackKey>(AVAILABLE_SOURCE_PACKS);
  const parsed = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is SourcePackKey => allowed.has(s as SourcePackKey));
  if (!parsed.length) return DEFAULT_SOURCE_PACKS;
  if (!parsed.includes("core")) parsed.unshift("core");
  return Array.from(new Set(parsed));
}

async function timedJsonFetch<T>(
  url: string,
  init?: RequestInit,
  timeoutMs = 12000
): Promise<{ ok: boolean; data?: T; message?: string; latencyMs: number }> {
  const started = Date.now();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...init,
      signal: ctl.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      return {
        ok: false,
        message: `HTTP ${res.status}`,
        latencyMs: Date.now() - started,
      };
    }
    const text = await res.text();
    if (!text.trim()) {
      return {
        ok: true,
        data: undefined,
        message: "Empty response body",
        latencyMs: Date.now() - started,
      };
    }
    const data = JSON.parse(text) as T;
    return { ok: true, data, latencyMs: Date.now() - started };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Request failed",
      latencyMs: Date.now() - started,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchTextWithRetries(
  urls: string[],
  timeoutMs = 12000,
  attemptsPerUrl = 2
): Promise<{ ok: boolean; text?: string; message?: string }> {
  let lastMessage = "fetch failed";
  for (const url of urls) {
    for (let attempt = 0; attempt < attemptsPerUrl; attempt += 1) {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), timeoutMs);
      try {
        const res = await fetch(url, { cache: "no-store", signal: ctl.signal });
        if (!res.ok) {
          lastMessage = `HTTP ${res.status}`;
          continue;
        }
        const text = await res.text();
        if (text.trim()) return { ok: true, text };
        lastMessage = "Empty response";
      } catch (err) {
        lastMessage = err instanceof Error ? err.message : "fetch failed";
      } finally {
        clearTimeout(timer);
      }
    }
  }
  return { ok: false, message: lastMessage };
}

const NETWORK_DIGEST_TTL_MS = 8 * 60 * 1000;
type CachedNetworkDigest = {
  points: IntelPoint[];
  fetchedAt: number;
  diagnostics: string;
};
const networkDigestCache = new Map<string, CachedNetworkDigest>();

function getNetworkCacheKey(label: string, rangeHours: number): string {
  return `${label}:${rangeHours}`;
}

async function readNetworkDigestCache(
  label: string,
  rangeHours: number
): Promise<CachedNetworkDigest | null> {
  const key = getNetworkCacheKey(label, rangeHours);
  const mem = networkDigestCache.get(key);
  if (mem && Date.now() - mem.fetchedAt < NETWORK_DIGEST_TTL_MS) return mem;

  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) return null;
  try {
    const res = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { result?: string | null };
    if (!json.result) return null;
    const parsed = JSON.parse(json.result) as CachedNetworkDigest;
    if (!parsed?.fetchedAt || Date.now() - parsed.fetchedAt > NETWORK_DIGEST_TTL_MS) return null;
    networkDigestCache.set(key, parsed);
    return parsed;
  } catch {
    return null;
  }
}

async function writeNetworkDigestCache(
  label: string,
  rangeHours: number,
  value: CachedNetworkDigest
): Promise<void> {
  const key = getNetworkCacheKey(label, rangeHours);
  networkDigestCache.set(key, value);

  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) return;
  try {
    const encodedValue = encodeURIComponent(JSON.stringify(value));
    await fetch(
      `${url}/set/${encodeURIComponent(key)}/${encodedValue}?EX=${Math.ceil(
        NETWORK_DIGEST_TTL_MS / 1000
      )}`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      }
    );
  } catch {
    // Best-effort cache write only.
  }
}

function mapSeverity(v: number): "low" | "medium" | "high" | "critical" {
  if (v >= 0.75) return "critical";
  if (v >= 0.45) return "high";
  if (v >= 0.2) return "medium";
  return "low";
}

function shiftMonthString(ym: string, deltaMonths: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC((y || 1970), (m || 1) - 1 + deltaMonths, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthToDate(ym: string): Date {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y || 1970, (m || 1) - 1, 1));
}

function pointMagnitudeFromAcled(a: Record<string, unknown>): number {
  return (
    (Number(a.battles) || 0) * 3 +
    (Number(a.explosions_remote_violence) || 0) * 2.5 +
    (Number(a.violence_against_civilians) || 0) * 2.5 +
    (Number(a.strategic_developments) || 0) * 1.5 +
    (Number(a.protests) || 0) * 0.4 +
    (Number(a.riots) || 0) * 0.8
  );
}

async function fetchAcledConflicts(rangeHours: number): Promise<{
  points: IntelPoint[];
  health: ProviderHealth;
}> {
  const now = new Date();
  const start = new Date(now.getTime() - rangeHours * 3600_000);
  const startMonth = `${start.getUTCFullYear()}-${String(
    start.getUTCMonth() + 1
  ).padStart(2, "0")}`;
  const endMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(
    2,
    "0"
  )}`;

  const points: IntelPoint[] = [];
  const pageSize = 2000;
  let offset = 0;
  const started = Date.now();

  while (true) {
    const params = new URLSearchParams({
      where: "1=1",
      outFields: ACLED_FIELDS,
      returnGeometry: "false",
      orderByFields: "ObjectId ASC",
      resultOffset: String(offset),
      resultRecordCount: String(pageSize),
      f: "json",
    });

    const { ok, data, message } = await timedJsonFetch<{
      features?: { attributes: Record<string, unknown> }[];
      error?: { message?: string };
    }>(`${ACLED_ARCGIS_QUERY_URL}?${params.toString()}`);

    if (!ok || !data) {
      return {
        points,
        health: {
          provider: "ACLED ArcGIS",
          ok: false,
          updatedAt: new Date().toISOString(),
          latencyMs: Date.now() - started,
          message: message ?? "Failed to query ACLED",
        },
      };
    }

    if (data.error) {
      return {
        points,
        health: {
          provider: "ACLED ArcGIS",
          ok: false,
          updatedAt: new Date().toISOString(),
          latencyMs: Date.now() - started,
          message: data.error.message ?? "ACLED service error",
        },
      };
    }

    const features = data.features ?? [];

    for (const f of features) {
      const a = f.attributes;
      const lat = Number(a.centroid_latitude);
      const lon = Number(a.centroid_longitude);
      if (
        Number.isNaN(lat) ||
        Number.isNaN(lon) ||
        lat < -90 ||
        lat > 90 ||
        lon < -180 ||
        lon > 180
      ) {
        continue;
      }

      const eventMonth =
        typeof a.event_month === "number"
          ? new Date(a.event_month).toISOString().slice(0, 7)
          : String(a.event_month ?? "").slice(0, 7);

      if (!eventMonth) continue;

      const magnitude = pointMagnitudeFromAcled(a);
      if (magnitude <= 0) continue;

      const country = String(a.country ?? "").trim();
      const admin1 = a.admin1 ? String(a.admin1) : "";
      const ts = monthToDate(eventMonth).toISOString();
      const norm = Math.min(1, magnitude / 120);
      const battles = Number(a.battles) || 0;
      const explosions = Number(a.explosions_remote_violence) || 0;
      const civilians = Number(a.violence_against_civilians) || 0;
      const protests = Number(a.protests) || 0;
      const riots = Number(a.riots) || 0;
      const fatalities = Number(a.fatalities) || 0;
      const hardKinetic = battles + explosions + civilians;
      const protestDominant = protests >= 8 && hardKinetic <= 1 && fatalities <= 2;
      const adjustedMagnitude = protestDominant ? Math.max(1, magnitude * 0.45) : magnitude;
      const adjustedNorm = Math.min(1, adjustedMagnitude / 120);
      const subtitle = protestDominant
        ? "ACLED monthly protest-heavy signal"
        : "ACLED monthly conflict aggregate";
      const title = protestDominant
        ? admin1
          ? `${admin1}, ${country} protest signal`
          : `${country} protest signal`
        : admin1
          ? `${admin1}, ${country}`
          : country || "Unknown";
      const severity = protestDominant
        ? adjustedNorm >= 0.45
          ? "medium"
          : "low"
        : mapSeverity(norm);

      points.push({
        id: `acled-${String(a.ObjectId ?? `${country}-${admin1}-${eventMonth}`)}`,
        layer: "conflicts",
        title,
        subtitle,
        lat,
        lon,
        country,
        severity,
        source: "ACLED ArcGIS",
        timestamp: ts,
        magnitude: adjustedMagnitude,
        confidence: 0.75,
        metadata: {
          eventMonth,
          battles,
          explosions,
          protests,
          riots,
          strategic: Number(a.strategic_developments) || 0,
          civilians,
          fatalities,
          event_type: protestDominant ? "protest_signal" : "conflict_aggregate",
          protest_dominant: protestDominant,
        },
      });
    }

    if (features.length < pageSize) break;
    offset += pageSize;
    if (offset > 50000) break;
  }

  const strictRangePoints = points.filter((p) => {
    const eventMonth = p.metadata?.eventMonth;
    if (typeof eventMonth !== "string") return false;
    return eventMonth >= startMonth && eventMonth <= endMonth;
  });

  let filteredPoints = strictRangePoints;
  let rangeLabel = `${startMonth}..${endMonth}`;

  // ACLED ArcGIS is monthly and often lags the current month. For short windows,
  // fall back to the latest available month(s) so the map does not appear empty.
  if (filteredPoints.length === 0 && points.length > 0) {
    const months = Array.from(
      new Set(
        points
          .map((p) => p.metadata?.eventMonth)
          .filter((m): m is string => typeof m === "string")
      )
    ).sort();
    const latestMonth = months[months.length - 1];
    const previousMonth = shiftMonthString(latestMonth, -1);
    filteredPoints = points.filter((p) => {
      const m = p.metadata?.eventMonth;
      return typeof m === "string" && m >= previousMonth && m <= latestMonth;
    });
    rangeLabel = `${previousMonth}..${latestMonth} (latest available fallback)`;
  }

  return {
    points: filteredPoints,
    health: {
      provider: "ACLED ArcGIS",
      ok: true,
      updatedAt: new Date().toISOString(),
      latencyMs: Date.now() - started,
      message: `Loaded ${filteredPoints.length} points (${rangeLabel})`,
    },
  };
}

function buildUcdpVersionCandidates(): string[] {
  const year = new Date().getUTCFullYear() - 2000;
  return Array.from(new Set([`${year}.1`, `${year - 1}.1`, "25.1", "24.1"]));
}

type UcdpRawEvent = {
  id?: string | number;
  date_start?: string;
  date_end?: string;
  latitude?: number | string;
  longitude?: number | string;
  country?: string;
  side_a?: string;
  side_b?: string;
  best?: number | string;
  low?: number | string;
  high?: number | string;
  type_of_violence?: number | string;
  source_original?: string;
};

async function fetchUcdpConflicts(rangeHours: number): Promise<{
  points: IntelPoint[];
  health: ProviderHealth;
}> {
  const token = process.env.UCDP_ACCESS_TOKEN?.trim();
  const started = Date.now();
  const cutoff = Date.now() - rangeHours * 3600_000;
  const versions = buildUcdpVersionCandidates();

  let events: UcdpRawEvent[] = [];
  let selectedVersion = "";

  for (const version of versions) {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (token) headers["x-ucdp-access-token"] = token;
    const res = await timedJsonFetch<{ Result?: UcdpRawEvent[] }>(
      `https://ucdpapi.pcr.uu.se/api/gedevents/${version}?pagesize=1200&page=0`,
      { headers },
      14000
    );
    if (res.ok && res.data?.Result?.length) {
      events = res.data.Result;
      selectedVersion = version;
      break;
    }
  }

  if (!events.length) {
    return {
      points: [],
      health: {
        provider: "UCDP",
        ok: false,
        updatedAt: new Date().toISOString(),
        latencyMs: Date.now() - started,
        message: token
          ? "UCDP returned no events for tested versions"
          : "UCDP returned no events (set UCDP_ACCESS_TOKEN for higher reliability)",
      },
    };
  }

  const points: IntelPoint[] = [];
  for (const raw of events) {
    const lat = Number(raw.latitude);
    const lon = Number(raw.longitude);
    if (Number.isNaN(lat) || Number.isNaN(lon)) continue;
    const ts = Date.parse(String(raw.date_start || ""));
    if (!Number.isFinite(ts) || ts < cutoff) continue;

    const deathsBest = Number(raw.best) || 0;
    const deathsHigh = Number(raw.high) || deathsBest;
    const deathsLow = Number(raw.low) || deathsBest;
    const norm = Math.min(1, Math.max(0.05, deathsBest / 80));
    const country = String(raw.country || "").trim();
    const sideA = String(raw.side_a || "").trim();
    const sideB = String(raw.side_b || "").trim();
    points.push({
      id: `ucdp-${raw.id ?? `${lat}-${lon}-${ts}`}`,
      layer: "conflicts",
      title: country || "Conflict event",
      subtitle: sideA && sideB ? `${sideA} vs ${sideB}` : "UCDP violence event",
      lat,
      lon,
      country: country || undefined,
      severity: mapSeverity(norm),
      source: "UCDP",
      timestamp: new Date(ts).toISOString(),
      magnitude: Math.max(1, deathsBest),
      confidence: 0.82,
      metadata: {
        deaths_best: deathsBest,
        deaths_low: deathsLow,
        deaths_high: deathsHigh,
        violence_type: String(raw.type_of_violence || ""),
      },
    });
  }

  return {
    points: points.slice(0, 1400),
    health: {
      provider: "UCDP",
      ok: true,
      updatedAt: new Date().toISOString(),
      latencyMs: Date.now() - started,
      message: `Loaded ${points.length} conflict events (v${selectedVersion}, auth: ${
        token ? "token" : "anonymous"
      })`,
    },
  };
}

type OpenSkyStatesResponse = {
  time?: number;
  states?: Array<[
    string | null,
    string | null,
    string | null,
    number | null,
    number | null,
    number | null,
    boolean | null,
    number | null,
    number | null,
    number | null,
    boolean | null,
    number | null,
    number | null,
    number | null,
    number | null,
    number | null,
    number | null
  ]>;
};

const MILITARY_CALLSIGN_RE =
  /(^|\s)(RCH|REACH|DUKE|NAVY|USAF|RAF|RRR|NATO|IAF|ROKAF|QID|AIO|CNV|FORTE|HOMER|LAGR|JSTARS|COPPER|SHELL|ARAB|TUAF|SPAR|SAM|HURON|ASCOT|RFR|OMEN|MC|MIG|SU-|F-16|F-35|IL-76|ANKA|QTR|UAEAF|RSAF|C-?130|C-?17|A400|AN-?124|KC-?135|KC-?10|TANKER|MRTT|AWACS|E-?3|E-?2)/i;

const MILITARY_ORIGIN_COUNTRY_RE =
  /\b(United States|United Kingdom|France|Germany|Italy|Turkey|Israel|Russia|Ukraine|India|Pakistan|Saudi Arabia|United Arab Emirates|Qatar|Iran|China|Japan|South Korea)\b/i;

function isLikelyMilitaryOpenSkyRow(
  callsign: string,
  originCountry: string,
  onGround: boolean,
  velocityMs: number,
  altitudeM: number
): boolean {
  if (MILITARY_CALLSIGN_RE.test(callsign)) return true;
  const compact = callsign.replace(/\s+/g, "");
  const hasMilitaryStylePattern = /^[A-Z]{2,5}\d{2,5}[A-Z]?$/.test(compact);
  return (
    !onGround &&
    hasMilitaryStylePattern &&
    MILITARY_ORIGIN_COUNTRY_RE.test(originCountry) &&
    (velocityMs >= 90 || altitudeM >= 1200)
  );
}

function inferAircraftRole(callsign: string): string {
  const c = callsign.toUpperCase();
  if (/\b(AF|RCH|REACH|ASCOT|DUKE|SPAR)\b/.test(c)) return "Air force transport";
  if (/\b(C-?130|C-?17|A400|AN-?124|IL-?76|KC-?135|KC-?10|MRTT|TANKER)\b/.test(c)) {
    return "Air force transport";
  }
  if (/\b(AWACS|E-?3|E-?2)\b/.test(c)) return "ISR/Drone mission";
  if (/\b(NAVY|CNV|USS|USN)\b/.test(c)) return "Naval aviation";
  if (/\b(FORTE|RQ|MQ|UAV|DRONE)\b/.test(c)) return "ISR/Drone mission";
  if (/\b(F-16|F-35|MIG|SU-)\b/.test(c)) return "Combat jet";
  return "Military flight";
}

/** Fixed-wing vs helicopter vs tilt-rotor for click-through detail. */
function inferAircraftPlatformCategory(callsign: string): string {
  const c = callsign.toUpperCase();
  if (/\b(MV-|CV-|V-?22|OSPREY)\b/.test(c)) return "Tilt-rotor aircraft";
  if (
    /\b(MH-|UH-|AH-|SH-|CH-|HH-|TH-|VH-|ZH-|OH-|HAWK|CHINOOK|APACHE|SEAHAWK|BLACKHAWK|HELICOPTER|HELO|ROTOR|PAVE|HUEY|HIND|MERLIN|SEAKING|SEAHAWK|VIKING|HUSKY)\b/.test(
      c
    )
  ) {
    return "Helicopter / rotorcraft";
  }
  if (/\b(AWACS|E-?3|E-?2|FORTE|RQ|MQ|UAV|DRONE|UAV|GLOBAL\s*HAWK)\b/.test(c)) {
    return "ISR / special mission (fixed-wing)";
  }
  return "Fixed-wing aircraft";
}

function isLikelyMilitaryAdsbLolRow(
  callsign: string,
  velocity: number,
  altitude: number
): boolean {
  const cs = callsign.toUpperCase();
  if (MILITARY_CALLSIGN_RE.test(cs)) return true;
  const compact = cs.replace(/\s+/g, "");
  const hasMilitaryStylePattern = /^[A-Z]{2,5}\d{2,5}[A-Z]?$/.test(compact);
  // More permissive: the goal is "military-like" coverage for map density.
  // We still keep a minimum movement/altitude threshold to avoid plotting every civil pattern.
  return hasMilitaryStylePattern && (velocity >= 12 || altitude >= 300);
}

async function fetchOpenSkyOAuthToken(
  clientId: string,
  clientSecret: string
): Promise<string | null> {
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
  });
  const res = await timedJsonFetch<{ access_token?: string }>(
    "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    },
    10000
  );
  if (!res.ok || !res.data?.access_token) return null;
  return res.data.access_token;
}

function extractOpenSkyMilitaryPoints(
  rows: OpenSkyStatesResponse["states"],
  timestampSeconds: number
): IntelPoint[] {
  const points: IntelPoint[] = [];
  for (const r of rows ?? []) {
    const callsign = String(r[1] ?? "").trim();
    const originCountry = String(r[2] ?? "").trim();
    const lon = Number(r[5]);
    const lat = Number(r[6]);
    if (Number.isNaN(lat) || Number.isNaN(lon)) continue;
    const baroAltitude = Number(r[7]) || 0;
    const onGround = Boolean(r[8]);
    const velocity = Number(r[9]) || 0;
    const trueTrack = Number(r[10]);
    const verticalRate = Number(r[11]) || 0;
    const altitude = Number(r[13]) || baroAltitude;
    const squawk = String(r[14] ?? "").trim();
    const icao24 = String(r[0] ?? "").trim();
    if (!isLikelyMilitaryOpenSkyRow(callsign, originCountry, onGround, velocity, altitude)) continue;
    const norm = Math.min(1, velocity / 320);
    const speedKts = Number((velocity * 1.943844).toFixed(1));
    const role = inferAircraftRole(callsign);
    const platform = inferAircraftPlatformCategory(callsign);
    const country = resolveFlightCountry(lat, lon, icao24, originCountry);

    points.push({
      id: `flight-${icao24 || `${callsign}-${lat}-${lon}`}`,
      layer: "flights",
      title: callsign || "Military flight",
      subtitle: `${country || "Unknown origin"} • ${platform} • ${role}`,
      lat,
      lon,
      country: country || undefined,
      severity: mapSeverity(norm),
      source: "OpenSky",
      timestamp: new Date(timestampSeconds * 1000).toISOString(),
      magnitude: velocity,
      confidence: 0.65,
      metadata: {
        country: country || null,
        velocity_ms: velocity,
        speed_kts: speedKts,
        altitude_m: altitude,
        heading_deg: Number.isFinite(trueTrack) ? Math.round(trueTrack) : null,
        vertical_rate_ms: verticalRate,
        squawk: squawk || null,
        icao24: icao24 || null,
        callsign: callsign || null,
        origin_country: originCountry || null,
        on_ground: onGround,
        aircraft_role: role,
        aircraft_platform: platform,
        aircraft_type: platform,
        purpose: role,
      },
    });
  }
  return points;
}

async function fetchOpenSkyFlights(): Promise<{
  points: IntelPoint[];
  health: ProviderHealth;
}> {
  const username = process.env.OPENSKY_USERNAME?.trim();
  const password = process.env.OPENSKY_PASSWORD?.trim();
  const clientId = process.env.OPENSKY_CLIENT_ID?.trim();
  const clientSecret = process.env.OPENSKY_CLIENT_SECRET?.trim();

  let authHeader: HeadersInit | undefined;
  let authLabel = "none";

  if (clientId && clientSecret) {
    const token = await fetchOpenSkyOAuthToken(clientId, clientSecret);
    if (token) {
      authHeader = { Authorization: `Bearer ${token}` };
      authLabel = "oauth2";
    }
  }

  if (!authHeader) {
    authHeader =
      username && password
      ? {
          Authorization:
            "Basic " + Buffer.from(`${username}:${password}`).toString("base64"),
        }
      : undefined;
    if (authHeader) authLabel = "basic";
  }

  const started = Date.now();
  const res = await timedJsonFetch<OpenSkyStatesResponse>(
    "https://opensky-network.org/api/states/all",
    { headers: authHeader },
    12000
  );

  if (res.ok && res.data) {
    const points = await enrichFlightPointsWithAdsbHexMeta(
      extractOpenSkyMilitaryPoints(
        res.data.states,
        res.data.time ?? Math.floor(Date.now() / 1000)
      )
    );
    return {
      points: points.slice(0, 4500),
      health: {
        provider: "OpenSky",
        ok: true,
        updatedAt: new Date().toISOString(),
        latencyMs: Date.now() - started,
        message: `Tracked ${points.length} military-like flights (${authLabel})`,
      },
    };
  }

  const fallback = await timedJsonFetch<{
    ac?: Array<{
      hex?: string;
      flight?: string;
      lat?: number;
      lon?: number;
      gs?: number;
      alt_baro?: number | string;
      t?: number;
    }>;
  }>("https://api.adsb.lol/v2/mil", undefined, 10000);

  if (!fallback.ok || !fallback.data) {
    return {
      points: [],
      health: {
        provider: "OpenSky",
        ok: false,
        updatedAt: new Date().toISOString(),
        latencyMs: res.latencyMs,
        message:
          res.message ??
          "OpenSky unavailable. Check credentials and provider limits.",
      },
    };
  }

  const points: IntelPoint[] = [];
  for (const flight of fallback.data.ac ?? []) {
    const lat = Number(flight.lat);
    const lon = Number(flight.lon);
    if (Number.isNaN(lat) || Number.isNaN(lon)) continue;
    const callsign = String(flight.flight ?? "").trim();
    const velocity = Number(flight.gs) || 0;
    const altitude = Number(flight.alt_baro) || 0;
    const speedKts = Number((velocity * 1.943844).toFixed(1));
    const role = inferAircraftRole(callsign || "");
    const platform = inferAircraftPlatformCategory(callsign || "");
    const hexStr = String(flight.hex ?? "").trim();
    const country = resolveFlightCountry(lat, lon, hexStr, "");
    points.push({
      id: `flight-fallback-${flight.hex ?? `${lat}-${lon}`}`,
      layer: "flights",
      title: callsign || "Military flight",
      subtitle: country ? `${platform} • ${role} • ${country} • adsb.lol v2/mil` : `${platform} • ${role} • adsb.lol v2/mil`,
      lat,
      lon,
      country,
      severity: mapSeverity(Math.min(1, velocity / 320)),
      source: "adsb.lol fallback",
      timestamp: new Date((Number(flight.t) || Date.now() / 1000) * 1000).toISOString(),
      magnitude: velocity,
      confidence: 0.55,
      metadata: {
        country: country || null,
        velocity_ms: velocity,
        speed_kts: speedKts,
        altitude_m: altitude,
        icao24: hexStr || null,
        callsign: callsign || null,
        hex: hexStr || null,
        aircraft_role: role,
        aircraft_platform: platform,
        aircraft_type: platform,
        purpose: role,
      },
    });
  }

  // Enrichment when /v2/mil returns few aircraft (OpenSky often fails for auth).
  // We query multiple geographic circles and keep only "military-like" callsigns.
  const gridCenters: Array<{ label: string; lat: number; lon: number }> = [
    { label: "ME", lat: 30.0, lon: 45.0 },
    { label: "SA", lat: 23.0, lon: 78.0 },
    { label: "EAPAC", lat: 25.0, lon: 120.0 },
    { label: "AFR", lat: 0.0, lon: 20.0 },
    { label: "EUR", lat: 50.0, lon: 10.0 },
    { label: "NAm", lat: 40.0, lon: -95.0 },
    { label: "SAm", lat: 0.0, lon: -60.0 },
    { label: "WAFR", lat: 15.0, lon: -15.0 },
    { label: "EAS", lat: 20.0, lon: 100.0 },
    { label: "SEA", lat: 5.0, lon: 105.0 },
  ];
  for (const c of gridCenters) {
    const gridUrl = `https://api.adsb.lol/v2/lat/${c.lat}/lon/${c.lon}/dist/250`;
    const grid = await timedJsonFetch<{
      ac?: Array<{
        hex?: string;
        flight?: string;
        lat?: number;
        lon?: number;
        gs?: number;
        alt_baro?: number | string;
        t?: number;
      }>;
    }>(gridUrl, undefined, 7000);
    if (!grid.ok || !grid.data) continue;

    for (const flight of grid.data.ac ?? []) {
      const lat = Number(flight.lat);
      const lon = Number(flight.lon);
      if (Number.isNaN(lat) || Number.isNaN(lon)) continue;
      const callsign = String(flight.flight ?? "").trim();
      if (!callsign) continue;
      const velocity = Number(flight.gs) || 0;
      const altitude = Number(flight.alt_baro) || 0;
      if (!isLikelyMilitaryAdsbLolRow(callsign, velocity, altitude)) continue;
      const speedKts = Number((velocity * 1.943844).toFixed(1));
      const role = inferAircraftRole(callsign);
      const platform = inferAircraftPlatformCategory(callsign);
      const hexStr = String(flight.hex ?? "").trim();
      const country = resolveFlightCountry(lat, lon, hexStr, "");

      points.push({
        id: `flight-grid-${c.label}-${flight.hex ?? `${lat}-${lon}`}`,
        layer: "flights",
        title: callsign,
        subtitle: country ? `${platform} • ${role} • ${country} • adsb.lol grid` : `${platform} • ${role} • adsb.lol grid`,
        lat,
        lon,
        country,
        severity: mapSeverity(Math.min(1, velocity / 320)),
        source: "adsb.lol grid fallback",
        timestamp: new Date((Number(flight.t) || Date.now() / 1000) * 1000).toISOString(),
        magnitude: velocity,
        confidence: 0.45,
        metadata: {
          country: country || null,
          velocity_ms: velocity,
          speed_kts: speedKts,
          altitude_m: altitude,
          icao24: hexStr || null,
          callsign: callsign || null,
          hex: hexStr || null,
          aircraft_role: role,
          aircraft_platform: platform,
          aircraft_type: platform,
          purpose: role,
        },
      });
    }
  }

  const enriched = await enrichFlightPointsWithAdsbHexMeta(points);
  return {
    points: enriched.slice(0, 9000),
    health: {
      provider: "OpenSky",
      ok: true,
      updatedAt: new Date().toISOString(),
      latencyMs: Date.now() - started,
      message: `OpenSky failed; fallback loaded ${points.length} military flights`,
    },
  };
}

const COUNTRY_ALIASES: Array<{ keyword: string; country: string }> = [
  { keyword: "ukrainian", country: "Ukraine" },
  { keyword: "russian", country: "Russia" },
  { keyword: "sudanese", country: "Sudan" },
  { keyword: "israeli", country: "Israel" },
  { keyword: "palestinian", country: "Judea & Samaria / Palestine" },
  { keyword: "syrian", country: "Syria" },
  { keyword: "yemeni", country: "Yemen" },
  { keyword: "iranian", country: "Iran" },
  { keyword: "myanmarese", country: "Myanmar" },
  { keyword: "burmese", country: "Myanmar" },
  { keyword: "tatmadaw", country: "Myanmar" },
  { keyword: "pakistani", country: "Pakistan" },
  { keyword: "afghan", country: "Afghanistan" },
  { keyword: "uae", country: "United Arab Emirates" },
  { keyword: "emirati", country: "United Arab Emirates" },
  { keyword: "saudi", country: "Saudi Arabia" },
  { keyword: "qatari", country: "Qatar" },
  { keyword: "omani", country: "Oman" },
  { keyword: "bahraini", country: "Bahrain" },
  { keyword: "kuwaiti", country: "Kuwait" },
];

function extractMentionedCountry(text: string): string | null {
  const normalized = text.toLowerCase();

  for (const alias of COUNTRY_ALIASES) {
    if (normalized.includes(alias.keyword)) return alias.country;
  }

  for (const name of COUNTRY_NAMES) {
    if (normalized.includes(name.toLowerCase())) return name;
  }
  return null;
}

function inferCountryFromLatLon(lat: number, lon: number): string | undefined {
  for (const [country, bbox] of Object.entries(COUNTRY_BBOX)) {
    const [latMin, latMax, lonMin, lonMax] = bbox;
    if (lat >= latMin && lat <= latMax && lon >= lonMin && lon <= lonMax) return country;
  }
  return undefined;
}

/** Prefer ADS-B origin, then ICAO hex allocation, then lat/lon bbox. */
function resolveFlightCountry(
  lat: number,
  lon: number,
  hex: string | undefined,
  originCountry?: string
): string | undefined {
  const o = originCountry?.trim();
  if (o) return o;
  const fromHex = countryFromIcao24Hex(hex);
  if (fromHex) return fromHex;
  return inferCountryFromLatLon(lat, lon);
}

async function enrichFlightPointsWithAdsbHexMeta(points: IntelPoint[]): Promise<IntelPoint[]> {
  const cache = new Map<string, { type?: string; registration?: string }>();
  const need = new Set<string>();
  for (const p of points) {
    const hex = String(p.metadata?.hex ?? p.metadata?.icao24 ?? "").trim().toLowerCase();
    if (!hex || hex.length < 4) continue;
    // Only call adsb.lol when we still lack a country (hex/MID inference + bbox failed).
    if (p.country) continue;
    need.add(hex);
  }
  const list = [...need].slice(0, 72);
  const batchSize = 8;
  for (let i = 0; i < list.length; i += batchSize) {
    const chunk = list.slice(i, i + batchSize);
    await Promise.all(
      chunk.map(async (hex) => {
        if (cache.has(hex)) return;
        const res = await timedJsonFetch<{
          ac?: Array<{ type?: string; category?: string; reg?: string; flight?: string }>;
        }>(`https://api.adsb.lol/v2/hex/${hex}`, undefined, 5500);
        const ac = res.data?.ac?.[0];
        if (ac) {
          cache.set(hex, {
            type: ac.type ? String(ac.type) : undefined,
            registration: ac.reg ? String(ac.reg) : undefined,
          });
        } else {
          cache.set(hex, {});
        }
      })
    );
  }
  return points.map((p) => {
    const hex = String(p.metadata?.hex ?? p.metadata?.icao24 ?? "").trim().toLowerCase();
    if (!hex) return p;
    const extra = cache.get(hex);
    if (!extra || (!extra.type && !extra.registration)) return p;
    const country =
      p.country ?? countryFromIcao24Hex(hex) ?? inferCountryFromLatLon(p.lat, p.lon);
    return {
      ...p,
      country,
      metadata: {
        ...p.metadata,
        country: country ?? p.metadata?.country ?? null,
        aircraft_type_extra: extra.type ?? p.metadata?.aircraft_type_extra ?? null,
        registration: extra.registration ?? p.metadata?.registration ?? null,
      },
    };
  });
}

function inferVesselPurposeFromName(name: string): string {
  const t = name.toUpperCase();
  if (/\b(LHD|LPD|LST|LSV|LCAC|LHA|LPH|AMPHIB|ASSAULT|LANDING)\b/.test(t)) {
    return "Amphibious/landing operations";
  }
  if (/\b(AOR|AKR|T-?AKR|T-?AO|LOGISTICS|SUPPLY|REPLENISH|TANKER|OILER)\b/.test(t)) {
    return "Logistics/Replenishment";
  }
  if (/\b(CARRIER)\b/.test(t)) return "Carrier aviation support";
  if (/\b(SUBMARINE)\b/.test(t)) return "Submarine/undersea operations";
  if (/\b(DESTROYER|FRIGATE|CORVETTE|CRUISER|DDG|CG-|FFG)\b/.test(t)) {
    return "Surface combatant";
  }

  // Commercial / merchant hints (relay often lacks static AIS ship type).
  if (/\b(LNG|LNGC)\b/.test(t)) return "Gas carrier operations (LNG)";
  if (/\b(LPG|LPGC)\b/.test(t)) return "Gas carrier operations (LPG)";
  if (/\b(TANKER|CRUDE|PRODUCT|VLCC|ULCC|AFRAMAX|AFRA\s*MAX)\b/.test(t)) {
    return "Oil/refined product transport";
  }
  if (/\b(BULK|CAPE\s*SIZE|PANAMAX|SUPRAMAX|HANDYSIZE)\b/.test(t)) {
    return "Bulk cargo operations";
  }
  if (/\b(CONTAINER|CONTAINERS|FEEDER|\bTEU\b|BOX)\b/.test(t)) return "Container shipping";
  if (/\b(RO-?RO|RORO|ROLL[-\s]?ON|ROLL[-\s]?OFF)\b/.test(t)) return "Ro-Ro / vehicle operations";
  if (/\b(FISHING|FISH|TRAWL|SEINER)\b/.test(t)) return "Fishing operations";
  if (/\b(REEFER|REFRIG)\b/.test(t)) return "Refrigerated cargo (reefer)";
  if (/\b(OFFSHORE|PSV|AHTS|OSV|SUPPLY)\b/.test(t)) return "Offshore support / service";
  if (/\b(TUG|TUGBOAT)\b/.test(t)) return "Tug / harbor support";
  if (/\b(BARGE)\b/.test(t)) return "Barge / workboat operations";
  if (/\b(SEISMIC)\b/.test(t)) return "Seismic survey operations";

  return "Vessel activity";
}

/** Hull / platform class inferred from vessel name (AIS type often unavailable). */
function inferVesselClassFromName(name: string): string {
  const t = name.toUpperCase();
  if (/\b(CVN|CV-)\b/.test(t) || /\bAIRCRAFT\s*CARRIER\b/.test(t)) return "Aircraft carrier";
  if (/\b(LHD|LHA|LPD|LPH|LST|LSV|LCAC|AMPHIB|ASSAULT|LANDING)\b/.test(t)) {
    return "Amphibious assault / landing ship";
  }
  if (/\b(AOR|AOE|AKR|T-?AKR|T-?AO|MCM|LCC|LOGISTICS|SUPPLY|REPLENISH)\b/.test(t) || /\bUSNS\b/.test(t)) {
    return "Auxiliary / logistics / support";
  }
  if (/\b(DESTROYER|DDG|DD-)\b/.test(t)) return "Destroyer";
  if (/\b(FRIGATE|FFG|FF-|CORVETTE)\b/.test(t)) return "Frigate / corvette";
  if (/\b(CRUISER|CG-|CGN)\b/.test(t)) return "Cruiser";
  if (/\b(SUBMARINE|SSN|SSBN|SSGN|SS-)\b/.test(t)) return "Submarine";
  if (/\b(PATROL|OPV|PC-|CGC|CUTTER)\b/.test(t)) return "Patrol / offshore / cutter";

  // Merchant / commercial vessel buckets (relay often lacks static AIS ship type).
  if (/\b(LNG|LNGC)\b/.test(t)) return "LNG carrier";
  if (/\b(LPG|LPGC)\b/.test(t)) return "LPG carrier";
  if (/\b(TANKER|CRUDE|PRODUCT|VLCC|ULCC|AFRAMAX|AFRA\s*MAX)\b/.test(t)) return "Tanker";
  if (/\b(BULK|CAPE\s*SIZE|PANAMAX|SUPRAMAX|HANDYSIZE)\b/.test(t)) return "Bulk carrier";
  if (/\b(CONTAINER|CONTAINERS|FEEDER|\bTEU\b|BOX)\b/.test(t)) return "Container ship";
  if (/\b(RO-?RO|RORO|CAR\s*CARRIER|ROLL[-\s]?ON|ROLL[-\s]?OFF)\b/.test(t)) {
    return "Ro-Ro / car carrier";
  }
  if (/\b(FISHING|FISH|TRAWL|SEINER)\b/.test(t)) return "Fishing vessel";
  if (/\b(REEFER|REFRIG)\b/.test(t)) return "Refrigerated cargo (reefer)";
  if (/\b(OFFSHORE|PSV|AHTS|OSV)\b/.test(t)) return "Offshore support";
  if (/\b(TUG|TUGBOAT)\b/.test(t)) return "Tug";
  if (/\b(BARGE)\b/.test(t)) return "Barge / workboat";
  if (/\b(SEISMIC)\b/.test(t)) return "Seismic survey vessel";

  // Naval prefixes (fallback when name includes a service code but not a class token).
  if (/\b(USS|USNS|HMS|HMCS|HMAS|ROKS|INS|PLAN|NAVE|MARINA|ARMADA)\b/.test(t)) {
    return "Naval combatant (class from name)";
  }

  return "Merchant / type not reported (AIS)";
}

/** Map relay `flag` strings to a country when possible (relays vary in format). */
function mapAISFlagToCountry(flag: string): string | undefined {
  const raw = flag.trim();
  if (!raw) return undefined;
  const u = raw.toUpperCase().replace(/\s+/g, " ");
  const direct: Record<string, string> = {
    US: "United States",
    USA: "United States",
    "UNITED STATES": "United States",
    UK: "United Kingdom",
    GB: "United Kingdom",
    "UNITED KINGDOM": "United Kingdom",
    CA: "Canada",
    AU: "Australia",
    NZ: "New Zealand",
    JP: "Japan",
    KR: "South Korea",
    ROK: "South Korea",
    CN: "China",
    RU: "Russia",
    RF: "Russia",
    IN: "India",
    FR: "France",
    DE: "Germany",
    IT: "Italy",
    ES: "Spain",
    NL: "Netherlands",
    NO: "Norway",
    SE: "Sweden",
    DK: "Denmark",
    FI: "Finland",
    GR: "Greece",
    TR: "Turkey",
    IL: "Israel",
    EG: "Egypt",
    SA: "Saudi Arabia",
    AE: "United Arab Emirates",
    QA: "Qatar",
    BH: "Bahrain",
    KW: "Kuwait",
    OM: "Oman",
    BR: "Brazil",
    AR: "Argentina",
    CL: "Chile",
    MX: "Mexico",
    SG: "Singapore",
    MY: "Malaysia",
    ID: "Indonesia",
    PH: "Philippines",
    VN: "Vietnam",
    TH: "Thailand",
    PK: "Pakistan",
    BD: "Bangladesh",
    IR: "Iran",
    IQ: "Iraq",
    UA: "Ukraine",
    PL: "Poland",
    RO: "Romania",
    BG: "Bulgaria",
    NG: "Nigeria",
    ZA: "South Africa",
  };
  if (direct[u]) return direct[u];
  if (u.length === 2 && direct[u]) return direct[u];
  for (const name of COUNTRY_NAMES) {
    if (name.toUpperCase() === u) return name;
  }
  return undefined;
}

function extractTroopUnitHint(text: string): string | null {
  const t = text.toLowerCase();
  if (/\bnational guard\b/.test(t)) return "National Guard (mentioned)";
  if (/\bmarine(s)?\b/.test(t) && /\bu\.?s\.?\b/.test(t)) return "U.S. Marine Corps (mentioned)";
  if (/\bair force\b|\busaf\b/.test(t)) return "U.S. Air Force (mentioned)";
  if (/\bnaval\b|\bu\.?s\.?\s*navy\b|\bnavy\b/.test(t)) return "U.S. Navy (mentioned)";
  if (/\barmy\b/.test(t) && /\bu\.?s\.?\b/.test(t)) return "U.S. Army (mentioned)";
  if (/\bcoast guard\b/.test(t)) return "U.S. Coast Guard (mentioned)";
  return null;
}

function extractRssTag(block: string, tag: string): string | null {
  const cdataMatch = block.match(
    new RegExp(`<${tag}><!\\[CDATA\\[(.*?)\\]\\]><\\/${tag}>`, "is")
  );
  if (cdataMatch?.[1]) return cdataMatch[1].trim();
  const plainMatch = block.match(new RegExp(`<${tag}>(.*?)<\\/${tag}>`, "is"));
  if (plainMatch?.[1]) return plainMatch[1].trim();
  return null;
}

function extractRssImageUrl(block: string): string | null {
  const mediaMatch = block.match(/<media:content[^>]*url="([^"]+)"/i);
  if (mediaMatch?.[1]) return mediaMatch[1].trim();
  const enclosureMatch = block.match(/<enclosure[^>]*url="([^"]+)"/i);
  if (enclosureMatch?.[1]) return enclosureMatch[1].trim();
  const desc = extractRssTag(block, "description") ?? "";
  const imgMatch = desc.match(/<img[^>]*src="([^"]+)"/i);
  if (imgMatch?.[1]) return imgMatch[1].trim();
  const contentEncodedCdata = block.match(
    /<content:encoded[^>]*><!\[CDATA\[([\s\S]*?)\]\]><\/content:encoded>/i
  );
  const contentEncodedPlain = block.match(
    /<content:encoded[^>]*>([\s\S]*?)<\/content:encoded>/i
  );
  const encodedBlock =
    contentEncodedCdata?.[1]?.trim() || contentEncodedPlain?.[1]?.trim() || "";
  if (encodedBlock) {
    const ceImg = encodedBlock.match(/<img[^>]*src="([^"]+)"/i);
    if (ceImg?.[1]) return ceImg[1].trim();
    const ceMedia = encodedBlock.match(/<media:content[^>]*url="([^"]+)"/i);
    if (ceMedia?.[1]) return ceMedia[1].trim();
  }
  return null;
}

const STRIKE_KEYWORDS = [
  "airstrike",
  "missile",
  "drone strike",
  "bombing",
  "explosion",
  "artillery",
  "rocket",
  "strike",
  "battle",
  "offensive",
];

type EventDescriptor = {
  eventType: string;
  shortLabel: string;
  strikeKeyword: string | null;
  isConflict: boolean;
  isDirectKinetic: boolean;
};

const CONTEXT_ONLY_RE =
  /\b(bearing the weight|economic toll|workers|markets?|oil prices|analysis|opinion|editorial|supply chain|trade impact|humanitarian aid)\b/i;

const DIRECT_IMPACT_RE =
  /\b(hit|hits|struck|strike|attacked|attack|launched|launches|fired|intercepted|shot down|sunk|seized|clashed|clashes|raid|raided)\b/i;

function classifyEvent(text: string): EventDescriptor {
  const t = text.toLowerCase();
  if (CONTEXT_ONLY_RE.test(t) && !DIRECT_IMPACT_RE.test(t)) {
    return {
      eventType: "analysis_only",
      shortLabel: "War impact report",
      strikeKeyword: null,
      isConflict: false,
      isDirectKinetic: false,
    };
  }

  const checks: Array<{
    type: string;
    label: string;
    keyword: string;
    regex: RegExp;
    direct: boolean;
  }> = [
    {
      type: "missile_hit",
      label: "Missile hit",
      keyword: "missile",
      regex:
        /\b((missile|rocket).{0,45}(hit|strike|struck|impact|target|pounded)|(hit|struck|targeted).{0,45}(missile|rocket))\b/i,
      direct: true,
    },
    {
      type: "interception",
      label: "Interception",
      keyword: "interception",
      regex: /\b(intercept|interception|shot down|air defense|anti[-\s]?air)\b/i,
      direct: true,
    },
    {
      type: "drone_strike",
      label: "Drone strike",
      keyword: "drone strike",
      regex: /\b(drone strike|drone attack|uav strike|uav attack|loitering munition)\b/i,
      direct: true,
    },
    {
      type: "naval_attack",
      label: "Naval attack",
      keyword: "naval battle",
      regex: /\b(submarine|warship|frigate|destroyer|naval).{0,45}(attack|hit|strike|sunk|seized|clash|battle)\b/i,
      direct: true,
    },
    {
      type: "naval_movement",
      label: "Naval movement",
      keyword: "naval movement",
      regex: /\b(carrier group|fleet|warship|frigate|destroyer|submarine).{0,45}(deploy|move|entered|arrived|patrol|heading)\b/i,
      direct: false,
    },
    {
      type: "air_operation",
      label: "Air operation",
      keyword: "air operation",
      regex: /\b(airstrike|air raid|sortie|fighter jet|dogfight|air battle|combat air patrol)\b/i,
      direct: true,
    },
    {
      type: "border_clash",
      label: "Border clash",
      keyword: "border clash",
      regex: /\b(border clash|cross-border fire|incursion|standoff)\b/i,
      direct: true,
    },
    {
      type: "ground_battle",
      label: "Ground battle",
      keyword: "battle",
      regex: /\b(battle|skirmish|clashes|offensive|raid|infiltration|special operation)\b/i,
      direct: true,
    },
  ];

  for (const c of checks) {
    if (!c.regex.test(t)) continue;
    return {
      eventType: c.type,
      shortLabel: c.label,
      strikeKeyword: c.keyword,
      isConflict: true,
      isDirectKinetic: c.direct,
    };
  }

  if (WAR_LIKE_KEYWORDS.some((k) => t.includes(k))) {
    return {
      eventType: "conflict_report",
      shortLabel: "Conflict report",
      strikeKeyword: "conflict",
      isConflict: true,
      isDirectKinetic: false,
    };
  }

  return {
    eventType: "analysis_only",
    shortLabel: "Context report",
    strikeKeyword: null,
    isConflict: false,
    isDirectKinetic: false,
  };
}

const WAR_LIKE_KEYWORDS = [
  "war",
  "civil war",
  "front line",
  "missile",
  "airstrike",
  "drone strike",
  "artillery",
  "rocket",
  "bombing",
  "battle",
  "offensive",
  "invasion",
  "incursion",
  "clashes",
  "interception",
  "naval battle",
  "border clash",
  "cross-border",
];

const KINETIC_EVENT_KEYWORDS = [
  "missile",
  "rocket",
  "drone",
  "airstrike",
  "air raid",
  "bombardment",
  "shelling",
  "artillery",
  "interception",
  "naval battle",
  "naval clash",
  "battle",
  "firefight",
  "incursion",
  "infiltration",
];

const GOOGLE_NEWS_EDITIONS: Array<{ hl: string; gl: string; ceid: string }> = [
  { hl: "en-US", gl: "US", ceid: "US:en" },
  { hl: "en-GB", gl: "GB", ceid: "GB:en" },
  { hl: "en-IN", gl: "IN", ceid: "IN:en" },
  { hl: "en-PK", gl: "PK", ceid: "PK:en" },
  { hl: "en-AE", gl: "AE", ceid: "AE:en" },
  { hl: "en-SA", gl: "SA", ceid: "SA:en" },
  { hl: "en-QA", gl: "QA", ceid: "QA:en" },
];

function buildGoogleNewsRssUrls(encodedQuery: string): string[] {
  return GOOGLE_NEWS_EDITIONS.map(
    (e) =>
      `https://news.google.com/rss/search?q=${encodedQuery}&hl=${e.hl}&gl=${e.gl}&ceid=${e.ceid}`
  );
}

const TRUSTED_PUBLISHER_RE =
  /\b(reuters|associated press|ap news|bbc|cnn|new york times|nytimes|washington post|wall street journal|financial times|al jazeera|france 24|deutsche welle|the guardian|bloomberg|nbc news|abc news|cbs news|npr|politico)\b/i;

const TRUSTED_CONFLICT_RSS_FEEDS: Array<{
  provider: string;
  url?: string;
  domain?: string;
  tier: string;
}> = WORLDMONITOR_RSS_NETWORK.filter((s) =>
  s.layers.includes("news") || s.layers.includes("liveStrikes")
).map((s) => ({
  provider: s.name,
  url: s.rssUrl,
  domain: s.domain,
  tier: s.tier,
}));

const GDELT_CACHE_TTL_MS = 8 * 60 * 1000;
const GDELT_COOLDOWN_MS = 15 * 60 * 1000;
let gdeltCache: { fetchedAt: number; points: IntelPoint[] } | null = null;
let gdeltCooldownUntil = 0;
const CURATED_CONFLICT_FALLBACK = [
  "ukraine",
  "south sudan",
  "sudan",
  "iran",
  "myanmar",
  "afghanistan",
  "saudi arabia",
  "united arab emirates",
  "qatar",
  "oman",
  "kuwait",
  "bahrain",
];
const ACTIVE_CONFLICT_HIGHLIGHT_ALLOWLIST = new Set(
  CURATED_CONFLICT_FALLBACK.map((c) => normalizeCountryLabel(c).toLowerCase())
);
const COUNTRY_HIGHLIGHT_DENYLIST = new Set([
  "india",
  "democratic republic of the congo",
  // Often noisy from generic “war/conflict” news or unrelated crime coverage — not primary war theaters for this map.
  "mexico",
  "chad",
]);

const HIGH_REPEAT_EXCLUDE_RE =
  /\b(live updates?|minute by minute|opinion|editorial|analysis|watch live|breaking live blog)\b/i;

const GENERIC_REPEAT_LABEL_RE =
  /\b(conflict event|context report|conflict report)\b/i;

const IRAN_SPECIFIC_RAPID_QUERIES = [
  "(Iran OR Tehran OR Isfahan OR Natanz OR Fordow OR Arak OR Bushehr) (missile strike OR drone strike OR explosion OR interception OR air defense OR base attack OR launcher)",
  "(IRGC OR Revolutionary Guards OR Quds Force) (strike OR base OR missile OR drone OR retaliation)",
  "(Natanz OR Fordow OR Bushehr OR Arak reactor) (attack OR sabotage OR strike OR explosion)",
];

const SUDAN_SPECIFIC_RAPID_QUERIES = [
  "(Sudan OR Khartoum OR Omdurman OR Port Sudan OR Darfur OR El Fasher) (airstrike OR shelling OR clashes OR RSF OR SAF OR battle)",
  "(RSF OR Rapid Support Forces OR Sudanese Armed Forces) (battle OR drone strike OR artillery OR front line)",
];

const MYANMAR_SPECIFIC_RAPID_QUERIES = [
  "(Myanmar OR Burma OR Naypyidaw OR Yangon OR Mandalay OR Sagaing OR Kachin OR Shan OR Rakhine) (airstrike OR drone strike OR artillery OR clashes OR battle OR raid)",
  "(Tatmadaw OR junta OR PDF OR ethnic armed organization OR KIA OR KNLA OR AA) (clashes OR offensive OR shelling OR airstrike)",
  "(Myawaddy OR Lashio OR Loikaw OR Sittwe OR Bhamo OR Muse) (battle OR shelling OR seizure OR offensive)",
];

const MENA_SOUTHASIA_RAPID_QUERIES = [
  "(Israel OR Iran OR Iraq OR Syria OR Lebanon) (missile strike OR drone strike OR interception OR air defense OR barrage)",
  "(Persian Gulf OR Strait of Hormuz OR Gulf of Oman OR Arabian Sea) (tanker attack OR naval clash OR interception OR warship OR frigate OR destroyer)",
  "(Pakistan OR Afghanistan OR Balochistan OR Khyber Pakhtunkhwa OR Kabul OR Kandahar) (battle OR raid OR drone strike OR shelling OR border clash)",
  "(Natanz OR Fordow OR Arak OR Bushehr OR Isfahan OR Bandar Abbas) (strike OR sabotage OR explosion OR air defense)",
  "(Qatar OR UAE OR Saudi Arabia OR Bahrain OR Kuwait OR Oman) (interception OR missile OR drone OR airbase OR naval movement)",
];

const MENA_SOUTHASIA_NEWS_QUERIES = [
  "(Israel OR Iran OR Iraq OR Syria OR Lebanon OR Jordan) (missile OR drone OR interception OR barrage OR strike)",
  "(Persian Gulf OR Strait of Hormuz OR Gulf of Oman OR Arabian Sea OR Gulf of Aden) (shipping attack OR tanker OR warship OR naval interception)",
  "(Pakistan OR Afghanistan OR Balochistan OR Kurram OR Waziristan OR Kabul OR Kandahar OR Herat) (battle OR raid OR clash OR shelling OR drone attack)",
  "(Natanz OR Fordow OR Arak OR Bushehr OR Isfahan OR Parchin) (attack OR sabotage OR strike OR explosion)",
  "(UAE OR Saudi Arabia OR Qatar OR Bahrain OR Kuwait OR Oman) (missile interception OR air defense OR drone incursion OR naval patrol)",
];

const MYANMAR_NEWS_QUERIES = [
  "(Myanmar OR Burma) (airstrike OR shelling OR clashes OR offensive OR raid OR battle)",
  "(Naypyidaw OR Yangon OR Mandalay OR Sagaing OR Magway OR Chin OR Kachin OR Shan OR Rakhine) (strike OR clashes OR artillery OR fighting)",
  "(Tatmadaw OR People's Defense Force OR PDF OR KIA OR KNLA OR Arakan Army) (attack OR battle OR ambush OR shelling)",
];

const CONFLICT_COUNTRY_ALIASES: Record<string, string> = {
  "democratic republic of congo": "democratic republic of the congo",
  drc: "democratic republic of the congo",
  "dr congo": "democratic republic of the congo",
  "russian federation": "russia",
  palestine: "judea & samaria / palestine",
  "state of palestine": "judea & samaria / palestine",
  "occupied palestinian territory": "judea & samaria / palestine",
  "judea & samaria / palestine": "judea & samaria / palestine",
  burma: "myanmar",
};

const GDELT_SOURCECOUNTRY_MAP: Record<string, string> = {
  UA: "Ukraine",
  RU: "Russia",
  IR: "Iran",
  IL: "Israel",
  PS: "Judea & Samaria / Palestine",
  SD: "Sudan",
  YE: "Yemen",
  SY: "Syria",
  LB: "Lebanon",
  MM: "Myanmar",
  IQ: "Iraq",
  SO: "Somalia",
  ML: "Mali",
  BF: "Burkina Faso",
  NE: "Niger",
  CD: "Democratic Republic of the Congo",
  ET: "Ethiopia",
  AF: "Afghanistan",
  LY: "Libya",
  SS: "South Sudan",
};

const CITY_COORDS: Record<string, { lat: number; lon: number; country: string }> = {
  tehran: { lat: 35.6892, lon: 51.389, country: "Iran" },
  isfahan: { lat: 32.6546, lon: 51.668, country: "Iran" },
  tabriz: { lat: 38.0962, lon: 46.2738, country: "Iran" },
  mashhad: { lat: 36.2605, lon: 59.6168, country: "Iran" },
  telaviv: { lat: 32.0853, lon: 34.7818, country: "Israel" },
  "tel aviv": { lat: 32.0853, lon: 34.7818, country: "Israel" },
  jerusalem: { lat: 31.7683, lon: 35.2137, country: "Israel" },
  haifa: { lat: 32.794, lon: 34.9896, country: "Israel" },
  beersheba: { lat: 31.252, lon: 34.7915, country: "Israel" },
  "beer sheva": { lat: 31.252, lon: 34.7915, country: "Israel" },
  gaza: { lat: 31.5018, lon: 34.4668, country: "Judea & Samaria / Palestine" },
  rafah: { lat: 31.2969, lon: 34.2436, country: "Judea & Samaria / Palestine" },
  kyiv: { lat: 50.4501, lon: 30.5234, country: "Ukraine" },
  kiev: { lat: 50.4501, lon: 30.5234, country: "Ukraine" },
  kharkiv: { lat: 49.9935, lon: 36.2304, country: "Ukraine" },
  odesa: { lat: 46.4825, lon: 30.7233, country: "Ukraine" },
  odessa: { lat: 46.4825, lon: 30.7233, country: "Ukraine" },
  donetsk: { lat: 48.0159, lon: 37.8029, country: "Ukraine" },
  kherson: { lat: 46.6354, lon: 32.6169, country: "Ukraine" },
  zaporizhzhia: { lat: 47.8388, lon: 35.1396, country: "Ukraine" },
  zaporozhye: { lat: 47.8388, lon: 35.1396, country: "Ukraine" },
  dnipro: { lat: 48.4647, lon: 35.0462, country: "Ukraine" },
  sumy: { lat: 50.9077, lon: 34.7981, country: "Ukraine" },
  lviv: { lat: 49.8397, lon: 24.0297, country: "Ukraine" },
  khartoum: { lat: 15.5007, lon: 32.5599, country: "Sudan" },
  "port sudan": { lat: 19.6158, lon: 37.2164, country: "Sudan" },
  sanaa: { lat: 15.3694, lon: 44.191, country: "Yemen" },
  aden: { lat: 12.7855, lon: 45.0187, country: "Yemen" },
  damascus: { lat: 33.5138, lon: 36.2765, country: "Syria" },
  beirut: { lat: 33.8938, lon: 35.5018, country: "Lebanon" },
  aleppo: { lat: 36.2021, lon: 37.1343, country: "Syria" },
  idlib: { lat: 35.9306, lon: 36.6339, country: "Syria" },
  mykolaiv: { lat: 46.975, lon: 31.9946, country: "Ukraine" },
  mariupol: { lat: 47.0971, lon: 37.5434, country: "Ukraine" },
  luhansk: { lat: 48.567, lon: 39.317, country: "Ukraine" },
  kramatorsk: { lat: 48.7233, lon: 37.5558, country: "Ukraine" },
  bakhmut: { lat: 48.5956, lon: 37.9999, country: "Ukraine" },
  avdiivka: { lat: 48.1397, lon: 37.7406, country: "Ukraine" },
  severodonetsk: { lat: 48.9481, lon: 38.4933, country: "Ukraine" },
  chernihiv: { lat: 51.4982, lon: 31.2893, country: "Ukraine" },
  zhytomyr: { lat: 50.2547, lon: 28.6583, country: "Ukraine" },
  poltava: { lat: 49.5883, lon: 34.5514, country: "Ukraine" },
  vinnytsia: { lat: 49.2328, lon: 28.4681, country: "Ukraine" },
  ternopil: { lat: 49.5535, lon: 25.5948, country: "Ukraine" },
  chernivtsi: { lat: 48.2917, lon: 25.9353, country: "Ukraine" },
  uzhhorod: { lat: 48.6208, lon: 22.2879, country: "Ukraine" },
  rivne: { lat: 50.6199, lon: 26.2516, country: "Ukraine" },
  lutsk: { lat: 50.7472, lon: 25.3254, country: "Ukraine" },
  kropyvnytskyi: { lat: 48.5135, lon: 32.2597, country: "Ukraine" },
  "kryvyi rih": { lat: 47.9105, lon: 33.3919, country: "Ukraine" },
  sevastopol: { lat: 44.6167, lon: 33.5254, country: "Ukraine" },
  donbas: { lat: 48.0159, lon: 37.8029, country: "Ukraine" },
  bushehr: { lat: 28.9211, lon: 50.8372, country: "Iran" },
  shiraz: { lat: 29.5918, lon: 52.5836, country: "Iran" },
  qom: { lat: 34.6416, lon: 50.8746, country: "Iran" },
  ahvaz: { lat: 31.3190, lon: 48.6842, country: "Iran" },
  kermanshah: { lat: 34.3142, lon: 47.0650, country: "Iran" },
  pardis: { lat: 35.7417, lon: 51.7756, country: "Iran" },
  "ramat gan": { lat: 32.0693, lon: 34.8242, country: "Israel" },
  "bnei brak": { lat: 32.0807, lon: 34.8338, country: "Israel" },
  nahariya: { lat: 33.0040, lon: 35.0983, country: "Israel" },
  baghdad: { lat: 33.3152, lon: 44.3661, country: "Iraq" },
  "green zone": { lat: 33.3152, lon: 44.3661, country: "Iraq" },
  dubai: { lat: 25.2048, lon: 55.2708, country: "United Arab Emirates" },
  "abu dhabi": { lat: 24.4539, lon: 54.3773, country: "United Arab Emirates" },
  riyadh: { lat: 24.7136, lon: 46.6753, country: "Saudi Arabia" },
  jeddah: { lat: 21.4858, lon: 39.1925, country: "Saudi Arabia" },
  doha: { lat: 25.2854, lon: 51.531, country: "Qatar" },
  manama: { lat: 26.2285, lon: 50.586, country: "Bahrain" },
  "kuwait city": { lat: 29.3759, lon: 47.9774, country: "Kuwait" },
  muscat: { lat: 23.5859, lon: 58.4059, country: "Oman" },
  "fujairah": { lat: 25.1288, lon: 56.3265, country: "United Arab Emirates" },
  "ras al khaimah": { lat: 25.8, lon: 55.9762, country: "United Arab Emirates" },
  "al ain": { lat: 24.2075, lon: 55.7447, country: "United Arab Emirates" },
  "al dhafra": { lat: 24.2487, lon: 54.5486, country: "United Arab Emirates" },
  "dhahran": { lat: 26.2361, lon: 50.0393, country: "Saudi Arabia" },
  "ras tanura": { lat: 26.6436, lon: 50.1594, country: "Saudi Arabia" },
  "dammam": { lat: 26.4207, lon: 50.0888, country: "Saudi Arabia" },
  "al udeid": { lat: 25.1176, lon: 51.3147, country: "Qatar" },
  "duqm": { lat: 19.6707, lon: 57.7049, country: "Oman" },
  "salalah": { lat: 17.0194, lon: 54.0897, country: "Oman" },
  "kabul": { lat: 34.5553, lon: 69.2075, country: "Afghanistan" },
  "kandahar": { lat: 31.6289, lon: 65.7372, country: "Afghanistan" },
  "herat": { lat: 34.3529, lon: 62.204, country: "Afghanistan" },
  "mazar i sharif": { lat: 36.7069, lon: 67.1122, country: "Afghanistan" },
  "jalalabad": { lat: 34.4342, lon: 70.4478, country: "Afghanistan" },
  "kunduz": { lat: 36.7289, lon: 68.857, country: "Afghanistan" },
  "helmand": { lat: 31.5799, lon: 64.3696, country: "Afghanistan" },
  "bagram": { lat: 34.9444, lon: 69.2583, country: "Afghanistan" },
  "islamabad": { lat: 33.6844, lon: 73.0479, country: "Pakistan" },
  "rawalpindi": { lat: 33.5651, lon: 73.0169, country: "Pakistan" },
  "karachi": { lat: 24.8607, lon: 67.0011, country: "Pakistan" },
  "gwadar": { lat: 25.1264, lon: 62.3225, country: "Pakistan" },
  "lahore": { lat: 31.5204, lon: 74.3587, country: "Pakistan" },
  "peshawar": { lat: 34.0151, lon: 71.5249, country: "Pakistan" },
  "quetta": { lat: 30.1798, lon: 66.975, country: "Pakistan" },
  "khyber": { lat: 34.0742, lon: 71.2195, country: "Pakistan" },
  "waziristan": { lat: 32.4, lon: 69.8, country: "Pakistan" },
  "natanz": { lat: 33.725, lon: 51.726, country: "Iran" },
  "fordow": { lat: 34.885, lon: 50.995, country: "Iran" },
  "arak": { lat: 34.0917, lon: 49.6892, country: "Iran" },
  "parchin": { lat: 35.5, lon: 51.78, country: "Iran" },
  "bandar abbas": { lat: 27.1832, lon: 56.2666, country: "Iran" },
  "chabahar": { lat: 25.2919, lon: 60.643, country: "Iran" },
  "kerman": { lat: 30.2839, lon: 57.0834, country: "Iran" },
  "tabas": { lat: 33.5959, lon: 56.9244, country: "Iran" },
  "naypyidaw": { lat: 19.7633, lon: 96.0785, country: "Myanmar" },
  "yangon": { lat: 16.8409, lon: 96.1735, country: "Myanmar" },
  "mandalay": { lat: 21.9588, lon: 96.0891, country: "Myanmar" },
  "sagaing": { lat: 21.88, lon: 95.98, country: "Myanmar" },
  "magway": { lat: 20.1496, lon: 94.9325, country: "Myanmar" },
  "myitkyina": { lat: 25.3833, lon: 97.4, country: "Myanmar" },
  "lashio": { lat: 22.9359, lon: 97.7498, country: "Myanmar" },
  "sittwe": { lat: 20.1462, lon: 92.8983, country: "Myanmar" },
  "myawaddy": { lat: 16.6891, lon: 98.5089, country: "Myanmar" },
  "loikaw": { lat: 19.6766, lon: 97.206, country: "Myanmar" },
  "el fasher": { lat: 13.6261, lon: 25.3494, country: "Sudan" },
  "nyala": { lat: 12.0535, lon: 24.8807, country: "Sudan" },
  "geneina": { lat: 13.4526, lon: 22.4472, country: "Sudan" },
  "wad madani": { lat: 14.4012, lon: 33.5199, country: "Sudan" },
  "kassala": { lat: 15.4509, lon: 36.3996, country: "Sudan" },
  "atbara": { lat: 17.7, lon: 33.98, country: "Sudan" },
  "atkala": { lat: 15.31, lon: 36.49, country: "Sudan" },
  "nowshera": { lat: 34.008, lon: 71.982, country: "Pakistan" },
  "miranshah": { lat: 33.0, lon: 70.07, country: "Pakistan" },
  "parachinar": { lat: 33.9, lon: 70.1, country: "Pakistan" },
  "zhob": { lat: 31.34, lon: 69.45, country: "Pakistan" },
  "khost": { lat: 33.3395, lon: 69.9204, country: "Afghanistan" },
  "ghazni": { lat: 33.5487, lon: 68.42, country: "Afghanistan" },
  "talokan": { lat: 36.7361, lon: 69.5345, country: "Afghanistan" },
  "farah": { lat: 32.3758, lon: 62.1164, country: "Afghanistan" },
  "dezful": { lat: 32.3836, lon: 48.4236, country: "Iran" },
  "urmia": { lat: 37.5527, lon: 45.076, country: "Iran" },
  "hamedan": { lat: 34.7983, lon: 48.5148, country: "Iran" },
  "sanandaj": { lat: 35.3219, lon: 46.9862, country: "Iran" },
  "zahedan": { lat: 29.4963, lon: 60.8629, country: "Iran" },
};

const PRIORITY_COUNTRY_HOTSPOTS: Record<
  string,
  Array<{ city: string; lat: number; lon: number }>
> = {
  iran: [
    { city: "Tehran", lat: 35.6892, lon: 51.389 },
    { city: "Isfahan", lat: 32.6546, lon: 51.668 },
    { city: "Natanz", lat: 33.725, lon: 51.726 },
    { city: "Fordow", lat: 34.885, lon: 50.995 },
    { city: "Bushehr", lat: 28.9211, lon: 50.8372 },
    { city: "Bandar Abbas", lat: 27.1832, lon: 56.2666 },
    { city: "Tabriz", lat: 38.0962, lon: 46.2738 },
    { city: "Ahvaz", lat: 31.319, lon: 48.6842 },
  ],
  ukraine: [
    { city: "Kyiv", lat: 50.4501, lon: 30.5234 },
    { city: "Kharkiv", lat: 49.9935, lon: 36.2304 },
    { city: "Odesa", lat: 46.4825, lon: 30.7233 },
    { city: "Zaporizhzhia", lat: 47.8388, lon: 35.1396 },
    { city: "Kherson", lat: 46.6354, lon: 32.6169 },
    { city: "Donetsk", lat: 48.0159, lon: 37.8029 },
    { city: "Dnipro", lat: 48.4647, lon: 35.0462 },
    { city: "Sumy", lat: 50.9077, lon: 34.7981 },
  ],
  sudan: [
    { city: "Khartoum", lat: 15.5007, lon: 32.5599 },
    { city: "Omdurman", lat: 15.6445, lon: 32.4777 },
    { city: "Port Sudan", lat: 19.6158, lon: 37.2164 },
    { city: "El Fasher", lat: 13.6261, lon: 25.3494 },
    { city: "Nyala", lat: 12.0535, lon: 24.8807 },
    { city: "Geneina", lat: 13.4526, lon: 22.4472 },
  ],
  pakistan: [
    { city: "Islamabad", lat: 33.6844, lon: 73.0479 },
    { city: "Rawalpindi", lat: 33.5651, lon: 73.0169 },
    { city: "Peshawar", lat: 34.0151, lon: 71.5249 },
    { city: "Quetta", lat: 30.1798, lon: 66.975 },
    { city: "Karachi", lat: 24.8607, lon: 67.0011 },
    { city: "Gwadar", lat: 25.1264, lon: 62.3225 },
  ],
  afghanistan: [
    { city: "Kabul", lat: 34.5553, lon: 69.2075 },
    { city: "Kandahar", lat: 31.6289, lon: 65.7372 },
    { city: "Herat", lat: 34.3529, lon: 62.204 },
    { city: "Jalalabad", lat: 34.4342, lon: 70.4478 },
    { city: "Kunduz", lat: 36.7289, lon: 68.857 },
    { city: "Bagram", lat: 34.9444, lon: 69.2583 },
  ],
  myanmar: [
    { city: "Naypyidaw", lat: 19.7633, lon: 96.0785 },
    { city: "Yangon", lat: 16.8409, lon: 96.1735 },
    { city: "Mandalay", lat: 21.9588, lon: 96.0891 },
    { city: "Sagaing", lat: 21.88, lon: 95.98 },
    { city: "Myitkyina", lat: 25.3833, lon: 97.4 },
    { city: "Lashio", lat: 22.9359, lon: 97.7498 },
  ],
};

const CONFLICT_REGION_CENTROIDS: Array<{
  re: RegExp;
  country: string;
  lat: number;
  lon: number;
}> = [
  { re: /\bred sea\b/i, country: "Yemen", lat: 17.8, lon: 40.2 },
  { re: /\bgulf of aden\b/i, country: "Yemen", lat: 12.1, lon: 49.5 },
  { re: /\bpersian gulf|arabian gulf\b/i, country: "United Arab Emirates", lat: 26.1, lon: 52.1 },
  { re: /\bgulf of oman\b/i, country: "Oman", lat: 24.9, lon: 58.8 },
  { re: /\bblack sea\b/i, country: "Ukraine", lat: 43.2, lon: 35.0 },
  { re: /\bsouth china sea\b/i, country: "Philippines", lat: 14.8, lon: 114.8 },
  { re: /\bwestern pacific\b/i, country: "Japan", lat: 24.7, lon: 142.0 },
  { re: /\beastern mediterranean|levant\b/i, country: "Israel", lat: 33.9, lon: 34.9 },
  { re: /\bkashmir|line of control\b/i, country: "Pakistan", lat: 34.3, lon: 74.5 },
  { re: /\bstrait of hormuz|hormuz\b/i, country: "Oman", lat: 26.57, lon: 56.25 },
  { re: /\bbalochistan\b/i, country: "Pakistan", lat: 28.5, lon: 65.1 },
  { re: /\bnatanz\b/i, country: "Iran", lat: 33.725, lon: 51.726 },
  { re: /\bfordow\b/i, country: "Iran", lat: 34.885, lon: 50.995 },
  { re: /\bbushehr\b/i, country: "Iran", lat: 28.9211, lon: 50.8372 },
  { re: /\bbandar abbas\b/i, country: "Iran", lat: 27.1832, lon: 56.2666 },
  { re: /\bkabul\b/i, country: "Afghanistan", lat: 34.5553, lon: 69.2075 },
  { re: /\bkandahar\b/i, country: "Afghanistan", lat: 31.6289, lon: 65.7372 },
  { re: /\bkarachi\b/i, country: "Pakistan", lat: 24.8607, lon: 67.0011 },
  { re: /\bmyanmar|burma\b/i, country: "Myanmar", lat: 20.5, lon: 96.6 },
  { re: /\bsagaing\b/i, country: "Myanmar", lat: 22.1, lon: 95.1 },
  { re: /\brakhine\b/i, country: "Myanmar", lat: 20.6, lon: 93.1 },
  { re: /\bshan\b/i, country: "Myanmar", lat: 21.2, lon: 97.2 },
  { re: /\bkachin\b/i, country: "Myanmar", lat: 25.7, lon: 97.5 },
];

function normalizeHeadlineForCluster(text: string): string {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w && w.length > 2 && !["with", "from", "that", "this", "report", "reports", "says", "say"].includes(w))
    .slice(0, 9)
    .join(" ");
}

function normalizeEventEntitySignature(point: IntelPoint): string {
  const idCandidates = [
    String(point.metadata?.mmsi ?? "").trim(),
    String(point.metadata?.imo ?? "").trim(),
    String(point.metadata?.icao24 ?? "").trim(),
    String(point.metadata?.callsign ?? "").trim().toUpperCase(),
    String(point.metadata?.hex ?? "").trim().toLowerCase(),
  ].filter(Boolean);
  if (idCandidates.length > 0) return idCandidates.join("|");
  const titleSig = normalizeHeadlineForCluster(`${point.title ?? ""} ${point.subtitle ?? ""}`);
  return titleSig.slice(0, 90);
}

function normalizeSourceUrlKey(point: IntelPoint): string {
  const sourceUrl = String(point.metadata?.source_url ?? "").trim();
  if (!sourceUrl || (!sourceUrl.startsWith("http://") && !sourceUrl.startsWith("https://"))) {
    return "";
  }
  try {
    const u = new URL(sourceUrl);
    return `${u.hostname.replace(/^www\./, "")}${u.pathname}`.toLowerCase().slice(0, 140);
  } catch {
    return "";
  }
}

function extractPublisherFromTitle(title: string): string {
  const parts = title.split(" - ").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) return parts[parts.length - 1];
  return "Unknown";
}

function isTrustedPublisher(text: string): boolean {
  return TRUSTED_PUBLISHER_RE.test(text);
}

function dedupeEventPoints(points: IntelPoint[], bucketHours = 1): IntelPoint[] {
  const seen = new Map<string, IntelPoint>();
  for (const p of points) {
    const ts = Date.parse(p.timestamp || "");
    const effectiveBucketHours =
      p.layer === "liveStrikes"
        ? Math.max(0.25, Math.min(bucketHours, 0.5))
        : p.layer === "news"
          ? Math.max(0.5, Math.min(bucketHours, 0.75))
          : p.layer === "conflicts"
            ? Math.max(1.5, bucketHours)
            : bucketHours;
    const bucket = Number.isFinite(ts) ? Math.floor(ts / (effectiveBucketHours * 3600_000)) : 0;
    const headlineBase = normalizeHeadlineForCluster(
      String(p.metadata?.original_headline ?? p.title ?? "")
    );
    const entitySignature = normalizeEventEntitySignature(p);
    const sourceUrlKey = normalizeSourceUrlKey(p);
    const eventType = String(p.metadata?.event_type ?? "generic").toLowerCase();
    const coordStep =
      p.layer === "liveStrikes" ? 0.12 : p.layer === "news" ? 0.2 : p.layer === "conflicts" ? 0.5 : 0.3;
    const roundedLat = Math.round(p.lat / coordStep) * coordStep;
    const roundedLon = Math.round(p.lon / coordStep) * coordStep;
    const sourceUrl = String(p.metadata?.source_url ?? "").trim();
    let sourceHost = "";
    if (sourceUrl.startsWith("http://") || sourceUrl.startsWith("https://")) {
      try {
        sourceHost = new URL(sourceUrl).hostname.replace(/^www\./, "");
      } catch {
        sourceHost = "";
      }
    }
    const sourceKey =
      p.layer === "news" || p.layer === "liveStrikes"
        ? (sourceHost || String(p.source || "").toLowerCase().slice(0, 40))
        : "source-agnostic";
    const key = `${headlineBase}|${entitySignature}|${eventType}|${(p.country ?? "").toLowerCase()}|${roundedLat}|${roundedLon}|${bucket}|${p.layer}|${sourceKey}|${sourceUrlKey}`;
    const current = seen.get(key);
    if (!current || p.timestamp > current.timestamp) seen.set(key, p);
  }
  return Array.from(seen.values()).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

function collapseRepeatedEvents(points: IntelPoint[], layer: "news" | "liveStrikes"): IntelPoint[] {
  const keep = new Map<string, IntelPoint>();
  for (const p of points) {
    const ts = Date.parse(p.timestamp || "");
    const bucketHours = layer === "liveStrikes" ? 1.5 : 2.5;
    const bucket = Number.isFinite(ts) ? Math.floor(ts / (bucketHours * 3600_000)) : 0;
    const step = layer === "liveStrikes" ? 0.12 : 0.18;
    const roundedLat = Math.round(p.lat / step) * step;
    const roundedLon = Math.round(p.lon / step) * step;
    const headlineBase = normalizeHeadlineForCluster(
      String(p.metadata?.original_headline ?? p.title ?? "")
    );
    const entitySignature = normalizeEventEntitySignature(p);
    const sourceUrlKey = normalizeSourceUrlKey(p);
    const eventType = String(p.metadata?.event_type ?? "generic").toLowerCase();
    const key = `${headlineBase}|${entitySignature}|${eventType}|${(p.country ?? "").toLowerCase()}|${roundedLat}|${roundedLon}|${bucket}|${sourceUrlKey}`;
    const current = keep.get(key);
    if (!current) {
      keep.set(key, p);
      continue;
    }
    const score = (x: IntelPoint) =>
      (x.severity === "critical" ? 4 : x.severity === "high" ? 3 : x.severity === "medium" ? 2 : 1) +
      (String(x.metadata?.source_url ?? "").trim() ? 0.8 : 0) +
      (x.imageUrl ? 0.3 : 0);
    if (score(p) > score(current) || p.timestamp > current.timestamp) keep.set(key, p);
  }
  return Array.from(keep.values()).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

function seedFromText(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function expandPriorityCountryFallbackLocations(
  country: string,
  sourceText: string,
  maxCount = 3
): Array<{ lat: number; lon: number; country: string; city: string | null }> {
  const key = canonicalConflictCountry(country);
  const hotspots = PRIORITY_COUNTRY_HOTSPOTS[key];
  if (!hotspots || hotspots.length === 0) return [];
  const seed = seedFromText(`${sourceText}|${country}`);
  const count = Math.min(maxCount, hotspots.length);
  const out: Array<{ lat: number; lon: number; country: string; city: string | null }> = [];
  for (let i = 0; i < count; i += 1) {
    const idx = (seed + i * 3) % hotspots.length;
    const h = hotspots[idx];
    out.push({ lat: h.lat, lon: h.lon, country, city: h.city });
  }
  return out;
}

function isKineticEventText(text: string): boolean {
  const t = text.toLowerCase();
  return KINETIC_EVENT_KEYWORDS.some((k) => t.includes(k));
}

function parseRssConflictPoints(
  rssText: string,
  cutoff: number,
  sourceLabel: string,
  layer: "news" | "liveStrikes",
  seen: Set<string>
): {
  points: IntelPoint[];
  totalItems: number;
  conflictCandidates: number;
  geoMapped: number;
} {
  const itemBlocks = rssText.split("<item>").slice(1, 3200);
  const points: IntelPoint[] = [];
  let conflictCandidates = 0;
  let geoMapped = 0;
  const warContextRe =
    /\b(war|frontline|battlefield|cross-border|air raid|missile|strike|shelling|bombardment|drone attack|naval clash|skirmish|clashes|firefight|offensive|counteroffensive|insurgent|militant)\b/i;

  for (let i = 0; i < itemBlocks.length; i += 1) {
    const block = itemBlocks[i];
    const title = extractRssTag(block, "title");
    const description = extractRssTag(block, "description") ?? "";
    const imageUrl = extractRssImageUrl(block);
    const sourceUrl = extractRssTag(block, "link");
    const sourceUrlKey = sourceUrl
      ? (() => {
          try {
            const u = new URL(sourceUrl);
            return `${u.hostname.replace(/^www\./, "")}${u.pathname}`
              .toLowerCase()
              .slice(0, 140);
          } catch {
            return "";
          }
        })()
      : "";
    const pubRaw = extractRssTag(block, "pubDate");
    if (!title) continue;
    const ts = pubRaw ? Date.parse(pubRaw) : Date.now();
    if (!Number.isFinite(ts) || ts < cutoff) continue;

    const fullText = `${title} ${description}`;
    const descriptor = classifyEvent(fullText);
    const likelyConflict = descriptor.isConflict || warContextRe.test(fullText);
    if (!likelyConflict) continue;
    conflictCandidates += 1;

    const allCities = extractAllMentionedCities(fullText);
    const region = extractRegionFallback(fullText);
    const countryFromText = extractMentionedCountry(fullText) || region?.country;
    const locations: Array<{ lat: number; lon: number; country: string; city: string | null }> = [];
    if (allCities.length > 0) {
      for (const c of allCities) locations.push({ lat: c.lat, lon: c.lon, country: c.country, city: c.city });
    } else if (countryFromText) {
      const theaterFallback = expandPriorityCountryFallbackLocations(
        countryFromText,
        `${title} ${description}`,
        layer === "liveStrikes" ? 4 : 3
      );
      if (theaterFallback.length > 0) {
        locations.push(...theaterFallback);
      }
      const bbox = COUNTRY_BBOX[countryFromText];
      if ((bbox || region) && locations.length === 0)
        locations.push({
          lat: region?.lat ?? bbox![4],
          lon: region?.lon ?? bbox![5],
          country: countryFromText,
          city: null,
        });
    }
    if (locations.length === 0) continue;
    geoMapped += locations.length;
    const publisher = extractPublisherFromTitle(title);
    const trusted = isTrustedPublisher(`${sourceLabel} ${publisher} ${title}`);
    const hourBucket = Math.floor(ts / 3600_000);
    const snippet = description.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 360);
    for (let locIdx = 0; locIdx < locations.length; locIdx += 1) {
      const loc = locations[locIdx];
      // Include `sourceUrlKey` so the same headline mentioned by multiple outlets
      // doesn't collapse into a single point (higher density, WorldMonitor-like).
      const dedupeKey = `${normalizeHeadlineForCluster(title)}|${loc.country}|${loc.city ?? ""}|${hourBucket}|${layer}|${locIdx}|${sourceUrlKey}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      points.push({
        id: `${sourceLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${layer}-${hourBucket}-${i}-${locIdx}-${points.length + 1}`,
        layer,
        title: loc.city
          ? `${descriptor.shortLabel || "Conflict event"} near ${loc.city}`
          : `${descriptor.shortLabel || "Conflict event"} in ${loc.country}`,
        subtitle: `${sourceLabel} | ${publisher}`,
        lat: loc.lat,
        lon: loc.lon,
        country: loc.country,
        severity:
          layer === "liveStrikes"
            ? descriptor.isDirectKinetic
              ? "high"
              : "medium"
            : loc.city
              ? "high"
              : "medium",
        source: sourceLabel,
        timestamp: new Date(ts).toISOString(),
        magnitude: layer === "liveStrikes" ? 9 : loc.city ? 8 : 5,
        confidence: trusted ? (layer === "liveStrikes" ? 0.72 : 0.68) : layer === "liveStrikes" ? 0.56 : 0.55,
        imageUrl: imageUrl || undefined,
        metadata: {
          event_type: descriptor.eventType || "conflict_event",
          short_label: descriptor.shortLabel || "Conflict event",
          publisher,
          source_url: sourceUrl || null,
          image_url: imageUrl || null,
          original_headline: title,
          source_snippet: snippet,
          trusted_source: trusted,
        },
      });
    }
  }

  return {
    points,
    totalItems: itemBlocks.length,
    conflictCandidates,
    geoMapped,
  };
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&nbsp;/gi, " ");
}

function extractHtmlHeadlines(html: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const headingRe = /<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/gi;
  for (const match of html.matchAll(headingRe)) {
    const raw = match[1]
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const text = decodeHtmlEntities(raw);
    if (!text || text.length < 18 || text.length > 240) continue;
    const normalized = text.toLowerCase();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(text);
    if (out.length >= 180) break;
  }
  return out;
}

function extractVisibleBodyText(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function buildHeadlinePointFromSource(params: {
  source: string;
  title: string;
  timestamp: string;
  idx: number;
  sourceUrl?: string;
}): IntelPoint | null {
  const { source, title, timestamp, idx, sourceUrl } = params;
  const text = title.trim();
  if (!text) return null;
  const descriptor = classifyEvent(text);
  const gangSignal = /\b(cartel|gang|narco|organized crime|homicide|kidnapp|extortion)\b/i.test(text);
  if (!descriptor.isConflict && !gangSignal) return null;

  const city = extractMentionedCity(text);
  const region = extractRegionFallback(text);
  const country = city?.country || extractMentionedCountry(text) || region?.country;
  if (!country) return null;
  const bbox = COUNTRY_BBOX[country];
  const lat = city?.lat ?? bbox?.[4] ?? region?.lat;
  const lon = city?.lon ?? bbox?.[5] ?? region?.lon;
  if (typeof lat !== "number" || typeof lon !== "number") return null;

  const kinetic = descriptor.isDirectKinetic;
  const layer = kinetic ? "liveStrikes" : ("news" as const);
  const cleanId = source.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return {
    id: `${cleanId}-${layer}-${Date.parse(timestamp)}-${idx}`,
    layer,
    title: city
      ? `${descriptor.shortLabel || "Conflict signal"} near ${city.city}`
      : `${descriptor.shortLabel || "Conflict signal"} in ${country}`,
    subtitle: text,
    lat,
    lon,
    country,
    severity: kinetic ? "high" : gangSignal ? "high" : city ? "medium" : "low",
    source,
    timestamp,
    magnitude: kinetic ? 9 : gangSignal ? 7 : 5,
    confidence: kinetic ? 0.61 : 0.56,
    metadata: {
      event_type: gangSignal && !descriptor.isConflict ? "organized_crime_signal" : descriptor.eventType,
      short_label: descriptor.shortLabel,
      original_headline: text,
      source_category: "open_source_digest",
      source_url: sourceUrl || null,
    },
  };
}

async function fetchOpenSourceIntelSignals(rangeHours: number): Promise<{
  points: IntelPoint[];
  health: ProviderHealth;
}> {
  const started = Date.now();
  const cutoff = Date.now() - rangeHours * 3600_000;
  const nowIso = new Date().toISOString();
  const adapters: Array<{ label: string; url: string }> = [
    { label: "ISW Map Room", url: "https://understandingwar.org/analysis/map-room/" },
    { label: "Critical Threats", url: "https://www.criticalthreats.org/" },
    { label: "CSIS", url: "https://www.csis.org/" },
    { label: "CFR Conflict Tracker", url: "https://www.cfr.org/global-conflict-tracker" },
    { label: "CrisisWatch", url: "https://www.crisisgroup.org/crisiswatch" },
    { label: "InSight Crime", url: "https://insightcrime.org/" },
  ];
  const points: IntelPoint[] = [];
  let okFeeds = 0;
  let parsedHeadlines = 0;

  for (const adapter of adapters) {
    const fetchRes = await fetchTextWithRetries([adapter.url], 12000, 1);
    if (!fetchRes.ok || !fetchRes.text) continue;
    okFeeds += 1;
    const headings = extractHtmlHeadlines(fetchRes.text);
    parsedHeadlines += headings.length;
    for (let i = 0; i < headings.length; i += 1) {
      const ts = new Date(Date.now() - i * 30000).toISOString();
      if (Date.parse(ts) < cutoff) continue;
      const point = buildHeadlinePointFromSource({
        source: adapter.label,
        title: headings[i],
        timestamp: ts || nowIso,
        idx: i,
        sourceUrl: adapter.url,
      });
      if (!point) continue;
      points.push(point);
    }
  }

  const deduped = dedupeEventPoints(points, 0.75).slice(0, 2400);
  return {
    points: deduped,
    health: {
      provider: "Open-source conflict digests",
      ok: deduped.length > 0,
      updatedAt: new Date().toISOString(),
      latencyMs: Date.now() - started,
      message: `Mapped ${deduped.length} points from ${okFeeds}/${adapters.length} sources (headlines parsed ${parsedHeadlines})`,
    },
  };
}

async function fetchExperimentalTrackerSignals(rangeHours: number): Promise<{
  points: IntelPoint[];
  health: ProviderHealth;
}> {
  const started = Date.now();
  const cutoff = Date.now() - rangeHours * 3600_000;
  const nowIso = new Date().toISOString();
  const adapters: Array<{ label: string; url: string }> = [
    { label: "WarPulse", url: "https://warpulse.net/" },
    { label: "WarStrikes", url: "https://warstrikes.com/" },
    { label: "World Tension Watch", url: "https://worldtensionwatch.com/" },
    { label: "Monitor the Situation", url: "https://monitor-the-situation.com/middle-east" },
    { label: "Military Summary", url: "https://militarysummary.com/map" },
    { label: "Vision of Humanity", url: "https://www.visionofhumanity.org/maps/#/" },
  ];
  const points: IntelPoint[] = [];
  let okFeeds = 0;
  let parsedHeadlines = 0;

  for (const adapter of adapters) {
    const fetchRes = await fetchTextWithRetries([adapter.url], 12000, 2);
    if (!fetchRes.ok || !fetchRes.text) continue;
    okFeeds += 1;
    const headings = extractHtmlHeadlines(fetchRes.text);
    const bodyFallback = extractVisibleBodyText(fetchRes.text)
      .split(/\n+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 40)
      .slice(0, 140);
    const candidates = headings.concat(bodyFallback).slice(0, 420);
    parsedHeadlines += candidates.length;
    for (let i = 0; i < candidates.length; i += 1) {
      const ts = new Date(Date.now() - i * 20000).toISOString();
      if (Date.parse(ts) < cutoff) continue;
      const point = buildHeadlinePointFromSource({
        source: adapter.label,
        title: candidates[i],
        timestamp: ts || nowIso,
        idx: i,
        sourceUrl: adapter.url,
      });
      if (!point) continue;
      points.push({
        ...point,
        id: `exp-${adapter.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${point.id}-${i}`,
        confidence: Math.min(0.68, (point.confidence ?? 0.55) + 0.06),
        metadata: {
          ...point.metadata,
          source_category: "experimental_tracker",
          source_adapter: "experimental_tracker_pack",
        },
      });
    }
  }

  const deduped = collapseRepeatedEvents(dedupeEventPoints(points, 0.5), "news").slice(0, 2600);
  return {
    points: deduped,
    health: {
      provider: "Experimental tracker feeds",
      ok: deduped.length > 0,
      updatedAt: new Date().toISOString(),
      latencyMs: Date.now() - started,
      message: `Mapped ${deduped.length} points from ${okFeeds}/${adapters.length} trackers (candidates parsed ${parsedHeadlines})`,
    },
  };
}

async function fetchRequestedDomainLiveSignals(rangeHours: number): Promise<{
  points: IntelPoint[];
  health: ProviderHealth;
}> {
  const started = Date.now();
  const cutoff = Date.now() - rangeHours * 3600_000;
  const feeds: Array<{ provider: string; domain: string; focus: string }> = [
    { provider: "ISW Map Room", domain: "understandingwar.org", focus: "ukraine OR iran OR israel OR frontline OR strike" },
    { provider: "Critical Threats", domain: "criticalthreats.org", focus: "iran OR strike OR missile OR drone OR offensive" },
    { provider: "CSIS", domain: "csis.org", focus: "war OR strike OR missile OR drone OR military operation" },
    { provider: "CFR Conflict Tracker", domain: "cfr.org", focus: "conflict OR tracker OR civil war OR confrontation" },
    { provider: "CrisisWatch", domain: "crisisgroup.org", focus: "conflict risk OR crisiswatch OR escalation OR war" },
    { provider: "WarPulse", domain: "warpulse.net", focus: "strike OR missile OR drone OR attack OR theater" },
    { provider: "WarStrikes", domain: "warstrikes.com", focus: "strike OR missile OR drone OR military conflict" },
    { provider: "World Tension Watch", domain: "worldtensionwatch.com", focus: "military OR conflict OR escalation OR diplomatic crisis" },
    { provider: "Monitor the Situation", domain: "monitor-the-situation.com", focus: "military planes OR vessels OR strike OR conflict" },
    { provider: "Military Summary", domain: "militarysummary.com", focus: "frontline OR strike OR battlefield OR conflict map" },
    { provider: "Vision of Humanity", domain: "visionofhumanity.org", focus: "conflict OR escalation OR violence OR war index" },
    { provider: "InSight Crime", domain: "insightcrime.org", focus: "cartel OR gang violence OR armed clash OR criminal violence" },
    { provider: "USCG NAVCEN", domain: "navcen.uscg.gov", focus: "ais OR maritime safety OR vessel traffic OR nav warning" },
    { provider: "WorldMonitor", domain: "worldmonitor.app", focus: "conflict OR strike OR military OR hotspot" },
    { provider: "LiveUAMap web", domain: "liveuamap.com", focus: "missile OR strike OR shelling OR drone OR attack" },
  ];
  const seen = new Set<string>();
  const points: IntelPoint[] = [];
  let okFeeds = 0;
  let totalItems = 0;
  let conflictCandidates = 0;
  let geoMapped = 0;
  let failedFeeds = 0;

  for (const feed of feeds) {
    const liveQuery = encodeURIComponent(
      `site:${feed.domain} (${feed.focus}) (missile OR strike OR drone OR shelling OR artillery OR battle OR incursion)`
    );
    const newsQuery = encodeURIComponent(`site:${feed.domain} (${feed.focus}) (conflict OR crisis OR military)`);
    const liveRes = await fetchTextWithRetries(buildGoogleNewsRssUrls(liveQuery), 12000, 2);
    if (!liveRes.ok || !liveRes.text) {
      failedFeeds += 1;
      continue;
    }
    okFeeds += 1;
    const parsedLive = parseRssConflictPoints(
      liveRes.text,
      cutoff,
      `${feed.provider} (domain live)`,
      "liveStrikes",
      seen
    );
    points.push(...parsedLive.points);
    totalItems += parsedLive.totalItems;
    conflictCandidates += parsedLive.conflictCandidates;
    geoMapped += parsedLive.geoMapped;

    const newsRes = await fetchTextWithRetries(buildGoogleNewsRssUrls(newsQuery), 12000, 1);
    if (newsRes.ok && newsRes.text) {
      const parsedNews = parseRssConflictPoints(
        newsRes.text,
        cutoff,
        `${feed.provider} (domain live)`,
        "news",
        seen
      );
      points.push(...parsedNews.points);
      totalItems += parsedNews.totalItems;
      conflictCandidates += parsedNews.conflictCandidates;
      geoMapped += parsedNews.geoMapped;
    }
  }

  const deduped = collapseRepeatedEvents(dedupeEventPoints(points, 0.5), "news").slice(0, 12000);
  return {
    points: deduped,
    health: {
      provider: "Requested domain live feeds",
      ok: deduped.length > 0,
      updatedAt: new Date().toISOString(),
      latencyMs: Date.now() - started,
      message: `Mapped ${deduped.length} points from ${okFeeds}/${feeds.length} domains (items ${totalItems}, candidates ${conflictCandidates}, geocoded ${geoMapped}) [reason=${failedFeeds > 0 ? "partial_fetch_failure" : "ok"}]`,
    },
  };
}

const US_STATE_CENTROIDS: Record<string, { lat: number; lon: number }> = {
  alabama: { lat: 32.806671, lon: -86.79113 },
  alaska: { lat: 61.370716, lon: -152.404419 },
  arizona: { lat: 33.729759, lon: -111.431221 },
  arkansas: { lat: 34.969704, lon: -92.373123 },
  california: { lat: 36.116203, lon: -119.681564 },
  colorado: { lat: 39.059811, lon: -105.311104 },
  connecticut: { lat: 41.597782, lon: -72.755371 },
  delaware: { lat: 39.318523, lon: -75.507141 },
  florida: { lat: 27.766279, lon: -81.686783 },
  georgia: { lat: 33.040619, lon: -83.643074 },
  hawaii: { lat: 21.094318, lon: -157.498337 },
  idaho: { lat: 44.240459, lon: -114.478828 },
  illinois: { lat: 40.349457, lon: -88.986137 },
  indiana: { lat: 39.849426, lon: -86.258278 },
  iowa: { lat: 42.011539, lon: -93.210526 },
  kansas: { lat: 38.5266, lon: -96.726486 },
  kentucky: { lat: 37.66814, lon: -84.670067 },
  louisiana: { lat: 31.169546, lon: -91.867805 },
  maine: { lat: 44.693947, lon: -69.381927 },
  maryland: { lat: 39.063946, lon: -76.802101 },
  massachusetts: { lat: 42.230171, lon: -71.530106 },
  michigan: { lat: 43.326618, lon: -84.536095 },
  minnesota: { lat: 45.694454, lon: -93.900192 },
  mississippi: { lat: 32.741646, lon: -89.678696 },
  missouri: { lat: 38.456085, lon: -92.288368 },
  montana: { lat: 46.921925, lon: -110.454353 },
  nebraska: { lat: 41.12537, lon: -98.268082 },
  nevada: { lat: 38.313515, lon: -117.055374 },
  "new hampshire": { lat: 43.452492, lon: -71.563896 },
  "new jersey": { lat: 40.298904, lon: -74.521011 },
  "new mexico": { lat: 34.840515, lon: -106.248482 },
  "new york": { lat: 42.165726, lon: -74.948051 },
  "north carolina": { lat: 35.630066, lon: -79.806419 },
  "north dakota": { lat: 47.528912, lon: -99.784012 },
  ohio: { lat: 40.388783, lon: -82.764915 },
  oklahoma: { lat: 35.565342, lon: -96.928917 },
  oregon: { lat: 44.572021, lon: -122.070938 },
  pennsylvania: { lat: 40.590752, lon: -77.209755 },
  "rhode island": { lat: 41.680893, lon: -71.51178 },
  "south carolina": { lat: 33.856892, lon: -80.945007 },
  "south dakota": { lat: 44.299782, lon: -99.438828 },
  tennessee: { lat: 35.747845, lon: -86.692345 },
  texas: { lat: 31.054487, lon: -97.563461 },
  utah: { lat: 40.150032, lon: -111.862434 },
  vermont: { lat: 44.045876, lon: -72.710686 },
  virginia: { lat: 37.769337, lon: -78.169968 },
  washington: { lat: 47.400902, lon: -121.490494 },
  "west virginia": { lat: 38.491226, lon: -80.954453 },
  wisconsin: { lat: 44.268543, lon: -89.616508 },
  wyoming: { lat: 42.755966, lon: -107.30249 },
  "district of columbia": { lat: 38.9072, lon: -77.0369 },
};

async function fetchLawfareDomesticDeployments(rangeHours: number): Promise<{
  points: IntelPoint[];
  health: ProviderHealth;
}> {
  const started = Date.now();
  const cutoff = Date.now() - rangeHours * 3600_000;
  const url =
    "https://www.lawfaremedia.org/projects-series/trials-of-the-trump-administration/tracking-domestic-deployments-of-the-u.s.-military";
  const fetchRes = await fetchTextWithRetries([url], 14000, 2);
  if (!fetchRes.ok || !fetchRes.text) {
    const fallbackQuery = encodeURIComponent(
      'site:lawfaremedia.org ("domestic deployments" OR "national guard" OR "military deployment")'
    );
    const rssFallback = await fetchTextWithRetries(buildGoogleNewsRssUrls(fallbackQuery), 12000, 2);
    if (rssFallback.ok && rssFallback.text) {
      const points: IntelPoint[] = [];
      const blocks = rssFallback.text.split("<item>").slice(1, 240);
      for (let i = 0; i < blocks.length; i += 1) {
        const title = extractRssTag(blocks[i], "title") || "";
        const description = extractRssTag(blocks[i], "description") || "";
        const fullText = `${title} ${description}`.toLowerCase();
        for (const [state, coord] of Object.entries(US_STATE_CENTROIDS)) {
          if (!new RegExp(`\\b${state.replace(/\s+/g, "\\s+")}\\b`, "i").test(fullText)) continue;
          const stateName = state
            .split(" ")
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(" ");
          const troopHint = extractTroopUnitHint(`${title} ${description}`) ?? "State-level signal (no specific unit parsed)";
          points.push({
            id: `lawfare-rss-${state.replace(/\s+/g, "-")}-${i}`,
            layer: "infrastructure",
            title: `US troop deployment signal in ${stateName}`,
            subtitle: "Lawfare deployments tracker fallback (Google News RSS)",
            lat: coord.lat,
            lon: coord.lon,
            country: "United States",
            severity: "medium",
            source: "Lawfare deployments tracker",
            timestamp: new Date().toISOString(),
            magnitude: 4.8,
            confidence: 0.52,
            metadata: {
              event_type: "us_troop_deployment",
              troop_unit_hint: troopHint,
              unit_or_branch: troopHint,
              source_url: extractRssTag(blocks[i], "link") || url,
              state: stateName,
              original_headline: title || `Domestic deployment mention: ${stateName}`,
            },
          });
        }
      }
      const fallbackDeduped = dedupeEventPoints(points, 6).slice(0, 180);
      return {
        points: fallbackDeduped,
        health: {
          provider: "Lawfare domestic deployments",
          ok: fallbackDeduped.length > 0,
          updatedAt: new Date().toISOString(),
          latencyMs: Date.now() - started,
          message: fallbackDeduped.length
            ? `Mapped ${fallbackDeduped.length} state-level deployment signals via RSS fallback`
            : `Lawfare page unavailable (${fetchRes.message ?? "fetch failed"}); RSS fallback returned no state-level matches`,
        },
      };
    }
    return {
      points: [],
      health: {
        provider: "Lawfare domestic deployments",
        ok: false,
        updatedAt: new Date().toISOString(),
        latencyMs: Date.now() - started,
        message: fetchRes.message ?? "Could not load Lawfare tracker page",
      },
    };
  }

  const text = extractVisibleBodyText(fetchRes.text).toLowerCase();
  const points: IntelPoint[] = [];
  const ts = new Date().toISOString();
  if (Date.parse(ts) >= cutoff) {
    for (const [state, coord] of Object.entries(US_STATE_CENTROIDS)) {
      if (!new RegExp(`\\b${state.replace(/\s+/g, "\\s+")}\\b`, "i").test(text)) continue;
      const stateName = state
        .split(" ")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
      const troopHint = extractTroopUnitHint(text) ?? "State-level signal (no specific unit parsed)";
      points.push({
        id: `lawfare-deploy-${state.replace(/\s+/g, "-")}`,
        layer: "infrastructure",
        title: `US troop deployment signal in ${stateName}`,
        subtitle: "Domestic deployment tracker mention",
        lat: coord.lat,
        lon: coord.lon,
        country: "United States",
        severity: "medium",
        source: "Lawfare deployments tracker",
        timestamp: ts,
        magnitude: 5,
        confidence: 0.58,
        metadata: {
          event_type: "us_troop_deployment",
          troop_unit_hint: troopHint,
          unit_or_branch: troopHint,
          source_url: url,
          state: stateName,
          original_headline: `Domestic deployment mention: ${stateName}`,
        },
      });
    }
  }

  const deduped = dedupeEventPoints(points, 6).slice(0, 180);
  return {
    points: deduped,
    health: {
      provider: "Lawfare domestic deployments",
      ok: deduped.length > 0,
      updatedAt: new Date().toISOString(),
      latencyMs: Date.now() - started,
      message: deduped.length
        ? `Mapped ${deduped.length} state-level domestic deployment signals`
        : "No state-level deployment mentions parsed from tracker page",
    },
  };
}

async function fetchTrustedPublisherSignals(rangeHours: number): Promise<{
  points: IntelPoint[];
  health: ProviderHealth;
}> {
  const started = Date.now();
  const cutoff = Date.now() - rangeHours * 3600_000;
  const cached = await readNetworkDigestCache("trusted-publisher-network", rangeHours);
  if (cached) {
    return {
      points: cached.points,
      health: {
        provider: "Trusted publisher feeds",
        ok: cached.points.length > 0,
        updatedAt: new Date(cached.fetchedAt).toISOString(),
        latencyMs: Date.now() - started,
        message: `${cached.diagnostics} [cache=warm reason=cache_hit]`,
      },
    };
  }

  const seen = new Set<string>();
  const points: IntelPoint[] = [];
  let feedErrors = 0;
  let totalItems = 0;
  let conflictCandidates = 0;
  let geoMapped = 0;
  let domainFallbacks = 0;

  for (const feed of TRUSTED_CONFLICT_RSS_FEEDS) {
    const urls: string[] = [];
    if (feed.url) urls.push(feed.url);
    if (feed.domain) {
      const q = encodeURIComponent(
        `site:${feed.domain} (missile OR strike OR explosion OR shelling OR artillery OR drone OR battle OR raid OR clashes)`
      );
      urls.push(...buildGoogleNewsRssUrls(q));
      domainFallbacks += 1;
    }
    if (urls.length === 0) {
      feedErrors += 1;
      continue;
    }
    const fetchRes = await fetchTextWithRetries(urls, 12000, 2);
    if (!fetchRes.ok || !fetchRes.text) {
      feedErrors += 1;
      continue;
    }
    const parsed = parseRssConflictPoints(
      fetchRes.text,
      cutoff,
      `${feed.provider} (${feed.tier})`,
      "news",
      seen
    );
    totalItems += parsed.totalItems;
    conflictCandidates += parsed.conflictCandidates;
    geoMapped += parsed.geoMapped;
    points.push(...parsed.points);
  }

  const deduped = dedupeEventPoints(points, 1).slice(0, 12000);
  const diagnostics =
    feedErrors > 0
      ? `Mapped ${deduped.length} event points from ${
          TRUSTED_CONFLICT_RSS_FEEDS.length - feedErrors
        }/${TRUSTED_CONFLICT_RSS_FEEDS.length} feeds (items ${totalItems}, conflict candidates ${conflictCandidates}, geocoded ${geoMapped}, domain_fallbacks ${domainFallbacks})`
      : `Mapped ${deduped.length} event points (items ${totalItems}, conflict candidates ${conflictCandidates}, geocoded ${geoMapped}, domain_fallbacks ${domainFallbacks})`;
  await writeNetworkDigestCache("trusted-publisher-network", rangeHours, {
    points: deduped,
    fetchedAt: Date.now(),
    diagnostics,
  });

  return {
    points: deduped,
    health: {
      provider: "Trusted publisher feeds",
      ok: deduped.length > 0,
      updatedAt: new Date().toISOString(),
      latencyMs: Date.now() - started,
      message: `${diagnostics} [reason=${feedErrors > 0 ? "partial_fetch_failure" : "ok"}]`,
    },
  };
}

async function fetchRssNetworkSignals(rangeHours: number): Promise<{
  points: IntelPoint[];
  health: ProviderHealth;
}> {
  const res = await fetchTrustedPublisherSignals(rangeHours);
  return {
    points: res.points,
    health: {
      ...res.health,
      provider: "RSS network adapter",
      message: `${res.health.message ?? ""} [reason=network_adapter]`.trim(),
    },
  };
}

async function fetchRelaySeedSignals(rangeHours: number): Promise<{
  points: IntelPoint[];
  health: ProviderHealth;
}> {
  const started = Date.now();
  const relayUrl = process.env.INTEL_RELAY_DIGEST_URL?.trim();
  if (!relayUrl) {
    return {
      points: [],
      health: {
        provider: "Relay seed digest",
        ok: true,
        updatedAt: new Date().toISOString(),
        latencyMs: Date.now() - started,
        message: "No INTEL_RELAY_DIGEST_URL configured (optional adapter) [reason=missing_env]",
      },
    };
  }
  const res = await timedJsonFetch<{
    points?: Array<{
      id?: string;
      title?: string;
      subtitle?: string;
      lat?: number;
      lon?: number;
      country?: string;
      source?: string;
      timestamp?: string;
      url?: string;
      snippet?: string;
      imageUrl?: string;
      severity?: string;
      eventType?: string;
    }>;
  }>(`${relayUrl}${relayUrl.includes("?") ? "&" : "?"}rangeHours=${rangeHours}`, undefined, 16000);
  if (!res.ok || !res.data) {
    const raw = res.message ?? "Relay request failed";
    const friendly =
      typeof raw === "string" && (raw.includes("aborted") || raw.includes("abort"))
        ? "Relay request timed out or aborted"
        : raw;
    return {
      points: [],
      health: {
        provider: "Relay seed digest",
        ok: false,
        updatedAt: new Date().toISOString(),
        latencyMs: Date.now() - started,
        message: `${friendly} (optional adapter; map still runs without relay) [reason=upstream_error]`,
      },
    };
  }
  const nowIso = new Date().toISOString();
  const points: IntelPoint[] = [];
  for (const p of res.data.points ?? []) {
    const lat = Number(p.lat);
    const lon = Number(p.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    points.push({
      id: `relay-${p.id ?? `${lat}-${lon}-${points.length + 1}`}`,
      layer: "news",
      title: p.title?.trim() || "Conflict event",
      subtitle: p.subtitle?.trim() || "Relay conflict digest",
      lat,
      lon,
      country: p.country?.trim() || undefined,
      severity:
        p.severity === "critical" || p.severity === "high" || p.severity === "medium"
          ? p.severity
          : "medium",
      source: p.source?.trim() || "Relay digest",
      timestamp: p.timestamp?.trim() || nowIso,
      magnitude: 8,
      confidence: 0.7,
      imageUrl: p.imageUrl?.trim() || undefined,
      metadata: {
        event_type: p.eventType?.trim() || "conflict_event",
        source_url: p.url?.trim() || null,
        source_snippet: p.snippet?.trim() || null,
      },
    });
  }
  const deduped = dedupeEventPoints(points, 1).slice(0, 4200);
  return {
    points: deduped,
    health: {
      provider: "Relay seed digest",
      ok: true,
      updatedAt: new Date().toISOString(),
      latencyMs: Date.now() - started,
      message: `Mapped ${deduped.length} relay-seeded points [reason=${deduped.length ? "ok" : "reachable_empty"}]`,
    },
  };
}

function extractStrikeKeyword(text: string): string | null {
  return classifyEvent(text).strikeKeyword;
}

function extractMentionedCity(text: string): { city: string; lat: number; lon: number; country: string } | null {
  const all = extractAllMentionedCities(text);
  return all.length > 0 ? all[0] : null;
}

/** Returns every city mentioned in the text so one article can produce multiple points (Ukraine/Iran density). */
function extractAllMentionedCities(
  text: string
): Array<{ city: string; lat: number; lon: number; country: string }> {
  const out: Array<{ city: string; lat: number; lon: number; country: string }> = [];
  const seen = new Set<string>();
  const entries = Object.entries(CITY_COORDS);
  entries.sort((a, b) => b[0].length - a[0].length);
  for (const [cityKey, loc] of entries) {
    const key = cityKey.replace(/\s+/g, " ");
    if (key.length < 3) continue;
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp("\\b" + escaped.replace(/\s+/g, "\\s*") + "\\b", "i");
    if (re.test(text) && !seen.has(loc.country + "|" + key)) {
      seen.add(loc.country + "|" + key);
      out.push({ city: key, ...loc });
    }
  }
  return out;
}

function extractRegionFallback(
  text: string
): { lat: number; lon: number; country: string } | null {
  for (const r of CONFLICT_REGION_CENTROIDS) {
    if (r.re.test(text)) {
      return { lat: r.lat, lon: r.lon, country: r.country };
    }
  }
  return null;
}

function normalizeCountryLabel(country: string): string {
  return country.replace(/\s+/g, " ").trim();
}

function canonicalConflictCountry(country: string): string {
  const normalized = normalizeCountryLabel(country).toLowerCase();
  return CONFLICT_COUNTRY_ALIASES[normalized] ?? normalized;
}

function isCountryHighlightDenied(country: string): boolean {
  return COUNTRY_HIGHLIGHT_DENYLIST.has(canonicalConflictCountry(country));
}

function rankSignalSeverity(points: IntelPoint[]): "low" | "medium" | "high" | "critical" {
  let score = 0;
  for (const p of points) {
    score += p.severity === "critical" ? 4 : p.severity === "high" ? 3 : p.severity === "medium" ? 2 : 1;
  }
  if (score >= 40) return "critical";
  if (score >= 22) return "high";
  if (score >= 10) return "medium";
  return "low";
}

type LiveuamapEvent = {
  id?: string | number;
  title?: string;
  description?: string;
  city?: string;
  country?: string;
  country_name?: string;
  latitude?: number | string;
  longitude?: number | string;
  lat?: number | string;
  lng?: number | string;
  pubDate?: string;
  date?: string;
  timestamp?: string;
  source?: string;
};

function parseLiveuamapList(data: unknown): LiveuamapEvent[] {
  if (Array.isArray(data)) return data as LiveuamapEvent[];
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    const candidates = [obj.events, obj.data, obj.items, obj.results];
    for (const c of candidates) {
      if (Array.isArray(c)) return c as LiveuamapEvent[];
    }
  }
  return [];
}

async function fetchLiveuamapEvents(rangeHours: number): Promise<{
  points: IntelPoint[];
  health: ProviderHealth;
}> {
  const apiKey = process.env.LIVEUAMAP_API_KEY?.trim();
  if (!apiKey) {
    return {
      points: [],
      health: {
        provider: "LiveUAMap",
        ok: false,
        updatedAt: new Date().toISOString(),
        message: "No LIVEUAMAP_API_KEY configured",
      },
    };
  }

  const started = Date.now();
  const now = Date.now();
  const cutoff = now - rangeHours * 3600_000;
  const fromIso = new Date(cutoff).toISOString();
  const candidates = [
    `https://api.liveuamap.com/v1/events?from=${encodeURIComponent(fromIso)}`,
    `https://api.liveuamap.com/events?from=${encodeURIComponent(fromIso)}`,
    `https://uk.liveuamap.com/api/events?from=${encodeURIComponent(fromIso)}`,
  ];

  let events: LiveuamapEvent[] = [];
  let lastMessage = "No compatible LiveUAMap response";
  for (const url of candidates) {
    const res = await timedJsonFetch<unknown>(
      url,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "x-api-key": apiKey,
          Accept: "application/json",
        },
      },
      12000
    );
    if (!res.ok) {
      lastMessage = res.message ?? lastMessage;
      continue;
    }
    const parsed = parseLiveuamapList(res.data);
    if (parsed.length) {
      events = parsed;
      break;
    }
  }

  if (!events.length) {
    const message =
      typeof lastMessage === "string" && lastMessage.includes("404")
        ? "HTTP 404 — endpoint may have changed or API access not granted."
        : lastMessage;
    return {
      points: [],
      health: {
        provider: "LiveUAMap",
        ok: false,
        updatedAt: new Date().toISOString(),
        latencyMs: Date.now() - started,
        message,
      },
    };
  }

  const points: IntelPoint[] = [];
  for (const e of events) {
    const title = String(e.title ?? e.description ?? "").trim();
    if (!title) continue;
    const fullText = `${title} ${String(e.description ?? "")}`;
    const descriptor = classifyEvent(fullText);
    if (!descriptor.isConflict) continue;

    const lat = Number(e.latitude ?? e.lat);
    const lon = Number(e.longitude ?? e.lng);
    const city = String(e.city ?? "").trim();
    const countryRaw = String(e.country_name ?? e.country ?? "").trim();
    const country = countryRaw || extractMentionedCountry(fullText);
    if (!country) continue;
    const bbox = COUNTRY_BBOX[country];
    const finalLat = Number.isFinite(lat) ? lat : bbox?.[4];
    const finalLon = Number.isFinite(lon) ? lon : bbox?.[5];
    if (typeof finalLat !== "number" || typeof finalLon !== "number") continue;
    const tsRaw = e.pubDate ?? e.timestamp ?? e.date;
    const ts = tsRaw ? Date.parse(String(tsRaw)) : Date.now();
    if (!Number.isFinite(ts) || ts < cutoff) continue;

    points.push({
      id: `liveuamap-${String(e.id ?? `${country}-${city}-${ts}`)}`,
      layer: "liveStrikes",
      title: city ? `${descriptor.shortLabel} near ${city}` : descriptor.shortLabel,
      subtitle: title,
      lat: finalLat,
      lon: finalLon,
      country: normalizeCountryLabel(country),
      severity: "high",
      source: "LiveUAMap",
      timestamp: new Date(ts).toISOString(),
      magnitude: 10,
      confidence: 0.82,
      metadata: {
        event_type: descriptor.eventType,
        short_label: descriptor.shortLabel,
        original_headline: title,
        city: city || null,
      },
    });
  }

  return {
    points: points.slice(0, 1500),
    health: {
      provider: "LiveUAMap",
      ok: points.length > 0,
      updatedAt: new Date().toISOString(),
      latencyMs: Date.now() - started,
      message: `Mapped ${points.length} geocoded conflict events`,
    },
  };
}

type GdeltDocResponse = {
  articles?: Array<{
    title?: string;
    seendate?: string;
    domain?: string;
    sourcecountry?: string;
    url?: string;
  }>;
};

function parseGdeltSeenDate(raw: string | undefined): number {
  if (!raw) return Number.NaN;
  const direct = Date.parse(raw);
  if (Number.isFinite(direct)) return direct;
  const compact = raw.match(
    /^(\d{4})(\d{2})(\d{2})T?(\d{2})(\d{2})(\d{2})Z?$/
  );
  if (!compact) return Number.NaN;
  const [, y, mo, d, h, mi, s] = compact;
  const ts = Date.UTC(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(h),
    Number(mi),
    Number(s)
  );
  return Number.isFinite(ts) ? ts : Number.NaN;
}

async function fetchGdeltEmergencyFallback(rangeHours: number): Promise<IntelPoint[]> {
  const query = encodeURIComponent(
    "(missile OR strike OR drone OR explosion OR artillery OR bombardment OR naval battle OR interception OR raid) (Ukraine OR Russia OR Israel OR Iran OR Gaza OR Sudan OR Yemen OR Myanmar OR Syria OR Lebanon)"
  );
  const url = `https://news.google.com/rss/search?q=${query}&hl=en-US&gl=US&ceid=US:en`;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 9000);
  try {
    const res = await fetch(url, { cache: "no-store", signal: ctl.signal });
    if (!res.ok) return [];
    const text = await res.text();
    const cutoff = Date.now() - rangeHours * 3600_000;
    const points: IntelPoint[] = [];
    const blocks = text.split("<item>").slice(1, 140);
    for (const block of blocks) {
      const title = extractRssTag(block, "title");
      const description = extractRssTag(block, "description") ?? "";
      const pubRaw = extractRssTag(block, "pubDate");
      if (!title) continue;
      const ts = pubRaw ? Date.parse(pubRaw) : Date.now();
      if (!Number.isFinite(ts) || ts < cutoff) continue;
      const textBlob = `${title} ${description}`;
      const descriptor = classifyEvent(textBlob);
      if (!descriptor.isConflict) continue;
      const city = extractMentionedCity(textBlob);
      const country = city?.country || extractMentionedCountry(textBlob);
      if (!country) continue;
      const bbox = COUNTRY_BBOX[country];
      if (!bbox && !city) continue;
      points.push({
        id: `gdelt-emerg-${country}-${ts}-${points.length + 1}`,
        layer: "liveStrikes",
        title: city
          ? `${descriptor.shortLabel} near ${city.city}`
          : `${descriptor.shortLabel} in ${country}`,
        subtitle: title,
        lat: city?.lat ?? bbox![4],
        lon: city?.lon ?? bbox![5],
        country: normalizeCountryLabel(country),
        severity: city ? "high" : "medium",
        source: "GDELT fallback",
        timestamp: new Date(ts).toISOString(),
        magnitude: city ? 7 : 5,
        confidence: 0.52,
        metadata: {
          event_type: descriptor.eventType,
          short_label: descriptor.shortLabel,
          original_headline: title,
        },
      });
    }
    return points.slice(0, 220);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

async function fetchGdeltConflictEvents(rangeHours: number): Promise<{
  points: IntelPoint[];
  health: ProviderHealth;
}> {
  const started = Date.now();
  const now = Date.now();
  if (gdeltCache && now - gdeltCache.fetchedAt < GDELT_CACHE_TTL_MS) {
    return {
      points: gdeltCache.points,
      health: {
        provider: "GDELT",
        ok: gdeltCache.points.length > 0,
        updatedAt: new Date().toISOString(),
        latencyMs: Date.now() - started,
        message: `Mapped ${gdeltCache.points.length} conflict events (cached)`,
      },
    };
  }
  if (now < gdeltCooldownUntil && gdeltCache) {
    return {
      points: gdeltCache.points,
      health: {
        provider: "GDELT",
        ok: gdeltCache.points.length > 0,
        updatedAt: new Date().toISOString(),
        latencyMs: Date.now() - started,
        message: `Rate limited upstream; serving ${gdeltCache.points.length} cached events`,
      },
    };
  }

  const query = encodeURIComponent(
    "(missile OR strike OR drone OR explosion OR artillery OR bombardment OR battle OR invasion OR interception OR naval battle OR shelling OR raid)"
  );
  const url =
    `https://api.gdeltproject.org/api/v2/doc/doc?query=${query}&mode=ArtList&format=json&maxrecords=120&sort=datedesc`;
  const res = await timedJsonFetch<GdeltDocResponse>(url, undefined, 14000);
  if (!res.ok && (res.message || "").includes("HTTP 429")) {
    gdeltCooldownUntil = Date.now() + GDELT_COOLDOWN_MS;
  }
  if (!res.ok || !res.data?.articles?.length) {
    const emergency = await fetchGdeltEmergencyFallback(rangeHours);
    if (emergency.length > 0) {
      gdeltCache = { fetchedAt: Date.now(), points: emergency };
      return {
        points: emergency,
        health: {
          provider: "GDELT",
          ok: true,
          updatedAt: new Date().toISOString(),
          latencyMs: res.latencyMs,
          message: `GDELT degraded (${res.message ?? "upstream error"}); fallback mapped ${emergency.length} events`,
        },
      };
    }
    if (gdeltCache?.points?.length) {
      return {
        points: gdeltCache.points,
        health: {
          provider: "GDELT",
          ok: true,
          updatedAt: new Date().toISOString(),
          latencyMs: res.latencyMs,
          message: `GDELT degraded (${res.message ?? "upstream error"}); using ${gdeltCache.points.length} cached events`,
        },
      };
    }
    return {
      points: [],
      health: {
        provider: "GDELT",
        ok: false,
        updatedAt: new Date().toISOString(),
        latencyMs: res.latencyMs,
        message: res.message ?? "No GDELT conflict events",
      },
    };
  }

  const cutoff = Date.now() - rangeHours * 3600_000;
  const points: IntelPoint[] = [];
  let idx = 0;
  for (const a of res.data.articles) {
    const title = String(a.title ?? "").trim();
    if (!title) continue;
    const parsedTs = parseGdeltSeenDate(a.seendate);
    const ts = Number.isFinite(parsedTs) ? parsedTs : Date.now();
    if (ts < cutoff) continue;
    const descriptor = classifyEvent(title);
    if (!descriptor.isConflict) continue;

    const city = extractMentionedCity(title);
    const sourceCountryRaw = String(a.sourcecountry ?? "").trim().toUpperCase();
    const sourceCountryFromCode = GDELT_SOURCECOUNTRY_MAP[sourceCountryRaw];
    const country =
      city?.country ||
      extractMentionedCountry(title) ||
      sourceCountryFromCode ||
      String(a.sourcecountry ?? "").trim();
    if (!country) continue;
    const bbox = COUNTRY_BBOX[country];
    if (!bbox && !city) continue;
    const lat = city?.lat ?? bbox![4];
    const lon = city?.lon ?? bbox![5];
    idx += 1;

    points.push({
      id: `gdelt-${idx}-${country}-${ts}`,
      layer: "liveStrikes",
      title: city
        ? `${descriptor.shortLabel} near ${city.city}`
        : `${descriptor.shortLabel} in ${country}`,
      subtitle: title,
      lat,
      lon,
      country: normalizeCountryLabel(country),
      severity: "medium",
      source: "GDELT",
      timestamp: new Date(ts).toISOString(),
      magnitude: city ? 8 : 5,
      confidence: city ? 0.64 : 0.55,
      metadata: {
        event_type: descriptor.eventType,
        short_label: descriptor.shortLabel,
        publisher: a.domain ?? "unknown",
        source_url: a.url ?? null,
      },
    });
  }
  gdeltCache = { fetchedAt: Date.now(), points: points.slice(0, 1400) };

  return {
    points: gdeltCache.points,
    health: {
      provider: "GDELT",
      ok: gdeltCache.points.length > 0,
      updatedAt: new Date().toISOString(),
      latencyMs: Date.now() - started,
      message: `Mapped ${gdeltCache.points.length} conflict events`,
    },
  };
}

type EventRegistryArticle = {
  uri?: string;
  title?: string;
  body?: string;
  url?: string;
  image?: string;
  imageUrl?: string;
  thumbImage?: string;
  date?: string;
  time?: string;
  source?: {
    title?: string;
    uri?: string;
  };
  location?: {
    country?: string;
    city?: string;
    type?: string;
    label?: string;
  };
  concepts?: Array<{
    label?: {
      eng?: string;
    };
    type?: string;
  }>;
};

function parseEventRegistryArticles(payload: unknown): EventRegistryArticle[] {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Record<string, unknown>;
  const candidates = [
    root.articles,
    (root.articles as Record<string, unknown> | undefined)?.results,
    root.results,
  ];
  for (const c of candidates) {
    if (Array.isArray(c)) return c as EventRegistryArticle[];
    if (c && typeof c === "object") {
      const maybe = (c as Record<string, unknown>).results;
      if (Array.isArray(maybe)) return maybe as EventRegistryArticle[];
    }
  }
  return [];
}

function parseEventRegistryTimestamp(a: EventRegistryArticle): number {
  const raw = `${a.date || ""} ${a.time || ""}`.trim();
  const ts = raw ? Date.parse(raw) : Number.NaN;
  if (Number.isFinite(ts)) return ts;
  return Date.now();
}

async function fetchEventRegistryNews(rangeHours: number): Promise<{
  points: IntelPoint[];
  health: ProviderHealth;
}> {
  const apiKey = process.env.NEWS_API?.trim();
  const started = Date.now();
  if (!apiKey) {
    return {
      points: [],
      health: {
        provider: "Event Registry",
        ok: false,
        updatedAt: new Date().toISOString(),
        message: "No NEWS_API configured",
      },
    };
  }

  const now = new Date();
  const from = new Date(now.getTime() - rangeHours * 3600_000);
  const keywordSeeds = [
    "missile strike OR projectile hit OR drone strike OR artillery strike",
    "battle OR clashes OR skirmish OR raid OR incursion OR cross-border shelling",
    "warship OR naval battle OR anti-ship missile OR carrier strike group OR maritime attack",
    "(missile OR strike OR drone OR bombardment OR shelling OR artillery OR raid OR interception OR naval battle OR special operation) AND (Ukraine OR Russia OR Israel OR Iran OR Gaza OR Sudan OR Yemen OR Syria OR Lebanon OR Myanmar OR Iraq OR Somalia)",
  ];

  let parsed: EventRegistryArticle[] = [];
  let lastMessage = "No Event Registry articles returned";
  for (const keyword of keywordSeeds) {
    for (let page = 1; page <= 6; page += 1) {
      const body: Record<string, unknown> = {
        apiKey,
        keyword,
        dateStart: from.toISOString().slice(0, 10),
        dateEnd: now.toISOString().slice(0, 10),
        lang: "eng",
        articleCount: 100,
        sortBy: "date",
        resultType: "articles",
        isDuplicateFilter: "skipDuplicates",
        articlesPage: page,
        fromArticle: (page - 1) * 100,
      };
      const res = await timedJsonFetch<unknown>(
        "https://eventregistry.org/api/v1/article/getArticles",
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(body),
        },
        14000
      );
      if (!res.ok) {
        lastMessage = res.message ?? lastMessage;
        break;
      }
      if (res.data && typeof res.data === "object") {
        const errObj = (res.data as Record<string, unknown>).error;
        if (errObj && typeof errObj === "object") {
          const maybeMsg = String(
            (errObj as Record<string, unknown>).message ??
              (errObj as Record<string, unknown>).description ??
              ""
          ).trim();
          if (maybeMsg) lastMessage = maybeMsg;
        }
      }
      const pageArticles = parseEventRegistryArticles(res.data);
      if (!pageArticles.length) break;
      parsed.push(...pageArticles);
      if (parsed.length >= 2600) break;
    }
    if (parsed.length >= 2600) break;
  }

  if (parsed.length > 0) {
    const byKey = new Map<string, EventRegistryArticle>();
    for (const a of parsed) {
      const ts = parseEventRegistryTimestamp(a);
      const key = `${a.uri ?? ""}|${String(a.title ?? "").trim().toLowerCase()}|${new Date(ts).toISOString().slice(0, 13)}`;
      if (!byKey.has(key)) byKey.set(key, a);
    }
    parsed = Array.from(byKey.values());
  }

  if (!parsed.length) {
    const fallbackUrls = [
      `https://eventregistry.org/api/v1/article/getArticles?apiKey=${encodeURIComponent(
        apiKey
      )}&keyword=${encodeURIComponent(
        "missile strike OR drone strike OR artillery OR naval battle"
      )}&lang=eng&articleCount=100&sortBy=date&resultType=articles`,
      `https://newsapi.ai/api/v1/article/getArticles?apiKey=${encodeURIComponent(
        apiKey
      )}&keyword=${encodeURIComponent(
        "missile strike OR drone strike OR artillery OR naval battle"
      )}&lang=eng&articleCount=100&sortBy=date&resultType=articles`,
    ];
    for (const fallbackUrl of fallbackUrls) {
      const fallbackRes = await timedJsonFetch<unknown>(fallbackUrl, undefined, 12000);
      if (fallbackRes.ok) {
        parsed = parseEventRegistryArticles(fallbackRes.data);
        if (parsed.length > 0) break;
      } else if (fallbackRes.message) {
        lastMessage = fallbackRes.message;
      }
    }
  }

  if (!parsed.length) {
    const rssQuery = encodeURIComponent(
      "(missile OR strike OR drone OR bombardment OR artillery OR raid) (Ukraine OR Iran OR Israel OR Sudan OR Yemen OR Syria OR Lebanon)"
    );
    const rssUrl = `https://news.google.com/rss/search?q=${rssQuery}&hl=en-US&gl=US&ceid=US:en`;
    const rssCtl = new AbortController();
    const rssTimer = setTimeout(() => rssCtl.abort(), 12000);
    try {
      const rssHttp = await fetch(rssUrl, {
        cache: "no-store",
        signal: rssCtl.signal,
      });
      if (!rssHttp.ok) throw new Error(`HTTP ${rssHttp.status}`);
      const text = await rssHttp.text();
      const itemBlocks = text.split("<item>").slice(1, 260);
      const points: IntelPoint[] = [];
      const cutoff = Date.now() - rangeHours * 3600_000;
      for (const block of itemBlocks) {
        const title = extractRssTag(block, "title");
        const description = extractRssTag(block, "description") ?? "";
        const imageUrl = extractRssImageUrl(block);
        const pubRaw = extractRssTag(block, "pubDate");
        if (!title) continue;
        const ts = pubRaw ? Date.parse(pubRaw) : Date.now();
        if (!Number.isFinite(ts) || ts < cutoff) continue;
        const fullText = `${title} ${description}`;
        const descriptor = classifyEvent(fullText);
        if (!descriptor.isConflict) continue;
        const city = extractMentionedCity(fullText);
        const country = city?.country || extractMentionedCountry(fullText);
        if (!country) continue;
        const bbox = COUNTRY_BBOX[country];
        if (!bbox && !city) continue;
        points.push({
          id: `eventreg-rss-${country}-${ts}-${points.length + 1}`,
          layer: "news",
          title: city
            ? `${descriptor.shortLabel} near ${city.city}`
            : `${descriptor.shortLabel} in ${country}`,
          subtitle: "Event Registry fallback via Google News RSS",
          lat: city?.lat ?? bbox![4],
          lon: city?.lon ?? bbox![5],
          country: normalizeCountryLabel(country),
          severity: city ? "high" : "medium",
          source: "Event Registry fallback",
          timestamp: new Date(ts).toISOString(),
          magnitude: city ? 7 : 4,
          confidence: city ? 0.62 : 0.52,
          imageUrl: imageUrl || undefined,
          metadata: {
            event_type: descriptor.eventType,
            short_label: descriptor.shortLabel,
            source_url: extractRssTag(block, "link"),
            image_url: imageUrl || null,
            original_headline: title,
          },
        });
      }
      if (points.length > 0) {
        return {
          points: points.slice(0, 600),
          health: {
            provider: "Event Registry",
            ok: true,
            updatedAt: new Date().toISOString(),
            latencyMs: Date.now() - started,
            message: `Primary API empty; fallback mapped ${points.length} event-level reports`,
          },
        };
      }
    } catch {
      // Ignore and fall through to the primary degraded response.
    } finally {
      clearTimeout(rssTimer);
    }

    return {
      points: [],
      health: {
        provider: "Event Registry",
        ok: false,
        updatedAt: new Date().toISOString(),
        latencyMs: Date.now() - started,
        message: `Event Registry empty; fallback active (${lastMessage})`,
      },
    };
  }

  const cutoff = Date.now() - rangeHours * 3600_000;
  const points: IntelPoint[] = [];
  for (const a of parsed) {
    const title = String(a.title ?? "").trim();
    const body = String(a.body ?? "").trim();
    const fullText = `${title} ${body}`;
    if (!title) continue;
    const descriptor = classifyEvent(fullText);
    if (!descriptor.isConflict) continue;

    const sourceTitle = String(a.source?.title ?? "").trim();
    const sourceUri = String(a.source?.uri ?? "").trim();
    const trustedProbe = `${sourceTitle} ${sourceUri} ${title}`;
    const trusted = isTrustedPublisher(trustedProbe);

    const ts = parseEventRegistryTimestamp(a);
    if (!Number.isFinite(ts) || ts < cutoff) continue;

    const conceptCity = a.concepts?.find((c) => c.type === "loc" && c.label?.eng)?.label?.eng;
    const locHint = String(a.location?.label ?? conceptCity ?? "").trim();
    const city = extractMentionedCity(`${fullText} ${locHint}`);
    const country =
      city?.country ||
      String(a.location?.country ?? "").trim() ||
      extractMentionedCountry(`${fullText} ${locHint}`);
    if (!country) continue;
    const bbox = COUNTRY_BBOX[country];
    if (!bbox && !city) continue;
    const lat = city?.lat ?? bbox![4];
    const lon = city?.lon ?? bbox![5];
    const sourceUrl = String(a.url ?? "").trim();
    const imageUrl = String(a.imageUrl ?? a.image ?? a.thumbImage ?? "").trim();

    points.push({
      id: `eventreg-${a.uri ?? `${country}-${ts}-${points.length + 1}`}`,
      layer: "news",
      title: city
        ? `${descriptor.shortLabel} near ${city.city}`
        : `${descriptor.shortLabel} in ${country}`,
      subtitle: sourceTitle || sourceUri || "Event Registry source",
      lat,
      lon,
      country: normalizeCountryLabel(country),
      severity: city ? "high" : "medium",
      source: "Event Registry",
      timestamp: new Date(ts).toISOString(),
      magnitude: city ? 8 : 5,
      confidence: trusted ? (city ? 0.78 : 0.7) : city ? 0.64 : 0.56,
      imageUrl: imageUrl || undefined,
      metadata: {
        event_type: descriptor.eventType,
        short_label: descriptor.shortLabel,
        publisher: sourceTitle || sourceUri || "unknown",
        source_url: sourceUrl || null,
        image_url: imageUrl || null,
        original_headline: title,
        trusted_source: trusted,
      },
    });
  }

  return {
    points: dedupeEventPoints(points, 1).slice(0, 3000),
    health: {
      provider: "Event Registry",
      ok: points.length > 0,
      updatedAt: new Date().toISOString(),
      latencyMs: Date.now() - started,
      message: `Mapped ${points.length} event-level trusted-source reports (multi-page)`,
    },
  };
}

function buildActiveConflictCountries(
  liveStrikes: IntelPoint[],
  conflicts: IntelPoint[],
  news: IntelPoint[],
  allowCuratedFallback = false
): ActiveConflictCountry[] {
  const byCountry = new Map<
    string,
    { score: number; latestEventAt: string; sources: Set<string>; signals: IntelPoint[] }
  >();

  const push = (p: IntelPoint, weight: number) => {
    if (!p.country) return;
    const country = canonicalConflictCountry(p.country);
    if (COUNTRY_HIGHLIGHT_DENYLIST.has(country)) return;
    const current = byCountry.get(country) ?? {
      score: 0,
      latestEventAt: p.timestamp,
      sources: new Set<string>(),
      signals: [],
    };
    const sevScore =
      p.severity === "critical" ? 4 : p.severity === "high" ? 3 : p.severity === "medium" ? 2 : 1;
    current.score += sevScore * weight;
    current.sources.add(p.source);
    current.signals.push(p);
    if (p.timestamp > current.latestEventAt) current.latestEventAt = p.timestamp;
    byCountry.set(country, current);
  };

  const isWarLike = (p: IntelPoint): boolean => {
    const text = `${p.title} ${p.subtitle ?? ""} ${String(p.metadata?.event_type ?? "")}`.toLowerCase();
    if (WAR_LIKE_KEYWORDS.some((k) => text.includes(k))) return true;
    if (p.source === "UCDP") return true;
    if (p.source === "ACLED ArcGIS") {
      const battles = Number(p.metadata?.battles ?? 0);
      const explosions = Number(p.metadata?.explosions ?? 0);
      const civilians = Number(p.metadata?.civilians ?? 0);
      const fatalities = Number(p.metadata?.fatalities ?? 0);
      const protests = Number(p.metadata?.protests ?? 0);
      const riots = Number(p.metadata?.riots ?? 0);
      const hardConflict = battles + explosions + civilians + riots;
      return hardConflict >= 3 && fatalities >= 1 && protests <= 12;
    }
    return false;
  };

  for (const p of liveStrikes) {
    if (isWarLike(p)) push(p, 3.1);
  }
  for (const p of conflicts) {
    if (isWarLike(p)) push(p, 2.8);
  }
  for (const p of news) {
    if (isWarLike(p)) push(p, 0.9);
  }

  const computed = Array.from(byCountry.entries())
    .map(([country, v]) => ({
      country,
      score: Number(v.score.toFixed(2)),
      severity: rankSignalSeverity(v.signals),
      latestEventAt: v.latestEventAt,
      sources: Array.from(v.sources).slice(0, 6),
    }))
    .filter(
      (c) =>
        c.score >= 7 &&
        ACTIVE_CONFLICT_HIGHLIGHT_ALLOWLIST.has(canonicalConflictCountry(c.country))
    )
    .sort((a, b) => b.score - a.score)
    .slice(0, 45);

  if (computed.length === 0 && allowCuratedFallback) {
    const nowIso = new Date().toISOString();
    for (const warCountry of CURATED_CONFLICT_FALLBACK) {
      computed.push({
        country: warCountry,
        score: 2.2,
        severity: "low",
        latestEventAt: nowIso,
        sources: ["Curated fallback (dynamic adapters sparse)"],
      });
    }
  }

  return computed
    .filter((c) => !isCountryHighlightDenied(c.country))
    .sort((a, b) => b.score - a.score)
    .slice(0, 35);
}

function buildEscalationRiskCountries(
  liveStrikes: IntelPoint[],
  conflicts: IntelPoint[],
  news: IntelPoint[]
): EscalationRiskCountry[] {
  const now = Date.now();
  const recentCutoff = now - 24 * 3600_000;
  const earlierCutoff = now - 72 * 3600_000;
  const buckets = new Map<
    string,
    { recent: number; earlier: number; latest: string; signals: Set<string> }
  >();

  const push = (p: IntelPoint, weight: number) => {
    if (!p.country) return;
    const key = canonicalConflictCountry(p.country);
    if (COUNTRY_HIGHLIGHT_DENYLIST.has(key)) return;
    const ts = Date.parse(p.timestamp);
    if (!Number.isFinite(ts) || ts < earlierCutoff) return;
    const current = buckets.get(key) ?? {
      recent: 0,
      earlier: 0,
      latest: p.timestamp,
      signals: new Set<string>(),
    };
    if (ts >= recentCutoff) current.recent += weight;
    else current.earlier += weight;
    current.signals.add(p.source);
    if (p.timestamp > current.latest) current.latest = p.timestamp;
    buckets.set(key, current);
  };

  for (const p of liveStrikes) push(p, 2.6);
  for (const p of conflicts) push(p, 1.7);
  for (const p of news) push(p, 1.1);

  return Array.from(buckets.entries())
    .map(([country, b]) => {
      const trendRatio = b.earlier > 0 ? b.recent / b.earlier : b.recent > 0 ? 2 : 0;
      const trend: EscalationRiskCountry["trend"] =
        trendRatio >= 1.35 ? "rising" : trendRatio <= 0.75 ? "declining" : "stable";
      const riskScore = Number((b.recent * 1.4 + b.earlier * 0.6).toFixed(2));
      const severity: EscalationRiskCountry["severity"] =
        riskScore >= 14 ? "critical" : riskScore >= 8 ? "high" : riskScore >= 4 ? "medium" : "low";
      return {
        country,
        riskScore,
        severity,
        trend,
        latestEventAt: b.latest,
        signals: Array.from(b.signals).slice(0, 6),
      };
    })
    .filter((c) => !isCountryHighlightDenied(c.country))
    .filter((c) => c.trend === "rising" && c.riskScore >= 4)
    .sort((a, b) => b.riskScore - a.riskScore)
    .slice(0, 45);
}

async function fetchRapidConflictSignals(rangeHours: number): Promise<{
  points: IntelPoint[];
  health: ProviderHealth;
}> {
  const started = Date.now();
  const rapidQueries = [
    "(airstrike OR missile strike OR bombardment OR drone strike OR explosion OR artillery OR battle OR naval clash OR interception OR border clash OR infiltration OR standoff) (Ukraine OR Russia OR Israel OR Gaza OR Iran OR Sudan OR Yemen OR Syria OR Lebanon OR Red Sea OR Gulf OR Saudi OR UAE OR Qatar OR Oman OR Somalia)",
    "(missile OR air raid OR shelling OR rocket fire OR precision strike) (Kharkiv OR Kyiv OR Odesa OR Zaporizhzhia OR Donetsk OR Luhansk OR Kherson OR Rafah OR Gaza OR Tehran OR Isfahan OR Sanaa OR Khartoum)",
    "(warship OR frigate OR destroyer OR carrier strike group OR naval task force OR anti-ship missile) (Red Sea OR Bab el-Mandeb OR Gulf of Oman OR Persian Gulf OR Black Sea OR Mediterranean)",
    "(skirmish OR clashes OR firefight OR cross-border strike OR incursion) (Lebanon OR Syria OR Iraq OR Somalia OR Sahel OR Kashmir OR Myanmar)",
    "(war OR conflict OR military operation OR missile OR drone OR artillery OR naval) (Middle East OR Europe OR Africa OR Asia)",
    "Ukraine Russia strike OR shelling OR missile OR drone",
    "Kharkiv OR Odesa OR Zaporizhzhia OR Kherson OR Donetsk strike OR attack OR bombardment",
    "Kyiv OR Dnipro OR Mykolaiv OR Sumy OR Chernihiv missile OR raid OR explosion",
    "Donbas OR Bakhmut OR Avdiivka OR Kramatorsk OR Severodonetsk fighting OR frontline",
    "Iran Israel strike OR missile OR drone OR attack",
    "Tehran OR Isfahan OR Bushehr strike OR explosion OR nuclear",
    "Iran drone OR ballistic missile OR interception",
    ...IRAN_SPECIFIC_RAPID_QUERIES,
    ...SUDAN_SPECIFIC_RAPID_QUERIES,
    ...MYANMAR_SPECIFIC_RAPID_QUERIES,
    ...MENA_SOUTHASIA_RAPID_QUERIES,
  ];
  try {
    const cutoff = Date.now() - rangeHours * 3600_000;
    const warContextRe =
      /\b(war|conflict|military operation|missile|strike|air raid|drone|shelling|artillery|battle|skirmish|clashes|firefight|interception|offensive|naval|incursion|cross-border)\b/i;
    const clusters = new Map<
      string,
      {
        latestTs: number;
        title: string;
        country: string;
        lat: number;
        lon: number;
        keyword: string;
        imageUrl: string | null;
        publishers: Set<string>;
        evidence: string[];
      }
    >();
    let failedQueries = 0;
    let totalItems = 0;
    let conflictCandidates = 0;
    let geoMapped = 0;

    for (const rawQuery of rapidQueries) {
      const encoded = encodeURIComponent(rawQuery);
      const urls = buildGoogleNewsRssUrls(encoded);
      const fetchRes = await fetchTextWithRetries(urls, 12000, 2);
      if (!fetchRes.ok || !fetchRes.text) {
        failedQueries += 1;
        continue;
      }
      const itemBlocks = fetchRes.text.split("<item>").slice(1, 2200);
      totalItems += itemBlocks.length;

      for (const block of itemBlocks) {
        const title = extractRssTag(block, "title");
        const description = extractRssTag(block, "description") ?? "";
        const imageUrl = extractRssImageUrl(block);
        const pubRaw = extractRssTag(block, "pubDate");
        if (!title) continue;
        const ts = pubRaw ? new Date(pubRaw).getTime() : Date.now();
        if (!Number.isFinite(ts) || ts < cutoff) continue;

        const fullText = `${title} ${description}`;
        const descriptor = classifyEvent(fullText);
        const likelyConflict = descriptor.isConflict || warContextRe.test(fullText);
        if (!likelyConflict) continue;
        conflictCandidates += 1;

        const allCities = extractAllMentionedCities(fullText);
        const region = extractRegionFallback(fullText);
        const countryFromText = extractMentionedCountry(fullText) || region?.country;
        const locations: Array<{ lat: number; lon: number; country: string; city: string | null }> = [];
        if (allCities.length > 0) {
          for (const c of allCities) locations.push({ lat: c.lat, lon: c.lon, country: c.country, city: c.city });
        } else if (countryFromText) {
          const theaterFallback = expandPriorityCountryFallbackLocations(
            countryFromText,
            `${title} ${description}`,
            4
          );
          if (theaterFallback.length > 0) locations.push(...theaterFallback);
          const bbox = COUNTRY_BBOX[countryFromText];
          if ((bbox || region) && locations.length === 0)
            locations.push({
              lat: region?.lat ?? bbox![4],
              lon: region?.lon ?? bbox![5],
              country: countryFromText,
              city: null,
            });
        }
        if (locations.length === 0) continue;
        geoMapped += locations.length;
        const publisher = extractPublisherFromTitle(title);
        const trusted = isTrustedPublisher(publisher);
        for (let locIdx = 0; locIdx < locations.length; locIdx += 1) {
          const loc = locations[locIdx];
          const clusterKey = `${loc.country}|${loc.city ?? "country"}|${descriptor.eventType}|${normalizeHeadlineForCluster(title)}|${locIdx}`;
          const current = clusters.get(clusterKey) ?? {
            latestTs: ts,
            title,
            country: loc.country,
            lat: loc.lat,
            lon: loc.lon,
            keyword: descriptor.shortLabel,
            imageUrl: imageUrl || null,
            publishers: new Set<string>(),
            evidence: [],
          };
          current.latestTs = Math.max(current.latestTs, ts);
          current.publishers.add(publisher);
          if (!current.imageUrl && imageUrl) current.imageUrl = imageUrl;
          if (current.evidence.length < 4) current.evidence.push(title);
          clusters.set(clusterKey, current);
        }
      }
    }

    const points: IntelPoint[] = [];
    for (const [key, c] of clusters.entries()) {
      const corroboration = c.publishers.size;
      const trusted = isTrustedPublisher(Array.from(c.publishers).join(" "));
      const norm = Math.min(1, corroboration / 4);
      points.push({
        id: `rapid-${key}`,
        layer: "liveStrikes",
        title: c.title,
        subtitle: `${c.keyword} | ${corroboration} source(s)`,
        lat: c.lat,
        lon: c.lon,
        country: c.country,
        severity: corroboration >= 3 ? "critical" : corroboration >= 2 || trusted ? "high" : "medium",
        source: "Rapid conflict monitor",
        timestamp: new Date(c.latestTs).toISOString(),
        magnitude: corroboration >= 2 ? 12 + corroboration * 3 : trusted ? 10 : 8,
        confidence: corroboration >= 2 ? 0.5 + norm * 0.35 : trusted ? 0.6 : 0.45,
        imageUrl: c.imageUrl || undefined,
        metadata: {
          event_type: c.keyword.toLowerCase().replace(/\s+/g, "_"),
          short_label: c.keyword,
          corroborating_sources: corroboration,
          top_publishers: Array.from(c.publishers).slice(0, 3).join(", "),
          sample_event: c.evidence[0] ?? "",
          image_url: c.imageUrl,
          trusted_source: trusted,
        },
      });
    }

    return {
      points: dedupeEventPoints(points, 1).slice(0, 5200),
      health: {
        provider: "Rapid conflict feed",
        ok: points.length > 0,
        updatedAt: new Date().toISOString(),
        latencyMs: Date.now() - started,
        message:
          failedQueries > 0
            ? `Mapped ${points.length} near-live strike events (${failedQueries} feeds degraded, items ${totalItems}, conflict candidates ${conflictCandidates}, geocoded ${geoMapped})`
            : `Mapped ${points.length} near-live strike events (items ${totalItems}, conflict candidates ${conflictCandidates}, geocoded ${geoMapped})`,
      },
    };
  } catch (err) {
    return {
      points: [],
      health: {
        provider: "Rapid conflict feed",
        ok: false,
        updatedAt: new Date().toISOString(),
        latencyMs: Date.now() - started,
        message: err instanceof Error ? err.message : "Rapid feed failed",
      },
    };
  }
}

async function fetchNewsSignals(rangeHours: number): Promise<{
  points: IntelPoint[];
  health: ProviderHealth;
}> {
  const started = Date.now();
  const queries = [
    "(missile OR strike OR explosion OR bombing OR shelling OR artillery OR drone strike OR battle OR offensive OR invasion OR raid)",
    "(Ukraine OR Iran OR Israel OR Gaza OR Sudan OR Yemen OR Syria OR Lebanon OR Red Sea) (strike OR battle OR explosion OR attack)",
    "(Zaporizhzhia OR Kharkiv OR Kyiv OR Kherson OR Donetsk OR Tehran OR Isfahan OR Khartoum OR Port Sudan OR Rafah) (missile OR strike OR explosion OR bombardment)",
    "(military operation OR battlefield update OR front line OR clashes) (Ukraine OR Israel OR Iran OR Sudan OR Yemen)",
    "(special operations OR interception OR air defense OR precision strike OR naval battle OR frigate OR destroyer) (Iran OR Israel OR Ukraine OR Russia OR Baltic Sea OR Red Sea)",
    "(drone attack OR ballistic missile OR cruise missile OR shelling OR raid) (Tel Aviv OR Tehran OR Kyiv OR Kharkiv OR Odesa OR Sanaa OR Damascus OR Beirut)",
    "(warship OR submarine OR fleet movement OR naval task force OR carrier strike group) (Gulf OR UAE OR Saudi Arabia OR Qatar OR Oman OR Red Sea)",
    "(border clash OR standoff OR infiltration OR skirmish) (India OR Pakistan OR China OR Taiwan OR Lebanon OR Syria)",
    "(jamming OR interception OR anti-air OR air defense OR SAM battery) (Iran OR Israel OR Ukraine OR Russia OR Saudi Arabia OR UAE)",
    "(special forces OR commandos OR covert raid OR sabotage) (Ukraine OR Russia OR Iran OR Israel OR Syria OR Lebanon)",
    "(carrier strike group OR naval flotilla OR amphibious ready group) (Mediterranean OR Red Sea OR Persian Gulf OR Arabian Sea)",
    "(submarine OR torpedo OR anti-ship missile OR maritime patrol aircraft) (Black Sea OR Red Sea OR Gulf of Oman OR Arabian Sea)",
    "(frontline update OR trench warfare OR artillery duel OR cross-border shelling) (Donetsk OR Luhansk OR Zaporizhzhia OR Kherson OR Kharkiv)",
    "(Houthi OR Hezbollah OR IRGC OR Wagner OR ISIS OR Al Shabaab) (attack OR clash OR strike OR ambush)",
    "(Somalia OR Afghanistan OR Pakistan OR Kashmir OR Myanmar OR Sahel) (battle OR offensive OR raid OR clash)",
    "(UAE OR Saudi Arabia OR Qatar OR Bahrain OR Kuwait OR Oman) (missile OR interception OR naval movement OR air operation)",
    "(ceasefire collapse OR renewed fighting OR heavy clashes OR mass casualty) (Ukraine OR Gaza OR Sudan OR Yemen OR Syria OR Lebanon)",
    "(drone swarm OR loitering munition OR anti-ship missile OR precision-guided munition) (Black Sea OR Red Sea OR Persian Gulf OR Gulf of Aden OR Arabian Sea)",
    "(airport strike OR airbase strike OR military depot blast OR ammunition depot explosion) (Ukraine OR Russia OR Iran OR Israel OR Syria OR Iraq)",
    "(insurgent attack OR convoy ambush OR IED blast OR militant raid) (Somalia OR Sahel OR Nigeria OR Mali OR Niger OR Burkina Faso OR Afghanistan)",
    "(naval interception OR maritime interdiction OR shipping attack OR tanker attack) (Hormuz OR Bab el-Mandeb OR Red Sea OR Gulf of Oman OR Mediterranean)",
    "(ballistic missile launch OR hypersonic missile OR cruise missile launch OR air defense intercept) (Iran OR Israel OR Russia OR Ukraine OR North Korea)",
    "(cross-border artillery OR border firefight OR tactical withdrawal OR assault brigade) (India OR Pakistan OR Armenia OR Azerbaijan OR Lebanon OR Syria)",
    "(fighter jet scramble OR strategic bomber patrol OR ISR flight OR military transport aircraft) (Baltic Sea OR Black Sea OR Pacific OR Taiwan Strait)",
    "(special operation forces OR urban combat OR trench assault OR artillery barrage) (Donbas OR Zaporizhzhia OR Kherson OR Bakhmut OR Avdiivka)",
    "(port strike OR naval base strike OR harbor attack OR dry dock damage) (Sevastopol OR Odesa OR Tartus OR Latakia OR Haifa OR Hodeidah)",
    "(counteroffensive OR defensive line breach OR frontline advance OR encirclement) (Ukraine OR Sudan OR Myanmar OR Syria)",
    "(satellite imagery confirms strike OR geolocated strike footage OR verified battlefield footage) (Ukraine OR Gaza OR Sudan OR Syria OR Yemen)",
    "Ukraine war Russia strike 7 days",
    "Kharkiv Odesa Zaporizhzhia Kherson missile drone",
    "Kyiv Dnipro Mykolaiv Sumy Chernihiv attack",
    "Donbas Bakhmut Avdiivka Kramatorsk Severodonetsk frontline",
    "Iran Israel strike missile drone",
    "Tehran Isfahan Bushehr Iran attack",
    "Iran nuclear Bushehr projectile",
    ...MENA_SOUTHASIA_NEWS_QUERIES,
    ...MYANMAR_NEWS_QUERIES,
  ];
  const eventKeywords = [
    "missile",
    "strike",
    "explosion",
    "bomb",
    "bombard",
    "drone",
    "artillery",
    "shelling",
    "battle",
    "offensive",
    "invasion",
    "raid",
    "clash",
    "front line",
    "interception",
    "standoff",
    "submarine",
    "warship",
    "carrier",
    "frigate",
    "destroyer",
    "air defense",
    "jamming",
    "torpedo",
    "ambush",
    "infiltration",
    "sabotage",
    "anti-ship",
    "carrier strike group",
    "commandos",
    "rocket fire",
    "air raid",
    "convoy",
    "militant",
    "insurgent",
    "frontline",
    "cross-border",
    "barrage",
    "war",
    "battlefield",
    "airbase",
    "launcher",
    "warhead",
    "salvo",
    "tanker",
    "frigate",
    "destroyer",
    "patrol boat",
    "maritime",
    "shipping attack",
    "naval interception",
    "hormuz",
    "balochistan",
  ];
  const warContextRe =
    /\b(war|frontline|battlefield|cross-border|air raid|missile|strike|shelling|bombardment|drone attack|naval clash|skirmish|clashes|firefight|offensive|counteroffensive|insurgent|militant)\b/i;
  try {
    const points: IntelPoint[] = [];
    const seen = new Set<string>();
    const cutoff = Date.now() - rangeHours * 3600_000;
    let fetchErrors = 0;

    for (const rawQuery of queries) {
      const query = encodeURIComponent(rawQuery);
      const urls = buildGoogleNewsRssUrls(query);
      const fetchRes = await fetchTextWithRetries(urls, 12000, 2);
      if (!fetchRes.ok || !fetchRes.text) {
        fetchErrors += 1;
        continue;
      }
      const text = fetchRes.text;

      const itemBlocks = text.split("<item>").slice(1, 2600);

      for (let i = 0; i < itemBlocks.length; i += 1) {
        const block = itemBlocks[i];
        const title = extractRssTag(block, "title");
        const description = extractRssTag(block, "description") ?? "";
        const imageUrl = extractRssImageUrl(block);
        const pubRaw = extractRssTag(block, "pubDate");
        if (!title) continue;
        const pubDate = pubRaw ? new Date(pubRaw).getTime() : Date.now();
        if (Number.isNaN(pubDate) || pubDate < cutoff) continue;

        const fullText = `${title} ${description}`;
        const lower = fullText.toLowerCase();
        if (!eventKeywords.some((k) => lower.includes(k)) && !warContextRe.test(fullText)) continue;

        const descriptor = classifyEvent(fullText);
        const likelyConflict = descriptor.isConflict || warContextRe.test(fullText);
        if (!likelyConflict) continue;
        const allCities = extractAllMentionedCities(fullText);
        const region = extractRegionFallback(fullText);
        const countryFromText = extractMentionedCountry(fullText) || region?.country;
        const locations: Array<{ lat: number; lon: number; country: string; city: string | null }> = [];
        if (allCities.length > 0) {
          for (const c of allCities) locations.push({ lat: c.lat, lon: c.lon, country: c.country, city: c.city });
        } else if (countryFromText) {
          const theaterFallback = expandPriorityCountryFallbackLocations(
            countryFromText,
            `${title} ${description}`,
            3
          );
          if (theaterFallback.length > 0) locations.push(...theaterFallback);
          const bbox = COUNTRY_BBOX[countryFromText];
          if ((bbox || region) && locations.length === 0) {
            locations.push({
              lat: region?.lat ?? bbox![4],
              lon: region?.lon ?? bbox![5],
              country: countryFromText,
              city: null,
            });
          }
        }
        if (locations.length === 0) continue;
        const publisher = extractPublisherFromTitle(title);
        const trusted = isTrustedPublisher(`${publisher} ${title}`);
        const timeBucket = Math.floor(pubDate / 3600_000);
        const snippet = description.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 360);
        for (let locIdx = 0; locIdx < locations.length; locIdx += 1) {
          const loc = locations[locIdx];
          const dedupeKey = `${normalizeHeadlineForCluster(title)}|${loc.country}|${loc.city ?? ""}|${timeBucket}|${locIdx}`;
          if (seen.has(dedupeKey)) continue;
          seen.add(dedupeKey);
          points.push({
            id: `news-event-${i}-${loc.country}-${pubDate}-${locIdx}-${seen.size}`,
            layer: "news",
            title: loc.city
              ? `${descriptor.shortLabel || "Conflict event"} near ${loc.city}`
              : `${descriptor.shortLabel || "Conflict event"} in ${loc.country}`,
            subtitle: `${publisher} headline`,
            lat: loc.lat,
            lon: loc.lon,
            country: loc.country,
            severity: loc.city ? "high" : "medium",
            source: "Google News RSS",
            timestamp: new Date(pubDate).toISOString(),
            magnitude: loc.city ? 8 : 5,
            confidence: trusted ? (loc.city ? 0.76 : 0.64) : loc.city ? 0.66 : 0.54,
            imageUrl: imageUrl || undefined,
            metadata: {
              event_type: descriptor.eventType || "conflict_event",
              short_label: descriptor.shortLabel || "Conflict event",
              publisher,
              original_headline: title,
              city: loc.city,
              trusted_source: trusted,
              image_url: imageUrl || null,
              source_snippet: snippet,
            },
          });
        }
      }
    }

    points.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    return {
      points: points.slice(0, 12800),
      health: {
        provider: "Google News RSS",
        ok: points.length > 0,
        updatedAt: new Date().toISOString(),
        latencyMs: Date.now() - started,
        message:
          fetchErrors > 0
            ? `Mapped ${points.length} event-level headlines (${fetchErrors} query feeds degraded)`
            : `Mapped ${points.length} event-level geocoded headlines`,
      },
    };
  } catch (err) {
    return {
      points: [],
      health: {
        provider: "Google News RSS",
        ok: false,
        updatedAt: new Date().toISOString(),
        latencyMs: Date.now() - started,
        message: err instanceof Error ? err.message : "News fetch failed",
      },
    };
  }
}

const USNI_REGION_HINTS: Array<{
  label: string;
  country: string;
  lat: number;
  lon: number;
  re: RegExp;
}> = [
  { label: "North Atlantic", country: "Iceland", lat: 64.7, lon: -18.6, re: /\b(north atlantic|atlantic)\b/i },
  { label: "Eastern Mediterranean", country: "Cyprus", lat: 34.9, lon: 33.1, re: /\b(eastern med|eastern mediterranean|mediterranean)\b/i },
  { label: "Black Sea", country: "Romania", lat: 43.0, lon: 35.2, re: /\bblack sea\b/i },
  { label: "Red Sea", country: "Yemen", lat: 17.6, lon: 40.4, re: /\bred sea\b/i },
  { label: "Gulf of Aden", country: "Yemen", lat: 12.2, lon: 49.2, re: /\bgulf of aden\b/i },
  { label: "Arabian Sea", country: "Oman", lat: 19.0, lon: 62.5, re: /\barabian sea\b/i },
  { label: "Persian Gulf", country: "United Arab Emirates", lat: 26.2, lon: 52.3, re: /\b(persian gulf|arabian gulf|gulf)\b/i },
  { label: "Gulf of Oman", country: "Oman", lat: 24.8, lon: 58.8, re: /\bgulf of oman\b/i },
  { label: "South China Sea", country: "Philippines", lat: 14.6, lon: 114.7, re: /\bsouth china sea\b/i },
  { label: "Philippine Sea", country: "Philippines", lat: 18.0, lon: 132.0, re: /\bphilippine sea\b/i },
  { label: "Western Pacific", country: "Japan", lat: 25.0, lon: 142.0, re: /\bwestern pacific\b/i },
  { label: "Baltic Sea", country: "Sweden", lat: 58.8, lon: 20.5, re: /\bbaltic sea\b/i },
];

function inferUsniRegions(text: string): Array<{
  label: string;
  country: string;
  lat: number;
  lon: number;
}> {
  const out: Array<{ label: string; country: string; lat: number; lon: number }> = [];
  for (const h of USNI_REGION_HINTS) {
    if (h.re.test(text)) out.push(h);
  }
  return out;
}

function dedupeVesselPoints(points: IntelPoint[]): IntelPoint[] {
  const byKey = new Map<string, IntelPoint>();
  for (const p of points) {
    // Looser dedupe to allow more "track-like" density for repeated AIS snapshots.
    const roundedLat = Math.round(p.lat / 0.1) * 0.1;
    const roundedLon = Math.round(p.lon / 0.1) * 0.1;
    const bucket = Math.floor(Date.parse(p.timestamp || new Date().toISOString()) / (2 * 3600_000));
    const objectId = [
      String(p.metadata?.mmsi ?? "").trim(),
      String(p.metadata?.imo ?? "").trim(),
      String(p.metadata?.callsign ?? "").trim().toUpperCase(),
      String(p.metadata?.hex ?? "").trim().toLowerCase(),
      String(p.metadata?.icao24 ?? "").trim().toLowerCase(),
    ]
      .filter(Boolean)
      .join("|");
    const key = `${objectId || (p.title || "").toLowerCase()}|${(p.country || "").toLowerCase()}|${roundedLat}|${roundedLon}|${bucket}`;
    const current = byKey.get(key);
    if (!current || p.timestamp > current.timestamp) byKey.set(key, p);
  }
  return Array.from(byKey.values()).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

function dedupeFlightPoints(points: IntelPoint[]): IntelPoint[] {
  const byKey = new Map<string, IntelPoint>();
  for (const p of points) {
    // Looser dedupe to allow "track-like" density without plotting exact repeats.
    const roundedLat = Math.round(p.lat / 0.06) * 0.06;
    const roundedLon = Math.round(p.lon / 0.06) * 0.06;
    const bucket = Math.floor(
      Date.parse(p.timestamp || new Date().toISOString()) / (30 * 60_000)
    );
    const icao = String(p.metadata?.icao24 ?? "").trim().toLowerCase();
    const callsign = String(p.metadata?.callsign ?? p.title ?? "")
      .trim()
      .toUpperCase();
    const key = `${icao || callsign}|${roundedLat}|${roundedLon}|${bucket}`;
    const current = byKey.get(key);
    if (!current || p.timestamp > current.timestamp) byKey.set(key, p);
  }
  return Array.from(byKey.values()).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

function dedupeTroopMovementPoints(points: IntelPoint[]): IntelPoint[] {
  const byKey = new Map<string, IntelPoint>();
  for (const p of points) {
    const roundedLat = Math.round(p.lat / 0.12) * 0.12;
    const roundedLon = Math.round(p.lon / 0.12) * 0.12;
    const bucket = Math.floor(
      Date.parse(p.timestamp || new Date().toISOString()) / (1 * 3600_000)
    );
    const sourcePointId = String(p.metadata?.source_point_id ?? "").trim().toLowerCase();
    const key = `${sourcePointId}|${roundedLat}|${roundedLon}|${bucket}`;
    const current = byKey.get(key);
    if (!current || p.timestamp > current.timestamp) byKey.set(key, p);
  }
  return Array.from(byKey.values()).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

function deriveTroopMovementPointsFromTransport(
  flights: IntelPoint[],
  vessels: IntelPoint[]
): IntelPoint[] {
  const TRANSPORT_AIRCRAFT_RE =
    /\b(C-?130|C-?17|A400|AN-?124|IL-?76|KC-?135|KC-?10|MRTT|AIRLIFT|TRANSPORT|ASSAULT)\b/i;
  const TROOP_TRANSPORT_VESSEL_RE =
    /\b(LHD|LPD|LST|LSV|LCAC|LHA|LPH|AMPHIB|ASSAULT|LANDING|LOGISTICS|SUPPLY|AOR|AKR|T-?AKR|T-?AO|TANKER)\b/i;

  const points: IntelPoint[] = [];
  const nowIso = new Date().toISOString();

  for (const f of flights) {
    const role = String(f.metadata?.aircraft_role ?? "");
    const callsign = String(f.metadata?.callsign ?? f.title ?? "");
    const isTransport = role === "Air force transport" || TRANSPORT_AIRCRAFT_RE.test(callsign);
    if (!isTransport) continue;

    const bumpedSeverity: IntelPoint["severity"] =
      f.severity === "medium" ? "high" : f.severity;

    points.push({
      id: `troop-move-flight-${f.id}-${points.length + 1}`,
      layer: "troopMovements",
      title: f.title || "Transport aircraft",
      subtitle: "Troop movement proxy (transport-like aircraft)",
      lat: f.lat,
      lon: f.lon,
      country: f.country,
      severity: bumpedSeverity,
      source: "AEGIS troop movement derivation (air)",
      timestamp: f.timestamp || nowIso,
      magnitude: (f.magnitude ?? 10) * 1.1,
      confidence: Math.min(0.95, (f.confidence ?? 0.6) + 0.1),
      metadata: {
        event_type: "troop_movement_proxy",
        source_point_id: f.id,
        source_point_layer: f.layer,
        source_point_role: role || null,
        source_url: String(f.metadata?.source_url ?? "").trim() || null,
      },
    });
  }

  for (const v of vessels) {
    const title = String(v.title ?? "");
    const inferred = Boolean(v.metadata?.inferred_military_movement);
    const isTroopVessel = inferred || TROOP_TRANSPORT_VESSEL_RE.test(title.toUpperCase());
    if (!isTroopVessel) continue;

    const bumpedSeverity: IntelPoint["severity"] =
      inferred || v.severity === "critical" ? "high" : v.severity;

    points.push({
      id: `troop-move-vessel-${v.id}-${points.length + 1}`,
      layer: "troopMovements",
      title: v.title || "Transport vessel",
      subtitle: "Troop movement proxy (transport-like vessel)",
      lat: v.lat,
      lon: v.lon,
      country: v.country,
      severity: bumpedSeverity,
      source: "AEGIS troop movement derivation (sea)",
      timestamp: v.timestamp || nowIso,
      magnitude: (v.magnitude ?? 10) * 1.05,
      confidence: inferred ? 0.72 : Math.min(0.9, (v.confidence ?? 0.6) + 0.08),
      metadata: {
        event_type: "troop_movement_proxy",
        source_point_id: v.id,
        source_point_layer: v.layer,
        inferred_military_movement: inferred,
        source_url: String(v.metadata?.source_url ?? "").trim() || null,
      },
    });
  }

  return dedupeTroopMovementPoints(points).slice(0, 6500);
}

async function fetchUsniFleetTrackerSignals(rangeHours: number): Promise<{
  points: IntelPoint[];
  health: ProviderHealth;
}> {
  const started = Date.now();
  const query = encodeURIComponent(
    'site:news.usni.org ("Fleet and Marine Tracker" OR "Fleet Tracker" OR "Naval Tracker")'
  );
  const url = `https://news.google.com/rss/search?q=${query}&hl=en-US&gl=US&ceid=US:en`;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 12000);
  try {
    const res = await fetch(url, { cache: "no-store", signal: ctl.signal });
    if (!res.ok) {
      return {
        points: [],
        health: {
          provider: "USNI Fleet Tracker",
          ok: false,
          updatedAt: new Date().toISOString(),
          latencyMs: Date.now() - started,
          message: `HTTP ${res.status}`,
        },
      };
    }
    const text = await res.text();
    const itemBlocks = text.split("<item>").slice(1, 400);
    const cutoff = Date.now() - rangeHours * 3600_000;
    const points: IntelPoint[] = [];
    for (const block of itemBlocks) {
      const title = extractRssTag(block, "title");
      if (!title) continue;
      const description = extractRssTag(block, "description") ?? "";
      const link = extractRssTag(block, "link");
      const imageUrl = extractRssImageUrl(block);
      const pubRaw = extractRssTag(block, "pubDate");
      const ts = pubRaw ? Date.parse(pubRaw) : Date.now();
      if (!Number.isFinite(ts) || ts < cutoff) continue;

      const textBlob = `${title} ${description}`;
      const regions = inferUsniRegions(textBlob);
      const shipMatch = textBlob.match(
        /\b(USS|USNS|HMS|HMCS|HMAS|ROKS|INS|PLAN)\s+[A-Z0-9\- ]{2,50}\b/
      );
      const shipHint = shipMatch?.[0]?.trim() || null;

      if (regions.length > 0) {
        for (const r of regions.slice(0, 7)) {
          points.push({
            id: `usni-vessel-${r.label}-${ts}-${points.length + 1}`,
            layer: "vessels",
            title: shipHint || `${r.label} naval presence`,
            subtitle: "USNI Fleet Tracker",
            lat: r.lat,
            lon: r.lon,
            country: r.country,
            severity: "medium",
            source: "USNI Fleet Tracker",
            timestamp: new Date(ts).toISOString(),
            magnitude: 12,
            confidence: 0.8,
            imageUrl: imageUrl || undefined,
            metadata: {
              region: r.label,
              source_url: link || null,
              image_url: imageUrl || null,
              ship_hint: shipHint,
            },
          });
        }
        continue;
      }

      const city = extractMentionedCity(textBlob);
      const country = city?.country || extractMentionedCountry(textBlob);
      if (!country) continue;
      const bbox = COUNTRY_BBOX[country];
      if (!bbox && !city) continue;
      points.push({
        id: `usni-vessel-${country}-${ts}-${points.length + 1}`,
        layer: "vessels",
        title: shipHint || `${country} naval movement`,
        subtitle: "USNI Fleet Tracker",
        lat: city?.lat ?? bbox![4],
        lon: city?.lon ?? bbox![5],
        country,
        severity: city ? "high" : "medium",
        source: "USNI Fleet Tracker",
        timestamp: new Date(ts).toISOString(),
        magnitude: city ? 13 : 10,
        confidence: city ? 0.82 : 0.72,
        imageUrl: imageUrl || undefined,
        metadata: {
          source_url: link || null,
          image_url: imageUrl || null,
          ship_hint: shipHint,
        },
      });
    }

    const deduped = dedupeVesselPoints(points).slice(0, 4500);
    return {
      points: deduped,
      health: {
        provider: "USNI Fleet Tracker",
        ok: deduped.length > 0,
        updatedAt: new Date().toISOString(),
        latencyMs: Date.now() - started,
        message: deduped.length
          ? `Mapped ${deduped.length} fleet tracker vessel signals`
          : "No fleet tracker vessel signals returned",
      },
    };
  } catch (err) {
    return {
      points: [],
      health: {
        provider: "USNI Fleet Tracker",
        ok: false,
        updatedAt: new Date().toISOString(),
        latencyMs: Date.now() - started,
        message: err instanceof Error ? err.message : "USNI fleet fetch failed",
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchVesselSignals(): Promise<{
  points: IntelPoint[];
  health: ProviderHealth;
}> {
  const snapshotUrlsRaw = process.env.AISSTREAM_SNAPSHOT_URLS?.trim();
  const snapshotUrlRawSingle = process.env.AISSTREAM_SNAPSHOT_URL?.trim();
  const snapshotUrlRaws = snapshotUrlsRaw
    ? snapshotUrlsRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : snapshotUrlRawSingle
      ? [snapshotUrlRawSingle]
      : [];

  if (snapshotUrlRaws.length === 0) {
    return {
      points: [],
      health: {
        provider: "AISStream",
        ok: false,
        updatedAt: new Date().toISOString(),
        message:
          "No AISSTREAM_SNAPSHOT_URLS (or AISSTREAM_SNAPSHOT_URL) configured. Add relay snapshot endpoint(s) for vessel positions.",
      },
    };
  }

  const allVessels: Array<{
    id?: string;
    lat?: number;
    lon?: number;
    name?: string;
    flag?: string;
    speed?: number;
    updatedAt?: string;
    ship_type?: number | string;
    ais_type?: number | string;
    ais_ship_type?: number | string;
    type?: number | string;
    shiptype?: number | string;
  }> = [];
  let relayFetchOkCount = 0;
  let relayFetchErrCount = 0;
  let relayLatencyMs: number | undefined = undefined;

  for (const snapshotUrlRaw of snapshotUrlRaws) {
    const snapshotUrl = /^https?:\/\//i.test(snapshotUrlRaw)
      ? snapshotUrlRaw
      : `https://${snapshotUrlRaw}`;
    let parsedUrl: URL | null = null;
    try {
      parsedUrl = new URL(snapshotUrl);
      if (parsedUrl.pathname === "/" || parsedUrl.pathname === "") {
        parsedUrl.pathname = "/snapshot";
      }
    } catch {
      parsedUrl = null;
    }
    if (!parsedUrl) {
      relayFetchErrCount += 1;
      continue;
    }

    const res = await timedJsonFetch<{
      vessels?: Array<{
        id?: string;
        lat?: number;
        lon?: number;
        name?: string;
        flag?: string;
        speed?: number;
        updatedAt?: string;
        ship_type?: number | string;
        ais_type?: number | string;
        ais_ship_type?: number | string;
        type?: number | string;
        shiptype?: number | string;
      }>;
    }>(parsedUrl.toString(), undefined, 12000);

    if (!res.ok || !res.data) {
      relayFetchErrCount += 1;
      continue;
    }

    relayFetchOkCount += 1;
    relayLatencyMs = res.latencyMs;
    allVessels.push(...(res.data.vessels ?? []));
  }

  const vessels = allVessels;
  const GOV_VESSEL_RE =
    /\b(USS|USNS|USCGC|HMS|HMCS|HMAS|ROKS|INS|PLAN|NAVE|ARMADA|MARINA|NAVY|COAST\s*GUARD|GUARDIA|CGC|CG-|PATROL|CORVETTE|FRIGATE|DESTROYER|CRUISER|CARRIER|BATTLESHIP|AMPHIB|WARSHIP|SUBMARINE|FLEET|TASK\s*FORCE|LHD|LPD|LST|LSV|LCAC|LHA|LPH|AOR|AOE|AKR|T-?AKR|T-?AO|MCM|LCC)\b/i;
  const GOV_FLAG_HINT_RE =
    /\b(NAVY|COAST\s*GUARD|GOVERNMENT|MILITARY|STATE|DEFENCE|DEFENSE|MINISTRY|ARMADA|MARINA|SECURITY)\b/i;
  const points: IntelPoint[] = [];
  for (const v of vessels) {
    const lat = Number(v.lat);
    const lon = Number(v.lon);
    if (Number.isNaN(lat) || Number.isNaN(lon)) continue;
    const name = v.name?.trim() || "";
    const flag = v.flag?.trim() || "";
    const speed = Number(v.speed) || 0;
    const hasUnknownName = !name || /\b(unknown|n\/a|none)\b/i.test(name);
    const hasUnknownFlag = !flag || /\b(unknown|n\/a|none)\b/i.test(flag);
    const govByName = GOV_VESSEL_RE.test(name);
    const govByFlag = GOV_FLAG_HINT_RE.test(flag);

    // Your AIS relay currently only returns basic vessel fields (no IMO/type),
    // so we approximate "military-like" with name/flag patterns + movement.
    const inferredMilitaryMovement =
      speed >= 8 && (govByName || govByFlag || hasUnknownName || hasUnknownFlag);

    // Plot more vessels for density: include all relay contacts (your relay returns limited fields,
    // so we primarily use name patterns + speed heuristics for confidence, not for inclusion).
    const isInterestingVessel = true;
    if (!isInterestingVessel) continue;

    const aisShipTypeRaw =
      v.ship_type ?? v.ais_type ?? v.ais_ship_type ?? v.type ?? v.shiptype ?? null;
    const aisShipTypeCode =
      aisShipTypeRaw === null || aisShipTypeRaw === undefined
        ? null
        : (() => {
            const n =
              typeof aisShipTypeRaw === "number"
                ? aisShipTypeRaw
                : Number(String(aisShipTypeRaw).trim());
            if (!Number.isFinite(n)) return null;
            const code = Math.floor(n);
            return code >= 0 && code <= 99 ? code : null;
          })();
    const aisLabel = aisShipTypeCodeToLabel(aisShipTypeCode);

    const inferredPurpose = inferVesselPurposeFromName(name);
    const inferredVesselClass = inferVesselClassFromName(name);
    // Prefer AIS type when it's available (commercial traffic is often name-only on relays).
    // Still allow naval keywords to override.
    const vesselClass =
      govByName || govByFlag
        ? inferredVesselClass
        : aisLabel ?? inferredVesselClass;
    const purpose = inferredPurpose;
    const flagCountry = mapAISFlagToCountry(flag);
    const mmsiCountry = countryFromMmsi(String(v.id ?? "").trim());
    const nameCountry = countryFromNavalOrCommercialName(name);
    const geoCountry = inferCountryFromLatLon(lat, lon);
    const country = flagCountry ?? mmsiCountry ?? nameCountry ?? geoCountry;
    points.push({
      id: `vessel-${v.id ?? `${lat}-${lon}`}`,
      layer: "vessels",
      title: name || "Government vessel",
      subtitle: `${vesselClass}${purpose ? ` • ${purpose}` : ""}${country ? ` • ${country}` : ""}${
        govByName || govByFlag ? " • military-like pattern" : ""
      } • AIS snapshot`,
      lat,
      lon,
      country,
      severity: mapSeverity(Math.min(1, speed / 25)),
      source: "AISStream relay",
      timestamp: v.updatedAt || new Date().toISOString(),
      magnitude: speed,
      confidence: govByName || govByFlag ? 0.7 : inferredMilitaryMovement ? 0.55 : 0.42,
      metadata: {
        country: country || null,
        vessel_class: vesselClass,
        vessel_category: purpose,
        purpose,
        ais_flag: flag || null,
        flag_country: flagCountry || null,
        mmsi_country: mmsiCountry || null,
        name_inferred_country: nameCountry || null,
        speed_knots: speed,
        inferred_military_movement: inferredMilitaryMovement,
        mmsi: String(v.id ?? "").trim() || null,
      },
    });
  }

  return {
    points: points.slice(0, 6500),
    health: {
      provider: "AISStream",
      ok: points.length > 0,
      updatedAt: new Date().toISOString(),
      latencyMs: relayLatencyMs,
      message: `Loaded ${points.length} government/military vessel positions (relays ok=${relayFetchOkCount}, err=${relayFetchErrCount})`,
    },
  };
}

const US_CARRIERS = [
  "USS GERALD R FORD",
  "USS GEORGE WASHINGTON",
  "USS HARRY S TRUMAN",
  "USS DWIGHT D EISENHOWER",
  "USS CARL VINSON",
  "USS NIMITZ",
  "USS THEODORE ROOSEVELT",
  "USS ABRAHAM LINCOLN",
  "USS RONALD REAGAN",
  "USS JOHN C STENNIS",
  "USS GEORGE H W BUSH",
  "CVN-68",
  "CVN-69",
  "CVN-70",
  "CVN-71",
  "CVN-72",
  "CVN-73",
  "CVN-74",
  "CVN-75",
  "CVN-76",
  "CVN-77",
  "CVN-78",
  "NIMITZ",
  "EISENHOWER",
  "VINSON",
  "ROOSEVELT",
  "LINCOLN",
  "WASHINGTON",
  "STENNIS",
  "TRUMAN",
  "REAGAN",
  "BUSH",
  "FORD",
];

const MIL_NAVAL_HINT_RE =
  /\b(USS|USNS|HMS|HMAS|ROKS|INS|PLAN|DDG|CG-|FFG|FRIGATE|DESTROYER|CRUISER|CARRIER)\b/i;

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function extractCarrierGroups(vesselPoints: IntelPoint[]): IntelPoint[] {
  const carriers = vesselPoints.filter((v) => {
    const title = (v.title || "").toUpperCase();
    if (US_CARRIERS.some((c) => title.includes(c))) return true;
    if (title.includes(" CARRIER")) return true;
    return false;
  });

  const escorts = vesselPoints.filter((v) => MIL_NAVAL_HINT_RE.test(v.title || ""));
  const nowIso = new Date().toISOString();
  const out: IntelPoint[] = [];

  for (const carrier of carriers) {
    const nearbyEscorts = escorts.filter(
      (e) =>
        e.id !== carrier.id &&
        haversineKm(carrier.lat, carrier.lon, e.lat, e.lon) <= 320
    );
    const groupSize = 1 + nearbyEscorts.length;
    out.push({
      id: `carrier-group-${carrier.id}`,
      layer: "carriers",
      title: carrier.title,
      subtitle:
        nearbyEscorts.length > 0
          ? `Likely carrier strike group (${nearbyEscorts.length} nearby escorts)`
          : "Carrier contact",
      lat: carrier.lat,
      lon: carrier.lon,
      country: carrier.country,
      severity: groupSize >= 5 ? "critical" : groupSize >= 3 ? "high" : "medium",
      source: "AIS naval group inference",
      timestamp: carrier.timestamp || nowIso,
      magnitude: Math.min(24, groupSize * 3),
      confidence: nearbyEscorts.length > 0 ? 0.8 : 0.62,
      metadata: {
        vessel_class: "Aircraft carrier (CVN / group)",
        carrier_group: "Carrier strike group",
        escorts_nearby: nearbyEscorts.length,
        grouped_units: groupSize,
      },
    });
  }

  if (out.length === 0) {
    const usNavalContacts = vesselPoints.filter((v) => {
      const title = (v.title || "").toUpperCase();
      const subtitle = (v.subtitle || "").toUpperCase();
      return (
        MIL_NAVAL_HINT_RE.test(title) &&
        (subtitle.includes("US") ||
          subtitle.includes("USA") ||
          title.includes("USS") ||
          title.includes("USNS"))
      );
    });

    const used = new Set<string>();
    for (const anchor of usNavalContacts) {
      if (used.has(anchor.id)) continue;
      const group = usNavalContacts.filter(
        (v) => haversineKm(anchor.lat, anchor.lon, v.lat, v.lon) <= 320
      );
      for (const g of group) used.add(g.id);
      if (group.length < 3) continue;
      out.push({
        id: `carrier-group-inferred-${anchor.id}`,
        layer: "carriers",
        title: "US naval task group (inferred)",
        subtitle: `${group.length} military naval contacts in formation window`,
        lat: anchor.lat,
        lon: anchor.lon,
        country: anchor.country,
        severity: group.length >= 6 ? "high" : "medium",
        source: "AIS naval group inference",
        timestamp: anchor.timestamp || nowIso,
        magnitude: Math.min(24, group.length * 2),
        confidence: 0.46,
        metadata: {
          vessel_class: "Naval task group (surface)",
          carrier_group: "Inferred task group",
          grouped_units: group.length,
          inference_mode: "task-group-cluster",
        },
      });
      if (out.length >= 25) break;
    }
  }

  return out.slice(0, 120);
}

const CURATED_BASES_URL =
  "https://raw.githubusercontent.com/koala73/worldmonitor/main/scripts/data/curated-bases.json";

const STRATEGIC_WATERWAYS: Array<{
  id: string;
  name: string;
  country: string;
  lat: number;
  lon: number;
}> = [
  { id: "hormuz", name: "Strait of Hormuz", country: "Oman", lat: 26.566, lon: 56.25 },
  { id: "bab-el-mandeb", name: "Bab el-Mandeb", country: "Yemen", lat: 12.592, lon: 43.33 },
  { id: "suez", name: "Suez Canal", country: "Egypt", lat: 30.7, lon: 32.34 },
  { id: "malacca", name: "Strait of Malacca", country: "Singapore", lat: 2.5, lon: 101.8 },
  { id: "taiwan-strait", name: "Taiwan Strait", country: "Taiwan", lat: 24.0, lon: 119.8 },
  { id: "bosphorus", name: "Bosphorus", country: "Turkey", lat: 41.1, lon: 29.08 },
  { id: "panama", name: "Panama Canal", country: "Panama", lat: 9.08, lon: -79.68 },
  { id: "giuk", name: "GIUK Gap", country: "Iceland", lat: 63.5, lon: -18.5 },
  { id: "gibraltar", name: "Strait of Gibraltar", country: "Spain", lat: 36.0, lon: -5.6 },
  { id: "dnipro-mouth", name: "Dnipro-Black Sea Access", country: "Ukraine", lat: 46.65, lon: 31.6 },
  { id: "english-channel", name: "English Channel", country: "United Kingdom", lat: 50.8, lon: 1.2 },
  { id: "lombok", name: "Lombok Strait", country: "Indonesia", lat: -8.45, lon: 115.9 },
];

async function fetchStrategicInfrastructure(): Promise<{
  points: IntelPoint[];
  health: ProviderHealth;
}> {
  const started = Date.now();
  const res = await timedJsonFetch<
    Array<{
      id?: string;
      name?: string;
      lat?: number;
      lon?: number;
      country?: string;
      type?: string;
      arm?: string;
      status?: string;
    }>
  >(CURATED_BASES_URL, undefined, 12000);

  const nowIso = new Date().toISOString();
  const points: IntelPoint[] = [];

  if (res.ok && res.data) {
    for (const b of res.data.slice(0, 5000)) {
      const lat = Number(b.lat);
      const lon = Number(b.lon);
      if (Number.isNaN(lat) || Number.isNaN(lon)) continue;
      const arm = b.arm?.trim() || "";
      points.push({
        id: `base-${b.id ?? `${lat}-${lon}`}`,
        layer: "infrastructure",
        title: b.name?.trim() || "Military base",
        subtitle: arm || "Military installation",
        lat,
        lon,
        country: b.country?.trim() || undefined,
        severity: b.status === "active" ? "high" : "medium",
        source: "Curated military bases",
        timestamp: nowIso,
        magnitude: 1,
        confidence: 0.76,
        metadata: {
          site_type: b.type?.trim() || "base",
          status: b.status?.trim() || "unknown",
          branch_or_unit: arm || "Unknown branch / tenant",
          unit_or_branch: arm || "Unknown branch / tenant",
        },
      });
    }
  }

  for (const w of STRATEGIC_WATERWAYS) {
    points.push({
      id: `waterway-${w.id}`,
      layer: "infrastructure",
      title: w.name,
      subtitle: "Strategic maritime chokepoint",
      lat: w.lat,
      lon: w.lon,
      country: w.country,
      severity: "high",
      source: "Strategic chokepoints",
      timestamp: nowIso,
      magnitude: 1.25,
      confidence: 0.9,
      metadata: {
        site_type: "waterway",
      },
    });
  }

  return {
    points,
    health: {
      provider: "Strategic sites",
      ok: points.length > 0,
      updatedAt: nowIso,
      latencyMs: Date.now() - started,
      message: points.length
        ? `Loaded ${points.length} bases and chokepoints`
        : "Failed to load strategic sites",
    },
  };
}

function buildHotspots(
  layers: Record<IntelLayerKey, IntelPoint[]>,
  countryCenters: Map<string, { lat: number; lon: number }>
): IntelPoint[] {
  const scoreByCountry = new Map<
    string,
    { score: number; sampleLat: number; sampleLon: number; latestTs: string }
  >();

  const push = (p: IntelPoint, weight: number) => {
    if (!p.country) return;
    const current = scoreByCountry.get(p.country) ?? {
      score: 0,
      sampleLat: p.lat,
      sampleLon: p.lon,
      latestTs: p.timestamp,
    };
    current.score += weight;
    if (p.timestamp > current.latestTs) {
      current.latestTs = p.timestamp;
      current.sampleLat = p.lat;
      current.sampleLon = p.lon;
    }
    scoreByCountry.set(p.country, current);
  };

  for (const p of layers.conflicts) push(p, 2.5);
  for (const p of layers.liveStrikes) push(p, 3.1);
  for (const p of layers.flights) push(p, 1.7);
  for (const p of layers.vessels) push(p, 1.4);
  for (const p of layers.carriers) push(p, 2.2);
  for (const p of layers.news) push(p, 0.6);
  for (const p of layers.escalationRisk) push(p, 1.9);
  for (const p of layers.infrastructure) push(p, 0.25);

  return Array.from(scoreByCountry.entries())
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, 35)
    .map(([country, s], i) => ({
      id: `hotspot-${country}-${i}`,
      layer: "hotspots",
      title: `${formatCountryDisplayName(country)} hotspot`,
      subtitle: "Composite cross-layer activity score",
      lat: (() => {
        const bbox = COUNTRY_BBOX[country];
        if (bbox) return bbox[4];
        return countryCenters.get(normalizeCountryKey(country))?.lat ?? s.sampleLat;
      })(),
      lon: (() => {
        const bbox = COUNTRY_BBOX[country];
        if (bbox) return bbox[5];
        return countryCenters.get(normalizeCountryKey(country))?.lon ?? s.sampleLon;
      })(),
      country: formatCountryDisplayName(country),
      severity: mapSeverity(Math.min(1, s.score / 50)),
      source: "AEGIS fusion",
      timestamp: s.latestTs,
      magnitude: Number(s.score.toFixed(2)),
      confidence: 0.72,
    }));
}

function fallbackUkraineFrontlineFeatureCollection(): Record<string, unknown> {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {
          theater: "Ukraine-Russia",
          overlay_type: "active_frontline_fallback",
        },
        geometry: {
          type: "MultiLineString",
          coordinates: [
            [
              [36.62, 50.06],
              [37.25, 49.85],
              [37.8, 49.55],
              [38.02, 49.1],
              [37.9, 48.7],
              [38.13, 48.5],
              [38.02, 48.08],
              [37.75, 47.75],
              [37.3, 47.46],
              [36.9, 47.2],
              [36.68, 46.88],
              [36.72, 46.56],
              [36.58, 46.32],
            ],
          ],
        },
      },
    ],
  };
}

async function fetchUkraineFrontlineOverlay(nowIso: string): Promise<{
  overlay: FrontlineOverlay;
  sourceState: "live" | "fallback";
}> {
  const live = await timedJsonFetch<{
    type?: string;
    features?: Array<{
      type?: string;
      properties?: Record<string, unknown>;
      geometry?: { type?: string; coordinates?: unknown };
    }>;
  }>(ISW_UKRAINE_FRONTLINE_GEOJSON_URL, undefined, 12000);

  if (live.ok && live.data?.type === "FeatureCollection" && Array.isArray(live.data.features)) {
    const lineFeatures = live.data.features.filter((f) => {
      const t = String(f?.geometry?.type ?? "");
      return t === "LineString" || t === "MultiLineString";
    });
    if (lineFeatures.length > 0) {
      const latestEpoch = lineFeatures.reduce((max, f) => {
        const v = Number(f?.properties?.Date ?? 0);
        return Number.isFinite(v) && v > max ? v : max;
      }, 0);
      const updatedAt = latestEpoch > 0 ? new Date(latestEpoch).toISOString() : nowIso;
      return {
        sourceState: "live",
        overlay: {
          id: "ukraine-frontline-isw-live",
          name: "Ukraine frontline (ISW/CTP)",
          theater: "Ukraine-Russia",
          updatedAt,
          confidence: 92,
          source: "ISW/CTP ArcGIS frontline layer",
          geojson: {
            type: "FeatureCollection",
            features: lineFeatures,
          },
        },
      };
    }
  }

  return {
    sourceState: "fallback",
    overlay: {
      id: "ukraine-frontline-fallback",
      name: "Ukraine frontline (fallback linework)",
      theater: "Ukraine-Russia",
      updatedAt: nowIso,
      confidence: 68,
      source: "Fallback linework (used when ISW/CTP feed is unavailable)",
      geojson: fallbackUkraineFrontlineFeatureCollection(),
    },
  };
}

async function buildFrontlineOverlays(): Promise<{
  overlays: FrontlineOverlay[];
  health: ProviderHealth;
}> {
  const nowIso = new Date().toISOString();
  const ukraine = await fetchUkraineFrontlineOverlay(nowIso);

  // Densify sparse linework so it renders smoothly as a boundary line.
  // (If upstream linework has few vertices, filled geometry can look "dotty".)
  const densifyLineCoords = (
    coords: Array<[number, number]>,
    pointsPerSegment: number
  ): Array<[number, number]> => {
    if (coords.length < 2) return coords;
    const out: Array<[number, number]> = [coords[0]];
    for (let i = 0; i < coords.length - 1; i += 1) {
      const [x1, y1] = coords[i];
      const [x2, y2] = coords[i + 1];
      for (let j = 1; j <= pointsPerSegment; j += 1) {
        const t = j / (pointsPerSegment + 1);
        out.push([x1 + (x2 - x1) * t, y1 + (y2 - y1) * t]);
      }
      out.push([x2, y2]);
    }
    return out;
  };

  const sudanRawLines: Array<Array<[number, number]>> = [
    [
      [22.5, 13.5],
      [23.5, 13.8],
      [24.4, 13.7],
      [25.2, 13.2],
      [25.0, 12.4],
      [24.2, 11.9],
      [23.3, 11.8],
    ],
    [
      [31.1, 15.3],
      [31.6, 15.0],
      [32.1, 14.8],
      [32.7, 14.5],
      [33.1, 14.0],
    ],
    [
      [32.9, 12.8],
      [33.3, 12.3],
      [33.8, 11.9],
      [34.4, 11.7],
    ],
  ];

  const sudanDensifiedLines = sudanRawLines.map((line) =>
    densifyLineCoords(line, 10)
  );
  const overlays: FrontlineOverlay[] = [
    ukraine.overlay,
    {
      id: "afpak-border-line",
      name: "Afghanistan-Pakistan Border",
      theater: "Afghanistan-Pakistan",
      updatedAt: nowIso,
      confidence: 86,
      source:
        "Afghanistan-Pakistan shared border geometry (country-adjacent edge extraction)",
      geojson: {
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: [
            [73.19184, 36.87703],
            [73.00229, 36.84612],
            [72.94586, 36.85222],
            [72.86773, 36.83041],
            [72.6296, 36.83295],
            [72.45411, 36.75796],
            [72.34621, 36.74489],
            [72.16968, 36.71135],
            [72.16462, 36.67006],
            [72.0961, 36.6389],
            [72.05041, 36.61864],
            [72.05496, 36.59286],
            [71.97703, 36.56304],
            [71.89972, 36.51834],
            [71.85859, 36.49416],
            [71.77456, 36.44842],
            [71.78263, 36.39654],
            [71.73632, 36.39592],
            [71.62915, 36.45953],
            [71.58874, 36.41845],
            [71.54719, 36.37163],
            [71.55835, 36.32786],
            [71.49582, 36.30962],
            [71.38244, 36.21857],
            [71.30901, 36.17273],
            [71.2623, 36.14612],
            [71.21263, 36.09682],
            [71.16592, 36.04571],
            [71.18189, 36.01884],
            [71.25744, 35.97155],
            [71.34157, 35.94726],
            [71.37133, 35.88515],
            [71.4644, 35.79472],
            [71.47102, 35.76133],
            [71.48135, 35.7341],
            [71.51536, 35.70149],
            [71.49592, 35.64661],
            [71.51277, 35.59628],
            [71.59349, 35.54936],
            [71.58171, 35.49313],
            [71.60072, 35.45546],
            [71.62088, 35.41014],
            [71.53158, 35.32792],
            [71.60321, 35.22338],
            [71.62925, 35.1701],
            [71.50895, 35.07202],
            [71.51132, 35.00872],
            [71.49344, 34.99414],
            [71.48538, 34.9835],
            [71.45996, 34.94267],
            [71.28948, 34.87503],
            [71.20307, 34.74816],
            [71.0806, 34.67292],
            [71.07626, 34.62362],
            [71.06582, 34.55846],
            [70.98583, 34.55619],
            [70.95699, 34.532],
            [70.97084, 34.46888],
            [71.05094, 34.38979],
            [71.09709, 34.26246],
            [71.10949, 34.18921],
            [71.07388, 34.12526],
            [71.06727, 34.07301],
            [70.99771, 34.03332],
            [70.95399, 34.00482],
            [70.89431, 34.00937],
            [70.86222, 33.96478],
            [70.52198, 33.9387],
            [70.32819, 33.95728],
            [70.21885, 33.98069],
            [69.91602, 34.03888],
            [69.87044, 34.00134],
            [69.85422, 33.95635],
            [69.87649, 33.90256],
            [69.90755, 33.83561],
            [69.94723, 33.77197],
            [69.99648, 33.74209],
            [70.10815, 33.7273],
            [70.13255, 33.66143],
            [70.16252, 33.64324],
            [70.17347, 33.60787],
            [70.15497, 33.50661],
            [70.18546, 33.46897],
            [70.22784, 33.43995],
            [70.30158, 33.35179],
            [70.10536, 33.18981],
            [70.048, 33.19407],
            [69.99472, 33.12733],
            [69.88093, 33.08925],
            [69.73298, 33.1093],
            [69.65878, 33.07842],
            [69.60834, 33.07907],
            [69.51419, 33.05669],
            [69.4685, 32.99429],
            [69.47145, 32.85223],
            [69.38716, 32.78534],
            [69.38324, 32.74446],
            [69.40773, 32.72994],
            [69.4191, 32.70046],
            [69.41393, 32.63548],
            [69.30211, 32.54378],
            [69.23286, 32.46267],
            [69.26443, 32.32237],
            [69.25999, 32.23682],
            [69.25105, 32.13065],
            [69.30479, 31.94694],
            [69.25095, 31.90705],
            [69.10005, 31.72401],
            [69.04011, 31.67311],
            [68.94099, 31.64365],
            [68.80384, 31.60257],
            [68.70545, 31.70127],
            [68.68829, 31.7686],
            [68.56107, 31.81181],
            [68.48148, 31.81568],
            [68.42221, 31.77315],
            [68.52127, 31.76478],
            [68.53683, 31.74101],
            [68.46097, 31.73047],
            [68.27695, 31.76359],
            [68.2323, 31.79015],
            [68.15913, 31.82591],
            [68.1045, 31.76876],
            [68.06048, 31.72556],
            [68.04657, 31.6884],
            [67.96606, 31.63822],
            [67.88431, 31.63564],
            [67.78116, 31.56417],
            [67.69631, 31.52082],
            [67.56898, 31.52986],
            [67.57808, 31.48211],
            [67.61146, 31.4108],
            [67.73429, 31.40475],
            [67.76473, 31.33406],
            [67.6928, 31.32522],
            [67.60216, 31.27112],
            [67.49333, 31.24295],
            [67.3462, 31.20776],
            [67.21376, 31.21226],
            [67.13676, 31.24109],
            [67.05821, 31.23236],
            [67.01527, 31.24466],
            [67.02343, 31.26486],
            [67.01682, 31.30915],
            [66.90592, 31.30553],
            [66.78531, 31.23179],
            [66.69699, 31.19582],
            [66.55003, 30.97697],
            [66.37536, 30.93672],
            [66.26493, 30.55783],
            [66.31376, 30.4783],
            [66.30301, 30.30528],
            [66.23635, 30.1116],
            [66.22524, 30.04442],
            [66.33236, 29.96608],
            [66.32844, 29.94954],
            [66.27521, 29.88515],
            [66.05238, 29.79885],
            [65.87823, 29.75449],
            [65.70403, 29.71015],
            [65.52973, 29.66574],
            [65.35578, 29.62142],
            [65.18143, 29.57711],
            [64.82031, 29.56789],
            [64.4777, 29.57037],
            [64.14976, 29.45846],
            [63.97199, 29.42957],
            [63.41595, 29.48497],
            [63.26868, 29.47288],
            [63.1216, 29.46079],
            [62.97453, 29.44864],
            [62.82746, 29.4366],
            [62.68039, 29.42446],
            [62.47751, 29.40782],
            [62.19629, 29.47492],
            [61.94653, 29.54505],
            [61.69663, 29.6152],
            [61.44693, 29.68532],
            [61.19723, 29.75534],
            [60.94742, 29.82552],
            [60.876, 29.84552],
            [60.84438, 29.85818]
          ],
        },
        properties: {
          theater: "Afghanistan-Pakistan",
          overlay_type: "afpak_border",
        },
      },
    },
    {
      id: "sudan-frontline-liveuamap-style",
      name: "Sudan conflict frontlines",
      theater: "Sudan-South Sudan",
      updatedAt: nowIso,
      confidence: 72,
      source: "Open-source frontline synthesis (LiveUAmap-style)",
      geojson: {
        type: "Feature",
        geometry: {
          type: "MultiLineString",
          coordinates: sudanDensifiedLines,
        },
        properties: {
          theater: "Sudan-South Sudan",
          overlay_type: "active_frontline_synthesis",
        },
      },
    },
    {
      id: "korea-dmz-line",
      name: "Korean Peninsula DMZ (illustrative)",
      theater: "Korea",
      updatedAt: nowIso,
      confidence: 55,
      source:
        "Approximate Korean DMZ corridor (~38°N), west–east; illustrative only—not a surveyed boundary.",
      geojson: {
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: densifyLineCoords(
            [
              [124.72, 37.9],
              [125.35, 37.96],
              [126.05, 38.0],
              [126.75, 38.04],
              [127.35, 38.08],
              [127.95, 38.12],
              [128.55, 38.2],
              [129.05, 38.28],
              [129.42, 38.38],
            ],
            8
          ),
        },
        properties: {
          theater: "Korea",
          overlay_type: "dmz_corridor",
        },
      },
    },
    {
      id: "south-china-sea-maritime-escalation",
      name: "South China Sea maritime risk tint",
      theater: "Indo-Pacific",
      updatedAt: nowIso,
      confidence: 40,
      source:
        "Coarse bounding hull over the central South China Sea—visual escalation cue only, not a legal maritime boundary or claim.",
      geojson: {
        type: "Feature",
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [105.0, 3.0],
              [125.0, 3.0],
              [125.0, 23.0],
              [105.0, 23.0],
              [105.0, 3.0],
            ],
          ],
        },
        properties: {
          theater: "South China Sea",
          overlay_type: "maritime_escalation",
        },
      },
    },
  ];

  return {
    overlays,
    health: {
      provider: "Land-war frontier overlays",
      ok: overlays.length > 0,
      updatedAt: nowIso,
      message: `Loaded ${overlays.length} frontier layers [ukraine=${ukraine.sourceState}; afpak=afpak_border; sudan=line_synthesis; korea=dmz_corridor; scs=maritime_escalation]`,
    },
  };
}

function filterToRequestedLayers(
  layers: Record<IntelLayerKey, IntelPoint[]>,
  requested: IntelLayerKey[]
): Record<IntelLayerKey, IntelPoint[]> {
  return {
    conflicts: requested.includes("conflicts") ? layers.conflicts : [],
    liveStrikes: requested.includes("liveStrikes") ? layers.liveStrikes : [],
    flights: requested.includes("flights") ? layers.flights : [],
    vessels: requested.includes("vessels") ? layers.vessels : [],
    troopMovements: requested.includes("troopMovements") ? layers.troopMovements : [],
    carriers: requested.includes("carriers") ? layers.carriers : [],
    news: requested.includes("news") ? layers.news : [],
    escalationRisk: requested.includes("escalationRisk")
      ? layers.escalationRisk
      : [],
    hotspots: requested.includes("hotspots") ? layers.hotspots : [],
    infrastructure: requested.includes("infrastructure")
      ? layers.infrastructure
      : [],
  };
}

function buildMilitaryInfraTelemetry(params: {
  flights: IntelPoint[];
  vessels: IntelPoint[];
  carriers: IntelPoint[];
  infrastructure: IntelPoint[];
}): ProviderHealth {
  const { flights, vessels, carriers, infrastructure } = params;
  const ok = flights.length > 0 || vessels.length > 0 || infrastructure.length > 0;
  return {
    provider: "Military & infrastructure adapters",
    ok,
    updatedAt: new Date().toISOString(),
    message: `flights=${flights.length}; vessels=${vessels.length}; carriers=${carriers.length}; infrastructure=${infrastructure.length} [reason=${ok ? "ok" : "empty_layers"}]`,
  };
}

function buildConflictAdapterTelemetry(params: {
  acled: IntelPoint[];
  ucdp: IntelPoint[];
  gdelt: IntelPoint[];
  liveuamap: IntelPoint[];
  eventRegistry: IntelPoint[];
  rapid: IntelPoint[];
  rssNetwork: IntelPoint[];
  relaySeed: IntelPoint[];
  experimentalTrackers: IntelPoint[];
  requestedDomainLive: IntelPoint[];
}): ProviderHealth {
  const {
    acled,
    ucdp,
    gdelt,
    liveuamap,
    eventRegistry,
    rapid,
    rssNetwork,
    relaySeed,
    experimentalTrackers,
    requestedDomainLive,
  } = params;
  const total =
    acled.length +
    ucdp.length +
    gdelt.length +
    liveuamap.length +
    eventRegistry.length +
    rapid.length +
    rssNetwork.length +
    relaySeed.length +
    experimentalTrackers.length +
    requestedDomainLive.length;
  return {
    provider: "Conflict adapters",
    ok: total > 0,
    updatedAt: new Date().toISOString(),
    message: `acled=${acled.length}; ucdp=${ucdp.length}; gdelt=${gdelt.length}; liveuamap=${liveuamap.length}; event_registry=${eventRegistry.length}; rapid=${rapid.length}; rss_network=${rssNetwork.length}; relay_seed=${relaySeed.length}; experimental=${experimentalTrackers.length}; requested_domain_live=${requestedDomainLive.length} [reason=${total > 0 ? "ok" : "all_empty"}]`,
  };
}

function buildSourceAccessTelemetry(): ProviderHealth {
  const counters = {
    direct: 0,
    public: 0,
    credentialed: 0,
    blocked: 0,
  };
  for (const row of REQUESTED_SOURCE_ACCESS_MATRIX) {
    if (row.mode === "direct_api") counters.direct += 1;
    else if (row.mode === "public_rss_or_page") counters.public += 1;
    else if (row.mode === "credentialed_or_licensed") counters.credentialed += 1;
    else if (row.mode === "blocked_or_paywalled") counters.blocked += 1;
  }
  return {
    provider: "Requested source access matrix",
    ok: true,
    updatedAt: new Date().toISOString(),
    message: `direct=${counters.direct}; public=${counters.public}; credentialed=${counters.credentialed}; blocked=${counters.blocked}`,
  };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const range = searchParams.get("range") ?? "7d";
    const requestedLayers = parseLayers(searchParams.get("layers"));
    const sourcePacks = parseSourcePacks(searchParams.get("sourcePacks"));
    const rangeHours = rangeToHours(range);

    const [
      acledRes,
      ucdpRes,
      liveuamapRes,
      gdeltRes,
      eventRegistryRes,
      rapidRes,
      flightsRes,
      usniVesselsRes,
      vesselsRes,
      newsRes,
      rssNetworkRes,
      relaySeedRes,
      infraRes,
      openSourceIntelRes,
      lawfareDeployRes,
      experimentalTrackersRes,
      requestedDomainLiveRes,
    ] =
      await Promise.all([
      fetchAcledConflicts(rangeHours),
      fetchUcdpConflicts(rangeHours),
      fetchLiveuamapEvents(rangeHours),
      fetchGdeltConflictEvents(rangeHours),
      fetchEventRegistryNews(rangeHours),
      fetchRapidConflictSignals(rangeHours),
      fetchOpenSkyFlights(),
      fetchUsniFleetTrackerSignals(rangeHours),
      fetchVesselSignals(),
      fetchNewsSignals(rangeHours),
      fetchRssNetworkSignals(rangeHours),
      fetchRelaySeedSignals(rangeHours),
      fetchStrategicInfrastructure(),
      fetchOpenSourceIntelSignals(rangeHours),
      fetchLawfareDomesticDeployments(rangeHours),
      fetchExperimentalTrackerSignals(rangeHours),
      fetchRequestedDomainLiveSignals(rangeHours),
    ]);

    const mergedConflicts = [...ucdpRes.points, ...acledRes.points]
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, 2400);
    const eventRegistryStrikePoints: IntelPoint[] = eventRegistryRes.points
      .filter((p) => {
        const text = `${p.title} ${p.subtitle ?? ""} ${String(p.metadata?.event_type ?? "")}`;
        return isKineticEventText(text);
      })
      .map((p, idx) => ({
        ...p,
        id: `eventreg-strike-${p.id}-${idx}`,
        layer: "liveStrikes" as const,
        severity: p.severity === "critical" ? "critical" : "high",
        source: "Event Registry",
      }));

    const liveStrikes = [
      ...rapidRes.points,
      ...gdeltRes.points,
      ...liveuamapRes.points,
      ...eventRegistryStrikePoints,
      ...openSourceIntelRes.points.filter((p) => p.layer === "liveStrikes"),
      ...experimentalTrackersRes.points.filter((p) => p.layer === "liveStrikes"),
      ...requestedDomainLiveRes.points.filter((p) => p.layer === "liveStrikes"),
      ...rssNetworkRes.points
        .filter((p) => {
          const text = `${p.title} ${p.subtitle ?? ""} ${String(p.metadata?.event_type ?? "")}`.toLowerCase();
          return (
            isKineticEventText(text) &&
            !/\b(analysis|opinion|editorial|markets?|aid)\b/.test(text)
          );
        })
        .map((p, idx) => ({
          ...p,
          id: `trusted-strike-${p.id}-${idx}`,
          layer: "liveStrikes" as const,
          source: p.source || "Trusted publisher feeds",
          severity: p.severity === "critical" ? ("critical" as const) : ("high" as const),
          magnitude: Math.max(9, p.magnitude ?? 0),
        })),
      ...relaySeedRes.points
        .filter((p) => isKineticEventText(`${p.title} ${p.subtitle ?? ""}`))
        .map((p, idx) => ({
          ...p,
          id: `relay-strike-${p.id}-${idx}`,
          layer: "liveStrikes" as const,
          severity: p.severity === "critical" ? ("critical" as const) : ("high" as const),
          source: `${p.source} (relay)`,
        })),
    ]
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    const dedupedLiveStrikes = collapseRepeatedEvents(
      dedupeEventPoints(liveStrikes, 0.5),
      "liveStrikes"
    ).slice(0, 8200);
    const newsCandidates = [
      ...newsRes.points,
      ...eventRegistryRes.points,
      ...rssNetworkRes.points,
      ...relaySeedRes.points,
      ...openSourceIntelRes.points.filter((p) => p.layer === "news"),
      ...experimentalTrackersRes.points.filter((p) => p.layer === "news"),
      ...requestedDomainLiveRes.points.filter((p) => p.layer === "news"),
      ...gdeltRes.points.map((p, idx) => ({
        ...p,
        id: `gdelt-news-${p.id}-${idx}`,
        layer: "news" as const,
        source: "GDELT",
      })),
      ...rapidRes.points.map((p, idx) => ({
        ...p,
        id: `rapid-news-${p.id}-${idx}`,
        layer: "news" as const,
        source: "Rapid conflict feed",
      })),
    ];
    let fusedNewsPoints = dedupeEventPoints(newsCandidates, 0.75)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, 13200);
    fusedNewsPoints = collapseRepeatedEvents(
      fusedNewsPoints.filter((p) => {
        const text = `${p.title} ${p.subtitle ?? ""}`;
        if (HIGH_REPEAT_EXCLUDE_RE.test(text)) return false;
        if (
          GENERIC_REPEAT_LABEL_RE.test(p.title) &&
          !isKineticEventText(`${p.title} ${String(p.metadata?.event_type ?? "")}`)
        ) {
          return false;
        }
        return true;
      }),
      "news"
    );
    if (fusedNewsPoints.length < 900) {
      const densityBackfill = dedupeEventPoints(
        [
          ...fusedNewsPoints,
          ...dedupedLiveStrikes.map((p, idx) => ({
            ...p,
            id: `livestrike-news-backfill-${p.id}-${idx}`,
            layer: "news" as const,
            source: `${p.source} (backfill)`,
          })),
        ],
        0.75
      )
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
        .slice(0, 15600);
      fusedNewsPoints = collapseRepeatedEvents(densityBackfill, "news");
    }
    const dedupedFlights = dedupeFlightPoints(flightsRes.points).slice(0, 7000);
    const mergedVesselPoints = dedupeVesselPoints([
      ...usniVesselsRes.points,
      ...vesselsRes.points,
    ]).slice(0, 9000);
    const carrierGroups = extractCarrierGroups(mergedVesselPoints);
    const allowCuratedConflictFallback =
      dedupedLiveStrikes.length + mergedConflicts.length + fusedNewsPoints.length < 25;
    const activeConflictCountries = buildActiveConflictCountries(
      dedupedLiveStrikes,
      mergedConflicts,
      fusedNewsPoints,
      allowCuratedConflictFallback
    );
    const escalationRiskCountries = buildEscalationRiskCountries(
      dedupedLiveStrikes,
      mergedConflicts,
      fusedNewsPoints
    );
    const mappedEscalationRiskPoints: Array<IntelPoint | null> = escalationRiskCountries
      .map((risk, idx) => {
        const canonical = risk.country;
        const bboxEntry = Object.entries(COUNTRY_BBOX).find(
          ([name]) => canonicalConflictCountry(name) === canonical
        );
        const bbox = bboxEntry?.[1];
        if (!bbox) return null;
        return {
          id: `escalation-risk-${idx}-${canonical}`,
          layer: "escalationRisk" as const,
          title: `${bboxEntry?.[0] ?? risk.country} escalation risk`,
          subtitle: `Trend ${risk.trend} | score ${risk.riskScore}`,
          lat: bbox[4],
          lon: bbox[5],
          country: bboxEntry?.[0] ?? risk.country,
          severity: risk.severity,
          source: "AEGIS escalation model",
          timestamp: risk.latestEventAt,
          magnitude: Math.min(18, risk.riskScore),
          confidence: 0.62,
          metadata: {
            risk_score: risk.riskScore,
            trend: risk.trend,
            signal_sources: risk.signals.join(", "),
          },
        };
      });
    const escalationRiskPoints = mappedEscalationRiskPoints.filter(
      (p): p is IntelPoint => p !== null
    );

    const baseLayers: Record<IntelLayerKey, IntelPoint[]> = {
      conflicts: mergedConflicts,
      liveStrikes: dedupedLiveStrikes,
      flights: dedupedFlights,
      vessels: mergedVesselPoints,
      // No verified ground-force troop movement dataset available in this build.
      // We keep the layer key for compatibility, but it is always empty.
      troopMovements: [],
      carriers: carrierGroups,
      news: fusedNewsPoints,
      escalationRisk: escalationRiskPoints,
      hotspots: [],
      infrastructure: dedupeEventPoints(
        [...infraRes.points, ...lawfareDeployRes.points.filter((p) => p.layer === "infrastructure")],
        6
      ).slice(0, 2200),
    };

    const countryCenters = await getNaturalEarthCountryCentersMap();
    baseLayers.hotspots = buildHotspots(baseLayers, countryCenters);
    const frontline = await buildFrontlineOverlays();

    const response: MapApiResponse = {
      updatedAt: new Date().toISOString(),
      range,
      layers: filterToRequestedLayers(baseLayers, requestedLayers),
      activeConflictCountries,
      escalationRiskCountries,
      frontlineOverlays: frontline.overlays,
      providerHealth: [
        {
          provider: "Source family matrix",
          ok: true,
          updatedAt: new Date().toISOString(),
          message: `Families ${MAP_SOURCE_FAMILY_MATRIX.length} mapped to layers (conflicts/liveStrikes/news/flights/vessels/infrastructure) [reason=inventory_loaded]`,
        },
        {
          provider: "Conflict fusion",
          ok: mergedConflicts.length > 0 || dedupedLiveStrikes.length > 0,
          updatedAt: new Date().toISOString(),
          message: `Conflicts: ${mergedConflicts.length} validated DB points | Live strikes: ${dedupedLiveStrikes.length} near-live events | News: ${fusedNewsPoints.length}`,
        },
        {
          provider: "Adapter telemetry",
          ok: true,
          updatedAt: new Date().toISOString(),
          message: `rss_network=${rssNetworkRes.points.length}; relay_seed=${relaySeedRes.points.length}; rapid=${rapidRes.points.length}; gdelt=${gdeltRes.points.length}; event_registry=${eventRegistryRes.points.length}; open_source=${openSourceIntelRes.points.length}; lawfare=${lawfareDeployRes.points.length}; experimental=${experimentalTrackersRes.points.length}; requested_domain_live=${requestedDomainLiveRes.points.length}; flights=${dedupedFlights.length}; vessels=${mergedVesselPoints.length}; troop_movements=0; infrastructure=${infraRes.points.length} [source_packs=${sourcePacks.join("|")}]`,
        },
        buildSourceAccessTelemetry(),
        buildConflictAdapterTelemetry({
          acled: acledRes.points,
          ucdp: ucdpRes.points,
          gdelt: gdeltRes.points,
          liveuamap: liveuamapRes.points,
          eventRegistry: eventRegistryRes.points,
          rapid: rapidRes.points,
          rssNetwork: rssNetworkRes.points,
          relaySeed: relaySeedRes.points,
          experimentalTrackers: experimentalTrackersRes.points,
          requestedDomainLive: requestedDomainLiveRes.points,
        }),
        acledRes.health,
        ucdpRes.health,
        liveuamapRes.health,
        gdeltRes.health,
        eventRegistryRes.health,
        rapidRes.health,
        flightsRes.health,
        usniVesselsRes.health,
        vesselsRes.health,
        rssNetworkRes.health,
        relaySeedRes.health,
        openSourceIntelRes.health,
        lawfareDeployRes.health,
        experimentalTrackersRes.health,
        requestedDomainLiveRes.health,
        {
          provider: "Carrier groups",
          ok: carrierGroups.length > 0,
          updatedAt: new Date().toISOString(),
          message: carrierGroups.length
            ? `Detected ${carrierGroups.length} carrier/group contacts`
            : "No carrier groups detected in current AIS window",
        },
        buildMilitaryInfraTelemetry({
          flights: dedupedFlights,
          vessels: mergedVesselPoints,
          carriers: carrierGroups,
          infrastructure: baseLayers.infrastructure,
        }),
        frontline.health,
        newsRes.health,
        infraRes.health,
      ],
    };

    return NextResponse.json(response, { status: 200 });
  } catch (err) {
    console.error("Map API error", err);
    return NextResponse.json(
      {
        error: "Failed to load intelligence map feeds.",
      },
      { status: 500 }
    );
  }
}
