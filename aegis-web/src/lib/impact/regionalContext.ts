import {
  clusterContextReasons,
  clusterDistanceKm,
  profileForAsset,
} from "./assetContext";
import type {
  EvidenceCluster,
  EvidenceItem,
  RegionalContextItem,
  RegionalContextReason,
  UserAsset,
} from "./types";

const HOUR_MS = 60 * 60 * 1000;
const MAX_AGE_HOURS = 30 * 24; // 30 days; matches the longest "recent" range
const DEFAULT_MAX_ITEMS = 5;

const SEVERITY_WEIGHT: Record<EvidenceCluster["severity"], number> = {
  critical: 3,
  high: 2,
  medium: 1,
  low: 0,
};

const REASON_WEIGHT: Record<RegionalContextReason, number> = {
  same_country: 4,
  theater_match: 3,
  corridor_match: 2,
  neighbor_country: 1,
  supplier_overlay: 0,
};

const REASON_LABEL: Record<RegionalContextReason, string> = {
  same_country: "Same country",
  neighbor_country: "Neighbor country",
  theater_match: "Theater match",
  corridor_match: "Corridor match",
  supplier_overlay: "Supplier overlay",
};

function bestReason(reasons: RegionalContextReason[]): RegionalContextReason | null {
  if (reasons.length === 0) return null;
  let best = reasons[0];
  for (const r of reasons) {
    if ((REASON_WEIGHT[r] ?? 0) > (REASON_WEIGHT[best] ?? 0)) best = r;
  }
  return best;
}

export function regionalContextReasonLabel(reason: RegionalContextReason): string {
  return REASON_LABEL[reason] ?? "Context";
}

type BuildArgs = {
  asset: UserAsset;
  clusters: EvidenceCluster[];
  evidence: EvidenceItem[];
  now?: number;
  maxItems?: number;
};

/**
 * Build a profile-aware regional-context list for an asset from already-
 * clustered live signals. Items are *additional* to the alert's `evidence`
 * array (which holds the score-driving direct evidence) — never duplicates.
 *
 * Cap at `maxItems` (default 5). Items always carry a real source url when
 * available and at least one match reason. No synthetic content is added.
 */
export function buildRegionalContext(args: BuildArgs): RegionalContextItem[] {
  const { asset, clusters, evidence } = args;
  const now = args.now ?? Date.now();
  const maxItems = args.maxItems ?? DEFAULT_MAX_ITEMS;

  if (!Array.isArray(clusters) || clusters.length === 0) return [];

  const profile = profileForAsset(asset);
  const usedClusterIds = new Set(evidence.map((e) => e.clusterId));
  const usedTitles = new Set(
    evidence.map((e) => e.title?.toLowerCase().trim()).filter((t): t is string => !!t)
  );

  type Scored = {
    cluster: EvidenceCluster;
    reasons: RegionalContextReason[];
    distanceKm: number;
    ageHours: number;
    rank: number;
  };
  const scored: Scored[] = [];

  for (const cluster of clusters) {
    if (usedClusterIds.has(cluster.id)) continue;
    if (cluster.eventClass === "model_risk_context") continue;

    const ts = new Date(cluster.timestamp).getTime();
    if (!Number.isFinite(ts)) continue;
    const ageHours = Math.max(0, (now - ts) / HOUR_MS);
    if (ageHours > MAX_AGE_HOURS) continue;

    const distanceKm = clusterDistanceKm(asset, cluster);
    const reasons = clusterContextReasons(asset, profile, cluster, distanceKm);
    if (reasons.length === 0) continue;

    const titleKey = cluster.title?.toLowerCase().trim() ?? "";
    if (titleKey && usedTitles.has(titleKey)) continue;

    const reasonScore = reasons.reduce(
      (acc, r) => Math.max(acc, REASON_WEIGHT[r] ?? 0),
      0
    );
    const severityScore = SEVERITY_WEIGHT[cluster.severity] ?? 0;
    const recencyScore = ageHours <= 24 ? 3 : ageHours <= 72 ? 2 : ageHours <= 168 ? 1 : 0;
    const reliabilityScore = Math.round((cluster.sourceReliability ?? 0) * 10) / 10;

    const rank =
      reasonScore * 100 +
      severityScore * 25 +
      recencyScore * 15 +
      reliabilityScore * 5;

    scored.push({ cluster, reasons, distanceKm, ageHours, rank });
  }

  scored.sort((a, b) => {
    if (b.rank !== a.rank) return b.rank - a.rank;
    return a.ageHours - b.ageHours;
  });

  const items: RegionalContextItem[] = [];
  for (const s of scored) {
    if (items.length >= maxItems) break;
    const cluster = s.cluster;
    const top = cluster.points[0];
    const url = cluster.points
      .map((p) => p.url)
      .find((u): u is string => typeof u === "string" && u.length > 0);
    const reason = bestReason(s.reasons) ?? s.reasons[0];
    if (!reason) continue;

    items.push({
      id: `regional-context-${cluster.id}`,
      clusterId: cluster.id,
      title: cluster.title,
      source: cluster.sources[0] ?? top?.source ?? "Unknown source",
      sourceFamily: cluster.sourceFamilies[0] ?? top?.sourceFamily ?? "unknown",
      eventClass: cluster.eventClass,
      severity: cluster.severity,
      timestamp: cluster.timestamp,
      country: cluster.country,
      lat: cluster.lat,
      lon: cluster.lon,
      distanceKm: Number.isFinite(s.distanceKm) ? s.distanceKm : undefined,
      url,
      reasons: s.reasons,
      matchLabel: REASON_LABEL[reason] ?? "Context",
    });
  }

  return items;
}
