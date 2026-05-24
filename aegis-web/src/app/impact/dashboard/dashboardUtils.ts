import type { Feature, FeatureCollection, Point } from "geojson";
import type { IntelSeverity } from "@/lib/intel/types";
import type { SelectedAssetEvent } from "@/lib/impact/eventLayer";
import type { EventRelation } from "@/lib/impact/eventRelation";
import { tierLabel, tierRank, type SourceTier } from "@/lib/impact/sourceTier";
import type { GeoPrecision, UserAsset } from "@/lib/impact/types";

export const DASHBOARD_BASEMAP_STYLE =
  "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json";

const RELATION_RANK: Record<EventRelation, number> = {
  direct: 0,
  regional: 1,
  contextual: 2,
  global: 3,
  model: 4,
};

const SEVERITY_RANK: Record<IntelSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export function filterAssetsBySelection(
  all: UserAsset[],
  selectedAssetIds?: string[]
): UserAsset[] {
  if (!selectedAssetIds || selectedAssetIds.length === 0) return all;
  const selected = new Set(selectedAssetIds);
  return all.filter((asset) => selected.has(asset.id));
}

export function pickTopEvents(events: SelectedAssetEvent[], max = 5): SelectedAssetEvent[] {
  const eligible = events.filter(
    (event) => event.relation !== "model" && event.relation !== "global"
  );

  return [...eligible]
    .sort((a, b) => {
      const relationDiff = RELATION_RANK[a.relation] - RELATION_RANK[b.relation];
      if (relationDiff !== 0) return relationDiff;

      const tierDiff = tierRank(a.tier) - tierRank(b.tier);
      if (tierDiff !== 0) return tierDiff;

      const distA = a.distanceKm ?? Number.POSITIVE_INFINITY;
      const distB = b.distanceKm ?? Number.POSITIVE_INFINITY;
      if (distA !== distB) return distA - distB;

      return SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    })
    .slice(0, max);
}

export function relationLabel(relation: EventRelation): string {
  switch (relation) {
    case "direct":
      return "Direct";
    case "regional":
      return "Regional";
    case "contextual":
      return "Contextual";
    case "global":
      return "Global";
    case "model":
      return "Model";
    default:
      return relation;
  }
}

export function geoPrecisionLabel(geoPrecision: GeoPrecision): string | null {
  switch (geoPrecision) {
    case "exact":
      return "exact location";
    case "city":
      return "city precision";
    case "region":
      return "approx. region";
    case "country":
      return "approx. country";
    default:
      return null;
  }
}

export function formatDistanceKm(distanceKm: number | undefined): string | null {
  if (distanceKm === undefined || !Number.isFinite(distanceKm)) return null;
  if (distanceKm < 1) return "<1 km";
  if (distanceKm < 100) return `${distanceKm.toFixed(1)} km`;
  return `${Math.round(distanceKm)} km`;
}

export function formatEventMetaLine(event: SelectedAssetEvent): string {
  const parts: string[] = [relationLabel(event.relation)];

  const distance = formatDistanceKm(event.distanceKm);
  if (distance) parts.push(distance);

  parts.push(tierLabel(event.tier));

  const geo = geoPrecisionLabel(event.geoPrecision);
  if (geo) parts.push(geo);

  const source = event.source.trim();
  if (source) parts.push(source.length > 48 ? `${source.slice(0, 45)}…` : source);

  return parts.join(" · ");
}

export function severityDotClass(severity: IntelSeverity): string {
  return `iv-severity-dot iv-severity-${severity}`;
}

export function buildEventStatsLine(events: SelectedAssetEvent[]): string {
  let operational = 0;
  let regional = 0;
  let corroborating = 0;

  for (const event of events) {
    if (event.tier === "tier1" && (event.relation === "direct" || event.relation === "regional")) {
      operational += 1;
    } else if (event.relation === "regional") {
      regional += 1;
    } else {
      corroborating += 1;
    }
  }

  const parts: string[] = [];
  if (operational > 0) parts.push(`${operational} operational`);
  if (regional > 0) parts.push(`${regional} regional`);
  if (corroborating > 0) parts.push(`${corroborating} corroborating`);

  return parts.length > 0 ? parts.join(" · ") : "No nearby qualifying events";
}

type AssetPinProps = {
  assetId: string;
  name: string;
  selected: boolean;
};

type EventPinProps = {
  eventId: string;
  title: string;
  severity: IntelSeverity;
  tier: SourceTier;
  relation: EventRelation;
};

export function buildAssetPinGeoJson(asset: UserAsset): FeatureCollection<Point, AssetPinProps> {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [asset.lon, asset.lat] },
        properties: {
          assetId: asset.id,
          name: asset.name,
          selected: true,
        },
      },
    ],
  };
}

export function buildDashboardEventGeoJson(
  events: SelectedAssetEvent[]
): FeatureCollection<Point, EventPinProps> {
  return {
    type: "FeatureCollection",
    features: events.map((event) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [event.lon, event.lat] },
      properties: {
        eventId: event.id,
        title: event.title,
        severity: event.severity,
        tier: event.tier,
        relation: event.relation,
      },
    })),
  };
}

export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trim()}…`;
}
