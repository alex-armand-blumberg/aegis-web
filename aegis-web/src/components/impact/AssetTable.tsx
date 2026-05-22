"use client";

import type { ExposureAlert, UserAsset } from "@/lib/impact/types";

type Props = {
  assets: UserAsset[];
  alertsByAsset: Record<string, ExposureAlert>;
  selectedAssetId: string | null;
  onSelect: (assetId: string) => void;
};

export function AssetTable({ assets, alertsByAsset, selectedAssetId, onSelect }: Props) {
  if (assets.length === 0) return null;
  return (
    <div className="impact-asset-list" role="list">
      {assets.map((asset) => {
        const alert = alertsByAsset[asset.id];
        const selected = asset.id === selectedAssetId;
        const level = alert?.level ?? "none";
        return (
          <button
            key={asset.id}
            type="button"
            role="listitem"
            className={`impact-asset-row${selected ? " is-selected" : ""}`}
            data-level={level}
            onClick={() => onSelect(asset.id)}
            title={`Lat ${asset.lat.toFixed(2)}, Lon ${asset.lon.toFixed(2)}`}
          >
            <span className="impact-asset-stripe" aria-hidden />
            <span className="impact-asset-body">
              <span className="impact-asset-name">{asset.name}</span>
              <span className="impact-asset-meta">
                {asset.type.replace(/_/g, " ")} · {asset.city ? `${asset.city}, ` : ""}
                {asset.country} · {asset.importance}
              </span>
            </span>
            {alert ? (
              <span className={`impact-asset-score impact-level-${alert.level}`}>
                <span className="impact-asset-score-value">{alert.score}</span>
                <span className="impact-asset-score-label">{alert.level}</span>
              </span>
            ) : (
              <span className="impact-asset-score impact-level-none">
                <span className="impact-asset-score-value">—</span>
                <span className="impact-asset-score-label">no alert</span>
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
