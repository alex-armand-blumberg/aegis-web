export type SourceRole =
  | "map pin"
  | "evidence"
  | "context"
  | "chat"
  | "db";

export type SourceCostNote = "free" | "paid" | "optional" | "licensed";

export type SourceRegistryEntry = {
  id: string;
  displayName: string;
  matchPatterns: string[];
  roles: SourceRole[];
  envVars?: string[];
  envOptional?: boolean;
  costNote?: SourceCostNote;
  tierHint?: string;
  planned?: boolean;
};

/** Static catalog — env var names only, never values. */
export const SOURCE_REGISTRY: SourceRegistryEntry[] = [
  {
    id: "acled",
    displayName: "ACLED ArcGIS",
    matchPatterns: ["acled"],
    roles: ["context"],
    tierHint: "Regional/historical baseline context. Event-level API has 365-day publication lag — not live tactical evidence. ArcGIS public layer provides monthly aggregates only.",
  },
  {
    id: "ucdp",
    displayName: "UCDP",
    matchPatterns: ["ucdp"],
    roles: ["map pin", "evidence"],
    envVars: ["UCDP_ACCESS_TOKEN"],
    envOptional: true,
    costNote: "licensed",
    tierHint: "Typically operational",
  },
  {
    id: "liveuamap",
    displayName: "LiveUAMap",
    matchPatterns: ["liveuamap", "live uamap"],
    roles: ["map pin", "evidence"],
    envVars: ["LIVEUAMAP_API_KEY"],
    envOptional: true,
    costNote: "paid",
    tierHint: "Typically operational",
  },
  {
    id: "gdelt",
    displayName: "GDELT",
    matchPatterns: ["gdelt"],
    roles: ["context"],
    tierHint: "Tier 3 news/article-level corroboration. Not direct proof. Use as context only.",
  },
  {
    id: "opensky",
    displayName: "OpenSky",
    matchPatterns: ["opensky"],
    roles: ["context"],
    envVars: [
      "OPENSKY_USERNAME",
      "OPENSKY_PASSWORD",
      "OPENSKY_CLIENT_ID",
      "OPENSKY_CLIENT_SECRET",
    ],
    envOptional: true,
    costNote: "free",
    tierHint: "Observable civilian airspace context only. Not reliable military-flight detection. Use for wording like 'civilian traffic appears normal/sparse', never as evidence of military operations.",
  },
  {
    id: "google-news",
    displayName: "Google News RSS",
    matchPatterns: ["google news"],
    roles: ["context"],
    tierHint: "Tier 3 article-level corroboration only. Not direct proof. Map pins require tier1/2 sources.",
  },
  {
    id: "rss-network",
    displayName: "RSS network adapter",
    matchPatterns: ["rss network", "trusted publisher"],
    roles: ["context"],
    envVars: ["MAP_RSS_MAX_CONCURRENCY"],
    envOptional: true,
    costNote: "free",
    tierHint: "Tier 3 article-level corroboration only.",
  },
  {
    id: "relay-seed",
    displayName: "Relay seed digest",
    matchPatterns: ["relay seed", "relay digest"],
    roles: ["context"],
    envVars: ["INTEL_RELAY_DIGEST_URL"],
    envOptional: true,
    costNote: "optional",
  },
  {
    id: "rapid-conflict",
    displayName: "Rapid conflict feed",
    matchPatterns: ["rapid conflict"],
    roles: ["evidence"],
    tierHint: "Typically operational",
  },
  {
    id: "usni",
    displayName: "USNI Fleet Tracker",
    matchPatterns: ["usni", "fleet tracker"],
    roles: ["context"],
    tierHint: "Typically context",
  },
  {
    id: "aisstream",
    displayName: "AISStream",
    matchPatterns: ["aisstream", "ais vessel", "ais feed"],
    roles: ["context"],
    envVars: ["AISSTREAM_SNAPSHOT_URL", "AISSTREAM_SNAPSHOT_URLS"],
    envOptional: true,
    costNote: "optional",
    tierHint: "Maritime vessel-traffic context only (Railway relay snapshot). Not conflict evidence. Use for shipping-lane and port-area vessel density context only.",
  },
  {
    id: "sam-gov",
    displayName: "SAM.gov opportunities",
    matchPatterns: ["sam.gov", "sam_gov"],
    roles: ["context"],
    envVars: ["SAM_GOV_API_KEY"],
    envOptional: true,
    costNote: "free",
  },
  {
    id: "nasa-firms",
    displayName: "NASA FIRMS",
    matchPatterns: ["firms", "nasa firms"],
    roles: ["map pin", "evidence"],
    envVars: ["NASA_FIRMS_MAP_KEY"],
    envOptional: true,
    costNote: "free",
    tierHint: "Typically operational",
  },
  {
    id: "gdacs",
    displayName: "GDACS",
    matchPatterns: ["gdacs"],
    roles: ["map pin", "evidence"],
    envVars: ["ESCALATION_ENABLE_GDACS"],
    envOptional: true,
    costNote: "free",
    tierHint: "Typically operational",
  },
  {
    id: "reliefweb",
    displayName: "ReliefWeb",
    matchPatterns: ["reliefweb"],
    roles: ["evidence", "context"],
    envVars: ["RELIEFWEB_APPNAME"],
    envOptional: true,
    costNote: "free",
    tierHint: "Tier 2 humanitarian/crisis context. Useful for disaster, displacement, and aid-access signals. Not exact tactical event pins.",
  },
  {
    id: "strategic-pack",
    displayName: "Strategic escalation pack",
    matchPatterns: ["strategic escalation", "strategic pack"],
    roles: ["context"],
    envVars: ["ENABLE_STRATEGIC_PACK"],
    envOptional: true,
    costNote: "optional",
  },
  {
    id: "phase2c2",
    displayName: "Phase 2C.2 live sources",
    matchPatterns: ["phase 2c", "phase2c2"],
    roles: ["evidence", "context"],
    envVars: ["ENABLE_PHASE2C2_SOURCES"],
    envOptional: true,
    costNote: "optional",
  },
  {
    id: "conflict-adapters",
    displayName: "Conflict adapters",
    matchPatterns: ["conflict adapters", "conflict fusion"],
    roles: ["evidence", "map pin"],
    tierHint: "Aggregate telemetry",
  },
  {
    id: "military-adapters",
    displayName: "Military & infrastructure adapters",
    matchPatterns: ["military & infrastructure", "military and infrastructure"],
    roles: ["context"],
    tierHint: "Aggregate telemetry",
  },
  {
    id: "adapter-telemetry",
    displayName: "Adapter telemetry",
    matchPatterns: ["adapter telemetry"],
    roles: ["context"],
    tierHint: "Aggregate telemetry",
  },
  {
    id: "source-access-matrix",
    displayName: "Requested source access matrix",
    matchPatterns: ["source access matrix", "requested source access"],
    roles: ["context"],
    tierHint: "Telemetry only",
  },
  {
    id: "experimental-trackers",
    displayName: "Experimental tracker feeds",
    matchPatterns: ["experimental tracker"],
    roles: ["context"],
    tierHint: "Typically context",
  },
  {
    id: "domain-live",
    displayName: "Requested domain live feeds",
    matchPatterns: ["requested domain live", "domain live feeds"],
    roles: ["evidence", "context"],
  },
  {
    id: "redis-cache",
    displayName: "Map cache (Redis)",
    matchPatterns: ["cache", "redis"],
    roles: ["context"],
    envVars: ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"],
    envOptional: true,
    costNote: "optional",
  },
  {
    id: "neon",
    displayName: "Neon Postgres",
    matchPatterns: ["neon"],
    roles: ["db"],
    envVars: ["DATABASE_URL"],
    envOptional: true,
    costNote: "paid",
    tierHint: "Live — stores ingested impact_events (UCDP). Daily cron at 05:00 UTC. DB status visible in Sources tab.",
  },
  {
    id: "argus",
    displayName: "Argus chat",
    matchPatterns: ["argus"],
    roles: ["chat"],
    costNote: "optional",
  },
  {
    id: "network-flow",
    displayName: "Network / Flow",
    matchPatterns: ["network", "flow graph"],
    roles: ["context"],
    tierHint: "Live — asset-centered relationship graph at /impact/network.",
  },
];

export const PLANNED_SOURCES = SOURCE_REGISTRY.filter((entry) => entry.planned);

export function matchRegistryEntry(providerName: string): SourceRegistryEntry | null {
  const lower = providerName.toLowerCase();
  for (const entry of SOURCE_REGISTRY) {
    if (entry.planned) continue;
    for (const pattern of entry.matchPatterns) {
      if (lower.includes(pattern.toLowerCase())) return entry;
    }
  }
  return null;
}

export function pointMatchesEntry(
  pointSource: string,
  entry: SourceRegistryEntry
): boolean {
  const lower = pointSource.toLowerCase();
  return entry.matchPatterns.some((pattern) => lower.includes(pattern.toLowerCase()));
}
