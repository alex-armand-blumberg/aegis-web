import type { IntelLayerKey } from "@/lib/intel/types";

export const MAP_LAYER_STORAGE_KEY = "aegis-map-layers-v2";

export const TOGGLEABLE_LAYERS: IntelLayerKey[] = [
  "conflictsBattles",
  "conflictsExplosions",
  "conflictsCivilians",
  "conflictsStrategic",
  "conflictsProtests",
  "conflictsRiots",
  "liveStrikes",
  "flights",
  "vessels",
  "carriers",
  "news",
  "escalationRisk",
  "hotspots",
  "infrastructure",
];

export type LayerCategoryId =
  | "conflict"
  | "live"
  | "unrest"
  | "strategic"
  | "air"
  | "maritime"
  | "intel"
  | "risk"
  | "infra";

export type LayerCategory = {
  id: LayerCategoryId;
  label: string;
  layers: IntelLayerKey[];
};

export const LAYER_CATEGORIES: LayerCategory[] = [
  {
    id: "conflict",
    label: "Conflict",
    layers: ["conflictsBattles", "conflictsExplosions", "conflictsCivilians", "conflictsStrategic"],
  },
  { id: "unrest", label: "Civil unrest", layers: ["conflictsProtests", "conflictsRiots"] },
  { id: "live", label: "Live strikes", layers: ["liveStrikes"] },
  { id: "air", label: "Air", layers: ["flights"] },
  { id: "maritime", label: "Maritime", layers: ["vessels", "carriers"] },
  { id: "intel", label: "News & intel", layers: ["news"] },
  { id: "risk", label: "Risk", layers: ["escalationRisk", "hotspots"] },
  { id: "infra", label: "Infrastructure", layers: ["infrastructure"] },
];

export const LAYER_TOOLTIPS: Partial<Record<IntelLayerKey, string>> = {
  conflictsBattles: "Reported battles and engagements",
  conflictsExplosions: "Explosions and blast-related events",
  conflictsCivilians: "Attacks affecting civilians",
  conflictsStrategic: "Strategic developments (territory, control)",
  conflictsProtests: "Protests and civil demonstrations",
  conflictsRiots: "Riots and violent unrest",
  liveStrikes: "Live / near-real strike indicators",
  flights: "Military-relevant flight tracks (ADS-B)",
  vessels: "Ship positions (AIS)",
  carriers: "Aircraft carrier contacts (strict matching)",
  news: "Geolocated news signals",
  escalationRisk: "Country escalation risk shading",
  hotspots: "Escalation hotspot markers",
  infrastructure: "Critical infrastructure points",
};

export type LayerPresetId =
  | "conflict_only"
  | "mobility"
  | "strategic_signals"
  | "infrastructure"
  | "global_watch"
  | "high_risk";

export type LayerPreset = {
  id: LayerPresetId;
  label: string;
  layers: Partial<Record<IntelLayerKey, boolean>>;
};

/** Presets only override listed keys; caller merges onto base false or full-on state as needed. */
export const LAYER_PRESETS: LayerPreset[] = [
  {
    id: "conflict_only",
    label: "Conflict only",
    layers: {
      conflictsBattles: true,
      conflictsExplosions: true,
      conflictsCivilians: true,
      conflictsStrategic: true,
      conflictsProtests: false,
      conflictsRiots: false,
      liveStrikes: true,
      flights: false,
      vessels: false,
      carriers: false,
      news: false,
      escalationRisk: false,
      hotspots: true,
      infrastructure: false,
    },
  },
  {
    id: "mobility",
    label: "Mobility",
    layers: {
      conflictsBattles: false,
      conflictsExplosions: false,
      conflictsCivilians: false,
      conflictsStrategic: false,
      conflictsProtests: false,
      conflictsRiots: false,
      liveStrikes: true,
      flights: true,
      vessels: true,
      carriers: true,
      news: false,
      escalationRisk: true,
      hotspots: true,
      infrastructure: false,
    },
  },
  {
    id: "strategic_signals",
    label: "Strategic signals",
    layers: {
      conflictsBattles: true,
      conflictsExplosions: true,
      conflictsCivilians: true,
      conflictsStrategic: true,
      conflictsProtests: false,
      conflictsRiots: false,
      liveStrikes: true,
      flights: false,
      vessels: false,
      carriers: false,
      news: true,
      escalationRisk: true,
      hotspots: true,
      infrastructure: true,
    },
  },
  {
    id: "infrastructure",
    label: "Infrastructure",
    layers: {
      conflictsBattles: false,
      conflictsExplosions: false,
      conflictsCivilians: false,
      conflictsStrategic: false,
      conflictsProtests: false,
      conflictsRiots: false,
      liveStrikes: false,
      flights: true,
      vessels: true,
      carriers: false,
      news: true,
      escalationRisk: true,
      hotspots: false,
      infrastructure: true,
    },
  },
  {
    id: "global_watch",
    label: "Global watch",
    layers: {
      conflictsBattles: true,
      conflictsExplosions: true,
      conflictsCivilians: true,
      conflictsStrategic: true,
      conflictsProtests: true,
      conflictsRiots: true,
      liveStrikes: true,
      flights: false,
      vessels: false,
      carriers: true,
      news: true,
      escalationRisk: true,
      hotspots: true,
      infrastructure: true,
    },
  },
  {
    id: "high_risk",
    label: "High risk",
    layers: {
      conflictsBattles: true,
      conflictsExplosions: true,
      conflictsCivilians: true,
      conflictsStrategic: true,
      conflictsProtests: false,
      conflictsRiots: false,
      liveStrikes: true,
      flights: true,
      vessels: true,
      carriers: true,
      news: true,
      escalationRisk: true,
      hotspots: true,
      infrastructure: true,
    },
  },
];

export function mergePreset(
  preset: LayerPreset,
  base: Record<IntelLayerKey, boolean>
): Record<IntelLayerKey, boolean> {
  const next = { ...base };
  for (const k of TOGGLEABLE_LAYERS) {
    if (k in preset.layers) next[k] = preset.layers[k]!;
  }
  return next;
}

export function allLayersOn(): Record<IntelLayerKey, boolean> {
  const o = {} as Record<IntelLayerKey, boolean>;
  for (const k of TOGGLEABLE_LAYERS) o[k] = true;
  o.conflicts = false;
  o.troopMovements = false;
  return o;
}

export function allLayersOff(): Record<IntelLayerKey, boolean> {
  const o = {} as Record<IntelLayerKey, boolean>;
  for (const k of TOGGLEABLE_LAYERS) o[k] = false;
  o.conflicts = false;
  o.troopMovements = false;
  return o;
}
