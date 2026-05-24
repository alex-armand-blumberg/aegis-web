"use client";

import type { ExposureAlert, UserAsset } from "@/lib/impact/types";
import { truncateText } from "./dashboardUtils";

type Props = {
  asset: UserAsset | null;
  alert: ExposureAlert | null;
  loading?: boolean;
};

function levelLabel(level: ExposureAlert["level"]): string {
  return level.charAt(0).toUpperCase() + level.slice(1);
}

export function RiskSummary({ asset, alert, loading }: Props) {
  if (loading) {
    return (
      <section className="iv-dash-risk iv-dash-risk-loading" aria-busy="true">
        <div className="iv-dash-skeleton iv-dash-skeleton-title" />
        <div className="iv-dash-skeleton iv-dash-skeleton-line" />
        <div className="iv-dash-skeleton iv-dash-skeleton-line short" />
      </section>
    );
  }

  if (!asset) {
    return (
      <section className="iv-dash-risk">
        <p className="iv-meta">No asset selected.</p>
      </section>
    );
  }

  const location = [asset.city, asset.country].filter(Boolean).join(", ");

  if (!alert) {
    return (
      <section className="iv-dash-risk">
        <div className="iv-dash-risk-header">
          <div>
            <h1 className="iv-dash-risk-title">{asset.name}</h1>
            {location ? <p className="iv-meta">{location}</p> : null}
          </div>
          <span className="iv-dash-level iv-dash-level-guarded">Pending</span>
        </div>
        <p className="iv-dash-risk-copy">Exposure assessment pending for this asset.</p>
      </section>
    );
  }

  return (
    <section className="iv-dash-risk">
      <div className="iv-dash-risk-header">
        <div>
          <h1 className="iv-dash-risk-title">{asset.name}</h1>
          {location ? <p className="iv-meta">{location}</p> : null}
        </div>
        <div className="iv-dash-score-block">
          <span className={`iv-dash-level iv-dash-level-${alert.level}`}>
            {levelLabel(alert.level)}
          </span>
          <span className="iv-dash-score">{Math.round(alert.score)}</span>
        </div>
      </div>
      <p className="iv-dash-risk-headline">{alert.headline}</p>
      <p className="iv-meta iv-dash-risk-why">
        {truncateText(alert.whyItMatters, 160)}
      </p>
      {alert.whatChanged ? (
        <p className="iv-meta iv-dash-risk-what-changed">
          What changed: {truncateText(alert.whatChanged, 120)}
        </p>
      ) : null}
      <p className="iv-meta iv-dash-confidence">
        Confidence: {alert.confidence.charAt(0).toUpperCase() + alert.confidence.slice(1)}
        {alert.uncertainty ? ` · ${truncateText(alert.uncertainty, 100)}` : ""}
      </p>
      {alert.watchNext && alert.watchNext.length > 0 ? (
        <ul className="iv-meta iv-dash-risk-watch-next">
          {alert.watchNext.slice(0, 3).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
