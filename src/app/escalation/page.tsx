"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  EscalationForecastPoint,
  EscalationPoint,
} from "@/lib/escalation";

type EscalationApiResponse = {
  series: EscalationPoint[];
  forecast: EscalationForecastPoint[];
  error?: string;
};

const DEFAULT_COUNTRY = "Israel";

export default function EscalationPage() {
  const [country, setCountry] = useState(DEFAULT_COUNTRY);
  const [smooth, setSmooth] = useState(3);
  const [data, setData] = useState<EscalationApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadData(DEFAULT_COUNTRY, smooth);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadData(c: string, s: number) {
    if (!c.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/escalation?country=${encodeURIComponent(c)}&smooth=${s}`,
      );
      const json = (await res.json()) as EscalationApiResponse;
      if (!res.ok || json.error) {
        setError(json.error ?? "Failed to load escalation index.");
        setData(null);
      } else {
        setData(json);
      }
    } catch (e) {
      console.error(e);
      setError("Failed to load escalation index.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  const chartData = useMemo(() => {
    if (!data?.series?.length) return [];
    return data.series.map((d) => ({
      ...d,
      dateLabel: new Date(d.event_month).toISOString().slice(0, 10),
    }));
  }, [data]);

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      <aside className="hidden w-full max-w-xs flex-col border-r border-slate-800/80 bg-slate-950/95 px-6 py-6 md:flex">
        <div className="mb-6">
          <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-slate-400">
            AEGIS Control Bar
          </p>
          <p className="mt-2 text-xs text-slate-400/80">
            Enter a country to compute an ACLED-based escalation index from
            0–100, smoothed over time and projected three months ahead.
          </p>
        </div>

        <div className="space-y-4">
          <label className="flex flex-col gap-1 text-xs font-medium tracking-wide text-slate-300">
            Country (exact match)
            <input
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder="Israel"
              className="rounded-md border border-slate-700/80 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 outline-none ring-0 transition focus:border-sky-400 focus:bg-slate-900 focus:ring-1 focus:ring-sky-400/80"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs font-medium tracking-wide text-slate-300">
            Smoothing window (months)
            <input
              type="number"
              min={1}
              max={12}
              value={smooth}
              onChange={(e) =>
                setSmooth(Math.min(12, Math.max(1, Number(e.target.value) || 1)))
              }
              className="w-24 rounded-md border border-slate-700/80 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 outline-none ring-0 transition focus:border-sky-400 focus:bg-slate-900 focus:ring-1 focus:ring-sky-400/80"
            />
          </label>

          <button
            onClick={() => loadData(country, smooth)}
            className="btn-primary mt-2 w-full justify-center"
            disabled={loading}
          >
            {loading ? "Computing…" : "Generate plot"}
          </button>

          <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
            Depending on the date range, computing the index may take several
            seconds while ACLED data is loaded and processed.
          </p>
        </div>

        <div className="mt-8 space-y-2 rounded-lg border border-slate-800/90 bg-slate-950/90 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
            How to read the signals
          </p>
          <p className="text-[11px] text-slate-400">
            <span className="font-semibold text-sky-300">Blue line</span> —
            smoothed escalation index (0–100) combining six conflict indicators
            into one score.
          </p>
          <p className="text-[11px] text-slate-400">
            <span className="font-semibold text-rose-400">Red dots</span> —
            months where the index exceeded your alert threshold (coming soon).
          </p>
          <p className="text-[11px] text-slate-400">
            <span className="font-semibold text-amber-300">
              Orange diamonds
            </span>{" "}
            — pre-escalation warnings when leading indicators spike before the
            index crosses the alert line (coming soon).
          </p>
        </div>
      </aside>

      <main className="flex-1 px-5 py-6 md:px-8">
        <header className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-slate-50 sm:text-xl">
              Escalation Index
            </h1>
            <p className="mt-1 text-xs text-slate-400">
              Composite escalation score for{" "}
              <span className="font-semibold text-slate-100">
                {country || DEFAULT_COUNTRY}
              </span>{" "}
              based on ACLED conflict event data.
            </p>
          </div>
        </header>

        <section className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-4 shadow-sm backdrop-blur">
          {error && (
            <p className="mb-3 text-sm text-rose-400">
              {error} Try a different country name such as Israel or Ukraine.
            </p>
          )}
          {!error && !data && !loading && (
            <p className="text-sm text-slate-400">
              Enter a country name in the control bar and click{" "}
              <span className="font-semibold text-slate-100">
                Generate plot
              </span>{" "}
              to compute the escalation index.
            </p>
          )}

          {chartData.length > 0 && (
            <div className="mt-2 h-[360px] w-full">
              <ResponsiveContainer>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient
                      id="idxFill"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="5%"
                        stopColor="#60a5fa"
                        stopOpacity={0.45}
                      />
                      <stop
                        offset="95%"
                        stopColor="#60a5fa"
                        stopOpacity={0}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    stroke="#1e293b"
                    strokeDasharray="3 3"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="dateLabel"
                    tick={{ fontSize: 10, fill: "#9ca3af" }}
                    tickMargin={8}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "#9ca3af" }}
                    tickMargin={4}
                    domain={[0, 105]}
                    label={{
                      value: "Escalation Index (0–100)",
                      angle: -90,
                      position: "insideLeft",
                      style: { fill: "#9ca3af", fontSize: 10 },
                    }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#020617",
                      borderColor: "#1e293b",
                      borderRadius: 8,
                      fontSize: 11,
                    }}
                    labelStyle={{ color: "#e5e7eb" }}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 11 }}
                    formatter={(value) => (
                      <span style={{ color: "#e5e7eb" }}>{value}</span>
                    )}
                  />
                  <Area
                    type="monotone"
                    dataKey="index_smoothed"
                    name={`${smooth}-month smoothed index`}
                    stroke="#60a5fa"
                    strokeWidth={2.2}
                    fill="url(#idxFill)"
                  />
                  <Area
                    type="monotone"
                    dataKey="escalation_index"
                    name="Raw index"
                    stroke="#4b5563"
                    strokeWidth={1}
                    fillOpacity={0}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

