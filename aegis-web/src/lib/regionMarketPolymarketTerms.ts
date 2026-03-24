/**
 * Extra search tokens for Polymarket region markets (demonyms, capitals, abbreviations).
 * Keys are canonicalCountryMatchKey-style lowercase normalized strings.
 */
import { canonicalCountryMatchKey } from "@/lib/countryDisplay";

/** Canonical key → extra substrings to match in Polymarket titles/descriptions. */
const EXTRA_TOKENS_BY_CANONICAL: Record<string, string[]> = {
  france: ["french", "paris", "macron", "eu"],
  germany: ["german", "berlin", "scholz", "eu"],
  japan: ["japanese", "tokyo", "abe"],
  brazil: ["brazilian", "brasilia", "lula"],
  nigeria: ["nigerian", "abuja", "lagos"],
  argentina: ["argentinian", "buenos", "milei"],
  mexico: ["mexican", "mexico city"],
  canada: ["canadian", "ottawa", "trudeau"],
  australia: ["australian", "canberra"],
  "south africa": ["pretoria", "johannesburg", "cape town"],
  egypt: ["egyptian", "cairo", "sisi"],
  turkey: ["turkish", "ankara", "erdogan"],
  poland: ["polish", "warsaw", "duda"],
  netherlands: ["dutch", "amsterdam", "hague", "eu"],
  belgium: ["belgian", "brussels", "eu"],
  sweden: ["swedish", "stockholm", "eu"],
  norway: ["norwegian", "oslo"],
  spain: ["spanish", "madrid", "eu"],
  italy: ["italian", "rome", "meloni", "eu"],
  portugal: ["portuguese", "lisbon", "eu"],
  greece: ["greek", "athens", "eu"],
  hungary: ["hungarian", "budapest", "eu"],
  romania: ["romanian", "bucharest", "eu"],
  "czech republic": ["czech", "prague", "eu"],
  czechia: ["czech", "prague", "eu"],
  switzerland: ["swiss", "bern", "geneva"],
  austria: ["austrian", "vienna", "eu"],
  denmark: ["danish", "copenhagen", "eu"],
  finland: ["finnish", "helsinki", "eu"],
  ireland: ["irish", "dublin", "eu"],
  colombia: ["colombian", "bogota"],
  chile: ["chilean", "santiago"],
  peru: ["peruvian", "lima"],
  venezuela: ["venezuelan", "caracas", "maduro"],
  cuba: ["cuban", "havana"],
  "saudi arabia": ["saudi", "riyadh", "mbs"],
  "united arab emirates": ["emirates", "dubai", "abu dhabi", "uae"],
  iraq: ["iraqi", "baghdad"],
  syria: ["syrian", "damascus", "assad"],
  lebanon: ["lebanese", "beirut"],
  yemen: ["yemeni", "sanaa", "houthis"],
  libya: ["libyan", "tripoli"],
  algeria: ["algerian", "algiers"],
  morocco: ["moroccan", "rabat"],
  tunisia: ["tunisian", "tunis"],
  ethiopia: ["ethiopian", "addis"],
  kenya: ["kenyan", "nairobi"],
  ghana: ["ghanaian", "accra"],
  senegal: ["senegalese", "dakar"],
  "south korea": ["seoul", "korean"],
  "north korea": ["pyongyang", "dprk", "kim jong"],
  taiwan: ["taipei", "taiwanese"],
  vietnam: ["vietnamese", "hanoi", "ho chi minh"],
  thailand: ["thai", "bangkok"],
  indonesia: ["indonesian", "jakarta"],
  malaysia: ["malaysian", "kuala lumpur"],
  philippines: ["filipino", "manila"],
  singapore: ["singaporean"],
  "new zealand": ["wellington", "auckland", "kiwi"],
  kazakhstan: ["kazakh", "astana"],
  uzbekistan: ["uzbek", "tashkent"],
  georgia: ["tbilisi", "georgian"],
  armenia: ["yerevan", "armenian"],
  azerbaijan: ["baku", "azerbaijani"],
  serbia: ["belgrade", "serbian"],
  croatia: ["zagreb", "croatian", "eu"],
  bulgaria: ["sofia", "bulgarian", "eu"],
  slovakia: ["bratislava", "slovak", "eu"],
  slovenia: ["ljubljana", "slovenian", "eu"],
  estonia: ["tallinn", "estonian", "eu"],
  latvia: ["riga", "latvian", "eu"],
  lithuania: ["vilnius", "lithuanian", "eu"],
  moldova: ["chisinau", "moldovan"],
  belarus: ["minsk", "belarusian"],
  bangladesh: ["dhaka", "bangladeshi"],
  "sri lanka": ["colombo", "lankan"],
  nepal: ["kathmandu", "nepali"],
  myanmar: ["yangon", "burmese", "rangoon"],
  cambodia: ["phnom penh", "cambodian"],
  laos: ["vientiane", "laotian"],
  tajikistan: ["dushanbe", "tajik"],
  kyrgyzstan: ["bishkek", "kyrgyz"],
  turkmenistan: ["ashgabat", "turkmen"],
  somalia: ["mogadishu", "somali"],
  eritrea: ["asmara", "eritrean"],
  djibouti: ["djibouti"],
  cameroon: ["yaounde", "cameroonian"],
  "ivory coast": ["abidjan", "ivorian", "côte"],
  niger: ["niamey"],
  mali: ["bamako", "malian"],
  "burkina faso": ["ouagadougou"],
  chad: ["n'djamena", "ndjamena"],
  "republic of the congo": ["brazzaville", "congolese"],
  "democratic republic of the congo": ["kinshasa", "drc", "congolese"],
  "central african republic": ["bangui"],
  gabon: ["libreville"],
  angola: ["luanda", "angolan"],
  zambia: ["lusaka", "zambian"],
  zimbabwe: ["harare", "zimbabwean"],
  mozambique: ["maputo", "mozambican"],
  botswana: ["gaborone"],
  namibia: ["windhoek"],
  madagascar: ["antananarivo"],
  malawi: ["lilongwe"],
  rwanda: ["kigali", "rwandan"],
  uganda: ["kampala", "ugandan"],
  tanzania: ["dodoma", "dar es salaam", "tanzanian"],
  "costa rica": ["san jose"],
  panama: ["panama city", "panamanian"],
  guatemala: ["guatemala city", "guatemalan"],
  honduras: ["tegucigalpa"],
  "el salvador": ["san salvador"],
  nicaragua: ["managua"],
  jamaica: ["kingston", "jamaican"],
  iceland: ["reykjavik", "icelandic"],
  luxembourg: ["luxembourg", "eu"],
  malta: ["valletta", "maltese", "eu"],
  cyprus: ["nicosia", "cypriot", "eu"],
  qatar: ["doha", "qatari"],
  kuwait: ["kuwait city", "kuwaiti"],
  oman: ["muscat", "omani"],
  bahrain: ["manama", "bahraini"],
  jordan: ["amman", "jordanian"],
  bhutan: ["thimphu"],
  maldives: ["male", "maldivian"],
  brunei: ["bandar seri begawan"],
  "east timor": ["dili", "timor-leste"],
  "papua new guinea": ["port moresby"],
  fiji: ["suva"],
  "solomon islands": ["honiara"],
  vanuatu: ["port vila"],
  samoa: ["apia"],
  tonga: ["nuku'alofa"],
  mongolia: ["ulaanbaatar", "mongolian"],
};

