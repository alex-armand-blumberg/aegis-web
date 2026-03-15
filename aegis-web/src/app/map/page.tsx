"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MapPoint } from "@/app/api/map/route";
import { CATEGORY_COLORS } from "@/components/ConflictMap";

const ConflictMap = dynamic(() => import("@/components/ConflictMap"), {
  ssr: false,
});

function getDefaultMonth(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 7);
}

function formatMonthLabel(ym: string): string {
  if (!ym || ym.length < 7) return ym;
  const [y, m] = ym.split("-");
  const date = new Date(Number(y), Number(m) - 1, 1);
  return date.toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });
}

const LEGEND_ENTRIES = [
  { label: "Battles", color: CATEGORY_COLORS["Battles"] ?? "#ef4444" },
  {
    label: "Explosions / Remote Violence",
    color: CATEGORY_COLORS["Explosions / Remote Violence"] ?? "#f59e0b",
  },
  {
    label: "Violence Against Civilians",
    color: CATEGORY_COLORS["Violence Against Civilians"] ?? "#fde047",
  },
  {
    label: "Strategic Developments",
    color: CATEGORY_COLORS["Strategic Developments"] ?? "#60a5fa",
  },
  { label: "Protests", color: CATEGORY_COLORS["Protests"] ?? "#a78bfa" },
  { label: "Riots", color: CATEGORY_COLORS["Riots"] ?? "#ec4899" },
];

