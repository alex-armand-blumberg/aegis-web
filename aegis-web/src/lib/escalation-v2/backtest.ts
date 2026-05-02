import type { EscalationPoint } from "@/lib/escalation";
import type { EscalationV2Point } from "./methodology";

export type EscalationLabelDefinition = {
  version: string;
  horizonDays: 30 | 60 | 90;
  minIndexJump: number;
  minFatalityJump: number;
  minAbsoluteIndex: number;
};

export type BacktestCaseStudy = {
  id: string;
  country: string;
  onsetMonth: string;
  description: string;
  expectedLeadMonths: [number, number];
};

export type BacktestMetricSummary = {
  horizonDays: number;
  labeledOnsets: number;
  predictions: number;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  precision: number;
  recall: number;
  averageLeadMonths: number | null;
};

export const DEFAULT_LABEL_DEFINITIONS: EscalationLabelDefinition[] = [
  {
    version: "label-v1-30d",
    horizonDays: 30,
    minIndexJump: 18,
    minFatalityJump: 25,
    minAbsoluteIndex: 62,
  },
  {
    version: "label-v1-60d",
    horizonDays: 60,
    minIndexJump: 22,
    minFatalityJump: 40,
    minAbsoluteIndex: 68,
  },
  {
    version: "label-v1-90d",
    horizonDays: 90,
    minIndexJump: 26,
    minFatalityJump: 60,
    minAbsoluteIndex: 72,
  },
];

export const ESCALATION_CASE_STUDIES: BacktestCaseStudy[] = [
  {
    id: "ukraine-2022-invasion",
    country: "Ukraine",
    onsetMonth: "2022-02",
    description: "Russia's full-scale invasion of Ukraine.",
    expectedLeadMonths: [1, 2],
  },
  {
    id: "israel-palestine-2023-october-7",
    country: "Israel",
    onsetMonth: "2023-10",
    description: "October 7 attacks and subsequent Israel-Hamas war escalation.",
    expectedLeadMonths: [1, 2],
  },
  {
    id: "haiti-2024-gang-escalation",
    country: "Haiti",
    onsetMonth: "2024-03",
    description: "Rapid gang violence and governance crisis escalation.",
    expectedLeadMonths: [1, 3],
  },
];

function monthKey(row: Pick<EscalationPoint, "event_month">): string {
  return row.event_month.slice(0, 7);
}

function monthDistance(fromMonth: string, toMonth: string): number {
  const from = new Date(`${fromMonth}-01T00:00:00Z`);
  const to = new Date(`${toMonth}-01T00:00:00Z`);
  return (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth());
}

export function labelEscalationOnsets(
  series: EscalationPoint[],
  definition: EscalationLabelDefinition
): Set<string> {
  const labels = new Set<string>();
  for (let i = 1; i < series.length; i++) {
    const prev = series[i - 1];
    const curr = series[i];
    if (!prev || !curr) continue;
    const indexJump = curr.index_smoothed - prev.index_smoothed;
    const fatalityJump = (curr.fatalities ?? 0) - (prev.fatalities ?? 0);
    if (
      curr.index_smoothed >= definition.minAbsoluteIndex &&
      (indexJump >= definition.minIndexJump || fatalityJump >= definition.minFatalityJump)
    ) {
      labels.add(monthKey(curr));
    }
  }
  return labels;
}

export function predictedEscalationMonths(
  series: EscalationV2Point[],
  horizonDays: 30 | 60 | 90,
  probabilityThreshold = 55
): Set<string> {
  const predictions = new Set<string>();
  const riskKey = horizonDays === 30 ? "risk_30d" : horizonDays === 60 ? "risk_60d" : "risk_90d";
  for (const row of series) {
    if ((row.risk?.[riskKey] ?? 0) >= probabilityThreshold) {
      predictions.add(monthKey(row));
    }
  }
  return predictions;
}

export function summarizeWalkForwardBacktest(
  series: EscalationV2Point[],
  definition: EscalationLabelDefinition,
  probabilityThreshold = 55
): BacktestMetricSummary {
  const labels = labelEscalationOnsets(series, definition);
  const predictions = predictedEscalationMonths(series, definition.horizonDays, probabilityThreshold);
  const horizonMonths = Math.max(1, Math.round(definition.horizonDays / 30));
  let truePositives = 0;
  let falsePositives = 0;
  const matchedLabels = new Set<string>();
  const leadMonths: number[] = [];

  for (const prediction of predictions) {
    const matched = Array.from(labels).find((label) => {
      const distance = monthDistance(prediction, label);
      return distance >= 0 && distance <= horizonMonths;
    });
    if (matched) {
      truePositives += 1;
      matchedLabels.add(matched);
      leadMonths.push(monthDistance(prediction, matched));
    } else {
      falsePositives += 1;
    }
  }

  const falseNegatives = labels.size - matchedLabels.size;
  const precision = truePositives + falsePositives > 0 ? truePositives / (truePositives + falsePositives) : 0;
  const recall = labels.size > 0 ? truePositives / labels.size : 0;
  return {
    horizonDays: definition.horizonDays,
    labeledOnsets: labels.size,
    predictions: predictions.size,
    truePositives,
    falsePositives,
    falseNegatives,
    precision: Math.round(precision * 1000) / 1000,
    recall: Math.round(recall * 1000) / 1000,
    averageLeadMonths: leadMonths.length
      ? Math.round((leadMonths.reduce((sum, value) => sum + value, 0) / leadMonths.length) * 10) / 10
      : null,
  };
}

export function evaluateCaseStudies(series: EscalationV2Point[], country: string) {
  const relevant = ESCALATION_CASE_STUDIES.filter(
    (study) => study.country.toLowerCase() === country.toLowerCase()
  );
  return relevant.map((study) => {
    const [minLead, maxLead] = study.expectedLeadMonths;
    const candidates = series.filter((row) => {
      const distance = monthDistance(monthKey(row), study.onsetMonth);
      return distance >= minLead && distance <= maxLead;
    });
    const best = candidates.sort((a, b) => (b.risk?.risk_60d ?? 0) - (a.risk?.risk_60d ?? 0))[0];
    return {
      ...study,
      passed: Boolean(best && (best.risk?.risk_60d ?? 0) >= 45),
      bestLeadMonth: best ? monthKey(best) : null,
      bestRisk60d: best?.risk?.risk_60d ?? null,
    };
  });
}
