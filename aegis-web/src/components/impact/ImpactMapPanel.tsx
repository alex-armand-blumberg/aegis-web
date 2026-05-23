"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Map, {
  Layer,
  Popup,
  Source,
  type LayerProps,
  type MapLayerMouseEvent,
  type MapRef,
} from "react-map-gl/maplibre";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { ExposureAlert, UserAsset } from "@/lib/impact/types";
import {
  BASEMAP_STYLE,
  buildAssetGeoJson,
  buildEvidenceGeoJson,
  buildLinkGeoJson,
  computeBounds,
  formatCoordLat,
  formatCoordLon,
} from "@/lib/impact/mapGeo";

type Props = {
  assets: UserAsset[];
  visibleAssetIds: Set<string>;
  alerts: ExposureAlert[];
  alertsByAsset: Record<string, ExposureAlert>;
  selectedAssetId: string | null;
  selectedAlert: ExposureAlert | null;
  range: string;
  rangeOptions: readonly string[];
  onRangeChange: (range: string) => void;
  onRefresh: () => void;
  loadState: "idle" | "loading" | "ready" | "error";
  updatedLabel: string | null;
  onSelectAsset: (assetId: string) => void;
  onSelectAlert: (alertId: string) => void;
  flyToCoord?: { lat: number; lon: number; id: string } | null;
};

type HoverState = {
  kind: "asset" | "evidence";
  lon: number;
  lat: number;
  title: string;
  subtitle: string;
} | null;

const INITIAL_VIEW_STATE = {
  longitude: 0,
  latitude: 20,
  zoom: 1.5,
  pitch: 0,
  bearing: 0,
};

const ASSET_LAYER_ID = "impact-assets";
const EVIDENCE_LAYER_ID = "impact-evidence";
const EVIDENCE_MODEL_LAYER_ID = "impact-evidence-model-context";
const LINK_LAYER_ID = "impact-links";
const SELECTED_RING_OUTER_ID = "impact-selected-ring-outer";
const SELECTED_RING_MID_ID = "impact-selected-ring-mid";
const SELECTED_RING_INNER_ID = "impact-selected-ring-inner";
const SELECTED_STAR_LAYER_ID = "impact-selected-star";
const SELECTED_LABEL_LAYER_ID = "impact-selected-label";

const ASSET_LAYER: LayerProps = {
  id: ASSET_LAYER_ID,
  type: "circle",
  paint: {
    "circle-radius": ["case", ["get", "selected"], 6, 4.8],
    "circle-color": [
      "match",
      ["get", "level"],
      "critical",
      "#8b1a1a",
      "high",
      "#7a3d0f",
      "elevated",
      "rgba(0,0,0,0)",
      "guarded",
      "#2d3748",
      "#2d3748",
    ],
    "circle-stroke-color": [
      "case",
      ["==", ["get", "level"], "critical"],
      "rgba(220,88,88,0.7)",
      ["==", ["get", "level"], "high"],
      "rgba(180,100,40,0.6)",
      ["==", ["get", "level"], "elevated"],
      "rgba(160,130,60,0.65)",
      ["get", "selected"],
      "rgba(241,245,249,0.88)",
      "rgba(148,163,184,0.25)",
    ],
    "circle-stroke-width": [
      "case",
      ["==", ["get", "level"], "elevated"],
      1,
      ["get", "selected"],
      1.2,
      0.8,
    ],
    "circle-opacity": 0.95,
  },
};

const EVIDENCE_LAYER: LayerProps = {
  id: EVIDENCE_LAYER_ID,
  type: "circle",
  filter: ["==", ["get", "isModelContext"], false],
  paint: {
    "circle-radius": [
      "match",
      ["get", "severity"],
      "critical",
      3.8,
      "high",
      3.4,
      "medium",
      3,
      2.6,
    ],
    "circle-color": [
      "match",
      ["get", "severity"],
      "critical",
      "#b85252",
      "high",
      "#9a6b30",
      "medium",
      "#857952",
      "#546070",
    ],
    "circle-stroke-color": "rgba(8,11,18,0.85)",
    "circle-stroke-width": 0.7,
    "circle-opacity": 0.88,
  },
};

