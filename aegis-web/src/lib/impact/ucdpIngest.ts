import type { DbClient } from "@/db/client";
import { ensureSchema } from "@/db/schema";

// ── UCDP raw event shape (from the GED API) ────────────────────────────────────

type UcdpRawEvent = {
  id?: string | number;
  date_start?: string;
  latitude?: number | string;
  longitude?: number | string;
  country?: string;
  side_a?: string;
  side_b?: string;
  best?: number | string;
  low?: number | string;
  high?: number | string;
  type_of_violence?: number | string;
  source_original?: string;
};

// ── Normalized DB event shape (columns of impact_events) ─────────────────────

export type ImpactDbEvent = {
  id: string;
  source: string;
  layer: string;
  title: string;
  subtitle: string | null;
  lat: number;
  lon: number;
  country: string | null;
  severity: string;
  timestamp_utc: string;
  magnitude: number | null;
  confidence: number;
  metadata: Record<string, string | number | boolean | null>;
};

// ── Ingestion result ──────────────────────────────────────────────────────────

export type UcdpIngestResult = {
  status: "ok" | "error" | "skipped";
  rowsUpserted: number;
  rowsFailed: number;
  version: string | null;
  message: string;
};

// ── Version probe ─────────────────────────────────────────────────────────────

function buildVersionCandidates(): string[] {
  const year = new Date().getUTCFullYear() - 2000;
  return Array.from(new Set([`${year}.1`, `${year - 1}.1`, "25.1", "24.1"]));
}

// ── Severity mapping ──────────────────────────────────────────────────────────

function mapSeverity(norm: number): string {
  if (norm >= 0.75) return "critical";
  if (norm >= 0.45) return "high";
  if (norm >= 0.2) return "medium";
  return "low";
}

// ── Fetch and normalize ───────────────────────────────────────────────────────

