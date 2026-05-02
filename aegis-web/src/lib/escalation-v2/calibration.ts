import {
  ESCALATION_V2_MODEL_VERSION,
  type EscalationComponentScores,
  type EscalationRiskScores,
} from "./types";

export type CalibrationArtifact = {
  modelVersion: string;
  trainedAt: string;
  featureWeights: Record<keyof EscalationComponentScores, number>;
  intercept: number;
  horizonAdjustments: {
    risk_30d: number;
    risk_60d: number;
    risk_90d: number;
  };
  notes: string[];
};

export const DEFAULT_TRANSPARENT_CALIBRATION: CalibrationArtifact = {
  modelVersion: ESCALATION_V2_MODEL_VERSION,
  trainedAt: "static-transparent-baseline",
  featureWeights: {
    kineticViolence: 1.4,
    civilianTargeting: 0.7,
    acceleration: 1.6,
    diffusion: 0.35,
    actorMobilization: 0.8,
    informationSurge: 0.75,
    humanitarianStress: 0.5,
    countryAnomaly: 1.15,
    globalSeverity: 0.8,
  },
  intercept: -3.2,
  horizonAdjustments: {
    risk_30d: 0,
    risk_60d: 0.35,
    risk_90d: 0.55,
  },
  notes: [
    "Transparent baseline until a trained artifact is generated from walk-forward backtests.",
    "Weights favor acceleration, country-relative anomaly, kinetic violence, and global severity.",
  ],
};

function sigmoid(value: number): number {
  return 1 / (1 + Math.exp(-value));
}

export function scoreCalibratedRisks(
  components: EscalationComponentScores,
  artifact: CalibrationArtifact = DEFAULT_TRANSPARENT_CALIBRATION
): EscalationRiskScores {
  const linear =
    artifact.intercept +
    Object.entries(artifact.featureWeights).reduce((sum, [key, weight]) => {
      return sum + components[key as keyof EscalationComponentScores] * weight;
    }, 0);
  const risk30 = sigmoid(linear + artifact.horizonAdjustments.risk_30d);
  const risk60 = sigmoid(linear + artifact.horizonAdjustments.risk_60d);
  const risk90 = sigmoid(linear + artifact.horizonAdjustments.risk_90d);
  const uncertainty = Math.max(0.08, 0.22 - components.globalSeverity * 0.08);
  return {
    risk_30d: Math.round(risk30 * 1000) / 10,
    risk_60d: Math.round(risk60 * 1000) / 10,
    risk_90d: Math.round(risk90 * 1000) / 10,
    band_low: Math.max(0, Math.round((risk30 - uncertainty) * 1000) / 10),
    band_high: Math.min(100, Math.round((risk90 + uncertainty) * 1000) / 10),
  };
}
