"use client";

import type { SourceTier } from "@/lib/impact/sourceTier";
import type { EventRelation } from "@/lib/impact/eventRelation";
import {
  DEFAULT_EVIDENCE_FILTER,
  isDefaultFilter,
  type EvidenceFilterState,
} from "./evidenceUtils";

type Props = {
  total: number;
  filtered: number;
  filters: EvidenceFilterState;
  onChange: (f: EvidenceFilterState) => void;
};

const TIER_OPTIONS: { value: SourceTier; label: string }[] = [
  { value: "tier1", label: "T1 Operational" },
  { value: "tier2", label: "T2 Structured" },
  { value: "tier3", label: "T3 Article" },
];

const RELATION_OPTIONS: { value: EventRelation; label: string }[] = [
  { value: "direct", label: "Direct" },
  { value: "regional", label: "Regional" },
  { value: "contextual", label: "Contextual" },
];

function toggleSetItem<T>(set: Set<T> | null, item: T): Set<T> | null {
  const current = set ? new Set(set) : new Set<T>();
  if (current.has(item)) {
    current.delete(item);
    return current.size === 0 ? null : current;
  }
  current.add(item);
  return current;
}

export function EvidenceFilterBar({ total, filtered, filters, onChange }: Props) {
  const active = !isDefaultFilter(filters);

  function handleTierToggle(tier: SourceTier) {
    onChange({ ...filters, tiers: toggleSetItem(filters.tiers, tier) });
  }

  function handleRelationToggle(relation: EventRelation) {
    onChange({ ...filters, relations: toggleSetItem(filters.relations, relation) });
  }

  function handleReset() {
    onChange(DEFAULT_EVIDENCE_FILTER);
  }

  return (
    <div className="iv-evidence-filter-bar" role="group" aria-label="Evidence filters">
      <div className="iv-evidence-filter-groups">
        <div className="iv-evidence-filter-group">
          <span className="iv-evidence-filter-label">Tier</span>
          {TIER_OPTIONS.map(({ value, label }) => {
            const isActive = filters.tiers !== null && filters.tiers.has(value);
            return (
              <button
                key={value}
                type="button"
                className={`iv-evidence-filter-pill${isActive ? " is-active" : ""}`}
                onClick={() => handleTierToggle(value)}
                aria-pressed={isActive}
              >
                {label}
              </button>
            );
          })}
        </div>
        <div className="iv-evidence-filter-group">
          <span className="iv-evidence-filter-label">Relation</span>
          {RELATION_OPTIONS.map(({ value, label }) => {
            const isActive = filters.relations !== null && filters.relations.has(value);
            return (
              <button
                key={value}
                type="button"
                className={`iv-evidence-filter-pill${isActive ? " is-active" : ""}`}
                onClick={() => handleRelationToggle(value)}
                aria-pressed={isActive}
              >
                {label}
              </button>
            );
          })}
        </div>
        {active ? (
          <button
            type="button"
            className="iv-evidence-filter-reset"
            onClick={handleReset}
            aria-label="Clear all filters"
          >
            Clear
          </button>
        ) : null}
      </div>
      {active ? (
        <p className="iv-evidence-filter-count iv-meta">
          Showing {filtered} of {total} event{total === 1 ? "" : "s"}
        </p>
      ) : null}
    </div>
  );
}
