"use client";

import Link from "next/link";
import { MetricCard } from "./MetricCard";
import { ChartFrame } from "./ChartFrame";
import { LayerChip } from "./LayerChipGroup";
import { EventTimeline } from "./EventTimeline";

const demoSeries = [
  { m: "Aug", v: 42 },
  { m: "Sep", v: 48 },
  { m: "Oct", v: 55 },
  { m: "Nov", v: 61 },
  { m: "Dec", v: 58 },
  { m: "Jan", v: 67 },
];

export function HomePreviewModules() {
  return (
    <div className="ui-home-preview-grid">
      <div className="ui-home-preview-card">
        <div className="ui-home-preview-label">Live map preview</div>
        <div className="relative mt-2 h-24 overflow-hidden rounded-md border border-white/10 bg-slate-950/80">
          <div className="absolute inset-0 opacity-40" style={{
            background: "radial-gradient(circle at 30% 40%, rgba(59,130,246,0.35), transparent 55%), radial-gradient(circle at 70% 60%, rgba(239,68,68,0.25), transparent 50%)",
          }} />
          <div className="absolute bottom-2 left-2 right-2 flex flex-wrap gap-1">
            <span className="rounded bg-blue-500/20 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-blue-200">
              Layers
            </span>
            <span className="rounded bg-white/10 px-1.5 py-0.5 text-[9px] uppercase text-slate-400">
              Risk
            </span>
          </div>
        </div>
        <Link href="/map" className="mt-3 inline-block text-xs font-semibold uppercase tracking-wider text-red-400 hover:text-red-300">
          Open map →
        </Link>
      </div>

      <div className="ui-home-preview-card">
        <div className="ui-home-preview-label">Hotspot watchlist</div>
        <div className="mt-2 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-300">1 · Eastern Europe</span>
            <span className="text-xs text-slate-500">▲ High</span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-white/10">
            <div className="h-full w-[72%] rounded-full bg-gradient-to-r from-blue-500 to-red-500" />
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-300">2 · Levant</span>
            <span className="text-xs text-slate-500">◆ Elevated</span>
          </div>
        </div>
      </div>

      <div className="ui-home-preview-card">
        <div className="ui-home-preview-label">Escalation trend</div>
        <ChartFrame
          subtitle="Demo curve — not live data"
          className="mt-2 border-0 bg-transparent p-0"
        >
          <div className="flex h-20 items-end gap-1 px-1">
            {demoSeries.map((p) => (
              <div key={p.m} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className="w-full max-w-[14px] rounded-sm bg-gradient-to-t from-blue-600 to-red-500 transition-all duration-500"
                  style={{ height: `${(p.v / 70) * 100}%`, minHeight: "4px" }}
                />
                <span className="text-[8px] text-slate-600">{p.m}</span>
              </div>
            ))}
          </div>
        </ChartFrame>
      </div>

      <div className="ui-home-preview-card">
        <div className="ui-home-preview-label">Source health</div>
        <div className="mt-2 flex flex-wrap gap-2">
          <LayerChip
            item={{
              id: "demo-core",
              label: "Core",
              count: 12,
              color: "#22c55e",
              checked: true,
              onChange: () => {},
            }}
          />
          <LayerChip
            item={{
              id: "demo-live",
              label: "Live",
              count: 4,
              color: "#38bdf8",
              checked: true,
              onChange: () => {},
            }}
          />
        </div>
        <MetricCard variant="compact" label="Freshness" displayValue="~2m sync" className="mt-3" />
      </div>

      <div className="ui-home-preview-card md:col-span-2">
        <div className="ui-home-preview-label">Recent chronology (sample)</div>
        <EventTimeline
          className="mt-2"
          groups={[
            {
              label: "Today",
              items: [
                {
                  id: "1",
                  time: "14:20 UTC",
                  summary: "Elevated air activity reported near theater border.",
                  source: "OSINT corroboration",
                  severity: "medium",
                },
              ],
            },
          ]}
        />
      </div>

      <div className="ui-home-preview-card">
        <div className="ui-home-preview-label">AI summary card</div>
        <p className="mt-2 text-xs leading-relaxed text-slate-400">
          Composite signals show rising kinetic tempo with stable civilian share — pattern consistent with
          pre-escalation phases in comparable theaters.
        </p>
        <p className="ui-metric-caveat mt-2">Illustrative copy; run the demo for live model output.</p>
      </div>
    </div>
  );
}
