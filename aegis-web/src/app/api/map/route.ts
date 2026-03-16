import { NextResponse } from "next/server";
import { COUNTRY_BBOX } from "@/lib/countryBounds";
import type {
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
    "flights",
    "vessels",
    "news",
    "hotspots",
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
    const data = (await res.json()) as T;
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
  const username = process.env.OPENSKY_USERNAME;
  const password = process.env.OPENSKY_PASSWORD;
  const authHeader: HeadersInit | undefined =
    username && password
      ? {
          Authorization:
            "Basic " + Buffer.from(`${username}:${password}`).toString("base64"),
        }
      : undefined;

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
        message: `Tracked ${points.length} military-like flights`,
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

async function fetchNewsSignals(rangeHours: number): Promise<{
  points: IntelPoint[];
  health: ProviderHealth;
}> {
  const query = encodeURIComponent(
    "(war OR conflict OR airstrike OR missile OR drone OR invasion OR military)"
  );
  const url =
    `https://news.google.com/rss/search?q=${query}&hl=en-US&gl=US&ceid=US:en`;

  const started = Date.now();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 12000);
  try {
    const res = await fetch(url, { cache: "no-store", signal: ctl.signal });
    if (!res.ok) {
      return {
        points: [],
        health: {
          provider: "Google News RSS",
          ok: false,
          updatedAt: new Date().toISOString(),
          latencyMs: Date.now() - started,
          message: `HTTP ${res.status}`,
        },
      };
    }
    const text = await res.text();
    const itemBlocks = text.split("<item>").slice(1, 220);
    const points: IntelPoint[] = [];
    const cutoff = Date.now() - rangeHours * 3600_000;

    for (let i = 0; i < itemBlocks.length; i += 1) {
      const block = itemBlocks[i];
      const title = extractRssTag(block, "title");
      const description = extractRssTag(block, "description") ?? "";
      const pubRaw = extractRssTag(block, "pubDate");
      if (!title) continue;
      const pubDate = pubRaw ? new Date(pubRaw).getTime() : Date.now();
      if (Number.isNaN(pubDate) || pubDate < cutoff) continue;

      const country = extractMentionedCountry(`${title} ${description}`);
      if (!country) continue;
      const bbox = COUNTRY_BBOX[country];
      if (!bbox) continue;
      const lat = bbox[4];
      const lon = bbox[5];

      points.push({
        id: `news-${i}-${country}-${pubDate}`,
        layer: "news",
        title,
        subtitle: `${country} mention in live feed`,
        lat,
        lon,
        country,
        severity: "medium",
        source: "Google News RSS",
        timestamp: new Date(pubDate).toISOString(),
        magnitude: 1,
        confidence: 0.35,
      });
    }

    return {
      points: points.slice(0, 180),
      health: {
        provider: "Google News RSS",
        ok: true,
        updatedAt: new Date().toISOString(),
        latencyMs: Date.now() - started,
        message: `Mapped ${points.length} geocoded headlines`,
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
  } finally {
    clearTimeout(timer);
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
  const points: IntelPoint[] = [];
  for (const v of vessels) {
    const lat = Number(v.lat);
    const lon = Number(v.lon);
    if (Number.isNaN(lat) || Number.isNaN(lon)) continue;
    const speed = Number(v.speed) || 0;
    points.push({
      id: `vessel-${v.id ?? `${lat}-${lon}`}`,
      layer: "vessels",
      title: v.name?.trim() || "Vessel",
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
      message: `Loaded ${points.length} vessel positions`,
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
  for (const p of layers.flights) push(p, 1.7);
  for (const p of layers.vessels) push(p, 1.4);
  for (const p of layers.news) push(p, 0.6);

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
    flights: requested.includes("flights") ? layers.flights : [],
    vessels: requested.includes("vessels") ? layers.vessels : [],
    news: requested.includes("news") ? layers.news : [],
    hotspots: requested.includes("hotspots") ? layers.hotspots : [],
  };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const range = searchParams.get("range") ?? "7d";
    const requestedLayers = parseLayers(searchParams.get("layers"));
    const rangeHours = rangeToHours(range);

    const [conflictsRes, flightsRes, vesselsRes, newsRes] = await Promise.all([
      fetchAcledConflicts(rangeHours),
      fetchOpenSkyFlights(),
      fetchVesselSignals(),
      fetchNewsSignals(rangeHours),
    ]);

    const baseLayers: Record<IntelLayerKey, IntelPoint[]> = {
      conflicts: conflictsRes.points,
      flights: flightsRes.points,
      vessels: vesselsRes.points,
      news: newsRes.points,
      hotspots: [],
    };

    baseLayers.hotspots = buildHotspots(baseLayers);

    const response: MapApiResponse = {
      updatedAt: new Date().toISOString(),
      range,
      layers: filterToRequestedLayers(baseLayers, requestedLayers),
      providerHealth: [
        conflictsRes.health,
        flightsRes.health,
        vesselsRes.health,
        newsRes.health,
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
