import type { SelectedAssetEvent } from "@/lib/impact/eventLayer";
import type { EventRelation } from "@/lib/impact/eventRelation";
import { tierRank } from "@/lib/impact/sourceTier";
import type { ExposureAlert, ExposureScoreBreakdown, UserAsset } from "@/lib/impact/types";

// ── Node / edge types ─────────────────────────────────────────────────────────

export type NetworkNodeKind = "asset" | "event" | "source" | "driver";

export type NetworkNode = {
  id: string;
  kind: NetworkNodeKind;
  label: string;
  sublabel: string;
  // extra data for styling
  relation?: EventRelation;
  severity?: SelectedAssetEvent["severity"];
  tier?: SelectedAssetEvent["tier"];
};

export type NetworkEdge = {
  id: string;
  fromId: string;
  toId: string;
  label: string;
  kind: "exposure" | "reportedBy" | "scoreFactor";
};

export type NetworkGraph = {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
};

// ── Node position types ────────────────────────────────────────────────────────

export type NodePosition = { x: number; y: number };
export type NodePositionMap = Record<string, NodePosition>;

// Stored as per-asset drag deltas so new nodes always start at sensible defaults.
type StoredPositions = Record<string, Record<string, { dx: number; dy: number }>>;

const STORAGE_KEY = "aegis-impact-network-positions-v1";

function hasStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function safeParseStored(): StoredPositions {
  if (!hasStorage()) return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    return parsed as StoredPositions;
  } catch {
    return {};
  }
}

export function loadNodeDeltas(assetId: string): Record<string, { dx: number; dy: number }> {
  const all = safeParseStored();
  return all[assetId] ?? {};
}

export function saveNodeDelta(
  assetId: string,
  nodeId: string,
  dx: number,
  dy: number
): void {
  if (!hasStorage()) return;
  try {
    const all = safeParseStored();
    if (!all[assetId]) all[assetId] = {};
    all[assetId][nodeId] = { dx, dy };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    /* localStorage full or unavailable */
  }
}

