"use client";

import Link from "next/link";
import type { SelectedAssetEvent } from "@/lib/impact/eventLayer";
import { formatEventMetaLine, severityDotClass } from "./dashboardUtils";

type Props = {
  events: SelectedAssetEvent[];
  highlightedEventId: string | null;
  onHighlight: (eventId: string | null) => void;
  loading?: boolean;
  evidenceHref?: string;
};

function formatRelativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const diff = Date.now() - t;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`;
  return `${Math.round(diff / 86_400_000)}d ago`;
}

export function TopEventsPanel({
  events,
  highlightedEventId,
  onHighlight,
  loading,
  evidenceHref,
}: Props) {
  if (loading) {
    return (
      <section className="iv-dash-events" aria-busy="true">
        <h2 className="iv-dash-section-title">Top events</h2>
        <div className="iv-dash-skeleton iv-dash-skeleton-row" />
        <div className="iv-dash-skeleton iv-dash-skeleton-row" />
        <div className="iv-dash-skeleton iv-dash-skeleton-row" />
      </section>
    );
  }

  return (
    <section className="iv-dash-events">
      <div className="iv-dash-events-head">
        <h2 className="iv-dash-section-title">Top events</h2>
        {evidenceHref ? (
          <Link href={evidenceHref} className="iv-text-link iv-dash-evidence-link">
            View all evidence
          </Link>
        ) : null}
      </div>
      {events.length === 0 ? (
        <p className="iv-meta iv-dash-events-empty">
          No qualifying events near this asset in the selected range.
        </p>
      ) : (
        <ul className="iv-dash-event-list">
          {events.map((event) => {
            const isHighlighted = highlightedEventId === event.id;
            return (
              <li key={event.id}>
                <button
                  type="button"
                  className={`iv-dash-event-row${isHighlighted ? " is-highlighted" : ""}`}
                  onClick={() => onHighlight(isHighlighted ? null : event.id)}
                  onMouseEnter={() => onHighlight(event.id)}
                  onMouseLeave={() => onHighlight(null)}
                >
                  <span className={severityDotClass(event.severity)} aria-hidden />
                  <span className="iv-dash-event-body">
                    <span className="iv-dash-event-title">{event.title}</span>
                    <span className="iv-meta iv-dash-event-meta">
                      {formatEventMetaLine(event)}
                    </span>
                    <span className="iv-meta iv-dash-event-time">
                      {formatRelativeTime(event.timestamp)}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
