"use client";

import type { ExposureAlert } from "@/lib/impact/types";
import type { UserAsset } from "@/lib/impact/types";

type Props = {
  assets: UserAsset[];
  alertsByAsset: Record<string, ExposureAlert>;
  activeAssetId: string | null;
  onSelect: (assetId: string) => void;
};

function locationLine(asset: UserAsset): string {
  return [asset.city, asset.country].filter(Boolean).join(", ");
}

export function AssetSwitcher({ assets, alertsByAsset, activeAssetId, onSelect }: Props) {
  if (assets.length <= 1) {
    const asset = assets[0];
    if (!asset) return null;
    return (
      <div className="iv-dash-asset-single">
        <span className="iv-dash-asset-name">{asset.name}</span>
        <span className="iv-meta">{locationLine(asset)}</span>
      </div>
    );
  }

  return (
    <div className="iv-dash-asset-switcher" role="tablist" aria-label="Selected assets">
      {assets.map((asset) => {
        const alert = alertsByAsset[asset.id];
        const isActive = asset.id === activeAssetId;
        return (
          <button
            key={asset.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={`iv-dash-asset-tab${isActive ? " is-active" : ""}`}
            onClick={() => onSelect(asset.id)}
          >
            <span className="iv-dash-asset-tab-name">{asset.name}</span>
            <span className="iv-dash-asset-tab-meta">
              {locationLine(asset)}
              {alert ? ` · ${alert.score}` : ""}
            </span>
          </button>
        );
      })}
    </div>
  );
}
