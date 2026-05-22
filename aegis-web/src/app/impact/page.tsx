"use client";

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
import { MarketingNav } from "@/components/ui/MarketingNav";
import { SiteFooter } from "@/components/ui/SiteFooter";
import { AssetUploadPanel } from "@/components/impact/AssetUploadPanel";
import { AssetTable } from "@/components/impact/AssetTable";
import { ImpactWatchlist } from "@/components/impact/ImpactWatchlist";
import { ExposureCard } from "@/components/impact/ExposureCard";
import { ImpactMethodologyPanel } from "@/components/impact/ImpactMethodologyPanel";

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
  const [mapData, setMapData] = useState<MapApiResponse | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);

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
    if (!selectedAssetId && alerts.length > 0) {
      setSelectedAssetId(alerts[0].asset.id);
    }
    if (selectedAssetId && !assets.some((a) => a.id === selectedAssetId)) {
      setSelectedAssetId(alerts[0]?.asset.id ?? null);
    }
  }, [alerts, assets, selectedAssetId]);

  const selectedAlert = selectedAssetId ? alertsByAsset[selectedAssetId] ?? null : null;

  const handleAssetsChange = useCallback((next: UserAsset[]) => {
    setAssets(next);
    if (next.length === 0) {
      clearStoredAssets();
      setSelectedAssetId(null);
    }
  }, []);

  const handleSelectAsset = useCallback((id: string) => {
    setSelectedAssetId(id);
  }, []);

  const handleSelectAlert = useCallback(
    (alertId: string) => {
      const found = alerts.find((a) => a.id === alertId);
      if (found) setSelectedAssetId(found.asset.id);
    },
    [alerts]
  );

  const providerFailures =
    mapData?.providerHealth?.filter((p) => p && p.ok === false).length ?? 0;
  const cacheStatus = mapData?.cache?.status ?? "—";
  const cacheAgeMs = mapData?.cache?.ageMs;
  const cacheAgeLabel = typeof cacheAgeMs === "number" ? formatAge(cacheAgeMs) : null;
  const updatedLabel = mapData?.updatedAt
    ? new Date(mapData.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "—";

  const statusLabel =
    loadState === "loading"
      ? "Loading signals…"
      : loadState === "ready"
      ? `Updated ${updatedLabel}`
      : loadState === "error"
      ? "Signals failed to load"
      : "Idle";

  return (
    <div className="impact-page">
      <MarketingNav />

      <main className="impact-main">
        <header className="impact-mission">
          <div className="impact-mission-title">
            <span className="impact-mission-brand">AEGIS · Impact Layer</span>
            <span className="impact-mission-sub">
              Source-backed exposure alerts for user-defined assets, suppliers, facilities, routes,
              and regions.
            </span>
          </div>
          <div className="impact-mission-pills">
            <span className="impact-mission-pill">Phase 1 MVP</span>
            <span className="impact-mission-pill">Assets stay local</span>
            <span className="impact-mission-pill">Score ≠ prediction</span>
            <span className="impact-mission-pill">Public sources</span>
            <span className="impact-mission-pill">AI explains · code scores</span>
          </div>
          <div className="impact-mission-controls">
            <div className="impact-range-buttons" role="tablist" aria-label="Time range">
              {RANGE_OPTIONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  role="tab"
                  aria-selected={range === r}
                  className={`impact-btn impact-btn-toggle${range === r ? " is-active" : ""}`}
                  onClick={() => setRange(r)}
                >
                  {r}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="impact-btn impact-btn-secondary impact-btn-sm"
              onClick={() => void fetchMap(range)}
              disabled={loadState === "loading"}
            >
              Refresh
            </button>
            <div className="impact-mission-telemetry">
              <span className={`impact-status-dot impact-status-${loadState}`} aria-hidden />
              <span>{statusLabel}</span>
              <span className="impact-mission-telemetry-sep">·</span>
              <span title="Map data cache status from /api/map">
                cache {cacheStatus}
                {cacheAgeLabel ? ` ${cacheAgeLabel}` : ""}
              </span>
              <span className="impact-mission-telemetry-sep">·</span>
              <span>
                providers{" "}
                {providerFailures > 0
                  ? `${providerFailures} failing`
                  : mapData
                  ? "ok"
                  : "—"}
              </span>
            </div>
          </div>
        </header>

        {loadError ? <p className="impact-load-error">{loadError}</p> : null}

        <div className="impact-console">
          <aside className="impact-console-col impact-console-portfolio">
            <AssetUploadPanel assetCount={assets.length} onAssetsChange={handleAssetsChange} />
            {assets.length > 0 ? (
              <AssetTable
                assets={assets}
                alertsByAsset={alertsByAsset}
                selectedAssetId={selectedAssetId}
                onSelect={handleSelectAsset}
              />
            ) : null}
          </aside>

          <section className="impact-console-col impact-console-watch">
            <ImpactWatchlist
              alerts={alerts}
              selectedAlertId={selectedAlert?.id ?? null}
              onSelect={handleSelectAlert}
            />
            <div className="impact-map-placeholder" aria-label="Phase 2 operational map placeholder">
              <div className="impact-map-placeholder-grid" aria-hidden />
              <div className="impact-map-placeholder-body">
                <span className="impact-eyebrow">Phase 2 · Operational Map</span>
                <p>
                  Phase 2 will add an operational map showing asset markers, nearby evidence
                  clusters, route exposure, and alert geometry. Phase 1 focuses on scoring,
                  evidence, and analyst workflow.
                </p>
                <div className="impact-map-placeholder-chips">
                  <span className="impact-map-chip">Asset markers</span>
                  <span className="impact-map-chip">Evidence clusters</span>
                  <span className="impact-map-chip">Route exposure</span>
                  <span className="impact-map-chip impact-map-chip-muted">Map layer pending</span>
                </div>
              </div>
            </div>
          </section>

          <aside className="impact-console-col impact-console-detail">
            <div className="impact-detail-sticky">
              <ExposureCard
                alert={selectedAlert}
                feedback={feedback}
                onFeedback={setFeedback}
              />
            </div>
          </aside>
        </div>

        <footer className="impact-foot-strip">
          <ImpactMethodologyPanel />
        </footer>
      </main>

      <SiteFooter />
    </div>
  );
}

function formatAge(ageMs: number): string {
  if (!Number.isFinite(ageMs) || ageMs < 0) return "";
  if (ageMs < 60 * 1000) return `${Math.round(ageMs / 1000)}s`;
  if (ageMs < 60 * 60 * 1000) return `${Math.round(ageMs / (60 * 1000))}m`;
  if (ageMs < 24 * 60 * 60 * 1000) return `${Math.round(ageMs / (60 * 60 * 1000))}h`;
  return `${Math.round(ageMs / (24 * 60 * 60 * 1000))}d`;
}
