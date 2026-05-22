"use client";

import type { ExposureAlert, UserAsset } from "@/lib/impact/types";

type Props = {
  assets: UserAsset[];
  alertsByAsset: Record<string, ExposureAlert>;
  selectedAssetId: string | null;
  onSelect: (assetId: string) => void;
};

function levelLabel(level: ExposureAlert["level"] | undefined): string {
  if (!level) return "—";
  return level.charAt(0).toUpperCase() + level.slice(1);
}

export function AssetTable({ assets, alertsByAsset, selectedAssetId, onSelect }: Props) {
  if (assets.length === 0) {
    return (
      <div className="impact-empty">
        <p>No assets loaded. Use the panel above to add some.</p>
      </div>
    );
  }
  return (
    <div className="impact-asset-table" role="list">
      {assets.map((asset) => {
        const alert = alertsByAsset[asset.id];
        const selected = asset.id === selectedAssetId;
        return (
          <button
            key={asset.id}
            type="button"
            role="listitem"
            className={`impact-asset-row${selected ? " is-selected" : ""}`}
            data-level={alert?.level ?? "none"}
            onClick={() => onSelect(asset.id)}
          >
            <div className="impact-asset-row-main">
              <div className="impact-asset-row-title">
                <span className="impact-asset-name">{asset.name}</span>
                <span className="impact-asset-meta">
                  {asset.type.replace(/_/g, " ")} · {asset.city ? `${asset.city}, ` : ""}
                  {asset.country}
                </span>
              </div>
              {alert ? (
                <div className={`impact-score-chip impact-level-${alert.level}`}>
                  <span className="impact-score-value">{alert.score}</span>
                  <span className="impact-score-label">{levelLabel(alert.level)}</span>
                </div>
              ) : (
                <div className="impact-score-chip impact-level-none">
                  <span className="impact-score-value">—</span>
                  <span className="impact-score-label">No alert</span>
                </div>
              )}
            </div>
            <div className="impact-asset-row-sub">
              <span>Importance: {asset.importance}</span>
              <span>
                Lat {asset.lat.toFixed(2)}, Lon {asset.lon.toFixed(2)}
              </span>
              {asset.tags && asset.tags.length > 0 ? (
                <span className="impact-asset-tags">
                  {asset.tags.map((t) => (
                    <span key={t} className="impact-asset-tag">
                      {t}
                    </span>
                  ))}
                </span>
              ) : null}
            </div>
          </button>
        );
      })}
    </div>
  );
}
