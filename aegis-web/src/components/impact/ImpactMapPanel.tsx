"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import type { IntelSeverity, MapApiResponse } from "@/lib/intel/types";
import type { EvidenceItem, ExposureAlert, UserAsset } from "@/lib/impact/types";
import {
  DEFAULT_SEVERITY_FILTERS,
  DEFAULT_SIGNAL_CATEGORIES,
  SIGNAL_CATEGORY_LABELS,
  buildBackgroundSignals,
  signalCategoryForLayer,
  type SignalCategoryKey,
} from "@/lib/impact/mapSignals";
import {
  BASEMAP_STYLE,
  buildAssetGeoJson,
  buildBackgroundSignalGeoJson,
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
  mapData: MapApiResponse | null;
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
  kind: "asset" | "evidence" | "signal";
  lon: number;
  lat: number;
  title: string;
  subtitle: string;
} | null;

type DisplayFilters = {
  assets: boolean;
  selectedEvidence: boolean;
  nearbySignals: boolean;
  relationshipLines: boolean;
  labels: boolean;
};

const DEFAULT_DISPLAY_FILTERS: DisplayFilters = {
  assets: true,
  selectedEvidence: true,
  nearbySignals: true,
  relationshipLines: true,
  labels: true,
};

const SIGNAL_TYPE_ORDER: SignalCategoryKey[] = [
  "conflict",
  "explosions",
  "unrest",
  "infrastructure",
  "news",
  "maritime",
  "aviation",
  "modelContext",
];

const SEVERITY_ORDER: IntelSeverity[] = ["critical", "high", "medium", "low"];

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
const EVIDENCE_SELECTED_RING_ID = "impact-evidence-selected-ring";
const BACKGROUND_SIGNAL_LAYER_ID = "impact-background-signals";
const BACKGROUND_MODEL_LAYER_ID = "impact-background-model-context";
const BACKGROUND_SELECTED_RING_ID = "impact-background-selected-ring";
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
      "#4a5568",
      "elevated",
      "rgba(0,0,0,0)",
      "guarded",
      "#2d3748",
      "#2d3748",
    ],
    "circle-stroke-color": [
      "case",
      ["==", ["get", "level"], "critical"],
      "rgba(200,90,90,0.75)",
      ["==", ["get", "level"], "high"],
      "rgba(107,130,153,0.72)",
      ["==", ["get", "level"], "elevated"],
      "rgba(100,116,139,0.75)",
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
      3.9,
      "high",
      3.5,
      "medium",
      3.1,
      2.7,
    ],
    "circle-color": [
      "match",
      ["get", "severity"],
      "critical",
      "#b85252",
      "high",
      "#5b7088",
      "medium",
      "#64748b",
      "#546070",
    ],
    "circle-stroke-color": "rgba(8,11,18,0.92)",
    "circle-stroke-width": 0.8,
    "circle-opacity": 0.92,
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

const EVIDENCE_SELECTED_RING_LAYER: LayerProps = {
  id: EVIDENCE_SELECTED_RING_ID,
  type: "circle",
  filter: ["==", ["get", "selected"], true],
  paint: {
    "circle-radius": [
      "match",
      ["get", "severity"],
      "critical",
      8.2,
      "high",
      7.4,
      "medium",
      6.8,
      6.2,
    ],
    "circle-color": "rgba(0,0,0,0)",
    "circle-stroke-color": "rgba(241,245,249,0.45)",
    "circle-stroke-width": 1.1,
    "circle-opacity": 0.9,
  },
};

const BACKGROUND_SIGNAL_LAYER: LayerProps = {
  id: BACKGROUND_SIGNAL_LAYER_ID,
  type: "circle",
  filter: ["==", ["get", "isModelContext"], false],
  paint: {
    "circle-radius": [
      "match",
      ["get", "severity"],
      "critical",
      3.2,
      "high",
      2.9,
      "medium",
      2.6,
      2.3,
    ],
    "circle-color": [
      "match",
      ["get", "severity"],
      "critical",
      "rgba(184,80,80,0.85)",
      "high",
      "rgba(107,130,153,0.78)",
      "medium",
      "rgba(100,116,139,0.7)",
      "rgba(84,96,112,0.64)",
    ],
    "circle-stroke-color": "rgba(8,11,18,0.62)",
    "circle-stroke-width": 0.6,
    "circle-opacity": [
      "case",
      ["<=", ["get", "distanceKm"], 80],
      0.72,
      ["<=", ["get", "distanceKm"], 200],
      0.56,
      ["<=", ["get", "distanceKm"], 350],
      0.4,
      0.28,
    ],
  },
};

