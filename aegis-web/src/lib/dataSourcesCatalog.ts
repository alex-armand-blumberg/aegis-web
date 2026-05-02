import { MAP_SOURCE_FAMILY_MATRIX, WORLDMONITOR_RSS_NETWORK } from "@/lib/intel/sourceRegistry";

export type DataSourceSection = {
  id: string;
  title: string;
  description?: string;
  items: string[];
};

/** Providers and adapters surfaced in map diagnostics and ingestion. */
export const DATA_SOURCES_MAP_RUNTIME: string[] = [
  "ACLED ArcGIS (monthly conflict aggregates)",
  "UCDP",
  "GDELT",
  "LiveUAMap",
  "Google News RSS conflict search",
  "Regional rapid monitors (RSS/API)",
  "Google News RSS (site-scoped)",
  "Optional relay seed digest",
  "OpenSky / ADS-B-derived tracks",
  "AIS maritime feeds",
  "Curated strategic infrastructure overlays",
  "NASA FIRMS",
  "NASA EONET",
  "USGS / GDACS",
  "Frontline and theater overlays (e.g. ISW, curated vectors)",
];

function uniqueSorted(names: string[]): string[] {
  return [...new Set(names.map((n) => n.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function titleCaseFamily(family: string): string {
  return family
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Single catalog for the public Data & sources page. */
export function getDataSourceSections(): DataSourceSection[] {
  const rssNames = uniqueSorted(WORLDMONITOR_RSS_NETWORK.map((s) => s.name));
  const familySections: DataSourceSection[] = MAP_SOURCE_FAMILY_MATRIX.map((row) => ({
    id: row.family,
    title: titleCaseFamily(row.family),
    description: `Typical map layers: ${row.layers.join(", ")}.`,
    items: [...row.sources].sort((a, b) => a.localeCompare(b)),
  }));

  return [
    {
      id: "map-runtime",
      title: "Map adapters and core providers",
      description:
        "Services and feeds the interactive map attempts to load; availability depends on API keys, quotas, and network conditions.",
      items: uniqueSorted(DATA_SOURCES_MAP_RUNTIME),
    },
    ...familySections,
    {
      id: "rss-network",
      title: "News and RSS publisher network",
      description: "Curated publisher list used for live context and corroboration.",
      items: rssNames,
    },
  ];
}
