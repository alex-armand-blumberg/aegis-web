"use client";

import type { ExposureAlert, UserAsset } from "@/lib/impact/types";
import { countryDisplay } from "@/lib/impact/countryDisplay";

type Props = {
  assets: UserAsset[];
  alertsByAsset: Record<string, ExposureAlert>;
  selectedAssetId: string | null;
  onSelect: (assetId: string) => void;
  search?: string;
  typeFilter?: "all" | UserAsset["type"];
  importanceFilter?: "all" | UserAsset["importance"];
  regionFilter?: "all" | string;
};

export function AssetTable({
  assets,
  alertsByAsset,
  selectedAssetId,
  onSelect,
  search = "",
  typeFilter = "all",
  importanceFilter = "all",
  regionFilter = "all",
}: Props) {
  if (assets.length === 0) return null;
  const query = search.trim().toLowerCase();
  const filtered = assets.filter((asset) => {
    if (typeFilter !== "all" && asset.type !== typeFilter) return false;
    if (importanceFilter !== "all" && asset.importance !== importanceFilter) return false;
    if (regionFilter !== "all" && asset.country !== regionFilter) return false;
    if (!query) return true;
    return `${asset.name} ${asset.city ?? ""} ${asset.country} ${asset.type} ${asset.importance}`
      .toLowerCase()
      .includes(query);
  });

  if (filtered.length === 0) {
    return (
      <div className="impact-asset-list impact-asset-list-empty">
        <p>No assets match current portfolio filters.</p>
      </div>
    );
  }

  return (
    <div className="impact-asset-list" role="list">
      {filtered.map((asset) => {
        const alert = alertsByAsset[asset.id];
        const selected = asset.id === selectedAssetId;
        const level = alert?.level ?? "none";
        const country = countryDisplay(asset.country);
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
            <span className="impact-asset-country-badge" aria-hidden>
              {country.flag}
            </span>
            <span className="impact-asset-body">
              <span className="impact-asset-name">{asset.name}</span>
              <span className="impact-asset-meta">
                {asset.city ? `${asset.city}, ` : ""}
                {asset.country}
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
