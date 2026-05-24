"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import Map, { Layer, Source, type MapLayerMouseEvent, type MapRef } from "react-map-gl/maplibre";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { SelectedAssetEvent } from "@/lib/impact/eventLayer";
import { computeBounds } from "@/lib/impact/mapGeo";
import type { UserAsset } from "@/lib/impact/types";
import {
  DASHBOARD_BASEMAP_STYLE,
  buildAssetPinGeoJson,
  buildDashboardEventGeoJson,
} from "./dashboardUtils";

type Props = {
  asset: UserAsset | null;
  mapEvents: SelectedAssetEvent[];
  highlightedEventId: string | null;
  onHighlight: (eventId: string | null) => void;
  loading?: boolean;
};

const ASSET_LAYER: maplibregl.CircleLayerSpecification = {
  id: "dash-asset-pin",
  type: "circle",
  source: "dash-asset",
  paint: {
    "circle-radius": 10,
    "circle-color": "#f5c6b0",
    "circle-stroke-width": 3,
    "circle-stroke-color": "#0b1726",
  },
};

const EVENT_LAYER: maplibregl.CircleLayerSpecification = {
  id: "dash-event-pins",
  type: "circle",
  source: "dash-events",
  paint: {
    "circle-radius": [
      "match",
      ["get", "relation"],
      "direct", 10,
      "regional", 7,
      7,
    ],
    "circle-color": [
      "match",
      ["get", "severity"],
      "critical",
      "#c44040",
      "high",
      "#e89b7d",
      "medium",
      "#6e8db8",
      "#5a7596",
    ],
    "circle-opacity": [
      "match",
      ["get", "relation"],
      "direct", 1.0,
      "regional", 0.85,
      0.85,
    ],
    "circle-stroke-width": 2,
    "circle-stroke-color": "#ffffff",
  },
};

const EVENT_HIGHLIGHT_LAYER: maplibregl.CircleLayerSpecification = {
  id: "dash-event-highlight",
  type: "circle",
  source: "dash-events",
  filter: ["==", ["get", "eventId"], ""],
  paint: {
    "circle-radius": 14,
    "circle-color": "rgba(245, 198, 176, 0.35)",
    "circle-stroke-width": 0,
  },
};

export function DashboardMap({
  asset,
  mapEvents,
  highlightedEventId,
  onHighlight,
  loading,
}: Props) {
  const mapRef = useRef<MapRef | null>(null);

  const assetGeoJson = useMemo(
    () => (asset ? buildAssetPinGeoJson(asset) : { type: "FeatureCollection" as const, features: [] }),
    [asset]
  );

  const eventGeoJson = useMemo(() => buildDashboardEventGeoJson(mapEvents), [mapEvents]);

  const highlightFilter = useMemo(
    (): maplibregl.FilterSpecification => [
      "==",
      ["get", "eventId"],
      highlightedEventId ?? "",
    ],
    [highlightedEventId]
  );

  const fitToContent = useCallback(() => {
    if (!mapRef.current || !asset) return;

    const points = [
      { lat: asset.lat, lon: asset.lon },
      ...mapEvents.map((event) => ({ lat: event.lat, lon: event.lon })),
    ];

    const bounds = computeBounds(points);
    if (bounds) {
      mapRef.current.fitBounds(bounds, { padding: 48, duration: 600, maxZoom: 8 });
      return;
    }

    mapRef.current.flyTo({
      center: [asset.lon, asset.lat],
      zoom: 6,
      duration: 600,
    });
  }, [asset, mapEvents]);

  useEffect(() => {
    fitToContent();
  }, [fitToContent]);

  const handleClick = useCallback(
    (event: MapLayerMouseEvent) => {
      const feature = event.features?.[0];
      if (!feature?.properties) {
        onHighlight(null);
        return;
      }
      const eventId = feature.properties.eventId;
      if (typeof eventId === "string" && eventId) {
        onHighlight(eventId);
      }
    },
    [onHighlight]
  );

  if (loading) {
    return (
      <div className="iv-dash-map iv-dash-map-loading">
        <p className="iv-meta">Syncing sources…</p>
      </div>
    );
  }

  if (!asset) {
    return (
      <div className="iv-dash-map iv-dash-map-empty">
        <p className="iv-meta">Select an asset to view the map.</p>
      </div>
    );
  }

  return (
    <div className="iv-dash-map">
      <Map
        ref={mapRef}
        mapLib={maplibregl}
        mapStyle={DASHBOARD_BASEMAP_STYLE}
        initialViewState={{
          longitude: asset.lon,
          latitude: asset.lat,
          zoom: 5,
        }}
        onLoad={fitToContent}
        onClick={handleClick}
        interactiveLayerIds={["dash-event-pins"]}
        attributionControl={false}
        style={{ width: "100%", height: "100%" }}
      >
        <Source id="dash-asset" type="geojson" data={assetGeoJson}>
          <Layer {...ASSET_LAYER} />
        </Source>
        <Source id="dash-events" type="geojson" data={eventGeoJson}>
          <Layer {...EVENT_LAYER} />
          <Layer {...EVENT_HIGHLIGHT_LAYER} filter={highlightFilter} />
        </Source>
      </Map>
    </div>
  );
}
