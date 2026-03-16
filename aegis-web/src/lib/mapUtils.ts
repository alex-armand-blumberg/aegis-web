import type { IntelPoint } from "@/lib/intel/types";
import { getCountryBounds, type LatLngBoundsTuple } from "./countryBounds";

export type CountrySummary = {
  totalSignals: number;
  conflictSignals: number;
  flightSignals: number;
  vesselSignals: number;
  newsSignals: number;
  hotspotSignals: number;
  severityScore: number;
};

/** Aggregate generic intelligence points by country for side-panels/ranking. */
export function aggregatePointsByCountry(
  points: IntelPoint[]
): Record<string, CountrySummary> {
  const out: Record<string, CountrySummary> = {};

  for (const p of points) {
    const country = p.country?.trim() || "Unknown";
    if (!out[country]) {
      out[country] = {
        totalSignals: 0,
        conflictSignals: 0,
        flightSignals: 0,
        vesselSignals: 0,
        newsSignals: 0,
        hotspotSignals: 0,
        severityScore: 0,
      };
    }
    out[country].totalSignals += 1;
    if (p.layer === "conflicts") out[country].conflictSignals += 1;
    if (p.layer === "flights") out[country].flightSignals += 1;
    if (p.layer === "vessels") out[country].vesselSignals += 1;
    if (p.layer === "news") out[country].newsSignals += 1;
    if (p.layer === "hotspots") out[country].hotspotSignals += 1;

    const sev = p.severity;
    out[country].severityScore +=
      sev === "critical" ? 4 : sev === "high" ? 3 : sev === "medium" ? 2 : 1;
  }

  return out;
}

/** Get bounds for a country: hardcoded bbox if available, else computed from points. */
export function getBoundsForCountry(
  country: string,
  points: IntelPoint[]
): LatLngBoundsTuple | null {
  const hardcoded = getCountryBounds(country);
  if (hardcoded) return hardcoded;

  const forCountry = points.filter(
    (p) => (p.country?.trim() || "") === country.trim()
  );
  if (!forCountry.length) return null;

  let minLat = 90;
  let maxLat = -90;
  let minLon = 180;
  let maxLon = -180;

  for (const p of forCountry) {
    if (p.lat >= -90 && p.lat <= 90 && p.lon >= -180 && p.lon <= 180) {
      minLat = Math.min(minLat, p.lat);
      maxLat = Math.max(maxLat, p.lat);
      minLon = Math.min(minLon, p.lon);
      maxLon = Math.max(maxLon, p.lon);
    }
  }

  if (minLat > maxLat || minLon > maxLon) return null;

  const pad = Math.max(0.5, Math.max(maxLat - minLat, maxLon - minLon) * 0.2);
  return [
    [minLat - pad, minLon - pad],
    [maxLat + pad, maxLon + pad],
  ];
}
