import type { IntelSeverity } from "@/lib/intel/types";
import type { SelectedAssetEvent, SelectedAssetEventLayer } from "@/lib/impact/eventLayer";
import type { EventRelation } from "@/lib/impact/eventRelation";
import { tierLabel, tierRank } from "@/lib/impact/sourceTier";
import type { SourceTier } from "@/lib/impact/sourceTier";
import type { EventClass, UserAsset } from "@/lib/impact/types";
import {
  formatDistanceKm,
  geoPrecisionLabel,
} from "../dashboard/dashboardUtils";

const SEVERITY_RANK: Record<IntelSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export type PrimaryEvidenceGroups = {
  direct: SelectedAssetEvent[];
  regional: SelectedAssetEvent[];
  contextual: SelectedAssetEvent[];
};

export type EvidenceGroups = PrimaryEvidenceGroups & {
  modelGlobal: SelectedAssetEvent[];
};

function sortEvidenceEvents(events: SelectedAssetEvent[]): SelectedAssetEvent[] {
  return [...events].sort((a, b) => {
    const tierDiff = tierRank(a.tier) - tierRank(b.tier);
    if (tierDiff !== 0) return tierDiff;

    const distA = a.distanceKm ?? Number.POSITIVE_INFINITY;
    const distB = b.distanceKm ?? Number.POSITIVE_INFINITY;
    if (distA !== distB) return distA - distB;

    return SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
  });
}

export function groupEvidence(events: SelectedAssetEvent[]): EvidenceGroups {
  const direct: SelectedAssetEvent[] = [];
  const regional: SelectedAssetEvent[] = [];
  const contextual: SelectedAssetEvent[] = [];
  const modelGlobal: SelectedAssetEvent[] = [];

  for (const event of events) {
    switch (event.relation) {
      case "direct":
        direct.push(event);
        break;
      case "regional":
        regional.push(event);
        break;
      case "contextual":
        contextual.push(event);
        break;
      case "model":
      case "global":
        modelGlobal.push(event);
        break;
      default:
        break;
    }
  }

  return {
    direct: sortEvidenceEvents(direct),
    regional: sortEvidenceEvents(regional),
    contextual: sortEvidenceEvents(contextual),
    modelGlobal: sortEvidenceEvents(modelGlobal),
  };
}

export function hasPrimaryEvidence(groups: PrimaryEvidenceGroups): boolean {
  return groups.direct.length + groups.regional.length + groups.contextual.length > 0;
}

export function eventClassLabel(eventClass: EventClass): string {
  switch (eventClass) {
    case "armed_conflict":
      return "Armed conflict";
    case "strike_or_explosion":
      return "Strike or explosion";
    case "civilian_harm":
      return "Civilian harm";
    case "protest_or_unrest":
      return "Protest or unrest";
    case "strategic_development":
      return "Strategic development";
    case "humanitarian_stress":
      return "Humanitarian stress";
    case "natural_disaster":
      return "Natural disaster";
    case "sanctions_or_economic":
      return "Sanctions / economic";
    case "maritime_activity":
      return "Maritime activity";
    case "aviation_activity":
      return "Aviation activity";
    case "infrastructure_disruption":
      return "Infrastructure disruption";
    case "news_report":
      return "News report";
    case "model_risk_context":
      return "Model risk context";
    default:
      return "Other signal";
  }
}

export function tierRationaleLabel(rationale: string): string {
  switch (rationale) {
    case "operational_structured_event":
      return "Structured operational reporting with precise geo.";
    case "official_or_humanitarian_feed":
      return "Official or humanitarian feed.";
    case "regional_structured_conflict":
      return "Regional structured conflict reporting.";
    case "news_or_article_level":
      return "Article-level reporting; verify independently.";
    case "explicit_geo_maritime_aviation":
      return "Maritime or aviation signal with explicit geo.";
    case "coarse_geo_maritime_aviation":
      return "Maritime or aviation signal with coarse geo.";
    case "infrastructure_exact_geo":
      return "Infrastructure signal with exact geo.";
    case "infrastructure_coarse_geo":
      return "Infrastructure signal with coarse geo.";
    case "default_article_or_unknown":
      return "General article or unknown source type.";
    case "geo_downgrade_region":
      return "Tier adjusted down due to region-level geo.";
    case "geo_downgrade_country":
      return "Tier adjusted down due to country-level geo.";
    case "geo_downgrade_unknown":
      return "Tier adjusted down due to unknown geo precision.";
    case "aggregate_downgrade":
      return "Tier adjusted down due to aggregate reporting.";
    case "model_or_hotspot_layer":
      return "Model or hotspot layer signal.";
    case "acled_monthly_aggregate":
      return "ACLED monthly aggregate reporting.";
    case "coarse_geo_news_downgrade":
      return "News tier adjusted down due to coarse geo.";
    case "coarse_geo_structured_downgrade":
      return "Structured tier adjusted down due to coarse geo.";
    default:
      return rationale.replace(/_/g, " ");
  }
}

