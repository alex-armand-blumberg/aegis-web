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
import { ImpactTabNav } from "../shared/ImpactTabNav";
import { buildImpactSearchParams, parseRangeParam } from "../shared/impactUrlParams";
import {
  IMPACT_RANGE_OPTIONS,
  useImpactMapData,
  type ImpactRangeOption,
} from "../shared/useImpactMapData";
import { AssetSwitcher } from "./AssetSwitcher";
import { RiskSummary } from "./RiskSummary";
import { TopEventsPanel } from "./TopEventsPanel";
import {
  buildEventStatsLine,
  filterAssetsBySelection,
  pickTopEvents,
} from "./dashboardUtils";

const DashboardMap = dynamic(
  () => import("./DashboardMap").then((m) => m.DashboardMap),
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

  if (urlAssetId && assets.some((a) => a.id === urlAssetId)) {
    return urlAssetId;
  }

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

export function ImpactDashboard({ selectedAssetIds }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlAssetId = searchParams.get("asset");
  const urlRange = parseRangeParam(searchParams.get("range"));

  const [assets, setAssets] = useState<UserAsset[]>([]);
  const [activeAssetId, setActiveAssetId] = useState<string | null>(null);
  const [highlightedEventId, setHighlightedEventId] = useState<string | null>(null);
  const [initializedActive, setInitializedActive] = useState(false);

  const { range, setRange, mapData, loadError, fetchMap, isLoading } = useImpactMapData(
    urlRange ?? "7d"
  );

  useEffect(() => {
    if (urlRange && urlRange !== range) {
      setRange(urlRange);
    }
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
    if (assets.some((asset) => asset.id === activeAssetId)) return;
    const next = assets[0]?.id ?? null;
    setActiveAssetId(next);
    if (next) {
      const params = buildImpactSearchParams({ assetId: next, range });
      router.replace(`/impact?${params.toString()}`);
    }
  }, [activeAssetId, assets, range, router]);

  const syncUrl = useCallback(
    (assetId: string | null, nextRange: ImpactRangeOption = range) => {
      const params = buildImpactSearchParams({ assetId, range: nextRange });
      router.replace(`/impact?${params.toString()}`);
    },
    [range, router]
  );

  const handleSelectAsset = useCallback(
    (assetId: string) => {
      setActiveAssetId(assetId);
      setHighlightedEventId(null);
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
    ? assets.find((asset) => asset.id === activeAssetId) ?? null
    : null;

  const activeEvents = useMemo(
    () => eventLayer.events.filter((event) => event.assetId === activeAssetId),
    [eventLayer.events, activeAssetId]
  );

  const mapEvents = useMemo(
    () => activeEvents.filter((event) => event.defaultMapPin),
    [activeEvents]
  );

  const topEvents = useMemo(() => pickTopEvents(activeEvents, 5), [activeEvents]);

  const activeAlert = activeAssetId ? alertsByAsset[activeAssetId] ?? null : null;

  const updatedLabel = mapData?.updatedAt
    ? new Date(mapData.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : null;

  const statsLine = buildEventStatsLine(activeEvents);

  if (assets.length === 0) {
    return (
      <div className="impact-v2 iv-dash-page">
        <MarketingNav minimalAppLinks />
        <main className="iv-dash-main">
          <p className="iv-meta">No assets available for this dashboard view.</p>
        </main>
        <SiteFooter />
      </div>
    );
  }

  return (
    <div className="impact-v2 iv-dash-page">
      <MarketingNav minimalAppLinks />

      <header className="iv-dash-header">
        <ImpactTabNav active="dashboard" assetId={activeAssetId} range={range} />
        <div className="iv-dash-header-top">
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

      <main className="iv-dash-main">
        {loadError ? (
          <div className="iv-dash-error" role="alert">
            <p>{loadError}</p>
            <button type="button" className="iv-btn iv-btn-secondary" onClick={() => void fetchMap(range)}>
              Retry
            </button>
          </div>
        ) : null}

        <RiskSummary asset={activeAsset} alert={activeAlert} loading={isLoading} />

        <div className="iv-dash-body">
          <DashboardMap
            asset={activeAsset}
            mapEvents={mapEvents}
            highlightedEventId={highlightedEventId}
            onHighlight={setHighlightedEventId}
            loading={isLoading}
          />
          <TopEventsPanel
            events={topEvents}
            highlightedEventId={highlightedEventId}
            onHighlight={setHighlightedEventId}
            loading={isLoading}
            evidenceHref={
              activeAssetId
                ? `/impact/evidence?${buildImpactSearchParams({ assetId: activeAssetId, range }).toString()}`
                : undefined
            }
          />
        </div>

        <footer className="iv-dash-footer">
          <span className="iv-meta">{statsLine}</span>
          {updatedLabel ? (
            <span className="iv-meta">Data refreshed {updatedLabel}</span>
          ) : null}
        </footer>
      </main>

      <SiteFooter />
    </div>
  );
}
