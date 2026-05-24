"use client";

import type { UserAsset } from "@/lib/impact/types";

type Props = {
  asset: UserAsset;
  selected: boolean;
  onToggle: (id: string) => void;
};

function formatType(type: UserAsset["type"]): string {
  return type.replace(/_/g, " ");
}

function formatImportance(importance: UserAsset["importance"]): string {
  return importance.charAt(0).toUpperCase() + importance.slice(1);
}

export function AssetCard({ asset, selected, onToggle }: Props) {
  const location = [asset.city, asset.country].filter(Boolean).join(", ");

  return (
    <button
      type="button"
      className={`iv-asset-card${selected ? " is-selected" : ""}`}
      onClick={() => onToggle(asset.id)}
      aria-pressed={selected}
    >
      <span className="iv-asset-card-check" aria-hidden>
        {selected ? (
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <circle cx="10" cy="10" r="10" fill="currentColor" />
            <path
              d="M6 10.2L8.6 12.8L14.4 7"
              stroke="#fff"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        )}
      </span>
      <span className="iv-asset-card-body">
        <span className="iv-asset-card-name">{asset.name}</span>
        <span className="iv-asset-card-location">{location}</span>
        <span className="iv-asset-card-meta">
          <span className="iv-pill iv-pill-type">{formatType(asset.type)}</span>
          <span className="iv-pill iv-pill-importance">{formatImportance(asset.importance)}</span>
        </span>
      </span>
    </button>
  );
}
