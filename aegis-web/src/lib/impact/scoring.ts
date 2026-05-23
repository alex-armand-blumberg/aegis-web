import type {
  ActiveConflictCountry,
  EscalationRiskCountry,
  IntelPoint,
  MapApiResponse,
  ProviderHealth,
} from "@/lib/intel/types";
import { countriesMatch } from "@/lib/countryDisplay";
import { clusterSignals } from "./clustering";
import { getDistanceKm } from "./distance";
import { normalizeSignals } from "./normalizeSignals";
import {
  COUNTRY_CONTEXT_MAX,
  COUNTRY_GEO_CAP,
  COUNTRY_OR_MODEL_ONLY_CAP,
  IMPORTANCE_MULTIPLIER,
  LOW_CONFIDENCE_CAP,
  MODEL_ONLY_CAP,
  NEWS_ONLY_CAP,
  NEWS_ONLY_INDEPENDENT_SOURCES_75,
  NEWS_ONLY_INDEPENDENT_SOURCES_80,
  NEWS_ONLY_MIN_CLUSTERS_80,
  NEWS_ONLY_RELAXED_CAP_75,
  NEWS_ONLY_RELAXED_CAP_80,
  NEWS_ONLY_STRONG_FAMILY_THRESHOLD,
  OLDER_THAN_30D_CAP,
  OLDER_THAN_7D_CAP,
  SAME_COUNTRY_ONLY_CAP,
  SEVERITY_BASE,
  SIGNAL_SATURATION_DIVISOR,
  STALE_CACHE_AGE_MS,
  assetLayerRelevance,
  distanceMultiplier,
  getExposureLevelFor,
  recencyMultiplier,
  sourceDiversityBonus,
} from "./scoringConfig";
import type {
  ConfidenceLevel,
  EventClass,
  EvidenceCluster,
  EvidenceItem,
  ExposureAlert,
  ExposureScoreBreakdown,
  SourceFamily,
  UserAsset,
} from "./types";
import { buildRegionalContext } from "./regionalContext";

const HOUR_MS = 3600 * 1000;

export function flattenMapPoints(data: MapApiResponse): IntelPoint[] {
  if (!data || !data.layers || typeof data.layers !== "object") return [];
  const out: IntelPoint[] = [];
  const seen = new Set<string>();
  for (const layer of Object.values(data.layers)) {
    if (!Array.isArray(layer)) continue;
    for (const p of layer) {
      if (!p || typeof p !== "object" || typeof p.id !== "string") continue;
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      out.push(p);
    }
  }
  return out;
}

function countryMatches(asset: UserAsset, clusterCountry: string | undefined): boolean {
  if (!clusterCountry || !asset.country) return false;
  return countriesMatch(clusterCountry, asset.country);
}

type ClusterScoreParts = {
  cluster: EvidenceCluster;
  clusterScore: number;
  distanceKm: number;
  distanceMult: number;
  severityBase: number;
  recencyMult: number;
  relevanceMult: number;
  sameCountry: boolean;
  ageHours: number;
};

function clusterAgeHours(timestamp: string, now: number): number {
  const t = new Date(timestamp).getTime();
  if (!Number.isFinite(t)) return Number.POSITIVE_INFINITY;
  return Math.max(0, (now - t) / HOUR_MS);
}

export function calculateClusterAssetScore(
  asset: UserAsset,
  cluster: EvidenceCluster,
  now: number
): ClusterScoreParts {
  const distanceKm = getDistanceKm(
    { lat: asset.lat, lon: asset.lon },
    { lat: cluster.lat, lon: cluster.lon }
  );
  const sameCountry = countryMatches(asset, cluster.country);
  const distanceMult = distanceMultiplier(
    Number.isFinite(distanceKm) ? distanceKm : undefined,
    sameCountry
  );
  const severityBase = SEVERITY_BASE[cluster.severity] ?? 5;
  const ageHours = clusterAgeHours(cluster.timestamp, now);
  const recencyMult = recencyMultiplier(ageHours);
  const relevanceMult = assetLayerRelevance(asset.type, cluster.eventClass);

  const clusterScore =
    severityBase * distanceMult * recencyMult * cluster.sourceReliability * relevanceMult;

  return {
    cluster,
    clusterScore,
    distanceKm,
    distanceMult,
    severityBase,
    recencyMult,
    relevanceMult,
    sameCountry,
    ageHours,
  };
}

