"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  EscalationRiskCountry,
  CountryIntelResponse,
  IntelLayerKey,
  IntelPoint,
  MapApiResponse,
} from "@/lib/intel/types";
import { layerColorCss } from "@/lib/intel/colors";
import IntelInfoPanel from "@/components/IntelInfoPanel";
import CountryIntelPanel from "@/components/CountryIntelPanel";

const ConflictMap = dynamic(() => import("@/components/ConflictMap"), {
  ssr: false,
});
const ConflictGlobe = dynamic(() => import("@/components/ConflictGlobe"), {
  ssr: false,
});

const TIME_RANGES = ["1h", "6h", "24h", "7d", "30d"] as const;
const ALL_LAYERS: IntelLayerKey[] = [
  "conflicts",
  "liveStrikes",
  "flights",
  "vessels",
  "carriers",
  "news",
  "escalationRisk",
  "hotspots",
  "infrastructure",
];

function buildInitialLayerState(): Record<IntelLayerKey, boolean> {
  return {
    conflicts: true,
    liveStrikes: true,
    flights: true,
    vessels: true,
    carriers: true,
    news: true,
    escalationRisk: true,
    hotspots: true,
    infrastructure: true,
  };
}

export default function MapPage() {
  const [mode, setMode] = useState<"2d" | "3d">("2d");
  const [range, setRange] = useState<(typeof TIME_RANGES)[number]>("7d");
  const [activeLayers, setActiveLayers] = useState(buildInitialLayerState);
  const [apiData, setApiData] = useState<MapApiResponse | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<IntelPoint | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [countryIntel, setCountryIntel] = useState<CountryIntelResponse | null>(null);
  const [pointAiSummary, setPointAiSummary] = useState<string>("");
  const [pointAiLoading, setPointAiLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [autoRotate, setAutoRotate] = useState(false);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const recenterRef = useRef<(() => void) | null>(null);
  const aiSummaryCacheRef = useRef<Record<string, string>>({});

  const requestedLayerList = useMemo(
    () => ALL_LAYERS.filter((k) => activeLayers[k]).join(","),
    [activeLayers]
  );

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setMapReady(false);
    try {
      const params = new URLSearchParams({
        range,
        layers: requestedLayerList,
      });
      const res = await fetch(`/api/map?${params.toString()}`);
      const data = (await res.json()) as MapApiResponse & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to load map feeds");
      setApiData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load map feeds");
      setApiData(null);
    } finally {
      setLoading(false);
    }
  }, [range, requestedLayerList]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!selectedCountry) {
      setCountryIntel(null);
      return;
    }
    let active = true;
    const run = async () => {
      try {
        const params = new URLSearchParams({
          country: selectedCountry,
          range,
        });
        const res = await fetch(`/api/map/country?${params.toString()}`);
        const data = (await res.json()) as CountryIntelResponse & { error?: string };
        if (!res.ok) throw new Error(data.error || "Failed country intelligence");
        if (active) setCountryIntel(data);
      } catch {
        if (active) setCountryIntel(null);
      }
    };
    run();
    return () => {
      active = false;
    };
  }, [range, selectedCountry]);

  useEffect(() => {
    if (!selectedPoint) {
      setPointAiSummary("");
      setPointAiLoading(false);
      return;
    }

    const summaryKey = `${selectedPoint.id}:${selectedPoint.timestamp}`;
    const cached = aiSummaryCacheRef.current[summaryKey];
    if (cached) {
      setPointAiSummary(cached);
      setPointAiLoading(false);
      return;
    }

    const country = selectedPoint.country ?? "Unknown";
    const layerCount = apiData?.layers[selectedPoint.layer]?.length ?? 0;
    const sameCountrySignals =
      apiData?.layers[selectedPoint.layer]?.filter((p) => p.country === country).length ?? 0;
    const confidencePct =
      typeof selectedPoint.confidence === "number"
        ? Math.round(selectedPoint.confidence * 100)
        : null;
    const magnitude = typeof selectedPoint.magnitude === "number" ? selectedPoint.magnitude : null;

    const statsLines = [
      `Layer signal count: ${layerCount}`,
      `Same-country layer count: ${sameCountrySignals}`,
      confidencePct !== null ? `Confidence: ${confidencePct}%` : "Confidence: N/A",
      magnitude !== null ? `Magnitude score: ${magnitude}` : "Magnitude score: N/A",
      `Timestamp: ${selectedPoint.timestamp}`,
    ].join("\n");

    const prompt = [
      `Event: ${selectedPoint.title}`,
      `Subtitle: ${selectedPoint.subtitle ?? "N/A"}`,
      `Country: ${country}`,
      `Source: ${selectedPoint.source}`,
      `Severity: ${selectedPoint.severity}`,
      "Available statistics:",
      statsLines,
      "Write exactly 3 bullet points summarizing why this event was flagged.",
      "Each line must start with '- '.",
      "Each bullet must include at least one numeric value from the provided statistics.",
      "If a value is missing, explicitly say it is unavailable.",
      "No policy advice. Keep neutral intelligence tone.",
    ].join("\n");

    let cancelled = false;
    setPointAiLoading(true);
    fetch("/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "map_insight",
        maxTokens: 260,
        prompt,
      }),
    })
      .then(async (res) => {
        const data = (await res.json()) as { content?: string; error?: string };
        if (!res.ok) throw new Error(data.error ?? "Failed AI summary");
        const content = data.content?.trim() || "AI summary unavailable for this point.";
        aiSummaryCacheRef.current[summaryKey] = content;
        if (!cancelled) setPointAiSummary(content);
      })
      .catch(() => {
        if (!cancelled) setPointAiSummary("AI summary unavailable for this point.");
      })
      .finally(() => {
        if (!cancelled) setPointAiLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [apiData, selectedPoint]);

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
      if (!document.fullscreenElement) {
        mapContainerRef.current?.classList.remove("is-fullscreen");
      }
    };
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const layers =
    apiData?.layers ??
    ({
      conflicts: [],
      liveStrikes: [],
      flights: [],
      vessels: [],
      carriers: [],
      news: [],
      escalationRisk: [],
      hotspots: [],
      infrastructure: [],
    } as MapApiResponse["layers"]);

  const providerHealth = apiData?.providerHealth ?? [];
  const activeConflictCountries = apiData?.activeConflictCountries ?? [];
  const escalationRiskCountries: EscalationRiskCountry[] =
    apiData?.escalationRiskCountries ?? [];

  const totalVisible = ALL_LAYERS.reduce(
    (sum, layer) => sum + (activeLayers[layer] ? layers[layer].length : 0),
    0
  );

  const toggleLayer = (layer: IntelLayerKey) => {
    setActiveLayers((prev) => ({ ...prev, [layer]: !prev[layer] }));
  };

  return (
    <div className="map-page min-h-screen text-[#e2e8f0]">
      <nav>
        <Link href="/" className="nav-logo">
          AEG<span>I</span>S<sub className="logo-hq">hq</sub>
        </Link>
        <div className="nav-links">
          <Link href="/">Back to Home</Link>
          <Link href="/escalation">App</Link>
          <Link href="/map" className="nav-cta">
            Interactive Map
          </Link>
        </div>
      </nav>

      <main className="relative z-10 pt-24 pb-12">
        <section>
          <div className="section">
            <p className="section-tag reveal">Global Intelligence</p>
            <h1 className="reveal" style={{ marginBottom: "8px" }}>
              Interactive Global Monitor
            </h1>
            <p className="section-body reveal" style={{ marginBottom: "24px" }}>
              Multi-source map layers inspired by modern OSINT dashboards. Data blends
              event-level conflict databases, corroborated live strike reports, military
              flight telemetry, carrier-group signals, vessel relay feeds, and strategic
              infrastructure overlays.
            </p>
          </div>
        </section>

        <div className="section">
          <div className="map-controls" style={{ justifyContent: "space-between" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span className="map-chip-label">View</span>
              <button
                type="button"
                className={mode === "2d" ? "btn-primary" : "btn-secondary"}
                style={{ padding: "8px 14px", fontSize: 12 }}
                onClick={() => setMode("2d")}
              >
                2D Map
              </button>
              <button
                type="button"
                className={mode === "3d" ? "btn-primary" : "btn-secondary"}
                style={{ padding: "8px 14px", fontSize: 12 }}
                onClick={() => setMode("3d")}
              >
                3D Globe
              </button>
              {mode === "3d" && (
                <button
                  type="button"
                  className={autoRotate ? "btn-primary" : "btn-secondary"}
                  style={{ padding: "8px 14px", fontSize: 12 }}
                  onClick={() => setAutoRotate((v) => !v)}
                >
                  Auto-Rotate {autoRotate ? "On" : "Off"}
                </button>
              )}
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span className="map-chip-label">Time</span>
              {TIME_RANGES.map((r) => (
                <button
                  key={r}
                  type="button"
                  className={range === r ? "btn-primary" : "btn-secondary"}
                  style={{ padding: "8px 10px", fontSize: 11 }}
                  onClick={() => setRange(r)}
                >
                  {r}
                </button>
              ))}
              <button
                type="button"
                className="btn-secondary"
                style={{ padding: "8px 14px", fontSize: 12 }}
                onClick={fetchData}
              >
                Refresh
              </button>
              <button
                type="button"
                className="btn-secondary"
                style={{ padding: "8px 14px", fontSize: 12 }}
                onClick={handleFullscreen}
              >
                Fullscreen
              </button>
              <button
                type="button"
                className="btn-secondary"
                style={{ padding: "8px 14px", fontSize: 12 }}
                onClick={() => {
                  setSelectedPoint(null);
                  recenterRef.current?.();
                }}
              >
                Recenter
              </button>
            </div>
          </div>

          <div className="map-layer-toolbar">
            {ALL_LAYERS.map((layer) => (
              <label key={layer} className="map-layer-toggle">
                <input
                  type="checkbox"
                  checked={activeLayers[layer]}
                  onChange={() => toggleLayer(layer)}
                />
                <span
                  className="map-layer-dot"
                  style={{ background: layerColorCss(layer) }}
                />
                <span>{layer.toUpperCase()}</span>
                <span className="map-layer-count">{layers[layer].length}</span>
              </label>
            ))}
          </div>

          <div className="map-status-bar">
            <span>Visible points: {totalVisible.toLocaleString()}</span>
            <span>
              Updated: {apiData ? new Date(apiData.updatedAt).toLocaleTimeString() : "--"}
            </span>
            <span>Range: {range}</span>
          </div>

          {error && <div className="map-error-banner">{error}</div>}

          <div ref={mapContainerRef} className="map-container" style={{ position: "relative" }}>
            <div className="map-title-overlay">■ {range.toUpperCase()} INTELLIGENCE VIEW</div>

            {selectedPoint && (
              <IntelInfoPanel
                point={selectedPoint}
                providerHealth={providerHealth}
                aiSummary={pointAiSummary}
                aiLoading={pointAiLoading}
                onClose={() => setSelectedPoint(null)}
              />
            )}

            {loading && (
              <div className="map-loading-pill">
                Syncing feeds...
              </div>
            )}

            {!mapReady && !loading && (
              <div className="map-loading-screen">Initializing map renderer...</div>
            )}

            {mode === "2d" ? (
              <ConflictMap
                layers={layers}
                activeLayers={activeLayers}
                recenterRef={recenterRef}
                onReady={() => setMapReady(true)}
                onError={(m) => setError(m)}
                onPointSelect={setSelectedPoint}
                onCountrySelect={(country) => {
                  setSelectedPoint(null);
                  setSelectedCountry(country);
                }}
                activeConflictCountries={activeConflictCountries}
                escalationRiskCountries={escalationRiskCountries}
              />
            ) : (
              <ConflictGlobe
                layers={layers}
                activeLayers={activeLayers}
                recenterRef={recenterRef}
                onReady={() => setMapReady(true)}
                onError={(m) => setError(m)}
                onPointSelect={setSelectedPoint}
                autoRotate={autoRotate}
              />
            )}

            {selectedCountry && countryIntel && (
              <CountryIntelPanel
                data={countryIntel}
                onClose={() => {
                  setSelectedCountry(null);
                  setCountryIntel(null);
                }}
              />
            )}
          </div>

          <div className="map-provider-grid">
            {providerHealth.map((p) => (
              <div key={p.provider} className="map-provider-card">
                <div>
                  <div className="map-provider-name">{p.provider}</div>
                  <div className="map-provider-note">{p.message || "No details"}</div>
                </div>
                <div className={p.ok ? "provider-ok" : "provider-bad"}>
                  {p.ok ? "OK" : "DEGRADED"}
                </div>
              </div>
            ))}
          </div>

          <div className="map-limitations">
            <h3>Current limitations</h3>
            <ul>
              <li>
                ACLED is maintained as historical context and can lag real-world events by
                weeks, so live strike urgency depends on the real-time feeds.
              </li>
              <li>
                Military ships and carrier groups can disable or spoof AIS/ADS-B, which can
                hide active deployments during sensitive missions.
              </li>
              <li>
                News-derived event geolocation uses city/country extraction and
                corroboration; some events are intentionally suppressed until multiple
                credible publishers confirm them.
              </li>
              <li>
                Open-source feeds are strongest for Europe/Middle East; coverage quality can
                vary by region, censorship, and language.
              </li>
            </ul>
          </div>
        </div>
      </main>

      <footer>
        <div className="footer-logo">AEGIS</div>
        <div className="footer-links">
          <Link href="/escalation">App</Link>
          <Link href="/map">Map</Link>
          <a href="https://www.worldmonitor.app/" target="_blank" rel="noreferrer">
            Inspiration: WorldMonitor
          </a>
          <a href="https://acleddata.com" target="_blank" rel="noreferrer">
            Data: ACLED
          </a>
        </div>
        <div className="footer-copy">&copy; 2026 Alexander Armand-Blumberg · AEGIS</div>
      </footer>
    </div>
  );
}
