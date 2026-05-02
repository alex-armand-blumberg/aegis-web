export type SourceTier = "tier1" | "tier2" | "tier3" | "tier4";

export type SourceLayer =
  | "conflicts"
  | "liveStrikes"
  | "news"
  | "flights"
  | "vessels"
  | "infrastructure";

export type SourceFamily =
  | "conflict-events"
  | "news-network"
  | "military-activity"
  | "strategic-infrastructure"
  | "natural-hazards"
  | "economic-signals";

export type MapSourceDescriptor = {
  id: string;
  name: string;
  family: SourceFamily;
  tier: SourceTier;
  layers: SourceLayer[];
  rssUrl?: string;
  domain?: string;
  notes?: string;
};

// World Monitor-style source family map (map-relevant only).
export const MAP_SOURCE_FAMILY_MATRIX: Array<{
  family: SourceFamily;
  layers: SourceLayer[];
  sources: string[];
}> = [
  {
    family: "conflict-events",
    layers: ["conflicts", "liveStrikes", "news"],
    sources: ["UCDP", "ACLED", "GDELT", "LiveUAMap", "Google News RSS"],
  },
  {
    family: "news-network",
    layers: ["news", "liveStrikes"],
    sources: ["BBC", "Reuters", "AP", "Al Jazeera", "Guardian", "DW", "NPR", "USNI", "Kyiv Independent"],
  },
  {
    family: "military-activity",
    layers: ["flights", "vessels", "liveStrikes"],
    sources: ["OpenSky", "AISStream", "USNI Fleet Tracker", "ADS-B relay snapshots"],
  },
  {
    family: "strategic-infrastructure",
    layers: ["infrastructure"],
    sources: ["Curated strategic sites", "bases/chokepoints", "ports/pipelines overlays"],
  },
  {
    family: "natural-hazards",
    layers: ["news"],
    sources: ["USGS", "GDACS", "NASA EONET", "NASA FIRMS"],
  },
  {
    family: "economic-signals",
    layers: ["news"],
    sources: [
      "WTO/BIS/FRED/Yahoo-derived feeds",
      "OFAC Sanctions List Service",
      "UN SC Consolidated List",
      "USAspending (DoD awards)",
      "SAM.gov opportunities",
      "DoD official releases",
      "UK MOD official feed",
    ],
  },
];

