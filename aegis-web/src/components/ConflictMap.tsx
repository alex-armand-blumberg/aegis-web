"use client";

import { useEffect, useRef } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from "react-leaflet";
import type { MapPoint } from "@/app/api/map/route";
import "leaflet/dist/leaflet.css";

const CATEGORY_COLORS: Record<string, string> = {
  Battles: "#ef4444",
  "Explosions / Remote Violence": "#f59e0b",
  "Violence Against Civilians": "#fde047",
  "Strategic Developments": "#60a5fa",
  Protests: "#a78bfa",
  Riots: "#f472b6",
};

const DEFAULT_CENTER: [number, number] = [20, 10];
const DEFAULT_ZOOM = 2;

function popupContent(p: MapPoint): string {
  const title = [p.admin1, p.country].filter(Boolean).join(", ") || "Unknown";
  const month = p.event_month
    ? `<div style="color:rgba(255,255,255,0.5);font-size:11px;margin-bottom:8px;">${p.event_month}</div>`
    : "";
  return `
    <div class="map-popup-content">
      <div class="map-popup-title">${title}</div>
      ${month}
      <div class="map-popup-row"><span>Fatalities</span><strong>${Number(p.fatalities ?? 0).toLocaleString()}</strong></div>
      <div class="map-popup-row"><span>Battles</span><strong>${Number(p.battles ?? 0).toLocaleString()}</strong></div>
      <div class="map-popup-row"><span>Explosions / Remote</span><strong>${Number(p.explosions_remote_violence ?? 0).toLocaleString()}</strong></div>
      <div class="map-popup-row"><span>Strategic developments</span><strong>${Number(p.strategic_developments ?? 0).toLocaleString()}</strong></div>
      <div class="map-popup-row"><span>Violence vs civilians</span><strong>${Number(p.violence_against_civilians ?? 0).toLocaleString()}</strong></div>
      <div class="map-popup-row"><span>Protests</span><strong>${Number(p.protests ?? 0).toLocaleString()}</strong></div>
      <div class="map-popup-row"><span>Riots</span><strong>${Number(p.riots ?? 0).toLocaleString()}</strong></div>
    </div>
  `;
}

export type CountryBoundsMap = Record<string, [[number, number], [number, number]]>;

type ConflictMapProps = {
  points: MapPoint[];
  mode: "2d" | "3d";
  containerRef?: React.RefObject<HTMLDivElement | null>;
  recenterRef?: React.MutableRefObject<(() => void) | null>;
  onReady?: () => void;
  onError?: (message: string) => void;
  /** Called when user clicks a point; pass country name to zoom and show panel. */
  onCountrySelect?: (country: string) => void;
  /** Bounds per country for flyToBounds: [[south, west], [north, east]]. */
  countryBoundsMap?: CountryBoundsMap;
};

function RecenterControl({
  recenterRef,
}: {
  recenterRef?: React.MutableRefObject<(() => void) | null>;
}) {
  const map = useMap();
  useEffect(() => {
    if (!recenterRef) return;
    recenterRef.current = () => {
      map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    };
    return () => {
      recenterRef.current = null;
    };
  }, [map, recenterRef]);
  return null;
}

function totalEvents(p: MapPoint): number {
  return (
    (p.battles ?? 0) +
    (p.explosions_remote_violence ?? 0) +
    (p.violence_against_civilians ?? 0) +
    (p.strategic_developments ?? 0) +
    (p.protests ?? 0) +
    (p.riots ?? 0)
  );
}

function MapContent({
  points,
  recenterRef,
  onReady,
  onCountrySelect,
  countryBoundsMap,
}: {
  points: MapPoint[];
  recenterRef?: React.MutableRefObject<(() => void) | null>;
  onReady?: () => void;
  onCountrySelect?: (country: string) => void;
  countryBoundsMap?: CountryBoundsMap;
}) {
  const map = useMap();
  useEffect(() => {
    onReady?.();
  }, [onReady]);

  const maxEvents = Math.max(1, ...points.map(totalEvents));

  return (
    <>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      />
      <RecenterControl recenterRef={recenterRef} />
      {points.map((p, i) => {
        const color = CATEGORY_COLORS[p.dominant_category] ?? "rgba(255,255,255,0.6)";
        const events = totalEvents(p);
        const radius = Math.min(12, 4 + (events / maxEvents) * 8);
        const country = (p.country ?? "").trim() || "Unknown";
        const handleClick = () => {
          onCountrySelect?.(country);
          const bounds = countryBoundsMap?.[country];
          if (bounds && map) {
            map.flyToBounds(bounds, { duration: 1, maxZoom: 9 });
          }
        };
        return (
          <CircleMarker
            key={`${p.lon}-${p.lat}-${i}`}
            center={[p.lat, p.lon]}
            radius={radius}
            pathOptions={{
              fillColor: color,
              color: "rgba(255,255,255,0.4)",
              weight: 1,
              fillOpacity: 0.85,
            }}
            eventHandlers={{ click: handleClick }}
          >
            <Popup>
              <div dangerouslySetInnerHTML={{ __html: popupContent(p) }} />
            </Popup>
          </CircleMarker>
        );
      })}
    </>
  );
}

export default function ConflictMap({
  points,
  mode,
  containerRef: externalContainerRef,
  recenterRef,
  onReady,
  onError,
  onCountrySelect,
  countryBoundsMap,
}: ConflictMapProps) {
  const internalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    onReady?.();
  }, [onReady]);

  const mapStyle = {
    position: "absolute" as const,
    inset: 0,
    width: "100%",
    height: "100%",
    zIndex: 1,
    minHeight: 400,
  };

  const map = (
    <MapContainer
      center={DEFAULT_CENTER}
      zoom={DEFAULT_ZOOM}
      style={mapStyle}
      scrollWheelZoom
    >
      <MapContent
        points={points}
        recenterRef={recenterRef}
        onReady={onReady}
        onCountrySelect={onCountrySelect}
        countryBoundsMap={countryBoundsMap}
      />
    </MapContainer>
  );

  if (externalContainerRef) {
    return <div style={mapStyle}>{map}</div>;
  }
  return (
    <div
      ref={internalRef}
      className="w-full h-full"
      style={{ minHeight: 400, position: "relative" }}
    >
      {map}
    </div>
  );
}

export { CATEGORY_COLORS };
