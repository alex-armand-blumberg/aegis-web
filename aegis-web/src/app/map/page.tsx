"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  EscalationRiskCountry,
  IntelLayerKey,
  IntelPoint,
  MapApiResponse,
  RegionIntelResponse,
  RegionMarketQuote,
  RegionSelection,
} from "@/lib/intel/types";
import { layerColorCss } from "@/lib/intel/colors";
import { canonicalCountryMatchKey, countriesMatch, formatCountryDisplayName } from "@/lib/countryDisplay";
import { getCountryBounds } from "@/lib/countryBounds";
import { getOceanRegionByKey, pointInRegion } from "@/lib/regionGeometry";
import IntelInfoPanel from "@/components/IntelInfoPanel";
import RegionIntelPanel from "@/components/RegionIntelPanel";

const ConflictMap = dynamic(() => import("@/components/ConflictMap"), {
  ssr: false,
});
const ConflictGlobe = dynamic(() => import("@/components/ConflictGlobe"), {
  ssr: false,
});

const TIME_RANGES = ["1h", "6h", "24h", "7d", "30d"] as const;
const CONFLICT_SUBTYPE_LAYERS: IntelLayerKey[] = [
  "conflictsBattles",
  "conflictsExplosions",
  "conflictsCivilians",
  "conflictsStrategic",
  "conflictsProtests",
  "conflictsRiots",
];
const ALL_LAYERS: IntelLayerKey[] = [
  ...CONFLICT_SUBTYPE_LAYERS,
  "liveStrikes",
  "flights",
  "vessels",
  "carriers",
  "news",
  "escalationRisk",
  "hotspots",
  "infrastructure",
];
const LAYER_LABELS: Record<IntelLayerKey, string> = {
  conflicts: "Conflicts (all)",
  conflictsBattles: "ACLED Battles",
  conflictsExplosions: "ACLED Explosions",
  conflictsCivilians: "ACLED Civilians",
  conflictsStrategic: "ACLED Strategic",
  conflictsProtests: "ACLED Protests",
  conflictsRiots: "ACLED Riots",
  liveStrikes: "Live Strikes",
  flights: "Flights",
  vessels: "Vessels",
  troopMovements: "Troop Movements",
  carriers: "Carriers",
  news: "News",
  escalationRisk: "Escalation Risk",
  hotspots: "Hotspots",
  infrastructure: "Infrastructure",
};


function buildInitialLayerState(): Record<IntelLayerKey, boolean> {
  return {
    conflicts: false,
    conflictsBattles: true,
    conflictsExplosions: true,
    conflictsCivilians: true,
    conflictsStrategic: true,
    conflictsProtests: false,
    conflictsRiots: false,
    liveStrikes: true,
    flights: false,
    vessels: false,
    troopMovements: false,
    carriers: true,
    news: true,
    escalationRisk: true,
    hotspots: true,
    infrastructure: true,
  };
}

function isConflictSubtypeLayer(layer: IntelLayerKey): boolean {
  return CONFLICT_SUBTYPE_LAYERS.includes(layer);
}

function getAllConflictPoints(layers: Record<IntelLayerKey, IntelPoint[]>): IntelPoint[] {
  const points = CONFLICT_SUBTYPE_LAYERS.flatMap((k) => layers[k] ?? []);
  if (points.length > 0) return points;
  return layers.conflicts ?? [];
}

function simplifyProviderMessage(message: string): string {
  return message
    .replace(/\s*\[reason=[^\]]+\]/gi, "")
    .replace(/\s*\[source_packs=[^\]]+\]/gi, "")
    .replace(/\s*\[cache=[^\]]+\]/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function formatRangeLabel(range: string): string {
  if (range === "1h") return "1 hour";
  if (range === "6h") return "6 hours";
  if (range === "24h") return "24 hours";
  if (range === "7d") return "7 days";
  if (range === "30d") return "30 days";
  return range;
}

function severityWeight(sev: IntelPoint["severity"]): number {
  if (sev === "critical") return 4;
  if (sev === "high") return 3;
  if (sev === "medium") return 2;
  return 1;
}

function clampIndex(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v)));
}

function scaledIndex(raw: number, denominator: number): number {
  if (raw <= 0 || denominator <= 0) return 0;
  const normalized = Math.max(0, raw / denominator);
  return clampIndex(100 * (1 - Math.exp(-normalized)));
}

