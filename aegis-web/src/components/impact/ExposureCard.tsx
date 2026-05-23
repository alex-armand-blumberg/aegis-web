"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  AlertFeedback,
  EvidenceItem,
  ExposureAlert,
  ExposureScoreBreakdown,
  RegionalContextItem,
  RegionalContextReason,
  SourceFamily,
  UserAsset,
} from "@/lib/impact/types";
import { countryDisplay } from "@/lib/impact/countryDisplay";
import {
  EVIDENCE_RELATION_LABEL,
  classifyEvidenceRelation,
  groupEvidenceByRelation,
  type EvidenceRelation,
} from "@/lib/impact/evidenceRelation";
import { regionalContextReasonLabel } from "@/lib/impact/regionalContext";
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

function eventClassLabel(eventClass: EvidenceItem["eventClass"]): string {
  switch (eventClass) {
    case "armed_conflict":
      return "Armed conflict";
    case "strike_or_explosion":
      return "Strike / explosion";
    case "civilian_harm":
      return "Civilian harm";
    case "protest_or_unrest":
      return "Protest / unrest";
    case "strategic_development":
      return "Strategic development";
    case "humanitarian_stress":
      return "Humanitarian stress";
    case "natural_disaster":
      return "Natural disaster";
    case "sanctions_or_economic":
      return "Sanctions / economic";
    case "maritime_activity":
      return "Maritime activity";
    case "aviation_activity":
      return "Aviation activity";
    case "infrastructure_disruption":
      return "Infrastructure disruption";
    case "news_report":
      return "News report";
    case "model_risk_context":
      return "Model context";
    default:
      return "Other";
  }
}

function sourceFamilyLabel(family: SourceFamily | undefined): string {
  switch (family) {
    case "structured_conflict":
      return "Structured";
    case "official":
      return "Official";
    case "humanitarian":
      return "Humanitarian";
    case "disaster":
      return "Disaster";
    case "sanctions":
      return "Sanctions";
    case "maritime":
      return "Maritime";
    case "aviation":
      return "Aviation";
    case "infrastructure":
      return "Infrastructure";
    case "news":
      return "News";
    case "market":
      return "Market";
    case "model_context":
      return "Model";
    default:
      return "Unknown";
  }
}