export function calculateCountryContextLift(
  asset: UserAsset,
  mapData: MapApiResponse
): number {
  let lift = 0;
  const matchActive = (mapData.activeConflictCountries ?? []).find((c) =>
    countryMatchString(c.country, asset.country)
  );
  if (matchActive) {
    lift += scaleActiveCountry(matchActive);
  }
  const matchRisk = (mapData.escalationRiskCountries ?? []).find((c) =>
    countryMatchString(c.country, asset.country)
  );
  if (matchRisk) {
    lift += scaleEscalationCountry(matchRisk);
  }
  return Math.min(COUNTRY_CONTEXT_MAX, Math.round(lift));
}

function countryMatchString(a: string | undefined, b: string | undefined): boolean {
  return countriesMatch(a, b);
}

function scaleActiveCountry(c: ActiveConflictCountry): number {
  const sev = SEVERITY_BASE[c.severity] ?? 5;
  return Math.min(7, sev * 0.2 + Math.min(5, (c.score ?? 0) * 0.05));
}

function scaleEscalationCountry(c: EscalationRiskCountry): number {
  const trendBoost = c.trend === "rising" ? 2 : c.trend === "stable" ? 1 : 0;
  return Math.min(6, (c.riskScore ?? 0) * 0.04 + trendBoost);
}

