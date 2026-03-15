"use client";

import { useEffect, useRef, useCallback } from "react";
import type { MapPoint } from "@/app/api/map/route";

const CATEGORY_COLORS: Record<string, string> = {
  Battles: "#ef4444",
  "Explosions / Remote Violence": "#f59e0b",
  "Violence Against Civilians": "#fde047",
  "Strategic Developments": "#60a5fa",
  Protests: "#a78bfa",
  Riots: "#ec4899",
};

const DEFAULT_CENTER = { longitude: 10, latitude: 20 };
const DEFAULT_ZOOM = 2;

const ARCGIS_JS_URL = "https://js.arcgis.com/4.29/";

declare global {
  interface Window {
    require?: (modules: string[], callback: (...args: unknown[]) => void) => void;
    __arcgis_loaded?: Promise<void>;
  }
}

function loadArcGIS(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.__arcgis_loaded) return window.__arcgis_loaded;
  const apiKey =
    typeof process !== "undefined" ? process.env.NEXT_PUBLIC_ARCGIS_API_KEY ?? "" : "";
  const url = apiKey
    ? `${ARCGIS_JS_URL}?api_key=${encodeURIComponent(apiKey)}`
    : ARCGIS_JS_URL;
  window.__arcgis_loaded = new Promise((resolve, reject) => {
    function tryResolve() {
      if (typeof window.require === "function") return resolve();
      setTimeout(tryResolve, 50);
    }
    if (document.querySelector(`script[src^="${ARCGIS_JS_URL}"]`)) {
      tryResolve();
      return;
    }
    const script = document.createElement("script");
    script.src = url;
    script.async = true;
    script.onload = tryResolve;
    script.onerror = () => reject(new Error("Failed to load ArcGIS"));
    document.head.appendChild(script);
  });
  return window.__arcgis_loaded;
}

type ConflictMapProps = {
  points: MapPoint[];
  mode: "2d" | "3d";
  containerRef?: React.RefObject<HTMLDivElement | null>;
  recenterRef?: React.MutableRefObject<(() => void) | null>;
  onReady?: () => void;
  onError?: (message: string) => void;
};