function joinWithAnd(values: string[]): string {
  if (values.length === 0) return "";
  if (values.length === 1) return values[0];
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values[values.length - 1]}`;
}

function buildHighScoreDriverLine(alert: ExposureAlert): string | null {
  if (alert.level !== "high" && alert.level !== "critical") return null;
  const drivers: string[] = [];
  const directEvidence = alert.evidence.filter(
    (item) => classifyEvidenceRelation(item, alert.asset) === "direct"
  );
  const topEvidence = directEvidence[0] ?? alert.evidence[0];
  if (topEvidence) {
    const eventLabel = eventClassLabel(topEvidence.eventClass).toLowerCase();
    const prefix = directEvidence.length > 0 ? "nearby" : "priority";
    drivers.push(`${prefix} ${eventLabel} evidence`);
  }
  if (alert.breakdown.severity >= 10) {
    drivers.push("high-severity signals");
  }
  if (alert.breakdown.sourceDiversity > 0) {
    drivers.push("source diversity");
  }
  if (alert.breakdown.countryContext > 0) {
    drivers.push("active country context");
  }
  if (drivers.length === 0) return null;
  return `Score drivers: ${joinWithAnd(drivers)}.`;
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

const EVIDENCE_PREVIEW_LIMIT = 3;
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
  const evidenceGroups = groupEvidenceByRelation(alert.evidence, alert.asset);
  const previewGroups = buildPreviewGroups(evidenceGroups, EVIDENCE_PREVIEW_LIMIT);
  const previewCount = previewGroups.reduce((sum, group) => sum + group.items.length, 0);
  const hiddenCount = Math.max(0, alert.evidence.length - previewCount);
  const country = countryDisplay(alert.asset.country);
  const primaryWatchNext = alert.watchNext[0] ?? null;
  const highScoreDriverLine = buildHighScoreDriverLine(alert);

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
            {highScoreDriverLine ? (
              <p className="impact-detail-line impact-detail-driver-line">{highScoreDriverLine}</p>
            ) : null}
          </section>

          <section className="impact-detail-section">
            <span className="impact-eyebrow">Evidence summary</span>
            <GroupedEvidenceList
              groups={previewGroups}
              asset={alert.asset}
              compact
              preview
              onItemClick={onFlyTo}
            />
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

          {alert.regionalContext && alert.regionalContext.length > 0 ? (
            <section className="impact-detail-section impact-regional-context">
              <span className="impact-eyebrow">Regional context</span>
              <p className="impact-evidence-group-desc">
                Live signals matched to this asset&rsquo;s region or theater. Not
                counted in the score &mdash; useful for situational awareness.
              </p>
              <RegionalContextList items={alert.regionalContext} onItemClick={onFlyTo} />
            </section>
          ) : null}

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
          <GroupedEvidenceList
            groups={evidenceGroups}
            asset={alert.asset}
            onItemClick={onFlyTo}
          />
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

type EvidenceGroup = { relation: EvidenceRelation; items: EvidenceItem[] };

const RELATION_HINT: Record<EvidenceRelation, string> = {
  direct: "Local or proximate concrete events for this asset.",
  regional_context: "Same-region developments that may shape exposure indirectly.",
  model_context: "Aggregate or model context — not a concrete incident.",
};

const RELATION_DESCRIPTION: Record<EvidenceRelation, string> = {
  direct: "Concrete nearby incidents most likely to affect this asset.",
  regional_context: "Relevant country or regional signals, not direct incidents.",
  model_context: "Aggregate/model indicators, not concrete incidents.",
};

function buildPreviewGroups(groups: EvidenceGroup[], limit: number): EvidenceGroup[] {
  if (limit <= 0) return [];
  const out: EvidenceGroup[] = [];
  let remaining = limit;
  for (const group of groups) {
    if (remaining <= 0) break;
    if (group.items.length === 0) continue;
    const take = Math.min(group.items.length, remaining);
    out.push({ relation: group.relation, items: group.items.slice(0, take) });
    remaining -= take;
  }
  return out;
}

function GroupedEvidenceList({
  groups,
  asset,
  compact = false,
  preview = false,
  onItemClick,
}: {
  groups: EvidenceGroup[];
  asset: UserAsset;
  compact?: boolean;
  preview?: boolean;
  onItemClick?: (lat: number, lon: number) => void;
}) {
  if (groups.length === 0) {
    return (
      <p className="impact-evidence-empty">
        No concrete evidence clusters matched this asset in the current window.
      </p>
    );
  }
  return (
    <div className="impact-evidence-groups">
      {groups.map((group) => (
        <section
          key={group.relation}
          className={`impact-evidence-group impact-evidence-group-${group.relation}`}
        >
          <header className="impact-evidence-group-head">
            <div className="impact-evidence-group-titleline">
              <span
                className={`impact-relation-chip impact-relation-${group.relation}`}
                title={RELATION_HINT[group.relation]}
              >
                {EVIDENCE_RELATION_LABEL[group.relation]}
              </span>
              <span className="impact-evidence-group-count">{group.items.length}</span>
            </div>
            <p className="impact-evidence-group-desc">{RELATION_DESCRIPTION[group.relation]}</p>
          </header>
          <EvidenceList
            items={group.items}
            asset={asset}
            compact={compact}
            preview={preview}
            onItemClick={onItemClick}
          />
        </section>
      ))}
    </div>
  );
}

function EvidenceList({
  items,
  asset,
  compact = false,
  preview = false,
  onItemClick,
}: {
  items: EvidenceItem[];
  asset: UserAsset;
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
      {items.map((e) => {
        const relation = classifyEvidenceRelation(e, asset);
        const source = e.sources[0] || "Unknown source";
        const sourceFamily = sourceFamilyLabel(e.sourceFamilies[0]);
        const distance = formatDistance(e.distanceKm);
        return (
          <li
            key={e.id}
            className={`impact-evidence-item impact-evidence-item-${relation}`}
            data-relation={relation}
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
              <span className="impact-evidence-head-chips">
                <span
                  className={`impact-relation-chip impact-relation-${relation}`}
                  title={RELATION_HINT[relation]}
                >
                  {EVIDENCE_RELATION_LABEL[relation]}
                </span>
                <span className={`impact-severity-chip impact-severity-${e.severity}`}>
                  {e.severity}
                </span>
              </span>
            </div>
            <div
              className={`impact-evidence-meta impact-evidence-meta-compact${
                preview ? " impact-evidence-preview-meta" : ""
              }`}
            >
              <span>{eventClassLabel(e.eventClass)}</span>
              <span>{EVIDENCE_RELATION_LABEL[relation]}</span>
              {distance !== "—" ? <span>{distance}</span> : null}
              <span>{source}</span>
              <span>{sourceFamily}</span>
              <span>{preview ? formatRelative(e.timestamp) : formatTimestamp(e.timestamp)}</span>
            </div>
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
        );
      })}
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

const REGIONAL_REASON_TOOLTIP: Record<RegionalContextReason, string> = {
  same_country: "Live signal in the same country as this asset.",
  neighbor_country: "Live signal in a country bordering or adjacent to this asset.",
  theater_match: "Live signal mentions a theater keyword tied to this asset.",
  corridor_match: "Live signal mentions a transit/corridor tied to this asset.",
  supplier_overlay: "Live signal overlaps the asset's supplier or vendor footprint.",
};

function RegionalContextList({
  items,
  onItemClick,
}: {
  items: RegionalContextItem[];
  onItemClick?: (lat: number, lon: number) => void;
}) {
  if (items.length === 0) return null;
  return (
    <ol className="impact-evidence-list impact-evidence-list-compact impact-regional-context-list">
      {items.map((item) => {
        const distance = formatDistance(item.distanceKm);
        return (
          <li
            key={item.id}
            className="impact-evidence-item impact-evidence-item-regional_context"
            onClick={() => onItemClick?.(item.lat, item.lon)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onItemClick?.(item.lat, item.lon);
              }
            }}
            role={onItemClick ? "button" : undefined}
            tabIndex={onItemClick ? 0 : undefined}
          >
            <div className="impact-evidence-head">
              <span className="impact-evidence-title">{item.title}</span>
              <span className="impact-evidence-head-chips">
                <span className={`impact-severity-chip impact-severity-${item.severity}`}>
                  {item.severity}
                </span>
              </span>
            </div>
            <div className="impact-evidence-meta impact-evidence-meta-compact impact-evidence-preview-meta">
              <span>{eventClassLabel(item.eventClass)}</span>
              {item.country ? <span>{item.country}</span> : null}
              {distance !== "—" ? <span>{distance}</span> : null}
              <span>{item.source}</span>
              <span>{sourceFamilyLabel(item.sourceFamily)}</span>
              <span>{formatRelative(item.timestamp)}</span>
            </div>
            <div className="impact-regional-context-reasons">
              {item.reasons.map((reason) => (
                <span
                  key={reason}
                  className={`impact-relation-chip impact-regional-reason impact-regional-reason-${reason}`}
                  title={REGIONAL_REASON_TOOLTIP[reason]}
                >
                  {regionalContextReasonLabel(reason)}
                </span>
              ))}
              {item.url ? (
                <a
                  className="impact-regional-context-link"
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                >
                  Source: {sourceLinkLabel(item.url)}
                </a>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
