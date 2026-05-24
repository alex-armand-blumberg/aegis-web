import type { DbClient } from "./client";

const CREATE_IMPACT_EVENTS = `
CREATE TABLE IF NOT EXISTS impact_events (
  id             TEXT PRIMARY KEY,
  source         TEXT NOT NULL,
  layer          TEXT NOT NULL,
  title          TEXT NOT NULL,
  subtitle       TEXT,
  lat            DOUBLE PRECISION NOT NULL,
  lon            DOUBLE PRECISION NOT NULL,
  country        TEXT,
  severity       TEXT NOT NULL,
  timestamp_utc  TIMESTAMPTZ NOT NULL,
  magnitude      DOUBLE PRECISION,
  confidence     DOUBLE PRECISION,
  metadata       JSONB,
  ingested_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
)
`;

const CREATE_INGESTION_RUNS = `
CREATE TABLE IF NOT EXISTS impact_ingestion_runs (
  id            SERIAL PRIMARY KEY,
  source        TEXT NOT NULL,
  started_at    TIMESTAMPTZ NOT NULL,
  finished_at   TIMESTAMPTZ,
  status        TEXT NOT NULL,
  rows_upserted INTEGER,
  rows_failed   INTEGER,
  message       TEXT,
  version       TEXT
)
`;

/**
 * Idempotently creates the CP10 tables if they do not yet exist.
 * Safe to call on every ingest run — no-op when tables already present.
 *
 * Uses `.query()` (string form) because the DDL is a constant string,
 * not a tagged-template literal.
 */
export async function ensureSchema(db: DbClient): Promise<void> {
  await db.query(CREATE_IMPACT_EVENTS);
  await db.query(CREATE_INGESTION_RUNS);
}
