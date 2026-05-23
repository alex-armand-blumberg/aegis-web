"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { MapApiResponse } from "@/lib/intel/types";
import { buildMapDataUrl } from "@/lib/instantLoad";
import { buildExposureAlerts } from "@/lib/impact/scoring";
import {
  clearAssets as clearStoredAssets,
  loadAssets,
  loadFeedback,
  saveAssets,
} from "@/lib/impact/storage";
import type { AlertFeedback, ExposureAlert, UserAsset } from "@/lib/impact/types";
import { ImpactWorkspaceNav } from "@/components/impact/ImpactWorkspaceNav";
import { AssetUploadPanel, PortfolioManagePanel } from "@/components/impact/AssetUploadPanel";
import { AssetTable } from "@/components/impact/AssetTable";
import { ImpactWatchlist } from "@/components/impact/ImpactWatchlist";
import { ExposureCard } from "@/components/impact/ExposureCard";
import { ImpactMethodologyPanel } from "@/components/impact/ImpactMethodologyPanel";

const ImpactMapPanel = dynamic(() => import("@/components/impact/ImpactMapPanel").then((m) => m.ImpactMapPanel), {
  ssr: false,
});

const RANGE_OPTIONS = ["24h", "7d", "30d"] as const;
type RangeOption = (typeof RANGE_OPTIONS)[number];

const IMPACT_LAYERS = [
  "conflictsBattles",
  "conflictsExplosions",
  "conflictsCivilians",
  "conflictsStrategic",
  "conflictsProtests",
  "conflictsRiots",
  "liveStrikes",
  "vessels",
  "carriers",
  "news",
  "escalationRisk",
  "hotspots",
  "infrastructure",
].join(",");

type LoadState = "idle" | "loading" | "ready" | "error";