const BACKGROUND_MODEL_LAYER: LayerProps = {
  id: BACKGROUND_MODEL_LAYER_ID,
  type: "circle",
  filter: ["==", ["get", "isModelContext"], true],
  paint: {
    "circle-radius": 4.2,
    "circle-color": "rgba(0,0,0,0)",
    "circle-stroke-color": "rgba(148,163,184,0.5)",
    "circle-stroke-width": 0.9,
    "circle-opacity": 0.55,
  },
};

const BACKGROUND_SELECTED_RING_LAYER: LayerProps = {
  id: BACKGROUND_SELECTED_RING_ID,
  type: "circle",
  filter: ["==", ["get", "selected"], true],
  paint: {
    "circle-radius": 7,
    "circle-color": "rgba(0,0,0,0)",
    "circle-stroke-color": "rgba(241,245,249,0.42)",
    "circle-stroke-width": 1.1,
    "circle-opacity": 0.8,
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
  source: "impact-asset-source",
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
  source: "impact-asset-source",
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

function signalSubtitle(properties: Record<string, unknown>): string {
  const severity = typeof properties.severity === "string" ? properties.severity : "low";
  const category =
    typeof properties.category === "string"
      ? SIGNAL_CATEGORY_LABELS[properties.category as SignalCategoryKey] ?? properties.category
      : "Signals";
  const distance =
    typeof properties.distanceKm === "number" && Number.isFinite(properties.distanceKm)
      ? properties.distanceKm < 100
        ? `${properties.distanceKm.toFixed(1)} km`
        : `${Math.round(properties.distanceKm)} km`
      : "distance —";
  return `${category} · ${severity} · ${distance}`;
}

function evidenceMatchesFilters(
  evidence: EvidenceItem,
  signalTypeFilters: Record<SignalCategoryKey, boolean>,
  severityFilters: Record<IntelSeverity, boolean>
): boolean {
  if (!severityFilters[evidence.severity]) return false;
  for (const layer of evidence.layers) {
    if (signalTypeFilters[signalCategoryForLayer(layer)]) return true;
  }
  return false;
}

export function ImpactMapPanel({
  assets,
  visibleAssetIds,
  alerts,
  alertsByAsset,
  selectedAssetId,
  selectedAlert,
  mapData,
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
  const signalPopoverRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapRef | null>(null);
  const userHasMoved = useRef(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [hover, setHover] = useState<HoverState>(null);
  const [lastMapCoord, setLastMapCoord] = useState<{ lat: number; lon: number } | null>(null);
  const [selectedEvidenceCoord, setSelectedEvidenceCoord] = useState<{
    lat: number;
    lon: number;
  } | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showSignalPopover, setShowSignalPopover] = useState(false);
  const [selectedEvidenceId, setSelectedEvidenceId] = useState<string | null>(null);
  const [selectedSignalId, setSelectedSignalId] = useState<string | null>(null);
  const [displayFilters, setDisplayFilters] = useState<DisplayFilters>(DEFAULT_DISPLAY_FILTERS);
  const [signalTypeFilters, setSignalTypeFilters] = useState<Record<SignalCategoryKey, boolean>>(
    () => ({ ...DEFAULT_SIGNAL_CATEGORIES })
  );
  const [severityFilters, setSeverityFilters] = useState<Record<IntelSeverity, boolean>>(() => ({
    ...DEFAULT_SEVERITY_FILTERS,
  }));

  const selectedAsset = useMemo(
    () => assets.find((asset) => asset.id === selectedAssetId) ?? null,
    [assets, selectedAssetId]
  );

  const selectedEvidenceAll = selectedAlert?.evidence ?? [];
  const selectedEvidence = useMemo(
    () =>
      selectedEvidenceAll.filter((item) =>
        evidenceMatchesFilters(item, signalTypeFilters, severityFilters)
      ),
    [selectedEvidenceAll, signalTypeFilters, severityFilters]
  );

  const selectedEvidencePointIds = useMemo(() => {
    const ids = new Set<string>();
    for (const item of selectedEvidenceAll) {
      for (const pointId of item.pointIds) ids.add(pointId);
    }
    return ids;
  }, [selectedEvidenceAll]);

  const backgroundSignalsAll = useMemo(
    () =>
      buildBackgroundSignals({
        mapData,
        assets,
        visibleAssetIds,
        selectedAssetId,
        selectedEvidencePointIds,
      }),
    [assets, mapData, selectedAssetId, selectedEvidencePointIds, visibleAssetIds]
  );

  const backgroundSignals = useMemo(
    () =>
      backgroundSignalsAll.filter(
        (signal) => signalTypeFilters[signal.category] && severityFilters[signal.severity]
      ),
    [backgroundSignalsAll, severityFilters, signalTypeFilters]
  );

  const signalTypeCounts = useMemo(() => {
    const counts = Object.fromEntries(
      SIGNAL_TYPE_ORDER.map((key) => [key, 0])
    ) as Record<SignalCategoryKey, number>;
    for (const signal of backgroundSignalsAll) counts[signal.category] += 1;
    return counts;
  }, [backgroundSignalsAll]);

  const severityCounts = useMemo(() => {
    const counts: Record<IntelSeverity, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    };
    for (const signal of backgroundSignalsAll) counts[signal.severity] += 1;
    return counts;
  }, [backgroundSignalsAll]);

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
    () => buildEvidenceGeoJson(selectedEvidence, selectedEvidenceId),
    [selectedEvidence, selectedEvidenceId]
  );
  const linkGeoJson = useMemo(
    () => buildLinkGeoJson({ asset: selectedAsset, evidence: selectedEvidence }),
    [selectedAsset, selectedEvidence]
  );
  const backgroundGeoJson = useMemo(
    () =>
      buildBackgroundSignalGeoJson({
        signals: backgroundSignals,
        selectedSignalId,
      }),
    [backgroundSignals, selectedSignalId]
  );

  const fitVisiblePoints = useCallback(() => {
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
    },
    [assets, selectedAssetId, selectedEvidence, visibleAssetIds]
  );

  const fitSelectedContext = useCallback(() => {
    if (!mapRef.current) return;
    const focusAsset = assets.find((asset) => asset.id === selectedAssetId);
    if (!focusAsset) return;
    const points = [
      { lat: focusAsset.lat, lon: focusAsset.lon },
      ...selectedEvidenceAll.map((item) => ({ lat: item.lat, lon: item.lon })),
    ];
    const bounds = computeBounds(points);
    if (!bounds) return;
    mapRef.current.fitBounds(bounds, {
      padding: 56,
      duration: 700,
      maxZoom: 6,
    });
  }, [assets, selectedAssetId, selectedEvidenceAll]);

  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;
    if (userHasMoved.current) return;
    fitVisiblePoints();
  }, [fitVisiblePoints, mapLoaded]);

  useEffect(() => {
    userHasMoved.current = false;
  }, [selectedAssetId]);

  useEffect(() => {
    setSelectedEvidenceCoord(null);
    setSelectedEvidenceId(null);
    setSelectedSignalId(null);
  }, [selectedAlert?.id]);

  useEffect(() => {
    if (!mapLoaded || !mapRef.current || !flyToCoord) return;
    const flyIntent = flyToCoord.id.split(":")[0];
    if (flyIntent === "asset" || flyIntent === "alert") {
      userHasMoved.current = false;
      fitSelectedContext();
      setSelectedEvidenceCoord(null);
      setSelectedEvidenceId(null);
      setSelectedSignalId(null);
      setLastMapCoord({ lat: flyToCoord.lat, lon: flyToCoord.lon });
      return;
    }
    userHasMoved.current = true;
    mapRef.current.flyTo({
      center: [flyToCoord.lon, flyToCoord.lat],
      zoom: Math.max(mapRef.current.getZoom(), 7.5),
      duration: 650,
    });
    const matchedEvidence = selectedEvidenceAll.find(
      (item) =>
        Math.abs(item.lat - flyToCoord.lat) <= 0.0001 &&
        Math.abs(item.lon - flyToCoord.lon) <= 0.0001
    );
    setSelectedEvidenceId(matchedEvidence?.id ?? null);
    setSelectedEvidenceCoord(
      matchedEvidence ? { lat: flyToCoord.lat, lon: flyToCoord.lon } : null
    );
    setSelectedSignalId(null);
    setLastMapCoord({ lat: flyToCoord.lat, lon: flyToCoord.lon });
  }, [fitSelectedContext, flyToCoord, mapLoaded, selectedEvidenceAll]);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === mapPanelRef.current);
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
    };
  }, []);

  useEffect(() => {
    if (!showSignalPopover) return;
    const onMouseDown = (event: MouseEvent) => {
      if (!signalPopoverRef.current) return;
      if (!signalPopoverRef.current.contains(event.target as Node)) {
        setShowSignalPopover(false);
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
    };
  }, [showSignalPopover]);

  useEffect(() => {
    if (!showSignalPopover) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowSignalPopover(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [showSignalPopover]);

  const interactiveLayerIds = useMemo(() => {
    const ids: string[] = [];
    if (displayFilters.assets) ids.push(ASSET_LAYER_ID);
    if (displayFilters.selectedEvidence) {
      ids.push(EVIDENCE_LAYER_ID, EVIDENCE_MODEL_LAYER_ID);
    }
    if (displayFilters.nearbySignals) {
      ids.push(BACKGROUND_SIGNAL_LAYER_ID, BACKGROUND_MODEL_LAYER_ID);
    }
    return ids;
  }, [displayFilters.assets, displayFilters.nearbySignals, displayFilters.selectedEvidence]);

  const handleMapClick = (event: MapLayerMouseEvent) => {
    const feature = event.features?.[0];
    if (!feature || !feature.properties) return;
    const layerId = feature.layer?.id;
    const properties = feature.properties as Record<string, unknown>;
    const [lon, lat] =
      feature.geometry.type === "Point" ? feature.geometry.coordinates : [event.lngLat.lng, event.lngLat.lat];

    setLastMapCoord({ lat, lon });

    if (layerId === ASSET_LAYER_ID && typeof properties.assetId === "string") {
      setSelectedSignalId(null);
      setSelectedEvidenceId(null);
      setSelectedEvidenceCoord(null);
      onSelectAsset(properties.assetId);
      return;
    }

    if (
      (layerId === EVIDENCE_LAYER_ID || layerId === EVIDENCE_MODEL_LAYER_ID) &&
      typeof properties.evidenceId === "string"
    ) {
      setSelectedEvidenceId(properties.evidenceId);
      setSelectedEvidenceCoord({ lat, lon });
      setSelectedSignalId(null);
      if (typeof selectedAlert?.id === "string") {
        onSelectAlert(selectedAlert.id);
      }
      if (mapRef.current) {
        mapRef.current.flyTo({
          center: [lon, lat],
          zoom: Math.max(mapRef.current.getZoom(), 7),
          duration: 500,
        });
      }
      return;
    }

    if (
      (layerId === BACKGROUND_SIGNAL_LAYER_ID || layerId === BACKGROUND_MODEL_LAYER_ID) &&
      typeof properties.signalId === "string"
    ) {
      setSelectedSignalId(properties.signalId);
      setSelectedEvidenceId(null);
      if (mapRef.current) {
        mapRef.current.flyTo({
          center: [lon, lat],
          zoom: Math.max(mapRef.current.getZoom(), 6.5),
          duration: 500,
        });
      }
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

    if (
      (layerId === BACKGROUND_SIGNAL_LAYER_ID || layerId === BACKGROUND_MODEL_LAYER_ID) &&
      typeof properties.title === "string"
    ) {
      setHover({
        kind: "signal",
        lon,
        lat,
        title: properties.title,
        subtitle: signalSubtitle(properties),
      });
      return;
    }

    setHover(null);
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

  const toggleDisplayFilter = (key: keyof DisplayFilters) => {
    setDisplayFilters((current) => ({ ...current, [key]: !current[key] }));
  };

  const toggleSignalType = (key: SignalCategoryKey) => {
    setSignalTypeFilters((current) => ({ ...current, [key]: !current[key] }));
  };

  const toggleSeverity = (key: IntelSeverity) => {
    setSeverityFilters((current) => ({ ...current, [key]: !current[key] }));
  };

  const resetSignalFilters = () => {
    setDisplayFilters(DEFAULT_DISPLAY_FILTERS);
    setSignalTypeFilters({ ...DEFAULT_SIGNAL_CATEGORIES });
    setSeverityFilters({ ...DEFAULT_SEVERITY_FILTERS });
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
          <p>Asset-centered public signal exposure.</p>
        </div>
        <div className="impact-map-telemetry">
          <span>{assets.length} assets</span>
          <span>·</span>
          <span>{alerts.length} alerts</span>
          <span>·</span>
          <span>{selectedEvidence.length} selected evidence</span>
          <span>·</span>
          <span>{backgroundSignals.length} nearby signals</span>
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
        <div className="impact-map-filter-wrap" ref={signalPopoverRef}>
          <button
            type="button"
            className={`impact-map-control-chip${showSignalPopover ? " is-active" : ""}`}
            onClick={() => setShowSignalPopover((value) => !value)}
            aria-expanded={showSignalPopover}
            aria-haspopup="dialog"
          >
            Signals
          </button>
          {showSignalPopover ? (
            <div className="impact-map-signal-popover" role="dialog" aria-label="Signal filters">
              <div className="impact-map-signal-popover-head">
                <span>Filter signals</span>
                <button
                  type="button"
                  className="impact-map-control-chip impact-map-control-chip-sm"
                  onClick={resetSignalFilters}
                >
                  Reset
                </button>
              </div>

              <div className="impact-map-signal-group">
                <h4>Display</h4>
                <label>
                  <input
                    type="checkbox"
                    checked={displayFilters.assets}
                    onChange={() => toggleDisplayFilter("assets")}
                  />
                  Assets
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={displayFilters.selectedEvidence}
                    onChange={() => toggleDisplayFilter("selectedEvidence")}
                  />
                  Selected evidence
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={displayFilters.nearbySignals}
                    onChange={() => toggleDisplayFilter("nearbySignals")}
                  />
                  Nearby signals
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={displayFilters.relationshipLines}
                    onChange={() => toggleDisplayFilter("relationshipLines")}
                  />
                  Relationship lines
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={displayFilters.labels}
                    onChange={() => toggleDisplayFilter("labels")}
                  />
                  Labels
                </label>
              </div>

              <div className="impact-map-signal-group">
                <h4>Signal types</h4>
                {SIGNAL_TYPE_ORDER.map((typeKey) => (
                  <label key={typeKey}>
                    <input
                      type="checkbox"
                      checked={signalTypeFilters[typeKey]}
                      onChange={() => toggleSignalType(typeKey)}
                    />
                    <span>{SIGNAL_CATEGORY_LABELS[typeKey]}</span>
                    <span className="impact-map-signal-count">{signalTypeCounts[typeKey]}</span>
                  </label>
                ))}
              </div>

              <div className="impact-map-signal-group">
                <h4>Severity</h4>
                {SEVERITY_ORDER.map((severityKey) => (
                  <label key={severityKey}>
                    <input
                      type="checkbox"
                      checked={severityFilters[severityKey]}
                      onChange={() => toggleSeverity(severityKey)}
                    />
                    <span>{severityKey}</span>
                    <span className="impact-map-signal-count">{severityCounts[severityKey]}</span>
                  </label>
                ))}
              </div>
            </div>
          ) : null}
        </div>

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
        <button type="button" className="impact-map-control-chip" onClick={handleResetView}>
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
          doubleClickZoom
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
          {displayFilters.assets || displayFilters.labels ? (
            <Source id="impact-asset-source" type="geojson" data={assetGeoJson}>
              {displayFilters.assets ? (
                <>
                  <Layer {...SELECTED_RING_OUTER} />
                  <Layer {...SELECTED_RING_MID} />
                  <Layer {...SELECTED_RING_INNER} />
                  <Layer {...ASSET_LAYER} />
                </>
              ) : null}
              {displayFilters.labels ? (
                <>
                  <Layer {...SELECTED_STAR_LAYER} />
                  <Layer {...SELECTED_LABEL_LAYER} />
                </>
              ) : null}
            </Source>
          ) : null}

          {displayFilters.relationshipLines && displayFilters.selectedEvidence ? (
            <Source id="impact-link-source" type="geojson" data={linkGeoJson}>
              <Layer {...LINK_LAYER} />
            </Source>
          ) : null}

          {displayFilters.selectedEvidence ? (
            <Source id="impact-evidence-source" type="geojson" data={evidenceGeoJson}>
              <Layer {...EVIDENCE_SELECTED_RING_LAYER} />
              <Layer {...EVIDENCE_LAYER} />
              <Layer {...EVIDENCE_MODEL_LAYER} />
            </Source>
          ) : null}

          {displayFilters.nearbySignals ? (
            <Source id="impact-background-signal-source" type="geojson" data={backgroundGeoJson}>
              <Layer {...BACKGROUND_SELECTED_RING_LAYER} />
              <Layer {...BACKGROUND_SIGNAL_LAYER} />
              <Layer {...BACKGROUND_MODEL_LAYER} />
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
          <span className="impact-map-legend-title">Risk level</span>
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
            <i className="impact-map-sym impact-map-sym-model" aria-hidden />
            Model context
          </span>
        </div>

        <div className="impact-map-status-inset">
          {selectedEvidenceCoord ? (
            <span>
              {formatCoordLat(selectedEvidenceCoord.lat)} | {formatCoordLon(selectedEvidenceCoord.lon)}
            </span>
          ) : selectedAsset ? (
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
        <div className="impact-map-note">No selected-asset evidence matches the active signal filters.</div>
      ) : null}
    </section>
  );
}
