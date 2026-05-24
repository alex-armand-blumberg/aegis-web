import type { IntelPoint, MapApiResponse, ProviderHealth } from "@/lib/intel/types";
import { flattenMapPoints } from "@/lib/impact/scoring";
import { getSourceTier, tierLabel } from "@/lib/impact/sourceTier";
import {
  matchRegistryEntry,
  PLANNED_SOURCES,
  pointMatchesEntry,
  type SourceRegistryEntry,
  type SourceRole,
} from "./sourcesRegistry";

export type ProviderStatus =
  | "active"
  | "skipped"
  | "missing key"
  | "degraded"
  | "error"
  | "planned";

export type SourceSample = {
  title: string;
  source: string;
  timestamp: string;
  url?: string;
};

export type SourceRowModel = {
  id: string;
  name: string;
  status: ProviderStatus;
  roles: SourceRole[];
  tierLabel: string;
  tierIsEstimate: boolean;
  pointCount: number;
  message: string;
  updatedAt: string;
  latencyMs?: number;
  envVars?: string[];
  envOptional?: boolean;
  costNote?: string;
  sample: SourceSample | null;
  health: ProviderHealth;
  registry: SourceRegistryEntry | null;
};

export type ProviderSummary = {
  healthy: number;
  total: number;
  degraded: number;
};

export type PlannedSourceRow = {
  id: string;
  name: string;
  roles: SourceRole[];
  costNote?: string;
  note: string;
};

export function simplifyProviderMessage(message: string): string {
  return message
    .replace(/\s*\[reason=[^\]]+\]/gi, "")
    .replace(/\s*\[source_packs=[^\]]+\]/gi, "")
    .replace(/\s*\[cache=[^\]]+\]/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function messageLower(message: string | undefined): string {
  return (message ?? "").toLowerCase();
}

export function parseProviderStatus(
  health: ProviderHealth,
  pointCount: number
): ProviderStatus {
  const msg = messageLower(health.message);

  if (msg.includes("[reason=missing_env]") || msg.includes("not configured")) {
    return "missing key";
  }

  if (
    msg.includes("skipped") ||
    msg.includes("[reason=skipped]") ||
    msg.includes("[reason=layer_gated]")
  ) {
    return "skipped";
  }

  if (!health.ok) {
    return "error";
  }

  if (pointCount === 0 && !isAggregatorSuccess(msg)) {
    return "degraded";
  }

  return "active";
}

function isAggregatorSuccess(msg: string): boolean {
  return (
    msg.includes("[reason=ok]") ||
    msg.includes("providers_ok=") ||
    msg.includes("direct=") ||
    msg.includes("acled=") ||
    msg.includes("telemetry") ||
    msg.includes("matrix")
  );
}

export function countPointsForProvider(
  points: IntelPoint[],
  providerName: string,
  registry: SourceRegistryEntry | null
): number {
  const patterns: string[] = registry
    ? registry.matchPatterns
    : [providerName.toLowerCase()];

  let count = 0;
  for (const point of points) {
    const source = point.source?.toLowerCase() ?? "";
    const providerLower = providerName.toLowerCase();

    const matchesProvider =
      source.includes(providerLower) ||
      providerLower.includes(source) ||
      patterns.some((p) => source.includes(p.toLowerCase()));

    if (matchesProvider) count += 1;
  }
  return count;
}

export function pickSamplePoint(
  points: IntelPoint[],
  providerName: string,
  registry: SourceRegistryEntry | null
): IntelPoint | null {
  for (const point of points) {
    if (!point.source) continue;

    if (registry && pointMatchesEntry(point.source, registry)) {
      return point;
    }

    const providerLower = providerName.toLowerCase();
    const sourceLower = point.source.toLowerCase();
    if (
      sourceLower.includes(providerLower) ||
      providerLower.includes(sourceLower)
    ) {
      return point;
    }
  }
  return null;
}

function extractPointUrl(point: IntelPoint): string | undefined {
  const meta = point.metadata;
  if (!meta) return undefined;
  for (const key of ["url", "link", "sourceUrl", "articleUrl"]) {
    const val = meta[key];
    if (typeof val === "string" && val.startsWith("http")) return val;
  }
  return undefined;
}

