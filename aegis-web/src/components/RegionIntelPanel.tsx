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

function formatRangeLabel(range: string): string {
  if (range === "1h") return "1 hour";
  if (range === "6h") return "6 hours";
  if (range === "24h") return "24 hours";
  if (range === "7d") return "7 days";
  if (range === "30d") return "30 days";
  return range;
}

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
  const conflictSubtypeCounts = data.dataPoints.reduce(
    (acc, p) => {
      if (p.layer === "conflictsBattles") acc.battles += 1;
      if (p.layer === "conflictsExplosions") acc.explosions += 1;
      if (p.layer === "conflictsCivilians") acc.civilians += 1;
      if (p.layer === "conflictsStrategic") acc.strategic += 1;
      if (p.layer === "conflictsProtests") acc.protests += 1;
      if (p.layer === "conflictsRiots") acc.riots += 1;
      return acc;
    },
    { battles: 0, explosions: 0, civilians: 0, strategic: 0, protests: 0, riots: 0 }
  );

  /* eslint-disable react-hooks/set-state-in-effect -- reset error state when hero image URL changes */
  useEffect(() => {
    setImageBroken(false);
  }, [imageUrl]);
  /* eslint-enable react-hooks/set-state-in-effect */

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
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "4px 8px",
            marginBottom: 8,
            borderRadius: 999,
            border: "1px solid rgba(255, 159, 67, 0.45)",
            background: "rgba(255, 159, 67, 0.14)",
            fontSize: 11,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
          }}
        >
          Beta - Work in Progress
        </div>
        <div className="intel-side-kicker">REGION INTELLIGENCE</div>
        <h3>{data.selection.name}</h3>
        <p>{formatRangeLabel(data.range)} operational picture</p>
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
        <div className="intel-side-item"><span>Battles</span><strong>{conflictSubtypeCounts.battles}</strong></div>
        <div className="intel-side-item"><span>Explosions</span><strong>{conflictSubtypeCounts.explosions}</strong></div>
        <div className="intel-side-item"><span>Attack on Civilians</span><strong>{conflictSubtypeCounts.civilians}</strong></div>
        <div className="intel-side-item"><span>Strat. Dev.</span><strong>{conflictSubtypeCounts.strategic}</strong></div>
        <div className="intel-side-item"><span>Protests</span><strong>{conflictSubtypeCounts.protests}</strong></div>
        <div className="intel-side-item"><span>Riots</span><strong>{conflictSubtypeCounts.riots}</strong></div>
        <div className="intel-side-item"><span>Flights</span><strong>{data.signals.militaryFlights}</strong></div>
        <div className="intel-side-item"><span>Vessels</span><strong>{data.signals.navalVessels}</strong></div>
        <div className="intel-side-item"><span>Carriers (WIP)</span><strong>{data.signals.carrierSignals}</strong></div>
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
            <div
              key={`${m.provider}-${m.title}-${idx}`}
              className="intel-side-item"
              style={{ alignItems: "flex-start", flexDirection: "column", gap: 6 }}
            >
              <span>{m.provider}</span>
              <strong style={{ maxWidth: 210 }}>
                {m.title}
              </strong>
              <div style={{ width: "100%" }}>
                <div
                  style={{
                    display: "flex",
                    width: "100%",
                    height: 8,
                    borderRadius: 999,
                    overflow: "hidden",
                    border: "1px solid rgba(148,163,184,0.35)",
                    background: "rgba(15,23,42,0.7)",
                  }}
                >
                  <div
                    style={{
                      width: `${Math.max(0, Math.min(100, m.yesChancePct))}%`,
                      background: "linear-gradient(90deg, rgba(34,197,94,0.9), rgba(132,204,22,0.92))",
                    }}
                  />
                  <div
                    style={{
                      width: `${Math.max(0, Math.min(100, m.noChancePct))}%`,
                      background: "linear-gradient(90deg, rgba(239,68,68,0.82), rgba(244,63,94,0.86))",
                    }}
                  />
                </div>
                <div style={{ marginTop: 4, fontSize: 11, color: "rgba(226,232,240,0.85)" }}>
                  YES {m.yesChancePct}% / NO {m.noChancePct}%
                </div>
              </div>
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