function metaNumber(p: IntelPoint, key: string): number {
  const v = p.metadata?.[key];
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function isIndexEligibleConflictPoint(p: IntelPoint): boolean {
  return (p.layer === "conflicts" || isConflictSubtypeLayer(p.layer)) && p.source !== "ACLED ArcGIS";
}

function impactCountryMatchesSelection(p: IntelPoint, selectionCountry: string): boolean {
  const canonical = canonicalCountryMatchKey(selectionCountry);
  if (!canonical) return false;
  return pointCountryCandidates(p).some((c) => canonicalCountryMatchKey(c) === canonical);
}

function actorCountryMatchesSelection(p: IntelPoint, selectionCountry: string): boolean {
  const canonical = canonicalCountryMatchKey(selectionCountry);
  if (!canonical) return false;
  return actorPointCountryCandidates(p).some((c) => canonicalCountryMatchKey(c) === canonical);
}

function pointCountryCandidates(p: IntelPoint): string[] {
  const out: string[] = [];
  const push = (v: unknown) => {
    if (typeof v !== "string") return;
    const t = v.trim();
    if (t) out.push(t);
  };
  push(p.country);
  push(p.metadata?.country);
  push(p.metadata?.country_name);
  push(p.metadata?.location_country);
  push(p.metadata?.nation);
  return out;
}

function actorPointCountryCandidates(p: IntelPoint): string[] {
  const out: string[] = [];
  const push = (v: unknown) => {
    if (typeof v !== "string") return;
    const t = v.trim();
    if (t) out.push(t);
  };
  push(p.metadata?.actor_country);
  push(p.metadata?.operator_country);
  push(p.metadata?.origin_country);
  return out;
}

function inCountryScope(country: string, p: IntelPoint): boolean {
  const canonical = canonicalCountryMatchKey(country);
  const byLabel = pointCountryCandidates(p).some((c) => canonicalCountryMatchKey(c) === canonical);
  if (byLabel || countriesMatch(country, p.country)) return true;

  // Actor matching: if impact country doesn't match, allow outbound military
  // projection signals to still be attributed to launching/operating country.
  if (
    p.layer === "liveStrikes" ||
    p.layer === "conflicts" ||
    isConflictSubtypeLayer(p.layer) ||
    p.layer === "carriers"
  ) {
    const actorMatches = actorPointCountryCandidates(p).some((c) => canonicalCountryMatchKey(c) === canonical);
    if (actorMatches) return true;
  }

  const bounds = getCountryBounds(country);
  if (!bounds) return false;
  const [[minLat, minLon], [maxLat, maxLon]] = bounds;
  return p.lat >= minLat && p.lat <= maxLat && p.lon >= minLon && p.lon <= maxLon;
}

function buildLocalRegionIntel(
  data: MapApiResponse,
  selection: RegionSelection,
  range: string
): RegionIntelResponse {
  const inScope =
    selection.kind === "ocean"
      ? (() => {
          const feature = getOceanRegionByKey(selection.key);
          return (p: IntelPoint) => (feature ? pointInRegion(p.lon, p.lat, feature) : false);
        })()
      : (p: IntelPoint) => inCountryScope(selection.country || selection.name, p);

  const conflictPoints = getAllConflictPoints(data.layers);
  const dataPoints = [
    ...data.layers.liveStrikes,
    ...conflictPoints,
    ...data.layers.flights,
    ...data.layers.vessels,
    ...data.layers.carriers,
    ...data.layers.infrastructure,
    ...data.layers.news,
  ]
    .filter(inScope)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 220);

  const counts = dataPoints.reduce<Record<string, number>>((acc, p) => {
    acc[p.layer] = (acc[p.layer] ?? 0) + 1;
    return acc;
  }, {});
  const liveStrikes = counts.liveStrikes ?? 0;
  const conflicts = dataPoints.filter((p) => isConflictSubtypeLayer(p.layer) || p.layer === "conflicts").length;
  const flights = counts.flights ?? 0;
  const vessels = counts.vessels ?? 0;
  const carriers = counts.carriers ?? 0;
  const infrastructure = counts.infrastructure ?? 0;
  const criticalNews = dataPoints.filter((p) => p.layer === "news" && p.severity === "critical").length;
  const volume = dataPoints.length;
  const indexConflicts = dataPoints.filter(isIndexEligibleConflictPoint);
  const kineticPoints = [...dataPoints.filter((p) => p.layer === "liveStrikes"), ...indexConflicts];
  const impactKineticPoints = kineticPoints.filter((p) => impactCountryMatchesSelection(p, selection.country || selection.name));
  const actorKineticOnlyPoints = kineticPoints.filter((p) => !impactCountryMatchesSelection(p, selection.country || selection.name));
  const outboundActorLiveStrikes = data.layers.liveStrikes.filter(
    (p) =>
      actorCountryMatchesSelection(p, selection.country || selection.name) &&
      !impactCountryMatchesSelection(p, selection.country || selection.name)
  );
  const outboundActorConflicts = conflictPoints
    .filter(isIndexEligibleConflictPoint)
    .filter(
      (p) =>
        actorCountryMatchesSelection(p, selection.country || selection.name) &&
        !impactCountryMatchesSelection(p, selection.country || selection.name)
    );
  const outboundActorCarriers = data.layers.carriers.filter(
    (p) =>
      actorCountryMatchesSelection(p, selection.country || selection.name) &&
      !impactCountryMatchesSelection(p, selection.country || selection.name)
  );
  const outboundActorFlights = data.layers.flights.filter(
    (p) =>
      actorCountryMatchesSelection(p, selection.country || selection.name) &&
      !impactCountryMatchesSelection(p, selection.country || selection.name)
  );

  const impactLiveStrikes = impactKineticPoints.filter((p) => p.layer === "liveStrikes").length;
  const impactConflicts = impactKineticPoints.filter(isIndexEligibleConflictPoint).length;
  const impactKineticVolume = impactLiveStrikes + impactConflicts;
  const actorKineticVolume = actorKineticOnlyPoints.length;
  const outboundActorKineticVolume =
    outboundActorLiveStrikes.length + outboundActorConflicts.length + outboundActorCarriers.length;
  const outboundActorSupportVolume = outboundActorFlights.length;
  const mobilityVolume = flights + vessels + carriers;
  const mobilityComposite = flights + vessels * 0.8 + carriers * 1.2;

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
    impactLiveStrikes * 5.2 +
    impactConflicts * 4.4 +
    impactKineticSeverityMass * 0.6 +
    fatalitiesSignal * 1.3 +
    battlesSignal * 1.0 +
    explosionsSignal * 0.9 +
    civilianSignal * 1.0;

  const actorProjectionRaw = actorKineticVolume * 6.4 + carriers * 2.0 + flights * 0.28;
  const outboundProjectionRaw =
    outboundActorKineticVolume * 6.4 +
    outboundActorSupportVolume * (outboundActorKineticVolume > 0 ? 0.58 : 0.1);
  const evidenceFactor = Math.min(1, (impactKineticVolume + fatalitiesSignal / 9 + criticalNews) / 9);

  const escalationRaw =
    impactIntensityRaw +
    actorProjectionRaw * 1.3 +
    outboundProjectionRaw * 1.22 +
    criticalNews * 1.0 +
    mobilityComposite * (0.04 + 0.2 * evidenceFactor);
  const conflictRaw =
    impactIntensityRaw +
    actorProjectionRaw * 0.32 +
    outboundProjectionRaw * 0.62 +
    criticalNews * 0.65 +
    infrastructure * 0.08;

  const escalationDenominator =
    30 + Math.sqrt(Math.max(1, volume)) * 1.35 + Math.sqrt(mobilityVolume) * 0.35 + Math.sqrt(impactKineticVolume + 1) * 0.8;
  const conflictDenominator =
    24 + Math.sqrt(impactKineticVolume + 1) * 1.2 + Math.sqrt(1 + fatalitiesSignal) * 0.8;
  let escalationIndex = scaledIndex(escalationRaw, escalationDenominator);
  let conflictIndex = scaledIndex(conflictRaw, conflictDenominator);

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
  const selectedCountry = canonicalCountryMatchKey(selection.country || selection.name);
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
  if (volume > 0 && escalationIndex === 0) {
    escalationIndex =
      impactKineticVolume > 0 || fatalitiesSignal > 0
        ? Math.min(40, 12 + Math.round(Math.sqrt(impactKineticVolume * 3 + fatalitiesSignal / 2 + criticalNews)))
        : Math.min(10, 2 + Math.round(Math.sqrt(Math.max(1, mobilityVolume)) * 0.8));
  }
  if (volume > 0 && conflictIndex === 0) {
    conflictIndex =
      impactKineticVolume > 0 || fatalitiesSignal > 0
        ? Math.min(36, 10 + Math.round(Math.sqrt(impactKineticVolume * 3 + fatalitiesSignal / 3)))
        : 0;
  }
  // Final manual US floor override: keep US gauges elevated for active force projection
  // even when impact-country attribution is sparse in the current window.
  if (isUnitedStatesSelection) {
    const usOutboundSignal = outboundActorKineticVolume * 3 + Math.sqrt(Math.max(0, outboundActorSupportVolume)) * 2.4;
    const usEscalationFloor = Math.min(82, 64 + Math.round(usOutboundSignal));
    const usConflictFloor = Math.min(60, 40 + Math.round(usOutboundSignal * 0.55));
    escalationIndex = Math.max(escalationIndex, usEscalationFloor);
    conflictIndex = Math.max(conflictIndex, usConflictFloor);
  }

  return {
    selection,
    range,
    updatedAt: new Date().toISOString(),
    escalationIndex,
    conflictIndex,
    status:
      escalationIndex >= 70 || conflictIndex >= 70
        ? "critical"
        : escalationIndex >= 40 || conflictIndex >= 40
          ? "elevated"
          : "stable",
    signals: {
      liveStrikes,
      conflicts,
      militaryFlights: flights,
      navalVessels: vessels,
      carrierSignals: carriers,
      criticalNews,
      infrastructure,
    },
    timeline: [],
    topNews: dataPoints.slice(0, 10).map((p) => ({
      title: p.metadata?.original_headline ? String(p.metadata.original_headline) : p.title,
      severity: p.severity,
      source: p.source,
      timestamp: p.timestamp,
      url: String(p.metadata?.source_url ?? p.metadata?.article_url ?? p.metadata?.link ?? ""),
    })),
    dataPoints,
  };
}

