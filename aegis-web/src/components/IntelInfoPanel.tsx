"use client";

import type { IntelPoint, ProviderHealth } from "@/lib/intel/types";

type IntelInfoPanelProps = {
  point: IntelPoint;
  providerHealth: ProviderHealth[];
  aiSummary?: string;
  aiLoading?: boolean;
  onClose: () => void;
};

function severityColor(severity: IntelPoint["severity"]): string {
  switch (severity) {
    case "critical":
      return "#ef4444";
    case "high":
      return "#f97316";
    case "medium":
      return "#f59e0b";
    default:
      return "#60a5fa";
  }
}

export default function IntelInfoPanel({
  point,
  providerHealth,
  aiSummary,
  aiLoading = false,
  onClose,
}: IntelInfoPanelProps) {
  const health = providerHealth.find((p) => point.source.includes(p.provider));
  const imageUrl =
    point.imageUrl ||
    (typeof point.metadata?.image_url === "string" ? point.metadata.image_url : "");
  return (
    <aside className="intel-side-panel">
      <button type="button" className="intel-side-close" onClick={onClose}>
        x
      </button>
      <div className="intel-side-header">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={point.title}
            className="intel-side-image"
          />
        ) : null}
        <div className="intel-side-kicker">{point.layer.toUpperCase()}</div>
        <h3>{point.title}</h3>
        <p>{point.subtitle || point.country || "Global signal"}</p>
      </div>

      <div className="intel-side-grid">
        <div className="intel-side-item">
          <span>Severity</span>
          <strong style={{ color: severityColor(point.severity) }}>
            {point.severity.toUpperCase()}
          </strong>
        </div>
        <div className="intel-side-item">
          <span>Source</span>
          <strong>{point.source}</strong>
        </div>
        <div className="intel-side-item">
          <span>Updated</span>
          <strong>{new Date(point.timestamp).toLocaleString()}</strong>
        </div>
        <div className="intel-side-item">
          <span>Confidence</span>
          <strong>
            {typeof point.confidence === "number"
              ? `${Math.round(point.confidence * 100)}%`
              : "N/A"}
          </strong>
        </div>
      </div>

      {point.metadata && (
        <div className="intel-side-metadata">
          <div className="intel-side-subtitle">Signal data</div>
          {Object.entries(point.metadata).map(([k, v]) => (
            <div key={k} className="intel-side-item">
              <span>{k.replaceAll("_", " ")}</span>
              <strong>{String(v)}</strong>
            </div>
          ))}
        </div>
      )}

      <div className="intel-side-metadata">
        <div className="intel-side-subtitle">Provider status</div>
        {providerHealth.map((h) => (
          <div key={h.provider} className="intel-side-item">
            <span>{h.provider}</span>
            <strong style={{ color: h.ok ? "#22c55e" : "#ef4444" }}>
              {h.ok ? "OK" : "DEGRADED"}
            </strong>
          </div>
        ))}
      </div>

      {health?.message && <p className="intel-side-note">{health.message}</p>}

      <div className="intel-side-metadata">
        <div className="intel-side-subtitle">AI statistical summary</div>
        {aiLoading ? (
          <p className="intel-side-note">Generating AI summary...</p>
        ) : (
          <p className="intel-side-note">{aiSummary || "No AI summary yet."}</p>
        )}
      </div>
    </aside>
  );
}