export function buildEventWhyItMatters(
  event: SelectedAssetEvent,
  asset: UserAsset
): string {
  const cls = eventClassLabel(event.eventClass);
  const distance = formatDistanceKm(event.distanceKm);

  if (event.relation === "model" || event.relation === "global") {
    return "Model or wide-area context; verify before operational use.";
  }

  if (event.relation === "direct") {
    return distance
      ? `${cls} reported ${distance} from ${asset.name}.`
      : `${cls} reported near ${asset.name}.`;
  }

  if (event.relation === "regional") {
    return distance
      ? `${cls} in the region around ${asset.name} (${distance}).`
      : `${cls} in the region around ${asset.name}.`;
  }

  return `${cls} adds broader context for ${asset.country}.`;
}

export function formatEvidenceMetaLine(
  event: SelectedAssetEvent,
  opts?: { omitRelation?: boolean; omitTier?: boolean }
): string {
  const parts: string[] = [];

  if (!opts?.omitRelation) {
    parts.push(relationSectionLabel(event.relation));
  }

  const distance = formatDistanceKm(event.distanceKm);
  if (distance) parts.push(distance);

  if (!opts?.omitTier) {
    parts.push(tierLabel(event.tier));
  }
  parts.push(eventClassLabel(event.eventClass));

  const geo = geoPrecisionLabel(event.geoPrecision);
  if (geo) parts.push(geo);

  const source = event.source.trim();
  if (source) parts.push(source.length > 48 ? `${source.slice(0, 45)}…` : source);

  return parts.join(" · ");
}

function relationSectionLabel(relation: EventRelation): string {
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

export function formatRelativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const diff = Date.now() - t;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`;
  return `${Math.round(diff / 86_400_000)}d ago`;
}

export function formatAbsoluteTime(iso: string): string {
  const t = new Date(iso);
  if (!Number.isFinite(t.getTime())) return "";
  return t.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function buildSuppressedSummary(layer: SelectedAssetEventLayer): string | null {
  if (layer.suppressed.length === 0) return null;

  const parts = layer.suppressed.map(({ reason, count }) => {
    switch (reason) {
      case "model_distant":
        return `${count} distant model signal${count === 1 ? "" : "s"} excluded`;
      case "global_out_of_scope":
        return `${count} out-of-scope global signal${count === 1 ? "" : "s"} excluded`;
      case "invalid_coords":
        return `${count} invalid coordinate${count === 1 ? "" : "s"} excluded`;
      default:
        return `${count} signal${count === 1 ? "" : "s"} excluded`;
    }
  });

  return parts.join(" · ");
}

export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trim()}…`;
}

export type EvidenceFilterState = {
  tiers: Set<SourceTier> | null;
  relations: Set<EventRelation> | null;
};

export const DEFAULT_EVIDENCE_FILTER: EvidenceFilterState = {
  tiers: null,
  relations: null,
};

export function isDefaultFilter(filters: EvidenceFilterState): boolean {
  return filters.tiers === null && filters.relations === null;
}

export function filterEvidenceEvents(
  events: SelectedAssetEvent[],
  filters: EvidenceFilterState
): SelectedAssetEvent[] {
  if (isDefaultFilter(filters)) return events;
  return events.filter((event) => {
    if (filters.tiers !== null && !filters.tiers.has(event.tier)) return false;
    if (filters.relations !== null && !filters.relations.has(event.relation)) return false;
    return true;
  });
}

export function buildTierSummary(events: SelectedAssetEvent[]): string | null {
  if (events.length === 0) return null;

  let t1 = 0;
  let t2 = 0;
  let t3 = 0;
  let t4 = 0;

  for (const e of events) {
    if (e.tier === "tier1") t1++;
    else if (e.tier === "tier2") t2++;
    else if (e.tier === "tier3") t3++;
    else if (e.tier === "tier4") t4++;
  }

  const distinctTiers = [t1, t2, t3, t4].filter((n) => n > 0).length;
  if (distinctTiers <= 1) return null;

  const parts: string[] = [];
  if (t1 > 0) parts.push(`${t1} operational`);
  if (t2 > 0) parts.push(`${t2} structured context`);
  if (t3 > 0) parts.push(`${t3} article-level`);
  if (t4 > 0) parts.push(`${t4} model/derived`);

  return parts.join(" · ");
}
