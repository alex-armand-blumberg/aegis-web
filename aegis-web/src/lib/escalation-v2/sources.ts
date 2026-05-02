import type { AcledMonthlyRecord } from "@/lib/escalation";
import {
  type EscalationSignal,
  type EscalationSignalType,
  type SourceFetchContext,
  type SourceFetchResult,
  type SourceMetadata,
} from "./types";

const FETCH_TIMEOUT_MS = 8_000;

function hoursBetween(a: Date, b: Date): number {
  return Math.max(0, Math.abs(a.getTime() - b.getTime()) / 36e5);
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseDate(value: unknown): Date | null {
  if (value == null) return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

function extractXmlTag(block: string, tag: string): string | null {
  const cdata = block.match(new RegExp(`<${tag}>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*<\\/${tag}>`, "i"));
  if (cdata?.[1]) return cdata[1].trim();
  const plain = block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i"));
  if (!plain?.[1]) return null;
  return plain[1]
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      ...init,
      signal: ctl.signal,
      cache: "no-store",
      headers: {
        "User-Agent": "AEGIS-escalation-index-v2",
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

function withStatus(
  metadata: SourceMetadata,
  status: SourceMetadata["status"],
  error?: string
): SourceMetadata {
  return {
    ...metadata,
    status,
    error,
    lastFetchedAt: status === "ok" ? new Date().toISOString() : metadata.lastFetchedAt,
  };
}

export function acledSourceMetadata(configured: boolean): SourceMetadata {
  return {
    id: "acled",
    label: "ACLED",
    enabled: configured,
    configured,
    apiUrl: "https://acleddata.com/api/acled/read",
    authEnvVars: ["ACLED_EMAIL", "ACLED_PASSWORD"],
    refreshIntervalHours: 24,
    attribution: "Armed Conflict Location & Event Data Project (ACLED)",
    termsNote: "Use according to the configured ACLED account tier and license.",
    storagePolicy: "Store monthly aggregates and event counts; do not expose credentials.",
    reliability: 0.95,
    freshnessHalfLifeHours: 24 * 14,
  };
}

export function acledRowsToSignals(
  rows: AcledMonthlyRecord[],
  now: Date
): EscalationSignal[] {
  const meta = acledSourceMetadata(true);
  const signalMap: Array<[EscalationSignalType, keyof AcledMonthlyRecord]> = [
    ["battle", "battles"],
    ["explosion", "explosions_remote_violence"],
    ["violence_against_civilians", "violence_against_civilians"],
    ["strategic_development", "strategic_developments"],
    ["protest", "protests"],
    ["riot", "riots"],
    ["fatalities", "fatalities"],
  ];
  return rows.flatMap((row) => {
    const date = row.event_month.toISOString();
    const freshnessHours = hoursBetween(row.event_month, now);
    return signalMap
      .map(([signalType, key]) => ({
        country: row.country,
        date,
        source: "acled" as const,
        signalType,
        value: Number(row[key]) || 0,
        confidence: meta.reliability,
        freshnessHours,
        termsNote: meta.termsNote,
      }))
      .filter((signal) => signal.value > 0);
  });
}

function emptyResult(metadata: SourceMetadata, reason: string): SourceFetchResult {
  return { metadata: withStatus(metadata, "skipped", reason), signals: [] };
}

function errorResult(metadata: SourceMetadata, err: unknown): SourceFetchResult {
  return {
    metadata: withStatus(metadata, "error", err instanceof Error ? err.message : String(err)),
    signals: [],
  };
}

export async function fetchGdeltCloudSignals(
  ctx: SourceFetchContext
): Promise<SourceFetchResult> {
  const apiKey = process.env.GDELT_CLOUD_API_KEY?.trim();
  const metadata: SourceMetadata = {
    id: "gdelt_cloud",
    label: "GDELT Cloud",
    enabled: Boolean(apiKey),
    configured: Boolean(apiKey),
    apiUrl: "https://gdeltcloud.com/api/v2/events",
    authEnvVars: ["GDELT_CLOUD_API_KEY"],
    refreshIntervalHours: 1,
    attribution: "GDELT Cloud",
    termsNote: "Use API results according to the configured GDELT Cloud plan and rate limits.",
    storagePolicy: "Store generated event metadata, counts, metrics, and evidence links; avoid storing full article bodies.",
    reliability: 0.72,
    freshnessHalfLifeHours: 72,
  };
  if (!apiKey) return emptyResult(metadata, "GDELT_CLOUD_API_KEY is not set.");
  try {
    const params = new URLSearchParams({
      country: ctx.country,
      event_family: "conflict",
      date_start: isoDate(ctx.startDate),
      date_end: isoDate(ctx.endDate),
      confidence_profile: "balanced",
      sort: "recent",
      limit: "250",
    });
    const json = await fetchJson<{ data?: Array<Record<string, unknown>> }>(
      `${metadata.apiUrl}?${params.toString()}`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );
    const signals = (json.data ?? []).flatMap((event): EscalationSignal[] => {
      const date = parseDate(event.event_date);
      if (!date) return [];
      const category = String(event.category ?? event.subcategory ?? "").toLowerCase();
      const metrics = (event.metrics ?? {}) as Record<string, unknown>;
      const significance = Math.max(1, Number(metrics.significance ?? metrics.magnitude ?? 1) || 1);
      const confidence = Math.min(
        1,
        Math.max(0.2, Number(metrics.confidence ?? metadata.reliability) || metadata.reliability)
      );
      const url =
        typeof event.primary_story_url === "string"
          ? event.primary_story_url
          : typeof event.url === "string"
            ? event.url
            : undefined;
      const base = {
        country: ctx.country,
        date: date.toISOString(),
        source: metadata.id,
        confidence,
        freshnessHours: hoursBetween(date, ctx.now),
        evidenceUrl: url,
        title: typeof event.title === "string" ? event.title : undefined,
        sourceEventId: typeof event.id === "string" ? event.id : undefined,
        termsNote: metadata.termsNote,
      };
      const signalType: EscalationSignalType =
        category.includes("explosion") || category.includes("air") || category.includes("strike")
          ? "explosion"
          : category.includes("protest")
            ? "protest"
            : category.includes("civilian")
              ? "violence_against_civilians"
              : "conflict_event";
      const output: EscalationSignal[] = [
        { ...base, signalType, value: significance },
        { ...base, signalType: "story_cluster", value: 1 },
      ];
      const fatalities = Number(event.fatalities);
      if (Number.isFinite(fatalities) && fatalities > 0) {
        output.push({ ...base, signalType: "conflict_fatality", value: fatalities });
      }
      const actors = Array.isArray(event.actors) ? event.actors.length : 0;
      if (actors > 1) output.push({ ...base, signalType: "actor_mobilization", value: actors });
      return output;
    });
    return { metadata: withStatus(metadata, "ok"), signals };
  } catch (err) {
    return errorResult(metadata, err);
  }
}

export async function fetchReliefWebSignals(
  ctx: SourceFetchContext
): Promise<SourceFetchResult> {
  const appname = process.env.RELIEFWEB_APPNAME?.trim();
  const metadata: SourceMetadata = {
    id: "reliefweb",
    label: "ReliefWeb",
    enabled: Boolean(appname),
    configured: Boolean(appname),
    apiUrl: "https://api.reliefweb.int/v2/reports",
    authEnvVars: ["RELIEFWEB_APPNAME"],
    refreshIntervalHours: 6,
    attribution: "ReliefWeb / UN OCHA and information partners",
    termsNote: "ReliefWeb API is free to use; respect original source copyrights and use a pre-approved appname.",
    storagePolicy: "Store report metadata, tags, source names, and URLs; do not store full copyrighted report bodies.",
    reliability: 0.78,
    freshnessHalfLifeHours: 24 * 7,
  };
  if (!appname) return emptyResult(metadata, "RELIEFWEB_APPNAME is not set.");
  try {
    const body = {
      appname,
      limit: 100,
      profile: "list",
      fields: { include: ["title", "date.created", "url", "source.name", "disaster.name"] },
      sort: ["date.created:desc"],
      filter: {
        operator: "AND",
        conditions: [
          { field: "country", value: [ctx.country] },
          {
            field: "date.created",
            value: {
              from: ctx.startDate.toISOString(),
              to: ctx.endDate.toISOString(),
            },
          },
        ],
      },
    };
    const json = await fetchJson<{ data?: Array<{ id?: string; fields?: Record<string, unknown> }> }>(
      metadata.apiUrl,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );
    const signals = (json.data ?? []).flatMap((item): EscalationSignal[] => {
      const fields = item.fields ?? {};
      const date = parseDate((fields["date.created"] as { original?: string } | undefined)?.original);
      if (!date) return [];
      const title = typeof fields.title === "string" ? fields.title : undefined;
      const lowerTitle = title?.toLowerCase() ?? "";
      const stressTerms = ["displacement", "refugee", "civilian", "violence", "conflict", "security", "siege"];
      const stressBoost = stressTerms.some((term) => lowerTitle.includes(term)) ? 1.5 : 1;
      return [
        {
          country: ctx.country,
          date: date.toISOString(),
          source: metadata.id,
          signalType: "humanitarian_report",
          value: stressBoost,
          confidence: metadata.reliability,
          freshnessHours: hoursBetween(date, ctx.now),
          evidenceUrl: typeof fields.url === "string" ? fields.url : undefined,
          title,
          sourceEventId: item.id,
          termsNote: metadata.termsNote,
        },
      ];
    });
    return { metadata: withStatus(metadata, "ok"), signals };
  } catch (err) {
    return errorResult(metadata, err);
  }
}

export async function fetchGdacsSignals(ctx: SourceFetchContext): Promise<SourceFetchResult> {
  const enabled = (process.env.ESCALATION_ENABLE_GDACS ?? "true").toLowerCase() !== "false";
  const metadata: SourceMetadata = {
    id: "gdacs",
    label: "GDACS",
    enabled,
    configured: enabled,
    apiUrl: "https://www.gdacs.org/gdacsapi/api/Events/geteventlist/SEARCH",
    authEnvVars: [],
    refreshIntervalHours: 6,
    attribution: "Global Disaster Alert and Coordination System, GDACS",
    termsNote: "Acknowledge GDACS; data is provided as-is and should not be used for decisions without verification.",
    storagePolicy: "Store alert metadata, alert levels, dates, and source URLs only.",
    reliability: 0.62,
    freshnessHalfLifeHours: 24 * 5,
  };
  if (!enabled) return emptyResult(metadata, "ESCALATION_ENABLE_GDACS=false.");
  try {
    const params = new URLSearchParams({
      country: ctx.country,
      fromdate: isoDate(ctx.startDate),
      todate: isoDate(ctx.endDate),
      pagesize: "100",
    });
    const json = await fetchJson<unknown>(`${metadata.apiUrl}?${params.toString()}`);
    const list = Array.isArray(json)
      ? json
      : Array.isArray((json as { features?: unknown[] }).features)
        ? (json as { features: unknown[] }).features
        : [];
    const signals = list.flatMap((raw): EscalationSignal[] => {
      const event = raw as Record<string, unknown>;
      const props = ((event.properties as Record<string, unknown> | undefined) ?? event) as Record<string, unknown>;
      const date = parseDate(props.fromdate ?? props.todate ?? props.datetime ?? props.eventDate);
      if (!date) return [];
      const alertLevel = String(props.alertlevel ?? props.alertLevel ?? "").toLowerCase();
      const value = alertLevel === "red" ? 3 : alertLevel === "orange" ? 2 : 1;
      return [
        {
          country: ctx.country,
          date: date.toISOString(),
          source: metadata.id,
          signalType: "disaster_alert",
          value,
          confidence: metadata.reliability,
          freshnessHours: hoursBetween(date, ctx.now),
          evidenceUrl: typeof props.url === "string" ? props.url : undefined,
          title: typeof props.name === "string" ? props.name : undefined,
          sourceEventId: typeof props.eventid === "string" ? props.eventid : undefined,
          termsNote: metadata.termsNote,
        },
      ];
    });
    return { metadata: withStatus(metadata, "ok"), signals };
  } catch (err) {
    return errorResult(metadata, err);
  }
}

export async function fetchGoogleNewsRssSignals(
  ctx: SourceFetchContext
): Promise<SourceFetchResult> {
  const metadata: SourceMetadata = {
    id: "google_news_rss",
    label: "Google News RSS",
    enabled: true,
    configured: true,
    apiUrl: "https://news.google.com/rss/search",
    authEnvVars: [],
    refreshIntervalHours: 3,
    attribution: "Google News RSS (aggregated open headlines)",
    termsNote: "Use only metadata/headlines and source links. Respect original publisher terms.",
    storagePolicy: "Store headline metadata and URLs; do not store full article bodies.",
    reliability: 0.55,
    freshnessHalfLifeHours: 72,
  };
  try {
    const q = encodeURIComponent(
      `(missile OR strike OR drone OR bombardment OR artillery OR clashes OR protest OR riot) ${ctx.country}`
    );
    const rssUrl = `${metadata.apiUrl}?q=${q}&hl=en-US&gl=US&ceid=US:en`;
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
    let xml = "";
    try {
      const res = await fetch(rssUrl, {
        cache: "no-store",
        signal: ctl.signal,
        headers: { "User-Agent": "AEGIS-escalation-index-v2" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      xml = await res.text();
    } finally {
      clearTimeout(timer);
    }
    const itemBlocks = xml.split("<item>").slice(1, 220);
    const startMs = ctx.startDate.getTime();
    const endMs = ctx.endDate.getTime();
    const signals = itemBlocks.flatMap((block): EscalationSignal[] => {
      const title = extractXmlTag(block, "title");
      if (!title) return [];
      const description = extractXmlTag(block, "description") ?? "";
      const link = extractXmlTag(block, "link") ?? undefined;
      const pubDate = extractXmlTag(block, "pubDate");
      const date = parseDate(pubDate ?? undefined);
      if (!date) return [];
      if (date.getTime() < startMs || date.getTime() > endMs) return [];
      const text = `${title} ${description}`.toLowerCase();
      const conflictBoost =
        (text.includes("missile") ? 1 : 0) +
        (text.includes("drone") ? 1 : 0) +
        (text.includes("artillery") ? 1 : 0) +
        (text.includes("battle") ? 1 : 0) +
        (text.includes("clash") ? 1 : 0) +
        (text.includes("riot") ? 0.6 : 0) +
        (text.includes("protest") ? 0.4 : 0);
      const value = Math.max(1, conflictBoost);
      return [
        {
          country: ctx.country,
          date: date.toISOString(),
          source: metadata.id,
          signalType: "story_cluster",
          value,
          confidence: metadata.reliability,
          freshnessHours: hoursBetween(date, ctx.now),
          evidenceUrl: link,
          title,
          sourceEventId: link,
          termsNote: metadata.termsNote,
        },
      ];
    });
    return { metadata: withStatus(metadata, "ok"), signals };
  } catch (err) {
    return errorResult(metadata, err);
  }
}

export async function fetchCheapNewsProviderSignals(
  ctx: SourceFetchContext,
  baselineRssSignals: EscalationSignal[]
): Promise<SourceFetchResult> {
  const enabled =
    (process.env.ENABLE_CHEAP_NEWS_PROVIDER ?? "false").toLowerCase() === "true";
  const provider = (process.env.CHEAP_NEWS_PROVIDER ?? "currents").toLowerCase();
  const apiKey = process.env.CURRENTS_API_KEY?.trim();
  const minUniqueSignals = Math.max(
    1,
    Number(process.env.CHEAP_NEWS_MIN_UNIQUE_SIGNALS ?? 15) || 15
  );
  const metadata: SourceMetadata = {
    id: "cheap_news_provider",
    label: `Cheap news provider (${provider})`,
    enabled,
    configured: Boolean(apiKey),
    apiUrl: "https://api.currentsapi.services/v1/search",
    authEnvVars: ["ENABLE_CHEAP_NEWS_PROVIDER", "CHEAP_NEWS_PROVIDER", "CURRENTS_API_KEY"],
    refreshIntervalHours: 2,
    attribution: "Optional low-cost provider adapter",
    termsNote:
      "Disabled by default. Enable only if it adds unique timely signals beyond Google News RSS and existing sources.",
    storagePolicy: "Store metadata, URLs, and timestamps only.",
    reliability: 0.5,
    freshnessHalfLifeHours: 72,
  };
  if (!enabled) {
    return emptyResult(
      metadata,
      "ENABLE_CHEAP_NEWS_PROVIDER is false; optional adapter disabled by default."
    );
  }
  if (!apiKey) {
    return emptyResult(
      metadata,
      "CURRENTS_API_KEY is not set while ENABLE_CHEAP_NEWS_PROVIDER=true."
    );
  }
  try {
    const params = new URLSearchParams({
      keywords: `conflict OR strike OR battle OR protest ${ctx.country}`,
      language: "en",
      start_date: isoDate(ctx.startDate),
      end_date: isoDate(ctx.endDate),
      apiKey,
      limit: "100",
    });
    const json = await fetchJson<{ news?: Array<Record<string, unknown>> }>(
      `${metadata.apiUrl}?${params.toString()}`
    );
    const rssUrls = new Set(
      baselineRssSignals.map((signal) => (signal.evidenceUrl ?? "").trim()).filter(Boolean)
    );
    const uniqueSignals: EscalationSignal[] = [];
    for (const item of json.news ?? []) {
      const url = typeof item.url === "string" ? item.url.trim() : "";
      if (!url || rssUrls.has(url)) continue;
      const title = typeof item.title === "string" ? item.title : undefined;
      const date = parseDate(item.published ?? item.published_date ?? item.date);
      if (!date) continue;
      uniqueSignals.push({
        country: ctx.country,
        date: date.toISOString(),
        source: metadata.id,
        signalType: "story_cluster",
        value: 1.2,
        confidence: metadata.reliability,
        freshnessHours: hoursBetween(date, ctx.now),
        evidenceUrl: url,
        title,
        sourceEventId: url,
        termsNote: metadata.termsNote,
      });
    }
    if (uniqueSignals.length < minUniqueSignals) {
      return {
        metadata: withStatus(
          metadata,
          "skipped",
          `Value gate failed: only ${uniqueSignals.length} unique signals (< ${minUniqueSignals}) beyond RSS baseline.`
        ),
        signals: [],
      };
    }
    return { metadata: withStatus(metadata, "ok"), signals: uniqueSignals };
  } catch (err) {
    return errorResult(metadata, err);
  }
}

export async function fetchRealtimeEscalationSignals(
  ctx: SourceFetchContext
): Promise<SourceFetchResult[]> {
  const rssResult = await fetchGoogleNewsRssSignals(ctx);
  const otherResults = await Promise.all([
    fetchGdeltCloudSignals(ctx),
    fetchReliefWebSignals(ctx),
    fetchGdacsSignals(ctx),
    fetchCheapNewsProviderSignals(ctx, rssResult.signals),
  ]);
  return [...otherResults, rssResult];
}
