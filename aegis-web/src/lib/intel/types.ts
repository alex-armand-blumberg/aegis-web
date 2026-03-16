export type IntelLayerKey =
  | "conflicts"
  | "flights"
  | "vessels"
  | "carriers"
  | "news"
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
  metadata?: Record<string, string | number | boolean | null>;
};

export type ProviderHealth = {
  provider: string;
  ok: boolean;
  updatedAt: string;
  latencyMs?: number;
  message?: string;
};

export type MapApiResponse = {
  updatedAt: string;
  range: string;
  layers: Record<IntelLayerKey, IntelPoint[]>;
  providerHealth: ProviderHealth[];
};
