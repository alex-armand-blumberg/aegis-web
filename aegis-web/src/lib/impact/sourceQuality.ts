import type { IntelPoint } from "@/lib/intel/types";
import { SOURCE_RELIABILITY_BASE } from "./scoringConfig";
import type {
  EventClass,
  GeoPrecision,
  NormalizedSignal,
  SourceFamily,
} from "./types";

type MetadataValue = string | number | boolean | null;

function metaString(
  metadata: Record<string, MetadataValue> | undefined,
  key: string
): string | undefined {
  if (!metadata) return undefined;
  const v = metadata[key];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function lc(value: string | undefined): string {
  return value ? value.toLowerCase() : "";
}

function includesAny(haystack: string, needles: string[]): boolean {
  for (const n of needles) {
    if (n && haystack.includes(n)) return true;
  }
  return false;
}

export function extractSourceUrl(point: IntelPoint): string | undefined {
  const keys = [
    "source_url",
    "article_url",
    "url",
    "link",
    "href",
    "sourceUrl",
    "original_url",
    "canonical_url",
  ];
  for (const k of keys) {
    const v = metaString(point.metadata, k);
    if (v && /^https?:\/\//i.test(v)) return v;
  }
  return undefined;
}

export function inferSourceFamily(point: IntelPoint): SourceFamily {
  const source = lc(point.source);
  const layer = point.layer;
  const title = lc(point.title);

  if (
    includesAny(source, [
      "acled",
      "ucdp",
      "battles dataset",
      "structured conflict",
    ])
  ) {
    return "structured_conflict";
  }

  if (
    includesAny(source, [
      "ofac",
      "sanction",
      "treasury",
      "consolidated sanctions",
    ])
  ) {
    return "sanctions";
  }

  if (
    includesAny(source, [
      "dod",
      "department of defense",
      "uk mod",
      "ministry of defence",
      "ministry of defense",
      "un official",
      "united nations press",
      "state department",
      "sam.gov",
      "usaspending",
      "government statement",
      "official release",
      "press release",
    ])
  ) {
    return "official";
  }

  if (includesAny(source, ["reliefweb", "ocha", "unhcr"])) {
    return "humanitarian";
  }

  if (includesAny(source, ["gdacs", "usgs", "noaa", "earthquake", "wildfire"])) {
    return "disaster";
  }

  if (
    includesAny(source, [
      "ais",
      "marine traffic",
      "vesselfinder",
      "usni",
      "fleet tracker",
    ]) ||
    layer === "vessels" ||
    layer === "carriers"
  ) {
    return "maritime";
  }

  if (
    includesAny(source, ["opensky", "adsb", "flightradar", "aviation"]) ||
    layer === "flights"
  ) {
    return "aviation";
  }

  if (layer === "infrastructure") return "infrastructure";

  if (
    includesAny(source, [
      "polymarket",
      "kalshi",
      "prediction market",
      "manifold",
    ])
  ) {
    return "market";
  }

  if (
    layer === "escalationRisk" ||
    layer === "hotspots" ||
    includesAny(source, ["model", "escalation index", "hotspot"]) ||
    includesAny(title, ["escalation risk", "hotspot indicator"])
  ) {
    return "model_context";
  }

  if (
    layer === "news" ||
    includesAny(source, [
      "gdelt",
      "google news",
      "rss",
      "liveuamap",
      "live uamap",
      "reuters",
      "ap news",
      "associated press",
      "bbc",
      "al jazeera",
      "cnn",
      "afp",
      "bloomberg",
    ])
  ) {
    return "news";
  }

  if (
    layer === "conflictsBattles" ||
    layer === "conflictsExplosions" ||
    layer === "conflictsCivilians" ||
    layer === "conflictsStrategic" ||
    layer === "conflictsProtests" ||
    layer === "conflictsRiots" ||
    layer === "conflicts"
  ) {
    return "structured_conflict";
  }

  if (layer === "liveStrikes") return "structured_conflict";

  return "unknown";
}

export function inferEventClass(point: IntelPoint): EventClass {
  const layer = point.layer;
  const title = lc(point.title);
  const source = lc(point.source);
  const subtitle = lc(point.subtitle);

  if (layer === "conflictsBattles") return "armed_conflict";
  if (layer === "conflictsExplosions" || layer === "liveStrikes") return "strike_or_explosion";
  if (layer === "conflictsCivilians") return "civilian_harm";
  if (layer === "conflictsProtests" || layer === "conflictsRiots") return "protest_or_unrest";
  if (layer === "conflictsStrategic" || layer === "troopMovements") return "strategic_development";
  if (layer === "vessels" || layer === "carriers") return "maritime_activity";
  if (layer === "flights") return "aviation_activity";
  if (layer === "infrastructure") return "infrastructure_disruption";
  if (layer === "escalationRisk" || layer === "hotspots") return "model_risk_context";

  if (
    includesAny(title, [
      "missile",
      "rocket",
      "drone strike",
      "airstrike",
      "air strike",
      "shelling",
      "bombardment",
      "explosion",
    ]) ||
    includesAny(subtitle, ["airstrike", "shelling", "missile"])
  ) {
    return "strike_or_explosion";
  }

  if (
    includesAny(title, ["clash", "armed clash", "battle", "firefight", "raid", "infiltration"])
  ) {
    return "armed_conflict";
  }

  if (
    includesAny(title, [
      "civilian",
      "casualt",
      "killed civilians",
      "civilian harm",
      "civilians killed",
      "civilians wounded",
    ])
  ) {
    return "civilian_harm";
  }

  if (includesAny(title, ["protest", "demonstration", "riot", "unrest", "rally"])) {
    return "protest_or_unrest";
  }

  if (
    includesAny(title, [
      "military buildup",
      "deployment",
      "mobilization",
      "strategic",
      "exercise",
      "wargame",
    ])
  ) {
    return "strategic_development";
  }

  if (
    includesAny(source, ["reliefweb", "ocha", "unhcr"]) ||
    includesAny(title, ["displacement", "aid", "humanitarian", "refugees"])
  ) {
    return "humanitarian_stress";
  }

  if (
    includesAny(source, ["gdacs", "usgs"]) ||
    includesAny(title, ["earthquake", "flood", "cyclone", "wildfire", "tsunami", "hurricane", "typhoon"])
  ) {
    return "natural_disaster";
  }

  if (
    includesAny(source, ["ofac", "sanction"]) ||
    includesAny(title, ["sanctions", "export controls", "asset freeze", "designation"])
  ) {
    return "sanctions_or_economic";
  }

  if (
    includesAny(title, [
      "vessel",
      "ais",
      "shipping",
      "chokepoint",
      "strait",
      "port closed",
      "naval",
    ])
  ) {
    return "maritime_activity";
  }

  if (includesAny(title, ["flight", "airspace", "airport", "noteam", "notam"])) {
    return "aviation_activity";
  }

  if (
    includesAny(title, [
      "infrastructure",
      "power outage",
      "pipeline",
      "cable",
      "bridge",
      "grid",
      "telecom",
      "water supply",
    ])
  ) {
    return "infrastructure_disruption";
  }

  if (layer === "news") return "news_report";

  return "other";
}

export function inferGeoPrecision(point: IntelPoint): GeoPrecision {
  const md = point.metadata;
  const explicit = metaString(md, "geo_precision") ?? metaString(md, "geoPrecision");
  if (explicit) {
    const e = explicit.toLowerCase();
    if (e === "exact" || e === "city" || e === "region" || e === "country") return e;
  }

  if (md) {
    const precisionField = md["precision"];
    if (typeof precisionField === "number") {
      if (precisionField <= 1) return "exact";
      if (precisionField <= 3) return "city";
      if (precisionField <= 5) return "region";
      return "country";
    }
  }

  if (point.layer === "news" || point.layer === "escalationRisk" || point.layer === "hotspots") {
    if (point.country && (!point.subtitle || point.subtitle.length < 4)) return "country";
    return "region";
  }

  if (
    point.layer === "conflictsBattles" ||
    point.layer === "conflictsExplosions" ||
    point.layer === "conflictsCivilians"
  ) {
    return "city";
  }
  if (point.layer === "liveStrikes") {
    const source = lc(point.source);
    if (includesAny(source, ["acled", "ucdp", "battles dataset", "structured conflict"])) {
      return "city";
    }
    return "region";
  }

  if (point.lat === 0 && point.lon === 0) return "unknown";
  return "city";
}

export function sourceReliabilityFor(signal: NormalizedSignal): number {
  let r = SOURCE_RELIABILITY_BASE[signal.sourceFamily] ?? 0.4;

  if (typeof signal.confidence === "number" && Number.isFinite(signal.confidence)) {
    const c = Math.max(0, Math.min(1, signal.confidence));
    r = r * 0.7 + c * 0.3;
  }

  if (signal.geoPrecision === "country" || signal.geoPrecision === "unknown") {
    r -= 0.05;
  } else if (signal.geoPrecision === "exact") {
    r += 0.02;
  }

  const ts = new Date(signal.timestamp);
  if (!Number.isFinite(ts.getTime())) {
    r -= 0.08;
  }

  if (signal.url) r += 0.03;

  return Math.max(0.2, Math.min(0.98, r));
}
