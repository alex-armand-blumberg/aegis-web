"use client";

import { useEffect, useMemo, useState } from "react";
import DeckGL from "@deck.gl/react";
import { GeoJsonLayer, ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import Map, { NavigationControl } from "react-map-gl/maplibre";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { IntelLayerKey, IntelPoint } from "@/lib/intel/types";
import { LAYER_COLORS } from "@/lib/intel/colors";

export type ConflictMapProps = {
  layers: Record<IntelLayerKey, IntelPoint[]>;
  activeLayers: Record<IntelLayerKey, boolean>;
  recenterRef?: React.MutableRefObject<(() => void) | null>;
  onReady?: () => void;
  onError?: (message: string) => void;
  onPointSelect?: (point: IntelPoint) => void;
};

const DEFAULT_VIEW_STATE = {
  longitude: 0,
  latitude: 20,
  zoom: 1.65,
  pitch: 25,
  bearing: 0,
};

const BASEMAP_STYLE =
  "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
const COUNTRY_GEOJSON_URL =
  "https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json";

function normalizeCountryName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const COUNTRY_NAME_ALIASES: Record<string, string> = {
  "united states of america": "united states",
  "russian federation": "russia",
  "iran islamic republic of": "iran",
  "syrian arab republic": "syria",
  "viet nam": "vietnam",
  "korea republic of": "south korea",
  "korea democratic peoples republic of": "north korea",
  "turkiye": "turkey",
};

function severityRadiusMultiplier(severity: IntelPoint["severity"]): number {
  switch (severity) {
    case "critical":
      return 1.5;
    case "high":
      return 1.2;
    case "medium":
      return 1;
    default:
      return 0.8;
  }
}

export default function ConflictMap({
  layers,
  activeLayers,
  recenterRef,
  onReady,
  onError,
  onPointSelect,
}: ConflictMapProps) {
  const [viewState, setViewState] = useState(DEFAULT_VIEW_STATE);

  useEffect(() => {
    onReady?.();
  }, [onReady]);

  useEffect(() => {
    if (!recenterRef) return;
    recenterRef.current = () => setViewState(DEFAULT_VIEW_STATE);
    return () => {
      recenterRef.current = null;
    };
  }, [recenterRef]);

  const visiblePoints = useMemo(() => {
    const out: IntelPoint[] = [];
    for (const [layer, enabled] of Object.entries(activeLayers) as [
      IntelLayerKey,
      boolean,
    ][]) {
      if (!enabled) continue;
      out.push(...layers[layer]);
    }
    return out;
  }, [activeLayers, layers]);

  const deckLayers = useMemo(() => {
    const countryScore = new globalThis.Map<string, number>();
    for (const p of layers.conflicts) {
      if (!p.country) continue;
      const normalized = normalizeCountryName(p.country);
      const key = COUNTRY_NAME_ALIASES[normalized] ?? normalized;
      const sev = p.severity === "critical" ? 3.5 : p.severity === "high" ? 2.4 : p.severity === "medium" ? 1.4 : 0.7;
      const recencyPenalty = Math.max(
        0.35,
        1 - (Date.now() - new Date(p.timestamp).getTime()) / (1000 * 3600 * 24 * 14)
      );
      countryScore.set(key, (countryScore.get(key) ?? 0) + sev * recencyPenalty);
    }

    const built: any[] = [];
    if (activeLayers.conflicts) {
      built.push(
        new GeoJsonLayer({
          id: "country-conflict-heat",
          data: COUNTRY_GEOJSON_URL,
          pickable: false,
          filled: true,
          stroked: true,
          lineWidthMinPixels: 1,
          getLineColor: [148, 163, 184, 110],
          getFillColor: (f: any) => {
            const rawName = String(f?.properties?.name ?? "");
            const normalized = normalizeCountryName(rawName);
            const key = COUNTRY_NAME_ALIASES[normalized] ?? normalized;
            const score = countryScore.get(key) ?? 0;
            if (score < 1) return [0, 0, 0, 0];
            if (score >= 12) return [185, 28, 28, 145];
            if (score >= 7) return [220, 38, 38, 120];
            if (score >= 3.5) return [239, 68, 68, 95];
            return [248, 113, 113, 70];
          },
          updateTriggers: {
            getFillColor: [layers.conflicts.length],
          },
        })
      );
    }

    built.push(
      ...(Object.keys(activeLayers) as IntelLayerKey[])
      .filter((k) => activeLayers[k])
      .map((layerKey) => {
        const color = LAYER_COLORS[layerKey];
        const layerPoints = layers[layerKey] || [];

        return new ScatterplotLayer<IntelPoint>({
          id: `scatter-${layerKey}`,
          data: layerPoints,
          getPosition: (d) => [d.lon, d.lat],
          getRadius: (d) => {
            const base =
              layerKey === "hotspots" ? 50000 : layerKey === "conflicts" ? 32000 : 22000;
            const magnitude = Math.max(0.6, Math.min(2, (d.magnitude ?? 1) / 20));
            return base * magnitude * severityRadiusMultiplier(d.severity);
          },
          getFillColor: [...color, layerKey === "hotspots" ? 210 : 175],
          getLineColor: [255, 255, 255, 120],
          lineWidthMinPixels: 1,
          stroked: true,
          filled: true,
          pickable: true,
          radiusMinPixels: layerKey === "hotspots" ? 5 : 3,
          radiusMaxPixels: layerKey === "hotspots" ? 26 : 15,
          onClick: ({ object }) => {
            if (object) onPointSelect?.(object);
          },
        });
      })
    );

    if (activeLayers.hotspots) {
      built.push(
        new TextLayer<IntelPoint>({
          id: "hotspot-labels",
          data: layers.hotspots,
          getPosition: (d) => [d.lon, d.lat],
          getText: (d) => (d.country ? d.country.toUpperCase() : "HOTSPOT"),
          getColor: [255, 255, 255, 220],
          getSize: 12,
          sizeUnits: "pixels",
          sizeMinPixels: 10,
          sizeMaxPixels: 14,
          getPixelOffset: [0, -15],
          getTextAnchor: "middle",
          getAlignmentBaseline: "bottom",
          billboard: true,
          pickable: false,
        })
      );
    }

    return built;
  }, [activeLayers, layers, onPointSelect]);

  return (
    <DeckGL
      layers={deckLayers}
      initialViewState={DEFAULT_VIEW_STATE}
      controller={true}
      viewState={viewState}
      onViewStateChange={({ viewState: next }) =>
        setViewState({
          longitude: (next as any).longitude,
          latitude: (next as any).latitude,
          zoom: (next as any).zoom,
          pitch: (next as any).pitch,
          bearing: (next as any).bearing,
        })
      }
      getCursor={({ isHovering }) => (isHovering ? "pointer" : "grab")}
    >
      <Map
        mapLib={maplibregl}
        mapStyle={BASEMAP_STYLE}
        attributionControl={false}
        reuseMaps
        onLoad={() => onReady?.()}
        onError={(e) => {
          const msg =
            typeof (e as { error?: { message?: string } }).error?.message ===
            "string"
              ? (e as { error: { message: string } }).error.message
              : "Map error";
          onError?.(msg);
        }}
      >
        <NavigationControl position="top-left" visualizePitch={true} />
      </Map>
      {visiblePoints.length === 0 && (
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: 90,
            transform: "translateX(-50%)",
            zIndex: 20,
            padding: "8px 12px",
            borderRadius: 6,
            border: "1px solid rgba(96,165,250,0.3)",
            background: "rgba(2,8,20,0.8)",
            color: "rgba(226,232,240,0.85)",
            fontSize: 12,
            letterSpacing: "0.04em",
          }}
        >
          No active points for selected layers and time range.
        </div>
      )}
    </DeckGL>
  );
}
