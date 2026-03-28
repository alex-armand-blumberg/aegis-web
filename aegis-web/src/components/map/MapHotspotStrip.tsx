"use client";

import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { WatchlistCard } from "@/components/ui/WatchlistCard";

export type HotspotStripItem = {
  country: string;
  score100: number;
  severity: "low" | "medium" | "high" | "critical";
  trend: string;
  reason: string;
  latestEventAt: string;
};

type SortMode = "score" | "name";

type MapHotspotStripProps = {
  items: HotspotStripItem[];
  sort: SortMode;
  onSortChange: (s: SortMode) => void;
  onFocus: (country: string) => void;
};

export function MapHotspotStrip({ items, sort, onSortChange, onFocus }: MapHotspotStripProps) {
  const sorted =
    sort === "name"
      ? [...items].sort((a, b) => a.country.localeCompare(b.country))
      : [...items].sort((a, b) => b.score100 - a.score100);

  return (
    <div className="map-hotspot-strip">
      <div className="map-hotspot-strip-head">
        <div>
          <div className="map-hotspot-strip-title">Watchlist</div>
          <p className="map-hotspot-strip-sub">Priority theaters and elevated risk</p>
        </div>
        <SegmentedControl
          ariaLabel="Sort watchlist"
          options={[
            { value: "score", label: "Score" },
            { value: "name", label: "A–Z" },
          ]}
          value={sort}
          onChange={(v) => onSortChange(v)}
        />
      </div>
      <div className="map-hotspot-strip-scroll">
        {sorted.length > 0 ? (
          sorted.map((h, idx) => (
            <WatchlistCard
              key={`${h.country}-${h.latestEventAt}`}
              rank={idx + 1}
              name={h.country}
              scoreLabel={`${h.score100} / 100`}
              severity={h.severity}
              trend={h.trend}
              reason={h.reason}
              barPercent={h.score100}
              onClick={() => onFocus(h.country)}
              className="map-hotspot-strip-card"
            />
          ))
        ) : (
          <div className="map-hotspot-strip-empty">No watchlist signals in this window.</div>
        )}
      </div>
    </div>
  );
}
