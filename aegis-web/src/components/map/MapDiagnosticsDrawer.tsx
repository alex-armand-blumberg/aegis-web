"use client";

import type { ReactNode } from "react";

export type DiagnosticsTab = "health" | "coverage" | "diagnostics" | "limitations" | "analysis";

const TABS: { id: DiagnosticsTab; label: string }[] = [
  { id: "health", label: "Source health" },
  { id: "coverage", label: "Coverage" },
  { id: "diagnostics", label: "Diagnostics" },
  { id: "limitations", label: "Limitations" },
  { id: "analysis", label: "Analysis" },
];

type MapDiagnosticsDrawerProps = {
  snap: 0 | 1 | 2;
  onSnapChange: (s: 0 | 1 | 2) => void;
  tab: DiagnosticsTab;
  onTabChange: (t: DiagnosticsTab) => void;
  summaryLine: string;
  healthPanel: ReactNode;
  coveragePanel: ReactNode;
  diagnosticsPanel: ReactNode;
  limitationsPanel: ReactNode;
  analysisPanel: ReactNode;
};

export function MapDiagnosticsDrawer({
  snap,
  onSnapChange,
  tab,
  onTabChange,
  summaryLine,
  healthPanel,
  coveragePanel,
  diagnosticsPanel,
  limitationsPanel,
  analysisPanel,
}: MapDiagnosticsDrawerProps) {
  const panel =
    tab === "health"
      ? healthPanel
      : tab === "coverage"
        ? coveragePanel
        : tab === "diagnostics"
          ? diagnosticsPanel
          : tab === "limitations"
            ? limitationsPanel
            : analysisPanel;

  return (
    <div className={`map-diag-drawer map-diag-drawer-snap-${snap}`}>
      <button
        type="button"
        className="map-diag-drawer-bar"
        onClick={() => onSnapChange(snap === 0 ? 1 : 0)}
        aria-expanded={snap > 0}
      >
        <span className="map-diag-drawer-chevron">{snap === 0 ? "▲" : "▼"}</span>
        <span className="map-diag-drawer-summary">{summaryLine}</span>
        {snap === 0 ? (
          <span className="map-diag-drawer-hint">System & sources</span>
        ) : (
          <span className="map-diag-drawer-snap-actions">
            <button
              type="button"
              className="map-diag-snap-btn"
              onClick={(e) => {
                e.stopPropagation();
                onSnapChange(1);
              }}
            >
              Mid
            </button>
            <button
              type="button"
              className="map-diag-snap-btn"
              onClick={(e) => {
                e.stopPropagation();
                onSnapChange(2);
              }}
            >
              Full
            </button>
          </span>
        )}
      </button>
      {snap > 0 ? (
        <div className="map-diag-drawer-body">
          <div className="map-diag-tabs" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                className={`map-diag-tab ${tab === t.id ? "map-diag-tab-active" : ""}`}
                onClick={() => onTabChange(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="map-diag-panel">{panel}</div>
        </div>
      ) : null}
    </div>
  );
}
