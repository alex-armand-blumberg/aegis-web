"use client";

import { useEffect, useState } from "react";
import type { DbStatusResponse } from "@/app/api/impact/db-status/route";

type FetchState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "ok"; data: DbStatusResponse }
  | { phase: "error"; message: string };

export function NeonStatus() {
  const [state, setState] = useState<FetchState>({ phase: "idle" });

  useEffect(() => {
    setState({ phase: "loading" });
    fetch("/api/impact/db-status", { cache: "no-store" })
      .then(async (res) => {
        const data = (await res.json()) as DbStatusResponse;
        setState({ phase: "ok", data });
      })
      .catch((err: unknown) => {
        const message =
          err instanceof Error ? err.message : "Failed to load DB status.";
        setState({ phase: "error", message });
      });
  }, []);

  return (
    <details className="iv-neon-status">
      <summary className="iv-neon-status-summary">
        <span className="iv-neon-status-label">Database pilot (Neon / Postgres)</span>
        {state.phase === "ok" ? (
          <span
            className={`iv-neon-status-dot ${state.data.configured ? "iv-neon-status-dot-ok" : "iv-neon-status-dot-off"}`}
            aria-hidden
          />
        ) : null}
      </summary>

      <div className="iv-neon-status-body">
        {state.phase === "loading" ? (
          <p className="iv-meta">Checking database status…</p>
        ) : state.phase === "error" ? (
          <p className="iv-meta iv-neon-status-err">Could not load DB status: {state.message}</p>
        ) : state.phase === "ok" ? (
          <NeonStatusContent data={state.data} />
        ) : null}
      </div>
    </details>
  );
}

function NeonStatusContent({ data }: { data: DbStatusResponse }) {
  return (
    <dl className="iv-neon-status-dl">
      <div className="iv-neon-status-row">
        <dt>Neon DATABASE_URL</dt>
        <dd>{data.configured ? "Configured" : "Not configured"}</dd>
      </div>
      <div className="iv-neon-status-row">
        <dt>UCDP_ACCESS_TOKEN</dt>
        <dd>{data.ucdpTokenConfigured ? "Configured" : "Not configured — ingestion will be skipped"}</dd>
      </div>

      {data.configured && (
        <>
          <div className="iv-neon-status-row">
            <dt>UCDP rows stored</dt>
            <dd>{data.rowCount !== null ? data.rowCount.toLocaleString() : "—"}</dd>
          </div>

          <div className="iv-neon-status-row">
            <dt>Latest ingest</dt>
            <dd>
              {data.latestRun ? (
                <>
                  <span
                    className={`iv-neon-run-status iv-neon-run-status-${data.latestRun.status}`}
                  >
                    {data.latestRun.status}
                  </span>
                  {data.latestRun.rowsUpserted !== null
                    ? ` · ${data.latestRun.rowsUpserted.toLocaleString()} rows`
                    : ""}
                  {data.latestRun.version ? ` · v${data.latestRun.version}` : ""}
                  {data.latestRun.finishedAt
                    ? ` · ${new Date(data.latestRun.finishedAt).toLocaleString([], {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}`
                    : ""}
                </>
              ) : (
                "No ingest run recorded yet. Trigger /api/internal/impact/ingest?source=ucdp."
              )}
            </dd>
          </div>

          {data.sample ? (
            <div className="iv-neon-status-row">
              <dt>Sample event</dt>
              <dd className="iv-neon-status-sample">
                <span className={`iv-severity-dot iv-severity-dot-${data.sample.severity}`} aria-hidden />
                {data.sample.title}
                {data.sample.country ? ` · ${data.sample.country}` : ""}
                <span className="iv-meta">
                  {" · "}
                  {new Date(data.sample.timestampUtc).toLocaleDateString([], {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              </dd>
            </div>
          ) : null}
        </>
      )}
    </dl>
  );
}
