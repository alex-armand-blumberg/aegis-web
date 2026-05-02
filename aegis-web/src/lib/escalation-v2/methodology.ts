import type { AcledMonthlyRecord, EscalationPoint } from "@/lib/escalation";
import {
  ESCALATION_V2_METHODOLOGY_VERSION,
  ESCALATION_V2_MODEL_VERSION,
  type EscalationComponentScores,
  type EscalationEvidence,
  type EscalationSignal,
  type EscalationSignalType,
  type EscalationSourceContribution,
  type EscalationV2BuildInput,
  type EscalationV2PointExtras,
  type SourceMetadata,
} from "./types";
import { acledRowsToSignals } from "./sources";
import { scoreCalibratedRisks } from "./calibration";

export type EscalationV2Point = EscalationPoint & EscalationV2PointExtras;

export type EscalationV2BuildResult = {
  series: EscalationV2Point[];
  sourceMetadata: SourceMetadata[];
  methodologyVersion: string;
  modelVersion: string;
  dataFreshness: EscalationV2PointExtras["dataFreshness"];
};

type MonthBucket = {
  month: string;
  row: AcledMonthlyRecord;
  signals: EscalationSignal[];
};

const COMPONENT_WEIGHTS: Record<keyof Omit<EscalationComponentScores, "countryAnomaly" | "globalSeverity">, number> = {
  kineticViolence: 0.26,
  civilianTargeting: 0.14,
  acceleration: 0.18,
  diffusion: 0.08,
  actorMobilization: 0.1,
  informationSurge: 0.12,
  humanitarianStress: 0.12,
};

const SOURCE_LABELS: Record<string, string> = {
  acled: "ACLED",
  gdelt_cloud: "GDELT Cloud",
  reliefweb: "ReliefWeb",
  gdacs: "GDACS",
  event_registry: "Event Registry / NewsAPI.ai",
};

function monthKey(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toISOString().slice(0, 7);
}

function monthStart(month: string): Date {
  return new Date(`${month}-01T00:00:00Z`);
}

function emptyRow(country: string, month: string): AcledMonthlyRecord {
  return {
    country,
    event_month: monthStart(month),
    battles: 0,
    explosions_remote_violence: 0,
    protests: 0,
    riots: 0,
    strategic_developments: 0,
    violence_against_civilians: 0,
    violent_actors: 0,
    fatalities: 0,
  };
}

function freshnessWeight(signal: EscalationSignal, meta: SourceMetadata | undefined): number {
  const halfLife = Math.max(1, meta?.freshnessHalfLifeHours ?? 168);
  return Math.pow(0.5, signal.freshnessHours / halfLife);
}

function weightedValue(signal: EscalationSignal, meta: SourceMetadata | undefined): number {
  return signal.value * signal.confidence * (meta?.reliability ?? 0.65) * freshnessWeight(signal, meta);
}

function sumSignals(
  signals: EscalationSignal[],
  metaById: Map<string, SourceMetadata>,
  types: EscalationSignalType[]
): number {
  const typeSet = new Set(types);
  return signals
    .filter((signal) => typeSet.has(signal.signalType))
    .reduce((sum, signal) => sum + weightedValue(signal, metaById.get(signal.source)), 0);
}

function scale(value: number, midpoint: number, steepness = 1): number {
  if (value <= 0) return 0;
  const x = Math.max(0, value) / Math.max(0.0001, midpoint);
  return Math.max(0, Math.min(1, 1 - Math.exp(-x * steepness)));
}

function percentileRank(value: number, values: number[]): number {
  if (!values.length) return 0;
  const lower = values.filter((v) => v < value).length;
  const equal = values.filter((v) => v === value).length;
  return (lower + equal * 0.5) / values.length;
}

function trailingBaseline(values: number[], idx: number, lookback = 12): number {
  const start = Math.max(0, idx - lookback);
  const slice = values.slice(start, idx);
  if (!slice.length) return Math.max(1, values[idx] || 1);
  const sorted = [...slice].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  return Math.max(1, median);
}

