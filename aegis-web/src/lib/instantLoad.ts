"use client";

import type { MapApiResponse } from "@/lib/intel/types";

export const DEFAULT_MAP_RANGE = "7d";
export const DEFAULT_MAP_LAYERS = [
  "conflictsBattles",
  "conflictsExplosions",
  "conflictsCivilians",
  "conflictsStrategic",
  "liveStrikes",
  "carriers",
  "news",
  "escalationRisk",
  "hotspots",
  "infrastructure",
];

type MapPrefetchEntry = {
  url: string;
  startedAt: number;
  data?: MapApiResponse;
  promise?: Promise<MapApiResponse>;
};

declare global {
  interface Window {
    __aegisMapPrefetch?: MapPrefetchEntry;
  }
}

export function buildMapDataUrl(
  range = DEFAULT_MAP_RANGE,
  layers = DEFAULT_MAP_LAYERS.join(",")
): string {
  const params = new URLSearchParams({ range, layers });
  return `/api/map?${params.toString()}`;
}

export function getMapPrefetchEntry(url: string): MapPrefetchEntry | null {
  if (typeof window === "undefined") return null;
  const entry = window.__aegisMapPrefetch;
  return entry?.url === url ? entry : null;
}

export function consumeReadyMapPrefetch(url: string): MapApiResponse | null {
  const entry = getMapPrefetchEntry(url);
  return entry?.data ?? null;
}

export function prefetchMapExperience(url = buildMapDataUrl()): Promise<MapApiResponse> | null {
  if (typeof window === "undefined") return null;
  const existing = getMapPrefetchEntry(url);
  if (existing?.data) return Promise.resolve(existing.data);
  if (existing?.promise) return existing.promise;

  const dataPromise = fetch(url)
    .then(async (res) => {
      const data = (await res.json()) as MapApiResponse & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to prefetch map feeds");
      return data;
    })
    .then((data) => {
      if (window.__aegisMapPrefetch?.url === url) {
        window.__aegisMapPrefetch.data = data;
      }
      return data;
    });

  window.__aegisMapPrefetch = {
    url,
    startedAt: Date.now(),
    promise: dataPromise,
  };

  void import("@/components/ConflictMap");
  void import("@/components/ConflictGlobe");
  return dataPromise;
}
