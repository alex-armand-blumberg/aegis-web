"use client";

import { useMemo, useState } from "react";
import type { RegionIntelResponse, RegionMarketQuote } from "@/lib/intel/types";
import { INTEL_LAYER_LABELS } from "@/lib/intel/layerLabels";
import { IntelBriefTabPanel, IntelBriefTabs, type IntelBriefTabId } from "@/components/map/IntelBriefTabs";
import { StatusChip } from "@/components/ui/StatusChip";

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

function statusVariant(s: RegionIntelResponse["status"]): "critical" | "high" | "medium" | "low" {
  if (s === "critical") return "critical";
  if (s === "elevated") return "high";
  return "low";
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
  const [tab, setTab] = useState<IntelBriefTabId>("overview");
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

  const uniqueSources = useMemo(() => {
    const s = new Set<string>();
    for (const p of data.dataPoints) {
      if (p.source?.trim()) s.add(p.source.trim());
    }
    return [...s].sort((a, b) => a.localeCompare(b)).slice(0, 32);
  }, [data.dataPoints]);

  const showMarkets = marketsLoading || markets.length > 0;

  const tabs = useMemo(() => {
    const t: { id: IntelBriefTabId; label: string }[] = [
      { id: "overview", label: "Overview" },
      { id: "signals", label: "Signals" },
      { id: "sources", label: "Sources" },
      { id: "summary", label: "Summary" },
      { id: "related", label: "Related" },
    ];
    if (showMarkets) t.push({ id: "markets", label: "Markets" });
    return t;
  }, [showMarkets]);

  return (
    <aside className="intel-side-panel intel-brief-panel intel-panel-responsive">
      <div className="intel-brief-sticky">
        <button type="button" className="intel-side-close intel-brief-close" aria-label="Close brief" onClick={onClose}>
          ×
        </button>
        <div className="intel-brief-title-block">
          <div className="intel-side-kicker">Region brief</div>
          <h3 className="intel-brief-title">{data.selection.name}</h3>
          <p className="intel-brief-subtitle">{formatRangeLabel(data.range)} operational picture</p>
        </div>
        <IntelBriefTabs tabs={tabs} active={tab} onChange={setTab} />
      </div>

      <div className="intel-brief-scroll">
        <IntelBriefTabPanel id="overview" active={tab}>
          <div className="intel-brief-section">
            {imageLoading && !imageUrl ? <div className="intel-side-image-loading intel-brief-hero-skel" /> : null}
            {imageUrl && !imageBroken ? (
              <div key={imageUrl} className="intel-side-image-wrap">
                <img
                  src={imageUrl}
                  alt=""
                  className="intel-side-image intel-brief-hero"
                  onError={() => setImageBroken(true)}
                />
              </div>
            ) : null}
            <div className="intel-brief-chips">
              <StatusChip variant="experimental">Beta</StatusChip>
              <StatusChip variant={statusVariant(data.status)}>{data.status}</StatusChip>
            </div>
            <div className="map-region-metric-grid">
              <div className="map-region-metric">
                <span className="map-region-metric-label">Escalation index</span>
                <div className="map-region-metric-bar">
                  <div className="map-region-metric-fill" style={{ width: `${data.escalationIndex}%` }} />
                </div>
                <span className="map-region-metric-val">{data.escalationIndex}</span>
              </div>
              <div className="map-region-metric">
                <span className="map-region-metric-label">Conflict index</span>
                <div className="map-region-metric-bar map-region-metric-bar-alt">
                  <div className="map-region-metric-fill" style={{ width: `${data.conflictIndex}%` }} />
                </div>
                <span className="map-region-metric-val">{data.conflictIndex}</span>
              </div>
            </div>
          </div>
        </IntelBriefTabPanel>

        <IntelBriefTabPanel id="signals" active={tab}>
          <div className="intel-side-grid intel-brief-pad">
            <div className="intel-side-item">
              <span>Live strikes</span>
              <strong>{data.signals.liveStrikes}</strong>
            </div>
            <div className="intel-side-item">
              <span>Conflicts</span>
              <strong>{data.signals.conflicts}</strong>
            </div>
            <div className="intel-side-item">
              <span>Battles</span>
              <strong>{conflictSubtypeCounts.battles}</strong>
            </div>
            <div className="intel-side-item">
              <span>Explosions</span>
              <strong>{conflictSubtypeCounts.explosions}</strong>
            </div>
            <div className="intel-side-item">
              <span>Attack on civilians</span>
              <strong>{conflictSubtypeCounts.civilians}</strong>
            </div>
            <div className="intel-side-item">
              <span>Strategic</span>
              <strong>{conflictSubtypeCounts.strategic}</strong>
            </div>
            <div className="intel-side-item">
              <span>Protests</span>
              <strong>{conflictSubtypeCounts.protests}</strong>
            </div>
            <div className="intel-side-item">
              <span>Riots</span>
              <strong>{conflictSubtypeCounts.riots}</strong>
            </div>
            <div className="intel-side-item">
              <span>Flights</span>
              <strong>{data.signals.militaryFlights}</strong>
            </div>
            <div className="intel-side-item">
              <span>Vessels</span>
              <strong>{data.signals.navalVessels}</strong>
            </div>
            <div className="intel-side-item">
              <span>Carriers</span>
              <strong>{data.signals.carrierSignals}</strong>
            </div>
            <div className="intel-side-item">
              <span>Infrastructure</span>
              <strong>{data.signals.infrastructure}</strong>
            </div>
            <div className="intel-side-item">
              <span>Critical news</span>
              <strong>{data.signals.criticalNews}</strong>
            </div>
          </div>
        </IntelBriefTabPanel>

        <IntelBriefTabPanel id="sources" active={tab}>
          <div className="intel-brief-pad">
            <div className="intel-side-subtitle">Publisher sources (mapped)</div>
            <ul className="intel-brief-source-list">
              {uniqueSources.length > 0 ? (
                uniqueSources.map((src) => (
                  <li key={src}>{src}</li>
                ))
              ) : (
                <li className="intel-brief-muted">No sources listed for scoped points.</li>
              )}
            </ul>
            {data.topNews.length > 0 ? (
              <>
                <div className="intel-side-subtitle intel-brief-mt">Headlines</div>
                <ul className="intel-brief-news-list">
                  {data.topNews.slice(0, 8).map((n, i) => (
                    <li key={`${n.timestamp}-${i}`}>
                      <span className="intel-brief-news-meta">
                        {n.source} · {new Date(n.timestamp).toLocaleDateString()}
                      </span>
                      <div className="intel-brief-news-title">{n.title}</div>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </div>
        </IntelBriefTabPanel>

        <IntelBriefTabPanel id="summary" active={tab}>
          <div className="intel-brief-pad">
            {aiLoading ? (
              <div className="map-skeleton map-skeleton-text" />
            ) : (
              <pre className="map-ai-answer intel-brief-pre">
                {aiSummary || `Summary unavailable: ${aiError || "AI service unavailable."}`}
              </pre>
            )}
          </div>
        </IntelBriefTabPanel>

        <IntelBriefTabPanel id="related" active={tab}>
          <div className="intel-brief-pad">
            <div className="intel-side-subtitle">Mapped points in region</div>
            {data.dataPoints.slice(0, 40).map((p) => (
              <div key={p.id} className="intel-side-item intel-brief-related-row">
                <span>{INTEL_LAYER_LABELS[p.layer] ?? p.layer}</span>
                <strong>{p.title}</strong>
              </div>
            ))}
            {data.dataPoints.length > 40 ? (
              <p className="intel-brief-muted">Showing 40 of {data.dataPoints.length} points.</p>
            ) : null}
          </div>
        </IntelBriefTabPanel>

        <IntelBriefTabPanel id="markets" active={tab}>
          <div className="intel-brief-pad">
            {marketsLoading ? (
              <div className="map-skeleton map-skeleton-text" />
            ) : markets.length > 0 ? (
              markets.map((m, idx) => (
                <div
                  key={`${m.provider}-${m.title}-${idx}`}
                  className="intel-side-item intel-brief-market-card"
                >
                  <span>{m.provider}</span>
                  <strong className="intel-brief-market-title">{m.title}</strong>
                  <div className="intel-brief-market-bar-wrap">
                    <div className="intel-brief-market-bar">
                      <div
                        className="intel-brief-market-yes"
                        style={{ width: `${Math.max(0, Math.min(100, m.yesChancePct))}%` }}
                      />
                      <div
                        className="intel-brief-market-no"
                        style={{ width: `${Math.max(0, Math.min(100, m.noChancePct))}%` }}
                      />
                    </div>
                    <div className="intel-brief-market-odds">
                      YES {m.yesChancePct}% / NO {m.noChancePct}%
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="intel-brief-muted">No relevant market contracts found.</p>
            )}
          </div>
        </IntelBriefTabPanel>
      </div>
    </aside>
  );
}
