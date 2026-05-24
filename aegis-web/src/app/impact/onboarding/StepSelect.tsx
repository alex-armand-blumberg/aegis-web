"use client";

import { useCallback, useMemo, useState } from "react";
import type { UserAsset } from "@/lib/impact/types";
import type { OnboardingSource } from "./onboardingStorage";
import { AssetCard } from "./AssetCard";

type Props = {
  assets: UserAsset[];
  source: OnboardingSource;
  onBack: () => void;
  onComplete: (selectedAssetIds: string[]) => void;
};

export function StepSelect({ assets, source, onBack, onComplete }: Props) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(assets.map((a) => a.id))
  );

  const selectedCount = selectedIds.size;
  const totalCount = assets.length;

  const toggleAsset = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(assets.map((a) => a.id)));
  }, [assets]);

  const clearAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const handleContinue = useCallback(() => {
    if (selectedIds.size === 0) return;
    onComplete(Array.from(selectedIds));
  }, [onComplete, selectedIds]);

  const sourceLabel = useMemo(
    () => (source === "sample" ? "sample portfolio" : "uploaded CSV"),
    [source]
  );

  return (
    <div className="iv-onboard-step iv-onboard-step-select">
      <button type="button" className="iv-back-link" onClick={onBack}>
        ← Change source
      </button>

      <h1 className="iv-h1">Which assets should we focus on?</h1>
      <p className="iv-meta iv-onboard-lead">
        Tap to select or deselect. You can change this later. Loaded from your {sourceLabel}.
      </p>

      <div className="iv-select-toolbar">
        <button type="button" className="iv-text-link" onClick={selectAll}>
          Select all
        </button>
        <span className="iv-toolbar-sep" aria-hidden>
          ·
        </span>
        <button type="button" className="iv-text-link" onClick={clearAll}>
          Clear
        </button>
      </div>

      <ul className="iv-asset-list">
        {assets.map((asset) => (
          <li key={asset.id}>
            <AssetCard
              asset={asset}
              selected={selectedIds.has(asset.id)}
              onToggle={toggleAsset}
            />
          </li>
        ))}
      </ul>

      <div className="iv-onboard-footer">
        <p className="iv-meta iv-selection-summary">
          {selectedCount} of {totalCount} selected
        </p>
        <button
          type="button"
          className="iv-btn iv-btn-primary iv-btn-lg iv-btn-block"
          disabled={selectedCount === 0}
          onClick={handleContinue}
        >
          Continue
        </button>
      </div>
    </div>
  );
}
