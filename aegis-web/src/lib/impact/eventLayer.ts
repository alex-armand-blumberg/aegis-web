import type { IntelLayerKey, IntelPoint, MapApiResponse } from "@/lib/intel/types";
import { countriesMatch } from "@/lib/countryDisplay";
import { flattenMapPoints } from "./scoring";
import {
  extractSourceUrl,
  inferEventClass,
  inferGeoPrecision,
  inferSourceFamily,
} from "./sourceQuality";
import { SOURCE_RELIABILITY_BASE } from "./scoringConfig";
import { classifyPointRelation, type EventRelation } from "./eventRelation";
import { getSourceTier, isOperationalTier, type SourceTier } from "./sourceTier";
import type { EventClass, GeoPrecision, SourceFamily, UserAsset } from "./types";

export type SelectedAssetEvent = {
  id: string;
  pointId: string;
  title: string;
  lat: number;
  lon: number;
  layer: IntelLayerKey;
  severity: IntelPoint["severity"];
  source: string;
  sourceFamily: SourceFamily;
  sourceReliability: number;
  timestamp: string;
  country?: string;
  eventClass: EventClass;
  geoPrecision: GeoPrecision;
  tier: SourceTier;
  tierRationale: string;
  relation: EventRelation;
  assetId?: string;
  distanceKm?: number;
  defaultMapPin: boolean;
  url?: string;
};

export type SuppressedEventReason = "model_distant" | "global_out_of_scope" | "invalid_coords";

export type EventLayerSuppressed = {
  reason: SuppressedEventReason;
  count: number;
};

export type SelectedAssetEventLayer = {
  events: SelectedAssetEvent[];
  countsByTier: Record<SourceTier, number>;
  countsByRelation: Record<EventRelation, number>;
  suppressed: EventLayerSuppressed[];
};

export type BuildSelectedAssetEventLayerArgs = {
  mapData: MapApiResponse | null;
  selectedAssets: UserAsset[];
  range?: string;
  maxEvents?: number;
};

const DEFAULT_MAX_EVENTS = 2000;
const GLOBAL_SCOPE_KM = 1200;

function emptyCountsByTier(): Record<SourceTier, number> {
  return { tier1: 0, tier2: 0, tier3: 0, tier4: 0 };
}

function emptyCountsByRelation(): Record<EventRelation, number> {
  return {
    direct: 0,
    regional: 0,
    contextual: 0,
    global: 0,
    model: 0,
  };
}

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

function computeDefaultMapPin(tier: SourceTier, relation: EventRelation): boolean {
  return isOperationalTier(tier) && (relation === "direct" || relation === "regional");
}

function sourceReliabilityLabel(sourceFamily: SourceFamily): number {
  return SOURCE_RELIABILITY_BASE[sourceFamily] ?? 0.4;
}

function isInAssetScope(
  relation: EventRelation,
  distanceKm: number | undefined,
  sameCountry: boolean | undefined
): boolean {
  if (relation === "direct" || relation === "regional" || relation === "contextual") {
    return true;
  }
  if (relation === "model") return sameCountry === true;
  if (typeof distanceKm === "number" && Number.isFinite(distanceKm)) {
    return distanceKm <= GLOBAL_SCOPE_KM || sameCountry === true;
  }
  return false;
}

function shouldSuppressModel(
  point: IntelPoint,
  selectedAssets: UserAsset[],
  relationResult: ReturnType<typeof classifyPointRelation>
): boolean {
  if (relationResult.relation !== "model") return false;
  if (selectedAssets.length === 0) return true;

  const pointCountry = point.country;
  if (!pointCountry) return true;

  return !selectedAssets.some((asset) => countriesMatch(pointCountry, asset.country));
}

export function buildSelectedAssetEventLayer(
  args: BuildSelectedAssetEventLayerArgs
): SelectedAssetEventLayer {
  const { mapData, selectedAssets, maxEvents = DEFAULT_MAX_EVENTS } = args;

  const countsByTier = emptyCountsByTier();
  const countsByRelation = emptyCountsByRelation();
  const suppressedMap = new Map<SuppressedEventReason, number>();
  const events: SelectedAssetEvent[] = [];

  if (!mapData || selectedAssets.length === 0) {
    return { events, countsByTier, countsByRelation, suppressed: [] };
  }

  const points = flattenMapPoints(mapData);
  const seen = new Set<string>();

  for (const point of points) {
    if (!point || typeof point.id !== "string") continue;
    if (seen.has(point.id)) continue;
    seen.add(point.id);

    if (!isFiniteCoord(point)) {
      suppressedMap.set("invalid_coords", (suppressedMap.get("invalid_coords") ?? 0) + 1);
      continue;
    }

    const relationResult = classifyPointRelation(point, selectedAssets);

    if (shouldSuppressModel(point, selectedAssets, relationResult)) {
      suppressedMap.set("model_distant", (suppressedMap.get("model_distant") ?? 0) + 1);
      continue;
    }

    if (
      !isInAssetScope(
        relationResult.relation,
        relationResult.distanceKm,
        relationResult.sameCountry
      )
    ) {
      suppressedMap.set("global_out_of_scope", (suppressedMap.get("global_out_of_scope") ?? 0) + 1);
      continue;
    }

    const sourceFamily = inferSourceFamily(point);
    const eventClass = inferEventClass(point);
    const geoPrecision = inferGeoPrecision(point);
    const { tier, rationale } = getSourceTier(point);

    countsByTier[tier] += 1;
    countsByRelation[relationResult.relation] += 1;

    events.push({
      id: `event:${point.id}`,
      pointId: point.id,
      title: point.title,
      lat: point.lat,
      lon: point.lon,
      layer: point.layer,
      severity: point.severity,
      source: point.source,
      sourceFamily,
      sourceReliability: sourceReliabilityLabel(sourceFamily),
      timestamp: point.timestamp,
      country: point.country,
      eventClass,
      geoPrecision,
      tier,
      tierRationale: rationale,
      relation: relationResult.relation,
      assetId: relationResult.assetId,
      distanceKm: relationResult.distanceKm,
      defaultMapPin: computeDefaultMapPin(tier, relationResult.relation),
      url: extractSourceUrl(point),
    });
  }

  events.sort((a, b) => {
    const tierDiff = a.tier.localeCompare(b.tier);
    if (tierDiff !== 0) return tierDiff;
    const distA = a.distanceKm ?? Number.POSITIVE_INFINITY;
    const distB = b.distanceKm ?? Number.POSITIVE_INFINITY;
    return distA - distB;
  });

  const suppressed: EventLayerSuppressed[] = Array.from(suppressedMap.entries()).map(
    ([reason, count]) => ({ reason, count })
  );

  return {
    events: events.slice(0, maxEvents),
    countsByTier,
    countsByRelation,
    suppressed,
  };
}
