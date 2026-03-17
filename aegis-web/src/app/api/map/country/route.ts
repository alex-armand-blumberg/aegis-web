import { NextResponse } from "next/server";
import type { CountryIntelResponse, MapApiResponse } from "@/lib/intel/types";

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

function normCountry(v?: string): string {
  return (v || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function dayLabel(ts: number): string {
  const d = new Date(ts);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
    d.getUTCDate()
  ).padStart(2, "0")}`;
}

export async function GET(request: Request) {
  try {
    const { searchParams, origin } = new URL(request.url);
    const country = (searchParams.get("country") || "").trim();
    const range = searchParams.get("range") || "7d";
    if (!country) {
      return NextResponse.json({ error: "country is required" }, { status: 400 });
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

    const target = normCountry(country);
    const inCountry = (pCountry?: string) => normCountry(pCountry) === target;

    const conflicts = mapData.layers.conflicts.filter((p) => inCountry(p.country));
    const liveStrikes = mapData.layers.liveStrikes.filter((p) => inCountry(p.country));
    const flights = mapData.layers.flights.filter((p) => inCountry(p.country));
    const vessels = mapData.layers.vessels.filter((p) => inCountry(p.country));
    const carriers = mapData.layers.carriers.filter((p) => inCountry(p.country));
    const news = mapData.layers.news.filter((p) => inCountry(p.country));
    const infrastructure = mapData.layers.infrastructure.filter((p) => inCountry(p.country));

    const severityWeight = (s: string) =>
      s === "critical" ? 4 : s === "high" ? 3 : s === "medium" ? 2 : 1;

    const strikeScore = liveStrikes.reduce((acc, p) => acc + severityWeight(p.severity), 0);
    const conflictScore = conflicts.reduce((acc, p) => acc + severityWeight(p.severity), 0);
    const militaryScore =
      flights.length * 1.2 + vessels.length * 1.5 + carriers.length * 2.5;
    const infoScore = news.length * 0.5;
    const instabilityIndex = Math.max(
      0,
      Math.min(
        100,
        Math.round(
          strikeScore * 1.4 +
            conflictScore * 1.1 +
            militaryScore * 0.9 +
            infoScore * 0.8
        )
      )
    );
    const status =
      instabilityIndex >= 70 ? "critical" : instabilityIndex >= 40 ? "elevated" : "stable";

    const bucket = new Map<
      string,
      { liveStrikes: number; conflicts: number; military: number; protests: number; natural: number }
    >();
    const ensure = (k: string) =>
      bucket.get(k) ??
      bucket.set(k, { liveStrikes: 0, conflicts: 0, military: 0, protests: 0, natural: 0 }).get(k)!;

    const now = Date.now();
    for (let d = 6; d >= 0; d -= 1) {
      const ts = now - d * 24 * 3600_000;
      ensure(dayLabel(ts));
    }
    const stamp = (iso: string, key: "liveStrikes" | "conflicts" | "military") => {
      const k = dayLabel(new Date(iso).getTime());
      const b = ensure(k);
      b[key] += 1;
    };
    for (const p of liveStrikes) stamp(p.timestamp, "liveStrikes");
    for (const p of conflicts) stamp(p.timestamp, "conflicts");
    for (const p of flights) stamp(p.timestamp, "military");
    for (const p of vessels) stamp(p.timestamp, "military");
    for (const p of carriers) stamp(p.timestamp, "military");

    const timeline = Array.from(bucket.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([day, vals]) => ({ day, ...vals }));

    const topNews = [...liveStrikes, ...news]
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, 10)
      .map((p) => ({
        title: p.metadata?.original_headline
          ? String(p.metadata.original_headline)
          : p.title,
        severity: p.severity,
        source: p.source,
        timestamp: p.timestamp,
      }));

    const response: CountryIntelResponse = {
      country,
      range,
      updatedAt: new Date().toISOString(),
      instabilityIndex,
      status,
      signals: {
        liveStrikes: liveStrikes.length,
        conflicts: conflicts.length,
        militaryFlights: flights.length,
        navalVessels: vessels.length,
        carrierSignals: carriers.length,
        protests: conflicts.filter((p) => String(p.metadata?.protests || 0) !== "0").length,
        criticalNews: topNews.filter((n) => n.severity === "critical").length,
      },
      timeline,
      topNews,
      militaryActivity: {
        ownFlights: flights.length,
        foreignFlights: 0,
        navalVessels: vessels.length,
        foreignPresence: carriers.length > 0 ? "yes" : "no",
        nearestMilitaryBaseKm: infrastructure.length ? 120 : undefined,
      },
      infrastructureExposure: {
        nearbyCritical: infrastructure.length,
        nearestCriticalKm: infrastructure.length ? 150 : undefined,
      },
    };

    return NextResponse.json(response, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "failed to build country intelligence",
      },
      { status: 500 }
    );
  }
}
