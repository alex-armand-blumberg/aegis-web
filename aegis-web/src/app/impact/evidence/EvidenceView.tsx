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
import { filterAssetsBySelection } from "../dashboard/dashboardUtils";
import { ImpactTabNav } from "../shared/ImpactTabNav";
import { buildImpactSearchParams, parseRangeParam } from "../shared/impactUrlParams";
import {
  IMPACT_RANGE_OPTIONS,
  useImpactMapData,
  type ImpactRangeOption,
} from "../shared/useImpactMapData";
import { EvidenceFilterBar } from "./EvidenceFilterBar";
import { EvidenceSection } from "./EvidenceSection";
import { EvidenceRow } from "./EvidenceRow";
import {
  buildSuppressedSummary,
  DEFAULT_EVIDENCE_FILTER,
  filterEvidenceEvents,
  groupEvidence,
  hasPrimaryEvidence,
  isDefaultFilter,
  type EvidenceFilterState,
} from "./evidenceUtils";

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

export function EvidenceView({ selectedAssetIds }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlAssetId = searchParams.get("asset");
  const urlRange = parseRangeParam(searchParams.get("range"));

  const [assets, setAssets] = useState<UserAsset[]>([]);
  const [activeAssetId, setActiveAssetId] = useState<string | null>(null);
  const [initializedActive, setInitializedActive] = useState(false);
  const [filterState, setFilterState] = useState<EvidenceFilterState>(DEFAULT_EVIDENCE_FILTER);

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
      router.replace(`/impact/evidence?${params.toString()}`);
    }
  }, [activeAssetId, assets, range, router]);

  const syncUrl = useCallback(
    (assetId: string | null, nextRange: ImpactRangeOption = range) => {
      const params = buildImpactSearchParams({ assetId, range: nextRange });
      router.replace(`/impact/evidence?${params.toString()}`);
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
    ? assets.find((asset) => asset.id === activeAssetId) ?? null
    : null;

  const activeEvents = useMemo(
    () => eventLayer.events.filter((event) => event.assetId === activeAssetId),
    [eventLayer.events, activeAssetId]
  );

  // Reset filters when the active asset changes
  useEffect(() => {
    setFilterState(DEFAULT_EVIDENCE_FILTER);
  }, [activeAssetId]);

  const filteredEvents = useMemo(
    () => filterEvidenceEvents(activeEvents, filterState),
    [activeEvents, filterState]
  );

  const groups = useMemo(() => groupEvidence(filteredEvents), [filteredEvents]);
  const modelGlobalGroups = useMemo(() => {
    // model/global is always from the unfiltered set — not affected by filters
    return eventLayer.events
      .filter((event) => event.assetId === activeAssetId)
      .filter((event) => event.relation === "model" || event.relation === "global");
  }, [eventLayer.events, activeAssetId]);

  const suppressedSummary = buildSuppressedSummary(eventLayer);

  const updatedLabel = mapData?.updatedAt
    ? new Date(mapData.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : null;

  if (assets.length === 0) {
    return (
      <div className="impact-v2 iv-evidence-page">
        <MarketingNav minimalAppLinks />
        <main className="iv-evidence-main">
          <p className="iv-meta">No assets available for this evidence view.</p>
        </main>
        <SiteFooter />
      </div>
    );
  }

  return (
    <div className="impact-v2 iv-evidence-page">
      <MarketingNav minimalAppLinks />

      <header className="iv-evidence-header">
        <ImpactTabNav active="evidence" assetId={activeAssetId} range={range} />
        <div className="iv-evidence-header-top">
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

      <main className="iv-evidence-main">
        {loadError ? (
          <div className="iv-dash-error" role="alert">
            <p>{loadError}</p>
            <button type="button" className="iv-btn iv-btn-secondary" onClick={() => void fetchMap(range)}>
              Retry
            </button>
          </div>
        ) : null}

        {isLoading ? (
          <div className="iv-evidence-loading" aria-busy="true">
            <div className="iv-dash-skeleton iv-dash-skeleton-title" />
            <div className="iv-dash-skeleton iv-dash-skeleton-row" />
            <div className="iv-dash-skeleton iv-dash-skeleton-row" />
            <div className="iv-dash-skeleton iv-dash-skeleton-row" />
            <div className="iv-dash-skeleton iv-dash-skeleton-row" />
            <div className="iv-dash-skeleton iv-dash-skeleton-row" />
            <div className="iv-dash-skeleton iv-dash-skeleton-row" />
          </div>
        ) : activeAsset ? (
          <>
            <EvidenceFilterBar
              total={activeEvents.length}
              filtered={filteredEvents.length}
              filters={filterState}
              onChange={setFilterState}
            />

            {!hasPrimaryEvidence(groups) && isDefaultFilter(filterState) ? (
              <p className="iv-meta iv-evidence-empty">
                No direct, regional, or contextual evidence for this asset in the selected range.
              </p>
            ) : null}

            {!hasPrimaryEvidence(groups) && !isDefaultFilter(filterState) && activeEvents.length > 0 ? (
              <p className="iv-evidence-filter-empty">
                No evidence matches the current filters.
              </p>
            ) : null}

            <EvidenceSection
              title="Direct"
              events={groups.direct}
              asset={activeAsset}
              omitRelation
            />
            <EvidenceSection
              title="Regional"
              events={groups.regional}
              asset={activeAsset}
              omitRelation
            />
            <EvidenceSection
              title="Contextual"
              events={groups.contextual}
              asset={activeAsset}
              omitRelation
            />

            {modelGlobalGroups.length > 0 ? (
              <details className="iv-evidence-model-global">
                <summary className="iv-evidence-model-global-summary">
                  Model &amp; global signals ({modelGlobalGroups.length})
                </summary>
                <p className="iv-meta iv-evidence-model-global-note">
                  Derived or out-of-scope context; not used for operational map pins.
                </p>
                <div className="iv-evidence-section-list">
                  {modelGlobalGroups.map((event) => (
                    <EvidenceRow
                      key={event.id}
                      event={event}
                      asset={activeAsset}
                      omitRelation
                      muted
                    />
                  ))}
                </div>
              </details>
            ) : null}
          </>
        ) : (
          <p className="iv-meta">Select an asset to view evidence.</p>
        )}

        <footer className="iv-evidence-footer">
          {suppressedSummary ? <span className="iv-meta">{suppressedSummary}</span> : null}
          {updatedLabel ? (
            <span className="iv-meta">Data refreshed {updatedLabel}</span>
          ) : null}
        </footer>
      </main>

      <SiteFooter />
    </div>
  );
}
