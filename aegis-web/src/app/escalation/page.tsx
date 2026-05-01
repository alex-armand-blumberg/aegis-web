"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useEscalationPlot } from "@/contexts/EscalationPlotContext";
import BackgroundVideo from "@/components/BackgroundVideo";
import AnimatedMethodWeight from "@/components/AnimatedMethodWeight";
import { AppCommandBar } from "@/components/ui/AppCommandBar";
import { MarketingNav } from "@/components/ui/MarketingNav";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { ChartFrame } from "@/components/ui/ChartFrame";
import { TransparencyModule } from "@/components/ui/TransparencyModule";
import { ComparisonLayout } from "@/components/ui/ComparisonLayout";
import { SiteFooter } from "@/components/ui/SiteFooter";
import { StatusChip } from "@/components/ui/StatusChip";

function DiamondDot(props: { cx?: number; cy?: number; payload?: { preEscalation?: number | null } }) {
  const { cx = 0, cy = 0, payload } = props;
  if (payload?.preEscalation == null) return null;
  const r = 6;
  return (
    <polygon
      points={`${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`}
      fill="#f97316"
    />
  );
}
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
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
import { suggestCountries } from "@/lib/countries";
import type {
  EscalationForecastPoint,
  EscalationPoint,
} from "@/lib/escalation";

type EscalationApiResponse = {
  series: EscalationPoint[];
  forecast: EscalationForecastPoint[];
  escalationThreshold: number;
  escalationFlaggedMonths: string[];
  preEscalationMonths: string[];
  dataSource?: string;
  datasetVersion?: string;
  generatedAt?: string;
  cache?: {
    status: "fresh" | "stale" | "miss";
    ageMs: number;
    source: "memory" | "redis" | "none";
    generatedAt: string;
  };
  perf?: {
    totalMs: number;
    cacheLookupMs?: number;
    cacheStatus: "fresh" | "stale" | "miss";
    cacheSource: "memory" | "redis" | "none";
  };
  error?: string;
};

type EscalationStreamMessage = {
  type?: string;
  pct?: number;
  fetched?: number;
  total?: number;
  error?: string;
  series?: EscalationPoint[];
  forecast?: EscalationForecastPoint[];
  escalationThreshold?: number;
  escalationFlaggedMonths?: string[];
  preEscalationMonths?: string[];
  dataSource?: string;
  datasetVersion?: string;
  generatedAt?: string;
  cache?: EscalationApiResponse["cache"];
  perf?: EscalationApiResponse["perf"];
  warming?: boolean;
};

type EscalationPrefetchEntry = {
  promise: Promise<EscalationApiResponse | null>;
  data?: EscalationApiResponse;
};

function buildEscalationApiUrl(input: {
  country: string;
  smooth: number;
  threshold: number;
  startDate: string;
  endDate: string;
  instant?: boolean;
}): string {
  const params = new URLSearchParams({
    country: input.country,
    smooth: String(input.smooth),
    threshold: String(input.threshold),
    start: input.startDate,
    end: input.endDate,
  });
  if (input.instant) params.set("instant", "1");
  return `/api/escalation?${params.toString()}`;
}

function messageToEscalationResponse(msg: EscalationStreamMessage): EscalationApiResponse {
  return {
    series: msg.series ?? [],
    forecast: msg.forecast ?? [],
    escalationThreshold: msg.escalationThreshold ?? 0,
    escalationFlaggedMonths: msg.escalationFlaggedMonths ?? [],
    preEscalationMonths: msg.preEscalationMonths ?? [],
    dataSource: msg.dataSource,
    datasetVersion: msg.datasetVersion,
    generatedAt: msg.generatedAt,
    cache: msg.cache,
    perf: msg.perf,
  };
}

async function readEscalationApiResponse(
  res: Response,
  onProgress?: (msg: EscalationStreamMessage) => void
): Promise<EscalationApiResponse | null> {
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const json = (await res.json()) as EscalationApiResponse & EscalationStreamMessage;
    if (res.status === 202 || json.warming) return null;
    if (!res.ok) throw new Error(json.error ?? "Failed to load escalation index.");
    return json;
  }

  if (!res.ok) {
    const json = (await res.json()) as EscalationApiResponse;
    throw new Error(json.error ?? "Failed to load escalation index.");
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("Failed to load escalation index.");
  const decoder = new TextDecoder();
  let buffer = "";
  const handleMessage = (msg: EscalationStreamMessage): EscalationApiResponse | null => {
    if (msg.type === "progress") {
      onProgress?.(msg);
      return null;
    }
    if (msg.type === "result") return messageToEscalationResponse(msg);
    if (msg.type === "error") throw new Error(msg.error ?? "Failed to load escalation index.");
    return null;
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const result = handleMessage(JSON.parse(trimmed) as EscalationStreamMessage);
      if (result) return result;
    }
  }
  if (buffer.trim()) {
    const result = handleMessage(JSON.parse(buffer.trim()) as EscalationStreamMessage);
    if (result) return result;
  }
  return null;
}

function getDefaultEndDate(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 1);
  return d.toISOString().slice(0, 10);
}

