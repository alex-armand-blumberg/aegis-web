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

    // Actor matching for outbound military projection signals.
    if (
      p.layer === "liveStrikes" ||
      p.layer === "conflicts" ||
      p.layer === "carriers"
    ) {
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

function isIndexEligibleConflictPoint(p: IntelPoint): boolean {
  return p.layer === "conflicts" && p.source !== "ACLED ArcGIS";
}

function impactCountryMatchesSelection(p: IntelPoint, selectionCountry: string): boolean {
  const canonicalSelection = canonicalCountryMatchKey(selectionCountry);
  if (!canonicalSelection) return false;
  return extractImpactCountryCandidates(p).some((c) => canonicalCountryMatchKey(c) === canonicalSelection);
}

function actorCountryMatchesSelection(p: IntelPoint, selectionCountry: string): boolean {
  const canonicalSelection = canonicalCountryMatchKey(selectionCountry);
  if (!canonicalSelection) return false;
  return extractActorCountryCandidates(p).some((c) => canonicalCountryMatchKey(c) === canonicalSelection);
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
    const indexConflicts = conflicts.filter(isIndexEligibleConflictPoint);
    const kineticPoints = [...liveStrikes, ...indexConflicts];
    const impactKineticPoints =
      selection.kind === "country"
        ? kineticPoints.filter((p) => impactCountryMatchesSelection(p, selection.country ?? selection.name))
        : kineticPoints;
    const actorKineticOnlyPoints =
      selection.kind === "country"
        ? kineticPoints.filter((p) => !impactCountryMatchesSelection(p, selection.country ?? selection.name))
        : [];
    const outboundActorLiveStrikes =
      selection.kind === "country"
        ? mapData.layers.liveStrikes.filter(
            (p) =>
              actorCountryMatchesSelection(p, selection.country ?? selection.name) &&
              !impactCountryMatchesSelection(p, selection.country ?? selection.name)
          )
        : [];
    const outboundActorConflicts =
      selection.kind === "country"
        ? mapData.layers.conflicts
            .filter(isIndexEligibleConflictPoint)
            .filter(
              (p) =>
                actorCountryMatchesSelection(p, selection.country ?? selection.name) &&
                !impactCountryMatchesSelection(p, selection.country ?? selection.name)
            )
        : [];
    const outboundActorCarriers =
      selection.kind === "country"
        ? mapData.layers.carriers.filter(
            (p) =>
              actorCountryMatchesSelection(p, selection.country ?? selection.name) &&
              !impactCountryMatchesSelection(p, selection.country ?? selection.name)
          )
        : [];
    const outboundActorFlights =
      selection.kind === "country"
        ? mapData.layers.flights.filter(
            (p) =>
              actorCountryMatchesSelection(p, selection.country ?? selection.name) &&
              !impactCountryMatchesSelection(p, selection.country ?? selection.name)
          )
        : [];

    const impactLiveStrikesCount = impactKineticPoints.filter((p) => p.layer === "liveStrikes").length;
    const impactConflictsCount = impactKineticPoints.filter(isIndexEligibleConflictPoint).length;
    const impactKineticVolume = impactLiveStrikesCount + impactConflictsCount;
    const actorKineticVolume = actorKineticOnlyPoints.length;
    const outboundActorKineticVolume =
      outboundActorLiveStrikes.length + outboundActorConflicts.length + outboundActorCarriers.length;
    const outboundActorSupportVolume = outboundActorFlights.length;
    const mobilityVolume = flightsCount + vesselsCount + carriersCount;
    const mobilityComposite = flightsCount + vesselsCount * 0.8 + carriersCount * 1.2;

    const impactKineticSeverityMass = impactKineticPoints.reduce((sum, p) => sum + severityWeight(p.severity), 0);
    const impactConflictPoints = impactKineticPoints.filter(isIndexEligibleConflictPoint);
    const impactFatalities = impactKineticPoints.reduce((sum, p) => sum + metaNumber(p, "fatalities"), 0);
    const impactBattles = impactConflictPoints.reduce((sum, p) => sum + metaNumber(p, "battles"), 0);
    const impactExplosions = impactConflictPoints.reduce((sum, p) => sum + metaNumber(p, "explosions"), 0);
    const impactCivilians = impactConflictPoints.reduce((sum, p) => sum + metaNumber(p, "civilians"), 0);

    const fatalitiesSignal = Math.min(55, Math.sqrt(Math.max(0, impactFatalities)) * 3.8);
    const battlesSignal = Math.min(48, Math.sqrt(Math.max(0, impactBattles)) * 4.2);
    const explosionsSignal = Math.min(40, Math.sqrt(Math.max(0, impactExplosions)) * 3.5);
    const civilianSignal = Math.min(34, Math.sqrt(Math.max(0, impactCivilians)) * 3.1);

    const impactIntensityRaw =
      impactLiveStrikesCount * 5.2 +
      impactConflictsCount * 4.4 +
      impactKineticSeverityMass * 0.6 +
      fatalitiesSignal * 1.3 +
      battlesSignal * 1.0 +
      explosionsSignal * 0.9 +
      civilianSignal * 1.0;

    const actorProjectionRaw = actorKineticVolume * 6.4 + carriersCount * 2.0 + flightsCount * 0.28;
    const outboundProjectionRaw =
      outboundActorKineticVolume * 6.4 +
      outboundActorSupportVolume * (outboundActorKineticVolume > 0 ? 0.58 : 0.1);
    const evidenceFactor = Math.min(1, (impactKineticVolume + fatalitiesSignal / 9 + criticalNewsCount) / 9);

    const escalationRaw =
      impactIntensityRaw +
      actorProjectionRaw * 1.3 +
      outboundProjectionRaw * 1.22 +
      criticalNewsCount * 1.0 +
      mobilityComposite * (0.04 + 0.2 * evidenceFactor);
    const conflictRaw =
      impactIntensityRaw +
      actorProjectionRaw * 0.32 +
      outboundProjectionRaw * 0.62 +
      criticalNewsCount * 0.65 +
      infraCount * 0.08;

    const escalationDenominator =
      30 + Math.sqrt(Math.max(1, scopedVolume)) * 1.35 + Math.sqrt(mobilityVolume) * 0.35 + Math.sqrt(impactKineticVolume + 1) * 0.8;
    const conflictDenominator =
      24 + Math.sqrt(impactKineticVolume + 1) * 1.2 + Math.sqrt(1 + fatalitiesSignal) * 0.8;
    let escalationIndex = scaledIndex(escalationRaw, escalationDenominator);
    let conflictIndex = scaledIndex(conflictRaw, conflictDenominator);

    // Guardrails: war-impact theaters should rank above low-impact actor/projection countries.
    const impactBand = impactKineticVolume + fatalitiesSignal / 10 + battlesSignal / 12;
    if (impactBand >= 18) {
      escalationIndex = Math.max(escalationIndex, 90);
      conflictIndex = Math.max(conflictIndex, 86);
    } else if (impactBand >= 11) {
      escalationIndex = Math.max(escalationIndex, 76);
      conflictIndex = Math.max(conflictIndex, 70);
    } else if (impactBand >= 6) {
      escalationIndex = Math.max(escalationIndex, 60);
      conflictIndex = Math.max(conflictIndex, 54);
    }

    if (impactBand < 3 && impactFatalities < 6) {
      escalationIndex = Math.min(escalationIndex, 58);
      conflictIndex = Math.min(conflictIndex, 46);
    }
    if (impactBand < 2 && actorKineticVolume > impactKineticVolume * 2) {
      escalationIndex = Math.min(escalationIndex, 55);
      conflictIndex = Math.min(conflictIndex, 42);
    }
    if (impactBand < 3) {
      if (outboundActorKineticVolume >= 3 || outboundActorSupportVolume >= 12) {
        escalationIndex = Math.max(escalationIndex, 62);
        conflictIndex = Math.max(conflictIndex, 36);
      } else if (outboundActorKineticVolume >= 1 || outboundActorSupportVolume >= 5) {
        escalationIndex = Math.max(escalationIndex, 48);
        conflictIndex = Math.max(conflictIndex, 26);
      }
    }
    if (impactBand < 3 && (actorKineticVolume >= 3 || outboundActorKineticVolume >= 2)) {
      escalationIndex = Math.max(escalationIndex, outboundActorKineticVolume >= 4 ? 48 : 38);
      conflictIndex = Math.max(conflictIndex, outboundActorKineticVolume >= 3 ? 26 : 18);
    }

    // Deterministic outbound floor for highly active force-projection countries (US-targeted lift).
    const selectedCountry = selection.kind === "country" ? canonicalCountryMatchKey(selection.country ?? selection.name) : "";
    const isUnitedStatesSelection =
      selectedCountry === "united states" || selectedCountry === "united states of america" || selectedCountry === "usa";
    const strongOutboundPosture = outboundActorKineticVolume >= 4 || outboundActorSupportVolume >= 24;
    const veryStrongOutboundPosture = outboundActorKineticVolume >= 7 || outboundActorSupportVolume >= 45;

    if (impactBand < 6 && strongOutboundPosture) {
      escalationIndex = Math.max(escalationIndex, 60);
      conflictIndex = Math.max(conflictIndex, 35);
    }
    if (impactBand < 6 && veryStrongOutboundPosture) {
      escalationIndex = Math.max(escalationIndex, 68);
      conflictIndex = Math.max(conflictIndex, 42);
    }
    if (impactBand < 6 && isUnitedStatesSelection && strongOutboundPosture) {
      escalationIndex = Math.max(escalationIndex, 66);
      conflictIndex = Math.max(conflictIndex, 39);
    }
    if (impactBand < 6 && isUnitedStatesSelection && veryStrongOutboundPosture) {
      escalationIndex = Math.max(escalationIndex, 74);
      conflictIndex = Math.max(conflictIndex, 46);
    }

    // Passive-state suppression: if there is almost no homeland impact and no outbound kinetic
    // pressure, keep both gauges in low bands.
    if (impactBand < 2.5 && outboundActorKineticVolume === 0 && outboundActorSupportVolume === 0 && actorKineticVolume < 2) {
      escalationIndex = Math.min(escalationIndex, 12);
      conflictIndex = Math.min(conflictIndex, 8);
    }

    if (scopedVolume > 0 && escalationIndex === 0) {
      escalationIndex =
        impactKineticVolume > 0 || fatalitiesSignal > 0
          ? Math.min(40, 12 + Math.round(Math.sqrt(impactKineticVolume * 3 + fatalitiesSignal / 2 + criticalNewsCount)))
          : Math.min(10, 2 + Math.round(Math.sqrt(Math.max(1, mobilityVolume)) * 0.8));
    }
    if (scopedVolume > 0 && conflictIndex === 0) {
      conflictIndex =
        impactKineticVolume > 0 || fatalitiesSignal > 0
          ? Math.min(36, 10 + Math.round(Math.sqrt(impactKineticVolume * 3 + fatalitiesSignal / 3)))
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
