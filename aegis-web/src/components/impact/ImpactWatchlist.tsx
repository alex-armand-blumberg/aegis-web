"use client";

import type { ExposureAlert, SourceFamily } from "@/lib/impact/types";

type Props = {
  alerts: ExposureAlert[];
  selectedAlertId: string | null;
  onSelect: (alertId: string) => void;
};

function familyLabel(family: SourceFamily): string {
  return family.replace(/_/g, " ");
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

export function ImpactWatchlist({ alerts, selectedAlertId, onSelect }: Props) {
  if (alerts.length === 0) {
    return (
      <div className="impact-empty">
        <p>No exposure alerts yet. Load assets and signals to build the watchlist.</p>
      </div>
    );
  }
  return (
    <ol className="impact-watchlist">
      {alerts.map((alert) => {
        const selected = alert.id === selectedAlertId;
        const families = topFamilies(alert);
        return (
          <li key={alert.id} className="impact-watchlist-item">
            <button
              type="button"
              className={`impact-alert-card${selected ? " is-selected" : ""}`}
              data-level={alert.level}
              onClick={() => onSelect(alert.id)}
            >
              <header className="impact-alert-card-head">
                <div className="impact-alert-card-title">
                  <span className="impact-alert-card-name">{alert.asset.name}</span>
                  <span className="impact-alert-card-meta">
                    {alert.asset.city ? `${alert.asset.city}, ` : ""}
                    {alert.asset.country}
                  </span>
                </div>
                <div className={`impact-score-chip impact-level-${alert.level}`}>
                  <span className="impact-score-value">{alert.score}</span>
                  <span className="impact-score-label">{alert.level}</span>
                </div>
              </header>
              <p className="impact-alert-card-headline">{alert.headline}</p>
              <footer className="impact-alert-card-foot">
                <span className={`impact-conf-chip impact-conf-${alert.confidence}`}>
                  {alert.confidence} confidence
                </span>
                <span className="impact-alert-card-evidence">
                  {alert.evidence.length} evidence cluster{alert.evidence.length === 1 ? "" : "s"}
                </span>
                {families.length > 0 ? (
                  <span className="impact-alert-card-families">
                    {families.map((f) => (
                      <span key={f} className="impact-family-chip">
                        {familyLabel(f)}
                      </span>
                    ))}
                  </span>
                ) : null}
              </footer>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