/** Format "YYYY-MM" or "YYYY-MM-DD" as "Jun 2025" for plot labels. */
function formatMonthLabel(ym: string): string {
  if (!ym || ym.length < 7) return ym;
  const d = new Date(ym.slice(0, 4) + "-" + ym.slice(5, 7) + "-01");
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

const DEFAULT_START = "2018-01-01";
const DEFAULT_END = getDefaultEndDate();

type ChartPayloadPoint = {
  event_month?: string;
  dateLabel?: string;
  battles?: number;
  explosions_remote_violence?: number;
  strategic_developments?: number;
  protests?: number;
  riots?: number;
  violence_against_civilians?: number;
  fatalities?: number;
  index_smoothed?: number;
  escalation_index?: number;
  monthKey?: string;
};

function EscalationChartTooltip({
  active,
  payload,
  label,
  data,
}: {
  active?: boolean;
  payload?: Array<{ payload: ChartPayloadPoint }>;
  label?: string;
  data?: EscalationApiResponse | null;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  if (!point) return null;
  const monthKey = point.event_month?.slice(0, 7) ?? point.monthKey ?? "";
  const isFlagged = data?.escalationFlaggedMonths.includes(monthKey);
  const isPre = data?.preEscalationMonths.includes(monthKey);
  const monthLabel = label ?? point.dateLabel ?? point.event_month ?? "";
  return (
    <div className="escalation-tooltip">
      <div className="escalation-tooltip-title">Escalation Index</div>
      <div className="escalation-tooltip-month">{monthLabel}</div>
      {(isFlagged || isPre) && (
        <div
          className="escalation-tooltip-status"
          style={{
            background: isFlagged ? "rgba(239, 68, 68, 0.2)" : "rgba(249, 115, 22, 0.2)",
            color: isFlagged ? "#ef4444" : "#f97316",
          }}
        >
          {isFlagged ? "Escalation flagged" : "Pre-escalation warning"}
        </div>
      )}
      <div className="escalation-tooltip-index">
        Escalation Index: <strong>{point.index_smoothed != null ? point.index_smoothed.toFixed(1) : "—"}</strong>
      </div>
      <div className="escalation-tooltip-rows">
        <div className="escalation-tooltip-row"><span>Battles</span><strong>{(point.battles ?? 0).toLocaleString()}</strong></div>
        <div className="escalation-tooltip-row"><span>Explosions</span><strong>{(point.explosions_remote_violence ?? 0).toLocaleString()}</strong></div>
        <div className="escalation-tooltip-row"><span>Strategic devs</span><strong>{(point.strategic_developments ?? 0).toLocaleString()}</strong></div>
        <div className="escalation-tooltip-row"><span>Protests</span><strong>{(point.protests ?? 0).toLocaleString()}</strong></div>
        <div className="escalation-tooltip-row"><span>Riots</span><strong>{(point.riots ?? 0).toLocaleString()}</strong></div>
        <div className="escalation-tooltip-row"><span>Civ. violence</span><strong>{(point.violence_against_civilians ?? 0).toLocaleString()}</strong></div>
        <div className="escalation-tooltip-row"><span>Fatalities</span><strong>{(point.fatalities ?? 0).toLocaleString()}</strong></div>
      </div>
    </div>
  );
}

export default function EscalationPage() {
  const { savedPlot, savePlot, clearPlot } = useEscalationPlot();
  const [country, setCountry] = useState("");
  const [smooth, setSmooth] = useState(3);
  const [threshold, setThreshold] = useState(45);
  const [startDate, setStartDate] = useState(DEFAULT_START);
  const [endDate, setEndDate] = useState(DEFAULT_END);
  const [showComponents, setShowComponents] = useState(false);
  const [drillMonth, setDrillMonth] = useState<string | null>(null);
  const [data, setData] = useState<EscalationApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressFetched, setProgressFetched] = useState<number | undefined>(undefined);
  const [progressTotal, setProgressTotal] = useState<number | undefined>(undefined);
  const [showCompleted, setShowCompleted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [monthDropdownOpen, setMonthDropdownOpen] = useState(false);
  const [drillBarsVisible, setDrillBarsVisible] = useState(false);
  const [countrySuggestionsOpen, setCountrySuggestionsOpen] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [eventsResult, setEventsResult] = useState<string | null>(null);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [sentinelOpen, setSentinelOpen] = useState(false);
  const [sentinelQuestion, setSentinelQuestion] = useState("");
  const [sentinelAnswer, setSentinelAnswer] = useState<string | null>(null);
  const [sentinelLoading, setSentinelLoading] = useState(false);
  const [sentinelError, setSentinelError] = useState<string | null>(null);
  const [syncLabel, setSyncLabel] = useState<string | undefined>();
  const monthDropdownRef = useRef<HTMLDivElement>(null);
  const countryInputRef = useRef<HTMLDivElement>(null);
  const prefetchCacheRef = useRef<Map<string, EscalationPrefetchEntry>>(new Map());
  const [prefetchStatus, setPrefetchStatus] = useState<"idle" | "warming" | "ready">("idle");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const q = new URLSearchParams(window.location.search).get("country");
    if (q) setCountry(decodeURIComponent(q));
  }, []);

  useEffect(() => {
    if (savedPlot) {
      setData(savedPlot.data);
      setCountry(savedPlot.country);
      setStartDate(savedPlot.startDate);
      setEndDate(savedPlot.endDate);
      setThreshold(savedPlot.threshold);
      setSmooth(savedPlot.smooth);
      setShowComponents(savedPlot.showComponents);
      setError(null);
    }
  }, [savedPlot]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (monthDropdownRef.current && !monthDropdownRef.current.contains(e.target as Node)) {
        setMonthDropdownOpen(false);
      }
    }
    if (monthDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [monthDropdownOpen]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (countryInputRef.current && !countryInputRef.current.contains(e.target as Node)) {
        setCountrySuggestionsOpen(false);
      }
    }
    if (countrySuggestionsOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [countrySuggestionsOpen]);

  useEffect(() => {
    const revealObs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("visible");
          } else {
            e.target.classList.remove("visible");
          }
        });
      },
      { threshold: 0.12 }
    );
    document.querySelectorAll(".escalation-page .reveal").forEach((el) => revealObs.observe(el));
    return () => revealObs.disconnect();
  }, [data, loading]);

  useEffect(() => {
    if (!showCompleted) return;
    const t = setTimeout(() => setShowCompleted(false), 500);
    return () => clearTimeout(t);
  }, [showCompleted]);

  function commitEscalationData(json: EscalationApiResponse, c: string) {
    setData(json);
    setDrillMonth(null);
    setAiSummary(null);
    setAiError(null);
    setEventsResult(null);
    setEventsError(null);
    setSentinelAnswer(null);
    setSentinelError(null);
    savePlot({
      data: json,
      country: c,
      startDate,
      endDate,
      threshold,
      smooth,
      showComponents,
    });
    setSyncLabel(
      `Series loaded ${new Date().toLocaleString("en-US", {
        timeZone: "America/New_York",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      })} EST`
    );
    setProgress(100);
    setLoading(false);
    setShowCompleted(true);
  }

  useEffect(() => {
    const c = country.trim();
    if (!c) {
      setPrefetchStatus("idle");
      return;
    }
    const url = buildEscalationApiUrl({
      country: c,
      smooth,
      threshold,
      startDate,
      endDate,
      instant: true,
    });
    setPrefetchStatus("warming");
    const timer = window.setTimeout(() => {
      const existing = prefetchCacheRef.current.get(url);
      if (existing?.data) {
        setPrefetchStatus("ready");
        return;
      }
      if (existing?.promise) return;

      const promise = fetch(url)
        .then((res) => readEscalationApiResponse(res))
        .then(async (json) => {
          if (json) return json;
          await new Promise((resolve) => window.setTimeout(resolve, 1800));
          const retry = await fetch(url);
          return readEscalationApiResponse(retry);
        })
        .then((json) => {
          const entry = prefetchCacheRef.current.get(url);
          if (json && entry) {
            entry.data = json;
            setPrefetchStatus("ready");
          } else {
            setPrefetchStatus("warming");
          }
          return json;
        })
        .catch(() => {
          setPrefetchStatus("idle");
          return null;
        });
      prefetchCacheRef.current.set(url, { promise });
    }, 650);
    return () => window.clearTimeout(timer);
  }, [country, smooth, threshold, startDate, endDate]);

  async function loadData() {
    const c = country.trim();
    if (!c) return;
    const hadData = Boolean(data);
    setLoading(true);
    setError(null);
    setProgress(0);
    setProgressFetched(undefined);
    setProgressTotal(undefined);
    try {
      const instantUrl = buildEscalationApiUrl({
        country: c,
        smooth,
        threshold,
        startDate,
        endDate,
        instant: true,
      });
      const prefetched = prefetchCacheRef.current.get(instantUrl);
      if (prefetched?.data) {
        commitEscalationData(prefetched.data, c);
        return;
      }

      if (prefetched?.promise) {
        const json = await prefetched.promise;
        if (json) {
          commitEscalationData(json, c);
          return;
        }
      }

      const liveUrl = buildEscalationApiUrl({
        country: c,
        smooth,
        threshold,
        startDate,
        endDate,
      });
      const res = await fetch(liveUrl);
      const json = await readEscalationApiResponse(res, (msg) => {
        if (typeof msg.pct === "number") setProgress(msg.pct);
        if (typeof msg.fetched === "number") setProgressFetched(msg.fetched);
        if (typeof msg.total === "number") setProgressTotal(msg.total);
      });
      if (!json) {
        setError("Escalation data is warming. Try again in a moment.");
        if (!hadData) setData(null);
        setLoading(false);
        setProgress(100);
        return;
      }
      commitEscalationData(json, c);
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : "Failed to load escalation index.");
      if (!hadData) setData(null);
      setLoading(false);
      setProgress(100);
    }
  }

  const chartData = useMemo(() => {
    if (!data?.series?.length) return [];
    const flaggedSet = new Set(data.escalationFlaggedMonths);
    const preSet = new Set(data.preEscalationMonths);
    const main = data.series.map((d, i) => {
      const monthKey = d.event_month.slice(0, 7);
      const isLast = i === data.series.length - 1;
      return {
        ...d,
        dateLabel: formatMonthLabel(d.event_month.slice(0, 7)),
        monthKey,
        escalationFlagged: flaggedSet.has(monthKey) ? d.index_smoothed : null,
        preEscalation: preSet.has(monthKey) ? d.index_smoothed : null,
        projected_index: isLast && data.forecast?.length ? d.index_smoothed : (null as number | null),
      };
    });
    if (data.forecast?.length && main.length > 0) {
      const forecastPoints = data.forecast.map((f) => ({
        dateLabel: formatMonthLabel(f.event_month.slice(0, 7)),
        index_smoothed: null as number | null,
        escalation_index: null as number | null,
        escalationFlagged: null as number | null,
        preEscalation: null as number | null,
        projected_index: f.projected_index,
        monthKey: "",
      }));
      return [...main, ...forecastPoints];
    }
    return main;
  }, [data]);

  const componentBreakdownData = useMemo(() => {
    if (!data?.series?.length) return [];
    return data.series.map((d) => ({
      dateLabel: formatMonthLabel(d.event_month.slice(0, 7)),
      "Conflict intensity (30%)": d.c_intensity * 30,
      "Event accel. (20%)": d.c_accel * 20,
      "Explosions (20%)": d.c_explosion * 20,
      "Strategic devs (15%)": d.c_strategic * 15,
      "Unrest (10%)": d.c_unrest * 10,
      "Civilian targeting (5%)": d.c_civilian * 5,
    }));
  }, [data]);

  const drillOptions = useMemo(() => {
    if (!data?.series?.length) return [];
    const flaggedSet = new Set(data.escalationFlaggedMonths);
    const preSet = new Set(data.preEscalationMonths);
    return data.series.map((d) => {
      const monthKey = d.event_month.slice(0, 7);
      const label = new Date(d.event_month).toLocaleDateString("en-US", {
        month: "short",
        year: "numeric",
      });
      let status: "flagged" | "pre" | "none" = "none";
      let suffix = "";
      if (flaggedSet.has(monthKey)) {
        status = "flagged";
        suffix = " — escalation flagged";
      } else if (preSet.has(monthKey)) {
        status = "pre";
        suffix = " — pre-escalation warning";
      }
      return { value: monthKey, label, status, suffix };
    });
  }, [data]);

  const drillRow = useMemo(() => {
    if (!drillMonth || !data?.series?.length) return null;
    return data.series.find((d) => d.event_month.slice(0, 7) === drillMonth) ?? null;
  }, [data, drillMonth]);

  useEffect(() => {
    if (drillRow) {
      setDrillBarsVisible(false);
      const t = setTimeout(() => setDrillBarsVisible(true), 80);
      return () => clearTimeout(t);
    } else {
      setDrillBarsVisible(false);
    }
  }, [drillRow]);

  const thresholdNum = Math.max(0, Math.min(100, threshold));

  function handleCancel() {
    clearPlot();
    setData(null);
    setError(null);
    setAiSummary(null);
    setAiError(null);
    setEventsResult(null);
    setEventsError(null);
    setSentinelOpen(false);
    setSentinelQuestion("");
    setSentinelAnswer(null);
    setSentinelError(null);
    setDrillMonth(null);
    setCountry("");
    setStartDate(DEFAULT_START);
    setEndDate(DEFAULT_END);
    setThreshold(45);
    setSmooth(3);
    setShowComponents(false);
  }

  async function fetchAiSummary() {
    if (!data) return;
    setAiLoading(true);
    setAiError(null);
    setEventsResult(null);
    setEventsError(null);
    setSentinelAnswer(null);
    setSentinelError(null);
    try {
      const prompt = `${buildPlotContext()}

Please summarize and explain this escalation index plot in 3–5 sentences. Tie the trend to plausible real-world drivers and be explicit about uncertainty.`;
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, mode: "country_trend", maxTokens: 400 }),
      });
      const json = (await res.json()) as { content?: string; error?: string };
      if (!res.ok || json.error) {
        setAiError(json.error ?? "Failed to generate summary.");
        setAiSummary(null);
      } else {
        setAiSummary(json.content ?? "");
        setAiError(null);
      }
    } catch (e) {
      console.error(e);
      setAiError("Failed to generate summary. Please try again.");
      setAiSummary(null);
    } finally {
      setAiLoading(false);
    }
  }

  function buildPlotContext(): string {
    if (!data) return "";
    const s = data.series;
    const first = s[0];
    const last = s[s.length - 1];
    const peak = [...s].sort((a, b) => (b.index_smoothed ?? 0) - (a.index_smoothed ?? 0))[0];
    return `Country: ${country.trim()}
Date range: ${startDate} to ${endDate}
Escalation threshold: ${data.escalationThreshold}

Plot summary:
- ${data.series.length} months of data
- First month (${first?.event_month?.slice(0, 7)}): smoothed index ${first?.index_smoothed?.toFixed(1) ?? "—"}
- Last month (${last?.event_month?.slice(0, 7)}): smoothed index ${last?.index_smoothed?.toFixed(1) ?? "—"}
- Peak month: ${peak?.event_month?.slice(0, 7)} with index ${peak?.index_smoothed?.toFixed(1) ?? "—"}
- Escalation-flagged months: ${data.escalationFlaggedMonths.join(", ")}
- Pre-escalation warning months: ${data.preEscalationMonths.join(", ")}
- Total recorded fatalities: ${data.series.reduce((sum, r) => sum + (r.fatalities ?? 0), 0).toLocaleString()}
${data.forecast?.length ? `- 3-month forecast: next projected index ${data.forecast[0]?.projected_index?.toFixed(1) ?? "—"}` : ""}`;
  }

  async function fetchEvents() {
    if (!data) return;
    setEventsLoading(true);
    setEventsError(null);
    setAiSummary(null);
    setAiError(null);
    setSentinelAnswer(null);
    setSentinelError(null);
    try {
      const prompt = `${buildPlotContext()}

List real-world events during this timeframe that led to major escalation spikes. For each pre-escalation warning month listed above, explain what specific events or actor activities preceded and justified that flag (e.g. Hamas buildup before Oct 7). Also justify the trend forecast with events if applicable.`;
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, mode: "plot_events", maxTokens: 800 }),
      });
      const json = (await res.json()) as { content?: string; error?: string };
      if (!res.ok || json.error) {
        setEventsError(json.error ?? "Failed to generate events.");
        setEventsResult(null);
      } else {
        setEventsResult(json.content ?? "");
        setEventsError(null);
      }
    } catch (e) {
      console.error(e);
      setEventsError("Failed to generate events. Please try again.");
      setEventsResult(null);
    } finally {
      setEventsLoading(false);
    }
  }

  async function fetchSentinelAnswer() {
    if (!data || !sentinelQuestion.trim()) return;
    setSentinelLoading(true);
    setSentinelError(null);
    setAiSummary(null);
    setAiError(null);
    setEventsResult(null);
    setEventsError(null);
    const q = sentinelQuestion.trim();
    try {
      const prompt = `${buildPlotContext()}

User question: ${q}`;
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, mode: "sentinel_qa", maxTokens: 500 }),
      });
      const json = (await res.json()) as { content?: string; error?: string };
      if (!res.ok || json.error) {
        setSentinelError(json.error ?? "Failed to get answer.");
        setSentinelAnswer(null);
      } else {
        setSentinelAnswer(json.content ?? "");
        setSentinelError(null);
      }
    } catch (e) {
      console.error(e);
      setSentinelError("Failed to get answer. Please try again.");
      setSentinelAnswer(null);
    } finally {
      setSentinelLoading(false);
    }
  }

  return (
    <div className="escalation-page min-h-screen text-[#e2e8f0]">
      <BackgroundVideo
        src="/mov2.mp4"
        containerClassName="escalation-page-video-wrap"
        overlayClassName="escalation-page-video-overlay"
        videoClassName="escalation-page-video"
        posterSrc="/satellite-earth.png"
      />
      <MarketingNav />
      <main className="relative z-10 pt-6">
        <div className="section !pb-8 !pt-10">
          <AppCommandBar
            showBrand={false}
            title="Escalation Index"
            syncLabel={syncLabel ?? "Run generate to load series"}
            onRefresh={() => {
              if (country.trim()) void loadData();
            }}
            onHelp={() =>
              document.getElementById("escalation-help")?.scrollIntoView({ behavior: "smooth", block: "start" })
            }
            trailingSlot={
              data ? (
                <StatusChip variant="live">Live</StatusChip>
              ) : (
                <StatusChip variant="limited">Awaiting data</StatusChip>
              )
            }
          />
        </div>

        <section>
          <div className="section">
            <SectionHeader
              className="reveal"
              eyebrow="Demo"
              title="Escalation Index"
              description={
                <>
                  Choose a country and date range. Historical series span 2018 through roughly one year before today
                  (research-tier aggregates). See{" "}
                  <Link href="/data" className="text-slate-400 underline hover:text-white">
                    Data &amp; sources
                  </Link>{" "}
                  for coverage detail.
                </>
              }
            />
          </div>
        </section>

        <div className="divider" />

        <section>
          <div className="section">
            <SectionHeader
              className="reveal"
              eyebrow="Parameters"
              title="Choose country & date range"
              description="Depending on the date range, computing the index may take several seconds to minutes while large monthly event aggregates are loaded and processed."
              showDivider
            />
            <div className="controls-grid reveal">
              <div className="control-field" ref={countryInputRef}>
                <label className="control-field-label" htmlFor="escalation-country-input">
                  <span className="control-label">Country (exact match)</span>
                </label>
                <div className="escalation-country-wrap">
                  <input
                    id="escalation-country-input"
                    value={country}
                    onChange={(e) => {
                      setCountry(e.target.value);
                      setCountrySuggestionsOpen(true);
                    }}
                    onFocus={() => setCountrySuggestionsOpen(true)}
                    placeholder="e.g. Israel, Ukraine"
                    className="control-input"
                    autoComplete="off"
                  />
                  {countrySuggestionsOpen && (
                    <div className="escalation-country-suggestions" role="listbox">
                      {suggestCountries(country, 12).map((name) => (
                        <button
                          key={name}
                          type="button"
                          role="option"
                          className="escalation-country-option"
                          onClick={() => {
                            setCountry(name);
                            setCountrySuggestionsOpen(false);
                          }}
                        >
                          {name}
                        </button>
                      ))}
                      {suggestCountries(country, 12).length === 0 && (
                        <div className="escalation-country-option escalation-country-option-empty">
                          No countries match
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <label className="control-field">
                <span className="control-label">Alert threshold (0–100) <span className="control-hint">(recommended: keep default)</span></span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={threshold}
                  onChange={(e) =>
                    setThreshold(Math.max(0, Math.min(100, Number(e.target.value) || 45)))
                  }
                  className="control-input control-input-narrow"
                />
              </label>
              <label className="control-field">
                <span className="control-label">Smoothing (months) <span className="control-hint">(recommended: keep default)</span></span>
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={smooth}
                  onChange={(e) =>
                    setSmooth(Math.min(12, Math.max(1, Number(e.target.value) || 3)))
                  }
                  className="control-input control-input-narrow"
                />
              </label>
              <div className="control-actions">
                <button
                  type="button"
                  onClick={() => loadData()}
                  disabled={loading || !country.trim()}
                  className="btn-primary escalation-generate-btn"
                >
                  {loading
                    ? "Computing…"
                    : prefetchStatus === "ready"
                      ? "Generate plot (ready)"
                      : "Generate plot"}
                </button>
                {country.trim() && !loading && (
                  <span className="control-label" style={{ alignSelf: "center" }}>
                    {prefetchStatus === "ready" ? "Instant cache ready" : "Preparing cache"}
                  </span>
                )}
                <Link href="/limitations" className="escalation-limitations-link">
                  Limitations →
                </Link>
              </div>
              <label className="control-field control-field-dates">
                <span className="control-label">From</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="control-input"
                />
              </label>
              <label className="control-field control-field-dates">
                <span className="control-label">To (default: 1 year ago)</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="control-input"
                />
              </label>
              <label className="control-field control-field-checkbox">
                <input
                  type="checkbox"
                  checked={showComponents}
                  onChange={(e) => setShowComponents(e.target.checked)}
                  className="control-checkbox"
                />
                <span className="control-label-inline">Show component breakdown</span>
              </label>
            </div>
            {(loading || showCompleted) && (
              <div className="flex flex-wrap gap-3" style={{ marginTop: 40 }}>
                <div className="escalation-loading-card escalation-loading-inline">
                  <p className="escalation-loading-label">
                    {showCompleted
                      ? "Completed!"
                      : progressFetched != null
                        ? progressTotal != null
                          ? `Computing index… ${Math.round(progress)}% (${progressFetched.toLocaleString()} of ${progressTotal.toLocaleString()} events)`
                          : `Computing index… ${Math.round(progress)}% (${progressFetched.toLocaleString()} events loaded)`
                        : `Computing index… ${Math.round(progress)}%`}
                  </p>
                  <div className="escalation-progress-track">
                    <div
                      className="escalation-progress-fill"
                      style={{ width: `${Math.min(progress, 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            )}
            {chartData.length > 0 && data && !loading && !showCompleted && (
              <div className="flex flex-wrap gap-3" style={{ marginTop: 40 }}>
                <button
                  type="button"
                  className="btn-primary escalation-view-graph-btn"
                  onClick={() => {
                    document.getElementById("escalation-chart")?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                >
                  View Graph
                </button>
                <button
                  type="button"
                  className="btn-secondary escalation-cancel-btn"
                  onClick={handleCancel}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </section>

        {chartData.length > 0 && data && (
          <>
            <section id="escalation-chart">
              <div className="section reveal">
                <ChartFrame
                  title={
                    <>
                      AEGIS Escalation Index — <span className="text-white">{country.trim()}</span>
                    </>
                  }
                  subtitle={
                    data?.dataSource ? (
                      <>
                        Data source: {data.dataSource}
                        {data.series.length > 0 ? ` · ${data.series.length} country-month rows` : ""}
                        {data.datasetVersion ? ` · dataset ${data.datasetVersion}` : ""}
                        {data.cache
                          ? ` · cache ${data.cache.status} (${Math.round(data.cache.ageMs / 1000)}s old)`
                          : ""}
                        {data.perf ? ` · ${Math.round(data.perf.totalMs)}ms` : ""}
                      </>
                    ) : undefined
                  }
                  footer={
                    <TransparencyModule
                      className="mt-4"
                      items={[
                        <>
                          Monthly country aggregates through the selected end date (typically one year before today),
                          from researcher-tier historical conflict data.
                        </>,
                        <>Forecast band reflects a simple trend projection from the last six smoothed points — not a
                          calibrated prediction model.</>,
                        <>Alert threshold and smoothing window materially change which months appear flagged.</>,
                      ]}
                    />
                  }
                >
              <div className="h-[480px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    key={`escalation-${data.series.length}-${data.forecast?.length ?? 0}`}
                    data={chartData}
                    margin={{ top: 12, right: 100, left: 8, bottom: 8 }}
                  >
                    <defs>
                      <linearGradient id="idxFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.45} />
                        <stop offset="95%" stopColor="#60a5fa" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="dateLabel"
                      tick={{ fontSize: 10, fill: "#94a3b8" }}
                    />
                    <YAxis
                      domain={[0, 105]}
                      tick={{ fontSize: 10, fill: "#94a3b8" }}
                      label={{
                        value: "Escalation Index (0–100)",
                        angle: -90,
                        position: "insideLeft",
                        style: { fill: "#94a3b8", fontSize: 10 },
                      }}
                    />
                    <Tooltip content={<EscalationChartTooltip data={data} />} />
                    <ReferenceLine
                      y={thresholdNum}
                      stroke="#ef4444"
                      strokeDasharray="4 4"
                      strokeWidth={1.5}
                      label={{ value: `Alert (${thresholdNum})`, position: "right", fill: "#ef4444", fontSize: 11 }}
                    />
                    <Area
                      type="monotone"
                      dataKey="index_smoothed"
                      name={`Escalation Index (${smooth}-mo smoothed)`}
                      stroke="#60a5fa"
                      strokeWidth={2.5}
                      fill="url(#idxFill)"
                      isAnimationActive
                      animationDuration={1200}
                      animationEasing="ease-out"
                    />
                    <Line
                      type="monotone"
                      dataKey="escalation_index"
                      name="Raw index (monthly)"
                      stroke="#60a5fa"
                      strokeOpacity={0.35}
                      strokeWidth={1}
                      dot={false}
                      isAnimationActive
                      animationDuration={1200}
                      animationEasing="ease-out"
                    />
                    <Line
                      type="monotone"
                      dataKey="escalationFlagged"
                      name={`Escalation flagged (${data.escalationFlaggedMonths.length} months)`}
                      stroke="none"
                      dot={{ r: 5, fill: "#ef4444" }}
                      connectNulls
                    />
                    <Line
                      type="monotone"
                      dataKey="preEscalation"
                      name={`Pre-escalation warning (${data.preEscalationMonths.length} months)`}
                      stroke="none"
                      dot={(props) => <DiamondDot {...props} />}
                      connectNulls
                    />
                    {data.forecast?.length ? (
                      <Line
                        type="monotone"
                        dataKey="projected_index"
                        name="3-month forecast"
                        stroke="#a78bfa"
                        strokeWidth={2.5}
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
                      formatter={(value: string) => {
                        if (value.startsWith("Escalation flagged")) {
                          return (
                            <span className="text-[#e2e8f0]">
                              <span className="legend-icon-red-circle" />
                              {value}
                            </span>
                          );
                        }
                        if (value.startsWith("Pre-escalation warning")) {
                          return (
                            <span className="text-[#e2e8f0]">
                              <span className="legend-icon-orange-triangle" />
                              {value}
                            </span>
                          );
                        }
                        return <span className="text-[#e2e8f0]">{value}</span>;
                      }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <button
                type="button"
                className="btn-secondary"
                style={{ fontSize: 12, padding: "8px 16px" }}
                onClick={() => document.getElementById("ai-summary")?.scrollIntoView({ behavior: "smooth", block: "start" })}
              >
                View AI Analysis
              </button>
              {data.series.length >= 2 ? (
                <ComparisonLayout
                  className="mt-8"
                  title="Latest two months in this window"
                  leftTitle={formatMonthLabel(data.series[data.series.length - 2]!.event_month.slice(0, 7))}
                  rightTitle={formatMonthLabel(data.series[data.series.length - 1]!.event_month.slice(0, 7))}
                  left={
                    <div className="space-y-2 text-sm text-slate-300">
                      <p>
                        Smoothed index:{" "}
                        <strong className="text-white">
                          {data.series[data.series.length - 2]!.index_smoothed.toFixed(1)}
                        </strong>
                      </p>
                      <p>Events: {data.series[data.series.length - 2]!.total_events.toLocaleString()}</p>
                      <p>Fatalities: {data.series[data.series.length - 2]!.fatalities.toLocaleString()}</p>
                    </div>
                  }
                  right={
                    <div className="space-y-2 text-sm text-slate-300">
                      <p>
                        Smoothed index:{" "}
                        <strong className="text-white">
                          {data.series[data.series.length - 1]!.index_smoothed.toFixed(1)}
                        </strong>
                      </p>
                      <p>Events: {data.series[data.series.length - 1]!.total_events.toLocaleString()}</p>
                      <p>Fatalities: {data.series[data.series.length - 1]!.fatalities.toLocaleString()}</p>
                    </div>
                  }
                />
              ) : null}
                </ChartFrame>
              </div>
            </section>

            {showComponents && componentBreakdownData.length > 0 && (
              <>
                <div className="divider" />
                <section>
                  <div className="section reveal">
                    <ChartFrame
                      title="Index component breakdown"
                      subtitle="Weighted contribution per month (methodology weights)"
                    >
                <div className="h-[280px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={componentBreakdownData}
                      margin={{ top: 8, right: 8, left: 8, bottom: 24 }}
                    >
                      <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} />
                      <XAxis
                        dataKey="dateLabel"
                        tick={{ fontSize: 9, fill: "#94a3b8" }}
                      />
                      <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} />
                      <Tooltip
                        contentStyle={{ backgroundColor: "#020617", borderColor: "#1e293b", borderRadius: 8, fontSize: 11 }}
                      />
                      <Bar dataKey="Conflict intensity (30%)" stackId="a" fill="#ef4444" isAnimationActive animationDuration={1000} animationEasing="ease-out" />
                      <Bar dataKey="Event accel. (20%)" stackId="a" fill="#f59e0b" isAnimationActive animationDuration={1000} animationEasing="ease-out" />
                      <Bar dataKey="Explosions (20%)" stackId="a" fill="#f97316" isAnimationActive animationDuration={1000} animationEasing="ease-out" />
                      <Bar dataKey="Strategic devs (15%)" stackId="a" fill="#60a5fa" isAnimationActive animationDuration={1000} animationEasing="ease-out" />
                      <Bar dataKey="Unrest (10%)" stackId="a" fill="#a78bfa" isAnimationActive animationDuration={1000} animationEasing="ease-out" />
                      <Bar dataKey="Civilian targeting (5%)" stackId="a" fill="#fde047" isAnimationActive animationDuration={1000} animationEasing="ease-out" />
                      <Legend formatter={(v) => <span className="text-[#e2e8f0] text-xs">{v}</span>} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                    </ChartFrame>
                  </div>
                </section>
              </>
            )}

            <div className="divider" />
            <section id="escalation-help">
              <div className="section escalation-how-to-read reveal">
                <SectionHeader
                  eyebrow="Legend"
                  title="How to read the signals"
                  showDivider
                />
                <ul className="escalation-signals-list">
                  <li><span className="font-semibold text-[#60a5fa]">Blue line</span> — smoothed escalation index (0–100) combining six conflict indicators.</li>
                  <li><span className="font-semibold text-[#ef4444]">Red dots</span> — months where the index exceeded your alert threshold.</li>
                  <li><span className="font-semibold text-[#f97316]">Orange diamonds</span> — pre-escalation warnings when leading indicators spike before the index crosses the threshold.</li>
                  <li><span className="font-semibold text-[#a78bfa]">Purple dotted line</span> — 3-month forecast from the last 6 months.</li>
                </ul>
              </div>
            </section>

            <div className="divider" />
            <section id="ai-summary">
              <div className="section escalation-chart-card reveal">
                <p className="section-tag">AI Summary</p>
                <h2>Explain the plot</h2>
                <p className="escalation-control-note" style={{ marginBottom: 16 }}>
                  Get AI-generated summaries and explanations grounded in the plot data and real-world events.
                </p>
                <div className="flex flex-wrap gap-3 mb-4">
                  <button
                    type="button"
                    onClick={fetchAiSummary}
                    disabled={aiLoading}
                    className="btn-secondary"
                  >
                    {aiLoading ? "Generating…" : "Generate AI summary"}
                  </button>
                  <button
                    type="button"
                    onClick={fetchEvents}
                    disabled={eventsLoading}
                    className="btn-secondary"
                  >
                    {eventsLoading ? "Generating…" : "Events"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSentinelOpen((o) => !o)}
                    className="btn-secondary"
                  >
                    {sentinelOpen ? "Hide" : "Ask Aegis Sentinel Why"}
                  </button>
                </div>
                {sentinelOpen && (
                  <div className="mb-4">
                    <textarea
                      value={sentinelQuestion}
                      onChange={(e) => setSentinelQuestion(e.target.value)}
                      placeholder="Ask a question about the plot, e.g. Why did the index spike in 2022?"
                      className="control-input w-full min-h-[80px] resize-y mb-2"
                      rows={3}
                    />
                    <button
                      type="button"
                      onClick={fetchSentinelAnswer}
                      disabled={sentinelLoading || !sentinelQuestion.trim()}
                      className="btn-primary"
                    >
                      {sentinelLoading ? "Thinking…" : "Ask"}
                    </button>
                  </div>
                )}
                {(aiError || eventsError || sentinelError) && (
                  <p className="escalation-error" style={{ marginTop: 0 }}>
                    {aiError || eventsError || sentinelError}
                  </p>
                )}
                {aiSummary && (
                  <div
                    className="escalation-ai-summary mb-4"
                    style={{
                      padding: "16px 20px",
                      background: "rgba(15, 23, 42, 0.6)",
                      borderRadius: 8,
                      border: "1px solid rgba(255,255,255,0.08)",
                      fontSize: 14,
                      lineHeight: 1.6,
                      color: "#e2e8f0",
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {aiSummary}
                  </div>
                )}
                {eventsResult && (
                  <div
                    className="escalation-events-result mb-4"
                    style={{
                      padding: "16px 20px",
                      background: "rgba(15, 23, 42, 0.6)",
                      borderRadius: 8,
                      border: "1px solid rgba(255,255,255,0.08)",
                      fontSize: 14,
                      lineHeight: 1.6,
                      color: "#e2e8f0",
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {eventsResult}
                  </div>
                )}
                {sentinelAnswer && (
                  <div
                    className="escalation-sentinel-answer"
                    style={{
                      padding: "16px 20px",
                      background: "rgba(15, 23, 42, 0.6)",
                      borderRadius: 8,
                      border: "1px solid rgba(255,255,255,0.08)",
                      fontSize: 14,
                      lineHeight: 1.6,
                      color: "#e2e8f0",
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {sentinelAnswer}
                  </div>
                )}
              </div>
            </section>

            <div className="divider" />
            <section>
              <div className="section escalation-chart-card reveal">
                <p className="section-tag">Drill down</p>
                <h2>What drove a specific month?</h2>
              <div className={`escalation-month-dropdown${monthDropdownOpen ? " is-open" : ""}`} ref={monthDropdownRef}>
                <button
                  type="button"
                  className="escalation-month-trigger"
                  onClick={() => setMonthDropdownOpen((o) => !o)}
                  aria-haspopup="listbox"
                  aria-expanded={monthDropdownOpen}
                >
                  <span>
                    {drillMonth
                      ? (() => {
                          const opt = drillOptions.find((o) => o.value === drillMonth);
                          return opt ? `${opt.label}${opt.suffix}` : "Select a month…";
                        })()
                      : "Select a month…"}
                  </span>
                  <span aria-hidden>{monthDropdownOpen ? "▲" : "▼"}</span>
                </button>
                {monthDropdownOpen && (
                  <div className="escalation-month-options" role="listbox">
                    <button
                      type="button"
                      role="option"
                      className="escalation-month-option"
                      onClick={() => {
                        setDrillMonth(null);
                        setMonthDropdownOpen(false);
                      }}
                    >
                      <span className="escalation-month-option-icon none" aria-hidden />
                      Select a month…
                    </button>
                    {drillOptions.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        role="option"
                        className="escalation-month-option"
                        onClick={() => {
                          setDrillMonth(opt.value);
                          setMonthDropdownOpen(false);
                        }}
                      >
                        <span
                          className={`escalation-month-option-icon ${opt.status === "flagged" ? "flagged" : opt.status === "pre" ? "pre" : "none"}`}
                          aria-hidden
                        />
                        {opt.label}{opt.suffix}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {drillRow && (
                <div className="space-y-4 text-sm">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-semibold text-white">
                      {new Date(drillRow.event_month).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                    </span>
                    {data.escalationFlaggedMonths.includes(drillRow.event_month.slice(0, 7)) ? (
                      <span className="rounded bg-[#ef4444] px-2 py-0.5 text-xs font-bold text-white">
                        ESCALATION FLAGGED
                      </span>
                    ) : data.preEscalationMonths.includes(drillRow.event_month.slice(0, 7)) ? (
                      <span className="rounded bg-[#f97316] px-2 py-0.5 text-xs font-bold text-white">
                        PRE-ESCALATION WARNING
                      </span>
                    ) : (
                      <span className="rounded bg-[#334155] px-2 py-0.5 text-xs text-[#94a3b8]">
                        BELOW THRESHOLD
                      </span>
                    )}
                    <span className="text-[#94a3b8]">
                      Index: <strong className="text-white">{drillRow.escalation_index.toFixed(1)}</strong> (smoothed: <strong className="text-white">{drillRow.index_smoothed.toFixed(1)}</strong>)
                    </span>
                  </div>
                  <div className={`escalation-drill-method-grid ${drillBarsVisible ? "escalation-drill-bars-visible" : ""}`}>
                    {[
                      { key: "battles", label: "Battles", color: "#ef4444", weight: 30, desc: "Direct armed confrontations." },
                      { key: "explosions_remote_violence", label: "Explosions / Remote violence", color: "#f97316", weight: 20, desc: "Shelling, airstrikes, IEDs. Often precedes ground battles." },
                      { key: "strategic_developments", label: "Strategic developments", color: "#60a5fa", weight: 15, desc: "Troop movements, ceasefires, territorial shifts." },
                      { key: "protests", label: "Protests", color: "#a78bfa", weight: 10, desc: "Non-violent demonstrations." },
                      { key: "riots", label: "Riots", color: "#fde047", weight: 10, desc: "Violent demonstrations, looting." },
                      { key: "violence_against_civilians", label: "Violence vs. civilians", color: "#f59e0b", weight: 5, desc: "Targeted attacks on non-combatants." },
                    ].map(({ key, label, color, weight, desc }) => {
                      const count = Number((drillRow as Record<string, unknown>)[key]) || 0;
                      const maxCount = Math.max(
                        1,
                        drillRow.battles,
                        drillRow.explosions_remote_violence,
                        drillRow.strategic_developments,
                        drillRow.protests,
                        drillRow.riots,
                        drillRow.violence_against_civilians
                      );
                      const pct = Math.round((count / maxCount) * 100);
                      return (
                        <div
                          key={key}
                          className="escalation-drill-method-item"
                          style={{ borderLeftColor: color, borderLeftWidth: "2px", borderLeftStyle: "solid" }}
                        >
                          <span className="escalation-drill-method-weight" style={{ color }}>
                            <AnimatedMethodWeight value={weight} />
                          </span>
                          <div className="escalation-drill-method-inner">
                            <div className="escalation-drill-method-name">
                              {label} — <span className="text-[#94a3b8] font-normal">{count.toLocaleString()} events</span>
                            </div>
                            <div className="escalation-drill-method-bar-track">
                              <div
                                className="escalation-drill-method-bar-fill"
                                style={{ width: `${pct}%`, backgroundColor: color }}
                              />
                            </div>
                            <p className="escalation-drill-method-desc">{desc}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex gap-8 pt-2 text-sm">
                    <span className="text-[#94a3b8]">Total events: <strong className="text-white">{drillRow.total_events?.toLocaleString() ?? "—"}</strong></span>
                    <span className="text-[#94a3b8]">Recorded fatalities: <strong className="text-[#ef4444]">{drillRow.fatalities?.toLocaleString() ?? "—"}</strong></span>
                  </div>
                </div>
              )}
              </div>
            </section>
          </>
        )}

        {error && !data && (
          <section>
            <div className="section">
              <p className="escalation-error reveal">
                {error} Try a different country name such as Israel or Ukraine.
              </p>
            </div>
          </section>
        )}

        {!data && !loading && (
          <section>
            <div className="section">
              <p className="section-body reveal">
                Enter a country name and click <strong className="text-white">Generate plot</strong> to compute the escalation index.
              </p>
            </div>
          </section>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}
