"use client";

import { useCallback, useEffect, useState } from "react";
import type { MapApiResponse } from "@/lib/intel/types";
import { buildMapDataUrl } from "@/lib/instantLoad";

export const IMPACT_RANGE_OPTIONS = ["24h", "7d", "30d"] as const;
export type ImpactRangeOption = (typeof IMPACT_RANGE_OPTIONS)[number];

export const IMPACT_LAYERS = [
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
].join(",");

type LoadState = "idle" | "loading" | "ready" | "error";

export function useImpactMapData(initialRange: ImpactRangeOption = "7d") {
  const [range, setRange] = useState<ImpactRangeOption>(initialRange);
  const [mapData, setMapData] = useState<MapApiResponse | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchMap = useCallback(async (r: ImpactRangeOption) => {
    setLoadState("loading");
    setLoadError(null);
    try {
      const url = buildMapDataUrl(r, IMPACT_LAYERS);
      const res = await fetch(url, { cache: "no-store" });
      const data = (await res.json()) as MapApiResponse & { error?: string };
      if (!res.ok || data.error) {
        throw new Error(data.error ?? `Failed to fetch map data (HTTP ${res.status})`);
      }
      setMapData(data);
      setLoadState("ready");
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to fetch map data.");
      setLoadState("error");
    }
  }, []);

  useEffect(() => {
    void fetchMap(range);
  }, [range, fetchMap]);

  const isLoading = loadState === "loading" || loadState === "idle";

  return {
    range,
    setRange,
    mapData,
    loadState,
    loadError,
    fetchMap,
    isLoading,
  };
}
