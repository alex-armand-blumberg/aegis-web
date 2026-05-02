import type { AcledMonthlyRecord } from "@/lib/escalation";

export const ESCALATION_V2_METHODOLOGY_VERSION = "v2-transparent-2026-05";
export const ESCALATION_V2_MODEL_VERSION = "v2-calibration-heuristic-2026-05";

export type EscalationSourceId =
  | "acled"
  | "gdelt_cloud"
  | "reliefweb"
  | "gdacs"
  | "event_registry";

export type EscalationSignalType =
  | "battle"
  | "explosion"
  | "violence_against_civilians"
  | "strategic_development"
  | "protest"
  | "riot"
  | "fatalities"
  | "conflict_event"
  | "conflict_fatality"
  | "story_cluster"
  | "humanitarian_report"
  | "disaster_alert"
  | "actor_mobilization";

export type SourceMetadata = {
  id: EscalationSourceId;
  label: string;
  enabled: boolean;
  configured: boolean;
  apiUrl: string;
  authEnvVars: string[];
  refreshIntervalHours: number;
  attribution: string;
  termsNote: string;
  storagePolicy: string;
  reliability: number;
  freshnessHalfLifeHours: number;
  lastFetchedAt?: string;
  status?: "ok" | "skipped" | "error";
  error?: string;
};

export type EscalationSignal = {
  country: string;
  date: string;
  source: EscalationSourceId;
  signalType: EscalationSignalType;
  value: number;
  confidence: number;
  freshnessHours: number;
  evidenceUrl?: string;
  title?: string;
  sourceEventId?: string;
  termsNote: string;
};

export type EscalationEvidence = {
  month: string;
  source: EscalationSourceId;
  label: string;
  url?: string;
  title?: string;
  signalType: EscalationSignalType;
  value: number;
  confidence: number;
};

export type EscalationComponentScores = {
  kineticViolence: number;
  civilianTargeting: number;
  acceleration: number;
  diffusion: number;
  actorMobilization: number;
  informationSurge: number;
  humanitarianStress: number;
  countryAnomaly: number;
  globalSeverity: number;
};

export type EscalationRiskScores = {
  risk_30d: number;
  risk_60d: number;
  risk_90d: number;
  band_low: number;
  band_high: number;
};

export type EscalationSourceContribution = {
  source: EscalationSourceId;
  label: string;
  signalCount: number;
  weightedSignal: number;
  lastEventDate?: string;
};

export type EscalationV2PointExtras = {
  methodologyVersion: string;
  modelVersion: string;
  components: EscalationComponentScores;
  risk: EscalationRiskScores;
  sources: EscalationSourceContribution[];
  evidence: EscalationEvidence[];
  dataFreshness: {
    newestSignalAt?: string;
    oldestSignalAt?: string;
    medianFreshnessHours?: number;
  };
};

export type SourceFetchContext = {
  country: string;
  startDate: Date;
  endDate: Date;
  now: Date;
};

export type SourceFetchResult = {
  metadata: SourceMetadata;
  signals: EscalationSignal[];
};

export type EscalationV2BuildInput = {
  country: string;
  acledRows: AcledMonthlyRecord[];
  externalSignals: EscalationSignal[];
  sourceMetadata: SourceMetadata[];
  now: Date;
};
