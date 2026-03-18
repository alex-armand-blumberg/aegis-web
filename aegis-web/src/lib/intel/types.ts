export type IntelLayerKey =
  | "conflicts"
  | "liveStrikes"
  | "flights"
  | "vessels"
  | "carriers"
  | "news"
  | "escalationRisk"
  | "hotspots"
  | "infrastructure";

export type IntelSeverity = "low" | "medium" | "high" | "critical";

export type IntelPoint = {
  id: string;
  layer: IntelLayerKey;
  title: string;
  subtitle?: string;
  lat: number;
  lon: number;
  country?: string;
  severity: IntelSeverity;
  source: string;
  timestamp: string;
  magnitude?: number;
  confidence?: number;
  imageUrl?: string;
  aiSummary?: string;
  metadata?: Record<string, string | number | boolean | null>;
};

export type ProviderHealth = {
  provider: string;
  ok: boolean;
  updatedAt: string;
  latencyMs?: number;
  message?: string;
};

export type ActiveConflictCountry = {
  country: string;
  score: number;
  severity: IntelSeverity;
  latestEventAt: string;
  sources: string[];
};

export type EscalationRiskCountry = {
  country: string;
  riskScore: number;
  severity: IntelSeverity;
  trend: "rising" | "stable" | "declining";
  latestEventAt: string;
  signals: string[];
};

export type FrontlineOverlay = {
  id: string;
  name: string;
  theater: string;
  updatedAt: string;
  confidence: number;
  source: string;
  geojson: unknown;
};

export type MapApiResponse = {
  updatedAt: string;
  range: string;
  layers: Record<IntelLayerKey, IntelPoint[]>;
  providerHealth: ProviderHealth[];
  activeConflictCountries?: ActiveConflictCountry[];
  escalationRiskCountries?: EscalationRiskCountry[];
  frontlineOverlays?: FrontlineOverlay[];
};

export type CountryIntelResponse = {
  country: string;
  range: string;
  updatedAt: string;
  instabilityIndex: number;
  status: "stable" | "elevated" | "critical";
  signals: {
    liveStrikes: number;
    conflicts: number;
    militaryFlights: number;
    navalVessels: number;
    carrierSignals: number;
    protests: number;
    criticalNews: number;
  };
  timeline: Array<{
    day: string;
    liveStrikes: number;
    conflicts: number;
    military: number;
    protests: number;
    natural: number;
  }>;
  topNews: Array<{
    title: string;
    severity: IntelSeverity;
    source: string;
    timestamp: string;
  }>;
  militaryActivity: {
    ownFlights: number;
    foreignFlights: number;
    navalVessels: number;
    foreignPresence: "yes" | "no";
    nearestMilitaryBaseKm?: number;
  };
  infrastructureExposure: {
    nearbyCritical: number;
    nearestCriticalKm?: number;
  };
};
