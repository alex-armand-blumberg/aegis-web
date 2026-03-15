import type { MapPoint } from "@/app/api/map/route";
import { getCountryBounds, type LatLngBoundsTuple } from "./countryBounds";

export type CountrySummary = {
  fatalities: number;
  battles: number;
  explosions: number;
  civ_violence: number;
  strategic: number;
  protests: number;
  riots: number;
  metric_total: number;
};

/** Aggregate points by country (sum of event counts) for the info panel. */
export function aggregatePointsByCountry(
  points: MapPoint[]
): Record<string, CountrySummary> {
  const byCountry: Record<
    string,
    {
      fatalities: number;
      battles: number;
      explosions_remote_violence: number;
      violence_against_civilians: number;
      strategic_developments: number;
      protests: number;
      riots: number;
    }
  > = {};

  for (const p of points) {
    const c = p.country?.trim() || "Unknown";
    if (!byCountry[c]) {
      byCountry[c] = {
        fatalities: 0,
        battles: 0,
        explosions_remote_violence: 0,
        violence_against_civilians: 0,
        strategic_developments: 0,
        protests: 0,
        riots: 0,
      };
    }
    byCountry[c].fatalities += Number(p.fatalities) || 0;
    byCountry[c].battles += Number(p.battles) || 0;
    byCountry[c].explosions_remote_violence +=
      Number(p.explosions_remote_violence) || 0;
    byCountry[c].violence_against_civilians +=
      Number(p.violence_against_civilians) || 0;
    byCountry[c].strategic_developments +=
      Number(p.strategic_developments) || 0;
    byCountry[c].protests += Number(p.protests) || 0;
    byCountry[c].riots += Number(p.riots) || 0;
  }

  const result: Record<string, CountrySummary> = {};
  for (const [country, agg] of Object.entries(byCountry)) {
    const metric_total =
      agg.battles +
      agg.explosions_remote_violence +
      agg.violence_against_civilians +
      agg.strategic_developments +
      agg.protests +
      agg.riots;
    result[country] = {
      fatalities: agg.fatalities,
      battles: agg.battles,
      explosions: agg.explosions_remote_violence,
      civ_violence: agg.violence_against_civilians,
      strategic: agg.strategic_developments,
      protests: agg.protests,
      riots: agg.riots,
      metric_total,
    };
  }
  return result;
}

/** Get bounds for a country: use hardcoded bbox if available, else compute from points. */
export function getBoundsForCountry(
  country: string,
  points: MapPoint[]
): LatLngBoundsTuple | null {
  const hardcoded = getCountryBounds(country);
  if (hardcoded) return hardcoded;
  const forCountry = points.filter(
    (p) => (p.country?.trim() || "") === country.trim()
  );
  if (forCountry.length === 0) return null;
  let minLat = 90,
    maxLat = -90,
    minLon = 180,
    maxLon = -180;
  for (const p of forCountry) {
    if (p.lat >= -90 && p.lat <= 90 && p.lon >= -180 && p.lon <= 180) {
      minLat = Math.min(minLat, p.lat);
      maxLat = Math.max(maxLat, p.lat);
      minLon = Math.min(minLon, p.lon);
      maxLon = Math.max(maxLon, p.lon);
    }
  }
  if (minLat > maxLat || minLon > maxLon) return null;
  const pad = Math.max(0.5, Math.max(maxLat - minLat, maxLon - minLon) * 0.15);
  return [
    [minLat - pad, minLon - pad],
    [maxLat + pad, maxLon + pad],
  ];
}