export default function ImpactPage() {
  const [assets, setAssets] = useState<UserAsset[]>([]);
  const [feedback, setFeedback] = useState<AlertFeedback[]>([]);
  const [range, setRange] = useState<RangeOption>("7d");
  const [assetSearch, setAssetSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | UserAsset["type"]>("all");
  const [importanceFilter, setImportanceFilter] = useState<"all" | UserAsset["importance"]>("all");
  const [regionFilter, setRegionFilter] = useState<"all" | string>("all");
  const [mapData, setMapData] = useState<MapApiResponse | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [selectionDismissed, setSelectionDismissed] = useState(false);

  useEffect(() => {
    setAssets(loadAssets());
    setFeedback(loadFeedback());
  }, []);

  useEffect(() => {
    saveAssets(assets);
  }, [assets]);

  const fetchMap = useCallback(async (r: RangeOption) => {
    setLoadState("loading");
    setLoadError(null);
    try {
      const url = buildMapDataUrl(r, IMPACT_LAYERS);
      const res = await fetch(url, { cache: "no-store" });
      const data = (await res.json()) as MapApiResponse & { error?: string };
      if (!res.ok || data.error) {
        throw new Error(data.error ?? `Failed to fetch map data (HTTP ${res.status})`);
      }
      setMapData(data);
      setLoadState("ready");
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to fetch map data.");
      setLoadState("error");
    }
  }, []);

  useEffect(() => {
    void fetchMap(range);
  }, [range, fetchMap]);

  const alerts: ExposureAlert[] = useMemo(() => {
    if (!mapData || assets.length === 0) return [];
    return buildExposureAlerts({ assets, mapData, range });
  }, [assets, mapData, range]);

  const alertsByAsset = useMemo(() => {
    const map: Record<string, ExposureAlert> = {};
    for (const a of alerts) map[a.asset.id] = a;
    return map;
  }, [alerts]);

  useEffect(() => {
    if (!selectionDismissed && !selectedAssetId && alerts.length > 0) {
      setSelectedAssetId(alerts[0].asset.id);
    }
    if (selectedAssetId && !assets.some((a) => a.id === selectedAssetId)) {
      setSelectedAssetId(selectionDismissed ? null : (alerts[0]?.asset.id ?? null));
    }
  }, [alerts, assets, selectedAssetId, selectionDismissed]);

  const selectedAlert = selectedAssetId ? alertsByAsset[selectedAssetId] ?? null : null;

  const regionOptions = useMemo(() => {
    const set = new Set<string>();
    for (const asset of assets) {
      if (asset.country) set.add(asset.country);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [assets]);

  const handleAssetsChange = useCallback((next: UserAsset[]) => {
    setAssets(next);
    if (next.length === 0) {
      clearStoredAssets();
      setSelectedAssetId(null);
      setSelectionDismissed(false);
    }
    if (next.length > 0) {
      setTypeFilter("all");
      setImportanceFilter("all");
      setRegionFilter("all");
      setAssetSearch("");
      setSelectionDismissed(false);
    }
  }, []);

  const handleSelectAsset = useCallback((id: string) => {
    setSelectionDismissed(false);
    setSelectedAssetId(id);
  }, []);

  const handleSelectAlert = useCallback(
    (alertId: string) => {
      const found = alerts.find((a) => a.id === alertId);
      if (found) {
        setSelectionDismissed(false);
        setSelectedAssetId(found.asset.id);
      }
    },
    [alerts]
  );

  const handleDismissSelection = useCallback(() => {
    setSelectionDismissed(true);
    setSelectedAssetId(null);
  }, []);

  const providerFailures =
    mapData?.providerHealth?.filter((p) => p && p.ok === false).length ?? 0;
  const updatedLabel = mapData?.updatedAt
    ? new Date(mapData.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div className="impact-page">
      <ImpactWorkspaceNav loadState={loadState} providerFailures={providerFailures} />

      <main className="impact-main">
        {loadError ? <p className="impact-load-error">{loadError}</p> : null}

        <div className="impact-console">
          <aside className="impact-console-col impact-console-portfolio">
            <div className="impact-portfolio-shell">
            <AssetUploadPanel assetCount={assets.length} onAssetsChange={handleAssetsChange} />
            {assets.length > 0 ? (
              <div className="impact-portfolio-filters">
                <label className="impact-portfolio-search">
                  <input
                    type="search"
                    value={assetSearch}
                    onChange={(event) => setAssetSearch(event.target.value)}
                    placeholder="Search assets..."
                  />
                  <span className="impact-portfolio-search-icon" aria-hidden>
                    ⌕
                  </span>
                </label>
                <div className="impact-portfolio-filter-grid">
                  <label className="impact-filter-field">
                    <span>Type</span>
                    <select
                      value={typeFilter}
                      onChange={(event) =>
                        setTypeFilter(event.target.value as "all" | UserAsset["type"])
                      }
                    >
                      <option value="all">All Types</option>
                      {Array.from(new Set(assets.map((asset) => asset.type))).map((type) => (
                        <option key={type} value={type}>
                          {type.replace(/_/g, " ")}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="impact-filter-field">
                    <span>Importance</span>
                    <select
                      value={importanceFilter}
                      onChange={(event) =>
                        setImportanceFilter(event.target.value as "all" | UserAsset["importance"])
                      }
                    >
                      <option value="all">All</option>
                      <option value="critical">Critical</option>
                      <option value="high">High</option>
                      <option value="medium">Medium</option>
                      <option value="low">Low</option>
                    </select>
                  </label>
                  <label className="impact-filter-field">
                    <span>Region</span>
                    <select
                      value={regionFilter}
                      onChange={(event) => setRegionFilter(event.target.value)}
                    >
                      <option value="all">All Regions</option>
                      {regionOptions.map((region) => (
                        <option key={region} value={region}>
                          {region}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
            ) : null}
            {assets.length > 0 ? (
              <AssetTable
                assets={assets}
                alertsByAsset={alertsByAsset}
                selectedAssetId={selectedAssetId}
                onSelect={handleSelectAsset}
                search={assetSearch}
                typeFilter={typeFilter}
                importanceFilter={importanceFilter}
                regionFilter={regionFilter}
              />
            ) : null}
            {assets.length > 0 ? (
              <PortfolioManagePanel onAssetsChange={handleAssetsChange} />
            ) : null}
            </div>
          </aside>

          <section className="impact-console-col impact-console-watch">
            <ImpactMapPanel
              assets={assets}
              alerts={alerts}
              alertsByAsset={alertsByAsset}
              selectedAssetId={selectedAssetId}
              selectedAlert={selectedAlert}
              onSelectAsset={handleSelectAsset}
              onSelectAlert={handleSelectAlert}
              range={range}
              rangeOptions={RANGE_OPTIONS}
              onRangeChange={(value) => setRange(value as RangeOption)}
              onRefresh={() => void fetchMap(range)}
              loadState={loadState}
              updatedLabel={updatedLabel}
            />
            <ImpactWatchlist
              alerts={alerts}
              selectedAlertId={selectedAlert?.id ?? null}
              onSelect={handleSelectAlert}
            />
          </section>

          <aside className="impact-console-col impact-console-detail">
            <div className="impact-detail-sticky">
              <ExposureCard
                alert={selectedAlert}
                feedback={feedback}
                onFeedback={setFeedback}
                onDismiss={handleDismissSelection}
              />
            </div>
          </aside>
        </div>

        <footer className="impact-foot-strip">
          <ImpactMethodologyPanel updatedLabel={updatedLabel} />
        </footer>
      </main>
    </div>
  );
}
