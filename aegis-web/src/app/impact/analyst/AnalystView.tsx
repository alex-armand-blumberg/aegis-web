"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { buildExposureAlerts } from "@/lib/impact/scoring";
import { buildSelectedAssetEventLayer } from "@/lib/impact/eventLayer";
import { loadAssets } from "@/lib/impact/storage";
import type { ExposureAlert, UserAsset } from "@/lib/impact/types";
import { MarketingNav } from "@/components/ui/MarketingNav";
import { SiteFooter } from "@/components/ui/SiteFooter";
import { AssetSwitcher } from "../dashboard/AssetSwitcher";
import { filterAssetsBySelection, pickTopEvents } from "../dashboard/dashboardUtils";
import { ImpactTabNav } from "../shared/ImpactTabNav";
import { buildImpactSearchParams, parseRangeParam } from "../shared/impactUrlParams";
import {
  IMPACT_RANGE_OPTIONS,
  useImpactMapData,
  type ImpactRangeOption,
} from "../shared/useImpactMapData";
import { AnalystChat } from "./AnalystChat";
import { ANALYST_MAX_EVIDENCE, buildAnalystContext } from "./analystContext";

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

function levelLabel(level: ExposureAlert["level"] | undefined): string | null {
  if (!level) return null;
  return level.charAt(0).toUpperCase() + level.slice(1);
}

export function AnalystView({ selectedAssetIds }: Props) {
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
    if (assets.some((asset) => asset.id === activeAssetId)) return;
    const next = assets[0]?.id ?? null;
    setActiveAssetId(next);
    if (next) {
      const params = buildImpactSearchParams({ assetId: next, range });
      router.replace(`/impact/analyst?${params.toString()}`);
    }
  }, [activeAssetId, assets, range, router]);

  const syncUrl = useCallback(
    (assetId: string | null, nextRange: ImpactRangeOption = range) => {
      const params = buildImpactSearchParams({ assetId, range: nextRange });
      router.replace(`/impact/analyst?${params.toString()}`);
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

  const activeAsset = activeAssetId
    ? assets.find((asset) => asset.id === activeAssetId) ?? null
    : null;

  const eventLayer = useMemo(() => {
    if (!mapData || !activeAsset) return null;
    return buildSelectedAssetEventLayer({
      mapData,
      selectedAssets: [activeAsset],
      range,
    });
  }, [activeAsset, mapData, range]);

  const topEvents = useMemo(() => {
    if (!eventLayer) return [];
    return pickTopEvents(eventLayer.events, ANALYST_MAX_EVIDENCE);
  }, [eventLayer]);

  const activeAlert = activeAssetId ? alertsByAsset[activeAssetId] ?? null : null;

  const analystContext = useMemo(() => {
    if (!activeAsset) return null;
    return buildAnalystContext({
      asset: activeAsset,
      alert: activeAlert,
      topEvents,
      range,
    });
  }, [activeAlert, activeAsset, range, topEvents]);

  if (assets.length === 0) {
    return (
      <div className="impact-v2 iv-analyst-page">
        <MarketingNav minimalAppLinks />
        <main className="iv-analyst-main">
          <p className="iv-meta">No assets available for the analyst view.</p>
        </main>
        <SiteFooter />
      </div>
    );
  }

  const contextLineParts: string[] = ["Argus"];
  if (activeAsset) contextLineParts.push(activeAsset.name);
  contextLineParts.push(range);
  if (activeAlert) {
    contextLineParts.push(`score ${Math.round(activeAlert.score)}`);
    const lvl = levelLabel(activeAlert.level);
    if (lvl) contextLineParts.push(`${lvl.toLowerCase()} level`);
    contextLineParts.push(`${activeAlert.confidence} pipeline confidence`);
  } else if (!isLoading) {
    contextLineParts.push("no exposure score yet");
  }

  return (
    <div className="impact-v2 iv-analyst-page">
      <MarketingNav minimalAppLinks />

      <header className="iv-analyst-header">
        <ImpactTabNav active="analyst" assetId={activeAssetId} range={range} />
        <div className="iv-analyst-header-top">
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
        <p className="iv-meta iv-analyst-context-strip">{contextLineParts.join(" · ")}</p>
      </header>

      <main className="iv-analyst-main">
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

        <AnalystChat
          context={analystContext}
          conversationKey={`${activeAssetId ?? "none"}::${range}`}
        />
      </main>

      <SiteFooter />
    </div>
  );
}
