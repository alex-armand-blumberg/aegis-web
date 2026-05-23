"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
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
import { ImpactWatchlist, type FilterMode } from "@/components/impact/ImpactWatchlist";
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
type DragSide = "left" | "right" | null;

const LEFT_PANEL_WIDTH = { min: 220, max: 520, default: 272, collapsed: 36 } as const;
const RIGHT_PANEL_WIDTH = { min: 280, max: 620, default: 400, collapsed: 36 } as const;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function loadPanelWidth(key: "left" | "right", fallback: number, min: number, max: number): number {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(`impact-panel-width-${key}`);
    if (!raw) return fallback;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return fallback;
    return clamp(parsed, min, max);
  } catch {
    return fallback;
  }
}

function loadPanelCollapsed(key: "left" | "right"): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(`impact-panel-collapsed-${key}`);
    return raw === "1";
  } catch {
    return false;
  }
}

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
  const [watchlistFilter, setWatchlistFilter] = useState<FilterMode>("all");
  const [flyToCoord, setFlyToCoord] = useState<{ lat: number; lon: number; id: string } | null>(
    null
  );
  const [leftWidth, setLeftWidth] = useState(() =>
    loadPanelWidth("left", LEFT_PANEL_WIDTH.default, LEFT_PANEL_WIDTH.min, LEFT_PANEL_WIDTH.max)
  );
  const [rightWidth, setRightWidth] = useState(() =>
    loadPanelWidth("right", RIGHT_PANEL_WIDTH.default, RIGHT_PANEL_WIDTH.min, RIGHT_PANEL_WIDTH.max)
  );
  const [leftCollapsed, setLeftCollapsed] = useState(() => loadPanelCollapsed("left"));
  const [rightCollapsed, setRightCollapsed] = useState(() => loadPanelCollapsed("right"));
  const [dragSide, setDragSide] = useState<DragSide>(null);
  const [dragOriginX, setDragOriginX] = useState(0);
  const [dragOriginWidth, setDragOriginWidth] = useState(0);

  useEffect(() => {
    setAssets(loadAssets());
    setFeedback(loadFeedback());
  }, []);

  useEffect(() => {
    saveAssets(assets);
  }, [assets]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem("impact-panel-width-left", String(leftWidth));
    } catch {
      // Ignore storage errors to keep dashboard functional.
    }
  }, [leftWidth]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem("impact-panel-width-right", String(rightWidth));
    } catch {
      // Ignore storage errors to keep dashboard functional.
    }
  }, [rightWidth]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem("impact-panel-collapsed-left", leftCollapsed ? "1" : "0");
    } catch {
      // Ignore storage errors to keep dashboard functional.
    }
  }, [leftCollapsed]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem("impact-panel-collapsed-right", rightCollapsed ? "1" : "0");
    } catch {
      // Ignore storage errors to keep dashboard functional.
    }
  }, [rightCollapsed]);

  useEffect(() => {
    if (!dragSide) return;
    const onMouseMove = (event: MouseEvent) => {
      if (dragSide === "left") {
        const next = clamp(
          dragOriginWidth + (event.clientX - dragOriginX),
          LEFT_PANEL_WIDTH.min,
          LEFT_PANEL_WIDTH.max
        );
        setLeftWidth(next);
      } else if (dragSide === "right") {
        const next = clamp(
          dragOriginWidth - (event.clientX - dragOriginX),
          RIGHT_PANEL_WIDTH.min,
          RIGHT_PANEL_WIDTH.max
        );
        setRightWidth(next);
      }
    };
    const onMouseUp = () => setDragSide(null);

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [dragOriginWidth, dragOriginX, dragSide]);

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

  const filteredAssets = useMemo(() => {
    const query = assetSearch.trim().toLowerCase();
    return assets.filter((asset) => {
      if (typeFilter !== "all" && asset.type !== typeFilter) return false;
      if (importanceFilter !== "all" && asset.importance !== importanceFilter) return false;
      if (regionFilter !== "all" && asset.country !== regionFilter) return false;
      if (!query) return true;
      return `${asset.name} ${asset.city ?? ""} ${asset.country} ${asset.type} ${asset.importance}`
        .toLowerCase()
        .includes(query);
    });
  }, [assetSearch, assets, importanceFilter, regionFilter, typeFilter]);

  const watchlistVisibleAlerts = useMemo(() => {
    if (watchlistFilter === "all") return alerts;
    return alerts.filter((a) => {
      if (watchlistFilter === "low") return a.level === "low" || a.level === "guarded";
      return a.level === watchlistFilter;
    });
  }, [alerts, watchlistFilter]);

  const visibleAssetIds = useMemo(() => {
    const portfolioSet = new Set(filteredAssets.map((asset) => asset.id));
    if (watchlistFilter === "all") return portfolioSet;
    const watchSet = new Set(watchlistVisibleAlerts.map((a) => a.asset.id));
    const intersect = new Set<string>();
    for (const id of portfolioSet) {
      if (watchSet.has(id)) intersect.add(id);
    }
    return intersect;
  }, [filteredAssets, watchlistFilter, watchlistVisibleAlerts]);

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

  const handleFlyToEvidence = useCallback((lat: number, lon: number) => {
    setFlyToCoord({
      lat,
      lon,
      id: `${lat.toFixed(5)}:${lon.toFixed(5)}:${Date.now()}`,
    });
  }, []);

  const providerFailures =
    mapData?.providerHealth?.filter((p) => p && p.ok === false).length ?? 0;
  const updatedLabel = mapData?.updatedAt
    ? new Date(mapData.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : null;

  const consoleStyle = useMemo(
    () =>
      ({
        "--impact-left-col": `${leftCollapsed ? LEFT_PANEL_WIDTH.collapsed : leftWidth}px`,
        "--impact-right-col": `${rightCollapsed ? RIGHT_PANEL_WIDTH.collapsed : rightWidth}px`,
      }) as CSSProperties,
    [leftCollapsed, leftWidth, rightCollapsed, rightWidth]
  );

  return (
    <div className="impact-page">
      <ImpactWorkspaceNav loadState={loadState} providerFailures={providerFailures} />

      <main className="impact-main">
        {loadError ? <p className="impact-load-error">{loadError}</p> : null}

        <div
          className={`impact-console${leftCollapsed ? " is-left-collapsed" : ""}${rightCollapsed ? " is-right-collapsed" : ""}`}
          style={consoleStyle}
        >
          <aside
            className={`impact-console-col impact-console-portfolio${leftCollapsed ? " is-collapsed" : ""}`}
          >
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
                assets={filteredAssets}
                alertsByAsset={alertsByAsset}
                selectedAssetId={selectedAssetId}
                onSelect={handleSelectAsset}
              />
            ) : null}
            {assets.length > 0 && filteredAssets.length === 0 ? (
              <div className="impact-asset-list impact-asset-list-empty">
                <p>No assets match current portfolio filters.</p>
              </div>
            ) : null}
            {assets.length > 0 ? (
              <PortfolioManagePanel onAssetsChange={handleAssetsChange} />
            ) : null}
            </div>
          </aside>
          <div className="impact-console-divider impact-console-divider-left">
            <button
              type="button"
              className="impact-console-collapse-btn"
              aria-label={leftCollapsed ? "Expand left panel" : "Collapse left panel"}
              onClick={() => setLeftCollapsed((value) => !value)}
            >
              {leftCollapsed ? "›" : "‹"}
            </button>
            {!leftCollapsed ? (
              <button
                type="button"
                className="impact-console-resize-grip"
                aria-label="Resize left panel"
                onMouseDown={(event) => {
                  event.preventDefault();
                  setDragSide("left");
                  setDragOriginX(event.clientX);
                  setDragOriginWidth(leftWidth);
                }}
              />
            ) : null}
          </div>

          <section className="impact-console-col impact-console-watch">
            <ImpactMapPanel
              assets={assets}
              visibleAssetIds={visibleAssetIds}
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
              flyToCoord={flyToCoord}
            />
            <ImpactWatchlist
              alerts={alerts}
              selectedAlertId={selectedAlert?.id ?? null}
              onSelect={handleSelectAlert}
              filter={watchlistFilter}
              onFilterChange={setWatchlistFilter}
            />
          </section>
          <div className="impact-console-divider impact-console-divider-right">
            {!rightCollapsed ? (
              <button
                type="button"
                className="impact-console-resize-grip"
                aria-label="Resize right panel"
                onMouseDown={(event) => {
                  event.preventDefault();
                  setDragSide("right");
                  setDragOriginX(event.clientX);
                  setDragOriginWidth(rightWidth);
                }}
              />
            ) : null}
            <button
              type="button"
              className="impact-console-collapse-btn"
              aria-label={rightCollapsed ? "Expand right panel" : "Collapse right panel"}
              onClick={() => setRightCollapsed((value) => !value)}
            >
              {rightCollapsed ? "‹" : "›"}
            </button>
          </div>

          <aside
            className={`impact-console-col impact-console-detail${rightCollapsed ? " is-collapsed" : ""}`}
          >
            <div className="impact-detail-sticky">
              <ExposureCard
                alert={selectedAlert}
                feedback={feedback}
                onFeedback={setFeedback}
                onDismiss={handleDismissSelection}
                onFlyTo={handleFlyToEvidence}
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
