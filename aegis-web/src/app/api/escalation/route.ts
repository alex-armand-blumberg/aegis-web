import { after, NextRequest, NextResponse } from "next/server";
import {
  AcledMonthlyRecord,
  buildEscalationViewFromCanonical,
  computeEscalationIndex,
  computeForecastFromTail,
  EscalationForecastPoint,
  EscalationPoint,
} from "@/lib/escalation";
import {
  fetchAcledCountryMonthly,
  hasAcledEnv,
} from "@/lib/acled-api";
import {
  buildCacheKey,
  readTieredCache,
  writeTieredCache,
  type TieredCacheMeta,
} from "@/lib/cache/tieredCache";

export const maxDuration = 300;

const ACLED_ARCGIS_QUERY_URL =
  "https://services8.arcgis.com/xu983xJB6fIDCjpX/arcgis/rest/services/ACLED/FeatureServer/0/query";

const ACLED_FIELDS = [
  "country",
  "admin1",
  "event_month",
  "battles",
  "explosions_remote_violence",
  "protests",
  "riots",
  "strategic_developments",
  "violence_against_civilians",
  "violent_actors",
  "fatalities",
  "centroid_longitude",
  "centroid_latitude",
  "ObjectId",
] as const;

type AcledArcgisFeature = {
  attributes: {
    country: string;
    event_month: number;
    battles: number;
    explosions_remote_violence: number;
    protests: number;
    riots: number;
    strategic_developments: number;
    violence_against_civilians: number;
    violent_actors: number;
    fatalities: number;
  };
};

const ESCALATION_FAST_CACHE_ENABLED =
  (process.env.ENABLE_ESCALATION_FAST_CACHE ?? "true").toLowerCase() !== "false";
const ESCALATION_FAST_CACHE_FRESH_MS = Number(
  process.env.ESCALATION_FAST_CACHE_FRESH_MS ?? 24 * 60 * 60_000
);
const ESCALATION_FAST_CACHE_STALE_MS = Number(
  process.env.ESCALATION_FAST_CACHE_STALE_MS ?? 30 * 24 * 60 * 60_000
);

type CanonicalEscalationArtifact = {
  datasetVersion: string;
  generatedAt: string;
  dataSource: string;
  canonicalSeries: EscalationPoint[];
};

type EscalationResponsePayload = {
  series: ReturnType<typeof computeEscalationIndex>["series"];
  forecast: EscalationForecastPoint[];
  escalationThreshold: number;
  escalationFlaggedMonths: string[];
  preEscalationMonths: string[];
  dataSource: string;
  datasetVersion: string;
  generatedAt: string;
};

/** Default end date for ACLED research tier: one year ago. */
function getDefaultEndDate(): Date {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 1);
  return d;
}

function parseDateParam(value: string | null, fallback: Date): Date {
  if (!value) return fallback;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? fallback : d;
}

function datasetMonthVersion(date: Date): string {
  return date.toISOString().slice(0, 7);
}

