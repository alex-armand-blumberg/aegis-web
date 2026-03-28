import type { IntelLayerKey } from "./types";

export const INTEL_LAYER_LABELS: Record<IntelLayerKey, string> = {
  conflicts: "Conflicts (all)",
  conflictsBattles: "Battles",
  conflictsExplosions: "Explosions",
  conflictsCivilians: "Attack on civilians",
  conflictsStrategic: "Strategic developments",
  conflictsProtests: "Protests",
  conflictsRiots: "Riots",
  liveStrikes: "Live strikes",
  flights: "Flights",
  vessels: "Vessels",
  troopMovements: "Troop movements",
  carriers: "Carriers",
  news: "News & intel",
  escalationRisk: "Escalation risk",
  hotspots: "Hotspots",
  infrastructure: "Infrastructure",
};
