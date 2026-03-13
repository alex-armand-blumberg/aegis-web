"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
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
  escalationThreshold?: number;
  error?: string;
};

/** Format "YYYY-MM" or full ISO as "Jun 2025" for plot labels. */
function formatMonthLabel(ym: string): string {
  const str = typeof ym === "string" ? ym.slice(0, 7) : "";
  if (!str || str.length < 7) return ym;
  const d = new Date(str + (str.length === 7 ? "-01" : ""));
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

const DEFAULT_COUNTRY = "Israel";

function useReveal() {
  const ref = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => setVisible(e.isIntersecting));
      },
      { threshold: 0.1, rootMargin: "0px 0px -40px 0px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return { ref, visible };
}

export default function EscalationPage() {
  const [country, setCountry] = useState(DEFAULT_COUNTRY);
  const [smooth, setSmooth] = useState(3);
  const [threshold, setThreshold] = useState(45);
  const [data, setData] = useState<EscalationApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const controlsReveal = useReveal();
  const chartReveal = useReveal();

  useEffect(() => {
    if (!loading) {
      setProgress(0);
      return;
    }
    setProgress(5);
    const id = setInterval(() => {
      setProgress((p) => (p >= 85 ? p : p + Math.random() * 8 + 4));
    }, 500);
    return () => clearInterval(id);
  }, [loading]);

  useEffect(() => {
    void loadData(DEFAULT_COUNTRY, smooth, threshold);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadData(c: string, s: number, t: number) {
    if (!c.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        country: c,
        smooth: String(s),
        threshold: String(t),
      });
      const res = await fetch(`/api/escalation?${params.toString()}`);
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
      setProgress(100);
    }
  }

  const chartData = useMemo(() => {
    if (!data?.series?.length) return [];
    const main = data.series.map((d, i) => {
      const monthStr = d.event_month.slice(0, 7);
      const isLast = i === data.series.length - 1;
      const lastSmoothed = data.series[data.series.length - 1]?.index_smoothed;
      return {
        ...d,
        dateLabel: formatMonthLabel(monthStr),
        monthKey: monthStr,
        projected_index:
          isLast && data.forecast?.length ? (lastSmoothed ?? null) : null,
      };
    });
    if (data.forecast?.length && main.length > 0) {
      const forecastPoints: Array<{
        dateLabel: string;
        index_smoothed: number | null;
        escalation_index: number | null;
        projected_index: number;
      }> = data.forecast.map((f) => ({
        dateLabel: formatMonthLabel(f.event_month.slice(0, 7)),
        index_smoothed: null,
        escalation_index: null,
        projected_index: f.projected_index,
      }));
      return [...main, ...forecastPoints];
    }
    return main;
  }, [data]);

  const thresholdNum = Math.max(0, Math.min(100, threshold));

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      <aside
        ref={controlsReveal.ref as React.RefObject<HTMLElement>}
        className={`hidden w-full max-w-xs flex-col border-r border-slate-800/80 bg-slate-950/95 px-6 py-6 transition-all duration-700 md:flex ${
          controlsReveal.visible
            ? "opacity-100 translate-y-0"
            : "opacity-0 translate-y-6"
        }`}
      >
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
            <span>
              Alert threshold (0–100){" "}
              <span className="font-normal text-slate-500">
                (recommended: keep default)
              </span>
            </span>
            <input
              type="number"
              min={0}
              max={100}
              value={threshold}
              onChange={(e) =>
                setThreshold(
                  Math.max(0, Math.min(100, Number(e.target.value) || 45)),
                )
              }
              className="w-24 rounded-md border border-slate-700/80 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 outline-none ring-0 transition focus:border-sky-400 focus:bg-slate-900 focus:ring-1 focus:ring-sky-400/80"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs font-medium tracking-wide text-slate-300">
            <span>
              Smoothing (months){" "}
              <span className="font-normal text-slate-500">
                (recommended: keep default)
              </span>
            </span>
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
            onClick={() => loadData(country, smooth, threshold)}
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
            smoothed escalation index (0–100).
          </p>
          <p className="text-[11px] text-slate-400">
            <span className="font-semibold text-violet-400">Purple dashed</span> —
            3‑month forecast.
          </p>
          <p className="text-[11px] text-slate-400">
            <span className="font-semibold text-rose-400">Red line</span> — alert
            threshold.
          </p>
        </div>
      </aside>

      <main className="flex-1 px-5 py-6 md:px-8">
        <header className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-slate-50 sm:text-xl">
              Escalation Index
            </h1>
            <p className="mt-1 max-w-[620px] overflow-x-auto text-xs text-slate-400 whitespace-nowrap">
              Choose a country and date range. Data: ACLED (2018 to one year
              ago with research-tier access).
            </p>
          </div>
        </header>

        {loading && (
          <section className="mb-6 rounded-lg border border-slate-800/80 bg-slate-900/60 p-4">
            <p className="mb-2 text-xs text-slate-400">Computing index…</p>
            <div className="h-2 overflow-hidden rounded-full bg-slate-800/80">
              <div
                className="h-full rounded-full bg-sky-400 transition-all duration-300"
                style={{ width: `${Math.min(progress, 100)}%` }}
              />
            </div>
          </section>
        )}

        <section
          ref={chartReveal.ref as React.RefObject<HTMLElement>}
          className={`rounded-xl border border-slate-800/80 bg-slate-900/60 p-4 shadow-sm backdrop-blur transition-all duration-700 ${
            chartReveal.visible
              ? "opacity-100 translate-y-0"
              : "opacity-0 translate-y-6"
          }`}
        >
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
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={chartData}
                  margin={{ top: 12, right: 20, left: 8, bottom: 8 }}
                  isAnimationActive
                  animationDuration={1200}
                  animationEasing="ease-out"
                >
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
                    tickFormatter={(v) =>
                      typeof v === "string" && /^\w{3}\s\d{4}$/.test(v)
                        ? v
                        : formatMonthLabel(String(v))
                    }
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
                    formatter={(value, name) => [
                      value != null ? Number(value).toFixed(1) : "—",
                      String(name),
                    ]}
                    labelFormatter={(label) => String(label)}
                  />
                  <ReferenceLine
                    y={thresholdNum}
                    stroke="#ef4444"
                    strokeDasharray="4 4"
                    strokeWidth={1.5}
                    label={{
                      value: `Alert threshold (${thresholdNum})`,
                      position: "right",
                      fill: "#ef4444",
                      fontSize: 10,
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="index_smoothed"
                    name={`${smooth}-month smoothed index`}
                    stroke="#60a5fa"
                    strokeWidth={2.2}
                    fill="url(#idxFill)"
                    isAnimationActive
                    animationDuration={1200}
                    animationEasing="ease-out"
                  />
                  <Line
                    type="monotone"
                    dataKey="escalation_index"
                    name="Raw index"
                    stroke="#4b5563"
                    strokeWidth={1}
                    dot={false}
                    isAnimationActive
                    animationDuration={1200}
                    animationEasing="ease-out"
                  />
                  {data?.forecast?.length ? (
                    <Line
                      type="monotone"
                      dataKey="projected_index"
                      name="3-month forecast"
                      stroke="#a78bfa"
                      strokeWidth={2}
                      strokeDasharray="6 4"
                      dot={{ r: 4, fill: "#a78bfa" }}
                      connectNulls
                      isAnimationActive
                      animationDuration={1200}
                      animationEasing="ease-out"
                    />
                  ) : null}
                  <Legend
                    wrapperStyle={{ fontSize: 11 }}
                    formatter={(value) => (
                      <span style={{ color: "#e5e7eb" }}>{value}</span>
                    )}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
