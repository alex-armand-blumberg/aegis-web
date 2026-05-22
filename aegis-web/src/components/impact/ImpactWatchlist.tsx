"use client";

import { useMemo, useState } from "react";
import type {
  ConfidenceLevel,
  ExposureAlert,
  ExposureLevel,
  SourceFamily,
} from "@/lib/impact/types";

type Props = {
  alerts: ExposureAlert[];
  selectedAlertId: string | null;
  onSelect: (alertId: string) => void;
};

type FilterMode = "all" | "elevated" | "high";
type SortMode = "score" | "confidence";

const LEVEL_RANK: Record<ExposureLevel, number> = {
  low: 0,
  guarded: 1,
  elevated: 2,
  high: 3,
  critical: 4,
};

const CONFIDENCE_RANK: Record<ConfidenceLevel, number> = {
  low: 0,
  medium: 1,
  high: 2,
};

function familyLabel(family: SourceFamily): string {
  return family.replace(/_/g, " ");
}

function topFamilies(alert: ExposureAlert, limit = 2): SourceFamily[] {
  const counts = new Map<SourceFamily, number>();
  for (const ev of alert.evidence) {
    for (const f of ev.sourceFamilies) counts.set(f, (counts.get(f) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([f]) => f);
}

export function ImpactWatchlist({ alerts, selectedAlertId, onSelect }: Props) {
  const [filter, setFilter] = useState<FilterMode>("all");
  const [sort, setSort] = useState<SortMode>("score");

  const filteredSorted = useMemo(() => {
    const filtered = alerts.filter((a) => {
      if (filter === "elevated") return LEVEL_RANK[a.level] >= LEVEL_RANK.elevated;
      if (filter === "high") return LEVEL_RANK[a.level] >= LEVEL_RANK.high;
      return true;
    });
    if (sort === "confidence") {
      return filtered
        .slice()
        .sort(
          (a, b) =>
            CONFIDENCE_RANK[b.confidence] - CONFIDENCE_RANK[a.confidence] || b.score - a.score
        );
    }
    return filtered.slice().sort((a, b) => b.score - a.score);
  }, [alerts, filter, sort]);

  return (
    <div className="impact-watch">
      <header className="impact-watch-head">
        <div className="impact-watch-title">
          <span className="impact-eyebrow">Exposure Watchlist</span>
          <p className="impact-watch-sub">Ranked by source-backed signal pressure</p>
        </div>
        <div className="impact-watch-controls">
          <div className="impact-filter-chips" role="tablist" aria-label="Filter alerts">
            {(
              [
                { id: "all", label: "All" },
                { id: "elevated", label: "Elevated+" },
                { id: "high", label: "High+" },
              ] as Array<{ id: FilterMode; label: string }>
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                role="tab"
                aria-selected={filter === opt.id}
                className={`impact-filter-chip${filter === opt.id ? " is-active" : ""}`}
                onClick={() => setFilter(opt.id)}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <label className="impact-sort-label">
            <span>Sort</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortMode)}
              className="impact-sort-select"
            >
              <option value="score">Score</option>
              <option value="confidence">Confidence</option>
            </select>
          </label>
        </div>
      </header>

      {alerts.length === 0 ? (
        <div className="impact-watch-empty">
          <p>No assets loaded.</p>
          <p className="impact-watch-empty-sub">
            Load the demo portfolio or upload a CSV to generate exposure alerts.
          </p>
        </div>
      ) : filteredSorted.length === 0 ? (
        <div className="impact-watch-empty">
          <p>No alerts match the current filter.</p>
        </div>
      ) : (
        <ol className="impact-watch-list">
          {filteredSorted.map((alert, idx) => {
            const selected = alert.id === selectedAlertId;
            const families = topFamilies(alert);
            return (
              <li key={alert.id} className="impact-watch-li">
                <button
                  type="button"
                  className={`impact-watch-row${selected ? " is-selected" : ""}`}
                  data-level={alert.level}
                  onClick={() => onSelect(alert.id)}
                >
                  <span className="impact-watch-stripe" aria-hidden />
                  <span className="impact-watch-rank">{idx + 1}</span>
                  <span className="impact-watch-main">
                    <span className="impact-watch-name">
                      {alert.asset.name}
                      <span className="impact-watch-loc">
                        {alert.asset.city ? ` · ${alert.asset.city}, ` : " · "}
                        {alert.asset.country}
                      </span>
                    </span>
                    <span className="impact-watch-headline">{alert.headline}</span>
                  </span>
                  <span className="impact-watch-meta">
                    <span className={`impact-score-chip impact-level-${alert.level}`}>
                      <span className="impact-score-value">{alert.score}</span>
                      <span className="impact-score-label">{alert.level}</span>
                    </span>
                    <span className={`impact-conf-chip impact-conf-${alert.confidence}`}>
                      {alert.confidence}
                    </span>
                    <span className="impact-watch-evidence">
                      {alert.evidence.length} clue{alert.evidence.length === 1 ? "" : "s"}
                    </span>
                    {families.length > 0 ? (
                      <span className="impact-watch-families">
                        {families.map((f) => (
                          <span key={f} className="impact-family-chip">
                            {familyLabel(f)}
                          </span>
                        ))}
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