async function fetchAndNormalize(token: string): Promise<{
  events: ImpactDbEvent[];
  version: string;
}> {
  const versions = buildVersionCandidates();
  let rawEvents: UcdpRawEvent[] = [];
  let selectedVersion = "";

  for (const version of versions) {
    const headers: Record<string, string> = {
      Accept: "application/json",
      "x-ucdp-access-token": token,
    };
    try {
      const res = await fetch(
        `https://ucdpapi.pcr.uu.se/api/gedevents/${version}?pagesize=1200&page=0`,
        { headers, signal: AbortSignal.timeout(20_000) }
      );
      if (!res.ok) continue;
      const data = (await res.json()) as { Result?: UcdpRawEvent[] };
      if (data?.Result?.length) {
        rawEvents = data.Result;
        selectedVersion = version;
        break;
      }
    } catch {
      // Try next version
    }
  }

  if (!rawEvents.length) {
    throw new Error(
      `UCDP returned no events for tested versions [${versions.join(", ")}]`
    );
  }

  const events: ImpactDbEvent[] = [];
  for (const raw of rawEvents) {
    const lat = Number(raw.latitude);
    const lon = Number(raw.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const ts = Date.parse(String(raw.date_start ?? ""));
    if (!Number.isFinite(ts)) continue;

    const deathsBest = Number(raw.best) || 0;
    const deathsHigh = Number(raw.high) || deathsBest;
    const deathsLow = Number(raw.low) || deathsBest;
    const norm = Math.min(1, Math.max(0.05, deathsBest / 80));
    const country = String(raw.country ?? "").trim() || null;
    const sideA = String(raw.side_a ?? "").trim();
    const sideB = String(raw.side_b ?? "").trim();

    events.push({
      id: `ucdp-${raw.id ?? `${lat}-${lon}-${ts}`}`,
      source: "UCDP",
      layer: "conflicts",
      title: country ?? "Conflict event",
      subtitle: sideA && sideB ? `${sideA} vs ${sideB}` : null,
      lat,
      lon,
      country,
      severity: mapSeverity(norm),
      timestamp_utc: new Date(ts).toISOString(),
      magnitude: deathsBest > 0 ? deathsBest : null,
      confidence: 0.82,
      metadata: {
        deaths_best: deathsBest,
        deaths_low: deathsLow,
        deaths_high: deathsHigh,
        violence_type: String(raw.type_of_violence ?? ""),
      },
    });
  }

  return { events: events.slice(0, 1400), version: selectedVersion };
}

// ── Upsert batch ──────────────────────────────────────────────────────────────

async function upsertEvents(
  db: DbClient,
  events: ImpactDbEvent[]
): Promise<{ upserted: number; failed: number }> {
  let upserted = 0;
  let failed = 0;

  for (const ev of events) {
    try {
      await db`
        INSERT INTO impact_events
          (id, source, layer, title, subtitle, lat, lon, country, severity,
           timestamp_utc, magnitude, confidence, metadata, ingested_at)
        VALUES
          (${ev.id}, ${ev.source}, ${ev.layer}, ${ev.title}, ${ev.subtitle},
           ${ev.lat}, ${ev.lon}, ${ev.country}, ${ev.severity},
           ${ev.timestamp_utc}, ${ev.magnitude}, ${ev.confidence},
           ${JSON.stringify(ev.metadata)}, NOW())
        ON CONFLICT (id) DO UPDATE SET
          ingested_at = NOW(),
          metadata    = EXCLUDED.metadata
      `;
      upserted++;
    } catch {
      failed++;
    }
  }

  return { upserted, failed };
}

// ── Ingestion run helpers ─────────────────────────────────────────────────────

async function startRun(db: DbClient, source: string): Promise<number> {
  const rows = await db`
    INSERT INTO impact_ingestion_runs (source, started_at, status)
    VALUES (${source}, NOW(), 'running')
    RETURNING id
  `;
  return ((rows as unknown[])[0] as { id: number }).id;
}

async function finishRun(
  db: DbClient,
  runId: number,
  result: Pick<UcdpIngestResult, "status" | "rowsUpserted" | "rowsFailed" | "version" | "message">
): Promise<void> {
  await db`
    UPDATE impact_ingestion_runs
    SET
      finished_at   = NOW(),
      status        = ${result.status},
      rows_upserted = ${result.rowsUpserted},
      rows_failed   = ${result.rowsFailed},
      version       = ${result.version},
      message       = ${result.message}
    WHERE id = ${runId}
  `;
}

// ── Main public entry point ────────────────────────────────────────────────────

/**
 * Fetch UCDP events and persist them into the impact_events table.
 *
 * Guards:
 * - Returns "skipped" when UCDP_ACCESS_TOKEN is not set (CP10 constraint: no anonymous fetches).
 * - All DB errors are caught; returns "error" with message on failure.
 */
export async function runUcdpIngest(db: DbClient): Promise<UcdpIngestResult> {
  const token = process.env.UCDP_ACCESS_TOKEN?.trim();
  if (!token) {
    return {
      status: "skipped",
      rowsUpserted: 0,
      rowsFailed: 0,
      version: null,
      message:
        "UCDP_ACCESS_TOKEN is not configured. Set it to enable UCDP ingestion.",
    };
  }

  await ensureSchema(db);

  const runId = await startRun(db, "UCDP");
  let result: UcdpIngestResult;

  try {
    const { events, version } = await fetchAndNormalize(token);
    const { upserted, failed } = await upsertEvents(db, events);
    result = {
      status: "ok",
      rowsUpserted: upserted,
      rowsFailed: failed,
      version,
      message: `Fetched ${events.length} UCDP events (v${version}); upserted ${upserted}, failed ${failed}.`,
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown error during UCDP ingest.";
    result = {
      status: "error",
      rowsUpserted: 0,
      rowsFailed: 0,
      version: null,
      message,
    };
  }

  try {
    await finishRun(db, runId, result);
  } catch {
    // Don't mask the ingest result if run recording fails
  }

  return result;
}
