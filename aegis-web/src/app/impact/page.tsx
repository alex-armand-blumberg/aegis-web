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

  const fetchMap = useCallback(
    async (r: RangeOption) => {
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
    },
    []
  );

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
  const cacheStatus = mapData?.cache?.status ?? "unknown";
  const cacheAgeMs = mapData?.cache?.ageMs;
  const cacheAgeLabel =
    typeof cacheAgeMs === "number" ? formatAge(cacheAgeMs) : null;

  return (
    <div className="impact-page">
      <MarketingNav />

      <main className="impact-main">
        <header className="impact-hero">
          <span className="impact-eyebrow">Phase 1 MVP · prototype</span>
          <h1>AEGIS Impact Layer</h1>
          <p className="impact-hero-sub">
            Map public geopolitical signals against the assets, suppliers, facilities, routes, and
            regions you care about.
          </p>
          <p className="impact-hero-explainer">
            Upload a simple asset list or load a demo portfolio. AEGIS compares each asset with
            public conflict, news, infrastructure, maritime, humanitarian, disaster, and
            escalation-context signals, then produces source-backed exposure alerts.
          </p>
          <p className="impact-hero-disclaimer">
            Exposure scores are <strong>not predictions or probabilities</strong>. They rank
            public-source signal pressure and evidence quality for analyst review.
          </p>
          <p className="impact-hero-privacy">
            For this prototype, asset lists are processed locally in your browser. Do not upload
            sensitive or confidential asset lists.
          </p>
        </header>

        <section className="impact-control-panel">
          <div className="impact-control-group">
            <span className="impact-eyebrow">Range</span>
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
          </div>
          <div className="impact-control-group">
            <span className="impact-eyebrow">Signals</span>
            <div className="impact-signals-status">
              <span className={`impact-status-dot impact-status-${loadState}`} aria-hidden />
              <span>
                {loadState === "loading"
                  ? "Loading public signals…"
                  : loadState === "ready"
                  ? `Updated ${mapData?.updatedAt ? new Date(mapData.updatedAt).toLocaleTimeString() : ""}`
                  : loadState === "error"
                  ? "Signals failed to load"
                  : "Idle"}
              </span>
              <button
                type="button"
                className="impact-btn impact-btn-secondary"
                onClick={() => void fetchMap(range)}
                disabled={loadState === "loading"}
              >
                Refresh signals
              </button>
            </div>
            {loadError ? <p className="impact-load-error">{loadError}</p> : null}
            <div className="impact-telemetry">
              <span>Cache: {cacheStatus}{cacheAgeLabel ? ` · ${cacheAgeLabel}` : ""}</span>
              <span>
                Providers:{" "}
                {providerFailures > 0
                  ? `${providerFailures} reporting failures`
                  : mapData
                  ? "all reporting"
                  : "—"}
              </span>
              {mapData?.range ? <span>Window: {mapData.range}</span> : null}
            </div>
          </div>
        </section>

        <div className="impact-workspace">
          <section className="impact-col impact-col-assets">
            <AssetUploadPanel assetCount={assets.length} onAssetsChange={handleAssetsChange} />
            <AssetTable
              assets={assets}
              alertsByAsset={alertsByAsset}
              selectedAssetId={selectedAssetId}
              onSelect={handleSelectAsset}
            />
          </section>

          <section className="impact-col impact-col-watchlist">
            <header className="impact-col-head">
              <span className="impact-eyebrow">Exposure watchlist</span>
              <h2>Ranked by exposure score</h2>
            </header>
            <ImpactWatchlist
              alerts={alerts}
              selectedAlertId={selectedAlert?.id ?? null}
              onSelect={handleSelectAlert}
            />
            <div className="impact-map-placeholder">
              <span className="impact-eyebrow">Visualization</span>
              <p>
                Map visualization will be added in Phase 2. Phase 1 focuses on the exposure
                methodology, evidence cards, and analyst workflow.
              </p>
            </div>
          </section>

          <section className="impact-col impact-col-detail">
            <ExposureCard
              alert={selectedAlert}
              feedback={feedback}
              onFeedback={setFeedback}
            />
          </section>
        </div>

        <ImpactMethodologyPanel />
      </main>

      <SiteFooter />
    </div>
  );
}

function formatAge(ageMs: number): string {
  if (!Number.isFinite(ageMs) || ageMs < 0) return "—";
  if (ageMs < 60 * 1000) return `${Math.round(ageMs / 1000)}s old`;
  if (ageMs < 60 * 60 * 1000) return `${Math.round(ageMs / (60 * 1000))}m old`;
  if (ageMs < 24 * 60 * 60 * 1000) return `${Math.round(ageMs / (60 * 60 * 1000))}h old`;
  return `${Math.round(ageMs / (24 * 60 * 60 * 1000))}d old`;
}
