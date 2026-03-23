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

function extractImpactCountryCandidates(p: IntelPoint): string[] {
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

function extractActorCountryCandidates(p: IntelPoint): string[] {
  const out: string[] = [];
  const push = (v: unknown) => {
    if (typeof v !== "string") return;
    const t = v.trim();
    if (!t) return;
    out.push(t);
  };
  const md = p.metadata;
  if (!md) return out;
  push(md.actor_country);
  push(md.operator_country);
  push(md.origin_country);
  return out;
}

function buildCountryScopeMatcher(selectionCountry: string): (p: IntelPoint) => boolean {
  const canonicalSelection = canonicalCountryMatchKey(selectionCountry);
  const bounds = getCountryBounds(selectionCountry);
  return (p: IntelPoint) => {
    const impactCandidates = extractImpactCountryCandidates(p);
    if (
      impactCandidates.some((c) => {
        const key = canonicalCountryMatchKey(c);
        return key && key === canonicalSelection;
      })
    ) {
      return true;
    }

    // Actor matching is only used for kinetic/news signals; it lets countries
    // that launched strikes (e.g., Russia -> Iran) show up in the actor's risk gauge.
    if (p.layer === "liveStrikes" || p.layer === "conflicts") {
      const actorCandidates = extractActorCountryCandidates(p);
      if (
        actorCandidates.some((c) => {
          const key = canonicalCountryMatchKey(c);
          return key && key === canonicalSelection;
        })
      ) {
        return true;
      }
    }
    // Some feeds omit country labels; use a geographic fallback to avoid dropping valid points.
    if (bounds && pointInBounds(p, bounds)) {
      return true;
    }
    return countriesMatch(selectionCountry, p.country);
  };
}

function scaledIndex(raw: number, denominator: number): number {
  if (raw <= 0 || denominator <= 0) return 0;
  const normalized = Math.max(0, raw / denominator);
  const curved = 100 * (1 - Math.exp(-normalized));
  return clampIndex(curved);
}

function metaNumber(p: IntelPoint, key: string): number {
  const v = p.metadata?.[key];
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
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
    const scopedVolume = dataPoints.length;
    const liveStrikesCount = layerCounts.liveStrikes ?? 0;
    const conflictsCount = layerCounts.conflicts ?? 0;
    const flightsCount = layerCounts.flights ?? 0;
    const vesselsCount = layerCounts.vessels ?? 0;
    const carriersCount = layerCounts.carriers ?? 0;
    const infraCount = layerCounts.infrastructure ?? 0;
    const criticalNewsCount = news.filter((n) => n.severity === "critical").length;
    const kineticVolume = liveStrikesCount + conflictsCount;
    const mobilityVolume = flightsCount + vesselsCount + carriersCount;
    const mobilityComposite = flightsCount + vesselsCount * 0.8 + carriersCount * 1.2;
    const kineticSeverityMass = [...liveStrikes, ...conflicts].reduce((sum, p) => sum + severityWeight(p.severity), 0);
    const totalFatalities = [...conflicts, ...liveStrikes].reduce((sum, p) => sum + metaNumber(p, "fatalities"), 0);
    const totalBattles = conflicts.reduce((sum, p) => sum + metaNumber(p, "battles"), 0);
    const totalExplosions = conflicts.reduce((sum, p) => sum + metaNumber(p, "explosions"), 0);
    const totalCivilians = conflicts.reduce((sum, p) => sum + metaNumber(p, "civilians"), 0);

    const fatalitiesSignal = Math.min(45, Math.sqrt(Math.max(0, totalFatalities)) * 3.2);
    const battlesSignal = Math.min(40, Math.sqrt(Math.max(0, totalBattles)) * 4.0);
    const explosionsSignal = Math.min(36, Math.sqrt(Math.max(0, totalExplosions)) * 3.4);
    const civilianSignal = Math.min(30, Math.sqrt(Math.max(0, totalCivilians)) * 3.0);
    const evidenceFactor = Math.min(1, (kineticVolume + criticalNewsCount + fatalitiesSignal / 8) / 8);

    const kineticEvidenceRaw =
      liveStrikesCount * 4.2 +
      conflictsCount * 3.4 +
      kineticSeverityMass * 0.5 +
      fatalitiesSignal * 1.1 +
      battlesSignal * 0.9 +
      explosionsSignal * 0.8 +
      civilianSignal * 0.9;

    const escalationRaw =
      kineticEvidenceRaw +
      criticalNewsCount * 1.2 +
      infraCount * 0.45 +
      mobilityComposite * (0.15 + 0.85 * evidenceFactor);
    const conflictRaw = kineticEvidenceRaw + criticalNewsCount * 0.8 + infraCount * 0.12;
    const escalationDenominator = 26 + Math.sqrt(Math.max(1, scopedVolume)) * 1.4 + Math.sqrt(mobilityVolume) * 0.6;
    const conflictDenominator = 20 + Math.sqrt(kineticVolume + 1) * 1.1 + Math.sqrt(1 + fatalitiesSignal) * 0.5;
    let escalationIndex = scaledIndex(escalationRaw, escalationDenominator);
    let conflictIndex = scaledIndex(conflictRaw, conflictDenominator);
    if (kineticVolume === 0 && fatalitiesSignal < 6) {
      conflictIndex = Math.min(conflictIndex, 22);
      if (criticalNewsCount < 2) escalationIndex = Math.min(escalationIndex, 32);
    }
    if (scopedVolume > 0 && escalationIndex === 0) {
      escalationIndex =
        kineticVolume > 0 || fatalitiesSignal > 0
          ? Math.min(28, 8 + Math.round(Math.sqrt(kineticVolume * 2 + fatalitiesSignal / 3 + criticalNewsCount)))
          : Math.min(10, 2 + Math.round(Math.sqrt(Math.max(1, mobilityVolume)) * 0.8));
    }
    if (scopedVolume > 0 && conflictIndex === 0) {
      conflictIndex =
        kineticVolume > 0 || fatalitiesSignal > 0
          ? Math.min(26, 7 + Math.round(Math.sqrt(kineticVolume * 2 + fatalitiesSignal / 4)))
          : 0;
    }
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