// Curated RSS/domain network inspired by World Monitor publisher coverage.
// If rssUrl is missing, caller can query Google News RSS with `site:${domain}`.
export const WORLDMONITOR_RSS_NETWORK: MapSourceDescriptor[] = [
  {
    id: "bbc-world",
    name: "BBC World",
    family: "news-network",
    tier: "tier1",
    layers: ["news", "liveStrikes"],
    rssUrl: "https://feeds.bbci.co.uk/news/world/rss.xml",
    domain: "bbc.com",
  },
  {
    id: "bbc-middle-east",
    name: "BBC Middle East",
    family: "news-network",
    tier: "tier1",
    layers: ["news", "liveStrikes"],
    rssUrl: "https://feeds.bbci.co.uk/news/world/middle_east/rss.xml",
    domain: "bbc.com",
  },
  {
    id: "bbc-europe",
    name: "BBC Europe",
    family: "news-network",
    tier: "tier1",
    layers: ["news", "liveStrikes"],
    rssUrl: "https://feeds.bbci.co.uk/news/world/europe/rss.xml",
    domain: "bbc.com",
  },
  {
    id: "bbc-asia",
    name: "BBC Asia",
    family: "news-network",
    tier: "tier1",
    layers: ["news", "liveStrikes"],
    rssUrl: "https://feeds.bbci.co.uk/news/world/asia/rss.xml",
    domain: "bbc.com",
  },
  {
    id: "bbc-africa",
    name: "BBC Africa",
    family: "news-network",
    tier: "tier1",
    layers: ["news", "liveStrikes"],
    rssUrl: "https://feeds.bbci.co.uk/news/world/africa/rss.xml",
    domain: "bbc.com",
  },
  {
    id: "reuters-world",
    name: "Reuters World",
    family: "news-network",
    tier: "tier1",
    layers: ["news", "liveStrikes"],
    domain: "reuters.com",
  },
  {
    id: "ap-news",
    name: "AP News",
    family: "news-network",
    tier: "tier1",
    layers: ["news", "liveStrikes"],
    domain: "apnews.com",
  },
  {
    id: "al-jazeera",
    name: "Al Jazeera",
    family: "news-network",
    tier: "tier2",
    layers: ["news", "liveStrikes"],
    rssUrl: "https://www.aljazeera.com/xml/rss/all.xml",
    domain: "aljazeera.com",
  },
  {
    id: "guardian-world",
    name: "Guardian World",
    family: "news-network",
    tier: "tier2",
    layers: ["news", "liveStrikes"],
    rssUrl: "https://www.theguardian.com/world/rss",
    domain: "theguardian.com",
  },
  {
    id: "dw-news",
    name: "DW News",
    family: "news-network",
    tier: "tier2",
    layers: ["news", "liveStrikes"],
    rssUrl: "https://rss.dw.com/rdf/rss-en-all",
    domain: "dw.com",
  },
  {
    id: "npr-news",
    name: "NPR News",
    family: "news-network",
    tier: "tier2",
    layers: ["news", "liveStrikes"],
    rssUrl: "https://feeds.npr.org/1001/rss.xml",
    domain: "npr.org",
  },
  {
    id: "npr-world",
    name: "NPR World",
    family: "news-network",
    tier: "tier2",
    layers: ["news", "liveStrikes"],
    rssUrl: "https://feeds.npr.org/1004/rss.xml",
    domain: "npr.org",
  },
  {
    id: "kyiv-independent",
    name: "Kyiv Independent",
    family: "news-network",
    tier: "tier2",
    layers: ["news", "liveStrikes"],
    domain: "kyivindependent.com",
  },
  {
    id: "usni-news",
    name: "USNI News",
    family: "news-network",
    tier: "tier2",
    layers: ["news", "liveStrikes", "vessels"],
    domain: "news.usni.org",
  },
  {
    id: "military-times",
    name: "Military Times",
    family: "news-network",
    tier: "tier3",
    layers: ["news", "liveStrikes", "vessels"],
    domain: "militarytimes.com",
  },
  {
    id: "task-purpose",
    name: "Task & Purpose",
    family: "news-network",
    tier: "tier3",
    layers: ["news", "liveStrikes"],
    domain: "taskandpurpose.com",
  },
  {
    id: "war-on-the-rocks",
    name: "War on the Rocks",
    family: "news-network",
    tier: "tier3",
    layers: ["news", "liveStrikes"],
    domain: "warontherocks.com",
  },
  {
    id: "the-war-zone",
    name: "The War Zone",
    family: "news-network",
    tier: "tier3",
    layers: ["news", "liveStrikes"],
    domain: "twz.com",
  },
  {
    id: "iran-international",
    name: "Iran International",
    family: "news-network",
    tier: "tier3",
    layers: ["news", "liveStrikes"],
    domain: "iranintl.com",
  },
  {
    id: "arab-news",
    name: "Arab News",
    family: "news-network",
    tier: "tier3",
    layers: ["news", "liveStrikes"],
    domain: "arabnews.com",
  },
  {
    id: "the-national",
    name: "The National",
    family: "news-network",
    tier: "tier3",
    layers: ["news", "liveStrikes"],
    domain: "thenationalnews.com",
  },
  {
    id: "haaretz",
    name: "Haaretz",
    family: "news-network",
    tier: "tier3",
    layers: ["news", "liveStrikes"],
    domain: "haaretz.com",
  },
  {
    id: "times-of-israel",
    name: "Times of Israel",
    family: "news-network",
    tier: "tier3",
    layers: ["news", "liveStrikes"],
    domain: "timesofisrael.com",
  },
  {
    id: "state-dept",
    name: "US State Department",
    family: "news-network",
    tier: "tier1",
    layers: ["news"],
    domain: "state.gov",
  },
  {
    id: "uk-mod",
    name: "UK MOD",
    family: "news-network",
    tier: "tier1",
    layers: ["news", "liveStrikes"],
    domain: "gov.uk",
  },
  {
    id: "dod-official",
    name: "US Department of Defense",
    family: "news-network",
    tier: "tier1",
    layers: ["news"],
    domain: "defense.gov",
  },
  {
    id: "un-news",
    name: "UN News",
    family: "news-network",
    tier: "tier1",
    layers: ["news"],
    domain: "news.un.org",
  },
  {
    id: "jpost",
    name: "Jerusalem Post",
    family: "news-network",
    tier: "tier3",
    layers: ["news", "liveStrikes"],
    domain: "jpost.com",
  },
  {
    id: "i24news",
    name: "i24News",
    family: "news-network",
    tier: "tier3",
    layers: ["news", "liveStrikes"],
    domain: "i24news.tv",
  },
  {
    id: "ynet",
    name: "Ynet News",
    family: "news-network",
    tier: "tier3",
    layers: ["news", "liveStrikes"],
    domain: "ynetnews.com",
  },
  {
    id: "ukrinform",
    name: "Ukrinform",
    family: "news-network",
    tier: "tier2",
    layers: ["news", "liveStrikes"],
    domain: "ukrinform.net",
  },
  {
    id: "unian",
    name: "UNIAN",
    family: "news-network",
    tier: "tier3",
    layers: ["news", "liveStrikes"],
    domain: "unian.net",
  },
  {
    id: "pravda-ua",
    name: "Ukrainska Pravda",
    family: "news-network",
    tier: "tier3",
    layers: ["news", "liveStrikes"],
    domain: "pravda.com.ua",
  },
  {
    id: "sudan-tribune",
    name: "Sudan Tribune",
    family: "news-network",
    tier: "tier3",
    layers: ["news", "liveStrikes"],
    domain: "sudantribune.com",
  },
  {
    id: "dabanga",
    name: "Radio Dabanga",
    family: "news-network",
    tier: "tier4",
    layers: ["news", "liveStrikes"],
    domain: "dabangasudan.org",
  },
  {
    id: "dawn-pk",
    name: "Dawn Pakistan",
    family: "news-network",
    tier: "tier3",
    layers: ["news", "liveStrikes"],
    domain: "dawn.com",
  },
  {
    id: "tribune-pk",
    name: "Express Tribune",
    family: "news-network",
    tier: "tier4",
    layers: ["news", "liveStrikes"],
    domain: "tribune.com.pk",
  },
  {
    id: "geo-pk",
    name: "Geo News",
    family: "news-network",
    tier: "tier4",
    layers: ["news", "liveStrikes"],
    domain: "geo.tv",
  },
  {
    id: "ary-pk",
    name: "ARY News",
    family: "news-network",
    tier: "tier4",
    layers: ["news", "liveStrikes"],
    domain: "arynews.tv",
  },
  {
    id: "tolonews",
    name: "TOLOnews",
    family: "news-network",
    tier: "tier4",
    layers: ["news", "liveStrikes"],
    domain: "tolonews.com",
  },
  {
    id: "khaama",
    name: "Khaama Press",
    family: "news-network",
    tier: "tier4",
    layers: ["news", "liveStrikes"],
    domain: "khaama.com",
  },
  {
    id: "tehran-times",
    name: "Tehran Times",
    family: "news-network",
    tier: "tier4",
    layers: ["news", "liveStrikes"],
    domain: "tehrantimes.com",
  },
  {
    id: "mehr-news",
    name: "Mehr News",
    family: "news-network",
    tier: "tier4",
    layers: ["news", "liveStrikes"],
    domain: "mehrnews.com",
  },
  {
    id: "tasnim-news",
    name: "Tasnim News",
    family: "news-network",
    tier: "tier4",
    layers: ["news", "liveStrikes"],
    domain: "tasnimnews.com",
  },
  {
    id: "middle-east-eye",
    name: "Middle East Eye",
    family: "news-network",
    tier: "tier3",
    layers: ["news", "liveStrikes"],
    domain: "middleeasteye.net",
  },
  {
    id: "al-arabiya",
    name: "Al Arabiya",
    family: "news-network",
    tier: "tier3",
    layers: ["news", "liveStrikes"],
    domain: "alarabiya.net",
  },
  {
    id: "isw-map-room",
    name: "Institute for the Study of War",
    family: "news-network",
    tier: "tier2",
    layers: ["news", "liveStrikes", "conflicts"],
    domain: "understandingwar.org",
    notes: "Map room and theater assessments",
  },
  {
    id: "critical-threats",
    name: "Critical Threats Project",
    family: "news-network",
    tier: "tier2",
    layers: ["news", "liveStrikes", "conflicts"],
    domain: "criticalthreats.org",
  },
  {
    id: "csis",
    name: "CSIS",
    family: "news-network",
    tier: "tier2",
    layers: ["news", "liveStrikes", "conflicts"],
    domain: "csis.org",
  },
  {
    id: "cfr-conflict-tracker",
    name: "Council on Foreign Relations",
    family: "news-network",
    tier: "tier2",
    layers: ["news", "conflicts"],
    domain: "cfr.org",
  },
  {
    id: "crisisgroup",
    name: "International Crisis Group",
    family: "news-network",
    tier: "tier2",
    layers: ["news", "conflicts", "liveStrikes"],
    domain: "crisisgroup.org",
  },
  {
    id: "lawfare",
    name: "Lawfare",
    family: "news-network",
    tier: "tier2",
    layers: ["news", "infrastructure"],
    domain: "lawfaremedia.org",
  },
  {
    id: "insight-crime",
    name: "InSight Crime",
    family: "news-network",
    tier: "tier2",
    layers: ["news", "conflicts"],
    domain: "insightcrime.org",
  },
  {
    id: "navcen",
    name: "USCG NAVCEN",
    family: "strategic-infrastructure",
    tier: "tier2",
    layers: ["infrastructure", "news"],
    domain: "navcen.uscg.gov",
  },
  {
    id: "vision-of-humanity",
    name: "Vision of Humanity",
    family: "conflict-events",
    tier: "tier3",
    layers: ["conflicts", "news"],
    domain: "visionofhumanity.org",
  },
  {
    id: "military-summary",
    name: "Military Summary",
    family: "news-network",
    tier: "tier4",
    layers: ["news", "liveStrikes"],
    domain: "militarysummary.com",
  },
  {
    id: "warpulse",
    name: "WarPulse",
    family: "news-network",
    tier: "tier4",
    layers: ["news", "liveStrikes", "conflicts"],
    domain: "warpulse.net",
  },
  {
    id: "warstrikes",
    name: "WarStrikes",
    family: "news-network",
    tier: "tier4",
    layers: ["news", "liveStrikes", "conflicts"],
    domain: "warstrikes.com",
  },
  {
    id: "world-tension-watch",
    name: "World Tension Watch",
    family: "news-network",
    tier: "tier4",
    layers: ["news", "conflicts"],
    domain: "worldtensionwatch.com",
  },
  {
    id: "monitor-the-situation",
    name: "Monitor the Situation",
    family: "news-network",
    tier: "tier4",
    layers: ["news", "liveStrikes", "vessels", "flights"],
    domain: "monitor-the-situation.com",
  },
  {
    id: "worldmonitor-app",
    name: "WorldMonitor",
    family: "news-network",
    tier: "tier4",
    layers: ["news", "liveStrikes", "conflicts"],
    domain: "worldmonitor.app",
  },
  {
    id: "starboard-intelligence",
    name: "Starboard Intelligence",
    family: "military-activity",
    tier: "tier4",
    layers: ["vessels", "news", "liveStrikes"],
    domain: "starboardintelligence.com",
  },
  {
    id: "liveuamap-mirror",
    name: "LiveUAMap web",
    family: "conflict-events",
    tier: "tier3",
    layers: ["news", "liveStrikes", "conflicts"],
    domain: "liveuamap.com",
  },
];

