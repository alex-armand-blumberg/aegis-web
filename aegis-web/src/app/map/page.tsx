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
import { formatCountryDisplayName } from "@/lib/countryDisplay";
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
    flights: false,
    vessels: false,
    troopMovements: false,
    carriers: true,
    news: true,
    escalationRisk: true,
    hotspots: true,
    infrastructure: true,
  };
}

function simplifyProviderMessage(message: string): string {
  return message
    .replace(/\s*\[reason=[^\]]+\]/gi, "")
    .replace(/\s*\[source_packs=[^\]]+\]/gi, "")
    .replace(/\s*\[cache=[^\]]+\]/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function severityWeight(sev: IntelPoint["severity"]): number {
  if (sev === "critical") return 4;
  if (sev === "high") return 3;
  if (sev === "medium") return 2;
  return 1;
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
  const [assistantMode, setAssistantMode] = useState<"summary" | "ask">("summary");
  const [assistantQuestion, setAssistantQuestion] = useState("");
  const [assistantAnswer, setAssistantAnswer] = useState("");
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [assistantError, setAssistantError] = useState<string | null>(null);
  const [syncElapsedSec, setSyncElapsedSec] = useState(0);

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
    if (!loading) {
      setSyncElapsedSec(0);
      return;
    }
    const t0 = Date.now();
    const id = window.setInterval(() => {
      setSyncElapsedSec(Math.floor((Date.now() - t0) / 1000));
    }, 400);
    return () => window.clearInterval(id);
  }, [loading]);

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
    const sourceUrl = String(selectedPoint.metadata?.source_url ?? "").trim();
    const snippet = String(selectedPoint.metadata?.source_snippet ?? "").trim();
    const publisher = String(selectedPoint.metadata?.publisher ?? selectedPoint.source ?? "Unknown");
    const eventType = String(selectedPoint.metadata?.event_type ?? "conflict_event");
    const selectedTs = Date.parse(selectedPoint.timestamp || "");
    const nearbySameCountry = (apiData?.layers.news ?? [])
      .filter((p) => p.country === country && p.id !== selectedPoint.id)
      .filter((p) => {
        const pType = String(p.metadata?.event_type ?? "").toLowerCase();
        if (!pType || pType === "conflict_event") return true;
        return pType === eventType.toLowerCase();
      })
      .filter((p) => {
        if (!Number.isFinite(selectedTs)) return true;
        const ts = Date.parse(p.timestamp || "");
        if (!Number.isFinite(ts)) return true;
        return Math.abs(ts - selectedTs) <= 5 * 24 * 3600_000;
      })
      .slice(0, 8)
      .map((p) => `${p.timestamp}: ${p.title} (${p.source})`)
      .join("\n");

    const prompt = [
      "You are summarizing a single mapped conflict event for an intelligence popup.",
      `Headline: ${selectedPoint.title}`,
      `Subtitle: ${selectedPoint.subtitle ?? "N/A"}`,
      `Event type: ${eventType}`,
      `Location country: ${country}`,
      `Timestamp: ${selectedPoint.timestamp}`,
      `Source label: ${selectedPoint.source}`,
      `Publisher: ${publisher}`,
      `Article URL: ${sourceUrl || "Unavailable"}`,
      `Source snippet: ${snippet || "Unavailable"}`,
      "Nearby same-country conflict signals (context):",
      nearbySameCountry || "Unavailable",
      "Write exactly 4 bullet points describing the actual event and immediate context.",
      "Each line must start with '- '.",
      "Prefix each bullet with either 'Confirmed:' or 'Inferred:'.",
      "Explain what happened, where, when, and who/what was targeted or involved.",
      "If available, include weapon/interception details and immediate trigger/background from the provided text.",
      "Use concrete event facts and numbers from provided content and full-article context when available.",
      "If details are sparse, infer the most likely event context from related headlines and nearby same-event signals only (do not say 'unknown' or 'not reported').",
      "Include at least one concrete date/number/statistic when available from evidence.",
      "Ignore unrelated political/economic/local headlines that do not match this event type and location.",
      "Do NOT mention confidence scores, magnitude scores, layer counts, or why the model flagged the event.",
      "No policy advice. Keep neutral intelligence tone.",
    ].join("\n");

    let cancelled = false;
    setPointAiLoading(true);
    fetch("/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "map_insight",
        maxTokens: 360,
        prompt,
      }),
    })
      .then(async (res) => {
        const data = (await res.json()) as { content?: string; error?: string };
        if (!res.ok) throw new Error(data.error ?? "Failed AI summary");
        const content =
          data.content?.trim() ||
          "- Inferred: Event context synthesis is running; this point remains tied to ongoing conflict indicators from mapped and external sources.";
        aiSummaryCacheRef.current[summaryKey] = content;
        if (!cancelled) setPointAiSummary(content);
      })
      .catch(() => {
        if (!cancelled)
          setPointAiSummary(
            "- Inferred: Event context synthesis is temporarily delayed. Re-open this point to refresh full evidence-based details."
          );
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
        troopMovements: [],
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

  const worldStateRisk = useMemo(() => {
    const weightedSignals =
      layers.liveStrikes.reduce((s, p) => s + severityWeight(p.severity) * 2.5, 0) +
      layers.conflicts.reduce((s, p) => s + severityWeight(p.severity) * 1.8, 0) +
      layers.news.reduce((s, p) => s + severityWeight(p.severity) * 0.7, 0) +
      layers.flights.length * 0.05 +
      layers.vessels.length * 0.04;
    const rawScaled = Math.min(100, Math.max(0, 100 - Math.exp(-weightedSignals / 260) * 100));
    // Reserve 96–100% for imminent/active global conflict; compress display so current state doesn't sit at 100%.
    const displayPercent = Math.round(Math.min(99, 100 * Math.pow(rawScaled / 100, 1.4)));
    const status =
      rawScaled >= 76 ? "Critical stress" : rawScaled >= 58 ? "Elevated stress" : rawScaled >= 38 ? "Guarded" : "Stable";
    const bandExplanation =
      rawScaled >= 76
        ? "Frequent strike/conflict signals and high cross-theater activity are pushing global instability upward."
        : rawScaled >= 58
          ? "Sustained conflict reporting across multiple theaters is keeping risk elevated."
          : "Signal intensity is mixed, with fewer high-severity kinetic spikes in the current window.";
    const explanation =
      `${bandExplanation} Based on weighted counts of live strikes, conflict reports, and news in the selected time window, plus flight and vessel activity. Closer to 100% indicates greater global stress; 96–99% would indicate imminent escalation risk, 100% reserved for active global conflict.`;
    return { percent: displayPercent, status, explanation };
  }, [layers]);

  const hotspotSummary = useMemo(() => {
    const seeded = [...escalationRiskCountries]
      .sort((a, b) => b.riskScore - a.riskScore)
      .slice(0, 8)
      .map((h) => ({
        country: formatCountryDisplayName(h.country),
        score100: Math.max(0, Math.min(100, Math.round(h.riskScore * 5.5))),
        severity: h.severity,
        trend: h.trend,
        latestEventAt: h.latestEventAt,
        reason:
          h.signals.length > 0
            ? `Signals: ${h.signals.slice(0, 3).join(", ")}`
            : "Signals: rising multi-source conflict indicators",
      }));
    const manual = [
      { country: "South China Sea", score100: 50, severity: "medium" as const, trend: "rising" as const, reason: "Baseline tension; score not boosted by recent kinetic events. Maritime standoffs, naval patrol pressure." },
      { country: "China", score100: 48, severity: "medium" as const, trend: "rising" as const, reason: "Baseline tension; score not boosted by recent kinetic events. Regional coercion posture." },
      { country: "Taiwan", score100: 50, severity: "medium" as const, trend: "rising" as const, reason: "Baseline tension; score not boosted by recent kinetic events. Cross-strait pressure narratives." },
      { country: "Cuba", score100: 41, severity: "medium" as const, trend: "stable" as const, reason: "Signals: strategic pressure potential and regional spillover sensitivity." },
    ].map((m) => ({
      ...m,
      latestEventAt: new Date().toISOString(),
    }));
    const merged = [...seeded];
    for (const m of manual) {
      if (!merged.some((x) => x.country.toLowerCase() === m.country.toLowerCase())) merged.push(m);
    }
    return merged
      .sort((a, b) => b.score100 - a.score100)
      .slice(0, 10);
  }, [escalationRiskCountries]);

  const relayDigestHealth = useMemo(
    () => providerHealth.find((h) => h.provider === "Relay seed digest"),
    [providerHealth]
  );
  const providerHealthDisplay = useMemo(
    () =>
      providerHealth.map((p) => ({
        ...p,
        message: simplifyProviderMessage(p.message || "No details"),
      })),
    [providerHealth]
  );
  const providerSummary = useMemo(() => {
    const ok = providerHealthDisplay.filter((p) => p.ok).length;
    const degraded = providerHealthDisplay.length - ok;
    return { ok, degraded, total: providerHealthDisplay.length };
  }, [providerHealthDisplay]);

  const handleAssistantRun = useCallback(async () => {
    if (!apiData) return;
    setAssistantLoading(true);
    setAssistantError(null);
    try {
      const recent = [
        ...layers.liveStrikes,
        ...layers.news,
        ...layers.conflicts,
      ]
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
        .slice(0, 40)
        .map((p) => `${p.timestamp} | ${p.country ?? "Unknown"} | ${p.title} | ${p.source}`)
        .join("\n");

      const prompt =
        assistantMode === "summary"
          ? [
              "Task: summarize major world conflict developments right now in short form.",
              `Map range: ${range}`,
              "Recent mapped events:",
              recent || "Unavailable",
              "Write 6 concise bullet points. Include regions, actors, and immediate developments.",
              "Use map evidence plus external online corroboration. Keep it short and precise.",
            ].join("\n")
          : [
              "Task: answer the user's map intelligence question fully.",
              `User question: ${assistantQuestion || "No question provided."}`,
              `Map range: ${range}`,
              "Recent mapped events:",
              recent || "Unavailable",
              "Answer in 6-10 bullet points. Use map evidence and external online corroboration.",
              "If uncertainty exists, state what is known and most likely explanation.",
            ].join("\n");

      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: assistantMode === "summary" ? "news_summary" : "sentinel_qa",
          maxTokens: 560,
          prompt,
        }),
      });
      const data = (await res.json()) as { content?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "AI assistant failed");
      setAssistantAnswer(data.content?.trim() || "No answer returned.");
    } catch (err) {
      setAssistantError(err instanceof Error ? err.message : "AI assistant failed.");
      setAssistantAnswer("");
    } finally {
      setAssistantLoading(false);
    }
  }, [apiData, assistantMode, assistantQuestion, layers, range]);

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

      <main className="relative z-10 map-main-compact">
        <div className="map-top-section">
          <header className="map-page-title map-page-title-inline">
            <h1 className="map-page-title-heading">AEGIS Interactive Map</h1>
          </header>
          <div className="map-controls map-controls-inline" style={{ justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
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
            <span className="map-chip-label" style={{ marginLeft: 8 }}>Time</span>
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

        <div className="map-content-wrap">
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
          <div className="map-status-caption">
            Requested conflict source adapters run automatically; use layer toggles above only for visualization
            filtering. <strong>Vessels</strong> are maritime AIS (ships), not aircraft—enable <strong>flights</strong>{" "}
            for ADS-B military aircraft tracks.
          </div>

          <div className="map-status-bar">
            <span>Visible points: {totalVisible.toLocaleString()}</span>
            <span>
              Updated: {apiData ? new Date(apiData.updatedAt).toLocaleTimeString() : "--"}
            </span>
            <span>Range: {range}</span>
            <span>Adapters: core + requested-source live feeds</span>
          </div>
          <div className="map-status-caption">Zoom in for more points to become visible.</div>

          <div className="map-world-gauge">
            <div className="map-world-gauge-header">
              <span>World Stability Gauge</span>
              <strong>{worldStateRisk.percent}% risk</strong>
            </div>
            <div className="map-world-gauge-track">
              <div
                className="map-world-gauge-fill"
                style={{ width: `${worldStateRisk.percent}%` }}
              />
            </div>
            <div className="map-world-gauge-note">
              Status: <strong>{worldStateRisk.status}</strong>
            </div>
            <div className="map-world-gauge-explain">{worldStateRisk.explanation}</div>
          </div>

          {error && <div className="map-error-banner">{error}</div>}

          <div ref={mapContainerRef} className="map-container" style={{ position: "relative" }}>
            <div className="map-title-overlay">■ {range.toUpperCase()} AEGIS MAP BETA</div>

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
                <span className="map-loading-pill-label">
                  Syncing feeds…
                  {syncElapsedSec > 0 ? ` ${syncElapsedSec}s` : ""}
                </span>
                <div
                  className="map-loading-pill-bar"
                  role="progressbar"
                  aria-valuetext="Syncing map feeds"
                />
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
                frontlineOverlays={apiData?.frontlineOverlays ?? []}
              />
            ) : (
              <ConflictGlobe
                layers={layers}
                activeLayers={activeLayers}
                frontlineOverlays={apiData?.frontlineOverlays ?? []}
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

          <details className="map-provider-accordion">
            <summary>
              Adapter status: {providerSummary.ok}/{providerSummary.total} OK
              {providerSummary.degraded > 0 ? `, ${providerSummary.degraded} degraded` : ""}
            </summary>
            <div className="map-provider-grid">
              {providerHealthDisplay.map((p) => (
                <div key={p.provider} className="map-provider-card">
                  <div>
                    <div className="map-provider-name">{p.provider}</div>
                    <div className="map-provider-note">{p.message}</div>
                  </div>
                  <div className={p.ok ? "provider-ok" : "provider-bad"}>
                    {p.ok ? "OK" : "DEGRADED"}
                  </div>
                </div>
              ))}
            </div>
          </details>
          {relayDigestHealth && !relayDigestHealth.ok && (
            <div className="map-relay-note">
              Relay seed digest is optional. If it is degraded, core map adapters still run; this usually means the relay endpoint timed out or aborted upstream.
            </div>
          )}

          <div className="map-ai-assistant">
            <div className="map-ai-assistant-header">
              <h3>Map AI Assistant</h3>
              <p>Uses mapped feeds plus online corroboration.</p>
            </div>
            <div className="map-ai-assistant-actions">
              <button
                type="button"
                className={assistantMode === "summary" ? "btn-primary" : "btn-secondary"}
                style={{ padding: "8px 12px", fontSize: 12 }}
                onClick={() => setAssistantMode("summary")}
              >
                Summarize Global Events
              </button>
              <button
                type="button"
                className={assistantMode === "ask" ? "btn-primary" : "btn-secondary"}
                style={{ padding: "8px 12px", fontSize: 12 }}
                onClick={() => setAssistantMode("ask")}
              >
                Ask Map Question
              </button>
            </div>
            {assistantMode === "ask" && (
              <textarea
                className="map-ai-question"
                placeholder="Ask a question about current conflicts, military moves, escalation risk, or a region..."
                value={assistantQuestion}
                onChange={(e) => setAssistantQuestion(e.target.value)}
              />
            )}
            <button
              type="button"
              className="btn-secondary"
              style={{ padding: "8px 12px", fontSize: 12, marginTop: 10 }}
              onClick={handleAssistantRun}
              disabled={assistantLoading || (assistantMode === "ask" && !assistantQuestion.trim())}
            >
              {assistantLoading ? "Thinking..." : "Run AI"}
            </button>
            {assistantError && <div className="map-error-banner" style={{ marginTop: 10 }}>{assistantError}</div>}
            {assistantAnswer && <pre className="map-ai-answer">{assistantAnswer}</pre>}
          </div>

          <div className="map-hotspot-panel">
            <h3>Geographic Escalation Risk Hotspots</h3>
            <p>Likely near-term escalation zones based on trend and multi-source activity.</p>
            <div className="map-hotspot-grid">
              {hotspotSummary.length > 0 ? (
                hotspotSummary.map((h) => (
                  <div key={`${h.country}-${h.latestEventAt}`} className="map-hotspot-card">
                    <div className="map-hotspot-top">
                      <strong>{h.country}</strong>
                      <span>{h.score100} / 100</span>
                    </div>
                    <div className="map-hotspot-meta">
                      Trend: {h.trend} · Severity:{" "}
                      <span className={`map-hotspot-severity map-hotspot-severity-${h.severity}`}>
                        {h.severity}
                      </span>
                    </div>
                    <div className="map-hotspot-reason">{h.reason}</div>
                  </div>
                ))
              ) : (
                <div className="map-hotspot-empty">No hotspot signals available yet.</div>
              )}
            </div>
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
        </div>
        <div className="footer-copy">&copy; 2026 Alexander Armand-Blumberg · AEGIS</div>
      </footer>
    </div>
  );
}
