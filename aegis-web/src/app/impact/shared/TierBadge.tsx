import type { SourceTier } from "@/lib/impact/sourceTier";

const TIER_SHORT: Record<SourceTier, string> = {
  tier1: "T1",
  tier2: "T2",
  tier3: "T3",
  tier4: "T4",
};

const TIER_TITLE: Record<SourceTier, string> = {
  tier1: "Operational event",
  tier2: "Structured context",
  tier3: "News / article",
  tier4: "Model / derived",
};

type Props = {
  tier: SourceTier;
};

export function TierBadge({ tier }: Props) {
  return (
    <span
      className={`iv-tier-badge iv-tier-badge-${tier}`}
      title={TIER_TITLE[tier]}
      aria-label={TIER_TITLE[tier]}
    >
      {TIER_SHORT[tier]}
    </span>
  );
}
