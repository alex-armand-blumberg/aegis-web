"use client";

import { WebMercatorViewport } from "@deck.gl/core";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
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
  RegionSelection,
} from "@/lib/intel/types";
import { LAYER_COLORS } from "@/lib/intel/colors";
import { formatCountryMapLabelShort } from "@/lib/countryDisplay";
import { getOceanRegionFeatures } from "@/lib/regionGeometry";

export type ConflictMapHandle = {
  flyTo: (opts: { longitude: number; latitude: number; zoom?: number }) => void;
  /** Bounds from getCountryBounds: [[latMin, lonMin], [latMax, lonMax]] */
  fitLatLngBounds: (bounds: [[number, number], [number, number]]) => void;
  recenter: () => void;
};

export type ConflictMapProps = {
  layers: Record<IntelLayerKey, IntelPoint[]>;
  activeLayers: Record<IntelLayerKey, boolean>;
  activeConflictCountries?: ActiveConflictCountry[];
  escalationRiskCountries?: EscalationRiskCountry[];
  frontlineOverlays?: FrontlineOverlay[];
  recenterRef?: React.MutableRefObject<(() => void) | null>;
  selectedPointId?: string | null;
  onReady?: () => void;
  onError?: (message: string) => void;
  onPointSelect?: (point: IntelPoint) => void;
  onCountrySelect?: (country: string) => void;
  onRegionSelect?: (selection: RegionSelection) => void;
  onHoverIntel?: (info: { point: IntelPoint; x: number; y: number } | null) => void;
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
  "democratic republic of congo": "democratic republic of the congo",
  "democratic republic of the congo": "democratic republic of the congo",
  drc: "democratic republic of the congo",
  "viet nam": "vietnam",
  "korea republic of": "south korea",
  "korea democratic peoples republic of": "north korea",
  turkiye: "turkey",
  palestine: "judea & samaria / palestine",
};
const COUNTRY_HIGHLIGHT_DENYLIST = new Set([
  "india",
  "democratic republic of the congo",
  "mexico",
  "chad",
  "united kingdom",
  "great britain",
]);
const CONFLICT_LAYER_KEYS = new Set<IntelLayerKey>([
  "conflicts",
  "conflictsBattles",
  "conflictsExplosions",
  "conflictsCivilians",
  "conflictsStrategic",
  "conflictsProtests",
  "conflictsRiots",
]);

function isCountryHighlightDenied(name: string): boolean {
  const normalized = normalizeCountryName(name);
  const canonical = COUNTRY_NAME_ALIASES[normalized] ?? normalized;
  return COUNTRY_HIGHLIGHT_DENYLIST.has(canonical);
}

function getFeatureCountryName(feature: unknown): string {
  if (typeof feature !== "object" || feature === null) return "";
  const candidate = feature as { properties?: { name?: unknown } };
  return typeof candidate.properties?.name === "string" ? candidate.properties.name : "";
}

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

function isIntelPoint(o: unknown): o is IntelPoint {
  if (typeof o !== "object" || o === null) return false;
  const p = o as IntelPoint;
  return typeof p.id === "string" && typeof p.layer === "string" && typeof p.title === "string";
}

function refineBasemap(map: maplibregl.Map) {
  try {
    const styleLayers = map.getStyle().layers ?? [];
    for (const layer of styleLayers) {
      const id = layer.id.toLowerCase();
      if (layer.type === "line" && (id.includes("boundary") || id.includes("admin"))) {
        try {
          map.setPaintProperty(layer.id, "line-color", "rgba(148,163,184,0.5)");
          map.setPaintProperty(layer.id, "line-width", 0.75);
        } catch {
          /* layer may not support */
        }
      }
      if (layer.type === "symbol") {
        try {
          map.setPaintProperty(layer.id, "text-color", "rgba(226,232,240,0.88)");
          map.setPaintProperty(layer.id, "text-halo-color", "rgba(2,6,18,0.82)");
          map.setPaintProperty(layer.id, "text-halo-width", 1.1);
        } catch {
          /* optional */
        }
      }
    }
  } catch {
    /* ignore */
  }
}

