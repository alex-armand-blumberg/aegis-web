"use client";

import { useCallback, useState } from "react";
import type {
  AlertFeedback,
  EvidenceItem,
  ExposureAlert,
  ExposureScoreBreakdown,
} from "@/lib/impact/types";
import { FeedbackControls } from "./FeedbackControls";

type Props = {
  alert: ExposureAlert | null;
  feedback: AlertFeedback[];
  onFeedback: (feedback: AlertFeedback[]) => void;
};

function formatTimestamp(iso: string): string {
  const t = new Date(iso);
  if (!Number.isFinite(t.getTime())) return iso;
  return t.toLocaleString();
}

function formatDistance(distanceKm: number | undefined): string {
  if (distanceKm === undefined || !Number.isFinite(distanceKm)) return "—";
  if (distanceKm < 1) return "<1 km";
  if (distanceKm < 100) return `${distanceKm.toFixed(1)} km`;
  return `${Math.round(distanceKm)} km`;
}

function breakdownBars(breakdown: ExposureScoreBreakdown) {
  const items: Array<{ key: string; label: string; value: number; max: number; hint: string }> = [
    {
      key: "signalIntensity",
      label: "Signal intensity",
      value: breakdown.signalIntensity,
      max: 100,
      hint: "Saturated contribution from top evidence clusters.",
    },
    {
      key: "proximity",
      label: "Proximity",
      value: breakdown.proximity,
      max: 100,
      hint: "Average distance multiplier across top evidence (closer = higher).",
    },
    {
      key: "severity",
      label: "Severity (avg)",
      value: breakdown.severity,
      max: 22,
      hint: "Average severity-base across top evidence.",
    },
    {
      key: "recency",
      label: "Recency",
      value: breakdown.recency,
      max: 100,
      hint: "Average recency multiplier across top evidence.",
    },
    {
      key: "sourceReliability",
      label: "Reliability",
      value: breakdown.sourceReliability,
      max: 100,
      hint: "Average source reliability across top evidence.",
    },
    {
      key: "assetRelevance",
      label: "Asset relevance",
      value: breakdown.assetRelevance,
      max: 125,
      hint: "Asset-type × event-class relevance multiplier.",
    },
    {
      key: "assetImportance",
      label: "Asset importance",
      value: breakdown.assetImportance,
      max: 130,
      hint: "Importance multiplier (low 85 → critical 130).",
    },
    {
      key: "sourceDiversity",
      label: "Source diversity bonus",
      value: breakdown.sourceDiversity,
      max: 10,
      hint: "Additive bonus from distinct source families.",
    },
    {
      key: "countryContext",
      label: "Country context",
      value: breakdown.countryContext,
      max: 10,
      hint: "Additive lift from active conflict / escalation-risk countries.",
    },
  ];
  return items;
}

