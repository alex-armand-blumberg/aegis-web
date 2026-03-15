"use client";

import { useEffect, useRef } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from "react-leaflet";
import type { MapPoint } from "@/app/api/map/route";
import { CATEGORY_COLORS } from "@/lib/mapConstants";
import "leaflet/dist/leaflet.css";

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

type ConflictMapProps = {
  points: MapPoint[];
  mode: "2d" | "3d";
  containerRef?: React.RefObject<HTMLDivElement | null>;
  recenterRef?: React.MutableRefObject<(() => void) | null>;
  onReady?: () => void;
  onError?: (message: string) => void;
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

function MapContent({
  points,
  recenterRef,
  onReady,
}: {
  points: MapPoint[];
  recenterRef?: React.MutableRefObject<(() => void) | null>;
  onReady?: () => void;
}) {
  useEffect(() => {
    onReady?.();
  }, [onReady]);

  return (
    <>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      />
      <RecenterControl recenterRef={recenterRef} />
      {points.map((p, i) => {
        const color = CATEGORY_COLORS[p.dominant_category] ?? "rgba(255,255,255,0.6)";
        return (
          <CircleMarker
            key={`${p.lon}-${p.lat}-${i}`}
            center={[p.lat, p.lon]}
            radius={6}
            pathOptions={{
              fillColor: color,
              color: "rgba(255,255,255,0.4)",
              weight: 1,
              fillOpacity: 0.8,
            }}
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

export { CATEGORY_COLORS } from "@/lib/mapConstants";
