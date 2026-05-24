import type { SelectedAssetEvent } from "@/lib/impact/eventLayer";
import type { SourceTier } from "@/lib/impact/sourceTier";
import { tierLabel } from "@/lib/impact/sourceTier";
import type {
  ConfidenceLevel,
  EventClass,
  ExposureAlert,
  ExposureLevel,
  GeoPrecision,
  UserAsset,
} from "@/lib/impact/types";
import type { IntelSeverity } from "@/lib/intel/types";
import {
  formatDistanceKm,
  geoPrecisionLabel,
  relationLabel,
} from "../dashboard/dashboardUtils";

export const ANALYST_MAX_EVIDENCE = 10;
export const ANALYST_MAX_SOURCE_URLS = 10;
export const ANALYST_MAX_HISTORY_TURNS = 20;
export const ANALYST_MAX_MESSAGE_CHARS = 4000;
export const ANALYST_MAX_CONTEXT_BYTES = 32_000;

export type AnalystEvidence = {
  id: string;
  title: string;
  relation: string;
  tier: SourceTier;
  tierLabel: string;
  geoPrecision: GeoPrecision;
  geoPrecisionLabel: string | null;
  distanceKm: number | null;
  distanceLabel: string | null;
  severity: IntelSeverity;
  sourceName: string;
  sourceUrl: string | null;
  timestamp: string;
  eventClass: EventClass;
  country: string | null;
};

export type AnalystRiskContext = {
  score: number;
  level: ExposureLevel;
  confidence: ConfidenceLevel;
  headline: string;
  whyItMatters: string;
  uncertainty: string;
  watchNext: string[];
} | null;

export type AnalystAssetContext = {
  id: string;
  name: string;
  type: string;
  city: string | null;
  country: string;
  lat: number;
  lon: number;
  importance: string;
};

export type AnalystContext = {
  meta: {
    generatedAt: string;
    range: string;
  };
  asset: AnalystAssetContext;
  risk: AnalystRiskContext;
  evidence: AnalystEvidence[];
};

function safeString(value: string | undefined | null, max = 240): string {
  if (!value) return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function isSafeHttpUrl(value: string | undefined | null): value is string {
  if (!value) return false;
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

function toAssetContext(asset: UserAsset): AnalystAssetContext {
  return {
    id: asset.id,
    name: safeString(asset.name, 120) || asset.id,
    type: asset.type,
    city: asset.city ? safeString(asset.city, 80) : null,
    country: safeString(asset.country, 80) || "Unknown",
    lat: Number.isFinite(asset.lat) ? asset.lat : 0,
    lon: Number.isFinite(asset.lon) ? asset.lon : 0,
    importance: asset.importance,
  };
}

function toRiskContext(alert: ExposureAlert | null): AnalystRiskContext {
  if (!alert) return null;
  return {
    score: Math.round(alert.score),
    level: alert.level,
    confidence: alert.confidence,
    headline: safeString(alert.headline, 280),
    whyItMatters: safeString(alert.whyItMatters, 480),
    uncertainty: safeString(alert.uncertainty, 320),
    watchNext: (alert.watchNext ?? []).slice(0, 6).map((item) => safeString(item, 160)).filter(Boolean),
  };
}

function toEvidence(
  events: SelectedAssetEvent[],
  maxUrls: number
): AnalystEvidence[] {
  const seen = new Set<string>();
  const out: AnalystEvidence[] = [];
  let urlsUsed = 0;
  for (const event of events) {
    if (out.length >= ANALYST_MAX_EVIDENCE) break;
    if (seen.has(event.id)) continue;
    seen.add(event.id);

    const sourceUrlSafe = isSafeHttpUrl(event.url) && urlsUsed < maxUrls ? event.url! : null;
    if (sourceUrlSafe) urlsUsed += 1;

    out.push({
      id: event.id,
      title: safeString(event.title, 200) || "Untitled event",
      relation: relationLabel(event.relation),
      tier: event.tier,
      tierLabel: tierLabel(event.tier),
      geoPrecision: event.geoPrecision,
      geoPrecisionLabel: geoPrecisionLabel(event.geoPrecision),
      distanceKm:
        typeof event.distanceKm === "number" && Number.isFinite(event.distanceKm)
          ? Math.round(event.distanceKm * 10) / 10
          : null,
      distanceLabel: formatDistanceKm(event.distanceKm),
      severity: event.severity,
      sourceName: safeString(event.source, 80) || "Unknown source",
      sourceUrl: sourceUrlSafe,
      timestamp: event.timestamp,
      eventClass: event.eventClass,
      country: event.country ? safeString(event.country, 80) : null,
    });
  }
  return out;
}

export type BuildAnalystContextArgs = {
  asset: UserAsset;
  alert: ExposureAlert | null;
  topEvents: SelectedAssetEvent[];
  range: string;
  generatedAt?: string;
};

export function buildAnalystContext({
  asset,
  alert,
  topEvents,
  range,
  generatedAt,
}: BuildAnalystContextArgs): AnalystContext {
  return {
    meta: {
      generatedAt: generatedAt ?? new Date().toISOString(),
      range,
    },
    asset: toAssetContext(asset),
    risk: toRiskContext(alert),
    evidence: toEvidence(topEvents, ANALYST_MAX_SOURCE_URLS),
  };
}

function byteLengthUtf8(value: string): number {
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(value).length;
  }
  let bytes = 0;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code < 0xdc00) {
      bytes += 4;
      i += 1;
    } else bytes += 3;
  }
  return bytes;
}

