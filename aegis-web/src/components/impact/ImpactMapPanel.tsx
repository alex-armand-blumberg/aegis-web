"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Map, {
  Layer,
  NavigationControl,
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
} from "@/lib/impact/mapGeo";

type Props = {
  assets: UserAsset[];
  alerts: ExposureAlert[];
  alertsByAsset: Record<string, ExposureAlert>;
  selectedAssetId: string | null;
  selectedAlert: ExposureAlert | null;
  range: string;
  onSelectAsset: (assetId: string) => void;
  onSelectAlert: (alertId: string) => void;
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

const ASSET_LAYER: LayerProps = {
  id: ASSET_LAYER_ID,
  type: "circle",
  paint: {
    "circle-radius": ["case", ["get", "selected"], 8, 6],
    "circle-color": [
      "match",
      ["get", "level"],
      "critical",
      "#b91c1c",
      "high",
      "#c2410c",
      "elevated",
      "#a16207",
      "guarded",
      "#334155",
      "#475569",
    ],
    "circle-stroke-color": ["case", ["get", "selected"], "#f8fafc", "#0f172a"],
    "circle-stroke-width": ["case", ["get", "selected"], 2, 1],
    "circle-opacity": 0.92,
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
      6,
      "high",
      5,
      "medium",
      4.5,
      4,
    ],
    "circle-color": [
      "match",
      ["get", "severity"],
      "critical",
      "#ef4444",
      "high",
      "#f59e0b",
      "medium",
      "#facc15",
      "#64748b",
    ],
    "circle-stroke-color": "#0b1220",
    "circle-stroke-width": 1,
    "circle-opacity": 0.9,
  },
};

const EVIDENCE_MODEL_LAYER: LayerProps = {
  id: EVIDENCE_MODEL_LAYER_ID,
  type: "circle",
  filter: ["==", ["get", "isModelContext"], true],
  paint: {
    "circle-radius": 6,
    "circle-color": "rgba(0,0,0,0)",
    "circle-stroke-color": "#94a3b8",
    "circle-stroke-width": 1.5,
    "circle-opacity": 0.9,
  },
};

const LINK_LAYER: LayerProps = {
  id: LINK_LAYER_ID,
  type: "line",
  paint: {
    "line-color": [
      "case",
      ["get", "isModelContext"],
      "rgba(148,163,184,0.35)",
      "rgba(148,163,184,0.5)",
    ],
    "line-width": 1,
    "line-opacity": 0.55,
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
  alerts,
  alertsByAsset,
  selectedAssetId,
  selectedAlert,
  range,
  onSelectAsset,
  onSelectAlert,
}: Props) {
  const mapRef = useRef<MapRef | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [hover, setHover] = useState<HoverState>(null);

  const selectedAsset = useMemo(
    () => assets.find((asset) => asset.id === selectedAssetId) ?? null,
    [assets, selectedAssetId]
  );

  const selectedEvidence = selectedAlert?.evidence ?? [];

  const assetGeoJson = useMemo(
    () => buildAssetGeoJson({ assets, alertsByAsset, selectedAssetId }),
    [assets, alertsByAsset, selectedAssetId]
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
    const points = [
      ...assets.map((asset) => ({ lat: asset.lat, lon: asset.lon })),
      ...selectedEvidence.map((item) => ({ lat: item.lat, lon: item.lon })),
    ];
    const bounds = computeBounds(points);
    if (!bounds) return;
    mapRef.current.fitBounds(bounds, {
      padding: 56,
      duration: 700,
      maxZoom: 6,
    });
  }, [assets, mapLoaded, selectedEvidence, selectedAssetId]);

  const interactiveLayerIds = [ASSET_LAYER_ID, EVIDENCE_LAYER_ID, EVIDENCE_MODEL_LAYER_ID];

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
    <section className="impact-map-panel" aria-label="Operational map panel">
      <div className="impact-map-overlay">
        <div className="impact-map-title-block">
          <span className="impact-eyebrow">Operational map</span>
          <p>
            Asset markers, selected-alert evidence clusters, and source-backed relationship links.
          </p>
        </div>
        <div className="impact-map-telemetry">
          <span>{assets.length} assets</span>
          <span>·</span>
          <span>{selectedEvidence.length} evidence clusters</span>
          <span>·</span>
          <span>{range}</span>
        </div>
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
          onLoad={() => setMapLoaded(true)}
          onError={(event) => {
            const message =
              typeof (event as { error?: { message?: string } }).error?.message === "string"
                ? (event as { error: { message: string } }).error.message
                : "Unknown map error";
            setMapError(message);
          }}
          onClick={handleMapClick}
          onMouseMove={handleHover}
          onMouseLeave={() => setHover(null)}
          cursor={hover ? "pointer" : "grab"}
        >
          <NavigationControl position="bottom-right" visualizePitch={false} />

          <Source id="impact-asset-source" type="geojson" data={assetGeoJson}>
            <Layer {...ASSET_LAYER} />
          </Source>

          <Source id="impact-link-source" type="geojson" data={linkGeoJson}>
            <Layer {...LINK_LAYER} />
          </Source>

          <Source id="impact-evidence-source" type="geojson" data={evidenceGeoJson}>
            <Layer {...EVIDENCE_LAYER} />
            <Layer {...EVIDENCE_MODEL_LAYER} />
          </Source>

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
      </div>

      <div className="impact-map-legend">
        <span className="impact-map-legend-chip">Asset marker</span>
        <span className="impact-map-legend-chip">Evidence cluster</span>
        <span className="impact-map-legend-chip">Selected asset</span>
        <span className="impact-map-legend-chip impact-map-legend-chip-model">Model context</span>
      </div>

      {selectedAlert && selectedEvidence.length === 0 ? (
        <div className="impact-map-note">No matched evidence clusters for current range.</div>
      ) : null}
    </section>
  );
}
