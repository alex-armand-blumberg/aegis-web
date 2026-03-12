"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type { LatLngExpression } from "leaflet";

const MapContainer = dynamic(
  () => import("react-leaflet").then((m) => m.MapContainer),
  { ssr: false },
);
const TileLayer = dynamic(
  () => import("react-leaflet").then((m) => m.TileLayer),
  { ssr: false },
);
const CircleMarker = dynamic(
  () => import("react-leaflet").then((m) => m.CircleMarker),
  { ssr: false },
);
const Tooltip = dynamic(
  () => import("react-leaflet").then((m) => m.Tooltip),
  { ssr: false },
);

type MapPoint = {
  lat: number;
  lon: number;
  country: string;
  event_month: string;
  total_events: number;
};

export default function MapPage() {
  const [points, setPoints] = useState<MapPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadPoints();
  }, []);

  async function loadPoints() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/map");
      const json = (await res.json()) as { points?: MapPoint[]; error?: string };
      if (!res.ok || json.error) {
        setError(json.error ?? "Failed to load conflict hotspots.");
        setPoints([]);
      } else {
        setPoints(json.points ?? []);
      }
    } catch (e) {
      console.error(e);
      setError("Failed to load conflict hotspots.");
      setPoints([]);
    } finally {
      setLoading(false);
    }
  }

  const center: LatLngExpression = [20, 0];

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      <aside className="hidden w-full max-w-xs flex-col border-r border-slate-800/80 bg-slate-950/95 px-6 py-6 md:flex">
        <div className="mb-6">
          <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-slate-400">
            AEGIS Control Bar
          </p>
          <p className="mt-2 text-xs text-slate-400/80">
            Explore monthly conflict hotspots worldwide based on ACLED&apos;s
            public ArcGIS layer. Each point aggregates events for one
            subnational region in a given month.
          </p>
        </div>
        <p className="text-[11px] text-slate-500">
          Future controls will let you filter by category, date range, and
          country, and switch between 2D and 3D globe views.
        </p>
      </aside>

      <main className="flex-1 px-5 py-6 md:px-8">
        <header className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-slate-50 sm:text-xl">
              Global Conflict Hotspots
            </h1>
            <p className="mt-1 text-xs text-slate-400">
              Monthly ACLED conflict intensity, visualized as subnational
              hotspots.
            </p>
          </div>
        </header>

        <section className="relative h-[460px] overflow-hidden rounded-xl border border-slate-800/80 bg-slate-900/70 shadow-sm">
          {error && (
            <p className="p-4 text-sm text-rose-400">
              {error} The ACLED ArcGIS service may be unavailable.
            </p>
          )}
          {loading && (
            <p className="p-4 text-sm text-slate-300">Loading hotspots…</p>
          )}
          {!loading && !error && (
            <MapContainer
              center={center}
              zoom={2}
              scrollWheelZoom
              className="h-full w-full"
            >
              <TileLayer
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              />
              {points.map((p, idx) => (
                <CircleMarker
                  key={`${p.country}-${idx}-${p.event_month}`}
                  center={[p.lat, p.lon]}
                  radius={Math.max(3, Math.min(12, Math.sqrt(p.total_events)))}
                  pathOptions={{ color: "#f97316", fillOpacity: 0.6 }}
                >
                  <Tooltip direction="top" offset={[0, -4]} opacity={1}>
                    <div className="text-[11px]">
                      <div className="font-semibold">{p.country}</div>
                      <div>{new Date(p.event_month).toLocaleDateString()}</div>
                      <div>Events: {p.total_events}</div>
                    </div>
                  </Tooltip>
                </CircleMarker>
              ))}
            </MapContainer>
          )}
        </section>
      </main>
    </div>
  );
}