const ConflictMap = forwardRef<ConflictMapHandle, ConflictMapProps>(function ConflictMap(
  {
    layers,
    activeLayers,
    activeConflictCountries = [],
    escalationRiskCountries = [],
    frontlineOverlays = [],
    recenterRef,
    selectedPointId = null,
    onReady,
    onError,
    onPointSelect,
    onCountrySelect,
    onRegionSelect,
    onHoverIntel,
  },
  ref
) {
  const [viewState, setViewState] = useState(DEFAULT_VIEW_STATE);
  const viewStateRef = useRef(viewState);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    viewStateRef.current = viewState;
  }, [viewState]);

  const recenter = useCallback(() => setViewState(DEFAULT_VIEW_STATE), []);

  useImperativeHandle(
    ref,
    () => ({
      flyTo: ({ longitude, latitude, zoom }) => {
        setViewState((v) => ({
          ...v,
          longitude,
          latitude,
          zoom: typeof zoom === "number" ? zoom : v.zoom,
        }));
      },
      fitLatLngBounds: (bounds) => {
        const el = containerRef.current;
        if (!el) return;
        const w = el.clientWidth || 800;
        const h = el.clientHeight || 600;
        const [[lat0, lon0], [lat1, lon1]] = bounds;
        const minLng = Math.min(lon0, lon1);
        const maxLng = Math.max(lon0, lon1);
        const minLat = Math.min(lat0, lat1);
        const maxLat = Math.max(lat0, lat1);
        const vs = viewStateRef.current;
        try {
          const viewport = new WebMercatorViewport({
            width: w,
            height: h,
            ...vs,
          });
          const { longitude, latitude, zoom } = viewport.fitBounds(
            [
              [minLng, minLat],
              [maxLng, maxLat],
            ],
            { padding: 48 }
          );
          setViewState((v) => ({ ...v, longitude, latitude, zoom, pitch: v.pitch, bearing: v.bearing }));
        } catch {
          const cx = (minLng + maxLng) / 2;
          const cy = (minLat + maxLat) / 2;
          setViewState((v) => ({ ...v, longitude: cx, latitude: cy, zoom: Math.max(v.zoom, 4) }));
        }
      },
      recenter,
    }),
    [recenter]
  );

  useEffect(() => {
    if (!recenterRef) return;
    recenterRef.current = recenter;
    return () => {
      recenterRef.current = null;
    };
  }, [recenter, recenterRef]);

  const visiblePoints = useMemo(() => {
    const out: IntelPoint[] = [];
    for (const [layer, enabled] of Object.entries(activeLayers) as [IntelLayerKey, boolean][]) {
      if (!enabled) continue;
      out.push(...layers[layer]);
    }
    return out;
  }, [activeLayers, layers]);

  const deckLayers = useMemo(() => {
    const oceanRegions = getOceanRegionFeatures();
    const countryScore = new globalThis.Map<string, number>();
    for (const c of activeConflictCountries) {
      if (isCountryHighlightDenied(c.country)) continue;
      const normalized = normalizeCountryName(c.country);
      const key = COUNTRY_NAME_ALIASES[normalized] ?? normalized;
      countryScore.set(key, c.score);
    }
    const riskScore = new globalThis.Map<string, number>();
    for (const c of escalationRiskCountries) {
      if (isCountryHighlightDenied(c.country)) continue;
      const normalized = normalizeCountryName(c.country);
      const key = COUNTRY_NAME_ALIASES[normalized] ?? normalized;
      riskScore.set(key, c.riskScore);
    }

    const built: Array<GeoJsonLayer<unknown> | ScatterplotLayer<IntelPoint> | TextLayer<IntelPoint>> = [];
    if (activeConflictCountries.length > 0) {
      built.push(
        new GeoJsonLayer({
          id: "country-conflict-heat",
          data: COUNTRY_GEOJSON_URL,
          pickable: true,
          filled: true,
          stroked: true,
          lineWidthMinPixels: 1,
          getLineColor: [148, 163, 184, 100],
          getFillColor: (f) => {
            const rawName = getFeatureCountryName(f);
            if (isCountryHighlightDenied(rawName)) return [0, 0, 0, 0];
            const normalized = normalizeCountryName(rawName);
            const key = COUNTRY_NAME_ALIASES[normalized] ?? normalized;
            const score = countryScore.get(key) ?? 0;
            if (score < 1) return [0, 0, 0, 0];
            if (score >= 12) return [185, 28, 28, 118];
            if (score >= 7) return [220, 38, 38, 98];
            if (score >= 3.5) return [239, 68, 68, 78];
            return [248, 113, 113, 58];
          },
          updateTriggers: {
            getFillColor: [activeConflictCountries.map((c) => `${c.country}:${c.score}`).join("|")],
          },
        })
      );
    }

    built.push(
      new GeoJsonLayer({
        id: "oceanic-region-picking",
        data: {
          type: "FeatureCollection",
          features: oceanRegions,
        } as FeatureCollection<Geometry, GeoJsonProperties>,
        pickable: true,
        filled: true,
        stroked: false,
        getFillColor: [0, 0, 0, 1],
        onClick: ({ object }) => {
          const feature = object as { properties?: { regionKey?: string; name?: string } } | null;
          const regionKey = feature?.properties?.regionKey?.trim();
          const name = feature?.properties?.name?.trim();
          if (!regionKey || !name) return;
          onRegionSelect?.({
            kind: "ocean",
            key: regionKey,
            name,
          });
        },
      })
    );

    built.push(
      new GeoJsonLayer({
        id: "country-picking-only",
        data: COUNTRY_GEOJSON_URL,
        pickable: true,
        filled: true,
        stroked: false,
        getFillColor: [0, 0, 0, 1],
        onClick: ({ object }) => {
          const rawName = getFeatureCountryName(object).trim();
          if (!rawName) return;
          onCountrySelect?.(rawName);
          onRegionSelect?.({
            kind: "country",
            key: normalizeCountryName(rawName),
            name: rawName,
            country: rawName,
          });
        },
      })
    );

    if (activeLayers.escalationRisk && escalationRiskCountries.length > 0) {
      built.push(
        new GeoJsonLayer({
          id: "country-escalation-risk",
          data: COUNTRY_GEOJSON_URL,
          pickable: false,
          filled: true,
          stroked: false,
          getFillColor: (f) => {
            const rawName = getFeatureCountryName(f);
            if (isCountryHighlightDenied(rawName)) return [0, 0, 0, 0];
            const normalized = normalizeCountryName(rawName);
            const key = COUNTRY_NAME_ALIASES[normalized] ?? normalized;
            const score = riskScore.get(key) ?? 0;
            if (score <= 0) return [0, 0, 0, 0];
            if (score >= 14) return [219, 39, 119, 98];
            if (score >= 8) return [236, 72, 153, 78];
            return [244, 114, 182, 58];
          },
          updateTriggers: {
            getFillColor: [escalationRiskCountries.map((c) => `${c.country}:${c.riskScore}`).join("|")],
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

      const lineFeatures = features.filter((f) => {
        const t = f.geometry?.type;
        return t === "LineString" || t === "MultiLineString";
      });
      const polygonFeatures = features.filter((f) => {
        const t = f.geometry?.type;
        return t === "Polygon" || t === "MultiPolygon";
      });

      if (polygonFeatures.length > 0) {
        const maritimePolygons: FeatureCollection<Geometry, GeoJsonProperties> = {
          type: "FeatureCollection",
          features: polygonFeatures,
        };
        built.push(
          new GeoJsonLayer({
            id: "land-war-maritime-escalation-fill",
            data: maritimePolygons,
            pickable: false,
            stroked: true,
            filled: true,
            lineWidthUnits: "pixels",
            getLineWidth: 1,
            lineWidthMinPixels: 1,
            lineWidthMaxPixels: 2,
            getLineColor: [248, 113, 113, 160],
            getFillColor: [220, 38, 38, 72],
          })
        );
      }

      if (lineFeatures.length > 0) {
        const lineCollection: FeatureCollection<Geometry, GeoJsonProperties> = {
          type: "FeatureCollection",
          features: lineFeatures,
        };
        built.push(
          new GeoJsonLayer({
            id: "land-war-frontline-overlays",
            data: lineCollection,
            pickable: false,
            stroked: true,
            filled: false,
            lineWidthUnits: "pixels",
            getLineWidth: 2,
            lineWidthMinPixels: 2,
            lineWidthMaxPixels: 2,
            getLineColor: [253, 186, 116, 200],
          })
        );
      }
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
                  ? 15000
                  : layerKey === "liveStrikes"
                    ? 25000
                    : layerKey === "news"
                      ? 15500
                      : CONFLICT_LAYER_KEYS.has(layerKey)
                        ? 23000
                        : 18500;
              const magnitude = Math.max(0.6, Math.min(2, (d.magnitude ?? 1) / 20));
              let r = base * magnitude * severityRadiusMultiplier(d.severity);
              if (selectedPointId && d.id === selectedPointId) r *= 1.2;
              return r;
            },
            getFillColor: (d) => {
              const sel = selectedPointId && d.id === selectedPointId;
              const alpha =
                layerKey === "hotspots"
                  ? sel
                    ? 245
                    : 210
                  : layerKey === "news"
                    ? sel
                      ? 200
                      : 140
                    : layerKey === "liveStrikes"
                      ? sel
                        ? 210
                        : 160
                      : sel
                        ? 220
                        : 170;
              return [...color, alpha];
            },
            getLineColor: (d) => {
              const sel = selectedPointId && d.id === selectedPointId;
              if (sel) return [125, 211, 252, 255];
              return [255, 255, 255, layerKey === "news" ? 70 : 90];
            },
            lineWidthMinPixels: selectedPointId ? 2 : 1.25,
            stroked: true,
            filled: true,
            pickable: true,
            radiusMinPixels:
              layerKey === "hotspots" ? 3 : layerKey === "news" ? 2.5 : 3,
            radiusMaxPixels:
              layerKey === "hotspots"
                ? 16
                : layerKey === "news"
                  ? 12
                  : layerKey === "liveStrikes"
                    ? 14
                    : 16,
            onClick: ({ object }) => {
              if (object) onPointSelect?.(object);
            },
            updateTriggers: {
              getFillColor: [selectedPointId],
              getLineColor: [selectedPointId],
              getRadius: [selectedPointId],
              lineWidthMinPixels: [selectedPointId],
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
          getText: (d) => (d.country ? formatCountryMapLabelShort(d.country) : "HOTSPOT"),
          getColor: [255, 255, 255, 220],
          getSize: 11,
          sizeUnits: "pixels",
          sizeMinPixels: 9,
          sizeMaxPixels: 13,
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
    onRegionSelect,
    onPointSelect,
    selectedPointId,
  ]);

  const onDeckHover = useCallback(
    (info: { object?: unknown; x: number; y: number }) => {
      if (!onHoverIntel) return;
      const o = info.object;
      if (isIntelPoint(o)) {
        const el = containerRef.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        onHoverIntel({ point: o, x: r.left + info.x, y: r.top + info.y });
      } else {
        onHoverIntel(null);
      }
    },
    [onHoverIntel]
  );

  return (
    <div ref={containerRef} style={{ width: "100%", height: "100%", position: "relative" }}>
      <DeckGL
        layers={deckLayers}
        initialViewState={DEFAULT_VIEW_STATE}
        controller={true}
        viewState={viewState}
        onViewStateChange={({ viewState: next }) =>
          setViewState((prev) => {
            const candidate = next as Partial<typeof DEFAULT_VIEW_STATE>;
            return {
              longitude: typeof candidate.longitude === "number" ? candidate.longitude : prev.longitude,
              latitude: typeof candidate.latitude === "number" ? candidate.latitude : prev.latitude,
              zoom: typeof candidate.zoom === "number" ? candidate.zoom : prev.zoom,
              pitch: typeof candidate.pitch === "number" ? candidate.pitch : prev.pitch,
              bearing: typeof candidate.bearing === "number" ? candidate.bearing : prev.bearing,
            };
          })
        }
        onHover={onHoverIntel ? onDeckHover : undefined}
        getCursor={({ isHovering }) => (isHovering ? "pointer" : "grab")}
      >
        <Map
          mapLib={maplibregl}
          mapStyle={BASEMAP_STYLE}
          attributionControl={false}
          reuseMaps
          onLoad={(e) => {
            refineBasemap(e.target);
            onReady?.();
          }}
          onError={(e) => {
            const msg =
              typeof (e as { error?: { message?: string } }).error?.message === "string"
                ? (e as { error: { message: string } }).error.message
                : "Map error";
            onError?.(msg);
          }}
        >
          <NavigationControl position="top-left" visualizePitch={true} />
        </Map>
        {visiblePoints.length === 0 && (
          <div className="map-empty-overlay">No active points for selected layers and time range.</div>
        )}
      </DeckGL>
    </div>
  );
});

export default ConflictMap;
