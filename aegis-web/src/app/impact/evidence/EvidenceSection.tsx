"use client";

import type { SelectedAssetEvent } from "@/lib/impact/eventLayer";
import type { UserAsset } from "@/lib/impact/types";
import { EvidenceRow } from "./EvidenceRow";
import { buildTierSummary } from "./evidenceUtils";

type Props = {
  title: string;
  description?: string;
  events: SelectedAssetEvent[];
  asset: UserAsset;
  omitRelation?: boolean;
  muted?: boolean;
};

export function EvidenceSection({
  title,
  description,
  events,
  asset,
  omitRelation,
  muted,
}: Props) {
  if (events.length === 0) return null;

  const tierSummary = buildTierSummary(events);

  return (
    <section className="iv-evidence-section">
      <header className="iv-evidence-section-head">
        <h2 className="iv-evidence-section-title">
          {title} ({events.length})
        </h2>
        {tierSummary ? (
          <p className="iv-meta iv-evidence-tier-summary">{tierSummary}</p>
        ) : null}
        {description ? <p className="iv-meta iv-evidence-section-desc">{description}</p> : null}
      </header>
      <div className="iv-evidence-section-list">
        {events.map((event) => (
          <EvidenceRow
            key={event.id}
            event={event}
            asset={asset}
            omitRelation={omitRelation}
            muted={muted}
          />
        ))}
      </div>
    </section>
  );
}