/**
 * Deterministic trim if the serialized context exceeds the byte budget.
 * Drops trailing evidence rows first, then `watchNext` items, before bailing.
 */
export function trimAnalystContextToBudget(
  context: AnalystContext,
  maxBytes = ANALYST_MAX_CONTEXT_BYTES
): AnalystContext {
  const sizeOf = (ctx: AnalystContext) => byteLengthUtf8(JSON.stringify(ctx));
  if (sizeOf(context) <= maxBytes) return context;

  let trimmed: AnalystContext = {
    ...context,
    evidence: [...context.evidence],
    risk: context.risk ? { ...context.risk, watchNext: [...context.risk.watchNext] } : null,
  };

  while (trimmed.evidence.length > 1 && sizeOf(trimmed) > maxBytes) {
    trimmed = { ...trimmed, evidence: trimmed.evidence.slice(0, -1) };
  }
  while (trimmed.risk && trimmed.risk.watchNext.length > 0 && sizeOf(trimmed) > maxBytes) {
    trimmed = {
      ...trimmed,
      risk: { ...trimmed.risk, watchNext: trimmed.risk.watchNext.slice(0, -1) },
    };
  }
  return trimmed;
}

/**
 * Render context as a plain-text block injected into the system prompt.
 * Uses bullet-style fields rather than raw JSON so the model treats it as facts.
 */
export function renderContextForPrompt(context: AnalystContext): string {
  const lines: string[] = [];
  lines.push("CONTEXT (this is the only ground truth Argus may rely on):");
  lines.push(`- range: ${context.meta.range}`);
  lines.push(`- generated_at: ${context.meta.generatedAt}`);
  lines.push("");
  lines.push("Asset:");
  lines.push(`- name: ${context.asset.name}`);
  lines.push(`- type: ${context.asset.type}`);
  lines.push(
    `- location: ${
      context.asset.city ? `${context.asset.city}, ` : ""
    }${context.asset.country} (lat ${context.asset.lat}, lon ${context.asset.lon})`
  );
  lines.push(`- importance: ${context.asset.importance}`);
  lines.push("");

  if (context.risk) {
    lines.push("Exposure (AEGIS pipeline values — do not recompute):");
    lines.push(`- score: ${context.risk.score} / 100`);
    lines.push(`- level: ${context.risk.level}`);
    lines.push(`- pipeline_confidence: ${context.risk.confidence}`);
    lines.push(`- headline: ${context.risk.headline}`);
    if (context.risk.whyItMatters) {
      lines.push(`- why_it_matters: ${context.risk.whyItMatters}`);
    }
    if (context.risk.uncertainty) {
      lines.push(`- pipeline_uncertainty: ${context.risk.uncertainty}`);
    }
    if (context.risk.watchNext.length) {
      lines.push("- watch_next:");
      for (const item of context.risk.watchNext) lines.push(`  - ${item}`);
    }
  } else {
    lines.push("Exposure: not available for this asset/range.");
  }
  lines.push("");

  lines.push(`Evidence (top ${context.evidence.length}, deterministic):`);
  if (context.evidence.length === 0) {
    lines.push("- (no qualifying events in the selected range)");
  } else {
    context.evidence.forEach((ev, i) => {
      const distance = ev.distanceLabel ? `, ${ev.distanceLabel}` : "";
      const geo = ev.geoPrecisionLabel ? `, ${ev.geoPrecisionLabel}` : "";
      const url = ev.sourceUrl ? ` url=${ev.sourceUrl}` : "";
      lines.push(
        `${i + 1}. [${ev.relation} · ${ev.tierLabel} · ${ev.severity}] ${ev.title}` +
          ` (source: ${ev.sourceName}, class=${ev.eventClass}, ts=${ev.timestamp}${distance}${geo}${url})`
      );
    });
  }
  return lines.join("\n");
}