const EVIDENCE_MODEL_LAYER: LayerProps = {
  id: EVIDENCE_MODEL_LAYER_ID,
  type: "circle",
  filter: ["==", ["get", "isModelContext"], true],
  paint: {
    "circle-radius": 4.8,
    "circle-color": "rgba(0,0,0,0)",
    "circle-stroke-color": "rgba(148,163,184,0.75)",
    "circle-stroke-width": 1,
    "circle-opacity": 0.85,
  },
};

const LINK_LAYER: LayerProps = {
  id: LINK_LAYER_ID,
  type: "line",
  paint: {
    "line-color": [
      "case",
      ["get", "isModelContext"],
      "rgba(148,163,184,0.18)",
      "rgba(148,163,184,0.28)",
    ],
    "line-width": 0.6,
    "line-opacity": 0.3,
  },
};

const SELECTED_RING_OUTER: LayerProps = {
  id: SELECTED_RING_OUTER_ID,
  type: "circle",
  filter: ["==", ["get", "selected"], true],
  paint: {
    "circle-radius": 26,
    "circle-color": "rgba(0,0,0,0)",
    "circle-stroke-color": "rgba(255,255,255,0.12)",
    "circle-stroke-width": 1.2,
    "circle-opacity": 0.85,
  },
};

const SELECTED_RING_MID: LayerProps = {
  id: SELECTED_RING_MID_ID,
  type: "circle",
  filter: ["==", ["get", "selected"], true],
  paint: {
    "circle-radius": 18,
    "circle-color": "rgba(0,0,0,0)",
    "circle-stroke-color": "rgba(255,255,255,0.22)",
    "circle-stroke-width": 1.2,
    "circle-opacity": 0.88,
  },
};

const SELECTED_RING_INNER: LayerProps = {
  id: SELECTED_RING_INNER_ID,
  type: "circle",
  filter: ["==", ["get", "selected"], true],
  paint: {
    "circle-radius": 11,
    "circle-color": "rgba(0,0,0,0)",
    "circle-stroke-color": "rgba(255,255,255,0.42)",
    "circle-stroke-width": 1.4,
    "circle-opacity": 0.9,
  },
};

const SELECTED_STAR_LAYER: LayerProps = {
  id: SELECTED_STAR_LAYER_ID,
  type: "symbol",
  filter: ["==", ["get", "selected"], true],
  layout: {
    "text-field": "✦",
    "text-size": 11,
    "text-allow-overlap": true,
    "text-ignore-placement": true,
  },
  paint: {
    "text-color": "#f1f5f9",
    "text-halo-color": "rgba(0,0,0,0.85)",
    "text-halo-width": 1,
  },
};

const SELECTED_LABEL_LAYER: LayerProps = {
  id: SELECTED_LABEL_LAYER_ID,
  type: "symbol",
  filter: ["==", ["get", "selected"], true],
  layout: {
    "text-field": ["upcase", ["get", "name"]],
    "text-size": 9.5,
    "text-anchor": "bottom",
    "text-offset": [0, -2.8],
    "text-allow-overlap": true,
    "text-ignore-placement": true,
    "text-letter-spacing": 0.08,
  },
  paint: {
    "text-color": "rgba(241,245,249,0.92)",
    "text-halo-color": "rgba(0,0,0,0.9)",
    "text-halo-width": 1.2,
  },
};

function evidenceSubtitle(alert: ExposureAlert, properties: Record<string, unknown>): string {
  const severity = typeof properties.severity === "string" ? properties.severity : "low";
  const distance =
    typeof properties.distanceKm === "number" && Number.isFinite(properties.distanceKm)
      ? properties.distanceKm < 100
        ? `${properties.distanceKm.toFixed(1)} km`
        : `${Math.round(properties.distanceKm)} km`
      : "distance —";
  return `${severity} severity · ${distance} · ${alert.asset.name}`;
}

