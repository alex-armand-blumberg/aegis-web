import { NextResponse } from "next/server";
import { COUNTRY_BBOX } from "@/lib/countryBounds";
import type {
  ActiveConflictCountry,
  EscalationRiskCountry,
  IntelLayerKey,
  IntelPoint,
  MapApiResponse,
  ProviderHealth,
} from "@/lib/intel/types";

const ACLED_ARCGIS_QUERY_URL =
  "https://services8.arcgis.com/xu983xJB6fIDCjpX/arcgis/rest/services/ACLED/FeatureServer/0/query";

const ACLED_FIELDS =
  "country,admin1,event_month,battles,explosions_remote_violence,protests,riots,strategic_developments,violence_against_civilians,violent_actors,fatalities,centroid_longitude,centroid_latitude,ObjectId";

const COUNTRY_NAMES = Object.keys(COUNTRY_BBOX);

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

      points.push({
        id: `acled-${String(a.ObjectId ?? `${country}-${admin1}-${eventMonth}`)}`,
        layer: "conflicts",
        title: admin1 ? `${admin1}, ${country}` : country || "Unknown",
        subtitle: "ACLED monthly conflict aggregate",
        lat,
        lon,
        country,
        severity: mapSeverity(norm),
        source: "ACLED ArcGIS",
        timestamp: ts,
        magnitude,
        confidence: 0.75,
        metadata: {
          eventMonth,
          battles: Number(a.battles) || 0,
          explosions: Number(a.explosions_remote_violence) || 0,
          protests: Number(a.protests) || 0,
          riots: Number(a.riots) || 0,
          strategic: Number(a.strategic_developments) || 0,
          civilians: Number(a.violence_against_civilians) || 0,
          fatalities: Number(a.fatalities) || 0,
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
  /(^|\s)(RCH|REACH|DUKE|NAVY|USAF|RAF|RRR|NATO|IAF|ROKAF|QID|AIO|CNV|FORTE|HOMER|LAGR|JSTARS|COPPER|SHELL|ARAB|TUAF)/i;

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
    const country = String(r[2] ?? "").trim();
    const lon = Number(r[5]);
    const lat = Number(r[6]);
    if (Number.isNaN(lat) || Number.isNaN(lon)) continue;
    if (!MILITARY_CALLSIGN_RE.test(callsign)) continue;

    const velocity = Number(r[9]) || 0;
    const altitude = Number(r[13]) || 0;
    const norm = Math.min(1, velocity / 320);

    points.push({
      id: `flight-${r[0] ?? `${callsign}-${lat}-${lon}`}`,
      layer: "flights",
      title: callsign || "Military flight",
      subtitle: country || "Unknown origin",
      lat,
      lon,
      severity: mapSeverity(norm),
      source: "OpenSky",
      timestamp: new Date(timestampSeconds * 1000).toISOString(),
      magnitude: velocity,
      confidence: 0.65,
      metadata: {
        velocity_ms: velocity,
        altitude_m: altitude,
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
    const points = extractOpenSkyMilitaryPoints(
      res.data.states,
      res.data.time ?? Math.floor(Date.now() / 1000)
    );
    return {
      points: points.slice(0, 450),
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
    const velocity = Number(flight.gs) || 0;
    const altitude = Number(flight.alt_baro) || 0;
    points.push({
      id: `flight-fallback-${flight.hex ?? `${lat}-${lon}`}`,
      layer: "flights",
      title: String(flight.flight ?? "").trim() || "Military flight",
      subtitle: "Fallback military feed",
      lat,
      lon,
      severity: mapSeverity(Math.min(1, velocity / 320)),
      source: "adsb.lol fallback",
      timestamp: new Date((Number(flight.t) || Date.now() / 1000) * 1000).toISOString(),
      magnitude: velocity,
      confidence: 0.55,
      metadata: {
        velocity_ms: velocity,
        altitude_m: altitude,
      },
    });
  }

  return {
    points: points.slice(0, 450),
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
  { keyword: "palestinian", country: "Palestine" },
  { keyword: "syrian", country: "Syria" },
  { keyword: "yemeni", country: "Yemen" },
  { keyword: "iranian", country: "Iran" },
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

const TRUSTED_PUBLISHER_RE =
  /\b(reuters|associated press|ap news|bbc|cnn|new york times|nytimes|washington post|wall street journal|financial times|al jazeera|france 24|deutsche welle|the guardian|bloomberg|nbc news|abc news|cbs news|npr|politico)\b/i;

const GDELT_CACHE_TTL_MS = 8 * 60 * 1000;
const GDELT_COOLDOWN_MS = 15 * 60 * 1000;
let gdeltCache: { fetchedAt: number; points: IntelPoint[] } | null = null;
let gdeltCooldownUntil = 0;
const CURRENT_WAR_COUNTRIES = new Set(
  [
    "Ukraine",
    "Russia",
    "Sudan",
    "South Sudan",
    "Yemen",
    "Syria",
    "Israel",
    "Palestine",
    "Iran",
    "Lebanon",
    "Myanmar",
    "Iraq",
    "Somalia",
    "Mali",
    "Burkina Faso",
    "Niger",
    "Democratic Republic of the Congo",
    "Ethiopia",
    "Afghanistan",
    "Libya",
  ].map((c) => normalizeCountryLabel(c).toLowerCase())
);

const CONFLICT_COUNTRY_ALIASES: Record<string, string> = {
  "democratic republic of congo": "democratic republic of the congo",
  drc: "democratic republic of the congo",
  "dr congo": "democratic republic of the congo",
  "russian federation": "russia",
  "state of palestine": "palestine",
  "occupied palestinian territory": "palestine",
};

const GDELT_SOURCECOUNTRY_MAP: Record<string, string> = {
  UA: "Ukraine",
  RU: "Russia",
  IR: "Iran",
  IL: "Israel",
  PS: "Palestine",
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
  gaza: { lat: 31.5018, lon: 34.4668, country: "Palestine" },
  rafah: { lat: 31.2969, lon: 34.2436, country: "Palestine" },
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
};

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

function extractPublisherFromTitle(title: string): string {
  const parts = title.split(" - ").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) return parts[parts.length - 1];
  return "Unknown";
}

function isTrustedPublisher(text: string): boolean {
  return TRUSTED_PUBLISHER_RE.test(text);
}

function extractStrikeKeyword(text: string): string | null {
  const t = text.toLowerCase();
  for (const k of STRIKE_KEYWORDS) {
    if (t.includes(k)) return k;
  }
  return null;
}

function extractMentionedCity(text: string): { city: string; lat: number; lon: number; country: string } | null {
  const normalized = text.toLowerCase().replace(/[^a-z0-9\s]/g, "");
  for (const [city, loc] of Object.entries(CITY_COORDS)) {
    if (normalized.includes(city)) {
      return { city, ...loc };
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
    return {
      points: [],
      health: {
        provider: "LiveUAMap",
        ok: false,
        updatedAt: new Date().toISOString(),
        latencyMs: Date.now() - started,
        message: lastMessage,
      },
    };
  }

  const points: IntelPoint[] = [];
  for (const e of events) {
    const title = String(e.title ?? e.description ?? "").trim();
    if (!title) continue;
    const fullText = `${title} ${String(e.description ?? "")}`;
    const keyword = extractStrikeKeyword(fullText);
    if (!keyword) continue;

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
      title: city ? `${keyword} report near ${city}` : `${keyword} report`,
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
        event_type: keyword,
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
      const eventType = extractStrikeKeyword(textBlob);
      if (!eventType) continue;
      const city = extractMentionedCity(textBlob);
      const country = city?.country || extractMentionedCountry(textBlob);
      if (!country) continue;
      const bbox = COUNTRY_BBOX[country];
      if (!bbox && !city) continue;
      points.push({
        id: `gdelt-emerg-${country}-${ts}-${points.length + 1}`,
        layer: "liveStrikes",
        title: city ? `${eventType} report near ${city.city}` : `${eventType} report in ${country}`,
        subtitle: title,
        lat: city?.lat ?? bbox![4],
        lon: city?.lon ?? bbox![5],
        country: normalizeCountryLabel(country),
        severity: city ? "high" : "medium",
        source: "GDELT fallback",
        timestamp: new Date(ts).toISOString(),
        magnitude: city ? 7 : 5,
        confidence: 0.52,
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
    const keyword = extractStrikeKeyword(title);
    if (!keyword) continue;

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
      title: city ? `${keyword} report near ${city.city}` : `${keyword} report in ${country}`,
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
        event_type: keyword,
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
  const bodyCandidates: unknown[] = [
    {
      apiKey,
      keyword: "missile strike",
      dateStart: from.toISOString().slice(0, 10),
      dateEnd: now.toISOString().slice(0, 10),
      lang: "eng",
      isDuplicateFilter: "skipDuplicates",
      articleCount: 100,
      sortBy: "date",
      resultType: "articles",
    },
    {
      apiKey,
      keyword: "drone strike OR artillery OR battle OR interception",
      dateStart: from.toISOString().slice(0, 10),
      dateEnd: now.toISOString().slice(0, 10),
      lang: "eng",
      articleCount: 100,
      sortBy: "date",
      resultType: "articles",
    },
    {
      apiKey,
      keyword:
        "(missile OR strike OR drone OR bombardment OR shelling OR artillery OR raid OR interception OR naval battle OR special operation) AND (Ukraine OR Russia OR Israel OR Iran OR Gaza OR Sudan OR Yemen OR Syria OR Lebanon OR Myanmar)",
      dateStart: from.toISOString().slice(0, 10),
      dateEnd: now.toISOString().slice(0, 10),
      lang: "eng",
      articleCount: 100,
      sortBy: "date",
      resultType: "articles",
    },
  ];

  let parsed: EventRegistryArticle[] = [];
  let lastMessage = "No Event Registry articles returned";

  for (const body of bodyCandidates) {
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
      continue;
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
    parsed = parseEventRegistryArticles(res.data);
    if (parsed.length) break;
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
        const eventType = extractStrikeKeyword(fullText);
        if (!eventType) continue;
        const city = extractMentionedCity(fullText);
        const country = city?.country || extractMentionedCountry(fullText);
        if (!country) continue;
        const bbox = COUNTRY_BBOX[country];
        if (!bbox && !city) continue;
        points.push({
          id: `eventreg-rss-${country}-${ts}-${points.length + 1}`,
          layer: "news",
          title: city ? `${eventType} report near ${city.city}` : `${eventType} report in ${country}`,
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
            event_type: eventType,
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
        message: lastMessage,
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
    const eventType = extractStrikeKeyword(fullText) ?? "event";
    if (!WAR_LIKE_KEYWORDS.some((k) => fullText.toLowerCase().includes(k))) continue;

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
      title: city ? `${eventType} report near ${city.city}` : `${eventType} report in ${country}`,
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
        event_type: eventType,
        publisher: sourceTitle || sourceUri || "unknown",
        source_url: sourceUrl || null,
        image_url: imageUrl || null,
        original_headline: title,
        trusted_source: trusted,
      },
    });
  }

  return {
    points: points.slice(0, 1000),
    health: {
      provider: "Event Registry",
      ok: points.length > 0,
      updatedAt: new Date().toISOString(),
      latencyMs: Date.now() - started,
      message: `Mapped ${points.length} event-level trusted-source reports`,
    },
  };
}

function buildActiveConflictCountries(
  liveStrikes: IntelPoint[],
  conflicts: IntelPoint[],
  news: IntelPoint[]
): ActiveConflictCountry[] {
  const byCountry = new Map<
    string,
    { score: number; latestEventAt: string; sources: Set<string>; signals: IntelPoint[] }
  >();

  const push = (p: IntelPoint, weight: number) => {
    if (!p.country) return;
    const country = canonicalConflictCountry(p.country);
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
        c.score >= 8 &&
        CURRENT_WAR_COUNTRIES.has(canonicalConflictCountry(c.country))
    )
    .sort((a, b) => b.score - a.score)
    .slice(0, 45);

  const seen = new Set(computed.map((c) => canonicalConflictCountry(c.country)));
  const nowIso = new Date().toISOString();
  for (const warCountry of CURRENT_WAR_COUNTRIES) {
    if (seen.has(warCountry)) continue;
    computed.push({
      country: warCountry,
      score: 0.6,
      severity: "low",
      latestEventAt: nowIso,
      sources: ["Curated conflict-country baseline"],
    });
  }

  return computed
    .sort((a, b) => b.score - a.score)
    .slice(0, 55);
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
    .filter((c) => c.trend === "rising" && c.riskScore >= 4)
    .sort((a, b) => b.riskScore - a.riskScore)
    .slice(0, 45);
}

async function fetchRapidConflictSignals(rangeHours: number): Promise<{
  points: IntelPoint[];
  health: ProviderHealth;
}> {
  const started = Date.now();
  const query = encodeURIComponent(
    "(airstrike OR missile strike OR bombardment OR drone strike OR explosion OR artillery OR battle) (Ukraine OR Russia OR Israel OR Gaza OR Iran OR Sudan OR Yemen OR Syria OR Lebanon OR Red Sea)"
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
          provider: "Rapid conflict feed",
          ok: false,
          updatedAt: new Date().toISOString(),
          latencyMs: Date.now() - started,
          message: `HTTP ${res.status}`,
        },
      };
    }

    const text = await res.text();
    const itemBlocks = text.split("<item>").slice(1, 520);
    const cutoff = Date.now() - rangeHours * 3600_000;
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

    for (const block of itemBlocks) {
      const title = extractRssTag(block, "title");
      const description = extractRssTag(block, "description") ?? "";
      const imageUrl = extractRssImageUrl(block);
      const pubRaw = extractRssTag(block, "pubDate");
      if (!title) continue;
      const ts = pubRaw ? new Date(pubRaw).getTime() : Date.now();
      if (!Number.isFinite(ts) || ts < cutoff) continue;

      const fullText = `${title} ${description}`;
      const keyword = extractStrikeKeyword(fullText);
      if (!keyword) continue;

      const city = extractMentionedCity(fullText);
      const country = city?.country || extractMentionedCountry(fullText);
      if (!country) continue;
      const bbox = COUNTRY_BBOX[country];
      if (!bbox && !city) continue;
      const lat = city?.lat ?? bbox![4];
      const lon = city?.lon ?? bbox![5];

      const publisher = extractPublisherFromTitle(title);
      const clusterKey = `${country}|${city?.city ?? "country"}|${keyword}|${normalizeHeadlineForCluster(
        title
      )}`;
      const current = clusters.get(clusterKey) ?? {
        latestTs: ts,
        title,
        country,
        lat,
        lon,
        keyword,
        imageUrl: imageUrl || null,
        publishers: new Set<string>(),
        evidence: [],
      };
      current.latestTs = Math.max(current.latestTs, ts);
      current.publishers.add(publisher);
      if (current.evidence.length < 4) current.evidence.push(title);
      clusters.set(clusterKey, current);
    }

    const points: IntelPoint[] = [];
    for (const [key, c] of clusters.entries()) {
      const corroboration = c.publishers.size;
      if (corroboration < 2) continue;
      const norm = Math.min(1, corroboration / 4);
      points.push({
        id: `rapid-${key}`,
        layer: "liveStrikes",
        title: c.title,
        subtitle: `${c.keyword} | corroborated by ${corroboration} sources`,
        lat: c.lat,
        lon: c.lon,
        country: c.country,
        severity: corroboration >= 3 ? "critical" : "high",
        source: "Corroborated live conflict feed",
        timestamp: new Date(c.latestTs).toISOString(),
        magnitude: 12 + corroboration * 3,
        confidence: 0.5 + norm * 0.35,
        imageUrl: c.imageUrl || undefined,
        metadata: {
          corroborating_sources: corroboration,
          top_publishers: Array.from(c.publishers).slice(0, 3).join(", "),
          sample_event: c.evidence[0] ?? "",
          image_url: c.imageUrl,
        },
      });
    }

    return {
      points: points.slice(0, 560),
      health: {
        provider: "Rapid conflict feed",
        ok: true,
        updatedAt: new Date().toISOString(),
        latencyMs: Date.now() - started,
        message: `Mapped ${points.length} corroborated near-live strike events`,
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
  } finally {
    clearTimeout(timer);
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
  ];
  try {
    const points: IntelPoint[] = [];
    const seen = new Set<string>();
    const cutoff = Date.now() - rangeHours * 3600_000;
    let fetchErrors = 0;

    for (const rawQuery of queries) {
      const query = encodeURIComponent(rawQuery);
      const url = `https://news.google.com/rss/search?q=${query}&hl=en-US&gl=US&ceid=US:en`;
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 12000);
      let text = "";
      try {
        const res = await fetch(url, { cache: "no-store", signal: ctl.signal });
        if (!res.ok) {
          fetchErrors += 1;
          clearTimeout(timer);
          continue;
        }
        text = await res.text();
      } catch {
        fetchErrors += 1;
        clearTimeout(timer);
        continue;
      } finally {
        clearTimeout(timer);
      }

      const itemBlocks = text.split("<item>").slice(1, 800);

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
        if (!eventKeywords.some((k) => lower.includes(k))) continue;

        const keyword = extractStrikeKeyword(fullText) ?? "event";
        const city = extractMentionedCity(fullText);
        const country = city?.country || extractMentionedCountry(fullText);
        if (!country) continue;
        const bbox = COUNTRY_BBOX[country];
        if (!bbox && !city) continue;
        const lat = city?.lat ?? bbox![4];
        const lon = city?.lon ?? bbox![5];
        const publisher = extractPublisherFromTitle(title);
        const trusted = isTrustedPublisher(`${publisher} ${title}`);
        const dedupeKey = `${normalizeHeadlineForCluster(title)}|${country}|${city?.city ?? ""}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);

        points.push({
          id: `news-event-${i}-${country}-${pubDate}-${seen.size}`,
          layer: "news",
          title: city ? `${keyword} report near ${city.city}` : `${keyword} report in ${country}`,
          subtitle: `${publisher} headline`,
          lat,
          lon,
          country,
          severity: city ? "high" : "medium",
          source: "Google News RSS",
          timestamp: new Date(pubDate).toISOString(),
          magnitude: city ? 7 : 4,
          confidence: trusted ? (city ? 0.7 : 0.58) : city ? 0.6 : 0.46,
          imageUrl: imageUrl || undefined,
          metadata: {
            event_type: keyword,
            publisher,
            original_headline: title,
            city: city?.city ?? null,
            trusted_source: trusted,
            image_url: imageUrl || null,
          },
        });
      }
    }

    points.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    return {
      points: points.slice(0, 2600),
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

async function fetchVesselSignals(): Promise<{
  points: IntelPoint[];
  health: ProviderHealth;
}> {
  const snapshotUrlRaw = process.env.AISSTREAM_SNAPSHOT_URL?.trim();
  if (!snapshotUrlRaw) {
    return {
      points: [],
      health: {
        provider: "AISStream",
        ok: false,
        updatedAt: new Date().toISOString(),
        message:
          "No AISSTREAM_SNAPSHOT_URL configured. Add relay snapshot endpoint for vessel positions.",
      },
    };
  }

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
    return {
      points: [],
      health: {
        provider: "AISStream",
        ok: false,
        updatedAt: new Date().toISOString(),
        message:
          "AISSTREAM_SNAPSHOT_URL is invalid. Use a full URL, for example https://your-relay.up.railway.app/snapshot",
      },
    };
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
    }>;
  }>(parsedUrl.toString(), undefined, 12000);

  if (!res.ok || !res.data) {
    return {
      points: [],
      health: {
        provider: "AISStream",
        ok: false,
        updatedAt: new Date().toISOString(),
        latencyMs: res.latencyMs,
        message: res.message ?? "AIS relay failed",
      },
    };
  }

  const vessels = res.data.vessels ?? [];
  const GOV_VESSEL_RE =
    /\b(USS|USNS|USCGC|HMS|HMCS|HMAS|ROKS|INS|PLAN|NAVE|NAVY|COAST\s*GUARD|CGC|CG-|PATROL|CORVETTE|FRIGATE|DESTROYER|CRUISER|CARRIER|BATTLESHIP|AMPHIB|LCS|CUTTER|WARSHIP)\b/i;
  const GOV_FLAG_HINT_RE =
    /\b(NAVY|COAST\s*GUARD|GOVERNMENT|MILITARY|STATE)\b/i;
  const points: IntelPoint[] = [];
  for (const v of vessels) {
    const lat = Number(v.lat);
    const lon = Number(v.lon);
    if (Number.isNaN(lat) || Number.isNaN(lon)) continue;
    const name = v.name?.trim() || "";
    const flag = v.flag?.trim() || "";
    const isGovernmentVessel =
      GOV_VESSEL_RE.test(name) || GOV_FLAG_HINT_RE.test(flag);
    if (!isGovernmentVessel) continue;
    const speed = Number(v.speed) || 0;
    points.push({
      id: `vessel-${v.id ?? `${lat}-${lon}`}`,
      layer: "vessels",
      title: name || "Government vessel",
      subtitle: v.flag ? `${v.flag} flag` : "AIS snapshot",
      lat,
      lon,
      severity: mapSeverity(Math.min(1, speed / 25)),
      source: "AISStream relay",
      timestamp: v.updatedAt || new Date().toISOString(),
      magnitude: speed,
      confidence: 0.7,
      metadata: {
        speed_knots: speed,
      },
    });
  }

  return {
    points: points.slice(0, 1500),
    health: {
      provider: "AISStream",
      ok: true,
      updatedAt: new Date().toISOString(),
      latencyMs: res.latencyMs,
      message: `Loaded ${points.length} government/military vessel positions`,
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
    for (const b of res.data.slice(0, 260)) {
      const lat = Number(b.lat);
      const lon = Number(b.lon);
      if (Number.isNaN(lat) || Number.isNaN(lon)) continue;
      points.push({
        id: `base-${b.id ?? `${lat}-${lon}`}`,
        layer: "infrastructure",
        title: b.name?.trim() || "Military base",
        subtitle: b.arm?.trim() || "Military installation",
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

function buildHotspots(layers: Record<IntelLayerKey, IntelPoint[]>): IntelPoint[] {
  const scoreByCountry = new Map<
    string,
    { score: number; lat: number; lon: number; latestTs: string }
  >();

  const push = (p: IntelPoint, weight: number) => {
    if (!p.country) return;
    const center = COUNTRY_BBOX[p.country];
    const lat = center?.[4] ?? p.lat;
    const lon = center?.[5] ?? p.lon;
    const current = scoreByCountry.get(p.country) ?? {
      score: 0,
      lat,
      lon,
      latestTs: p.timestamp,
    };
    current.score += weight;
    if (p.timestamp > current.latestTs) current.latestTs = p.timestamp;
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
      title: `${country} hotspot`,
      subtitle: "Composite cross-layer activity score",
      lat: s.lat,
      lon: s.lon,
      country,
      severity: mapSeverity(Math.min(1, s.score / 50)),
      source: "AEGIS fusion",
      timestamp: s.latestTs,
      magnitude: Number(s.score.toFixed(2)),
      confidence: 0.72,
    }));
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

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const range = searchParams.get("range") ?? "7d";
    const requestedLayers = parseLayers(searchParams.get("layers"));
    const rangeHours = rangeToHours(range);

    const [
      acledRes,
      ucdpRes,
      liveuamapRes,
      gdeltRes,
      eventRegistryRes,
      rapidRes,
      flightsRes,
      vesselsRes,
      newsRes,
      infraRes,
    ] =
      await Promise.all([
      fetchAcledConflicts(rangeHours),
      fetchUcdpConflicts(rangeHours),
      fetchLiveuamapEvents(rangeHours),
      fetchGdeltConflictEvents(rangeHours),
      fetchEventRegistryNews(rangeHours),
      fetchRapidConflictSignals(rangeHours),
      fetchOpenSkyFlights(),
      fetchVesselSignals(),
      fetchNewsSignals(rangeHours),
      fetchStrategicInfrastructure(),
    ]);

    const mergedConflicts = [...ucdpRes.points, ...acledRes.points]
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, 2400);
    const eventRegistryStrikePoints: IntelPoint[] = eventRegistryRes.points
      .filter((p) => WAR_LIKE_KEYWORDS.some((k) => `${p.title} ${p.subtitle ?? ""}`.toLowerCase().includes(k)))
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
    ]
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, 2400);
    const fusedNewsPoints = [...newsRes.points, ...eventRegistryRes.points]
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, 2800);
    const carrierGroups = extractCarrierGroups(vesselsRes.points);
    const activeConflictCountries = buildActiveConflictCountries(
      liveStrikes,
      mergedConflicts,
      fusedNewsPoints
    );
    const escalationRiskCountries = buildEscalationRiskCountries(
      liveStrikes,
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
      liveStrikes,
      flights: flightsRes.points,
      vessels: vesselsRes.points,
      carriers: carrierGroups,
      news: fusedNewsPoints,
      escalationRisk: escalationRiskPoints,
      hotspots: [],
      infrastructure: infraRes.points,
    };

    baseLayers.hotspots = buildHotspots(baseLayers);

    const response: MapApiResponse = {
      updatedAt: new Date().toISOString(),
      range,
      layers: filterToRequestedLayers(baseLayers, requestedLayers),
      activeConflictCountries,
      escalationRiskCountries,
      providerHealth: [
        {
          provider: "Conflict fusion",
          ok: mergedConflicts.length > 0 || liveStrikes.length > 0,
          updatedAt: new Date().toISOString(),
          message: `Conflicts: ${mergedConflicts.length} validated DB points | Live strikes: ${liveStrikes.length} near-live events`,
        },
        acledRes.health,
        ucdpRes.health,
        liveuamapRes.health,
        gdeltRes.health,
        eventRegistryRes.health,
        rapidRes.health,
        flightsRes.health,
        vesselsRes.health,
        {
          provider: "Carrier groups",
          ok: carrierGroups.length > 0,
          updatedAt: new Date().toISOString(),
          message: carrierGroups.length
            ? `Detected ${carrierGroups.length} carrier/group contacts`
            : "No carrier groups detected in current AIS window",
        },
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