function aiBriefPrompt(alert: ExposureAlert): string {
  const ev = alert.evidence
    .slice(0, 8)
    .map((e, i) => {
      const distance = formatDistance(e.distanceKm);
      const url = e.urls?.[0] ? ` url=${e.urls[0]}` : "";
      return `${i + 1}. [${e.eventClass}] ${e.title} (severity=${e.severity}, layer=${e.layers.join(
        "|"
      )}, sources=${e.sources.slice(0, 3).join("/")}, families=${e.sourceFamilies.join(
        "/"
      )}, geo=${e.geoPrecision}, ts=${e.timestamp}, distance=${distance}, reliability=${e.sourceReliability.toFixed(
        2
      )})${url}`;
    })
    .join("\n");

  const breakdown = alert.breakdown;
  const lines = [
    `Asset: ${alert.asset.name}`,
    `Asset type: ${alert.asset.type}`,
    `Asset location: ${alert.asset.city ? alert.asset.city + ", " : ""}${alert.asset.country} (lat ${alert.asset.lat}, lon ${alert.asset.lon})`,
    `Asset importance: ${alert.asset.importance}`,
    `Exposure level: ${alert.level}`,
    `Exposure score (0-100): ${alert.score}`,
    `Confidence: ${alert.confidence}`,
    `Range: ${alert.range}`,
    `Generated: ${alert.generatedAt}`,
    `Score breakdown: signalIntensity=${breakdown.signalIntensity}, proximity=${breakdown.proximity}, severityAvg=${breakdown.severity}, recency=${breakdown.recency}, reliability=${breakdown.sourceReliability}, assetRelevance=${breakdown.assetRelevance}, assetImportance=${breakdown.assetImportance}, sourceDiversity=${breakdown.sourceDiversity}, countryContext=${breakdown.countryContext}`,
    breakdown.capsApplied.length
      ? `Caps applied: ${breakdown.capsApplied.join("; ")}`
      : "Caps applied: none",
    `Uncertainty: ${alert.uncertainty}`,
    `Watch next: ${alert.watchNext.join(" | ")}`,
    `Evidence (deterministic, do not invent extras):`,
    ev || "(no concrete evidence)",
    "",
    "Write a concise analyst brief using ONLY the asset metadata and the evidence above.",
    "Sections (in this order, each header on its own line):",
    "1. Situation",
    "2. Why this asset is exposed",
    "3. Evidence",
    "4. Uncertainty",
    "5. What to watch next",
    "Do not calculate, restate, or modify the exposure score. Do not invent sources.",
  ];
  return lines.join("\n");
}

export function ExposureCard({ alert, feedback, onFeedback }: Props) {
  const [briefStatus, setBriefStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [briefContent, setBriefContent] = useState<string | null>(null);
  const [briefError, setBriefError] = useState<string | null>(null);

  const handleBrief = useCallback(async () => {
    if (!alert) return;
    setBriefStatus("loading");
    setBriefError(null);
    setBriefContent(null);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "asset_impact",
          prompt: aiBriefPrompt(alert),
          maxTokens: 700,
        }),
      });
      if (!res.ok) {
        setBriefStatus("error");
        setBriefError(
          res.status === 500
            ? "AI brief unavailable. The AI service is not configured or returned an error."
            : `AI brief unavailable (HTTP ${res.status}).`
        );
        return;
      }
      const json = (await res.json()) as { content?: string; error?: string };
      if (json.error) {
        setBriefStatus("error");
        setBriefError(json.error);
        return;
      }
      setBriefContent(json.content?.trim() || "(empty response)");
      setBriefStatus("ok");
    } catch {
      setBriefStatus("error");
      setBriefError("AI brief unavailable (network error).");
    }
  }, [alert]);

  if (!alert) {
    return (
      <div className="impact-evidence-card impact-empty">
        <p>Select an asset or alert to see its evidence.</p>
      </div>
    );
  }

  const bars = breakdownBars(alert.breakdown);

  return (
    <article className="impact-evidence-card" data-level={alert.level}>
      <header className="impact-card-head">
        <div className="impact-card-titles">
          <span className="impact-eyebrow">Exposure alert</span>
          <h2>{alert.asset.name}</h2>
          <p className="impact-card-meta">
            {alert.asset.type.replace(/_/g, " ")} · {alert.asset.city ? `${alert.asset.city}, ` : ""}
            {alert.asset.country} · importance {alert.asset.importance}
          </p>
        </div>
        <div className="impact-card-scores">
          <div className={`impact-score-chip impact-score-chip-lg impact-level-${alert.level}`}>
            <span className="impact-score-value">{alert.score}</span>
            <span className="impact-score-label">{alert.level}</span>
          </div>
          <span className={`impact-conf-chip impact-conf-${alert.confidence}`}>
            {alert.confidence} confidence
          </span>
        </div>
      </header>

      <p className="impact-card-headline">{alert.headline}</p>

      <section className="impact-card-section">
        <span className="impact-eyebrow">What changed</span>
        <p>{alert.whatChanged}</p>
      </section>

      <section className="impact-card-section">
        <span className="impact-eyebrow">Why it matters</span>
        <p>{alert.whyItMatters}</p>
      </section>

      <section className="impact-card-section">
        <span className="impact-eyebrow">Score breakdown</span>
        <ul className="impact-breakdown">
          {bars.map((b) => {
            const pct = Math.min(100, Math.max(0, (b.value / b.max) * 100));
            return (
              <li key={b.key} className="impact-breakdown-row" title={b.hint}>
                <span className="impact-breakdown-label">{b.label}</span>
                <span className="impact-breakdown-bar" aria-hidden>
                  <span
                    className="impact-breakdown-fill"
                    style={{ width: `${pct.toFixed(1)}%` }}
                  />
                </span>
                <span className="impact-breakdown-value">{b.value}</span>
              </li>
            );
          })}
        </ul>
        {alert.breakdown.capsApplied.length > 0 ? (
          <details className="impact-caps">
            <summary>
              {alert.breakdown.capsApplied.length} cap{alert.breakdown.capsApplied.length === 1 ? "" : "s"} applied
            </summary>
            <ul>
              {alert.breakdown.capsApplied.map((c, i) => (
                <li key={`${i}-${c}`}>{c}</li>
              ))}
            </ul>
          </details>
        ) : null}
      </section>

      <section className="impact-card-section">
        <span className="impact-eyebrow">Evidence</span>
        <EvidenceList items={alert.evidence} />
      </section>

      <section className="impact-card-section">
        <span className="impact-eyebrow">Uncertainty</span>
        <p>{alert.uncertainty}</p>
      </section>

      <section className="impact-card-section">
        <span className="impact-eyebrow">Watch next</span>
        <ul className="impact-watch-list">
          {alert.watchNext.map((w, i) => (
            <li key={`${i}-${w.slice(0, 12)}`}>{w}</li>
          ))}
        </ul>
      </section>

      <section className="impact-card-section impact-ai-section">
        <span className="impact-eyebrow">AI brief (optional)</span>
        <button
          type="button"
          className="impact-btn impact-btn-primary"
          onClick={handleBrief}
          disabled={briefStatus === "loading"}
        >
          {briefStatus === "loading" ? "Generating brief…" : "Generate AI brief"}
        </button>
        <p className="impact-ai-note">
          The brief sends only the displayed asset, score, and deterministic evidence above to
          AEGIS&apos;s AI endpoint. It does not recalculate the score.
        </p>
        {briefStatus === "error" && briefError ? (
          <p className="impact-ai-error" role="alert">
            {briefError}
          </p>
        ) : null}
        {briefStatus === "ok" && briefContent ? (
          <pre className="impact-ai-output">{briefContent}</pre>
        ) : null}
      </section>

      <FeedbackControls alert={alert} existingFeedback={feedback} onFeedback={onFeedback} />
    </article>
  );
}