export function ImpactMapPanel({
  assets,
  visibleAssetIds,
  alerts,
  alertsByAsset,
  selectedAssetId,
  selectedAlert,
  range,
  rangeOptions,
  onRangeChange,
  onRefresh,
  loadState,
  updatedLabel,
  onSelectAsset,
  onSelectAlert,
  flyToCoord,
}: Props) {
  const mapPanelRef = useRef<HTMLElement | null>(null);
  const mapRef = useRef<MapRef | null>(null);
  const userHasMoved = useRef(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [hover, setHover] = useState<HoverState>(null);
  const [showEvidence, setShowEvidence] = useState(true);
  const [lastMapCoord, setLastMapCoord] = useState<{ lat: number; lon: number } | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const selectedAsset = useMemo(
    () => assets.find((asset) => asset.id === selectedAssetId) ?? null,
    [assets, selectedAssetId]
  );

  const selectedEvidence = selectedAlert?.evidence ?? [];

  const assetGeoJson = useMemo(
    () =>
      buildAssetGeoJson({
        assets,
        alertsByAsset,
        selectedAssetId,
        visibleAssetIds,
      }),
    [assets, alertsByAsset, selectedAssetId, visibleAssetIds]
  );
  const evidenceGeoJson = useMemo(
    () => buildEvidenceGeoJson(selectedEvidence),
    [selectedEvidence]
  );
  const linkGeoJson = useMemo(
    () => buildLinkGeoJson({ asset: selectedAsset, evidence: selectedEvidence }),
    [selectedAsset, selectedEvidence]
  );

  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;
    if (userHasMoved.current) return;
    const visibleAssets = assets.filter(
      (asset) => visibleAssetIds.has(asset.id) || asset.id === selectedAssetId
    );
    const points = [
      ...visibleAssets.map((asset) => ({ lat: asset.lat, lon: asset.lon })),
      ...selectedEvidence.map((item) => ({ lat: item.lat, lon: item.lon })),
    ];
    const bounds = computeBounds(points);
    if (!bounds) return;
    mapRef.current.fitBounds(bounds, {
      padding: 56,
      duration: 700,
      maxZoom: 6,
    });
  }, [assets, mapLoaded, selectedEvidence, selectedAssetId, visibleAssetIds]);

  useEffect(() => {
    userHasMoved.current = false;
  }, [selectedAssetId]);

  useEffect(() => {
    if (!mapLoaded || !mapRef.current || !flyToCoord) return;
    userHasMoved.current = true;
    mapRef.current.flyTo({
      center: [flyToCoord.lon, flyToCoord.lat],
      zoom: Math.max(mapRef.current.getZoom(), 7.5),
      duration: 650,
    });
    setLastMapCoord({ lat: flyToCoord.lat, lon: flyToCoord.lon });
  }, [flyToCoord, mapLoaded]);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === mapPanelRef.current);
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
    };
  }, []);

  const interactiveLayerIds = showEvidence
    ? [ASSET_LAYER_ID, EVIDENCE_LAYER_ID, EVIDENCE_MODEL_LAYER_ID]
    : [ASSET_LAYER_ID];

  const handleMapClick = (event: MapLayerMouseEvent) => {
    const feature = event.features?.[0];
    if (!feature || !feature.properties) return;
    const layerId = feature.layer?.id;
    const properties = feature.properties as Record<string, unknown>;

    if (layerId === ASSET_LAYER_ID && typeof properties.assetId === "string") {
      onSelectAsset(properties.assetId);
      return;
    }

    if (
      (layerId === EVIDENCE_LAYER_ID || layerId === EVIDENCE_MODEL_LAYER_ID) &&
      typeof selectedAlert?.id === "string"
    ) {
      onSelectAlert(selectedAlert.id);
    }
  };

  const handleHover = (event: MapLayerMouseEvent) => {
    setLastMapCoord({ lat: event.lngLat.lat, lon: event.lngLat.lng });
    const feature = event.features?.[0];
    if (!feature || !feature.properties) {
      setHover(null);
      return;
    }
    const properties = feature.properties as Record<string, unknown>;
    const [lon, lat] = feature.geometry.type === "Point" ? feature.geometry.coordinates : [0, 0];
    const layerId = feature.layer?.id;

    if (layerId === ASSET_LAYER_ID && typeof properties.name === "string") {
      const level = typeof properties.level === "string" ? properties.level : "low";
      const score = typeof properties.score === "number" ? Math.round(properties.score) : 0;
      setHover({
        kind: "asset",
        lon,
        lat,
        title: properties.name,
        subtitle: `asset · ${level} · score ${score}`,
      });
      return;
    }

    if (
      (layerId === EVIDENCE_LAYER_ID || layerId === EVIDENCE_MODEL_LAYER_ID) &&
      typeof properties.title === "string" &&
      selectedAlert
    ) {
      setHover({
        kind: "evidence",
        lon,
        lat,
        title: properties.title,
        subtitle: evidenceSubtitle(selectedAlert, properties),
      });
      return;
    }

    setHover(null);
  };

  const fitVisiblePoints = () => {
    if (!mapRef.current) return;
    const visibleAssets = assets.filter(
      (asset) => visibleAssetIds.has(asset.id) || asset.id === selectedAssetId
    );
    const points = [
      ...visibleAssets.map((asset) => ({ lat: asset.lat, lon: asset.lon })),
      ...selectedEvidence.map((item) => ({ lat: item.lat, lon: item.lon })),
    ];
    const bounds = computeBounds(points);
    if (!bounds) return;
    mapRef.current.fitBounds(bounds, {
      padding: 56,
      duration: 700,
      maxZoom: 6,
    });
  };

  const handleResetView = () => {
    userHasMoved.current = false;
    fitVisiblePoints();
  };

  const handleToggleFullscreen = () => {
    const panel = mapPanelRef.current;
    if (!panel) return;
    if (!document.fullscreenElement) {
      void panel.requestFullscreen?.();
      return;
    }
    void document.exitFullscreen?.();
  };

  const handleMapLoad = () => {
    setMapLoaded(true);
  };

  if (assets.length === 0) {
    return (
      <section className="impact-map-panel" aria-label="Operational map panel">
        <div className="impact-map-grid" aria-hidden />
        <div className="impact-map-empty">
          <span className="impact-eyebrow">Operational map</span>
          <p>Load a demo portfolio or upload assets to visualize exposure geography.</p>
        </div>
      </section>
    );
  }

  if (mapError) {
    return (
      <section className="impact-map-panel" aria-label="Operational map panel">
        <div className="impact-map-grid" aria-hidden />
        <div className="impact-map-fallback">
          <span className="impact-eyebrow">Operational map</span>
          <p>Map rendering is unavailable right now. Asset and evidence analysis remains available.</p>
          <p className="impact-map-fallback-sub">{mapError}</p>
        </div>
      </section>
    );
  }

  return (
    <section
      ref={mapPanelRef}
      className={`impact-map-panel${isFullscreen ? " is-fullscreen" : ""}`}
      aria-label="Operational map panel"
    >
      <div className="impact-map-overlay">
        <div className="impact-map-title-block">
          <span className="impact-eyebrow">Global Impact Map</span>
          <p>Real-time exposure visualization.</p>
        </div>
        <div className="impact-map-telemetry">
          <span>{assets.length} assets</span>
          <span>·</span>
          <span>{selectedEvidence.length} evidence clusters</span>
          <span>·</span>
          <span>{range}</span>
          {updatedLabel ? (
            <>
              <span>·</span>
              <span>{updatedLabel}</span>
            </>
          ) : null}
        </div>
      </div>

      <div className="impact-map-controls-top">
        <button
          type="button"
          className={`impact-map-control-chip${showEvidence ? " is-active" : ""}`}
          onClick={() => setShowEvidence((value) => !value)}
        >
          Layers
        </button>
        <div className="impact-map-range-group" role="tablist" aria-label="Map range">
          {rangeOptions.map((option) => (
            <button
              key={option}
              type="button"
              role="tab"
              aria-selected={range === option}
              className={`impact-map-control-chip${range === option ? " is-active" : ""}`}
              onClick={() => onRangeChange(option)}
            >
              {option}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="impact-map-control-chip"
          onClick={handleResetView}
        >
          Reset view
        </button>
        <button
          type="button"
          className={`impact-map-control-chip${isFullscreen ? " is-active" : ""}`}
          onClick={handleToggleFullscreen}
        >
          {isFullscreen ? "Exit fullscreen" : "Fullscreen"}
        </button>
      </div>

      <div className="impact-map-canvas">
        <Map
          ref={mapRef}
          mapLib={maplibregl}
          mapStyle={BASEMAP_STYLE}
          initialViewState={INITIAL_VIEW_STATE}
          attributionControl={false}
          interactiveLayerIds={interactiveLayerIds}
          reuseMaps
          onLoad={handleMapLoad}
          onError={(event) => {
            const message =
              typeof (event as { error?: { message?: string } }).error?.message === "string"
                ? (event as { error: { message: string } }).error.message
                : "Unknown map error";
            setMapError(message);
          }}
          onClick={handleMapClick}
          onMouseMove={handleHover}
          onMove={(event) => {
            setLastMapCoord({ lat: event.viewState.latitude, lon: event.viewState.longitude });
          }}
          onDragEnd={() => {
            if (!mapLoaded) return;
            userHasMoved.current = true;
          }}
          onZoomEnd={() => {
            if (!mapLoaded) return;
            userHasMoved.current = true;
          }}
          onMouseLeave={() => setHover(null)}
          cursor={hover ? "pointer" : "grab"}
        >
          <Source id="impact-asset-source" type="geojson" data={assetGeoJson}>
            <Layer {...SELECTED_RING_OUTER} />
            <Layer {...SELECTED_RING_MID} />
            <Layer {...SELECTED_RING_INNER} />
            <Layer {...ASSET_LAYER} />
            <Layer {...SELECTED_STAR_LAYER} />
            <Layer {...SELECTED_LABEL_LAYER} />
          </Source>

          {showEvidence ? (
            <Source id="impact-link-source" type="geojson" data={linkGeoJson}>
              <Layer {...LINK_LAYER} />
            </Source>
          ) : null}

          {showEvidence ? (
            <Source id="impact-evidence-source" type="geojson" data={evidenceGeoJson}>
              <Layer {...EVIDENCE_LAYER} />
              <Layer {...EVIDENCE_MODEL_LAYER} />
            </Source>
          ) : null}

          {hover ? (
            <Popup
              longitude={hover.lon}
              latitude={hover.lat}
              closeButton={false}
              closeOnClick={false}
              offset={12}
              className="impact-map-popup"
            >
              <div className="impact-map-popup-body">
                <div className="impact-map-popup-title">{hover.title}</div>
                <div className="impact-map-popup-sub">{hover.subtitle}</div>
              </div>
            </Popup>
          ) : null}
        </Map>

        <div className="impact-map-legend-inset">
          <span className="impact-map-legend-title">Risk Level</span>
          <span className="impact-map-legend-row">
            <i className="impact-map-sym impact-map-sym-critical" aria-hidden />
            Critical
          </span>
          <span className="impact-map-legend-row">
            <i className="impact-map-sym impact-map-sym-high" aria-hidden />
            High
          </span>
          <span className="impact-map-legend-row">
            <i className="impact-map-sym impact-map-sym-elevated" aria-hidden />
            Elevated
          </span>
          <span className="impact-map-legend-row">
            <i className="impact-map-sym impact-map-sym-low" aria-hidden />
            Low
          </span>
          <span className="impact-map-legend-row">
            <i className="impact-map-sym impact-map-sym-unknown" aria-hidden />
            Unknown
          </span>
          <span className="impact-map-legend-row">
            <i className="impact-map-sym impact-map-sym-model" aria-hidden />
            Model Context
          </span>
        </div>

        <div className="impact-map-status-inset">
          {selectedAsset ? (
            <span>
              {formatCoordLat(selectedAsset.lat)} | {formatCoordLon(selectedAsset.lon)}
            </span>
          ) : lastMapCoord ? (
            <span>
              {formatCoordLat(lastMapCoord.lat)} | {formatCoordLon(lastMapCoord.lon)}
            </span>
          ) : (
            <span>
              {assets.length} assets · {selectedEvidence.length} evidence · {range}
            </span>
          )}
          <button
            type="button"
            className="impact-map-refresh-btn"
            disabled={loadState === "loading"}
            onClick={onRefresh}
          >
            Refresh
          </button>
        </div>
      </div>

      {selectedAlert && selectedEvidence.length === 0 ? (
        <div className="impact-map-note">No matched evidence clusters for current range.</div>
      ) : null}
    </section>
  );
}
