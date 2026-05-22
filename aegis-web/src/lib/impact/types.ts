import type { IntelLayerKey, IntelPoint, IntelSeverity } from "@/lib/intel/types";

export type AssetType =
  | "supplier"
  | "facility"
  | "office"
  | "port"
  | "route"
  | "field_site"
  | "school_program"
  | "personnel"
  | "region"
  | "infrastructure"
  | "other";

export type AssetImportance = "low" | "medium" | "high" | "critical";

export type UserAsset = {
  id: string;
  name: string;
  type: AssetType;
  country: string;
  city?: string;
  lat: number;
  lon: number;
  importance: AssetImportance;
  owner?: string;
  notes?: string;
  tags?: string[];
};

export type SourceFamily =
  | "structured_conflict"
  | "news"
  | "official"
  | "humanitarian"
  | "disaster"
  | "sanctions"
  | "maritime"
  | "aviation"
  | "infrastructure"
  | "market"
  | "model_context"
  | "unknown";

export type GeoPrecision = "exact" | "city" | "region" | "country" | "unknown";

export type EventClass =
  | "armed_conflict"
  | "strike_or_explosion"
  | "civilian_harm"
  | "protest_or_unrest"
  | "strategic_development"
  | "humanitarian_stress"
  | "natural_disaster"
  | "sanctions_or_economic"
  | "maritime_activity"
  | "aviation_activity"
  | "infrastructure_disruption"
  | "news_report"
  | "model_risk_context"
  | "other";

export type NormalizedSignal = {
  id: string;
  originalPoint: IntelPoint;
  title: string;
  layer: IntelLayerKey;
  eventClass: EventClass;
  sourceFamily: SourceFamily;
  source: string;
  timestamp: string;
  lat: number;
  lon: number;
  country?: string;
  severity: IntelSeverity;
  sourceReliability: number;
  geoPrecision: GeoPrecision;
  confidence?: number;
  url?: string;
  metadata?: Record<string, string | number | boolean | null>;
};

export type EvidenceCluster = {
  id: string;
  title: string;
  eventClass: EventClass;
  sourceFamilies: SourceFamily[];
  sources: string[];
  layers: IntelLayerKey[];
  country?: string;
  lat: number;
  lon: number;
  timestamp: string;
  severity: IntelSeverity;
  sourceReliability: number;
  geoPrecision: GeoPrecision;
  points: NormalizedSignal[];
};

export type EvidenceItem = {
  id: string;
  clusterId: string;
  pointIds: string[];
  title: string;
  eventClass: EventClass;
  sourceFamilies: SourceFamily[];
  sources: string[];
  layers: IntelLayerKey[];
  timestamp: string;
  country?: string;
  lat: number;
  lon: number;
  distanceKm?: number;
  severity: IntelSeverity;
  sourceReliability: number;
  geoPrecision: GeoPrecision;
  confidence?: number;
  urls?: string[];
  summary?: string;
  metadata?: Record<string, string | number | boolean | null>;
};

export type ExposureLevel = "low" | "guarded" | "elevated" | "high" | "critical";

export type ConfidenceLevel = "low" | "medium" | "high";

export type ExposureScoreBreakdown = {
  total: number;
  signalIntensity: number;
  proximity: number;
  severity: number;
  recency: number;
  sourceReliability: number;
  sourceDiversity: number;
  assetRelevance: number;
  assetImportance: number;
  countryContext: number;
  capsApplied: string[];
};

export type ExposureAlert = {
  id: string;
  asset: UserAsset;
  level: ExposureLevel;
  score: number;
  confidence: ConfidenceLevel;
  headline: string;
  whyItMatters: string;
  whatChanged: string;
  uncertainty: string;
  watchNext: string[];
  breakdown: ExposureScoreBreakdown;
  evidence: EvidenceItem[];
  generatedAt: string;
  range: string;
};

export type AlertFeedbackValue =
  | "useful"
  | "not_useful"
  | "false_positive"
  | "needs_better_sources";

export type AlertFeedback = {
  alertId: string;
  assetId: string;
  value: AlertFeedbackValue;
  note?: string;
  createdAt: string;
};
