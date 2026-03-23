/**
 * Canonical display names and country matching for map + intel APIs.
 * GeoJSON and external sources may use different strings for the same region.
 */

export const JUDEA_SAMARIA_PALESTINE_LABEL = "Judea & Samaria / Palestine";

/** Normalize for equality checks (lowercase, single spaces). */
export function normalizeCountryKey(input: string | undefined | null): string {
  return (input ?? "")
    .normalize("NFKC")
    .replace(/[^a-z0-9\s/&-]/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Internal bucket key for Israel–Palestine area labels (any alias). */
const PALESTINE_MATCH_BUCKET = "__judea_samaria_palestine__";

/**
 * Normalized-key aliases so GeoJSON names (e.g. United States) match map data
 * (e.g. USA, Russian Federation, UK).
 */
const CANONICAL_COUNTRY_ALIASES: Record<string, string> = {
  usa: "united states",
  "u.s.": "united states",
  "u.s.a.": "united states",
  "u.s": "united states",
  "united states of america": "united states",
  uk: "united kingdom",
  britain: "united kingdom",
  "great britain": "united kingdom",
  england: "united kingdom",
  scotland: "united kingdom",
  wales: "united kingdom",
  "russian federation": "russia",
  irn: "iran",
  "islamic republic of iran": "iran",
  "iran islamic republic of": "iran",
  "syrian arab republic": "syria",
  "democratic republic of congo": "democratic republic of the congo",
  drc: "democratic republic of the congo",
  "dr congo": "democratic republic of the congo",
  "viet nam": "vietnam",
  "korea republic of": "south korea",
  "korea democratic peoples republic of": "north korea",
  turkiye: "turkey",
  burma: "myanmar",
  uae: "united arab emirates",
  "u.a.e.": "united arab emirates",
  palestine: "judea & samaria / palestine",
  "state of palestine": "judea & samaria / palestine",
};

function toMatchBucket(normalized: string): string {
  if (!normalized) return "";
  if (
    normalized === "palestine" ||
    normalized === "state of palestine" ||
    normalized === "occupied palestinian territory" ||
    normalized === "occupied palestinian territories" ||
    normalized === "palestinian territories" ||
    normalized === "west bank" ||
    normalized === "gaza strip" ||
    normalized === "gaza" ||
    normalized === "rafah" ||
    normalized === normalizeCountryKey(JUDEA_SAMARIA_PALESTINE_LABEL)
  ) {
    return PALESTINE_MATCH_BUCKET;
  }
  return normalized;
}

/** Map a raw country string to a stable comparison bucket key. */
export function countryMatchKey(input: string | undefined | null): string {
  const n = normalizeCountryKey(input);
  if (!n) return "";
  const bucket = toMatchBucket(n);
  if (bucket === PALESTINE_MATCH_BUCKET) return PALESTINE_MATCH_BUCKET;
  return CANONICAL_COUNTRY_ALIASES[n] ?? bucket;
}

/** True if two country strings refer to the same place (aliases + Palestine cluster). */
export function countriesMatch(a: string | undefined | null, b: string | undefined | null): boolean {
  return countryMatchKey(a) === countryMatchKey(b);
}

/** Exported for APIs that need a single canonical key for a country label. */
export function canonicalCountryMatchKey(input: string | undefined | null): string {
  return countryMatchKey(input);
}

/**
 * User-facing title for panels, map labels, and API `country` fields.
 */
export function formatCountryDisplayName(raw: string | undefined | null): string {
  const n = normalizeCountryKey(raw);
  if (!n) return "";
  if (toMatchBucket(n) === PALESTINE_MATCH_BUCKET) return JUDEA_SAMARIA_PALESTINE_LABEL;

  // Title-case each word; preserve short particles
  const words = raw!.trim().replace(/\s+/g, " ").split(" ");
  const small = new Set(["of", "and", "the", "or", "in", "de", "da", "la", "le"]);
  return words
    .map((w, i) => {
      if (i > 0 && small.has(w.toLowerCase())) return w.toLowerCase();
      if (w.includes("/")) {
        return w
          .split("/")
          .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
          .join("/");
      }
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(" ");
}

/** Short label for DeckGL text hotspots (avoid huge ALL-CAPS strings). */
export function formatCountryMapLabelShort(raw: string | undefined | null): string {
  const full = formatCountryDisplayName(raw);
  if (toMatchBucket(normalizeCountryKey(raw)) === PALESTINE_MATCH_BUCKET) return "J&S / Palestine";
  if (full.length <= 18) return full.toUpperCase();
  return `${full.slice(0, 16)}…`;
}