export function regionMarketSearchTerms(name: string): string[] {
  const n = name.toLowerCase();
  if (n.includes("south china sea")) return ["china", "taiwan", "philippines", "navy"];
  if (n.includes("hormuz")) return ["iran", "oil", "shipping", "middle east"];
  if (n.includes("indian ocean")) return ["iran", "shipping", "india", "red sea"];
  if (n.includes("arctic")) return ["arctic", "oil", "russia", "nato"];
  if (n.includes("antarctica")) return ["antarctica", "resources", "treaty", "climate"];
  if (n.includes("atlantic")) return ["nato", "shipping", "russia", "carrier"];

  const tokens = n.split(/\s+/).filter(Boolean);
  if (n.includes("united states")) tokens.push("us", "usa", "america", "u.s.");
  if (n.includes("united kingdom")) tokens.push("uk", "britain", "u.k.");
  if (n.includes("judea") || n.includes("palestine")) tokens.push("palestine", "gaza", "west bank", "israel");
  if (n.includes("russia")) tokens.push("russian", "moscow");
  if (n.includes("ukraine")) tokens.push("ukrainian");
  if (n.includes("iran")) tokens.push("iranian");
  if (n.includes("afghanistan")) tokens.push("afghan", "taliban", "kabul");
  if (n.includes("israel")) tokens.push("israeli", "tel aviv", "jerusalem", "gaza");
  if (n.includes("china")) tokens.push("beijing");
  if (n.includes("india")) tokens.push("indian");
  if (n.includes("pakistan")) tokens.push("pakistani");
  if (n.includes("sudan")) tokens.push("khartoum", "darfur");

  const key = canonicalCountryMatchKey(name);
  const extra = EXTRA_TOKENS_BY_CANONICAL[key];
  if (extra) tokens.push(...extra);

  return Array.from(new Set(tokens.filter((t) => t.length >= 2)));
}

/** 1–2 search queries for Gamma public-search (distinct, non-empty). */
export function publicSearchQueries(name: string): string[] {
  const trimmed = name.trim();
  if (!trimmed) return [];
  const terms = regionMarketSearchTerms(trimmed);
  const primary = trimmed;
  const secondary =
    terms.find((t) => t.length >= 3 && !primary.toLowerCase().includes(t)) ?? terms.find((t) => t.length >= 3);
  const out: string[] = [primary];
  if (secondary && secondary.toLowerCase() !== primary.toLowerCase()) out.push(secondary);
  return Array.from(new Set(out)).slice(0, 2);
}