function regionSelectionCacheKey(selection: RegionSelection, range: string): string {
  return `${selection.kind}:${selection.key}:${range}`;
}

export default function MapPage() {
  const [mode, setMode] = useState<"2d" | "3d">("2d");
  const [range, setRange] = useState<(typeof TIME_RANGES)[number]>("7d");
  const [activeLayers, setActiveLayers] = useState(buildInitialLayerState);
  const [apiData, setApiData] = useState<MapApiResponse | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<IntelPoint | null>(null);
  const [selectedRegion, setSelectedRegion] = useState<RegionSelection | null>(null);
  const [regionIntel, setRegionIntel] = useState<RegionIntelResponse | null>(null);
  const [regionHeroImage, setRegionHeroImage] = useState<string | null>(null);
  const [regionHeroLoading, setRegionHeroLoading] = useState(false);
  const [regionAiSummary, setRegionAiSummary] = useState("");
  const [regionAiError, setRegionAiError] = useState<string | null>(null);
  const [regionAiLoading, setRegionAiLoading] = useState(false);
  const [regionMarkets, setRegionMarkets] = useState<RegionMarketQuote[]>([]);
  const [regionMarketsLoading, setRegionMarketsLoading] = useState(false);
  const [pointAiSummary, setPointAiSummary] = useState<string>("");
  const [pointAiLoading, setPointAiLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [autoRotate, setAutoRotate] = useState(false);
  const [assistantMode, setAssistantMode] = useState<"summary" | "ask">("summary");
  const [assistantQuestion, setAssistantQuestion] = useState("");
  const [assistantAnswer, setAssistantAnswer] = useState("");
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [assistantError, setAssistantError] = useState<string | null>(null);
  const [syncElapsedSec, setSyncElapsedSec] = useState(0);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const recenterRef = useRef<(() => void) | null>(null);
  const aiSummaryCacheRef = useRef<Record<string, string>>({});
  const usedRegionImagesRef = useRef<Set<string>>(new Set());
  const regionIntelCacheRef = useRef<Record<string, RegionIntelResponse>>({});

  const requestedLayerList = useMemo(
    () => ALL_LAYERS.filter((k) => activeLayers[k]).join(","),
    [activeLayers]
  );
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setMapReady(false);
    try {
      const params = new URLSearchParams({
        range,
        layers: requestedLayerList,
      });
      const res = await fetch(`/api/map?${params.toString()}`);
      const data = (await res.json()) as MapApiResponse & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to load map feeds");
      setApiData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load map feeds");
      setApiData(null);
    } finally {
      setLoading(false);
    }
  }, [range, requestedLayerList]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!loading) {
      setSyncElapsedSec(0);
      return;
    }
    const t0 = Date.now();
    const id = window.setInterval(() => {
      setSyncElapsedSec(Math.floor((Date.now() - t0) / 1000));
    }, 400);
    return () => window.clearInterval(id);
  }, [loading]);

  useEffect(() => {
    if (!selectedRegion) {
      setRegionIntel(null);
      setRegionHeroImage(null);
      setRegionAiSummary("");
      setRegionAiError(null);
      setRegionMarkets([]);
      setRegionHeroLoading(false);
      setRegionAiLoading(false);
      setRegionMarketsLoading(false);
      return;
    }

    let active = true;
    const cacheKey = regionSelectionCacheKey(selectedRegion, range);
    const cachedIntel = regionIntelCacheRef.current[cacheKey];
    if (cachedIntel) {
      setRegionIntel(cachedIntel);
    } else if (apiData) {
      const localIntel = buildLocalRegionIntel(apiData, selectedRegion, range);
      regionIntelCacheRef.current[cacheKey] = localIntel;
      setRegionIntel(localIntel);
    } else {
      setRegionIntel(null);
    }

    const params = new URLSearchParams({
      kind: selectedRegion.kind,
      key: selectedRegion.key,
      name: selectedRegion.name,
      range,
    });
    const qs = params.toString();

    const loadCore = async () => {
      try {
        const res = await fetch(`/api/map/region?${qs}`);
        const data = (await res.json()) as RegionIntelResponse & { error?: string };
        if (!res.ok) throw new Error(data.error || "Failed region intelligence");
        if (active) {
          regionIntelCacheRef.current[cacheKey] = data;
          setRegionIntel(data);
        }
      } catch {
        if (!active) return;
        if (apiData) {
          const localIntel = buildLocalRegionIntel(apiData, selectedRegion, range);
          regionIntelCacheRef.current[cacheKey] = localIntel;
          setRegionIntel(localIntel);
        } else {
          setRegionIntel(regionIntelCacheRef.current[cacheKey] ?? null);
        }
      }
    };
    const loadImage = async () => {
      setRegionHeroLoading(true);
      setRegionHeroImage(null);
      try {
        const exclude = Array.from(usedRegionImagesRef.current).slice(-40).join(",");
        const imageQs = exclude ? `${qs}&exclude=${encodeURIComponent(exclude)}` : qs;
        const res = await fetch(`/api/map/region-hero-image?${imageQs}`);
        const data = (await res.json()) as { imageUrl?: string };
        if (active) {
          const rawPicked = res.ok ? data.imageUrl || null : null;
          if (rawPicked && /^https?:\/\//i.test(rawPicked)) {
            usedRegionImagesRef.current.add(rawPicked);
            setRegionHeroImage(`/api/map/image-proxy?url=${encodeURIComponent(rawPicked)}`);
          } else {
            setRegionHeroImage(null);
          }
        }
      } catch {
        if (active) setRegionHeroImage(null);
      } finally {
        if (active) setRegionHeroLoading(false);
      }
    };
    const loadSummary = async () => {
      setRegionAiLoading(true);
      setRegionAiError(null);
      try {
        const res = await fetch(`/api/map/region-ai-summary?${qs}`);
        const data = (await res.json()) as { summary?: string; error?: string };
        if (!active) return;
        if (res.ok) {
          setRegionAiSummary(data.summary || "");
          setRegionAiError(null);
          return;
        }
        const localIntel = apiData ? buildLocalRegionIntel(apiData, selectedRegion, range) : null;
        if (localIntel) {
          setRegionAiSummary(
            [
              `${localIntel.selection.name} ${formatRangeLabel(localIntel.range)} geopolitical snapshot:`,
              `- Escalation ${localIntel.escalationIndex}/100, conflict ${localIntel.conflictIndex}/100.`,
              `- Signals: strikes ${localIntel.signals.liveStrikes}, conflicts ${localIntel.signals.conflicts}, flights ${localIntel.signals.militaryFlights}, vessels ${localIntel.signals.navalVessels}, carriers ${localIntel.signals.carrierSignals}.`,
              localIntel.dataPoints[0] ? `- Latest mapped development: ${localIntel.dataPoints[0].title}` : "- No mapped points in current scope.",
            ].join("\n")
          );
          setRegionAiError(null);
        } else {
          setRegionAiSummary("");
          setRegionAiError("Summary temporarily unavailable");
        }
      } catch {
        if (!active) return;
        const localIntel = apiData ? buildLocalRegionIntel(apiData, selectedRegion, range) : null;
        if (localIntel) {
          setRegionAiSummary(
            [
              `${localIntel.selection.name} ${formatRangeLabel(localIntel.range)} geopolitical snapshot:`,
              `- Escalation ${localIntel.escalationIndex}/100, conflict ${localIntel.conflictIndex}/100.`,
              `- Signals: strikes ${localIntel.signals.liveStrikes}, conflicts ${localIntel.signals.conflicts}, flights ${localIntel.signals.militaryFlights}, vessels ${localIntel.signals.navalVessels}, carriers ${localIntel.signals.carrierSignals}.`,
              localIntel.dataPoints[0] ? `- Latest mapped development: ${localIntel.dataPoints[0].title}` : "- No mapped points in current scope.",
            ].join("\n")
          );
          setRegionAiError(null);
        } else {
          setRegionAiSummary("");
          setRegionAiError("Summary temporarily unavailable");
        }
      } finally {
        if (active) setRegionAiLoading(false);
      }
    };
    const loadMarkets = async () => {
      setRegionMarketsLoading(true);
      try {
        const res = await fetch(`/api/map/region-markets?${qs}`);
        const data = (await res.json()) as { markets?: RegionMarketQuote[] };
        if (active) setRegionMarkets(res.ok ? data.markets || [] : []);
      } catch {
        if (active) setRegionMarkets([]);
      } finally {
        if (active) setRegionMarketsLoading(false);
      }
    };

    void loadCore();
    void loadImage();
    void loadSummary();
    void loadMarkets();
    return () => {
      active = false;
    };
  }, [apiData, range, selectedRegion]);

  useEffect(() => {
    if (!selectedPoint) {
      setPointAiSummary("");
      setPointAiLoading(false);
      return;
    }

    const summaryKey = `${selectedPoint.id}:${selectedPoint.timestamp}`;
    const cached = aiSummaryCacheRef.current[summaryKey];
    if (cached) {
      setPointAiSummary(cached);
      setPointAiLoading(false);
      return;
    }

    const country = selectedPoint.country ?? "Unknown";
    const sourceUrl = String(selectedPoint.metadata?.source_url ?? "").trim();
    const snippet = String(selectedPoint.metadata?.source_snippet ?? "").trim();
    const publisher = String(selectedPoint.metadata?.publisher ?? selectedPoint.source ?? "Unknown");
    const eventType = String(selectedPoint.metadata?.event_type ?? "conflict_event");
    const selectedTs = Date.parse(selectedPoint.timestamp || "");
    const nearbySameCountry = (apiData?.layers.news ?? [])
      .filter((p) => p.country === country && p.id !== selectedPoint.id)
      .filter((p) => {
        const pType = String(p.metadata?.event_type ?? "").toLowerCase();
        if (!pType || pType === "conflict_event") return true;
        return pType === eventType.toLowerCase();
      })
      .filter((p) => {
        if (!Number.isFinite(selectedTs)) return true;
        const ts = Date.parse(p.timestamp || "");
        if (!Number.isFinite(ts)) return true;
        return Math.abs(ts - selectedTs) <= 5 * 24 * 3600_000;
      })
      .slice(0, 8)
      .map((p) => `${p.timestamp}: ${p.title} (${p.source})`)
      .join("\n");

    const prompt = [
      "You are summarizing a single mapped conflict event for an intelligence popup.",
      `Headline: ${selectedPoint.title}`,
      `Subtitle: ${selectedPoint.subtitle ?? "N/A"}`,
      `Event type: ${eventType}`,
      `Location country: ${country}`,
      `Timestamp: ${selectedPoint.timestamp}`,
      `Source label: ${selectedPoint.source}`,
      `Publisher: ${publisher}`,
      `Article URL: ${sourceUrl || "Unavailable"}`,
      `Source snippet: ${snippet || "Unavailable"}`,
      "Nearby same-country conflict signals (context):",
      nearbySameCountry || "Unavailable",
      "Write exactly 4 bullet points describing the actual event and immediate context.",
      "Each line must start with '- '.",
      "Prefix each bullet with either 'Confirmed:' or 'Inferred:'.",
      "Explain what happened, where, when, and who/what was targeted or involved.",
      "If available, include weapon/interception details and immediate trigger/background from the provided text.",
      "Use concrete event facts and numbers from provided content and full-article context when available.",
      "If details are sparse, infer the most likely event context from related headlines and nearby same-event signals only (do not say 'unknown' or 'not reported').",
      "Include at least one concrete date/number/statistic when available from evidence.",
      "Ignore unrelated political/economic/local headlines that do not match this event type and location.",
      "Do NOT mention confidence scores, magnitude scores, layer counts, or why the model flagged the event.",
      "No policy advice. Keep neutral intelligence tone.",
    ].join("\n");

    let cancelled = false;
    setPointAiLoading(true);
    fetch("/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "map_insight",
        maxTokens: 360,
        prompt,
      }),
    })
      .then(async (res) => {
        const data = (await res.json()) as { content?: string; error?: string };
        if (!res.ok) throw new Error(data.error ?? "Failed AI summary");
        const content =
          data.content?.trim() ||
          "- Inferred: Event context synthesis is running; this point remains tied to ongoing conflict indicators from mapped and external sources.";
        aiSummaryCacheRef.current[summaryKey] = content;
        if (!cancelled) setPointAiSummary(content);
      })
      .catch(() => {
        if (!cancelled)
          setPointAiSummary(
            "- Inferred: Event context synthesis is temporarily delayed. Re-open this point to refresh full evidence-based details."
          );
      })
      .finally(() => {
        if (!cancelled) setPointAiLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [apiData, selectedPoint]);

  const handleFullscreen = useCallback(() => {
    const el = mapContainerRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
      el.classList.remove("is-fullscreen");
    } else {
      el.requestFullscreen();
      el.classList.add("is-fullscreen");
    }
  }, []);

  useEffect(() => {
    const handler = () => {
      if (!document.fullscreenElement) {
        mapContainerRef.current?.classList.remove("is-fullscreen");
      }
    };
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const layers =
    apiData?.layers ??
    ({
      conflicts: [],
      conflictsBattles: [],
      conflictsExplosions: [],
      conflictsCivilians: [],
      conflictsStrategic: [],
      conflictsProtests: [],
      conflictsRiots: [],
      liveStrikes: [],
      flights: [],
      vessels: [],
      troopMovements: [],
      carriers: [],
      news: [],
      escalationRisk: [],
      hotspots: [],
      infrastructure: [],
    } as MapApiResponse["layers"]);

  const providerHealth = apiData?.providerHealth ?? [];
  const activeConflictCountries = apiData?.activeConflictCountries ?? [];
  const escalationRiskCountries: EscalationRiskCountry[] =
    apiData?.escalationRiskCountries ?? [];

  const totalVisible = ALL_LAYERS.reduce(
    (sum, layer) => sum + (activeLayers[layer] ? layers[layer].length : 0),
    0
  );

  const worldStateRisk = useMemo(() => {
    const conflictPoints = getAllConflictPoints(layers);
    const weightedSignals =
      layers.liveStrikes.reduce((s, p) => s + severityWeight(p.severity) * 2.5, 0) +
      conflictPoints.reduce((s, p) => s + severityWeight(p.severity) * 1.8, 0) +
      layers.news.reduce((s, p) => s + severityWeight(p.severity) * 0.7, 0) +
      layers.flights.length * 0.05 +
      layers.vessels.length * 0.04;
    const rawScaled = Math.min(100, Math.max(0, 100 - Math.exp(-weightedSignals / 360) * 100));
    const kineticVolume = layers.liveStrikes.length + conflictPoints.length;
    const criticalSignalCount =
      layers.liveStrikes.filter((p) => p.severity === "critical").length +
      conflictPoints.filter((p) => p.severity === "critical").length +
      layers.news.filter((p) => p.severity === "critical").length;
    const highSeverityCountries = new Set(
      [...layers.liveStrikes, ...conflictPoints, ...layers.news]
        .filter((p) => (p.severity === "high" || p.severity === "critical") && p.country)
        .map((p) => canonicalCountryMatchKey(p.country as string))
    );
    const crossTheaterBreadth = highSeverityCountries.size;
    // Reserve 96–99 for exceptional cross-theater escalation only.
    const extremeGlobalEscalation =
      kineticVolume >= 260 &&
      crossTheaterBreadth >= 14 &&
      criticalSignalCount >= 45 &&
      weightedSignals >= 1900;
    const compressedPercent = Math.round(Math.min(99, 100 * Math.pow(rawScaled / 100, 1.75)));
    const displayPercent = extremeGlobalEscalation ? compressedPercent : Math.min(95, compressedPercent);
    const status =
      rawScaled >= 76 ? "Critical stress" : rawScaled >= 58 ? "Elevated stress" : rawScaled >= 38 ? "Guarded" : "Stable";
    const bandExplanation =
      rawScaled >= 76
        ? "Frequent strike/conflict signals and high cross-theater activity are pushing global instability upward."
        : rawScaled >= 58
          ? "Sustained conflict reporting across multiple theaters is keeping risk elevated."
          : "Signal intensity is mixed, with fewer high-severity kinetic spikes in the current window.";
    const explanation =
      `${bandExplanation} Based on weighted counts of live strikes, conflict reports, and news in the selected time window, plus flight and vessel activity. High-90s now require exceptional multi-theater, high-severity escalation; 96–99% is reserved for near-global-war conditions, with 100% reserved for active global conflict.`;
    return { percent: displayPercent, status, explanation };
  }, [layers]);

  const hotspotSummary = useMemo(() => {
    const priorityTheaters = new Set([
      "iran",
      "israel",
      "sudan",
      "south sudan",
      "ukraine",
      "russia",
      "gaza",
      "palestine",
    ]);
    const merged = new Map<
      string,
      {
        country: string;
        score100: number;
        severity: "low" | "medium" | "high" | "critical";
        trend: "rising" | "stable" | "declining";
        latestEventAt: string;
        reason: string;
      }
    >();
    const upsert = (entry: {
      country: string;
      score100: number;
      severity: "low" | "medium" | "high" | "critical";
      trend: "rising" | "stable" | "declining";
      latestEventAt: string;
      reason: string;
    }) => {
      const key = canonicalCountryMatchKey(entry.country);
      const prev = merged.get(key);
      if (!prev) {
        merged.set(key, entry);
        return;
      }
      merged.set(key, {
        ...prev,
        score100: Math.max(prev.score100, entry.score100),
        severity:
          entry.severity === "critical" || prev.severity === "critical"
            ? "critical"
            : entry.severity === "high" || prev.severity === "high"
              ? "high"
              : entry.severity === "medium" || prev.severity === "medium"
                ? "medium"
                : "low",
        trend: prev.trend === "rising" || entry.trend === "rising" ? "rising" : prev.trend,
        latestEventAt: prev.latestEventAt > entry.latestEventAt ? prev.latestEventAt : entry.latestEventAt,
        reason: prev.reason,
      });
    };

    for (const h of escalationRiskCountries) {
      upsert({
        country: formatCountryDisplayName(h.country),
        score100: Math.max(0, Math.min(100, Math.round(h.riskScore * 5.9))),
        severity: h.severity,
        trend: h.trend,
        latestEventAt: h.latestEventAt,
        reason:
          h.signals.length > 0
            ? `Signals: ${h.signals.slice(0, 3).join(", ")}`
            : "Signals: rising multi-source conflict indicators",
      });
    }
    for (const c of activeConflictCountries) {
      upsert({
        country: formatCountryDisplayName(c.country),
        score100: Math.max(0, Math.min(100, Math.round(c.score * 6.8))),
        severity: c.severity,
        trend: "rising",
        latestEventAt: c.latestEventAt,
        reason:
          c.sources.length > 0
            ? `Signals: ${c.sources.slice(0, 3).join(", ")}`
            : "Signals: sustained war-like kinetic reporting",
      });
    }

    const sorted = Array.from(merged.values()).sort((a, b) => b.score100 - a.score100);
    const prioritized = sorted.filter((x) => priorityTheaters.has(canonicalCountryMatchKey(x.country)));
    const regular = sorted.filter((x) => !priorityTheaters.has(canonicalCountryMatchKey(x.country)));

    const manual = [
      {
        country: "South China Sea",
        score100: 50,
        severity: "medium" as const,
        trend: "rising" as const,
        reason: "Baseline tension; maritime standoffs and naval patrol pressure.",
      },
      {
        country: "Taiwan",
        score100: 50,
        severity: "medium" as const,
        trend: "rising" as const,
        reason: "Baseline tension; cross-strait military pressure narratives.",
      },
    ].map((m) => ({
      ...m,
      latestEventAt: new Date().toISOString(),
    }));

    const top = [...prioritized, ...regular].slice(0, 10);
    for (const m of manual) {
      if (top.length >= 10) break;
      if (!top.some((x) => canonicalCountryMatchKey(x.country) === canonicalCountryMatchKey(m.country))) top.push(m);
    }
    return top;
  }, [activeConflictCountries, escalationRiskCountries]);

  const relayDigestHealth = useMemo(
    () => providerHealth.find((h) => h.provider === "Relay seed digest"),
    [providerHealth]
  );
  const providerHealthDisplay = useMemo(
    () =>
      providerHealth.map((p) => ({
        ...p,
        message: simplifyProviderMessage(p.message || "No details"),
      })),
    [providerHealth]
  );
  const providerSummary = useMemo(() => {
    const ok = providerHealthDisplay.filter((p) => p.ok).length;
    const degraded = providerHealthDisplay.length - ok;
    return { ok, degraded, total: providerHealthDisplay.length };
  }, [providerHealthDisplay]);

  const handleAssistantRun = useCallback(async () => {
    if (!apiData) return;
    setAssistantLoading(true);
    setAssistantError(null);
    try {
      const conflictPoints = getAllConflictPoints(layers);
      const recent = [
        ...layers.liveStrikes,
        ...layers.news,
        ...conflictPoints,
      ]
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
        .slice(0, 40)
        .map((p) => `${p.timestamp} | ${p.country ?? "Unknown"} | ${p.title} | ${p.source}`)
        .join("\n");

      const prompt =
        assistantMode === "summary"
          ? [
              "Task: summarize major world conflict developments right now in short form.",
              `Map range: ${formatRangeLabel(range)}`,
              "Recent mapped events:",
              recent || "Unavailable",
              "Write 6 concise bullet points. Include regions, actors, and immediate developments.",
              "Use map evidence plus external online corroboration. Keep it short and precise.",
            ].join("\n")
          : [
              "Task: answer the user's map intelligence question fully.",
              `User question: ${assistantQuestion || "No question provided."}`,
              `Map range: ${formatRangeLabel(range)}`,
              "Recent mapped events:",
              recent || "Unavailable",
              "Answer in 6-10 bullet points. Use map evidence and external online corroboration.",
              "If uncertainty exists, state what is known and most likely explanation.",
            ].join("\n");

      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: assistantMode === "summary" ? "news_summary" : "sentinel_qa",
          maxTokens: 560,
          prompt,
        }),
      });
      const data = (await res.json()) as { content?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "AI assistant failed");
      setAssistantAnswer(data.content?.trim() || "No answer returned.");
    } catch (err) {
      setAssistantError(err instanceof Error ? err.message : "AI assistant failed.");
      setAssistantAnswer("");
    } finally {
      setAssistantLoading(false);
    }
  }, [apiData, assistantMode, assistantQuestion, layers, range]);

  const toggleLayer = (layer: IntelLayerKey) => {
    setActiveLayers((prev) => ({ ...prev, [layer]: !prev[layer] }));
  };

  const regionPanelData: RegionIntelResponse | null = useMemo(() => {
    if (regionIntel) return regionIntel;
    if (!selectedRegion) return null;
    if (apiData) return buildLocalRegionIntel(apiData, selectedRegion, range);
    const cached = regionIntelCacheRef.current[regionSelectionCacheKey(selectedRegion, range)];
    return cached ?? null;
  }, [apiData, regionIntel, selectedRegion, range]);

  return (
    <div className="map-page min-h-screen text-[#e2e8f0]">
      <nav>
        <Link href="/" className="nav-logo">
          AEG<span>I</span>S<sub className="logo-hq">hq</sub>
        </Link>
        <div className="nav-links">
          <Link href="/">Back to Home</Link>
          <Link href="/escalation">App</Link>
          <Link href="/map" className="nav-cta">
            Interactive Map
          </Link>
        </div>
      </nav>

      <main className="relative z-10 map-main-compact">
        <div className="map-top-section">
          <header className="map-page-title map-page-title-inline">
            <h1 className="map-page-title-heading">AEGIS Interactive Map</h1>
          </header>
          <div className="map-controls map-controls-inline" style={{ justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
            <span className="map-chip-label">View</span>
            <button
              type="button"
              className={mode === "2d" ? "btn-primary" : "btn-secondary"}
              style={{ padding: "8px 14px", fontSize: 12 }}
              onClick={() => setMode("2d")}
            >
              2D Map
            </button>
            <button
              type="button"
              className={mode === "3d" ? "btn-primary" : "btn-secondary"}
              style={{ padding: "8px 14px", fontSize: 12 }}
              onClick={() => setMode("3d")}
            >
              3D Globe
            </button>
            {mode === "3d" && (
              <button
                type="button"
                className={autoRotate ? "btn-primary" : "btn-secondary"}
                style={{ padding: "8px 14px", fontSize: 12 }}
                onClick={() => setAutoRotate((v) => !v)}
              >
                Auto-Rotate {autoRotate ? "On" : "Off"}
              </button>
            )}
            <span className="map-chip-label" style={{ marginLeft: 8 }}>Time</span>
            {TIME_RANGES.map((r) => (
              <button
                key={r}
                type="button"
                className={range === r ? "btn-primary" : "btn-secondary"}
                style={{ padding: "8px 10px", fontSize: 11 }}
                onClick={() => setRange(r)}
              >
                {formatRangeLabel(r)}
              </button>
            ))}
            <button
              type="button"
              className="btn-secondary"
              style={{ padding: "8px 14px", fontSize: 12 }}
              onClick={fetchData}
            >
              Refresh
            </button>
            <button
              type="button"
              className="btn-secondary"
              style={{ padding: "8px 14px", fontSize: 12 }}
              onClick={handleFullscreen}
            >
              Fullscreen
            </button>
            <button
              type="button"
              className="btn-secondary"
              style={{ padding: "8px 14px", fontSize: 12 }}
              onClick={() => {
                setSelectedPoint(null);
                recenterRef.current?.();
              }}
            >
              Recenter
            </button>
          </div>
        </div>

        <div className="map-content-wrap">
          <div className="map-layer-toolbar">
            {ALL_LAYERS.map((layer) => (
              <label key={layer} className="map-layer-toggle">
                <input
                  type="checkbox"
                  checked={activeLayers[layer]}
                  onChange={() => toggleLayer(layer)}
                />
                <span
                  className="map-layer-dot"
                  style={{ background: layerColorCss(layer) }}
                />
                <span>{LAYER_LABELS[layer]}</span>
                <span className="map-layer-count">{layers[layer].length}</span>
              </label>
            ))}
          </div>
          <div className="map-status-caption">
            Requested conflict source adapters run automatically; use layer toggles above only for visualization
            filtering. <strong>Vessels</strong> are maritime AIS (ships), not aircraft—enable <strong>flights</strong>{" "}
            for ADS-B military aircraft tracks.
          </div>

          <div className="map-status-bar">
            <span>Visible points: {totalVisible.toLocaleString()}</span>
            <span>
              Updated: {apiData ? new Date(apiData.updatedAt).toLocaleTimeString() : "--"}
            </span>
            <span>Range: {formatRangeLabel(range)}</span>
            <span>Adapters: core + requested-source live feeds</span>
          </div>
          <div className="map-status-caption">Zoom in for more points to become visible.</div>

          <div className="map-world-gauge">
            <div className="map-world-gauge-header">
              <span>World Stability Gauge</span>
              <strong>{worldStateRisk.percent}% risk</strong>
            </div>
            <div className="map-world-gauge-track">
              <div
                className="map-world-gauge-fill"
                style={{ width: `${worldStateRisk.percent}%` }}
              />
            </div>
            <div className="map-world-gauge-note">
              Status: <strong>{worldStateRisk.status}</strong>
            </div>
            <div className="map-world-gauge-explain">{worldStateRisk.explanation}</div>
          </div>

          {error && <div className="map-error-banner">{error}</div>}

          <div ref={mapContainerRef} className="map-container" style={{ position: "relative" }}>
            <div className="map-title-overlay">■ {formatRangeLabel(range).toUpperCase()} AEGIS MAP BETA</div>

            {selectedPoint && (
              <IntelInfoPanel
                point={selectedPoint}
                providerHealth={providerHealth}
                aiSummary={pointAiSummary}
                aiLoading={pointAiLoading}
                onClose={() => setSelectedPoint(null)}
              />
            )}

            {loading && (
              <div className="map-loading-pill">
                <span className="map-loading-pill-label">
                  Syncing feeds…
                  {` ${Math.max(0, syncElapsedSec)}s / ~1mn`}
                </span>
                <div
                  className="map-loading-pill-bar"
                  role="progressbar"
                  aria-valuetext="Syncing map feeds"
                />
              </div>
            )}

            {!mapReady && !loading && (
              <div className="map-loading-screen">Initializing map renderer...</div>
            )}

            {mode === "2d" ? (
              <ConflictMap
                layers={layers}
                activeLayers={activeLayers}
                recenterRef={recenterRef}
                onReady={() => setMapReady(true)}
                onError={(m) => setError(m)}
                onPointSelect={setSelectedPoint}
                onCountrySelect={(country) => {
                  setSelectedPoint(null);
                  setSelectedRegion({
                    kind: "country",
                    key: country.toLowerCase(),
                    name: country,
                    country,
                  });
                }}
                onRegionSelect={(selection) => {
                  setSelectedPoint(null);
                  setSelectedRegion(selection);
                }}
                activeConflictCountries={activeConflictCountries}
                escalationRiskCountries={escalationRiskCountries}
                frontlineOverlays={apiData?.frontlineOverlays ?? []}
              />
            ) : (
              <ConflictGlobe
                layers={layers}
                activeLayers={activeLayers}
                frontlineOverlays={apiData?.frontlineOverlays ?? []}
                recenterRef={recenterRef}
                onReady={() => setMapReady(true)}
                onError={(m) => setError(m)}
                onPointSelect={setSelectedPoint}
                autoRotate={autoRotate}
              />
            )}

            {selectedRegion && regionPanelData && (
              <RegionIntelPanel
                data={regionPanelData}
                imageUrl={regionHeroImage}
                imageLoading={regionHeroLoading}
                aiSummary={regionAiSummary}
                aiError={regionAiError}
                aiLoading={regionAiLoading}
                markets={regionMarkets}
                marketsLoading={regionMarketsLoading}
                onClose={() => {
                  setSelectedRegion(null);
                  setRegionIntel(null);
                }}
              />
            )}
          </div>

          <details className="map-provider-accordion">
            <summary>
              Adapter status: {providerSummary.ok}/{providerSummary.total} OK
              {providerSummary.degraded > 0 ? `, ${providerSummary.degraded} degraded` : ""}
            </summary>
            <div className="map-provider-grid">
              {providerHealthDisplay.map((p) => (
                <div key={p.provider} className="map-provider-card">
                  <div>
                    <div className="map-provider-name">{p.provider}</div>
                    <div className="map-provider-note">{p.message}</div>
                  </div>
                  <div className={p.ok ? "provider-ok" : "provider-bad"}>
                    {p.ok ? "OK" : "DEGRADED"}
                  </div>
                </div>
              ))}
            </div>
          </details>
          {relayDigestHealth && !relayDigestHealth.ok && (
            <div className="map-relay-note">
              Relay seed digest is optional. If it is degraded, core map adapters still run; this usually means the relay endpoint timed out or aborted upstream.
            </div>
          )}

          <div className="map-ai-assistant">
            <div className="map-ai-assistant-header">
              <h3>Map AI Assistant</h3>
              <p>Uses mapped feeds plus online corroboration.</p>
            </div>
            <div className="map-ai-assistant-actions">
              <button
                type="button"
                className={assistantMode === "summary" ? "btn-primary" : "btn-secondary"}
                style={{ padding: "8px 12px", fontSize: 12 }}
                onClick={() => setAssistantMode("summary")}
              >
                Summarize Global Events
              </button>
              <button
                type="button"
                className={assistantMode === "ask" ? "btn-primary" : "btn-secondary"}
                style={{ padding: "8px 12px", fontSize: 12 }}
                onClick={() => setAssistantMode("ask")}
              >
                Ask Map Question
              </button>
            </div>
            {assistantMode === "ask" && (
              <textarea
                className="map-ai-question"
                placeholder="Ask a question about current conflicts, military moves, escalation risk, or a region..."
                value={assistantQuestion}
                onChange={(e) => setAssistantQuestion(e.target.value)}
              />
            )}
            <button
              type="button"
              className="btn-secondary"
              style={{ padding: "8px 12px", fontSize: 12, marginTop: 10 }}
              onClick={handleAssistantRun}
              disabled={assistantLoading || (assistantMode === "ask" && !assistantQuestion.trim())}
            >
              {assistantLoading ? "Thinking..." : "Run AI"}
            </button>
            {assistantError && <div className="map-error-banner" style={{ marginTop: 10 }}>{assistantError}</div>}
            {assistantAnswer && <pre className="map-ai-answer">{assistantAnswer}</pre>}
          </div>

          <div className="map-hotspot-panel">
            <h3>Geographic Escalation Risk Hotspots</h3>
            <p>Likely near-term escalation zones based on trend and multi-source activity.</p>
            <div className="map-hotspot-grid">
              {hotspotSummary.length > 0 ? (
                hotspotSummary.map((h) => (
                  <div key={`${h.country}-${h.latestEventAt}`} className="map-hotspot-card">
                    <div className="map-hotspot-top">
                      <strong>{h.country}</strong>
                      <span>{h.score100} / 100</span>
                    </div>
                    <div className="map-hotspot-meta">
                      Trend: {h.trend} · Severity:{" "}
                      <span className={`map-hotspot-severity map-hotspot-severity-${h.severity}`}>
                        {h.severity}
                      </span>
                    </div>
                    <div className="map-hotspot-reason">{h.reason}</div>
                  </div>
                ))
              ) : (
                <div className="map-hotspot-empty">No hotspot signals available yet.</div>
              )}
            </div>
          </div>

          <div className="map-limitations">
            <h3>Current limitations</h3>
            <ul>
              <li>
                ACLED is maintained as historical context and can lag real-world events by
                weeks, so live strike urgency depends on the real-time feeds.
              </li>
              <li>
                Military ships and carrier groups can disable or spoof AIS/ADS-B, which can
                hide active deployments during sensitive missions.
              </li>
              <li>
                News-derived event geolocation uses city/country extraction and
                corroboration; some events are intentionally suppressed until multiple
                credible publishers confirm them.
              </li>
              <li>
                Open-source feeds are strongest for Europe/Middle East; coverage quality can
                vary by region, censorship, and language.
              </li>
            </ul>
          </div>
        </div>
      </main>

      <footer>
        <div className="footer-logo">AEGIS</div>
        <div className="footer-links">
          <Link href="/escalation">App</Link>
          <Link href="/map">Map</Link>
        </div>
        <div className="footer-copy">&copy; 2026 Alexander Armand-Blumberg · AEGIS</div>
      </footer>
    </div>
  );
}
