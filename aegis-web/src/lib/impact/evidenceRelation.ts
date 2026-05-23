import { countriesMatch } from "@/lib/countryDisplay";
import type { EvidenceItem, UserAsset } from "./types";

export type EvidenceRelation = "direct" | "regional_context" | "model_context";

export const EVIDENCE_RELATION_LABEL: Record<EvidenceRelation, string> = {
  direct: "Direct",
  regional_context: "Regional Context",
  model_context: "Model Context",
};

const DIRECT_DISTANCE_KM = 150;
const DIRECT_SAME_COUNTRY_DISTANCE_KM = 350;

function isConcreteEventClass(item: EvidenceItem): boolean {
  if (item.eventClass === "model_risk_context") return false;
  if (item.eventClass === "news_report") return false;
  if (item.eventClass === "other") return false;
  return true;
}

export function classifyEvidenceRelation(
  item: EvidenceItem,
  asset: UserAsset
): EvidenceRelation {
  const sourceFamilies = item.sourceFamilies ?? [];
  const layers = item.layers ?? [];
  const isModel =
    item.eventClass === "model_risk_context" ||
    sourceFamilies.includes("model_context") ||
    layers.includes("escalationRisk") ||
    layers.includes("hotspots");
  if (isModel) return "model_context";

  const distance = item.distanceKm;
  const sameCountry = countriesMatch(item.country, asset.country);
  const concrete = isConcreteEventClass(item);

  if (typeof distance === "number" && Number.isFinite(distance)) {
    if (distance <= DIRECT_DISTANCE_KM && concrete) return "direct";
    if (sameCountry && distance <= DIRECT_SAME_COUNTRY_DISTANCE_KM && concrete) {
      return "direct";
    }
  }

  return "regional_context";
}

export function groupEvidenceByRelation(
  items: EvidenceItem[],
  asset: UserAsset
): { relation: EvidenceRelation; items: EvidenceItem[] }[] {
  const buckets: Record<EvidenceRelation, EvidenceItem[]> = {
    direct: [],
    regional_context: [],
    model_context: [],
  };
  for (const item of items) {
    const rel = classifyEvidenceRelation(item, asset);
    buckets[rel].push(item);
  }
  const grouped: { relation: EvidenceRelation; items: EvidenceItem[] }[] = [
    { relation: "direct", items: buckets.direct },
    { relation: "regional_context", items: buckets.regional_context },
    { relation: "model_context", items: buckets.model_context },
  ];
  return grouped.filter((bucket) => bucket.items.length > 0);
}
