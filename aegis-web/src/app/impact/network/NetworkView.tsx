"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { buildExposureAlerts } from "@/lib/impact/scoring";
import { buildSelectedAssetEventLayer } from "@/lib/impact/eventLayer";
import { loadAssets } from "@/lib/impact/storage";
import type { ExposureAlert, UserAsset } from "@/lib/impact/types";
import { MarketingNav } from "@/components/ui/MarketingNav";
import { SiteFooter } from "@/components/ui/SiteFooter";
import { AssetSwitcher } from "../dashboard/AssetSwitcher";
import { filterAssetsBySelection } from "../dashboard/dashboardUtils";
import { ImpactTabNav } from "../shared/ImpactTabNav";
import { buildImpactSearchParams, parseRangeParam } from "../shared/impactUrlParams";
import {
  IMPACT_RANGE_OPTIONS,
  useImpactMapData,
  type ImpactRangeOption,
} from "../shared/useImpactMapData";

// Dynamic import: NetworkGraph uses pointer events + localStorage (client-only)
const NetworkGraph = dynamic(
  () => import("./NetworkGraph").then((m) => m.NetworkGraph),
  { ssr: false }
);

type Props = {
  selectedAssetIds?: string[];
};

function resolveInitialAssetId(opts: {
  urlAssetId: string | null;
  assets: UserAsset[];
  alerts: ExposureAlert[];
  selectedAssetIds?: string[];
}): string | null {
  const { urlAssetId, assets, alerts, selectedAssetIds } = opts;
  if (assets.length === 0) return null;
  if (urlAssetId && assets.some((a) => a.id === urlAssetId)) return urlAssetId;
  if (alerts.length > 0) {
    const top = [...alerts].sort((a, b) => b.score - a.score)[0];
    return top.asset.id;
  }
  if (selectedAssetIds && selectedAssetIds.length > 0) {
    const first = assets.find((a) => a.id === selectedAssetIds[0]);
    if (first) return first.id;
  }
  return assets[0]?.id ?? null;
}

export function NetworkView({ selectedAssetIds }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlAssetId = searchParams.get("asset");
  const urlRange = parseRangeParam(searchParams.get("range"));

  const [assets, setAssets] = useState<UserAsset[]>([]);
  const [activeAssetId, setActiveAssetId] = useState<string | null>(null);
  const [initializedActive, setInitializedActive] = useState(false);

  const { range, setRange, mapData, loadError, fetchMap, isLoading } = useImpactMapData(
    urlRange ?? "7d"
  );

  useEffect(() => {
    if (urlRange && urlRange !== range) setRange(urlRange);
  }, [urlRange, range, setRange]);

  useEffect(() => {
    setAssets(filterAssetsBySelection(loadAssets(), selectedAssetIds));
  }, [selectedAssetIds]);

  const alerts: ExposureAlert[] = useMemo(() => {
    if (!mapData || assets.length === 0) return [];
    return buildExposureAlerts({ assets, mapData, range });
  }, [assets, mapData, range]);

  const alertsByAsset = useMemo(() => {
    const map: Record<string, ExposureAlert> = {};
    for (const alert of alerts) map[alert.asset.id] = alert;
    return map;
  }, [alerts]);

  useEffect(() => {
    if (initializedActive || assets.length === 0) return;
    setActiveAssetId(
      resolveInitialAssetId({ urlAssetId, assets, alerts, selectedAssetIds })
    );
    setInitializedActive(true);
  }, [alerts, assets, initializedActive, selectedAssetIds, urlAssetId]);

  useEffect(() => {
    if (!activeAssetId) return;
    if (assets.some((a) => a.id === activeAssetId)) return;
    const next = assets[0]?.id ?? null;
    setActiveAssetId(next);
    if (next) {
      const params = buildImpactSearchParams({ assetId: next, range });
      router.replace(`/impact/network?${params.toString()}`);
    }
  }, [activeAssetId, assets, range, router]);

  const syncUrl = useCallback(
    (assetId: string | null, nextRange: ImpactRangeOption = range) => {
      const params = buildImpactSearchParams({ assetId, range: nextRange });
      router.replace(`/impact/network?${params.toString()}`);
    },
    [range, router]
  );

  const handleSelectAsset = useCallback(
    (assetId: string) => {
      setActiveAssetId(assetId);
      syncUrl(assetId, range);
    },
    [range, syncUrl]
  );

  const handleRangeChange = useCallback(
    (nextRange: ImpactRangeOption) => {
      setRange(nextRange);
      syncUrl(activeAssetId, nextRange);
    },
    [activeAssetId, setRange, syncUrl]
  );

  const eventLayer = useMemo(
    () =>
      buildSelectedAssetEventLayer({
        mapData,
        selectedAssets: assets,
        range,
      }),
    [assets, mapData, range]
  );

  const activeAsset = activeAssetId
    ? assets.find((a) => a.id === activeAssetId) ?? null
    : null;

  const activeEvents = useMemo(
    () => eventLayer.events.filter((e) => e.assetId === activeAssetId),
    [eventLayer.events, activeAssetId]
  );

  const activeAlert = activeAssetId ? alertsByAsset[activeAssetId] ?? null : null;

  if (assets.length === 0) {
    return (
      <div className="impact-v2 iv-net-page">
        <MarketingNav minimalAppLinks />
        <main className="iv-net-main">
          <p className="iv-meta">No assets available for this network view.</p>
        </main>
        <SiteFooter />
      </div>
    );
  }

  return (
    <div className="impact-v2 iv-net-page">
      <MarketingNav minimalAppLinks />

      <header className="iv-net-page-header">
        <ImpactTabNav active="network" assetId={activeAssetId} range={range} />
        <div className="iv-net-page-header-top">
          <AssetSwitcher
            assets={assets}
            alertsByAsset={alertsByAsset}
            activeAssetId={activeAssetId}
            onSelect={handleSelectAsset}
          />
          <div className="iv-dash-controls">
            <div className="iv-dash-range" role="group" aria-label="Time range">
              {IMPACT_RANGE_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`iv-dash-range-btn${range === option ? " is-active" : ""}`}
                  onClick={() => handleRangeChange(option)}
                >
                  {option}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="iv-dash-refresh-btn"
              onClick={() => void fetchMap(range)}
              disabled={isLoading}
            >
              Refresh
            </button>
          </div>
        </div>
      </header>

      <main className="iv-net-main">
        {loadError ? (
          <div className="iv-dash-error" role="alert">
            <p>{loadError}</p>
            <button
              type="button"
              className="iv-btn iv-btn-secondary"
              onClick={() => void fetchMap(range)}
            >
              Retry
            </button>
          </div>
        ) : null}

        {activeAsset ? (
          <NetworkGraph
            asset={activeAsset}
            activeEvents={activeEvents}
            alert={activeAlert}
            loading={isLoading}
          />
        ) : (
          <p className="iv-meta">Select an asset to view the relationship graph.</p>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}
