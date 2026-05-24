import { countriesMatch } from "@/lib/countryDisplay";
import type { IntelPoint } from "@/lib/intel/types";
import { getDistanceKm } from "./distance";
import { inferEventClass, inferGeoPrecision, inferSourceFamily } from "./sourceQuality";
import type { EventClass, GeoPrecision, UserAsset } from "./types";

export type EventRelation = "direct" | "regional" | "contextual" | "global" | "model";

export type PointRelationResult = {
  relation: EventRelation;
  assetId?: string;
  distanceKm?: number;
  sameCountry?: boolean;
};

const DIRECT_DISTANCE_KM = 150;
const REGIONAL_DISTANCE_KM = 800;
const REGIONAL_CROSS_BORDER_MIN_KM = 300;

type NearestMatch = {
  assetId: string;
  distanceKm: number;
  sameCountry: boolean;
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

function isModelPoint(point: IntelPoint): boolean {
  const sourceFamily = inferSourceFamily(point);
  return (
    sourceFamily === "model_context" ||
    point.layer === "escalationRisk" ||
    point.layer === "hotspots"
  );
}

function isConcreteEventClass(eventClass: EventClass): boolean {
  return (
    eventClass !== "news_report" &&
    eventClass !== "model_risk_context" &&
    eventClass !== "other"
  );
}

function isCityOrExact(geoPrecision: GeoPrecision): boolean {
  return geoPrecision === "exact" || geoPrecision === "city";
}

function findNearestAsset(point: IntelPoint, selectedAssets: UserAsset[]): NearestMatch | null {
  if (selectedAssets.length === 0 || !isFiniteCoord(point)) return null;

  let nearest: NearestMatch | null = null;

  for (const asset of selectedAssets) {
    const distanceKm = getDistanceKm(
      { lat: point.lat, lon: point.lon },
      { lat: asset.lat, lon: asset.lon }
    );
    if (!Number.isFinite(distanceKm)) continue;

    const sameCountry = countriesMatch(point.country, asset.country);
    if (!nearest || distanceKm < nearest.distanceKm) {
      nearest = { assetId: asset.id, distanceKm, sameCountry };
    }
  }

  return nearest;
}

function isContextualSource(point: IntelPoint): boolean {
  const sourceFamily = inferSourceFamily(point);
  return (
    sourceFamily === "official" ||
    sourceFamily === "humanitarian" ||
    sourceFamily === "sanctions" ||
    point.layer === "news"
  );
}

export function classifyPointRelation(
  point: IntelPoint,
  selectedAssets: UserAsset[]
): PointRelationResult {
  if (selectedAssets.length === 0) {
    return { relation: "global" };
  }

  if (isModelPoint(point)) {
    const nearest = findNearestAsset(point, selectedAssets);
    return {
      relation: "model",
      assetId: nearest?.assetId,
      distanceKm: nearest?.distanceKm,
      sameCountry: nearest?.sameCountry,
    };
  }

  const nearest = findNearestAsset(point, selectedAssets);
  if (!nearest) {
    return { relation: "global" };
  }

  const geoPrecision = inferGeoPrecision(point);
  const eventClass = inferEventClass(point);
  const { assetId, distanceKm, sameCountry } = nearest;

  if (
    distanceKm <= DIRECT_DISTANCE_KM &&
    isCityOrExact(geoPrecision) &&
    isConcreteEventClass(eventClass)
  ) {
    return { relation: "direct", assetId, distanceKm, sameCountry };
  }

  if (
    (sameCountry && distanceKm <= REGIONAL_DISTANCE_KM) ||
    (distanceKm > REGIONAL_CROSS_BORDER_MIN_KM && distanceKm <= REGIONAL_DISTANCE_KM)
  ) {
    return { relation: "regional", assetId, distanceKm, sameCountry };
  }

  if (isContextualSource(point) && (sameCountry || distanceKm <= REGIONAL_DISTANCE_KM)) {
    return { relation: "contextual", assetId, distanceKm, sameCountry };
  }

  return { relation: "global", assetId, distanceKm, sameCountry };
}
