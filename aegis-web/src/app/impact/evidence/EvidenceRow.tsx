"use client";

import type { SelectedAssetEvent } from "@/lib/impact/eventLayer";
import type { UserAsset } from "@/lib/impact/types";
import { TierBadge } from "../shared/TierBadge";
import { severityDotClass } from "../dashboard/dashboardUtils";
import {
  buildEventWhyItMatters,
  formatAbsoluteTime,
  formatEvidenceMetaLine,
  formatRelativeTime,
  tierRationaleLabel,
  truncateText,
} from "./evidenceUtils";

type Props = {
  event: SelectedAssetEvent;
  asset: UserAsset;
  omitRelation?: boolean;
  muted?: boolean;
};

export function EvidenceRow({ event, asset, omitRelation, muted }: Props) {
  const whyLine = truncateText(buildEventWhyItMatters(event, asset), 120);
  const metaLine = `${formatEvidenceMetaLine(event, { omitRelation, omitTier: true })} · ${formatRelativeTime(event.timestamp)}`;
  const hasDetails = Boolean(event.tierRationale || event.url);

  return (
    <article className={`iv-evidence-row${muted ? " is-muted" : ""}`}>
      <div className="iv-evidence-row-main">
        <span className={severityDotClass(event.severity)} aria-hidden />
        <TierBadge tier={event.tier} />
        <div className="iv-evidence-row-body">
          <h3 className="iv-evidence-row-title">{event.title}</h3>
          <p className="iv-meta iv-evidence-row-meta">{metaLine}</p>
          <p className="iv-meta iv-evidence-row-why">{whyLine}</p>
        </div>
      </div>
      {hasDetails ? (
        <details className="iv-evidence-row-details">
          <summary className="iv-evidence-row-details-summary">More detail</summary>
          <div className="iv-evidence-row-details-body">
            {event.tierRationale ? (
              <p className="iv-meta">{tierRationaleLabel(event.tierRationale)}</p>
            ) : null}
            <p className="iv-meta">{formatAbsoluteTime(event.timestamp)}</p>
            {event.url ? (
              <a
                href={event.url}
                className="iv-text-link iv-evidence-source-link"
                target="_blank"
                rel="noopener noreferrer"
              >
                View source
              </a>
            ) : null}
          </div>
        </details>
      ) : null}
    </article>
  );
}
