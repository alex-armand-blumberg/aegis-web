import { NextResponse } from "next/server";
import type {
  IntelPoint,
  MapApiResponse,
  RegionIntelResponse,
  RegionSelection,
} from "@/lib/intel/types";
import { countriesMatch, formatCountryDisplayName } from "@/lib/countryDisplay";
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

export async function GET(request: Request) {
  try {
    const { searchParams, origin } = new URL(request.url);
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
      { cache: "no-store" }
    );
    const mapData = (await mapRes.json()) as MapApiResponse;
    if (!mapRes.ok || !mapData.layers) {
      return NextResponse.json({ error: "failed to fetch map feeds" }, { status: 502 });
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
      inScope = (p) => countriesMatch(selection.country, p.country);
    }

    const conflicts = mapData.layers.conflicts.filter(inScope);
    const liveStrikes = mapData.layers.liveStrikes.filter(inScope);
    const flights = mapData.layers.flights.filter(inScope);
    const vessels = mapData.layers.vessels.filter(inScope);
    const carriers = mapData.layers.carriers.filter(inScope);
    const news = mapData.layers.news.filter(inScope);
    const infrastructure = mapData.layers.infrastructure.filter(inScope);

    const escalationIndex = clampIndex(
      liveStrikes.reduce((s, p) => s + severityWeight(p.severity) * 2.2, 0) +
        conflicts.reduce((s, p) => s + severityWeight(p.severity) * 1.6, 0) +
        flights.length * 1.2 +
        vessels.length * 1.1 +
        carriers.length * 2.4 +
        news.filter((n) => n.severity === "critical").length * 1.5 +
        infrastructure.length * 0.6
    );
    const conflictIndex = clampIndex(
      liveStrikes.reduce((s, p) => s + severityWeight(p.severity) * 2.5, 0) +
        conflicts.reduce((s, p) => s + severityWeight(p.severity) * 1.9, 0) +
        news.length * 0.35
    );
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

    const response: RegionIntelResponse = {
      selection,
      range,
      updatedAt: new Date().toISOString(),
      escalationIndex,
      conflictIndex,
      status,
      signals: {
        liveStrikes: liveStrikes.length,
        conflicts: conflicts.length,
        militaryFlights: flights.length,
        navalVessels: vessels.length,
        carrierSignals: carriers.length,
        criticalNews: news.filter((n) => n.severity === "critical").length,
        infrastructure: infrastructure.length,
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
