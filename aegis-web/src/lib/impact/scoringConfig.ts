import type { IntelSeverity } from "@/lib/intel/types";
import type {
  AssetImportance,
  AssetType,
  EventClass,
  ExposureLevel,
  SourceFamily,
} from "./types";

export const SEVERITY_BASE: Record<IntelSeverity, number> = {
  low: 3,
  medium: 8,
  high: 15,
  critical: 22,
};

export type DistanceBand = {
  maxKm: number;
  multiplier: number;
};

/** Point-asset distance bands (km). The last band uses sameCountryOnly. */
export const DISTANCE_BANDS: DistanceBand[] = [
  { maxKm: 10, multiplier: 1.0 },
  { maxKm: 25, multiplier: 0.85 },
  { maxKm: 100, multiplier: 0.55 },
  { maxKm: 300, multiplier: 0.25 },
];

export const SAME_COUNTRY_MULTIPLIER = 0.1;

export function distanceMultiplier(
  distanceKm: number | undefined,
  sameCountry: boolean
): number {
  if (distanceKm !== undefined && Number.isFinite(distanceKm)) {
    for (const band of DISTANCE_BANDS) {
      if (distanceKm <= band.maxKm) return band.multiplier;
    }
  }
  return sameCountry ? SAME_COUNTRY_MULTIPLIER : 0;
}

/** Recency multipliers based on age from now (hours). */
export function recencyMultiplier(ageHours: number | undefined): number {
  if (ageHours === undefined || !Number.isFinite(ageHours) || ageHours < 0) {
    return 0.05;
  }
  if (ageHours <= 24) return 1.0;
  if (ageHours <= 24 * 7) return 0.75;
  if (ageHours <= 24 * 30) return 0.4;
  if (ageHours <= 24 * 90) return 0.15;
  return 0.05;
}

export const IMPORTANCE_MULTIPLIER: Record<AssetImportance, number> = {
  low: 0.85,
  medium: 1.0,
  high: 1.15,
  critical: 1.3,
};

/** Bonus points (additive) by number of distinct source families in the top evidence set. */
export function sourceDiversityBonus(uniqueFamilies: number): number {
  if (uniqueFamilies <= 1) return 0;
  if (uniqueFamilies === 2) return 4;
  if (uniqueFamilies === 3) return 7;
  return 10;
}

/** Country-context lift (additive, max 10). */
export const COUNTRY_CONTEXT_MAX = 10;

/** Saturation parameter for raw signal intensity. */
export const SIGNAL_SATURATION_DIVISOR = 30;

export const EXPOSURE_LEVEL_THRESHOLDS: Array<{
  level: ExposureLevel;
  min: number;
}> = [
  { level: "critical", min: 80 },
  { level: "high", min: 60 },
  { level: "elevated", min: 40 },
  { level: "guarded", min: 20 },
  { level: "low", min: 0 },
];

export function getExposureLevelFor(score: number): ExposureLevel {
  for (const band of EXPOSURE_LEVEL_THRESHOLDS) {
    if (score >= band.min) return band.level;
  }
  return "low";
}

export const SOURCE_RELIABILITY_BASE: Record<SourceFamily, number> = {
  structured_conflict: 0.85,
  official: 0.9,
  humanitarian: 0.85,
  disaster: 0.85,
  sanctions: 0.85,
  infrastructure: 0.75,
  maritime: 0.7,
  aviation: 0.65,
  news: 0.6,
  market: 0.55,
  model_context: 0.45,
  unknown: 0.4,
};

const DEFAULT_RELEVANCE = 1.0;
const RELEVANCE_MIN = 0.35;
const RELEVANCE_MAX = 1.25;

/**
 * Asset type × event class relevance matrix.
 * Returned values are clamped to [RELEVANCE_MIN, RELEVANCE_MAX].
 */
