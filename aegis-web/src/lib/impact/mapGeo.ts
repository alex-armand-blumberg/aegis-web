import type { Feature, FeatureCollection, LineString, Point } from "geojson";
import type { ExposureAlert, EvidenceItem, ExposureLevel, UserAsset } from "./types";
import type { IntelSeverity } from "@/lib/intel/types";
import type { ImpactBackgroundSignal } from "./mapSignals";
import {
  classifyEvidenceRelation,
  type EvidenceRelation,
} from "./evidenceRelation";

export type LonLatBounds = [[number, number], [number, number]];

export const BASEMAP_STYLE =
  "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

const LEVEL_COLOR: Record<ExposureLevel, string> = {
  critical: "#8b1a1a",
  high: "#7a3d0f",
  elevated: "#7f6a33",
  guarded: "#36404c",
  low: "#4a5564",
};

const SEVERITY_COLOR: Record<IntelSeverity, string> = {
  critical: "#9a2b2b",
  high: "#8a4f1f",
  medium: "#7f6a33",
  low: "#4a5564",
};

export function levelColor(level: ExposureLevel): string {
  return LEVEL_COLOR[level];
}

export function severityColor(severity: IntelSeverity): string {
  return SEVERITY_COLOR[severity];
}

export function formatCoordLat(lat: number): string {
  const hemi = lat >= 0 ? "N" : "S";
  return `Lat ${Math.abs(lat).toFixed(2)}° ${hemi}`;
}

export function formatCoordLon(lon: number): string {
  const hemi = lon >= 0 ? "E" : "W";
  return `Lon ${Math.abs(lon).toFixed(2)}° ${hemi}`;
}

type PointLike = { lat: number; lon: number };

function isValidPoint(point: PointLike): boolean {
  return (
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lon) &&
    point.lat <= 90 &&
    point.lat >= -90 &&
    point.lon <= 180 &&
    point.lon >= -180
  );
}

export function computeBounds(points: PointLike[]): LonLatBounds | null {
  const valid = points.filter(isValidPoint);
  if (valid.length === 0) return null;

  let minLat = valid[0].lat;
  let maxLat = valid[0].lat;

  const lons = valid.map((p) => p.lon);
  const shiftedLons = lons.map((lon) => (lon < 0 ? lon + 360 : lon));

  let minLon = lons[0];
  let maxLon = lons[0];
  let shiftedMinLon = shiftedLons[0];
  let shiftedMaxLon = shiftedLons[0];

  for (let i = 0; i < valid.length; i += 1) {
    const lat = valid[i].lat;
    const lon = valid[i].lon;
    const shifted = shiftedLons[i];
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
    minLon = Math.min(minLon, lon);
    maxLon = Math.max(maxLon, lon);
    shiftedMinLon = Math.min(shiftedMinLon, shifted);
    shiftedMaxLon = Math.max(shiftedMaxLon, shifted);
  }

  const normalSpan = maxLon - minLon;
  const shiftedSpan = shiftedMaxLon - shiftedMinLon;
  const useShifted = shiftedSpan < normalSpan;

  let west = useShifted ? shiftedMinLon : minLon;
  let east = useShifted ? shiftedMaxLon : maxLon;
  if (useShifted) {
    if (west > 180) west -= 360;
    if (east > 180) east -= 360;
  }

  const lonPad = Math.max(4, (useShifted ? shiftedSpan : normalSpan) * 0.1);
  const latPad = Math.max(3, (maxLat - minLat) * 0.12);

  const south = Math.max(-85, minLat - latPad);
  const north = Math.min(85, maxLat + latPad);
  west = Math.max(-180, west - lonPad);
  east = Math.min(180, east + lonPad);

  return [
    [west, south],
    [east, north],
  ];
}

type AssetProps = {
  assetId: string;
  name: string;
  type: UserAsset["type"];
  importance: UserAsset["importance"];
  level: ExposureLevel | "low";
  score: number;
  selected: boolean;
};

