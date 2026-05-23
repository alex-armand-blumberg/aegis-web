"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  AlertFeedback,
  EvidenceItem,
  ExposureAlert,
  ExposureScoreBreakdown,
} from "@/lib/impact/types";
import { countryDisplay } from "@/lib/impact/countryDisplay";
import { BriefRenderer } from "./BriefRenderer";
import { FeedbackControls } from "./FeedbackControls";

type Props = {
  alert: ExposureAlert | null;
  feedback: AlertFeedback[];
  onFeedback: (feedback: AlertFeedback[]) => void;
  onDismiss?: () => void;
  onFlyTo?: (lat: number, lon: number) => void;
};

function formatTimestamp(iso: string): string {
  const t = new Date(iso);
  if (!Number.isFinite(t.getTime())) return iso;
  return t.toLocaleString();
}

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const diff = Date.now() - t;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`;
  return `${Math.round(diff / 86_400_000)}d ago`;
}

function formatDistance(distanceKm: number | undefined): string {
  if (distanceKm === undefined || !Number.isFinite(distanceKm)) return "—";
  if (distanceKm < 1) return "<1 km";
  if (distanceKm < 100) return `${distanceKm.toFixed(1)} km`;
  return `${Math.round(distanceKm)} km`;
}

function breakdownBars(breakdown: ExposureScoreBreakdown) {
  return [
    { key: "signalIntensity", label: "Signal intensity", value: breakdown.signalIntensity, max: 100, hint: "Saturated contribution from top evidence clusters." },
    { key: "proximity", label: "Proximity", value: breakdown.proximity, max: 100, hint: "Average distance multiplier across top evidence (closer = higher)." },
    { key: "severity", label: "Severity (avg)", value: breakdown.severity, max: 22, hint: "Average severity-base across top evidence." },
    { key: "recency", label: "Recency", value: breakdown.recency, max: 100, hint: "Average recency multiplier across top evidence." },
    { key: "sourceReliability", label: "Reliability", value: breakdown.sourceReliability, max: 100, hint: "Average source reliability across top evidence." },
    { key: "assetRelevance", label: "Asset relevance", value: breakdown.assetRelevance, max: 125, hint: "Asset-type × event-class relevance multiplier." },
    { key: "assetImportance", label: "Asset importance", value: breakdown.assetImportance, max: 130, hint: "Importance multiplier (low 85 → critical 130)." },
    { key: "sourceDiversity", label: "Source diversity", value: breakdown.sourceDiversity, max: 10, hint: "Additive bonus from distinct source families." },
    { key: "countryContext", label: "Country context", value: breakdown.countryContext, max: 10, hint: "Additive lift from active conflict / escalation-risk countries." },
  ];
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
    "Write a measured analyst brief in plain text using only the asset metadata and the evidence above.",
    "Use these exact section headers, each on its own line, with no leading or trailing markdown markers:",
    "Situation",
    "Why this asset is exposed",
    "Evidence",
    "Uncertainty",
    "What to watch next",
    "Use simple '- ' bullets where helpful. Do not recalculate the score or invent sources.",
  ];
  return lines.join("\n");
}

const EVIDENCE_PREVIEW_LIMIT = 2;
const EVIDENCE_LINK_LIMIT = 2;

export function ExposureCard({ alert, feedback, onFeedback, onDismiss, onFlyTo }: Props) {
  const [briefStatus, setBriefStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [briefContent, setBriefContent] = useState<string | null>(null);
  const [briefError, setBriefError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"summary" | "evidence" | "details">("summary");
  const [showUncertainty, setShowUncertainty] = useState(false);
  const [showBrief, setShowBrief] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);

  useEffect(() => {
    if (!alert) return;
    setActiveTab("summary");
    setShowUncertainty(false);
    setShowBrief(false);
    setShowFeedback(false);
  }, [alert?.id]);

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

  const handleClearBrief = useCallback(() => {
    setBriefStatus("idle");
    setBriefContent(null);
    setBriefError(null);
  }, []);

  if (!alert) {
    return (
      <div className="impact-detail impact-detail-empty">
        <span className="impact-eyebrow">Selected Asset</span>
        <p>Select an asset or alert on the left or center to inspect its evidence.</p>
      </div>
    );
  }

  const bars = breakdownBars(alert.breakdown);
  const capsCount = alert.breakdown.capsApplied.length;
  const previewEvidence = alert.evidence.slice(0, EVIDENCE_PREVIEW_LIMIT);
  const hiddenCount = Math.max(0, alert.evidence.length - EVIDENCE_PREVIEW_LIMIT);
  const country = countryDisplay(alert.asset.country);
  const primaryWatchNext = alert.watchNext[0] ?? null;

  return (
    <article className="impact-detail" data-level={alert.level}>
      <header className="impact-detail-head">
        <div className="impact-detail-titles">
          <div className="impact-detail-title-row">
            <span className="impact-eyebrow">Selected Asset</span>
            {onDismiss ? (
              <button
                type="button"
                className="impact-detail-close"
                onClick={onDismiss}
                aria-label="Clear selection"
              >
                ×
              </button>
            ) : null}
          </div>
          <div className="impact-detail-identity">
            <span className="impact-detail-flag" aria-hidden>
              {country.flag}
            </span>
            <div>
              <h2>{alert.asset.name}</h2>
              <p className="impact-detail-meta">
                {alert.asset.city ? `${alert.asset.city}, ` : ""}
                {alert.asset.country}
              </p>
            </div>
          </div>
        </div>
        <div className="impact-detail-scores">
          <div className={`impact-score-chip impact-score-chip-lg impact-level-${alert.level}`}>
            <span className="impact-score-value">{alert.score}</span>
            <span className="impact-score-label">{alert.level}</span>
          </div>
        </div>
      </header>

      <div className="impact-detail-meta-band" aria-label="Alert metadata">
        <span className={`impact-conf-chip impact-conf-${alert.confidence}`}>
          Confidence {alert.confidence}
        </span>
        <span>Updated {formatRelative(alert.generatedAt)}</span>
      </div>

      <div className="impact-detail-tabs" role="tablist" aria-label="Alert detail sections">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "summary"}
          className={`impact-detail-tab${activeTab === "summary" ? " is-active" : ""}`}
          onClick={() => setActiveTab("summary")}
        >
          Summary
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "evidence"}
          className={`impact-detail-tab${activeTab === "evidence" ? " is-active" : ""}`}
          onClick={() => setActiveTab("evidence")}
        >
          Evidence ({alert.evidence.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "details"}
          className={`impact-detail-tab${activeTab === "details" ? " is-active" : ""}`}
          onClick={() => setActiveTab("details")}
        >
          Details
        </button>
      </div>

      {activeTab === "summary" ? (
        <div className="impact-detail-summary">
          <section className="impact-detail-section">
            <p className="impact-detail-headline">{alert.headline}</p>
            <p className="impact-detail-line">
              {alert.whyItMatters}
            </p>
          </section>

          <section className="impact-detail-section">
            <span className="impact-eyebrow">Evidence summary</span>
            <EvidenceList items={previewEvidence} compact preview onItemClick={onFlyTo} />
            {hiddenCount > 0 ? (
              <button
                type="button"
                className="impact-btn impact-btn-ghost impact-btn-sm"
                onClick={() => setActiveTab("evidence")}
              >
                Show more evidence ({alert.evidence.length})
              </button>
            ) : null}
          </section>

          {primaryWatchNext ? (
            <section className="impact-detail-section">
              <span className="impact-eyebrow">Watch next</span>
              <p className="impact-detail-line">{primaryWatchNext}</p>
            </section>
          ) : null}

          <details
            className="impact-detail-section impact-detail-disclosure"
            open={showUncertainty}
            onToggle={(event) => setShowUncertainty(event.currentTarget.open)}
          >
            <summary>Show uncertainty</summary>
            <p className="impact-detail-line">{alert.uncertainty}</p>
          </details>

          <details
            className="impact-detail-section impact-detail-disclosure"
            open={showBrief}
            onToggle={(event) => setShowBrief(event.currentTarget.open)}
          >
            <summary>Show AI brief</summary>
            <section className="impact-detail-section impact-brief-section impact-brief-inline">
              <header className="impact-brief-head">
                <span className="impact-eyebrow">Analyst brief (AI)</span>
                <button
                  type="button"
                  className="impact-btn impact-btn-secondary impact-btn-sm"
                  onClick={handleBrief}
                  disabled={briefStatus === "loading"}
                >
                  {briefStatus === "loading"
                    ? "Generating…"
                    : briefStatus === "ok"
                    ? "Regenerate brief"
                    : "Generate brief"}
                </button>
                {briefStatus === "ok" || briefStatus === "error" ? (
                  <button
                    type="button"
                    className="impact-btn impact-btn-ghost impact-btn-sm"
                    onClick={handleClearBrief}
                  >
                    Clear brief
                  </button>
                ) : null}
              </header>
              {briefStatus === "error" && briefError ? (
                <p className="impact-brief-error" role="alert">
                  {briefError}
                </p>
              ) : null}
              {briefStatus === "ok" && briefContent ? <BriefRenderer text={briefContent} /> : null}
            </section>
          </details>

          <details
            className="impact-detail-section impact-detail-disclosure"
            open={showFeedback}
            onToggle={(event) => setShowFeedback(event.currentTarget.open)}
          >
            <summary>Feedback</summary>
            <FeedbackControls alert={alert} existingFeedback={feedback} onFeedback={onFeedback} />
          </details>
        </div>
      ) : null}

      {activeTab === "evidence" ? (
        <section className="impact-detail-section">
          <EvidenceList items={alert.evidence} onItemClick={onFlyTo} />
        </section>
      ) : null}

      {activeTab === "details" ? (
        <>
          <details className="impact-detail-section impact-collapsible">
            <summary>
              <span className="impact-eyebrow">Score breakdown</span>
              <span className="impact-collapsible-hint">Score is not a probability</span>
            </summary>
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
          </details>

          {capsCount > 0 ? (
            <details className="impact-detail-section impact-collapsible impact-caps-section">
              <summary>
                <span className="impact-eyebrow">Caps &amp; guardrails</span>
                <span className="impact-collapsible-hint">
                  {capsCount} reason{capsCount === 1 ? "" : "s"} the score was held back
                </span>
              </summary>
              <ul className="impact-caps-list">
                {alert.breakdown.capsApplied.map((c, i) => (
                  <li key={`${i}-${c}`}>{c}</li>
                ))}
              </ul>
            </details>
          ) : null}

          <details className="impact-detail-section impact-collapsible">
            <summary>
              <span className="impact-eyebrow">Uncertainty</span>
              <span className="impact-collapsible-hint">Expanded analyst context</span>
            </summary>
            <p className="impact-detail-line">{alert.uncertainty}</p>
          </details>

          <section className="impact-detail-section">
            <p className="impact-detail-line">
              <span className="impact-inline-label">What changed.</span> {alert.whatChanged}
            </p>
          </section>
        </>
      ) : null}
    </article>
  );
}

function EvidenceList({
  items,
  compact = false,
  preview = false,
  onItemClick,
}: {
  items: EvidenceItem[];
  compact?: boolean;
  preview?: boolean;
  onItemClick?: (lat: number, lon: number) => void;
}) {
  if (items.length === 0) {
    return (
      <p className="impact-evidence-empty">
        No concrete evidence clusters matched this asset in the current window.
      </p>
    );
  }
  return (
    <ol
      className={`impact-evidence-list${compact ? " impact-evidence-list-compact" : ""}${preview ? " impact-evidence-list-preview" : ""}`}
    >
      {items.map((e) => (
        <li
          key={e.id}
          className="impact-evidence-item"
          onClick={() => onItemClick?.(e.lat, e.lon)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onItemClick?.(e.lat, e.lon);
            }
          }}
          role={onItemClick ? "button" : undefined}
          tabIndex={onItemClick ? 0 : undefined}
        >
          <div className="impact-evidence-head">
            <span className="impact-evidence-title">{e.title}</span>
            <span className={`impact-severity-chip impact-severity-${e.severity}`}>
              {e.severity}
            </span>
          </div>
          {preview ? (
            <div className="impact-evidence-preview-meta">
              <span>{e.sources[0] || "Unknown source"}</span>
              <span>·</span>
              <span>{formatRelative(e.timestamp)}</span>
            </div>
          ) : (
            <div className="impact-evidence-meta">
              <span>{e.eventClass.replace(/_/g, " ")}</span>
              <span>{e.sources.slice(0, 2).join(", ") || "—"}</span>
              <span>{formatTimestamp(e.timestamp)}</span>
              {!compact ? <span>{formatDistance(e.distanceKm)}</span> : null}
              <span>{(e.sourceReliability * 100).toFixed(0)}% rel</span>
            </div>
          )}
          {!compact && e.urls && e.urls.length > 0 ? (
            <ul className="impact-evidence-links">
              {e.urls.slice(0, EVIDENCE_LINK_LIMIT).map((u) => (
                <li key={u}>
                  <a href={u} target="_blank" rel="noopener noreferrer">
                    Source: {sourceLinkLabel(u)}
                  </a>
                </li>
              ))}
              {e.urls.length > EVIDENCE_LINK_LIMIT ? (
                <li className="impact-evidence-link-more">+{e.urls.length - EVIDENCE_LINK_LIMIT} more</li>
              ) : null}
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
