import { NextResponse } from "next/server";
import { getDb, isDbConfigured } from "@/db/client";

export type DbStatusResponse = {
  configured: boolean;
  ucdpTokenConfigured: boolean;
  latestRun: {
    id: number;
    status: string;
    rowsUpserted: number | null;
    rowsFailed: number | null;
    finishedAt: string | null;
    version: string | null;
    message: string | null;
  } | null;
  rowCount: number | null;
  sample: {
    id: string;
    title: string;
    country: string | null;
    severity: string;
    timestampUtc: string;
  } | null;
};

export async function GET(): Promise<Response> {
  const configured = isDbConfigured();
  const ucdpTokenConfigured = Boolean(process.env.UCDP_ACCESS_TOKEN?.trim());

  if (!configured) {
    return NextResponse.json(
      {
        configured: false,
        ucdpTokenConfigured,
        latestRun: null,
        rowCount: null,
        sample: null,
      } satisfies DbStatusResponse,
      { status: 200 }
    );
  }

  const db = getDb();
  if (!db) {
    return NextResponse.json(
      {
        configured: false,
        ucdpTokenConfigured,
        latestRun: null,
        rowCount: null,
        sample: null,
      } satisfies DbStatusResponse,
      { status: 200 }
    );
  }

  try {
    const [runRows, countRows, sampleRows] = await Promise.all([
      db`
        SELECT id, status, rows_upserted, rows_failed, finished_at, version, message
        FROM impact_ingestion_runs
        WHERE source = 'UCDP'
        ORDER BY started_at DESC
        LIMIT 1
      `,
      db`SELECT COUNT(*)::int AS count FROM impact_events WHERE source = 'UCDP'`,
      db`
        SELECT id, title, country, severity, timestamp_utc
        FROM impact_events
        WHERE source = 'UCDP'
        ORDER BY ingested_at DESC
        LIMIT 1
      `,
    ]);

    const run = (runRows as unknown[])[0] as
      | {
          id: number;
          status: string;
          rows_upserted: number | null;
          rows_failed: number | null;
          finished_at: string | null;
          version: string | null;
          message: string | null;
        }
      | undefined;

    const sample = (sampleRows as unknown[])[0] as
      | {
          id: string;
          title: string;
          country: string | null;
          severity: string;
          timestamp_utc: string;
        }
      | undefined;

    const rowCount =
      ((countRows as unknown[])[0] as { count: number } | undefined)?.count ?? 0;

    return NextResponse.json(
      {
        configured: true,
        ucdpTokenConfigured,
        latestRun: run
          ? {
              id: run.id,
              status: run.status,
              rowsUpserted: run.rows_upserted,
              rowsFailed: run.rows_failed,
              finishedAt: run.finished_at,
              version: run.version,
              message: run.message,
            }
          : null,
        rowCount,
        sample: sample
          ? {
              id: sample.id,
              title: sample.title,
              country: sample.country,
              severity: sample.severity,
              timestampUtc: sample.timestamp_utc,
            }
          : null,
      } satisfies DbStatusResponse,
      { status: 200 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "DB query failed.";
    return NextResponse.json(
      { configured: true, ucdpTokenConfigured, error: message },
      { status: 500 }
    );
  }
}