export function buildAssetGeoJson(args: {
  assets: UserAsset[];
  alertsByAsset: Record<string, ExposureAlert>;
  selectedAssetId: string | null;
  visibleAssetIds?: Set<string>;
}): FeatureCollection<Point, AssetProps> {
  const { assets, alertsByAsset, selectedAssetId, visibleAssetIds } = args;
  const features: Array<Feature<Point, AssetProps>> = [];
  for (const asset of assets) {
    const shouldShow = !visibleAssetIds || visibleAssetIds.has(asset.id) || asset.id === selectedAssetId;
    if (!shouldShow) continue;
    if (!isValidPoint(asset)) continue;
    const alert = alertsByAsset[asset.id];
    features.push({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [asset.lon, asset.lat],
      },
      properties: {
        assetId: asset.id,
        name: asset.name,
        type: asset.type,
        importance: asset.importance,
        level: alert?.level ?? "low",
        score: alert?.score ?? 0,
        selected: asset.id === selectedAssetId,
      },
    });
  }
  return { type: "FeatureCollection", features };
}

type EvidenceProps = {
  evidenceId: string;
  title: string;
  severity: IntelSeverity;
  distanceKm: number | null;
  eventClass: EvidenceItem["eventClass"];
  isModelContext: boolean;
  relation: EvidenceRelation;
  selected: boolean;
};

export function buildEvidenceGeoJson(
  evidence: EvidenceItem[],
  selectedEvidenceId?: string | null,
  asset?: UserAsset | null
): FeatureCollection<Point, EvidenceProps> {
  const features: Array<Feature<Point, EvidenceProps>> = [];
  for (const item of evidence) {
    if (!isValidPoint(item)) continue;
    const isModelContext =
      item.eventClass === "model_risk_context" || item.sourceFamilies.includes("model_context");
    const relation: EvidenceRelation = asset
      ? classifyEvidenceRelation(item, asset)
      : isModelContext
        ? "model_context"
        : "regional_context";
    features.push({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [item.lon, item.lat],
      },
      properties: {
        evidenceId: item.id,
        title: item.title,
        severity: item.severity,
        distanceKm: Number.isFinite(item.distanceKm) ? item.distanceKm ?? null : null,
        eventClass: item.eventClass,
        isModelContext,
        relation,
        selected: item.id === selectedEvidenceId,
      },
    });
  }
  return { type: "FeatureCollection", features };
}

type BackgroundSignalProps = {
  signalId: string;
  title: string;
  severity: IntelSeverity;
  category: string;
  layer: string;
  eventClass: string;
  distanceKm: number;
  isModelContext: boolean;
  selected: boolean;
};

export function buildBackgroundSignalGeoJson(args: {
  signals: ImpactBackgroundSignal[];
  selectedSignalId?: string | null;
}): FeatureCollection<Point, BackgroundSignalProps> {
  const { signals, selectedSignalId } = args;
  const features: Array<Feature<Point, BackgroundSignalProps>> = [];

  for (const signal of signals) {
    if (!isValidPoint(signal)) continue;
    features.push({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [signal.lon, signal.lat],
      },
      properties: {
        signalId: signal.id,
        title: signal.title,
        severity: signal.severity,
        category: signal.category,
        layer: signal.layer,
        eventClass: signal.eventClass,
        distanceKm: signal.distanceKm,
        isModelContext: signal.isModelContext,
        selected: signal.id === selectedSignalId,
      },
    });
  }

  return { type: "FeatureCollection", features };
}

type LinkProps = {
  evidenceId: string;
  isModelContext: boolean;
  relation: EvidenceRelation;
};

export function buildLinkGeoJson(args: {
  asset: UserAsset | null;
  evidence: EvidenceItem[];
}): FeatureCollection<LineString, LinkProps> {
  const { asset, evidence } = args;
  if (!asset || !isValidPoint(asset)) return { type: "FeatureCollection", features: [] };

  const features: Array<Feature<LineString, LinkProps>> = [];
  for (const item of evidence) {
    if (!isValidPoint(item)) continue;
    const isModelContext =
      item.eventClass === "model_risk_context" || item.sourceFamilies.includes("model_context");
    const relation = classifyEvidenceRelation(item, asset);
    features.push({
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: [
          [asset.lon, asset.lat],
          [item.lon, item.lat],
        ],
      },
      properties: {
        evidenceId: item.id,
        isModelContext,
        relation,
      },
    });
  }
  return { type: "FeatureCollection", features };
}