export function clearNodeDeltas(assetId: string): void {
  if (!hasStorage()) return;
  try {
    const all = safeParseStored();
    delete all[assetId];
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}

// ── Event selection ────────────────────────────────────────────────────────────

const SEVERITY_RANK: Record<SelectedAssetEvent["severity"], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export function pickNetworkEvents(events: SelectedAssetEvent[]): SelectedAssetEvent[] {
  const eligible = events.filter(
    (e) => e.relation !== "model" && e.relation !== "global"
  );

  const sort = (arr: SelectedAssetEvent[]) =>
    [...arr].sort((a, b) => {
      const tierDiff = tierRank(a.tier) - tierRank(b.tier);
      if (tierDiff !== 0) return tierDiff;
      const distA = a.distanceKm ?? Number.POSITIVE_INFINITY;
      const distB = b.distanceKm ?? Number.POSITIVE_INFINITY;
      if (distA !== distB) return distA - distB;
      return SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    });

  const direct = sort(eligible.filter((e) => e.relation === "direct")).slice(0, 2);
  const regional = sort(eligible.filter((e) => e.relation === "regional")).slice(0, 2);
  const contextual = sort(eligible.filter((e) => e.relation === "contextual")).slice(0, 1);

  return [...direct, ...regional, ...contextual];
}

// ── Driver builder ─────────────────────────────────────────────────────────────

const DRIVER_LABELS: Record<string, string> = {
  signalIntensity: "Signal intensity",
  proximity: "Proximity",
  severity: "Severity",
  recency: "Recency",
  sourceReliability: "Source reliability",
  sourceDiversity: "Source diversity",
  countryContext: "Country context",
};

const DRIVER_KEYS: (keyof ExposureScoreBreakdown)[] = [
  "signalIntensity",
  "proximity",
  "severity",
  "recency",
  "sourceReliability",
  "sourceDiversity",
  "countryContext",
];

function pickTopDrivers(
  breakdown: ExposureScoreBreakdown
): { key: string; label: string; value: number }[] {
  const candidates = DRIVER_KEYS.map((key) => ({
    key,
    label: DRIVER_LABELS[key] ?? key,
    value: breakdown[key] as number,
  }))
    .filter((d) => typeof d.value === "number" && d.value > 0)
    .sort((a, b) => b.value - a.value);

  return candidates.slice(0, 2);
}

// ── Main builder ───────────────────────────────────────────────────────────────

export function buildNetworkGraph(opts: {
  asset: UserAsset;
  activeEvents: SelectedAssetEvent[];
  alert: ExposureAlert | null;
}): NetworkGraph {
  const { asset, activeEvents, alert } = opts;

  const nodes: NetworkNode[] = [];
  const edges: NetworkEdge[] = [];

  // Asset node
  const assetNodeId = `asset:${asset.id}`;
  nodes.push({
    id: assetNodeId,
    kind: "asset",
    label: asset.name,
    sublabel: [asset.city, asset.country].filter(Boolean).join(", ") || asset.country,
  });

  // Event nodes
  const selectedEvents = pickNetworkEvents(activeEvents);
  for (const event of selectedEvents) {
    const eventNodeId = `event:${event.id}`;
    const distLabel =
      typeof event.distanceKm === "number" && Number.isFinite(event.distanceKm)
        ? `${Math.round(event.distanceKm)} km`
        : null;
    const sublabelParts = [
      event.severity.charAt(0).toUpperCase() + event.severity.slice(1),
      distLabel,
    ].filter(Boolean);

    nodes.push({
      id: eventNodeId,
      kind: "event",
      label: event.title.length > 60 ? `${event.title.slice(0, 57)}…` : event.title,
      sublabel: sublabelParts.join(" · "),
      relation: event.relation,
      severity: event.severity,
      tier: event.tier,
    });

    edges.push({
      id: `edge:asset-event:${event.id}`,
      fromId: assetNodeId,
      toId: eventNodeId,
      label:
        event.relation === "direct"
          ? "Direct"
          : event.relation === "regional"
            ? "Regional"
            : "Contextual",
      kind: "exposure",
    });
  }

  // Source nodes — dedupe by normalized source string from selected events only
  const sourceFrequency: Record<string, { displayName: string; count: number; minTierRank: number }> = {};
  for (const event of selectedEvents) {
    const key = event.source.trim().toLowerCase().slice(0, 40);
    if (!key) continue;
    if (!sourceFrequency[key]) {
      sourceFrequency[key] = {
        displayName: event.source.trim(),
        count: 0,
        minTierRank: tierRank(event.tier),
      };
    }
    sourceFrequency[key].count += 1;
    sourceFrequency[key].minTierRank = Math.min(
      sourceFrequency[key].minTierRank,
      tierRank(event.tier)
    );
  }

  const sortedSources = Object.entries(sourceFrequency)
    .sort(([, a], [, b]) => {
      if (a.minTierRank !== b.minTierRank) return a.minTierRank - b.minTierRank;
      return b.count - a.count;
    })
    .slice(0, 3);

  for (const [key, { displayName, count }] of sortedSources) {
    const sourceNodeId = `source:${key}`;
    nodes.push({
      id: sourceNodeId,
      kind: "source",
      label: displayName.length > 40 ? `${displayName.slice(0, 37)}…` : displayName,
      sublabel: `${count} event${count === 1 ? "" : "s"} in graph`,
    });

    // Add edges from events to this source
    for (const event of selectedEvents) {
      const eventKey = event.source.trim().toLowerCase().slice(0, 40);
      if (eventKey === key) {
        edges.push({
          id: `edge:event-source:${event.id}:${key}`,
          fromId: `event:${event.id}`,
          toId: sourceNodeId,
          label: "reported by",
          kind: "reportedBy",
        });
      }
    }
  }

  // Risk driver nodes — from alert.breakdown, display-only
  if (alert) {
    const topDrivers = pickTopDrivers(alert.breakdown);
    for (const driver of topDrivers) {
      const driverNodeId = `driver:${driver.key}`;
      nodes.push({
        id: driverNodeId,
        kind: "driver",
        label: driver.label,
        sublabel: `Score factor: ${Math.round(driver.value)}`,
      });
      edges.push({
        id: `edge:asset-driver:${driver.key}`,
        fromId: assetNodeId,
        toId: driverNodeId,
        label: "score factor",
        kind: "scoreFactor",
      });
    }
  }

  return { nodes, edges };
}
