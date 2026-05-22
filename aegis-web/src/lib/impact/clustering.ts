import type { IntelLayerKey, IntelSeverity } from "@/lib/intel/types";
import { countriesMatch } from "@/lib/countryDisplay";
import { getDistanceKm } from "./distance";
import type {
  EvidenceCluster,
  GeoPrecision,
  NormalizedSignal,
  SourceFamily,
} from "./types";

const STOPWORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "but",
  "of",
  "in",
  "on",
  "at",
  "to",
  "for",
  "with",
  "by",
  "from",
  "into",
  "near",
  "after",
  "before",
  "amid",
  "over",
  "under",
  "is",
  "was",
  "are",
  "were",
  "be",
  "been",
  "being",
  "as",
  "it",
  "its",
  "this",
  "that",
  "these",
  "those",
  "new",
  "more",
  "than",
  "about",
  "report",
  "reports",
  "says",
  "said",
]);

function tokenize(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/https?:\/\/\S+/g, " ")
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2 && !STOPWORDS.has(t))
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const t of a) if (b.has(t)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

const HOUR_MS = 60 * 60 * 1000;
const CLUSTER_WINDOW_HOURS = 48;
const CLUSTER_DISTANCE_KM = 50;
const TITLE_SIMILARITY_THRESHOLD = 0.4;

const SEVERITY_RANK: Record<IntelSeverity, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

const GEO_PRECISION_RANK: Record<GeoPrecision, number> = {
  exact: 0,
  city: 1,
  region: 2,
  country: 3,
  unknown: 4,
};

function maxSeverity(a: IntelSeverity, b: IntelSeverity): IntelSeverity {
  return SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b;
}

function bestGeoPrecision(values: GeoPrecision[]): GeoPrecision {
  return values.reduce<GeoPrecision>(
    (best, v) => (GEO_PRECISION_RANK[v] < GEO_PRECISION_RANK[best] ? v : best),
    "unknown"
  );
}

function uniquePush<T>(list: T[], value: T): void {
  if (!list.includes(value)) list.push(value);
}

type WorkingCluster = {
  points: NormalizedSignal[];
  tokens: Set<string>;
  latestTime: number;
  representative: NormalizedSignal;
};

function shouldJoinCluster(
  signal: NormalizedSignal,
  signalTokens: Set<string>,
  cluster: WorkingCluster
): boolean {
  const rep = cluster.representative;
  if (signal.eventClass !== rep.eventClass) return false;

  const sigTime = new Date(signal.timestamp).getTime();
  const ageHours = Math.abs(cluster.latestTime - sigTime) / HOUR_MS;
  if (ageHours > CLUSTER_WINDOW_HOURS) return false;

  const sameCountry = countriesMatch(signal.country, rep.country);
  const distance = getDistanceKm({ lat: signal.lat, lon: signal.lon }, { lat: rep.lat, lon: rep.lon });

  if (distance > CLUSTER_DISTANCE_KM && !sameCountry) return false;

  const similarity = jaccard(signalTokens, cluster.tokens);
  if (distance <= CLUSTER_DISTANCE_KM) return true;
  if (sameCountry && similarity >= TITLE_SIMILARITY_THRESHOLD) return true;
  if (sameCountry && signal.sourceFamily === rep.sourceFamily && signal.layer === rep.layer) return true;
  return false;
}

function finalizeCluster(cluster: WorkingCluster, index: number): EvidenceCluster {
  const points = cluster.points;
  const sourceFamilies: SourceFamily[] = [];
  const sources: string[] = [];
  const layers: IntelLayerKey[] = [];
  const geoPrecisions: GeoPrecision[] = [];
  let severity: IntelSeverity = "low";
  let newestIdx = 0;
  let newestTime = -Infinity;
  let reliabilitySum = 0;
  let bestPrecisionPoint = points[0];

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    uniquePush(sourceFamilies, p.sourceFamily);
    uniquePush(sources, p.source);
    uniquePush(layers, p.layer);
    geoPrecisions.push(p.geoPrecision);
    severity = maxSeverity(severity, p.severity);
    reliabilitySum += p.sourceReliability;
    const t = new Date(p.timestamp).getTime();
    if (Number.isFinite(t) && t > newestTime) {
      newestTime = t;
      newestIdx = i;
    }
    if (
      GEO_PRECISION_RANK[p.geoPrecision] < GEO_PRECISION_RANK[bestPrecisionPoint.geoPrecision]
    ) {
      bestPrecisionPoint = p;
    }
  }

  const newest = points[newestIdx];
  const representative = bestPrecisionPoint ?? newest;

  return {
    id: `cluster-${index}-${representative.id}`,
    title: newest.title,
    eventClass: representative.eventClass,
    sourceFamilies,
    sources,
    layers,
    country: representative.country ?? newest.country,
    lat: representative.lat,
    lon: representative.lon,
    timestamp: newest.timestamp,
    severity,
    sourceReliability: points.length > 0 ? reliabilitySum / points.length : representative.sourceReliability,
    geoPrecision: bestGeoPrecision(geoPrecisions),
    points,
  };
}

export function clusterSignals(signals: NormalizedSignal[]): EvidenceCluster[] {
  const sorted = signals
    .slice()
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const working: WorkingCluster[] = [];

  for (const signal of sorted) {
    const tokens = tokenize(signal.title);
    const sigTime = new Date(signal.timestamp).getTime();

    let joined = false;
    for (const cluster of working) {
      if (shouldJoinCluster(signal, tokens, cluster)) {
        cluster.points.push(signal);
        for (const t of tokens) cluster.tokens.add(t);
        if (Number.isFinite(sigTime) && sigTime > cluster.latestTime) {
          cluster.latestTime = sigTime;
        }
        if (
          GEO_PRECISION_RANK[signal.geoPrecision] <
          GEO_PRECISION_RANK[cluster.representative.geoPrecision]
        ) {
          cluster.representative = signal;
        }
        joined = true;
        break;
      }
    }
    if (!joined) {
      working.push({
        points: [signal],
        tokens,
        latestTime: Number.isFinite(sigTime) ? sigTime : 0,
        representative: signal,
      });
    }
  }

  return working.map((c, i) => finalizeCluster(c, i));
}