export default function ConflictMap({
  points,
  mode,
  containerRef: externalContainerRef,
  recenterRef,
  onReady,
  onError,
}: ConflictMapProps) {
  const internalRef = useRef<HTMLDivElement>(null);
  const containerRef = externalContainerRef ?? internalRef;
  const viewRef = useRef<{ destroy: () => void } | null>(null);

  const initView = useCallback(async () => {
    if (!containerRef.current) return;

    await loadArcGIS();
    const require = window.require;
    if (!require) return;

    return new Promise<() => void>((resolve, reject) => {
      require(
        [
          "esri/Map",
          "esri/views/MapView",
          "esri/views/SceneView",
          "esri/Graphic",
          "esri/layers/GraphicsLayer",
          "esri/geometry/Point",
          "esri/symbols/SimpleMarkerSymbol",
        ],
        (Map: unknown, MapView: unknown, SceneView: unknown, Graphic: unknown, GraphicsLayer: unknown, Point: unknown, SimpleMarkerSymbol: unknown) => {
          const ctor = (m: unknown) =>
            m != null && typeof (m as { default?: unknown }).default === "function"
              ? ((m as { default: new (opts?: object) => object }).default as new (opts?: object) => object)
              : (m as new (opts?: object) => object);

          const MapC = ctor(Map);
          const MapViewC = ctor(MapView);
          const SceneViewC = ctor(SceneView);
          const GraphicC = ctor(Graphic);
          const GraphicsLayerC = ctor(GraphicsLayer);
          const PointC = ctor(Point);
          const SimpleMarkerSymbolC = ctor(SimpleMarkerSymbol);

          if (typeof MapC !== "function") {
            onError?.("Map module failed to load");
            reject(new Error("Map module failed to load"));
            return;
          }

          try {
            const map = new (MapC as new (opts: { basemap: string }) => object)({ basemap: "dark-gray-vector" });

            const graphics = (points || []).map((p) => {
              const color =
                CATEGORY_COLORS[p.dominant_category] ?? "rgba(255,255,255,0.6)";
              const symbol = new (SimpleMarkerSymbolC as new (opts: object) => object)({
                color,
                size: 8,
                outline: { color: [255, 255, 255, 0.4], width: 1 },
              });
              return new GraphicC({
                geometry: new PointC({
                  longitude: p.lon,
                  latitude: p.lat,
                }),
                symbol,
                attributes: {
                  country: p.country,
                  admin1: p.admin1 ?? "",
                  event_month: p.event_month,
                  battles: p.battles,
                  explosions_remote_violence: p.explosions_remote_violence,
                  violence_against_civilians: p.violence_against_civilians,
                  strategic_developments: p.strategic_developments,
                  protests: p.protests,
                  riots: p.riots,
                  fatalities: p.fatalities,
                  violent_actors: p.violent_actors,
                  dominant_category: p.dominant_category,
                },
              });
            });

            const layer = new GraphicsLayerC({ graphics });
            (map as { add: (l: object) => void }).add(layer);

            const center = [
              DEFAULT_CENTER.longitude,
              DEFAULT_CENTER.latitude,
            ] as [number, number];
            const zoom = DEFAULT_ZOOM;

            const view =
              mode === "3d"
                ? new SceneViewC({
                    container: containerRef.current,
                    map,
                    center,
                    zoom,
                    viewingMode: "global",
                    environment: {
                      background: { type: "color", color: [2, 6, 17] },
                      atmosphereEnabled: true,
                    },
                  })
                : new MapViewC({
                    container: containerRef.current,
                    map,
                    center,
                    zoom,
                  });

            viewRef.current = view;

            if (view.popup) {
              (view.popup as { dockEnabled: boolean; dockOptions: object; defaultPopupTemplateEnabled: boolean }).dockEnabled = true;
              (view.popup as { dockOptions: object }).dockOptions = {
                position: "bottom-center",
                breakpoint: { width: 400 },
              };
              (view.popup as { defaultPopupTemplateEnabled: boolean }).defaultPopupTemplateEnabled = false;
            }

            view.on("click", (event: { mapPoint: object }) => {
              view.hitTest(event).then((response) => {
                const result = response.results.find(
                  (r) => r.graphic?.layer === layer
                );
                const graphic = result?.graphic;
                if (!graphic?.attributes) return;
                const attrs = graphic.attributes;
                const geometry = graphic.geometry;
                if (geometry) {
                  view.goTo(
                    {
                      target: geometry,
                      zoom: Math.min(view.zoom + 2, 12),
                    },
                    { duration: 400 }
                  );
                }
                const title = [attrs.admin1, attrs.country]
                  .filter(Boolean)
                  .join(", ");
                const month =
                  typeof attrs.event_month === "string"
                    ? attrs.event_month
                    : String(attrs.event_month ?? "");
                const content = `
                  <div class="map-popup-content">
                    <div class="map-popup-title">${title || "Unknown"}</div>
                    ${month ? `<div style="color:rgba(255,255,255,0.5);font-size:11px;margin-bottom:8px;">${month}</div>` : ""}
                    <div class="map-popup-row"><span>Fatalities</span><strong>${Number(attrs.fatalities ?? 0).toLocaleString()}</strong></div>
                    <div class="map-popup-row"><span>Battles</span><strong>${Number(attrs.battles ?? 0).toLocaleString()}</strong></div>
                    <div class="map-popup-row"><span>Explosions / Remote</span><strong>${Number(attrs.explosions_remote_violence ?? 0).toLocaleString()}</strong></div>
                    <div class="map-popup-row"><span>Strategic developments</span><strong>${Number(attrs.strategic_developments ?? 0).toLocaleString()}</strong></div>
                    <div class="map-popup-row"><span>Violence vs civilians</span><strong>${Number(attrs.violence_against_civilians ?? 0).toLocaleString()}</strong></div>
                    <div class="map-popup-row"><span>Protests</span><strong>${Number(attrs.protests ?? 0).toLocaleString()}</strong></div>
                    <div class="map-popup-row"><span>Riots</span><strong>${Number(attrs.riots ?? 0).toLocaleString()}</strong></div>
                  </div>
                `;
                if (view.popup) {
                  const popup = view.popup as {
                    open: (opts: {
                      location: object;
                      title: string;
                      content: string;
                    }) => void;
                  };
                  const loc =
                    geometry && typeof geometry === "object" && "longitude" in geometry
                      ? geometry
                      : event.mapPoint;
                  popup.open({
                    location: loc as object,
                    title: title || "Conflict events",
                    content,
                  });
                }
              }).catch(() => {});
            });

            const recenter = () => {
              view.goTo({
                center: [DEFAULT_CENTER.longitude, DEFAULT_CENTER.latitude],
                zoom: DEFAULT_ZOOM,
              });
            };
            if (recenterRef) recenterRef.current = recenter;

            onReady?.();
            resolve(() => {
              view.destroy();
              viewRef.current = null;
              if (recenterRef) recenterRef.current = null;
            });
          } catch (err) {
            const msg = err instanceof Error ? err.message : "Map failed to load";
            onError?.(msg);
            reject(err);
          }
        }
      );
    });
  }, [points, mode, containerRef, recenterRef, onReady, onError]);

  useEffect(() => {
    let destroy: (() => void) | void;
    initView()
      .then((d) => {
        destroy = d;
      })
      .catch((err) => {
        onError?.(err instanceof Error ? err.message : "Map failed to load");
      });
    return () => {
      if (typeof destroy === "function") destroy();
    };
  }, [initView, onError]);

  if (externalContainerRef) {
    return null;
  }
  return (
    <div ref={internalRef} className="w-full h-full min-h-[400px]" />
  );
}

export { CATEGORY_COLORS };
