import { countriesMatch } from "@/lib/countryDisplay";
import {
  ASSET_PROFILES,
  EMPTY_PROFILE,
  type AssetProfile,
} from "./assetContext.profiles";
import { getDistanceKm } from "./distance";
import type {
  EvidenceCluster,
  RegionalContextReason,
  UserAsset,
} from "./types";

const THEATER_RADIUS_KM = 1500;
const CORRIDOR_RADIUS_KM = 2000;

function profileTagMatches(profile: AssetProfile, asset: UserAsset): boolean {
  const tagsAny = profile.match.tagsAny;
  if (!tagsAny || tagsAny.length === 0) return false;
  const assetTags = (asset.tags ?? []).map((t) => t.toLowerCase());
  if (assetTags.length === 0) return false;
  return tagsAny.some((t) => assetTags.includes(t.toLowerCase()));
}

/**
 * Find the most specific profile for an asset.
 * Match precedence (most → least specific):
 *  1) exact assetId
 *  2) assetType + country
 *  3) country only
 *  4) tagsAny intersection
 * Returns `null` if no profile matches — callers should treat this as "no
 * neighbor/theater filtering" and use country-only matching.
 */
export function profileForAsset(asset: UserAsset): AssetProfile | null {
  for (const p of ASSET_PROFILES) {
    if (p.match.assetId && p.match.assetId === asset.id) return p;
  }
  for (const p of ASSET_PROFILES) {
    if (
      p.match.assetType &&
      p.match.country &&
      p.match.assetType === asset.type &&
      countriesMatch(p.match.country, asset.country)
    ) {
      return p;
    }
  }
  for (const p of ASSET_PROFILES) {
    if (p.match.country && !p.match.assetType && !p.match.assetId) {
      if (countriesMatch(p.match.country, asset.country)) return p;
    }
  }
  for (const p of ASSET_PROFILES) {
    if (profileTagMatches(p, asset)) return p;
  }
  return null;
}

function lc(value: string | undefined | null): string {
  if (!value) return "";
  return value.toLowerCase();
}

function titleHaystack(cluster: EvidenceCluster): string {
  const parts: string[] = [];
  if (cluster.title) parts.push(cluster.title);
  for (const point of cluster.points) {
    if (point.title) parts.push(point.title);
    const md = point.metadata;
    if (md && typeof md === "object") {
      for (const v of Object.values(md)) {
        if (typeof v === "string" && v.length > 0) parts.push(v);
      }
    }
  }
  return parts.join(" \u00b7 ").toLowerCase();
}

function neighborMatch(
  profile: AssetProfile,
  cluster: EvidenceCluster
): boolean {
  if (!cluster.country) return false;
  return profile.neighborCountries.some((n) =>
    countriesMatch(n, cluster.country)
  );
}

function keywordMatch(
  haystack: string,
  keywords: string[]
): boolean {
  if (keywords.length === 0) return false;
  for (const kw of keywords) {
    const k = kw.toLowerCase().trim();
    if (k.length === 0) continue;
    if (haystack.includes(k)) return true;
  }
  return false;
}

/**
 * Compute reasons a live cluster is relevant to an asset's regional context.
 * Returns an empty array when no reason applies.
 *
 * Inputs are real signals (cluster) + real asset metadata. No content is
 * synthesized: profiles only widen *which* live clusters count, never
 * substitute for them.
 */
export function clusterContextReasons(
  asset: UserAsset,
  profile: AssetProfile | null,
  cluster: EvidenceCluster,
  distanceKm: number
): RegionalContextReason[] {
  const reasons: RegionalContextReason[] = [];

  if (countriesMatch(cluster.country, asset.country)) {
    reasons.push("same_country");
  }

  const p = profile ?? EMPTY_PROFILE;
  if (neighborMatch(p, cluster)) {
    if (!reasons.includes("neighbor_country")) reasons.push("neighbor_country");
  }

  if (
    p.theaterKeywords.length > 0 &&
    Number.isFinite(distanceKm) &&
    distanceKm <= THEATER_RADIUS_KM
  ) {
    const haystack = titleHaystack(cluster);
    if (keywordMatch(haystack, p.theaterKeywords)) {
      reasons.push("theater_match");
    }
  }

  if (
    p.corridorKeywords.length > 0 &&
    Number.isFinite(distanceKm) &&
    distanceKm <= CORRIDOR_RADIUS_KM
  ) {
    const haystack = titleHaystack(cluster);
    if (keywordMatch(haystack, p.corridorKeywords)) {
      reasons.push("corridor_match");
    }
  }

  return reasons;
}

/** Distance helper used by callers when a precomputed value is not available. */
export function clusterDistanceKm(
  asset: UserAsset,
  cluster: EvidenceCluster
): number {
  return getDistanceKm(
    { lat: asset.lat, lon: asset.lon },
    { lat: cluster.lat, lon: cluster.lon }
  );
}