export default function MapPage() {
  const [startMonth, setStartMonth] = useState(getDefaultMonth);
  const [endMonth, setEndMonth] = useState(getDefaultMonth);
  const [mode, setMode] = useState<"2d" | "3d">("2d");
  const [points, setPoints] = useState<MapPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const recenterRef = useRef<(() => void) | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setMapReady(false);
    setMapError(null);
    try {
      const params = new URLSearchParams({
        startMonth,
        endMonth,
      });
      const res = await fetch(`/api/map?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to load map data");
      }
      setPoints(data.points ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load conflict data");
      setPoints([]);
    } finally {
      setLoading(false);
    }
  }, [startMonth, endMonth]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    setMapReady(false);
  }, [mode]);

  const handleMapReady = useCallback(() => {
    setMapReady(true);
    setMapError(null);
  }, []);
  const handleMapError = useCallback((message: string) => {
    setMapError(message);
    setMapReady(false);
  }, []);

  const handleFullscreen = useCallback(() => {
    const el = mapContainerRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
      el.classList.remove("is-fullscreen");
    } else {
      el.requestFullscreen();
      el.classList.add("is-fullscreen");
    }
  }, []);

  useEffect(() => {
    const handler = () => {
      if (!document.fullscreenElement && mapContainerRef.current) {
        mapContainerRef.current.classList.remove("is-fullscreen");
      }
    };
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const dateRangeLabel =
    startMonth === endMonth
      ? formatMonthLabel(startMonth)
      : `${formatMonthLabel(startMonth)} – ${formatMonthLabel(endMonth)}`;

  return (
    <div className="map-page min-h-screen text-[#e2e8f0]">
      <nav>
        <Link href="/" className="nav-logo">
          AEG<span>I</span>S<sub className="logo-hq">hq</sub>
        </Link>
        <div className="nav-links">
          <Link href="/">← Back to Home</Link>
          <Link href="/escalation">App</Link>
          <Link href="/map" className="nav-cta">
            Map
          </Link>
        </div>
      </nav>

      <main className="relative z-10 pt-24 pb-12">
        <section>
          <div className="section">
            <p className="section-tag reveal">Conflict Hotspots</p>
            <h1 className="reveal" style={{ marginBottom: "8px" }}>
              Interactive Map
            </h1>
            <p className="section-body reveal" style={{ marginBottom: "24px" }}>
              {dateRangeLabel} · Source:{" "}
              <a
                href="https://acleddata.com"
                target="_blank"
                rel="noreferrer"
                style={{
                  color: "rgba(255,255,255,0.5)",
                  textDecoration: "underline",
                }}
              >
                ACLED (acleddata.com)
              </a>
              . Monthly aggregated at subnational level.
            </p>
          </div>
        </section>

        <div className="section">
          <div className="map-controls">
            <div className="map-date-range">
              <label style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--dim)" }}>
                Start month
              </label>
              <input
                type="month"
                value={startMonth}
                onChange={(e) => setStartMonth(e.target.value)}
                max={endMonth}
              />
              <label style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--dim)" }}>
                End month
              </label>
              <input
                type="month"
                value={endMonth}
                onChange={(e) => setEndMonth(e.target.value)}
                min={startMonth}
              />
              <button
                type="button"
                className="btn-secondary"
                onClick={fetchData}
                style={{ padding: "8px 16px", fontSize: "12px" }}
              >
                Apply
              </button>
            </div>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <span style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--dim)" }}>
                View
              </span>
              <button
                type="button"
                className={mode === "2d" ? "btn-primary" : "btn-secondary"}
                onClick={() => setMode("2d")}
                style={{ padding: "8px 14px", fontSize: "12px" }}
              >
                2D Map
              </button>
              <button
                type="button"
                className={mode === "3d" ? "btn-primary" : "btn-secondary"}
                onClick={() => setMode("3d")}
                style={{ padding: "8px 14px", fontSize: "12px" }}
              >
                3D Globe
              </button>
            </div>
            <button
              type="button"
              className="btn-secondary"
              onClick={handleFullscreen}
              style={{ padding: "8px 14px", fontSize: "12px" }}
            >
              Fullscreen
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => recenterRef.current?.()}
              style={{ padding: "8px 14px", fontSize: "12px" }}
            >
              Recenter
            </button>
          </div>

          <div className="map-legend" style={{ marginBottom: "16px" }}>
            {LEGEND_ENTRIES.map(({ label, color }) => (
              <div key={label} className="map-legend-item">
                <span className="map-legend-dot" style={{ background: color }} />
                <span>{label}</span>
              </div>
            ))}
          </div>

          {error && (
            <div
              style={{
                padding: "16px",
                background: "rgba(239, 68, 68, 0.1)",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                borderRadius: "6px",
                marginBottom: "16px",
                color: "#ef4444",
              }}
            >
              {error}
            </div>
          )}

          {loading ? (
            <div
              className="map-container"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--dim)",
                fontSize: "14px",
              }}
            >
              Loading map data…
            </div>
          ) : (
            <div ref={mapContainerRef} className="map-container" style={{ position: "relative" }}>
              {!mapReady && !mapError && (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "var(--bg)",
                    color: "var(--dim)",
                    fontSize: "14px",
                    zIndex: 5,
                  }}
                >
                  Loading map…
                </div>
              )}
              {mapError && (
                <div
                  style={{
                    position: "absolute",
                    top: "12px",
                    left: "50%",
                    transform: "translateX(-50%)",
                    padding: "10px 16px",
                    background: "rgba(239, 68, 68, 0.15)",
                    border: "1px solid rgba(239, 68, 68, 0.4)",
                    borderRadius: "6px",
                    color: "#ef4444",
                    fontSize: "13px",
                    zIndex: 10,
                  }}
                >
                  {mapError}
                </div>
              )}
              {!loading && points.length === 0 && mapReady && (
                <div
                  style={{
                    position: "absolute",
                    top: "12px",
                    left: "50%",
                    transform: "translateX(-50%)",
                    padding: "8px 14px",
                    background: "var(--card)",
                    border: "1px solid var(--dimmer)",
                    borderRadius: "6px",
                    color: "var(--dim)",
                    fontSize: "12px",
                    zIndex: 10,
                  }}
                >
                  No data for this period. Try another date range.
                </div>
              )}
              <ConflictMap
                containerRef={mapContainerRef}
                points={points}
                mode={mode}
                recenterRef={recenterRef}
                onReady={handleMapReady}
                onError={handleMapError}
              />
            </div>
          )}
        </div>
      </main>

      <footer>
        <div className="footer-logo">AEGIS</div>
        <div className="footer-links">
          <Link href="/escalation">App</Link>
          <Link href="/map">Map</Link>
          <a href="https://www.linkedin.com/in/alexanderbab/" target="_blank" rel="noreferrer">
            LinkedIn
          </a>
          <a href="https://github.com/alex-armand-blumberg/aegis-web" target="_blank" rel="noreferrer">
            GitHub
          </a>
          <a href="https://acleddata.com" target="_blank" rel="noreferrer">
            Data: ACLED
          </a>
        </div>
        <div className="footer-copy">
          &copy; 2026 Alexander Armand-Blumberg &middot; AEGIS
        </div>
      </footer>
    </div>
  );
}
