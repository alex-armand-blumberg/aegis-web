import type { AssetType } from "./types";

/**
 * Profile data for matching live signals to assets.
 *
 * IMPORTANT: profiles are *relevance filters only*. They do not generate
 * regional context content. All context evidence still comes from live
 * /api/map signals at request time. If no live signal matches a profile,
 * the asset has no regional context — by design.
 *
 * A profile matches an asset via any of:
 *   - exact assetId
 *   - assetType + country
 *   - country alone
 *   - any of `tagsAny`
 *
 * Country-name matching uses `countriesMatch` from countryDisplay (handles
 * common aliases like USA/US, UK/Britain, Russia/Russian Federation, etc.).
 */
export type AssetProfileMatch = {
  assetId?: string;
  assetType?: AssetType;
  country?: string;
  tagsAny?: string[];
};

export type AssetProfile = {
  id: string;
  match: AssetProfileMatch;
  /** Country names whose live signals are treated as neighbor context. */
  neighborCountries: string[];
  /** Lowercase keyword tokens — match against cluster titles for theater scope. */
  theaterKeywords: string[];
  /** Lowercase keyword tokens — match cluster titles for transit/route scope. */
  corridorKeywords: string[];
  /** Optional descriptive label shown in chip tooltips. Never used as evidence text. */
  label?: string;
};

export const ASSET_PROFILES: AssetProfile[] = [
  {
    id: "haifa-supplier",
    match: { assetId: "sample-haifa-supplier", country: "Israel" },
    neighborCountries: [
      "Lebanon",
      "Syria",
      "Jordan",
      "Egypt",
      "Iran",
      "Yemen",
      "Iraq",
    ],
    theaterKeywords: [
      "gaza",
      "west bank",
      "lebanon border",
      "northern israel",
      "golan",
      "houthi",
      "tel aviv",
      "haifa",
      "levant",
    ],
    corridorKeywords: ["mediterranean", "eastern mediterranean", "suez"],
    label: "Levant theater",
  },
  {
    id: "hsinchu-chip-partner",
    match: { assetId: "sample-hsinchu-chip", country: "Taiwan" },
    neighborCountries: [
      "China",
      "Japan",
      "Philippines",
      "South Korea",
    ],
    theaterKeywords: [
      "taiwan strait",
      "south china sea",
      "east china sea",
      "spratly",
      "senkaku",
      "diaoyu",
      "pla",
    ],
    corridorKeywords: ["taiwan strait", "south china sea", "luzon strait"],
    label: "Taiwan Strait theater",
  },
  {
    id: "piraeus-port",
    match: { assetId: "sample-piraeus-port", country: "Greece" },
    neighborCountries: [
      "Turkey",
      "Bulgaria",
      "North Macedonia",
      "Albania",
      "Italy",
      "Egypt",
      "Libya",
      "Cyprus",
    ],
    theaterKeywords: ["aegean", "balkans", "cyprus", "mediterranean"],
    corridorKeywords: [
      "mediterranean",
      "aegean",
      "bosphorus",
      "dardanelles",
      "suez",
    ],
    label: "Eastern Mediterranean corridor",
  },
  {
    id: "nairobi-office",
    match: { assetId: "sample-nairobi-office", country: "Kenya" },
    neighborCountries: [
      "Somalia",
      "Ethiopia",
      "South Sudan",
      "Uganda",
      "Tanzania",
      "Sudan",
    ],
    theaterKeywords: ["horn of africa", "al-shabaab", "east africa"],
    corridorKeywords: ["red sea", "gulf of aden", "indian ocean"],
    label: "East Africa region",
  },
  {
    id: "red-sea-route",
    match: { assetId: "sample-red-sea-route", country: "Yemen" },
    neighborCountries: [
      "Yemen",
      "Saudi Arabia",
      "Egypt",
      "Sudan",
      "Eritrea",
      "Djibouti",
      "Somalia",
      "Iran",
    ],
    theaterKeywords: ["houthi", "ansar allah", "sanaa", "hodeidah"],
    corridorKeywords: [
      "red sea",
      "bab el-mandeb",
      "bab al-mandab",
      "bab-el-mandeb",
      "gulf of aden",
      "suez",
    ],
    label: "Red Sea / Bab el-Mandeb corridor",
  },
  {
    id: "kyiv-field",
    match: { assetId: "sample-kyiv-field", country: "Ukraine" },
    neighborCountries: [
      "Russia",
      "Belarus",
      "Poland",
      "Romania",
      "Moldova",
      "Slovakia",
      "Hungary",
    ],
    theaterKeywords: [
      "donbas",
      "donetsk",
      "luhansk",
      "kharkiv",
      "zaporizhzhia",
      "crimea",
      "kherson",
      "mykolaiv",
      "odesa",
      "black sea",
    ],
    corridorKeywords: ["black sea", "danube", "azov"],
    label: "Ukraine theater",
  },
  {
    id: "manila-office",
    match: { assetId: "sample-manila-office", country: "Philippines" },
    neighborCountries: [
      "Taiwan",
      "Indonesia",
      "Malaysia",
      "Vietnam",
      "China",
      "Brunei",
    ],
    theaterKeywords: [
      "south china sea",
      "spratly",
      "scarborough shoal",
      "taiwan strait",
      "luzon",
    ],
    corridorKeywords: ["south china sea", "luzon strait", "sulu sea"],
    label: "South China Sea theater",
  },
  {
    id: "istanbul-facility",
    match: { assetId: "sample-istanbul-facility", country: "Turkey" },
    neighborCountries: [
      "Syria",
      "Iran",
      "Iraq",
      "Greece",
      "Bulgaria",
      "Georgia",
      "Armenia",
      "Azerbaijan",
    ],
    theaterKeywords: ["bosphorus", "aegean", "northern syria", "rojava"],
    corridorKeywords: ["bosphorus", "black sea", "dardanelles", "aegean"],
    label: "Bosphorus / Black Sea corridor",
  },
];

/** Type-only fallback profile used when a custom (non-sample) asset has no explicit profile. */
export const EMPTY_PROFILE: AssetProfile = {
  id: "default-empty",
  match: {},
  neighborCountries: [],
  theaterKeywords: [],
  corridorKeywords: [],
};