function evidenceForMonth(bucket: MonthBucket): EscalationEvidence[] {
  return [...bucket.signals]
    .filter((signal) => signal.evidenceUrl || signal.title)
    .sort((a, b) => b.value * b.confidence - a.value * a.confidence)
    .slice(0, 8)
    .map((signal) => ({
      month: bucket.month,
      source: signal.source,
      label: SOURCE_LABELS[signal.source] ?? signal.source,
      url: signal.evidenceUrl,
      title: signal.title,
      signalType: signal.signalType,
      value: signal.value,
      confidence: signal.confidence,
    }));
}

function sourceContributions(
  signals: EscalationSignal[],
  metaById: Map<string, SourceMetadata>
): EscalationSourceContribution[] {
  const bySource = new Map<string, EscalationSourceContribution>();
  for (const signal of signals) {
    const existing = bySource.get(signal.source) ?? {
      source: signal.source,
      label: SOURCE_LABELS[signal.source] ?? signal.source,
      signalCount: 0,
      weightedSignal: 0,
      lastEventDate: undefined,
    };
    existing.signalCount += 1;
    existing.weightedSignal += weightedValue(signal, metaById.get(signal.source));
    if (!existing.lastEventDate || signal.date > existing.lastEventDate) {
      existing.lastEventDate = signal.date;
    }
    bySource.set(signal.source, existing);
  }
  return Array.from(bySource.values())
    .map((source) => ({
      ...source,
      weightedSignal: Math.round(source.weightedSignal * 100) / 100,
    }))
    .sort((a, b) => b.weightedSignal - a.weightedSignal);
}

function dataFreshness(signals: EscalationSignal[]): EscalationV2PointExtras["dataFreshness"] {
  if (!signals.length) return {};
  const dates = signals.map((signal) => signal.date).sort();
  const freshness = signals.map((signal) => signal.freshnessHours).sort((a, b) => a - b);
  return {
    oldestSignalAt: dates[0],
    newestSignalAt: dates[dates.length - 1],
    medianFreshnessHours: Math.round(freshness[Math.floor(freshness.length / 2)] ?? 0),
  };
}

