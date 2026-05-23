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
  filter: FilterMode;
  onFilterChange: (value: FilterMode) => void;
  height?: number;
};

export type FilterMode = "all" | "critical" | "high" | "elevated" | "low";
type SortMode = "score" | "confidence" | "evidenceCount" | "assetName";
type SortDirection = "asc" | "desc";

const CONFIDENCE_RANK: Record<ConfidenceLevel, number> = {
  low: 0,
  medium: 1,
  high: 2,
};

function familyIcon(family: SourceFamily): string {
  if (family === "structured_conflict") return "✶";
  if (family === "maritime") return "⚓";
  if (family === "official") return "◈";
  if (family === "news") return "◌";
  if (family === "infrastructure") return "▦";
  if (family === "humanitarian") return "✚";
  if (family === "model_context") return "◌";
  return "•";
}

function topFamilies(alert: ExposureAlert, limit = 3): SourceFamily[] {
  const counts = new Map<SourceFamily, number>();
  for (const ev of alert.evidence) {
    for (const f of ev.sourceFamilies) counts.set(f, (counts.get(f) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([f]) => f);
}

function familyLabel(family: SourceFamily): string {
  const names: Record<SourceFamily, string> = {
    structured_conflict: "Structured conflict",
    news: "News reporting",
    official: "Official statements",
    humanitarian: "Humanitarian reporting",
    disaster: "Disaster signals",
    sanctions: "Sanctions and economic actions",
    maritime: "Maritime activity",
    aviation: "Aviation activity",
    infrastructure: "Infrastructure disruptions",
    market: "Market stress",
    model_context: "Model context",
    unknown: "Unknown source family",
  };
  return names[family] ?? family.replace(/_/g, " ");
}

function confidenceSortScore(alert: ExposureAlert): number {
  const evidence = alert.evidence;
  if (evidence.length === 0) return CONFIDENCE_RANK[alert.confidence] * 1000;

  const familyCount = new Set(evidence.flatMap((item) => item.sourceFamilies)).size;
  const avgReliability =
    evidence.reduce((sum, item) => sum + item.sourceReliability, 0) / evidence.length;
  const preciseGeoCount = evidence.filter(
    (item) => item.geoPrecision === "exact" || item.geoPrecision === "city"
  ).length;

  return (
    CONFIDENCE_RANK[alert.confidence] * 1000 +
    familyCount * 100 +
    avgReliability * 80 +
    Math.min(evidence.length, 12) * 5 +
    preciseGeoCount * 3
  );
}

export function ImpactWatchlist({
  alerts,
  selectedAlertId,
  onSelect,
  filter,
  onFilterChange,
  height,
}: Props) {
  const [sort, setSort] = useState<SortMode>("score");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const filteredSorted = useMemo(() => {
    const filtered = alerts.filter((a) => {
      if (filter === "critical") return a.level === "critical";
      if (filter === "high") return a.level === "high";
      if (filter === "elevated") return a.level === "elevated";
      if (filter === "low") return a.level === "low" || a.level === "guarded";
      return true;
    });
    const direction = sortDirection === "desc" ? -1 : 1;
    return filtered.slice().sort((a, b) => {
      if (sort === "confidence") {
        const byConfidence =
          (confidenceSortScore(a) - confidenceSortScore(b)) * direction;
        if (byConfidence !== 0) return byConfidence;
        return (a.score - b.score) * direction;
      }
      if (sort === "evidenceCount") {
        const byEvidence = (a.evidence.length - b.evidence.length) * direction;
        if (byEvidence !== 0) return byEvidence;
        return (a.score - b.score) * direction;
      }
      if (sort === "assetName") {
        const byName = a.asset.name.localeCompare(b.asset.name) * direction;
        if (byName !== 0) return byName;
        return (a.score - b.score) * -1;
      }
      const byScore = (a.score - b.score) * direction;
      if (byScore !== 0) return byScore;
      return a.asset.name.localeCompare(b.asset.name);
    });
  }, [alerts, filter, sort, sortDirection]);

  return (
    <div className="impact-watch" style={height ? { height: `${height}px`, maxHeight: `${height}px` } : undefined}>
      <header className="impact-watch-head">
        <div className="impact-watch-title">
          <span className="impact-eyebrow">Exposure Watchlist</span>
        </div>
        <div className="impact-watch-controls">
          <div className="impact-filter-chips" role="tablist" aria-label="Filter alerts">
            {(
              [
                { id: "all", label: "All" },
                { id: "critical", label: "Critical" },
                { id: "high", label: "High" },
                { id: "elevated", label: "Elevated" },
                { id: "low", label: "Low" },
              ] as Array<{ id: FilterMode; label: string }>
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                role="tab"
                aria-selected={filter === opt.id}
                className={`impact-filter-chip${filter === opt.id ? " is-active" : ""}`}
                onClick={() => onFilterChange(opt.id)}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <label className="impact-sort-label">
            <span>Sort by</span>
            <select
              value={sort}
              onChange={(e) => {
                const nextSort = e.target.value as SortMode;
                setSort(nextSort);
                if (nextSort === "assetName" && sortDirection !== "asc") {
                  setSortDirection("asc");
                }
              }}
              className="impact-sort-select"
            >
              <option value="score">Score</option>
              <option value="confidence">Confidence</option>
              <option value="evidenceCount">Most Evidence</option>
              <option value="assetName">Asset Name</option>
            </select>
            <button
              type="button"
              className="impact-sort-direction"
              aria-label={`Sort ${sortDirection === "desc" ? "descending" : "ascending"}`}
              onClick={() => setSortDirection((value) => (value === "desc" ? "asc" : "desc"))}
            >
              {sort === "score"
                ? "Score"
                : sort === "confidence"
                  ? "Confidence"
                  : sort === "evidenceCount"
                    ? "Evidence"
                    : "Name"}{" "}
              {sortDirection === "desc" ? "↓" : "↑"}
            </button>
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
        <div className="impact-watch-table">
          <div className="impact-watch-table-head">
            <span aria-hidden />
            <span>Rank</span>
            <span>Asset</span>
            <span>Location</span>
            <span>Score</span>
            <span>Top drivers</span>
          </div>
          <ol className="impact-watch-list">
            {filteredSorted.map((alert, idx) => {
              const selected = alert.id === selectedAlertId;
              const families = topFamilies(alert);
              const allFamilyCount = new Set(
                alert.evidence.flatMap((item) => item.sourceFamilies)
              ).size;
              const overflow = Math.max(0, allFamilyCount - families.length);
              return (
                <li key={alert.id} className="impact-watch-li">
                  <button
                    type="button"
                    className={`impact-watch-row impact-watch-row-select${selected ? " is-selected" : ""}`}
                    data-level={alert.level}
                    onClick={() => onSelect(alert.id)}
                  >
                    <span className="impact-watch-stripe" aria-hidden />
                    <span className="impact-watch-rank">{idx + 1}</span>
                    <span className="impact-watch-main">
                      <span className="impact-watch-name">{alert.asset.name}</span>
                    </span>
                    <span className="impact-watch-location">
                      {alert.asset.city ? `${alert.asset.city}, ` : ""}
                      {alert.asset.country}
                    </span>
                    <span className="impact-watch-meta">
                      <span className={`impact-score-chip impact-level-${alert.level}`}>
                        <span className="impact-score-value">{alert.score}</span>
                      </span>
                    </span>
                    <span className="impact-watch-drivers">
                      {families.length > 0 ? (
                        <span className="impact-watch-driver-icons">
                          {families.map((f) => (
                            <span
                              key={f}
                              className="impact-driver-icon"
                              data-label={familyLabel(f)}
                              aria-label={familyLabel(f)}
                              title={familyLabel(f)}
                            >
                              {familyIcon(f)}
                            </span>
                          ))}
                          {overflow > 0 ? (
                            <span className="impact-driver-overflow">+{overflow}</span>
                          ) : null}
                        </span>
                      ) : (
                        <span className="impact-watch-evidence">—</span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </div>
  );
}