function buildSample(point: IntelPoint | null): SourceSample | null {
  if (!point) return null;
  const url = extractPointUrl(point);
  return {
    title: point.title,
    source: point.source,
    timestamp: point.timestamp,
    url,
  };
}

function resolveTierLabel(
  sample: IntelPoint | null,
  registry: SourceRegistryEntry | null
): { label: string; isEstimate: boolean } {
  if (sample) {
    const { tier } = getSourceTier(sample);
    return { label: tierLabel(tier), isEstimate: false };
  }
  if (registry?.tierHint) {
    return { label: registry.tierHint, isEstimate: true };
  }
  return { label: "—", isEstimate: true };
}

function formatCostNote(note: SourceRegistryEntry["costNote"]): string | undefined {
  if (!note) return undefined;
  switch (note) {
    case "free":
      return "Free / public";
    case "paid":
      return "Paid / licensed feed";
    case "optional":
      return "Optional integration";
    case "licensed":
      return "Licensed access";
    default:
      return note;
  }
}

export function buildSourceRows(mapData: MapApiResponse | null): SourceRowModel[] {
  if (!mapData?.providerHealth?.length) return [];

  const points = flattenMapPoints(mapData);

  return mapData.providerHealth.map((health, index) => {
    const registry = matchRegistryEntry(health.provider);
    const pointCount = countPointsForProvider(points, health.provider, registry);
    const samplePoint = pickSamplePoint(points, health.provider, registry);
    const tier = resolveTierLabel(samplePoint, registry);

    return {
      id: `${health.provider}-${index}`,
      name: registry?.displayName ?? health.provider,
      status: parseProviderStatus(health, pointCount),
      roles: registry?.roles ?? ["context"],
      tierLabel: tier.label,
      tierIsEstimate: tier.isEstimate,
      pointCount,
      message: simplifyProviderMessage(health.message ?? "No details"),
      updatedAt: health.updatedAt,
      latencyMs: health.latencyMs,
      envVars: registry?.envVars,
      envOptional: registry?.envOptional,
      costNote: formatCostNote(registry?.costNote),
      sample: buildSample(samplePoint),
      health,
      registry,
    };
  });
}

export function buildProviderSummary(rows: SourceRowModel[]): ProviderSummary {
  const total = rows.length;
  const healthy = rows.filter((r) => r.status === "active").length;
  const degraded = rows.filter(
    (r) =>
      r.status === "error" ||
      r.status === "degraded" ||
      r.status === "missing key"
  ).length;
  return { healthy, total, degraded };
}

export function formatRelativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const diff = Date.now() - t;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`;
  return `${Math.round(diff / 86_400_000)}d ago`;
}

export function formatAbsoluteTime(iso: string): string {
  const t = new Date(iso);
  if (!Number.isFinite(t.getTime())) return "";
  return t.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function statusLabel(status: ProviderStatus): string {
  switch (status) {
    case "active":
      return "Active";
    case "skipped":
      return "Skipped";
    case "missing key":
      return "Missing key";
    case "degraded":
      return "Degraded";
    case "error":
      return "Error";
    case "planned":
      return "Planned";
    default:
      return status;
  }
}

export function statusDotClass(status: ProviderStatus): string {
  switch (status) {
    case "active":
      return "iv-sources-status-dot iv-sources-status-active";
    case "skipped":
      return "iv-sources-status-dot iv-sources-status-skipped";
    case "missing key":
      return "iv-sources-status-dot iv-sources-status-missing";
    case "degraded":
      return "iv-sources-status-dot iv-sources-status-degraded";
    case "error":
      return "iv-sources-status-dot iv-sources-status-error";
    case "planned":
      return "iv-sources-status-dot iv-sources-status-planned";
    default:
      return "iv-sources-status-dot";
  }
}

export function rolesLabel(roles: SourceRole[]): string {
  return roles.join(" · ");
}

export function buildPlannedSourceRows(): PlannedSourceRow[] {
  return PLANNED_SOURCES.map((entry) => ({
    id: entry.id,
    name: entry.displayName,
    roles: entry.roles,
    costNote: entry.costNote ? formatCostNote(entry.costNote) : undefined,
    note: "Not wired in current Impact fetch.",
  }));
}
