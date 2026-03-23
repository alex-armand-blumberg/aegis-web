"use client";

import { useEffect, useState } from "react";
import type { RegionIntelResponse, RegionMarketQuote } from "@/lib/intel/types";
import GaugeChart from "@/components/GaugeChart";

type RegionIntelPanelProps = {
  data: RegionIntelResponse;
  imageUrl: string | null;
  imageLoading: boolean;
  aiSummary: string;
  aiError?: string | null;
  aiLoading: boolean;
  markets: RegionMarketQuote[];
  marketsLoading: boolean;
  onClose: () => void;
};

export default function RegionIntelPanel({
  data,
  imageUrl,
  imageLoading,
  aiSummary,
  aiError,
  aiLoading,
  markets,
  marketsLoading,
  onClose,
}: RegionIntelPanelProps) {
  const [imageBroken, setImageBroken] = useState(false);

  useEffect(() => {
    setImageBroken(false);
  }, [imageUrl]);

  return (
    <aside className="intel-side-panel">
      <button type="button" className="intel-side-close" onClick={onClose}>
        x
      </button>

      {imageLoading && !imageUrl ? (
        <div className="intel-side-image-loading" />
      ) : imageUrl && !imageBroken ? (
        <div className="intel-side-image-wrap">
          <img
            src={imageUrl}
            alt=""
            className="intel-side-image"
            onError={() => setImageBroken(true)}
          />
        </div>
      ) : null}

      <div className="intel-side-header">
        <div className="intel-side-kicker">REGION INTELLIGENCE</div>
        <h3>{data.selection.name}</h3>
        <p>{data.range.toUpperCase()} operational picture</p>
      </div>

      <div className="intel-side-metadata">
        <div className="intel-side-subtitle">Risk gauges</div>
        <GaugeChart value={data.escalationIndex} label="Escalation Index" />
        <GaugeChart value={data.conflictIndex} label="Conflict Index" />
      </div>

      <div className="intel-side-metadata">
        <div className="intel-side-subtitle">Active signals</div>
        <div className="intel-side-item"><span>Live strikes</span><strong>{data.signals.liveStrikes}</strong></div>
        <div className="intel-side-item"><span>Conflicts</span><strong>{data.signals.conflicts}</strong></div>
        <div className="intel-side-item"><span>Flights</span><strong>{data.signals.militaryFlights}</strong></div>
        <div className="intel-side-item"><span>Vessels</span><strong>{data.signals.navalVessels}</strong></div>
        <div className="intel-side-item"><span>Carriers</span><strong>{data.signals.carrierSignals}</strong></div>
        <div className="intel-side-item"><span>Infrastructure</span><strong>{data.signals.infrastructure}</strong></div>
      </div>

      <div className="intel-side-metadata">
        <div className="intel-side-subtitle">AI geopolitical summary</div>
        {aiLoading ? (
          <div className="intel-side-item"><span>Generating...</span></div>
        ) : (
          <pre className="map-ai-answer" style={{ margin: 0, whiteSpace: "pre-wrap" }}>
            {aiSummary || `- Summary unavailable: ${aiError || "AI service unavailable."}`}
          </pre>
        )}
      </div>

      <div className="intel-side-metadata">
        <div className="intel-side-subtitle">Prediction markets (live)</div>
        {marketsLoading ? (
          <div className="intel-side-item"><span>Loading odds...</span></div>
        ) : markets.length > 0 ? (
          markets.map((m, idx) => (
            <div key={`${m.provider}-${m.title}-${idx}`} className="intel-side-item" style={{ alignItems: "flex-start" }}>
              <span>{m.provider}</span>
              <strong style={{ maxWidth: 180 }}>
                {m.title}
                <br />
                YES {m.yesChancePct}% / NO {m.noChancePct}%
              </strong>
            </div>
          ))
        ) : (
          <div className="intel-side-item"><span>No relevant market contracts found.</span></div>
        )}
      </div>

      <div className="intel-side-metadata">
        <div className="intel-side-subtitle">Mapped points in region</div>
        {data.dataPoints.slice(0, 24).map((p) => (
          <div key={p.id} className="intel-side-item" style={{ alignItems: "flex-start" }}>
            <span>{p.layer.toUpperCase()}</span>
            <strong style={{ maxWidth: 180 }}>{p.title}</strong>
          </div>
        ))}
      </div>
    </aside>
  );
}
