import { NextResponse } from "next/server";
import type {
  IntelPoint,
  MapApiResponse,
  RegionIntelResponse,
  RegionSelection,
} from "@/lib/intel/types";
import {
  canonicalCountryMatchKey,
  countriesMatch,
  formatCountryDisplayName,
} from "@/lib/countryDisplay";
import { getCountryBounds } from "@/lib/countryBounds";
import { getOceanRegionByKey, pointInRegion } from "@/lib/regionGeometry";

function dayLabel(ts: number): string {
  const d = new Date(ts);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
    d.getUTCDate()
  ).padStart(2, "0")}`;
}

function severityWeight(s: string): number {
  return s === "critical" ? 4 : s === "high" ? 3 : s === "medium" ? 2 : 1;
}

function clampIndex(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v)));
}

function pointInBounds(p: IntelPoint, bounds: [[number, number], [number, number]]): boolean {
  const [[minLat, minLon], [maxLat, maxLon]] = bounds;
  return p.lat >= minLat && p.lat <= maxLat && p.lon >= minLon && p.lon <= maxLon;
}

function extractPointCountryCandidates(p: IntelPoint): string[] {
  const out: string[] = [];
  const push = (v: unknown) => {
    if (typeof v !== "string") return;
    const t = v.trim();
    if (!t) return;
    out.push(t);
  };
  push(p.country);
  const md = p.metadata;
  if (md) {
    push(md.country);
    push(md.country_name);
    push(md.location_country);
    push(md.nation);
  }
  return out;
}

function buildCountryScopeMatcher(selectionCountry: string): (p: IntelPoint) => boolean {
  const canonicalSelection = canonicalCountryMatchKey(selectionCountry);
  const bounds = getCountryBounds(selectionCountry);
  return (p: IntelPoint) => {
    const candidates = extractPointCountryCandidates(p);
    if (
      candidates.some((c) => {
        const key = canonicalCountryMatchKey(c);
        return key && key === canonicalSelection;
      })
    ) {
      return true;
    }
    // Some feeds omit country labels; use a geographic fallback to avoid dropping valid points.
    if (bounds && pointInBounds(p, bounds)) {
      return true;
    }
    return countriesMatch(selectionCountry, p.country);
  };
}

function scaledIndex(raw: number, volume: number, kind: "escalation" | "conflict"): number {
  if (raw <= 0 || volume <= 0) return 0;
  const baseDenominator = kind === "escalation" ? 16 : 14;
  const dynamicDenominator = baseDenominator + Math.sqrt(volume) * (kind === "escalation" ? 2.3 : 1.9);
  const normalized = Math.max(0, raw / dynamicDenominator);
  const curved = 100 * (1 - Math.exp(-normalized));
  return clampIndex(curved);
}

export async function GET(request: Request) {
  try {
    const { searchParams, origin } = new URL(request.url);
    const forwardHeaders: Record<string, string> = {};
    const cookie = request.headers.get("cookie");
    const authorization = request.headers.get("authorization");
    const bypass = request.headers.get("x-vercel-protection-bypass");
    if (cookie) forwardHeaders.cookie = cookie;
    if (authorization) forwardHeaders.authorization = authorization;
    if (bypass) forwardHeaders["x-vercel-protection-bypass"] = bypass;
    const range = searchParams.get("range") || "7d";
    const kind = (searchParams.get("kind") || "country").trim().toLowerCase();
    const key = (searchParams.get("key") || "").trim();
    const name = (searchParams.get("name") || "").trim();
    if (!key) {
      return NextResponse.json({ error: "key is required" }, { status: 400 });
    }

    const mapRes = await fetch(
      `${origin}/api/map?range=${encodeURIComponent(
        range
      )}&layers=conflicts,liveStrikes,flights,vessels,carriers,news,infrastructure`,
      { cache: "no-store", headers: forwardHeaders }
    );
    const mapContentType = (mapRes.headers.get("content-type") || "").toLowerCase();
    if (!mapRes.ok || !mapContentType.includes("application/json")) {
      return NextResponse.json({ error: "failed to fetch map feeds" }, { status: 502 });
    }
    const mapData = (await mapRes.json()) as MapApiResponse;
    if (!mapData.layers) {
      return NextResponse.json({ error: "failed to parse map feeds" }, { status: 502 });
    }

    let selection: RegionSelection;
    let inScope: (p: IntelPoint) => boolean;

    if (kind === "ocean") {
      const feature = getOceanRegionByKey(key);
      if (!feature) {
        return NextResponse.json({ error: "unknown ocean region key" }, { status: 404 });
      }
      selection = {
        kind: "ocean",
        key: feature.properties.regionKey,
        name: feature.properties.name,
      };
      inScope = (p) => pointInRegion(p.lon, p.lat, feature);
    } else {
      const displayName = formatCountryDisplayName(name || key);
      selection = {
        kind: "country",
        key,
        name: displayName || name || key,
        country: displayName || name || key,
      };
      inScope = buildCountryScopeMatcher(selection.country ?? selection.name);
    }

    const conflicts = mapData.layers.conflicts.filter(inScope);
    const liveStrikes = mapData.layers.liveStrikes.filter(inScope);
    const flights = mapData.layers.flights.filter(inScope);
    const vessels = mapData.layers.vessels.filter(inScope);
    const carriers = mapData.layers.carriers.filter(inScope);
    const news = mapData.layers.news.filter(inScope);
    const infrastructure = mapData.layers.infrastructure.filter(inScope);

    const dataPoints = [
      ...liveStrikes,
      ...conflicts,
      ...flights,
      ...vessels,
      ...carriers,
      ...infrastructure,
      ...news,
    ]
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, 220);

    const layerCounts = dataPoints.reduce<Record<string, number>>((acc, p) => {
      acc[p.layer] = (acc[p.layer] ?? 0) + 1;
      return acc;
    }, {});
    const severityMass = dataPoints.reduce((sum, p) => sum + severityWeight(p.severity), 0);
    const scopedVolume = dataPoints.length;
    const liveStrikesCount = layerCounts.liveStrikes ?? 0;
    const conflictsCount = layerCounts.conflicts ?? 0;
    const flightsCount = layerCounts.flights ?? 0;
    const vesselsCount = layerCounts.vessels ?? 0;
    const carriersCount = layerCounts.carriers ?? 0;
    const infraCount = layerCounts.infrastructure ?? 0;
    const newsCount = layerCounts.news ?? 0;
    const criticalNewsCount = news.filter((n) => n.severity === "critical").length;

    const escalationRaw =
      liveStrikesCount * 3.4 +
      conflictsCount * 2.6 +
      flightsCount * 1.5 +
      vesselsCount * 1.3 +
      carriersCount * 2.4 +
      criticalNewsCount * 1.2 +
      infraCount * 0.8 +
      severityMass * 0.42;
    const conflictRaw =
      liveStrikesCount * 3.8 +
      conflictsCount * 2.9 +
      criticalNewsCount * 1.35 +
      infraCount * 0.45 +
      severityMass * 0.28;
    let escalationIndex = scaledIndex(escalationRaw, Math.max(1, scopedVolume), "escalation");
    let conflictIndex = scaledIndex(conflictRaw, Math.max(1, scopedVolume), "conflict");
    if (scopedVolume > 0 && escalationIndex === 0) escalationIndex = Math.min(18, 4 + Math.round(Math.sqrt(scopedVolume)));
    if (scopedVolume > 0 && conflictIndex === 0) conflictIndex = Math.min(14, 3 + Math.round(Math.sqrt(scopedVolume * 0.7)));
    const status: RegionIntelResponse["status"] =
      escalationIndex >= 70 || conflictIndex >= 70
        ? "critical"
        : escalationIndex >= 40 || conflictIndex >= 40
          ? "elevated"
          : "stable";

    const bucket = new Map<
      string,
      {
        liveStrikes: number;
        conflicts: number;
        military: number;
        news: number;
        infrastructure: number;
      }
    >();
    const ensure = (k: string) =>
      bucket.get(k) ??
      bucket
        .set(k, {
          liveStrikes: 0,
          conflicts: 0,
          military: 0,
          news: 0,
          infrastructure: 0,
        })
        .get(k)!;
    const now = Date.now();
    for (let d = 6; d >= 0; d -= 1) {
      ensure(dayLabel(now - d * 24 * 3600_000));
    }
    const stamp = (
      iso: string,
      keyName: "liveStrikes" | "conflicts" | "military" | "news" | "infrastructure"
    ) => {
      const b = ensure(dayLabel(new Date(iso).getTime()));
      b[keyName] += 1;
    };
    for (const p of liveStrikes) stamp(p.timestamp, "liveStrikes");
    for (const p of conflicts) stamp(p.timestamp, "conflicts");
    for (const p of flights) stamp(p.timestamp, "military");
    for (const p of vessels) stamp(p.timestamp, "military");
    for (const p of carriers) stamp(p.timestamp, "military");
    for (const p of news) stamp(p.timestamp, "news");
    for (const p of infrastructure) stamp(p.timestamp, "infrastructure");

    const timeline = Array.from(bucket.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([day, vals]) => ({ day, ...vals }));

    const topNews = [...liveStrikes, ...news]
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, 10)
      .map((p) => ({
        title: p.metadata?.original_headline ? String(p.metadata.original_headline) : p.title,
        severity: p.severity,
        source: p.source,
        timestamp: p.timestamp,
        url: String(p.metadata?.source_url ?? p.metadata?.article_url ?? p.metadata?.link ?? ""),
      }));

    const response: RegionIntelResponse = {
      selection,
      range,
      updatedAt: new Date().toISOString(),
      escalationIndex,
      conflictIndex,
      status,
      signals: {
        liveStrikes: liveStrikesCount,
        conflicts: conflictsCount,
        militaryFlights: flightsCount,
        navalVessels: vesselsCount,
        carrierSignals: carriersCount,
        criticalNews: criticalNewsCount,
        infrastructure: infraCount,
      },
      timeline,
      topNews,
      dataPoints,
    };

    return NextResponse.json(response, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "failed to build region intelligence",
      },
      { status: 500 }
    );
  }
}
