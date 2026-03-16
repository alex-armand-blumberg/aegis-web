"use client";

import type { CountrySummary } from "@/lib/mapUtils";

type CountryInfoPanelProps = {
  country: string;
  summary: CountrySummary;
  onClose: () => void;
};

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "4px 0",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <span style={{ color: "rgba(255,255,255,0.55)", fontSize: 11 }}>{label}</span>
      <strong style={{ color: "#e2e8f0", fontSize: 12 }}>{value.toLocaleString()}</strong>
    </div>
  );
}

export default function CountryInfoPanel({
  country,
  summary,
  onClose,
}: CountryInfoPanelProps) {
  return (
    <div className="intel-side-panel">
      <button type="button" className="intel-side-close" onClick={onClose}>
        x
      </button>
      <div className="intel-side-header">
        <div className="intel-side-kicker">COUNTRY SUMMARY</div>
        <h3>{country}</h3>
      </div>
      <div className="intel-side-metadata">
        <Row label="Total signals" value={summary.totalSignals} />
        <Row label="Conflict" value={summary.conflictSignals} />
        <Row label="Flights" value={summary.flightSignals} />
        <Row label="Vessels" value={summary.vesselSignals} />
        <Row label="News" value={summary.newsSignals} />
        <Row label="Hotspots" value={summary.hotspotSignals} />
        <Row label="Severity score" value={summary.severityScore} />
      </div>
    </div>
  );
}
