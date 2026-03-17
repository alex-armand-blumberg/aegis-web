"use client";

import type { CountryIntelResponse } from "@/lib/intel/types";

type CountryIntelPanelProps = {
  data: CountryIntelResponse;
  onClose: () => void;
};

function severityColor(level: string): string {
  if (level === "critical") return "#ef4444";
  if (level === "elevated") return "#f59e0b";
  return "#22c55e";
}

export default function CountryIntelPanel({ data, onClose }: CountryIntelPanelProps) {
  return (
    <aside className="intel-side-panel">
      <button type="button" className="intel-side-close" onClick={onClose}>
        x
      </button>
      <div className="intel-side-header">
        <div className="intel-side-kicker">COUNTRY INTELLIGENCE</div>
        <h3>{data.country}</h3>
        <p>{data.range.toUpperCase()} operational picture</p>
      </div>

      <div className="intel-side-grid">
        <div className="intel-side-item">
          <span>Instability Index</span>
          <strong style={{ color: severityColor(data.status) }}>
            {data.instabilityIndex}/100
          </strong>
        </div>
        <div className="intel-side-item">
          <span>Status</span>
          <strong style={{ color: severityColor(data.status) }}>{data.status.toUpperCase()}</strong>
        </div>
      </div>

      <div className="intel-side-metadata">
        <div className="intel-side-subtitle">Active signals</div>
        <div className="intel-side-item">
          <span>Live strikes</span>
          <strong>{data.signals.liveStrikes}</strong>
        </div>
        <div className="intel-side-item">
          <span>Armed conflict events</span>
          <strong>{data.signals.conflicts}</strong>
        </div>
        <div className="intel-side-item">
          <span>Military flights</span>
          <strong>{data.signals.militaryFlights}</strong>
        </div>
        <div className="intel-side-item">
          <span>Naval vessels</span>
          <strong>{data.signals.navalVessels}</strong>
        </div>
        <div className="intel-side-item">
          <span>Carrier signals</span>
          <strong>{data.signals.carrierSignals}</strong>
        </div>
        <div className="intel-side-item">
          <span>Critical news</span>
          <strong>{data.signals.criticalNews}</strong>
        </div>
      </div>

      <div className="intel-side-metadata">
        <div className="intel-side-subtitle">7-day timeline</div>
        {data.timeline.map((t) => (
          <div key={t.day} className="intel-side-item">
            <span>{t.day}</span>
            <strong>
              S:{t.liveStrikes} C:{t.conflicts} M:{t.military}
            </strong>
          </div>
        ))}
      </div>

      <div className="intel-side-metadata">
        <div className="intel-side-subtitle">Top news</div>
        {data.topNews.slice(0, 6).map((n, i) => (
          <div key={`${n.title}-${i}`} className="intel-side-item" style={{ alignItems: "flex-start" }}>
            <span>{n.source}</span>
            <strong style={{ maxWidth: 180 }}>{n.title}</strong>
          </div>
        ))}
      </div>

      <div className="intel-side-metadata">
        <div className="intel-side-subtitle">Military activity</div>
        <div className="intel-side-item">
          <span>Own flights</span>
          <strong>{data.militaryActivity.ownFlights}</strong>
        </div>
        <div className="intel-side-item">
          <span>Naval vessels</span>
          <strong>{data.militaryActivity.navalVessels}</strong>
        </div>
        <div className="intel-side-item">
          <span>Foreign presence</span>
          <strong>{data.militaryActivity.foreignPresence.toUpperCase()}</strong>
        </div>
      </div>

      <div className="intel-side-metadata">
        <div className="intel-side-subtitle">Infrastructure exposure</div>
        <div className="intel-side-item">
          <span>Nearby critical</span>
          <strong>{data.infrastructureExposure.nearbyCritical}</strong>
        </div>
      </div>
    </aside>
  );
}
