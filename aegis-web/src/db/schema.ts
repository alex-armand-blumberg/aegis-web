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

const CREATE_ACLED_ADMIN_WEEKLY = `
CREATE TABLE IF NOT EXISTS impact_acled_admin_weekly (
  id                TEXT PRIMARY KEY,
  week              DATE NOT NULL,
  region            TEXT,
  country           TEXT NOT NULL,
  admin1            TEXT NOT NULL,
  event_type        TEXT NOT NULL,
  sub_event_type    TEXT,
  events            INTEGER,
  fatalities        INTEGER,
  population_exposed INTEGER,
  disorder_type     TEXT,
  acled_id          TEXT,
  centroid_lat      DOUBLE PRECISION,
  centroid_lon      DOUBLE PRECISION,
  ingested_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
)
`;

/**
 * Idempotently creates all Impact schema tables if they do not yet exist.
 * Safe to call on every ingest run — no-op when tables already present.
 *
 * Uses `.query()` (string form) because DDL is a constant string,
 * not a tagged-template literal.
 *
 * Tables:
 *   impact_events            — UCDP event-level ingest (daily cron)
 *   impact_ingestion_runs    — ingest job audit log
 *   impact_acled_admin_weekly — ACLED Admin1 aggregate baseline (manual upload; no auto-ingest)
 */
export async function ensureSchema(db: DbClient): Promise<void> {
  await db.query(CREATE_IMPACT_EVENTS);
  await db.query(CREATE_INGESTION_RUNS);
  await db.query(CREATE_ACLED_ADMIN_WEEKLY);
}
