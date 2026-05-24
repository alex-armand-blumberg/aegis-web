"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { loadAssets } from "@/lib/impact/storage";
import { MarketingNav } from "@/components/ui/MarketingNav";
import { SiteFooter } from "@/components/ui/SiteFooter";
import { filterAssetsBySelection } from "../dashboard/dashboardUtils";
import { ImpactTabNav } from "../shared/ImpactTabNav";
import { buildImpactSearchParams, parseRangeParam } from "../shared/impactUrlParams";
import {
  IMPACT_RANGE_OPTIONS,
  useImpactMapData,
  type ImpactRangeOption,
} from "../shared/useImpactMapData";
import { NeonStatus } from "./NeonStatus";
import { PipelineStrip } from "./PipelineStrip";
import { SourcesRow } from "./SourcesRow";
import {
  buildPlannedSourceRows,
  buildProviderSummary,
  buildSourceRows,
  rolesLabel,
  statusDotClass,
} from "./sourcesUtils";

type Props = {
  selectedAssetIds?: string[];
};

export function SourcesView({ selectedAssetIds }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlAssetId = searchParams.get("asset");
  const urlRange = parseRangeParam(searchParams.get("range"));

  const [contextAssetName, setContextAssetName] = useState<string | null>(null);

  const { range, setRange, mapData, loadError, fetchMap, isLoading } = useImpactMapData(
    urlRange ?? "7d"
  );

  useEffect(() => {
    if (urlRange && urlRange !== range) {
      setRange(urlRange);
    }
  }, [urlRange, range, setRange]);

  useEffect(() => {
    const assets = filterAssetsBySelection(loadAssets(), selectedAssetIds);
    if (urlAssetId) {
      const match = assets.find((a) => a.id === urlAssetId);
      setContextAssetName(match?.name ?? null);
    } else {
      setContextAssetName(assets[0]?.name ?? null);
    }
  }, [selectedAssetIds, urlAssetId]);

  const sourceRows = useMemo(() => buildSourceRows(mapData), [mapData]);
  const summary = useMemo(() => buildProviderSummary(sourceRows), [sourceRows]);
  const plannedRows = useMemo(() => buildPlannedSourceRows(), []);

  const updatedLabel = mapData?.updatedAt
    ? new Date(mapData.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : null;

  const cacheLabel = mapData?.cache
    ? `Cache ${mapData.cache.status} · ${Math.round(mapData.cache.ageMs / 1000)}s old`
    : null;

  const handleRangeChange = (nextRange: ImpactRangeOption) => {
    setRange(nextRange);
    const params = buildImpactSearchParams({ assetId: urlAssetId, range: nextRange });
    router.replace(`/impact/sources?${params.toString()}`);
  };

  return (
    <div className="impact-v2 iv-sources-page">
      <MarketingNav minimalAppLinks />

      <header className="iv-sources-header">
        <ImpactTabNav active="sources" assetId={urlAssetId} range={range} />
        <div className="iv-sources-header-top">
          <div className="iv-sources-intro">
            <h1 className="iv-sources-page-title">Sources &amp; data health</h1>
            <p className="iv-meta iv-sources-context">
              Map-wide provider status for{" "}
              {contextAssetName ? `${contextAssetName} · ` : ""}
              {range} range
            </p>
          </div>
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

      <main className="iv-sources-main">
        {loadError ? (
          <div className="iv-dash-error" role="alert">
            <p>{loadError}</p>
            <button type="button" className="iv-btn iv-btn-secondary" onClick={() => void fetchMap(range)}>
              Retry
            </button>
          </div>
        ) : null}

        <PipelineStrip />

        {isLoading ? (
          <div className="iv-sources-loading" aria-busy="true">
            <div className="iv-dash-skeleton iv-dash-skeleton-title" />
            <div className="iv-dash-skeleton iv-dash-skeleton-row" />
            <div className="iv-dash-skeleton iv-dash-skeleton-row" />
            <div className="iv-dash-skeleton iv-dash-skeleton-row" />
            <div className="iv-dash-skeleton iv-dash-skeleton-row" />
          </div>
        ) : (
          <>
            <section className="iv-sources-summary">
              <p className="iv-sources-summary-line">
                {summary.total > 0
                  ? `${summary.healthy} of ${summary.total} providers healthy`
                  : "No provider health returned for this fetch."}
                {summary.degraded > 0 ? ` · ${summary.degraded} need attention` : ""}
              </p>
              {cacheLabel || updatedLabel ? (
                <p className="iv-meta">
                  {[cacheLabel, updatedLabel ? `Data refreshed ${updatedLabel}` : null]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              ) : null}
            </section>

            {sourceRows.length > 0 ? (
              <section className="iv-sources-current">
                <h2 className="iv-sources-section-title">Current sources</h2>
                <div className="iv-sources-list">
                  {sourceRows.map((row) => (
                    <SourcesRow key={row.id} row={row} />
                  ))}
                </div>
              </section>
            ) : null}

            <section className="iv-sources-planned">
              <h2 className="iv-sources-section-title">Planned &amp; future</h2>
              <p className="iv-meta iv-sources-planned-note">
                These integrations are not part of the current map fetch.
              </p>
              <div className="iv-sources-list iv-sources-list-planned">
                {plannedRows.map((row) => (
                  <article key={row.id} className="iv-sources-row iv-sources-row-planned">
                    <div className="iv-sources-row-main">
                      <span className={statusDotClass("planned")} aria-hidden />
                      <div className="iv-sources-row-body">
                        <h3 className="iv-sources-row-title">{row.name}</h3>
                        <p className="iv-meta iv-sources-row-meta">
                          Role: {rolesLabel(row.roles)}
                          {row.costNote ? ` · ${row.costNote}` : ""}
                        </p>
                        <p className="iv-meta">{row.note}</p>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <NeonStatus />
          </>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}
