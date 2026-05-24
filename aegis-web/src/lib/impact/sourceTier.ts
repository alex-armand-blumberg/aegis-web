import type { IntelLayerKey, IntelPoint } from "@/lib/intel/types";
import {
  inferGeoPrecision,
  inferReportType,
  inferSourceFamily,
} from "./sourceQuality";
import type { GeoPrecision, SourceFamily } from "./types";

export type SourceTier = "tier1" | "tier2" | "tier3" | "tier4";

export type SourceTierResult = {
  tier: SourceTier;
  rationale: string;
};

const TIER1_OPERATIONAL_SOURCES = [
  "ucdp",
  "liveuamap",
  "live uamap",
  "gdacs",
  "usgs",
  "noaa",
  "nhc",
  "nasa firms",
  "firms",
];

const CONFLICT_LAYERS: IntelLayerKey[] = [
  "conflictsBattles",
  "conflictsExplosions",
  "conflictsCivilians",
  "conflictsStrategic",
  "liveStrikes",
];

function lc(value: string | undefined): string {
  return value ? value.toLowerCase() : "";
}

function includesAny(haystack: string, needles: string[]): boolean {
  for (const n of needles) {
    if (n && haystack.includes(n)) return true;
  }
  return false;
}

function isCityOrExact(geoPrecision: GeoPrecision): boolean {
  return geoPrecision === "exact" || geoPrecision === "city";
}

function isCoarseGeo(geoPrecision: GeoPrecision): boolean {
  return geoPrecision === "region" || geoPrecision === "country" || geoPrecision === "unknown";
}

function isAcledAggregate(point: IntelPoint): boolean {
  const source = lc(point.source);
  const aggregateMeta =
    point.metadata?.aggregate === true ||
    point.metadata?.aggregate === "true" ||
    point.metadata?.aggregation === "monthly";
  return aggregateMeta || (source.includes("acled") && source.includes("monthly"));
}

function isTier1OperationalSource(point: IntelPoint): boolean {
  const source = lc(point.source);
  return includesAny(source, TIER1_OPERATIONAL_SOURCES);
}

function isTier1LayerCandidate(point: IntelPoint, geoPrecision: GeoPrecision): boolean {
  if (point.layer === "infrastructure" && geoPrecision === "exact") return true;
  if (!CONFLICT_LAYERS.includes(point.layer)) return false;
  return inferReportType(point) === "incident" && isCityOrExact(geoPrecision);
}

function isTier1FamilyCandidate(sourceFamily: SourceFamily, geoPrecision: GeoPrecision): boolean {
  if (!isCityOrExact(geoPrecision)) return false;
  return sourceFamily === "structured_conflict" || sourceFamily === "disaster";
}

function wouldBeTier1Candidate(
  point: IntelPoint,
  sourceFamily: SourceFamily,
  geoPrecision: GeoPrecision
): boolean {
  if (isAcledAggregate(point)) return false;
  if (isTier1FamilyCandidate(sourceFamily, geoPrecision)) return true;
  if (isTier1LayerCandidate(point, geoPrecision)) return true;
  if (isTier1OperationalSource(point) && isCityOrExact(geoPrecision)) return true;
  return false;
}

export function tierLabel(tier: SourceTier): string {
  switch (tier) {
    case "tier1":
      return "Operational event";
    case "tier2":
      return "Structured context";
    case "tier3":
      return "News / article";
    case "tier4":
      return "Model / derived";
    default:
      return tier;
  }
}

export function tierRank(tier: SourceTier): number {
  switch (tier) {
    case "tier1":
      return 1;
    case "tier2":
      return 2;
    case "tier3":
      return 3;
    case "tier4":
      return 4;
    default:
      return 99;
  }
}

export function isOperationalTier(tier: SourceTier): boolean {
  return tier === "tier1";
}

export function getSourceTier(point: IntelPoint): SourceTierResult {
  const sourceFamily = inferSourceFamily(point);
  const geoPrecision = inferGeoPrecision(point);
  const reportType = inferReportType(point);

  if (
    sourceFamily === "model_context" ||
    point.layer === "escalationRisk" ||
    point.layer === "hotspots"
  ) {
    return { tier: "tier4", rationale: "model_or_hotspot_layer" };
  }

  if (isAcledAggregate(point)) {
    return { tier: "tier2", rationale: "acled_monthly_aggregate" };
  }

  const tier1Candidate = wouldBeTier1Candidate(point, sourceFamily, geoPrecision);

  if (tier1Candidate && isCoarseGeo(geoPrecision)) {
    if (sourceFamily === "news" || point.layer === "news") {
      return { tier: "tier3", rationale: "coarse_geo_news_downgrade" };
    }
    return { tier: "tier2", rationale: "coarse_geo_structured_downgrade" };
  }

  if (tier1Candidate) {
    return { tier: "tier1", rationale: "operational_structured_event" };
  }

  if (
    sourceFamily === "official" ||
    sourceFamily === "humanitarian" ||
    sourceFamily === "sanctions"
  ) {
    return { tier: "tier2", rationale: "official_or_humanitarian_feed" };
  }

  if (geoPrecision === "region" && sourceFamily === "structured_conflict") {
    return { tier: "tier2", rationale: "regional_structured_conflict" };
  }

  if (
    sourceFamily === "news" ||
    point.layer === "news" ||
    reportType === "statement" ||
    reportType === "context"
  ) {
    return { tier: "tier3", rationale: "news_or_article_level" };
  }

  if (sourceFamily === "maritime" || sourceFamily === "aviation") {
    if (isCityOrExact(geoPrecision)) {
      return { tier: "tier1", rationale: "explicit_geo_maritime_aviation" };
    }
    return { tier: "tier2", rationale: "coarse_geo_maritime_aviation" };
  }

  if (sourceFamily === "infrastructure") {
    return isCityOrExact(geoPrecision)
      ? { tier: "tier1", rationale: "infrastructure_exact_geo" }
      : { tier: "tier2", rationale: "infrastructure_coarse_geo" };
  }

  return { tier: "tier3", rationale: "default_article_or_unknown" };
}