export function getExposureLevel(score: number): ExposureAlert["level"] {
  return getExposureLevelFor(score);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function clusterAllowedAsEvidence(
  asset: UserAsset,
  cluster: EvidenceCluster
): boolean {
  const officeLike =
    asset.type === "office" ||
    asset.type === "personnel" ||
    asset.type === "school_program";
  if (officeLike) {
    if (cluster.eventClass === "maritime_activity") return false;
    if (cluster.eventClass === "aviation_activity") return false;
  }
  return true;
}

function buildEvidenceItem(parts: ClusterScoreParts): EvidenceItem {
  const cluster = parts.cluster;
  const urls = unique(
    cluster.points
      .map((p) => p.url)
      .filter((u): u is string => typeof u === "string" && u.length > 0)
  );
  return {
    id: `evidence-${cluster.id}`,
    clusterId: cluster.id,
    pointIds: cluster.points.map((p) => p.id),
    title: cluster.title,
    eventClass: cluster.eventClass,
    sourceFamilies: cluster.sourceFamilies,
    sources: cluster.sources,
    layers: cluster.layers,
    timestamp: cluster.timestamp,
    country: cluster.country,
    lat: cluster.lat,
    lon: cluster.lon,
    distanceKm: Number.isFinite(parts.distanceKm) ? parts.distanceKm : undefined,
    severity: cluster.severity,
    sourceReliability: cluster.sourceReliability,
    geoPrecision: cluster.geoPrecision,
    urls: urls.length ? urls : undefined,
    metadata: cluster.points[0]?.metadata,
  };
}

type CapsContext = {
  evidence: EvidenceItem[];
  topParts: ClusterScoreParts[];
  countryContextLift: number;
  cacheStale: boolean;
  providerFailures: number;
  asset: UserAsset;
};

export function applyCaps(
  rawScore: number,
  ctx: CapsContext
): { score: number; capsApplied: string[] } {
  const caps: string[] = [];
  let score = rawScore;

  const families = unique(ctx.evidence.flatMap((e) => e.sourceFamilies));
  const evidenceCount = ctx.evidence.length;
  const ageHours = ctx.topParts.map((p) => p.ageHours);
  const minAgeHours = ageHours.length ? Math.min(...ageHours) : Number.POSITIVE_INFINITY;
  const allSameCountryOnly =
    evidenceCount > 0 &&
    ctx.topParts.every(
      (p) => p.sameCountry && (!Number.isFinite(p.distanceKm) || p.distanceKm > 300)
    );
  const onlyModelContext =
    evidenceCount > 0 && ctx.evidence.every((e) => e.eventClass === "model_risk_context");
  const newsOnly =
    evidenceCount > 0 && families.length > 0 && families.every((f) => f === "news");
  const hasOfficialOrStructured = families.some(
    (f) => f === "official" || f === "structured_conflict"
  );

  if (evidenceCount === 0) {
    if (ctx.countryContextLift > 0) {
      score = Math.min(score, COUNTRY_OR_MODEL_ONLY_CAP);
      caps.push("No concrete evidence — capped at guarded (country context only).");
    } else {
      score = Math.min(score, COUNTRY_OR_MODEL_ONLY_CAP);
      caps.push("No evidence clusters within range — capped at guarded.");
    }
  }

  if (onlyModelContext) {
    score = Math.min(score, MODEL_ONLY_CAP);
    caps.push("Only model/hotspot context evidence — capped at guarded.");
  }

  if (allSameCountryOnly) {
    score = Math.min(score, SAME_COUNTRY_ONLY_CAP);
    caps.push("All evidence is country-level (no cluster within 300 km) — capped at elevated.");
  }

  if (newsOnly) {
    const strong =
      families.length >= NEWS_ONLY_STRONG_FAMILY_THRESHOLD || hasOfficialOrStructured;
    if (!strong) {
      const uniqueSources = unique(
        ctx.evidence.flatMap((e) =>
          e.sources.map((s) => s.trim()).filter((s) => s.length > 0)
        )
      );
      if (
        uniqueSources.length >= NEWS_ONLY_INDEPENDENT_SOURCES_80 &&
        evidenceCount >= NEWS_ONLY_MIN_CLUSTERS_80
      ) {
        score = Math.min(score, NEWS_ONLY_RELAXED_CAP_80);
        caps.push("News-only evidence: capped at 80 despite broad independent reporting.");
      } else if (uniqueSources.length >= NEWS_ONLY_INDEPENDENT_SOURCES_75) {
        score = Math.min(score, NEWS_ONLY_RELAXED_CAP_75);
        caps.push("News-only evidence: capped at 75 despite multiple independent publishers.");
      } else {
        score = Math.min(score, NEWS_ONLY_CAP);
        caps.push("News-only evidence without strong corroboration — capped at high.");
      }
    }
  }

  if (Number.isFinite(minAgeHours)) {
    if (minAgeHours > 30 * 24) {
      score = Math.min(score, OLDER_THAN_30D_CAP);
      caps.push("All evidence older than 30 days — capped at elevated.");
    } else if (minAgeHours > 7 * 24) {
      score = Math.min(score, OLDER_THAN_7D_CAP);
      caps.push("All evidence older than 7 days — capped at high.");
    }
  }

  const mostlyCoarseGeo =
    evidenceCount > 0 &&
    ctx.evidence.filter(
      (e) => e.geoPrecision === "country" || e.geoPrecision === "unknown"
    ).length /
      evidenceCount >
      0.5;
  if (mostlyCoarseGeo) {
    score = Math.min(score, COUNTRY_GEO_CAP);
    caps.push("Most evidence is country-level or unknown precision — capped at high.");
  }

  return { score: Math.round(clamp(score, 0, 100)), capsApplied: caps };
}

export function confidenceFromEvidence(
  evidence: EvidenceItem[],
  topParts: ClusterScoreParts[],
  cacheStale: boolean,
  providerFailures: number
): ConfidenceLevel {
  if (evidence.length === 0) return "low";
  const families = unique(evidence.flatMap((e) => e.sourceFamilies));
  const avgReliability =
    evidence.reduce((acc, e) => acc + e.sourceReliability, 0) / evidence.length;
  const hasNear =
    topParts.some(
      (p) => Number.isFinite(p.distanceKm) && p.distanceKm <= 100
    ) ||
    evidence.some((e) => e.eventClass === "maritime_activity" || e.eventClass === "infrastructure_disruption");
  const onlyModel = evidence.every((e) => e.eventClass === "model_risk_context");
  const allCoarse = evidence.every(
    (e) => e.geoPrecision === "country" || e.geoPrecision === "unknown"
  );

  if (onlyModel || allCoarse) return "low";

  if (cacheStale || providerFailures >= 2) {
    return evidence.length >= 2 && families.length >= 2 ? "medium" : "low";
  }

  if (
    evidence.length >= 3 &&
    families.length >= 2 &&
    avgReliability >= 0.7 &&
    hasNear
  ) {
    return "high";
  }

  if (evidence.length >= 1 && avgReliability >= 0.55) {
    return "medium";
  }
  return "low";
}

function severityLabel(severity: string): string {
  return severity.charAt(0).toUpperCase() + severity.slice(1);
}

function eventClassLabel(eventClass: EventClass): string {
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

function sourceFamilyLabel(family: SourceFamily): string {
  switch (family) {
    case "structured_conflict":
      return "structured conflict data";
    case "official":
      return "official";
    case "humanitarian":
      return "humanitarian";
    case "disaster":
      return "disaster";
    case "sanctions":
      return "sanctions";
    case "maritime":
      return "maritime";
    case "aviation":
      return "aviation";
    case "infrastructure":
      return "infrastructure";
    case "news":
      return "news";
    case "market":
      return "prediction-market";
    case "model_context":
      return "model context";
    default:
      return "other";
  }
}

function buildHeadline(asset: UserAsset, level: ExposureAlert["level"]): string {
  switch (level) {
    case "critical":
      return `Critical exposure signal near ${asset.name}`;
    case "high":
      return `High public-source signal pressure around ${asset.name}`;
    case "elevated":
      return `Elevated exposure around ${asset.name}`;
    case "guarded":
      return `Guarded exposure for ${asset.name}`;
    case "low":
    default:
      return `Low current exposure for ${asset.name}`;
  }
}

function buildWhyItMatters(asset: UserAsset, evidence: EvidenceItem[]): string {
  const top = evidence[0];
  const baseByType: Record<UserAsset["type"], string> = {
    supplier:
      "Disruption near a supplier or logistics node can affect continuity, shipments, staffing, and backup planning.",
    facility:
      "Disruption near a facility can affect continuity, staffing, and operational integrity.",
    port:
      "Maritime or infrastructure signals near a port can affect routing, port access, insurance, or delays.",
    route:
      "Maritime, infrastructure, or conflict signals along a route can affect routing, port access, insurance, or delays.",
    office:
      "Civil unrest, strikes, or disasters near an office can affect travel, access, and duty-of-care decisions.",
    school_program:
      "Civil unrest, strikes, or disasters near a school program can affect access, safety, and continuity.",
    personnel:
      "Civil unrest, strikes, or disasters can affect travel, access, and duty-of-care decisions.",
    field_site:
      "Conflict or humanitarian stress can affect access, movement, local partners, and aid delivery.",
    infrastructure:
      "Disruption can cascade into outages, transport effects, and service delivery impact.",
    region:
      "Strategic or conflict signals in this region shape posture, risk context, and decision tempo.",
    other:
      "Public-source signals around this asset may require analyst review and follow-up.",
  };
  const base = baseByType[asset.type] ?? baseByType.other;
  if (!top) return base;
  return `${base} Strongest current evidence: ${eventClassLabel(top.eventClass).toLowerCase()}.`;
}

function buildWhatChanged(
  evidence: EvidenceItem[],
  topParts: ClusterScoreParts[]
): string {
  if (evidence.length === 0) {
    return "No new local evidence in the selected time window — only country-level context, if any.";
  }
  const families = unique(evidence.flatMap((e) => e.sourceFamilies));
  const familyLabel =
    families.length === 1
      ? `single source family (${sourceFamilyLabel(families[0])})`
      : `${families.length} source families (${families.map(sourceFamilyLabel).join(", ")})`;

  const localCount = topParts.filter(
    (p) => Number.isFinite(p.distanceKm) && p.distanceKm <= 100
  ).length;
  const regionalCount = topParts.filter(
    (p) => Number.isFinite(p.distanceKm) && p.distanceKm > 100 && p.distanceKm <= 300
  ).length;
  const countryCount = topParts.length - localCount - regionalCount;

  const scopeParts: string[] = [];
  if (localCount) scopeParts.push(`${localCount} local (≤100 km)`);
  if (regionalCount) scopeParts.push(`${regionalCount} regional (≤300 km)`);
  if (countryCount) scopeParts.push(`${countryCount} country-level`);
  const scope = scopeParts.length ? scopeParts.join(", ") : "no proximity data";

  const top = evidence[0];
  const topLine = top
    ? `Strongest cluster: ${eventClassLabel(top.eventClass)} (${severityLabel(top.severity)}) from ${top.sources
        .slice(0, 2)
        .join(", ")}.`
    : "";
  return `${evidence.length} evidence clusters across ${familyLabel}; scope: ${scope}. ${topLine}`.trim();
}

function buildUncertainty(
  evidence: EvidenceItem[],
  topParts: ClusterScoreParts[],
  caps: string[],
  cacheStale: boolean,
  providerFailures: number,
  failingProviders: string[]
): string {
  const reasons: string[] = [];
  const families = unique(evidence.flatMap((e) => e.sourceFamilies));
  if (evidence.length === 0) {
    reasons.push("No concrete evidence clusters matched this asset in the selected time window.");
  }
  if (families.length === 1 && evidence.length > 0) {
    reasons.push(`Low source diversity — all evidence comes from ${sourceFamilyLabel(families[0])} feeds.`);
  }
  if (evidence.length > 0 && families.every((f) => f === "news")) {
    reasons.push("Evidence is news-only; corroboration from structured or official sources would raise confidence.");
  }
  const minAge = topParts.map((p) => p.ageHours).reduce((a, b) => Math.min(a, b), Number.POSITIVE_INFINITY);
  if (Number.isFinite(minAge) && minAge > 7 * 24) {
    reasons.push("All evidence is older than 7 days; situation may have changed.");
  }
  const allCoarse =
    evidence.length > 0 &&
    evidence.every((e) => e.geoPrecision === "country" || e.geoPrecision === "unknown");
  if (allCoarse) {
    reasons.push("Geolocation is country-level or unknown for most evidence.");
  }
  const allSameCountry =
    evidence.length > 0 &&
    topParts.every((p) => p.sameCountry && (!Number.isFinite(p.distanceKm) || p.distanceKm > 300));
  if (allSameCountry) {
    reasons.push("All evidence is same-country only (no cluster within 300 km of the asset).");
  }
  if (evidence.some((e) => e.eventClass === "model_risk_context")) {
    reasons.push("Some evidence is model/hotspot context, not a concrete event.");
  }
  if (cacheStale) {
    reasons.push("Underlying map cache is stale; freshness of provider data is uncertain.");
  }
  if (providerFailures > 0) {
    const named = failingProviders.slice(0, 3);
    const remaining = Math.max(0, failingProviders.length - named.length);
    if (named.length > 0) {
      const suffix = remaining > 0 ? `, and ${remaining} more` : "";
      reasons.push(
        `Provider coverage is degraded: ${named.join(", ")}${suffix} reported failures.`
      );
    } else {
      reasons.push(
        `${providerFailures} provider${providerFailures === 1 ? "" : "s"} reported failures — coverage may be incomplete.`
      );
    }
  }
  for (const c of caps) reasons.push(c);
  if (reasons.length === 0) {
    return "Evidence quality is acceptable. Public-source feeds still carry inherent reporting lag and noise.";
  }
  return reasons.join(" ");
}

const WATCH_BY_CLASS: Record<EventClass, string> = {
  armed_conflict:
    "Monitor follow-on strikes, official statements, airspace/transport disruptions, and casualty/damage updates.",
  strike_or_explosion:
    "Monitor follow-on strikes, official statements, airspace/transport disruptions, and casualty/damage updates.",
  civilian_harm:
    "Monitor casualty updates, humanitarian access, displacement, and official statements.",
  protest_or_unrest:
    "Monitor protest locations, security-force response, curfews, road closures, and labor/transport disruptions.",
  strategic_development:
    "Monitor deployments, alliance signals, exercises, and official posture statements.",
  humanitarian_stress:
    "Monitor displacement, aid access, border closures, evacuation routes, and relief-agency updates.",
  natural_disaster:
    "Monitor affected infrastructure, roads, ports, airports, shelters, and follow-on humanitarian needs.",
  sanctions_or_economic:
    "Monitor sanctions updates, ownership links, shipping/finance exposure, and alternate suppliers.",
  maritime_activity:
    "Monitor shipping advisories, AIS gaps, naval statements, insurance notices, and port disruption.",
  aviation_activity:
    "Monitor airspace restrictions, airport closures, NOTAM-style updates, and flight cancellations.",
  infrastructure_disruption:
    "Monitor port/airport closures, power/water/telecom outages, repair timelines, and supply-chain effects.",
  news_report:
    "Monitor corroboration from official, structured, or multiple independent sources.",
  model_risk_context:
    "Monitor concrete event evidence before treating this as a direct exposure alert.",
  other:
    "Monitor follow-on reporting and official sources for additional context.",
};

function buildWatchNext(evidence: EvidenceItem[]): string[] {
  if (evidence.length === 0) {
    return ["Monitor concrete event reporting from structured, official, or news sources for this country."];
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of evidence) {
    const line = WATCH_BY_CLASS[e.eventClass] ?? WATCH_BY_CLASS.other;
    if (!seen.has(line)) {
      seen.add(line);
      out.push(line);
    }
    if (out.length >= 4) break;
  }
  return out;
}

function buildBreakdown(args: {
  total: number;
  baseScore: number;
  topParts: ClusterScoreParts[];
  importanceMultiplier: number;
  diversityBonus: number;
  countryContextLift: number;
  capsApplied: string[];
}): ExposureScoreBreakdown {
  const { topParts } = args;
  const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
  const proximity = Math.round(avg(topParts.map((p) => p.distanceMult)) * 100);
  const severity = Math.round(avg(topParts.map((p) => p.severityBase)));
  const recency = Math.round(avg(topParts.map((p) => p.recencyMult)) * 100);
  const sourceReliability = Math.round(
    avg(topParts.map((p) => p.cluster.sourceReliability)) * 100
  );
  const relevance = Math.round(avg(topParts.map((p) => p.relevanceMult)) * 100);
  return {
    total: args.total,
    signalIntensity: Math.round(args.baseScore),
    proximity,
    severity,
    recency,
    sourceReliability,
    sourceDiversity: args.diversityBonus,
    assetRelevance: relevance,
    assetImportance: Math.round(args.importanceMultiplier * 100),
    countryContext: args.countryContextLift,
    capsApplied: args.capsApplied,
  };
}

function providerFailureCount(health: ProviderHealth[] | undefined): number {
  if (!Array.isArray(health)) return 0;
  return health.filter((p) => p && p.ok === false).length;
}

function providerFailureNames(health: ProviderHealth[] | undefined): string[] {
  if (!Array.isArray(health)) return [];
  const names: string[] = [];
  for (const provider of health) {
    if (!provider || provider.ok !== false) continue;
    const base = typeof provider.provider === "string" ? provider.provider.trim() : "";
    const message = typeof provider.message === "string" ? provider.message.trim() : "";
    const label = base || message;
    if (!label) continue;
    if (!names.includes(label)) names.push(label);
  }
  return names;
}

function isCacheStale(mapData: MapApiResponse): boolean {
  const cache = mapData.cache;
  if (!cache) return false;
  if (cache.status === "stale") return true;
  if (typeof cache.ageMs === "number" && cache.ageMs > STALE_CACHE_AGE_MS) return true;
  return false;
}

type BuildAlertsArgs = {
  assets: UserAsset[];
  mapData: MapApiResponse;
  range: string;
  maxEvidencePerAsset?: number;
  now?: number;
};

export function buildExposureAlerts(args: BuildAlertsArgs): ExposureAlert[] {
  const { assets, mapData, range } = args;
  const now = args.now ?? Date.now();
  const maxEvidence = args.maxEvidencePerAsset ?? 8;

  const points = flattenMapPoints(mapData);
  const signals = normalizeSignals(points);
  const clusters = clusterSignals(signals);
  const cacheStale = isCacheStale(mapData);
  const providerFailures = providerFailureCount(mapData.providerHealth);
  const failingProviderNames = providerFailureNames(mapData.providerHealth);

  const generatedAt = new Date(now).toISOString();
  const alerts: ExposureAlert[] = [];

  for (const asset of assets) {
    const allowed = clusters.filter((c) => clusterAllowedAsEvidence(asset, c));
    const scored = allowed
      .map((cluster) => calculateClusterAssetScore(asset, cluster, now))
      .filter((p) => p.clusterScore > 0)
      .sort((a, b) => b.clusterScore - a.clusterScore);

    const topParts = scored.slice(0, maxEvidence);
    const evidence = topParts.map(buildEvidenceItem);

    const rawIntensity = topParts.reduce((acc, p) => acc + p.clusterScore, 0);
    const baseScore = 100 * (1 - Math.exp(-rawIntensity / SIGNAL_SATURATION_DIVISOR));
    const importanceMultiplier = IMPORTANCE_MULTIPLIER[asset.importance] ?? 1.0;
    const families = unique(evidence.flatMap((e) => e.sourceFamilies));
    const diversityBonus = sourceDiversityBonus(families.length);
    const countryContextLift = calculateCountryContextLift(asset, mapData);

    const scoreBeforeCaps =
      baseScore * importanceMultiplier + diversityBonus + countryContextLift;

    let confidence = confidenceFromEvidence(evidence, topParts, cacheStale, providerFailures);

    const capsResult = applyCaps(scoreBeforeCaps, {
      evidence,
      topParts,
      countryContextLift,
      cacheStale,
      providerFailures,
      asset,
    });

    let score = capsResult.score;
    const capsApplied = capsResult.capsApplied.slice();

    if (confidence === "low" && score > LOW_CONFIDENCE_CAP) {
      score = LOW_CONFIDENCE_CAP;
      capsApplied.push("Confidence is low — capped at elevated.");
    }

    if (cacheStale) {
      capsApplied.push("Map cache is stale (>24h) — confidence lowered.");
    }
    if (providerFailures > 0) {
      capsApplied.push(
        `${providerFailures} provider${providerFailures === 1 ? "" : "s"} reporting failures — confidence lowered.`
      );
      if (confidence === "high") confidence = "medium";
    }

    const level = getExposureLevel(score);

    const breakdown = buildBreakdown({
      total: score,
      baseScore,
      topParts,
      importanceMultiplier,
      diversityBonus,
      countryContextLift,
      capsApplied,
    });

    const regionalContext = buildRegionalContext({
      asset,
      clusters,
      evidence,
      now,
    });

    alerts.push({
      id: `alert-${asset.id}-${now}`,
      asset,
      level,
      score,
      confidence,
      headline: buildHeadline(asset, level),
      whyItMatters: buildWhyItMatters(asset, evidence),
      whatChanged: buildWhatChanged(evidence, topParts),
      uncertainty: buildUncertainty(
        evidence,
        topParts,
        capsApplied,
        cacheStale,
        providerFailures,
        failingProviderNames
      ),
      watchNext: buildWatchNext(evidence),
      breakdown,
      evidence,
      regionalContext: regionalContext.length > 0 ? regionalContext : undefined,
      generatedAt,
      range,
    });
  }

  return alerts.sort((a, b) => b.score - a.score);
}