export function buildEscalationV2Series(input: EscalationV2BuildInput): EscalationV2BuildResult {
  const acledSignals = acledRowsToSignals(input.acledRows, input.now);
  const allSignals = [...acledSignals, ...input.externalSignals].filter((signal) => signal.value > 0);
  const metaById = new Map(input.sourceMetadata.map((meta) => [meta.id, meta]));
  const rowsByMonth = new Map<string, AcledMonthlyRecord>();
  for (const row of input.acledRows) {
    rowsByMonth.set(monthKey(row.event_month), { ...row, event_month: new Date(row.event_month) });
  }
  for (const signal of allSignals) {
    const key = monthKey(signal.date);
    if (!rowsByMonth.has(key)) rowsByMonth.set(key, emptyRow(input.country, key));
  }

  const buckets: MonthBucket[] = Array.from(rowsByMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, row]) => ({
      month,
      row,
      signals: allSignals.filter((signal) => monthKey(signal.date) === month),
    }));

  const kineticRaw = buckets.map((bucket) => {
    const row = bucket.row;
    return (
      row.battles * 1.5 +
      row.explosions_remote_violence * 1.8 +
      row.fatalities * 0.08 +
      sumSignals(bucket.signals, metaById, ["conflict_event", "explosion", "conflict_fatality"]) * 0.8
    );
  });
  const evidenceRaw = buckets.map((bucket) =>
    sumSignals(bucket.signals, metaById, ["story_cluster", "humanitarian_report", "disaster_alert"])
  );

  const series: EscalationV2Point[] = buckets.map((bucket, idx) => {
    const row = bucket.row;
    const totalEvents =
      row.battles +
      row.explosions_remote_violence +
      row.protests +
      row.riots +
      row.strategic_developments +
      row.violence_against_civilians;
    const violentEvents = row.battles + row.explosions_remote_violence + row.violence_against_civilians;
    const previousKinetic = idx > 0 ? kineticRaw[idx - 1] ?? 0 : 0;
    const accelRaw =
      previousKinetic > 0
        ? (kineticRaw[idx] - previousKinetic) / previousKinetic
        : kineticRaw[idx] > 0
          ? 1
          : 0;
    const countryBaseline = trailingBaseline(kineticRaw, idx, 12);
    const countryAnomaly = scale(kineticRaw[idx] / countryBaseline, 2.1);
    const globalSeverity = percentileRank(kineticRaw[idx] + evidenceRaw[idx] * 0.5, kineticRaw.map((v, i) => v + evidenceRaw[i] * 0.5));
    const components: EscalationComponentScores = {
      kineticViolence: scale(kineticRaw[idx], 18),
      civilianTargeting: scale(
        row.violence_against_civilians * 1.4 +
          (violentEvents > 0 ? row.violence_against_civilians / violentEvents : 0) * 8 +
          sumSignals(bucket.signals, metaById, ["violence_against_civilians"]) * 0.7,
        6
      ),
      acceleration: scale(Math.max(0, accelRaw) * 4 + countryAnomaly * 2, 3),
      diffusion: scale(Math.sqrt(Math.max(1, totalEvents)) + bucket.signals.length / 8, 7),
      actorMobilization: scale(
        row.violent_actors * 0.7 +
          row.strategic_developments * 0.5 +
          sumSignals(bucket.signals, metaById, ["actor_mobilization", "strategic_development"]) * 0.8,
        5
      ),
      informationSurge: scale(evidenceRaw[idx] + sumSignals(bucket.signals, metaById, ["story_cluster"]) * 0.6, 8),
      humanitarianStress: scale(
        sumSignals(bucket.signals, metaById, ["humanitarian_report", "disaster_alert"]) +
          row.violence_against_civilians * 0.5,
        5
      ),
      countryAnomaly,
      globalSeverity,
    };
    const weighted =
      components.kineticViolence * COMPONENT_WEIGHTS.kineticViolence +
      components.civilianTargeting * COMPONENT_WEIGHTS.civilianTargeting +
      components.acceleration * COMPONENT_WEIGHTS.acceleration +
      components.diffusion * COMPONENT_WEIGHTS.diffusion +
      components.actorMobilization * COMPONENT_WEIGHTS.actorMobilization +
      components.informationSurge * COMPONENT_WEIGHTS.informationSurge +
      components.humanitarianStress * COMPONENT_WEIGHTS.humanitarianStress;
    const severityBlend = weighted * 0.72 + components.countryAnomaly * 0.16 + components.globalSeverity * 0.12;
    const escalationIndex = Math.max(0, Math.min(100, severityBlend * 100));
    return {
      event_month: row.event_month.toISOString(),
      escalation_index: escalationIndex,
      index_smoothed: 0,
      total_events: totalEvents,
      battles: row.battles,
      explosions_remote_violence: row.explosions_remote_violence,
      protests: row.protests,
      riots: row.riots,
      strategic_developments: row.strategic_developments,
      violence_against_civilians: row.violence_against_civilians,
      fatalities: row.fatalities,
      c_intensity: components.kineticViolence,
      c_accel: components.acceleration,
      c_explosion: scale(row.explosions_remote_violence + sumSignals(bucket.signals, metaById, ["explosion"]), 7),
      c_strategic: components.actorMobilization,
      c_unrest: scale(row.protests + row.riots + sumSignals(bucket.signals, metaById, ["protest", "riot"]), 12),
      c_civilian: components.civilianTargeting,
      methodologyVersion: ESCALATION_V2_METHODOLOGY_VERSION,
      modelVersion: ESCALATION_V2_MODEL_VERSION,
      components,
      risk: scoreCalibratedRisks(components),
      sources: sourceContributions(bucket.signals, metaById),
      evidence: evidenceForMonth(bucket),
      dataFreshness: dataFreshness(bucket.signals),
    };
  });

  return {
    series,
    sourceMetadata: input.sourceMetadata,
    methodologyVersion: ESCALATION_V2_METHODOLOGY_VERSION,
    modelVersion: ESCALATION_V2_MODEL_VERSION,
    dataFreshness: dataFreshness(allSignals),
  };
}