const RELEVANCE_MATRIX: Partial<Record<AssetType, Partial<Record<EventClass, number>>>> = {
  supplier: {
    armed_conflict: 1.2,
    strike_or_explosion: 1.2,
    infrastructure_disruption: 1.2,
    sanctions_or_economic: 1.2,
    protest_or_unrest: 1.1,
    civilian_harm: 0.9,
    natural_disaster: 1.1,
    maritime_activity: 1.05,
    aviation_activity: 0.85,
    humanitarian_stress: 0.8,
    strategic_development: 0.95,
    news_report: 0.85,
    model_risk_context: 0.5,
    other: 0.85,
  },
  facility: {
    armed_conflict: 1.2,
    strike_or_explosion: 1.2,
    infrastructure_disruption: 1.2,
    sanctions_or_economic: 1.15,
    protest_or_unrest: 1.1,
    civilian_harm: 0.95,
    natural_disaster: 1.15,
    maritime_activity: 0.9,
    aviation_activity: 0.85,
    humanitarian_stress: 0.85,
    strategic_development: 0.95,
    news_report: 0.85,
    model_risk_context: 0.5,
    other: 0.85,
  },
  port: {
    maritime_activity: 1.25,
    infrastructure_disruption: 1.25,
    sanctions_or_economic: 1.2,
    strike_or_explosion: 1.2,
    armed_conflict: 1.15,
    natural_disaster: 1.15,
    aviation_activity: 0.85,
    protest_or_unrest: 1.05,
    civilian_harm: 0.85,
    humanitarian_stress: 0.8,
    strategic_development: 0.95,
    news_report: 0.85,
    model_risk_context: 0.5,
    other: 0.85,
  },
  route: {
    maritime_activity: 1.25,
    infrastructure_disruption: 1.25,
    sanctions_or_economic: 1.2,
    strike_or_explosion: 1.2,
    armed_conflict: 1.15,
    aviation_activity: 1.05,
    natural_disaster: 1.1,
    protest_or_unrest: 1.0,
    civilian_harm: 0.8,
    humanitarian_stress: 0.8,
    strategic_development: 0.9,
    news_report: 0.85,
    model_risk_context: 0.5,
    other: 0.85,
  },
  office: {
    protest_or_unrest: 1.25,
    civilian_harm: 1.2,
    strike_or_explosion: 1.2,
    armed_conflict: 1.15,
    natural_disaster: 1.2,
    infrastructure_disruption: 1.1,
    sanctions_or_economic: 0.9,
    humanitarian_stress: 0.9,
    maritime_activity: 0.5,
    aviation_activity: 0.85,
    strategic_development: 0.9,
    news_report: 0.85,
    model_risk_context: 0.5,
    other: 0.85,
  },
  personnel: {
    protest_or_unrest: 1.25,
    civilian_harm: 1.25,
    strike_or_explosion: 1.2,
    armed_conflict: 1.2,
    natural_disaster: 1.2,
    infrastructure_disruption: 1.05,
    sanctions_or_economic: 0.8,
    humanitarian_stress: 0.9,
    maritime_activity: 0.45,
    aviation_activity: 0.85,
    strategic_development: 0.9,
    news_report: 0.85,
    model_risk_context: 0.5,
    other: 0.85,
  },
  school_program: {
    protest_or_unrest: 1.25,
    civilian_harm: 1.25,
    strike_or_explosion: 1.2,
    armed_conflict: 1.2,
    natural_disaster: 1.2,
    infrastructure_disruption: 1.05,
    sanctions_or_economic: 0.8,
    humanitarian_stress: 1.0,
    maritime_activity: 0.45,
    aviation_activity: 0.85,
    strategic_development: 0.85,
    news_report: 0.85,
    model_risk_context: 0.5,
    other: 0.85,
  },
  field_site: {
    humanitarian_stress: 1.25,
    civilian_harm: 1.25,
    armed_conflict: 1.2,
    natural_disaster: 1.2,
    strike_or_explosion: 1.15,
    protest_or_unrest: 1.1,
    infrastructure_disruption: 1.05,
    sanctions_or_economic: 0.9,
    maritime_activity: 0.65,
    aviation_activity: 0.8,
    strategic_development: 0.95,
    news_report: 0.9,
    model_risk_context: 0.55,
    other: 0.85,
  },
  infrastructure: {
    infrastructure_disruption: 1.25,
    strike_or_explosion: 1.2,
    armed_conflict: 1.15,
    natural_disaster: 1.2,
    sanctions_or_economic: 1.1,
    maritime_activity: 0.95,
    aviation_activity: 0.95,
    civilian_harm: 0.85,
    protest_or_unrest: 1.05,
    humanitarian_stress: 0.8,
    strategic_development: 1.0,
    news_report: 0.85,
    model_risk_context: 0.55,
    other: 0.85,
  },
  region: {
    strategic_development: 1.1,
    model_risk_context: 0.95,
    armed_conflict: 1.1,
    news_report: 1.0,
    strike_or_explosion: 1.05,
    civilian_harm: 0.95,
    protest_or_unrest: 1.0,
    natural_disaster: 1.05,
    infrastructure_disruption: 1.0,
    sanctions_or_economic: 1.0,
    maritime_activity: 0.9,
    aviation_activity: 0.9,
    humanitarian_stress: 0.95,
    other: 0.9,
  },
  other: {
    armed_conflict: 1.0,
    strike_or_explosion: 1.0,
    civilian_harm: 0.95,
    protest_or_unrest: 0.95,
    natural_disaster: 1.0,
    infrastructure_disruption: 1.0,
    sanctions_or_economic: 0.9,
    humanitarian_stress: 0.85,
    maritime_activity: 0.85,
    aviation_activity: 0.85,
    strategic_development: 0.85,
    news_report: 0.85,
    model_risk_context: 0.5,
    other: 0.85,
  },
};

export function assetLayerRelevance(
  assetType: AssetType,
  eventClass: EventClass
): number {
  const row = RELEVANCE_MATRIX[assetType];
  const raw = row?.[eventClass] ?? DEFAULT_RELEVANCE;
  return Math.min(RELEVANCE_MAX, Math.max(RELEVANCE_MIN, raw));
}

export const NEWS_ONLY_CAP = 65;
export const NEWS_ONLY_STRONG_FAMILY_THRESHOLD = 3;
export const SAME_COUNTRY_ONLY_CAP = 45;
export const COUNTRY_OR_MODEL_ONLY_CAP = 39;
export const MODEL_ONLY_CAP = 40;
export const OLDER_THAN_7D_CAP = 60;
export const OLDER_THAN_30D_CAP = 45;
export const LOW_CONFIDENCE_CAP = 55;
export const COUNTRY_GEO_CAP = 60;

export const STALE_CACHE_AGE_MS = 24 * 3600 * 1000;
