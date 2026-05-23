import type { IntelLayerKey, IntelPoint, IntelSeverity, MapApiResponse } from "@/lib/intel/types";
import { countriesMatch } from "@/lib/countryDisplay";
import { flattenMapPoints } from "./scoring";
import { getDistanceKm } from "./distance";
import { inferEventClass } from "./sourceQuality";
import type { EventClass, UserAsset } from "./types";

export type SignalCategoryKey =
  | "conflict"
  | "explosions"
  | "unrest"
  | "infrastructure"
  | "news"
  | "maritime"
  | "aviation"
  | "modelContext";

export const SIGNAL_CATEGORY_LABELS: Record<SignalCategoryKey, string> = {
  conflict: "Conflict / strikes",
  explosions: "Explosions",
  unrest: "Protests / unrest",
  infrastructure: "Infrastructure",
  news: "News",
  maritime: "Shipping / routes",
  aviation: "Flights",
  modelContext: "Model context",
};

export const DEFAULT_SIGNAL_CATEGORIES: Record<SignalCategoryKey, boolean> = {
  conflict: true,
  explosions: true,
  unrest: true,
  infrastructure: true,
  news: true,
  maritime: true,
  aviation: true,
  modelContext: true,
};

export const DEFAULT_SEVERITY_FILTERS: Record<IntelSeverity, boolean> = {
  critical: true,
  high: true,
  medium: true,
  low: true,
};

export type ImpactBackgroundSignal = {
  id: string;
  title: string;
  lat: number;
  lon: number;
  layer: IntelLayerKey;
  severity: IntelSeverity;
  category: SignalCategoryKey;
  eventClass: EventClass;
  source: string;
  timestamp: string;
  country?: string;
  distanceKm: number;
  sameCountry: boolean;
  isModelContext: boolean;
  priority: number;
};

type BuildBackgroundSignalsArgs = {
  mapData: MapApiResponse | null;
  assets: UserAsset[];
  visibleAssetIds: Set<string>;
  selectedAssetId: string | null;
  selectedEvidencePointIds?: Set<string>;
  maxDistanceKm?: number;
  maxPoints?: number;
};

const MAX_DISTANCE_KM = 500;
const MAX_BACKGROUND_POINTS = 600;

const SEVERITY_WEIGHT: Record<IntelSeverity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

function isFiniteCoord(point: { lat: number; lon: number }): boolean {
  return (
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lon) &&
    point.lat >= -90 &&
    point.lat <= 90 &&
    point.lon >= -180 &&
    point.lon <= 180
  );
}

export function signalCategoryForLayer(layer: IntelLayerKey): SignalCategoryKey {
  if (layer === "conflictsExplosions") return "explosions";
  if (
    layer === "conflictsBattles" ||
    layer === "conflictsCivilians" ||
    layer === "conflictsStrategic" ||
    layer === "liveStrikes" ||
    layer === "conflicts"
  ) {
    return "conflict";
  }
  if (layer === "conflictsProtests" || layer === "conflictsRiots") return "unrest";
  if (layer === "infrastructure") return "infrastructure";
  if (layer === "vessels" || layer === "carriers") return "maritime";
  if (layer === "flights" || layer === "troopMovements") return "aviation";
  if (layer === "escalationRisk" || layer === "hotspots") return "modelContext";
  return "news";
}

function nearestAssetMatch(
  point: IntelPoint,
  assets: UserAsset[],
  maxDistanceKm: number
): { distanceKm: number; sameCountry: boolean; inScope: boolean } {
  let nearestDistance = Number.POSITIVE_INFINITY;
  let sameCountry = false;

  for (const asset of assets) {
    if (countriesMatch(point.country, asset.country)) {
      sameCountry = true;
    }
    const distanceKm = getDistanceKm(
      { lat: point.lat, lon: point.lon },
      { lat: asset.lat, lon: asset.lon }
    );
    if (distanceKm < nearestDistance) nearestDistance = distanceKm;
  }

  const inScope = sameCountry || nearestDistance <= maxDistanceKm;
  return {
    distanceKm: Number.isFinite(nearestDistance) ? nearestDistance : maxDistanceKm + 1,
    sameCountry,
    inScope,
  };
}

function recencyBoost(timestamp: string): number {
  const value = new Date(timestamp).getTime();
  if (!Number.isFinite(value)) return 0;
  const ageHours = Math.max(0, (Date.now() - value) / 3_600_000);
  if (ageHours <= 24) return 32;
  if (ageHours <= 72) return 20;
  if (ageHours <= 168) return 10;
  return 2;
}

function proximityBoost(distanceKm: number): number {
  if (!Number.isFinite(distanceKm)) return 0;
  if (distanceKm <= 50) return 26;
  if (distanceKm <= 150) return 16;
  if (distanceKm <= 300) return 9;
  return 2;
}

function priorityScore(signal: {
  severity: IntelSeverity;
  distanceKm: number;
  sameCountry: boolean;
  timestamp: string;
  isModelContext: boolean;
}): number {
  let score = SEVERITY_WEIGHT[signal.severity] * 35;
  score += recencyBoost(signal.timestamp);
  score += proximityBoost(signal.distanceKm);
  if (signal.sameCountry) score += 8;
  if (signal.isModelContext) score -= 18;
  return score;
}

export function buildBackgroundSignals(args: BuildBackgroundSignalsArgs): ImpactBackgroundSignal[] {
  const {
    mapData,
    assets,
    visibleAssetIds,
    selectedAssetId,
    selectedEvidencePointIds = new Set<string>(),
    maxDistanceKm = MAX_DISTANCE_KM,
    maxPoints = MAX_BACKGROUND_POINTS,
  } = args;

  if (!mapData || assets.length === 0) return [];

  const scopedAssets = assets.filter(
    (asset) => visibleAssetIds.has(asset.id) || asset.id === selectedAssetId
  );
  if (scopedAssets.length === 0) return [];

  const points = flattenMapPoints(mapData);
  const out: ImpactBackgroundSignal[] = [];
  const seen = new Set<string>();

  for (const point of points) {
    if (!point || typeof point.id !== "string") continue;
    if (selectedEvidencePointIds.has(point.id)) continue;
    if (seen.has(point.id)) continue;
    if (!isFiniteCoord(point)) continue;

    seen.add(point.id);
    const nearest = nearestAssetMatch(point, scopedAssets, maxDistanceKm);
    if (!nearest.inScope) continue;

    const eventClass = inferEventClass(point);
    const category = signalCategoryForLayer(point.layer);
    const isModelContext = category === "modelContext" || eventClass === "model_risk_context";
    const signal: ImpactBackgroundSignal = {
      id: point.id,
      title: point.title,
      lat: point.lat,
      lon: point.lon,
      layer: point.layer,
      severity: point.severity,
      category,
      eventClass,
      source: point.source,
      timestamp: point.timestamp,
      country: point.country,
      distanceKm: nearest.distanceKm,
      sameCountry: nearest.sameCountry,
      isModelContext,
      priority: 0,
    };
    signal.priority = priorityScore(signal);
    out.push(signal);
  }

  return out.sort((a, b) => b.priority - a.priority).slice(0, maxPoints);
}
