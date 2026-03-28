"use client";

import { useCountUp } from "@/hooks/useCountUp";

type WorldStabilityCompactProps = {
  percent: number;
  status: string;
  explanationShort: string;
  deltaLabel?: string | null;
  className?: string;
};

/** Shorter interpretation for compact card (parent passes truncated copy). */
export function WorldStabilityCompact({
  percent,
  status,
  explanationShort,
  deltaLabel,
  className = "",
}: WorldStabilityCompactProps) {
  const animated = useCountUp(percent, 700, true);
  return (
    <div className={`map-stability-compact ${className}`.trim()}>
      <div className="map-stability-compact-row">
        <div className="map-stability-compact-label">Global stability</div>
        <div className="map-stability-compact-score">
          <strong>{animated}%</strong>
          <span className="map-stability-compact-risk">risk</span>
        </div>
      </div>
      <div className="map-stability-compact-track" aria-hidden>
        <div className="map-stability-compact-fill" style={{ width: `${percent}%` }} />
      </div>
      <div className="map-stability-compact-meta">
        <span className="map-stability-compact-status">{status}</span>
        {deltaLabel ? <span className="map-stability-compact-delta">{deltaLabel}</span> : null}
      </div>
      <p className="map-stability-compact-line">{explanationShort}</p>
    </div>
  );
}