export type SourceAccessMode =
  | "direct_api"
  | "public_rss_or_page"
  | "credentialed_or_licensed"
  | "blocked_or_paywalled";

export const REQUESTED_SOURCE_ACCESS_MATRIX: Array<{
  source: string;
  mode: SourceAccessMode;
  fallback: string | null;
}> = [
  { source: "LiveUAMap", mode: "credentialed_or_licensed", fallback: "GDELT + trusted RSS + rapid feed" },
  { source: "WorldMonitor", mode: "blocked_or_paywalled", fallback: "WORLDMONITOR_RSS_NETWORK domains via Google News RSS" },
  { source: "WSJ", mode: "blocked_or_paywalled", fallback: "Open Reuters/AP/BBC conflict RSS coverage" },
  { source: "Copernicus Sentinel-1", mode: "public_rss_or_page", fallback: "Use only metadata/news context, not raw event stream" },
  { source: "MarineTraffic", mode: "credentialed_or_licensed", fallback: "AISStream relay + USNI fleet tracker" },
  { source: "ISW", mode: "public_rss_or_page", fallback: "Domain RSS/site query + page parser adapter" },
  { source: "Critical Threats", mode: "public_rss_or_page", fallback: "Domain RSS/site query + page parser adapter" },
  { source: "CSIS", mode: "public_rss_or_page", fallback: "Domain RSS/site query + page parser adapter" },
  { source: "NAVCEN", mode: "public_rss_or_page", fallback: "Strategic infrastructure overlays + NAVCEN page parser" },
  { source: "CFR Conflict Tracker", mode: "public_rss_or_page", fallback: "Conflict tracker parser + domain query" },
  { source: "CrisisWatch", mode: "public_rss_or_page", fallback: "CrisisWatch parser + domain query" },
  { source: "Vision of Humanity", mode: "public_rss_or_page", fallback: "Domain query + conflict context parser" },
  { source: "Military Summary", mode: "public_rss_or_page", fallback: "Domain query if parse unavailable" },
  { source: "WarPulse", mode: "public_rss_or_page", fallback: "Domain query if parse unavailable" },
  { source: "WarStrikes", mode: "public_rss_or_page", fallback: "Domain query if parse unavailable" },
  { source: "World Tension Watch", mode: "public_rss_or_page", fallback: "Domain query if parse unavailable" },
  { source: "Monitor the Situation", mode: "public_rss_or_page", fallback: "Domain query + parser when available" },
  { source: "Lawfare deployments", mode: "public_rss_or_page", fallback: "Dedicated parser for domestic deployment markers" },
  { source: "InSight Crime", mode: "public_rss_or_page", fallback: "Domain RSS/site query + parser for gang events" },
  { source: "Starboard Intelligence", mode: "credentialed_or_licensed", fallback: "AIS/open maritime sources only" },
  {
    source: "DoD official releases",
    mode: "public_rss_or_page",
    fallback: "Google News RSS site:defense.gov strategic query",
  },
  {
    source: "UK MOD official feed",
    mode: "public_rss_or_page",
    fallback: "Google News RSS site:gov.uk MOD strategic query",
  },
  {
    source: "OFAC Sanctions List Service",
    mode: "direct_api",
    fallback: "Static SDN XML snapshot parsing",
  },
  {
    source: "UN SC Consolidated List",
    mode: "public_rss_or_page",
    fallback: "Consolidated sanctions XML parsing",
  },
  {
    source: "USAspending",
    mode: "direct_api",
    fallback: "Agency awards count endpoint (DoD aggregate)",
  },
  {
    source: "SAM.gov opportunities",
    mode: "credentialed_or_licensed",
    fallback: "Free-key API optional; skip when SAM_GOV_API_KEY absent",
  },
];