function EvidenceList({ items }: { items: EvidenceItem[] }) {
  if (items.length === 0) {
    return <p className="impact-empty-sub">No concrete evidence clusters matched this asset in the current window.</p>;
  }
  return (
    <ol className="impact-evidence-list">
      {items.map((e) => (
        <li key={e.id} className="impact-evidence-item">
          <div className="impact-evidence-head">
            <span className="impact-evidence-title">{e.title}</span>
            <span className={`impact-severity-chip impact-severity-${e.severity}`}>{e.severity}</span>
          </div>
          <div className="impact-evidence-meta">
            <span>Event: {e.eventClass.replace(/_/g, " ")}</span>
            <span>Layers: {e.layers.join(", ")}</span>
            <span>Families: {e.sourceFamilies.join(", ")}</span>
            <span>Sources: {e.sources.slice(0, 3).join(", ")}</span>
            <span>{formatTimestamp(e.timestamp)}</span>
            <span>Distance: {formatDistance(e.distanceKm)}</span>
            <span>Geo: {e.geoPrecision}</span>
            <span>Reliability: {(e.sourceReliability * 100).toFixed(0)}%</span>
          </div>
          {e.urls && e.urls.length > 0 ? (
            <ul className="impact-evidence-links">
              {e.urls.slice(0, 4).map((u) => (
                <li key={u}>
                  <a href={u} target="_blank" rel="noopener noreferrer">
                    {sourceLinkLabel(u)}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

function sourceLinkLabel(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
