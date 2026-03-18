"use client";

import { useEffect, useMemo, useState } from "react";
import DeckGL from "@deck.gl/react";
import { GeoJsonLayer, ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import Map, { NavigationControl } from "react-map-gl/maplibre";
import maplibregl from "maplibre-gl";
import type { Feature, FeatureCollection, GeoJsonProperties, Geometry } from "geojson";
import "maplibre-gl/dist/maplibre-gl.css";
import type {
  ActiveConflictCountry,
  EscalationRiskCountry,
  FrontlineOverlay,
  IntelLayerKey,
  IntelPoint,
} from "@/lib/intel/types";
import { LAYER_COLORS } from "@/lib/intel/colors";

export type ConflictMapProps = {
  layers: Record<IntelLayerKey, IntelPoint[]>;
  activeLayers: Record<IntelLayerKey, boolean>;
  activeConflictCountries?: ActiveConflictCountry[];
  escalationRiskCountries?: EscalationRiskCountry[];
  frontlineOverlays?: FrontlineOverlay[];
  recenterRef?: React.MutableRefObject<(() => void) | null>;
  onReady?: () => void;
  onError?: (message: string) => void;
  onPointSelect?: (point: IntelPoint) => void;
  onCountrySelect?: (country: string) => void;
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

function hashString(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function jitteredPosition(point: IntelPoint, layerKey: IntelLayerKey): [number, number] {
  if (layerKey !== "news" && layerKey !== "liveStrikes") return [point.lon, point.lat];
  const seed = hashString(`${layerKey}:${point.id}:${point.timestamp}:${point.lat}:${point.lon}`);
  const angle = ((seed % 360) * Math.PI) / 180;
  const maxRadiusDeg = layerKey === "news" ? 0.09 : 0.06;
  const radial = (((seed >>> 9) % 1000) / 1000) * maxRadiusDeg;
  const lat = point.lat + Math.sin(angle) * radial;
  const lon = point.lon + Math.cos(angle) * radial;
  return [lon, lat];
}

function isGeoJsonFeature(value: unknown): value is Feature<Geometry, GeoJsonProperties> {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { type?: unknown; geometry?: unknown };
  return candidate.type === "Feature" && typeof candidate.geometry === "object" && candidate.geometry !== null;
}

function isGeoJsonFeatureCollection(
  value: unknown
): value is FeatureCollection<Geometry, GeoJsonProperties> {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { type?: unknown; features?: unknown };
  return (
    candidate.type === "FeatureCollection" &&
    Array.isArray(candidate.features)
  );
}

export default function ConflictMap({
  layers,
  activeLayers,
  activeConflictCountries = [],
  escalationRiskCountries = [],
  frontlineOverlays = [],
  recenterRef,
  onReady,
  onError,
  onPointSelect,
  onCountrySelect,
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
    for (const c of activeConflictCountries) {
      const normalized = normalizeCountryName(c.country);
      const key = COUNTRY_NAME_ALIASES[normalized] ?? normalized;
      countryScore.set(key, c.score);
    }
    const riskScore = new globalThis.Map<string, number>();
    for (const c of escalationRiskCountries) {
      const normalized = normalizeCountryName(c.country);
      const key = COUNTRY_NAME_ALIASES[normalized] ?? normalized;
      riskScore.set(key, c.riskScore);
    }

    const built: any[] = [];
    if (activeConflictCountries.length > 0) {
      built.push(
        new GeoJsonLayer({
          id: "country-conflict-heat",
          data: COUNTRY_GEOJSON_URL,
          pickable: true,
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
            getFillColor: [
              activeConflictCountries.map((c) => `${c.country}:${c.score}`).join("|"),
            ],
          },
          onClick: ({ object }: any) => {
            const rawName = String(object?.properties?.name ?? "").trim();
            if (rawName) onCountrySelect?.(rawName);
          },
        })
      );
    }

    if (activeLayers.escalationRisk && escalationRiskCountries.length > 0) {
      built.push(
        new GeoJsonLayer({
          id: "country-escalation-risk",
          data: COUNTRY_GEOJSON_URL,
          pickable: false,
          filled: true,
          stroked: false,
          getFillColor: (f: any) => {
            const rawName = String(f?.properties?.name ?? "");
            const normalized = normalizeCountryName(rawName);
            const key = COUNTRY_NAME_ALIASES[normalized] ?? normalized;
            const score = riskScore.get(key) ?? 0;
            if (score <= 0) return [0, 0, 0, 0];
            if (score >= 14) return [219, 39, 119, 120];
            if (score >= 8) return [236, 72, 153, 95];
            return [244, 114, 182, 70];
          },
          updateTriggers: {
            getFillColor: [
              escalationRiskCountries.map((c) => `${c.country}:${c.riskScore}`).join("|"),
            ],
          },
        })
      );
    }

    if (frontlineOverlays.length > 0) {
      const features: Feature<Geometry, GeoJsonProperties>[] = [];
      for (const o of frontlineOverlays) {
        const g = o.geojson;
        if (isGeoJsonFeature(g)) {
          features.push(g);
          continue;
        }
        if (isGeoJsonFeatureCollection(g)) {
          for (const f of g.features) {
            if (isGeoJsonFeature(f)) features.push(f);
          }
        }
      }

      const frontlineFeatureCollection: FeatureCollection<
        Geometry,
        GeoJsonProperties
      > = {
        type: "FeatureCollection",
        features,
      };
      built.push(
        new GeoJsonLayer({
          id: "land-war-frontline-overlays",
          data: frontlineFeatureCollection,
          pickable: false,
          stroked: true,
          // Frontline/control overlays are line geometries (not filled polygons).
          // Rendering them as filled caused visual artifacts that looked like blobs/circles.
          filled: false,
          lineWidthUnits: "pixels",
          getLineWidth: 2,
          lineWidthMinPixels: 2,
          lineWidthMaxPixels: 2,
          getLineColor: [253, 186, 116, 220],
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
          getPosition: (d) => jitteredPosition(d, layerKey),
          getRadius: (d) => {
            const base =
              layerKey === "hotspots"
                ? 42000
                : layerKey === "liveStrikes"
                  ? 25000
                  : layerKey === "news"
                    ? 15500
                  : layerKey === "conflicts"
                    ? 23000
                    : 18500;
            const magnitude = Math.max(0.6, Math.min(2, (d.magnitude ?? 1) / 20));
            return base * magnitude * severityRadiusMultiplier(d.severity);
          },
          getFillColor: [
            ...color,
            layerKey === "hotspots"
              ? 210
              : layerKey === "news"
                ? 140
                : layerKey === "liveStrikes"
                  ? 160
                  : 170,
          ],
          getLineColor: [255, 255, 255, layerKey === "news" ? 70 : 90],
          lineWidthMinPixels: 1,
          stroked: true,
          filled: true,
          pickable: true,
          radiusMinPixels:
            layerKey === "hotspots" ? 5 : layerKey === "news" ? 2 : 3,
          radiusMaxPixels:
            layerKey === "hotspots"
              ? 24
              : layerKey === "news"
                ? 10
                : layerKey === "liveStrikes"
                  ? 12
                  : 14,
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
  }, [
    activeConflictCountries,
    activeLayers,
    escalationRiskCountries,
    frontlineOverlays,
    layers,
    onCountrySelect,
    onPointSelect,
  ]);

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
