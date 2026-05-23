import type { IntelPoint, IntelSeverity } from "@/lib/intel/types";
import {
  type AdapterResult,
  fetchTextWithTimeout,
  isValidLatLon,
  isWithinRangeHours,
  makeErrorHealth,
  makeOkHealth,
  rssTag,
  splitRssItems,
} from "./_shared";

const IAEA_RSS_URLS = [
  "https://www.iaea.org/feeds/news",
  "https://www.iaea.org/feeds/topnews",
  "https://www.iaea.org/feeds/pressreleases",
];
const IAEA_CAP = 60;
const PROVIDER = "IAEA";

type CountryHint = { lat: number; lon: number; canonical: string };

const COUNTRY_CENTERS: Record<string, CountryHint> = {
  iran: { lat: 32.4279, lon: 53.688, canonical: "Iran" },
  "iran (islamic republic of)": { lat: 32.4279, lon: 53.688, canonical: "Iran" },
  ukraine: { lat: 48.3794, lon: 31.1656, canonical: "Ukraine" },
  russia: { lat: 61.524, lon: 105.3188, canonical: "Russia" },
  "russian federation": { lat: 61.524, lon: 105.3188, canonical: "Russia" },
  "north korea": { lat: 40.3399, lon: 127.5101, canonical: "North Korea" },
  "democratic people's republic of korea": {
    lat: 40.3399,
    lon: 127.5101,
    canonical: "North Korea",
  },
  dprk: { lat: 40.3399, lon: 127.5101, canonical: "North Korea" },
  "south korea": { lat: 35.9078, lon: 127.7669, canonical: "South Korea" },
  "republic of korea": { lat: 35.9078, lon: 127.7669, canonical: "South Korea" },
  china: { lat: 35.8617, lon: 104.1954, canonical: "China" },
  pakistan: { lat: 30.3753, lon: 69.3451, canonical: "Pakistan" },
  india: { lat: 20.5937, lon: 78.9629, canonical: "India" },
  japan: { lat: 36.2048, lon: 138.2529, canonical: "Japan" },
  israel: { lat: 31.0461, lon: 34.8516, canonical: "Israel" },
  syria: { lat: 34.8021, lon: 38.9968, canonical: "Syria" },
  "united states": { lat: 37.0902, lon: -95.7129, canonical: "United States" },
  "united kingdom": { lat: 55.3781, lon: -3.436, canonical: "United Kingdom" },
  france: { lat: 46.2276, lon: 2.2137, canonical: "France" },
  germany: { lat: 51.1657, lon: 10.4515, canonical: "Germany" },
  belarus: { lat: 53.7098, lon: 27.9534, canonical: "Belarus" },
  zaporizhzhia: { lat: 47.5079, lon: 35.099, canonical: "Ukraine" },
  fukushima: { lat: 37.7608, lon: 140.4747, canonical: "Japan" },
  natanz: { lat: 33.7245, lon: 51.9163, canonical: "Iran" },
  fordow: { lat: 34.8847, lon: 50.9967, canonical: "Iran" },
  bushehr: { lat: 28.829, lon: 50.886, canonical: "Iran" },
};

const IAEA_HQ: CountryHint = { lat: 48.2349, lon: 16.4163, canonical: "Austria" };

const ALERT_TERMS = [
  "incident",
  "violation",
  "concern",
  "alert",
  "drone",
  "missile",
  "strike",
  "attack",
  "shelling",
  "explosion",
  "outage",
  "power loss",
  "off-site power",
];

function inferCountryFromText(text: string): CountryHint {
  const lower = text.toLowerCase();
  for (const key of Object.keys(COUNTRY_CENTERS)) {
    if (lower.includes(key)) return COUNTRY_CENTERS[key];
  }
  return IAEA_HQ;
}

function severityFromText(text: string): IntelSeverity {
  const lower = text.toLowerCase();
  if (ALERT_TERMS.some((t) => lower.includes(t))) return "medium";
  return "low";
}

export async function fetchIaeaSignals(rangeHours: number): Promise<AdapterResult> {
  const startedAt = Date.now();
  const points: IntelPoint[] = [];
  const seenLinks = new Set<string>();
  const errors: string[] = [];

  for (const url of IAEA_RSS_URLS) {
    if (points.length >= IAEA_CAP) break;
    const res = await fetchTextWithTimeout({ url, timeoutMs: 8_000 });
    if (!res.ok || !res.text) {
      errors.push(`${url}: ${res.message ?? "fetch failed"}`);
      continue;
    }
    const items = splitRssItems(res.text);
    for (const block of items) {
      if (points.length >= IAEA_CAP) break;
      const title = rssTag(block, "title");
      const link = rssTag(block, "link");
      const description =
        rssTag(block, "description") ?? rssTag(block, "summary") ?? "";
      const pubDate =
        rssTag(block, "pubDate") ??
        rssTag(block, "updated") ??
        rssTag(block, "published");
      if (!title) continue;
      if (link && seenLinks.has(link)) continue;
      if (link) seenLinks.add(link);
      const ts = pubDate ? new Date(pubDate) : null;
      if (!ts || !Number.isFinite(ts.getTime())) continue;
      const iso = ts.toISOString();
      if (!isWithinRangeHours(iso, rangeHours)) continue;
      const haystack = `${title} ${description}`;
      const where = inferCountryFromText(haystack);
      if (!isValidLatLon(where.lat, where.lon)) continue;

      points.push({
        id: `iaea-${(link ?? title).slice(0, 96)}-${iso}`,
        layer: "news",
        title: title.replace(/\s+/g, " ").trim(),
        subtitle: where.canonical,
        lat: where.lat,
        lon: where.lon,
        country: where.canonical,
        severity: severityFromText(haystack),
        source: "IAEA press release",
        timestamp: iso,
        confidence: 0.7,
        metadata: {
          source_url: link ?? null,
          iaea_feed: url,
          geo_precision: "country",
        },
      });
    }
  }

  if (points.length === 0 && errors.length === IAEA_RSS_URLS.length) {
    return {
      points: [],
      health: makeErrorHealth(
        PROVIDER,
        errors.slice(0, 2).join(" | "),
        Date.now() - startedAt
      ),
    };
  }

  return {
    points,
    health: makeOkHealth(
      PROVIDER,
      `IAEA RSS: ${points.length} press items in last ${rangeHours}h (cap ${IAEA_CAP}; ${errors.length} feed errors)`,
      Date.now() - startedAt
    ),
  };
}