async function fetchAcledViaArcGIS(
  countryFilter: string,
  onProgress?: (fetched: number) => void
): Promise<AcledMonthlyRecord[]> {
  const pageSize = 1000;
  let offset = 0;
  const rows: AcledMonthlyRecord[] = [];

  while (true) {
    const safeCountry = countryFilter.replace(/'/g, "''");
    const params = new URLSearchParams({
      where: `country='${safeCountry}'`,
      outFields: ACLED_FIELDS.join(","),
      returnGeometry: "false",
      orderByFields: "ObjectId ASC",
      resultOffset: String(offset),
      resultRecordCount: String(pageSize),
      f: "json",
    });

    const res = await fetch(`${ACLED_ARCGIS_QUERY_URL}?${params.toString()}`, {
      headers: { "User-Agent": "AEGIS-escalation-index" },
      cache: "no-store",
    });

    if (!res.ok) {
      throw new Error(`ACLED ArcGIS error ${res.status}: ${await res.text()}`);
    }

    const data = (await res.json()) as {
      features?: AcledArcgisFeature[];
      exceededTransferLimit?: boolean;
    };

    const features = data.features ?? [];
    if (!features.length) break;

    for (const f of features) {
      const a = f.attributes;
      if (!a.country || !a.event_month) continue;
      rows.push({
        country: a.country,
        event_month: new Date(a.event_month),
        battles: a.battles ?? 0,
        explosions_remote_violence: a.explosions_remote_violence ?? 0,
        protests: a.protests ?? 0,
        riots: a.riots ?? 0,
        strategic_developments: a.strategic_developments ?? 0,
        violence_against_civilians: a.violence_against_civilians ?? 0,
        violent_actors: a.violent_actors ?? 0,
        fatalities: a.fatalities ?? 0,
      });
    }

    onProgress?.(rows.length);

    if (!data.exceededTransferLimit) break;
    offset += pageSize;
  }

  return rows;
}

function filterSeriesByDateRange<T extends { event_month: string }>(
  items: T[],
  startDate: Date,
  endDate: Date
): T[] {
  const start = startDate.getTime();
  const end = endDate.getTime();
  return items.filter((item) => {
    const t = new Date(item.event_month).getTime();
    return t >= start && t <= end;
  });
}

function progressPct(fetched: number, total: number | null): number {
  if (total != null && total > 0) {
    return Math.min(90, (fetched / total) * 90);
  }
  // Sublinear curve: fast early progress, approaches 90% as fetched grows
  // At 5k: 18%, 50k: 69%, 100k: 82%, 200k: 90%
  const pct = 90 * (1 - 20_000 / (20_000 + fetched));
  return Math.min(90, pct);
}

async function buildCanonicalArtifact(
  country: string,
  datasetVersion: string,
  defaultEnd: Date,
  onProgress?: (fetched: number, total: number | null) => void
): Promise<CanonicalEscalationArtifact> {
  let allRows: AcledMonthlyRecord[];
  let dataSource: string;
  if (hasAcledEnv()) {
    try {
      const fullStart = new Date("2018-01-01");
      allRows = await fetchAcledCountryMonthly(country, fullStart, defaultEnd, onProgress);
      dataSource = "ACLED API (full history)";
    } catch (acledErr) {
      console.error("ACLED API failed, falling back to ArcGIS", acledErr);
      allRows = await fetchAcledViaArcGIS(country, (fetched) => {
        onProgress?.(fetched, null);
      });
      dataSource = "ACLED ArcGIS (fallback)";
    }
  } else {
    allRows = await fetchAcledViaArcGIS(country, (fetched) => {
      onProgress?.(fetched, null);
    });
    dataSource = "ACLED ArcGIS";
  }

  const result = computeEscalationIndex(allRows, country, 1, 45);
  if (!result.series.length) {
    throw new Error(`No data available for country '${country}'.`);
  }
  return {
    datasetVersion,
    generatedAt: new Date().toISOString(),
    dataSource,
    canonicalSeries: result.series,
  };
}

function buildResponsePayload(
  artifact: CanonicalEscalationArtifact,
  country: string,
  smoothWindow: number,
  threshold: number,
  startDate: Date,
  endDate: Date
): EscalationResponsePayload {
  const view = buildEscalationViewFromCanonical(
    artifact.canonicalSeries,
    smoothWindow,
    threshold
  );
  const filteredSeries = filterSeriesByDateRange(view.series, startDate, endDate);
  if (!filteredSeries.length) {
    throw new Error(`No data for ${country} in the selected date range. Try a wider range.`);
  }
  const filteredMonths = new Set(filteredSeries.map((s) => s.event_month.slice(0, 7)));
  return {
    series: filteredSeries,
    forecast: computeForecastFromTail(filteredSeries),
    escalationThreshold: view.escalationThreshold,
    escalationFlaggedMonths: view.escalationFlaggedMonths.filter((m) =>
      filteredMonths.has(m)
    ),
    preEscalationMonths: view.preEscalationMonths.filter((m) => filteredMonths.has(m)),
    dataSource: artifact.dataSource,
    datasetVersion: artifact.datasetVersion,
    generatedAt: artifact.generatedAt,
  };
}

export async function GET(req: NextRequest) {
  const startedAt = Date.now();
  const { searchParams } = new URL(req.url);
  const country = searchParams.get("country")?.trim();
  const smoothParam = searchParams.get("smooth");
  const thresholdParam = searchParams.get("threshold");
  const startParam = searchParams.get("start");
  const endParam = searchParams.get("end");
  const refreshMode = (searchParams.get("refresh") ?? "").toLowerCase();
  const instantMode = ["1", "true", "yes"].includes((searchParams.get("instant") ?? "").toLowerCase());

  if (!country) {
    return NextResponse.json(
      { error: "Missing 'country' query parameter." },
      { status: 400 }
    );
  }

  const smoothWindow = smoothParam ? Number(smoothParam) || 3 : 3;
  const threshold = thresholdParam ? Math.max(0, Math.min(100, Number(thresholdParam) || 45)) : 45;
  const defaultEnd = getDefaultEndDate();
  const startDate = parseDateParam(startParam, new Date("2018-01-01"));
  let endDate = parseDateParam(endParam, defaultEnd);
  if (endDate > defaultEnd) endDate = defaultEnd;

  const datasetVersion = datasetMonthVersion(defaultEnd);
  const canonicalCacheKey = buildCacheKey("escalation:canonical:v1", {
    country: country.toLowerCase(),
    datasetVersion,
    hasAcledEnv: hasAcledEnv(),
  });

  if (instantMode) {
    const cacheLookupStartedAt = Date.now();
    const cachedRead = ESCALATION_FAST_CACHE_ENABLED
      ? await readTieredCache<CanonicalEscalationArtifact>(
          canonicalCacheKey,
          ESCALATION_FAST_CACHE_FRESH_MS,
          ESCALATION_FAST_CACHE_STALE_MS
        )
      : null;
    if (cachedRead?.envelope) {
      const responsePayload = buildResponsePayload(
        cachedRead.envelope.value,
        country,
        smoothWindow,
        threshold,
        startDate,
        endDate
      );
      return NextResponse.json({
        ...responsePayload,
        cache: {
          status: cachedRead.meta.status,
          ageMs: cachedRead.meta.ageMs,
          source: cachedRead.meta.source,
          generatedAt: new Date(Date.now() - Math.max(0, cachedRead.meta.ageMs)).toISOString(),
        },
        perf: {
          totalMs: Date.now() - startedAt,
          cacheLookupMs: Date.now() - cacheLookupStartedAt,
          cacheStatus: cachedRead.meta.status,
          cacheSource: cachedRead.meta.source,
        },
      });
    }

    if (ESCALATION_FAST_CACHE_ENABLED) {
      after(async () => {
        try {
          const nextValue = await buildCanonicalArtifact(country, datasetVersion, defaultEnd);
          await writeTieredCache(
            canonicalCacheKey,
            nextValue,
            ESCALATION_FAST_CACHE_FRESH_MS,
            ESCALATION_FAST_CACHE_STALE_MS
          );
        } catch (err) {
          console.error("Escalation cache warm failed", err);
        }
      });
    }

    return NextResponse.json(
      {
        warming: true,
        error: "Escalation data is warming. Try again in a moment.",
        cache: {
          status: "miss",
          ageMs: 0,
          source: "none",
          generatedAt: new Date().toISOString(),
        },
        perf: {
          totalMs: Date.now() - startedAt,
          cacheLookupMs: Date.now() - cacheLookupStartedAt,
          cacheStatus: "miss",
          cacheSource: "none",
        },
      },
      { status: 202 }
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const push = (obj: object) => {
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      };

      try {
        push({ type: "progress", pct: 2, fetched: 0, total: undefined });
        const cacheLookupStartedAt = Date.now();
        const progress = (fetched: number, total: number | null) => {
          push({
            type: "progress",
            pct: progressPct(fetched, total),
            fetched,
            total: total ?? undefined,
          });
        };
        const forceRefresh = refreshMode === "1" || refreshMode === "true";
        const refreshWhenStale = refreshMode === "stale";
        const cachedRead = ESCALATION_FAST_CACHE_ENABLED
          ? await readTieredCache<CanonicalEscalationArtifact>(
              canonicalCacheKey,
              ESCALATION_FAST_CACHE_FRESH_MS,
              ESCALATION_FAST_CACHE_STALE_MS
            )
          : null;
        let cached: { value: CanonicalEscalationArtifact; meta: TieredCacheMeta };

        if (
          ESCALATION_FAST_CACHE_ENABLED &&
          cachedRead?.envelope &&
          cachedRead.meta.status === "fresh" &&
          !forceRefresh
        ) {
          cached = { value: cachedRead.envelope.value, meta: cachedRead.meta };
        } else if (
          ESCALATION_FAST_CACHE_ENABLED &&
          cachedRead?.envelope &&
          cachedRead.meta.status === "stale" &&
          !forceRefresh &&
          !refreshWhenStale
        ) {
          cached = { value: cachedRead.envelope.value, meta: cachedRead.meta };
          void buildCanonicalArtifact(country, datasetVersion, defaultEnd)
            .then((nextValue) =>
              writeTieredCache(
                canonicalCacheKey,
                nextValue,
                ESCALATION_FAST_CACHE_FRESH_MS,
                ESCALATION_FAST_CACHE_STALE_MS
              )
            )
            .catch(() => undefined);
        } else {
          try {
            const value = await buildCanonicalArtifact(country, datasetVersion, defaultEnd, progress);
            if (ESCALATION_FAST_CACHE_ENABLED) {
              await writeTieredCache(
                canonicalCacheKey,
                value,
                ESCALATION_FAST_CACHE_FRESH_MS,
                ESCALATION_FAST_CACHE_STALE_MS
              );
            }
            cached = {
              value,
              meta: {
                status: "fresh",
                ageMs: 0,
                source: ESCALATION_FAST_CACHE_ENABLED ? "memory" : "none",
                key: canonicalCacheKey,
              },
            };
          } catch (err) {
            if (cachedRead?.envelope) {
              cached = { value: cachedRead.envelope.value, meta: cachedRead.meta };
            } else {
              throw err;
            }
          }
        }
        const cacheLookupMs = Date.now() - cacheLookupStartedAt;

        const responsePayload = buildResponsePayload(
          cached.value,
          country,
          smoothWindow,
          threshold,
          startDate,
          endDate
        );

        push({
          type: "progress",
          pct: 100,
          fetched: responsePayload.series.length,
          total: responsePayload.series.length,
        });
        push({
          type: "result",
          ...responsePayload,
          cache: {
            status: cached.meta.status,
            ageMs: cached.meta.ageMs,
            source: cached.meta.source,
            generatedAt: new Date(Date.now() - Math.max(0, cached.meta.ageMs)).toISOString(),
          },
          perf: {
            totalMs: Date.now() - startedAt,
            cacheLookupMs,
            cacheStatus: cached.meta.status,
            cacheSource: cached.meta.source,
          },
        });
        controller.close();
      } catch (err) {
        console.error("Escalation API error", err);
        push({
          type: "error",
          error: err instanceof Error && err.message
            ? err.message
            : "Failed to compute escalation index. The ACLED service may be unavailable or slow.",
        });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Server-Timing": `total;dur=${Date.now() - startedAt}`,
    },
  });
}
