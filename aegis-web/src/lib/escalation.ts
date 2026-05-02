export type AcledMonthlyRecord = {
  country: string;
  event_month: Date;
  battles: number;
  explosions_remote_violence: number;
  protests: number;
  riots: number;
  strategic_developments: number;
  violence_against_civilians: number;
  violent_actors: number;
  fatalities: number;
};

export type EscalationPoint = {
  event_month: string; // ISO date string (month)
  escalation_index: number;
  index_smoothed: number;
  total_events: number;
  battles: number;
  explosions_remote_violence: number;
  protests: number;
  riots: number;
  strategic_developments: number;
  violence_against_civilians: number;
  fatalities: number;
  c_intensity: number;
  c_accel: number;
  c_explosion: number;
  c_strategic: number;
  c_unrest: number;
  c_civilian: number;
  methodologyVersion?: string;
  modelVersion?: string;
  risk?: {
    risk_30d: number;
    risk_60d: number;
    risk_90d: number;
    band_low: number;
    band_high: number;
  };
  components?: {
    kineticViolence: number;
    civilianTargeting: number;
    acceleration: number;
    diffusion: number;
    actorMobilization: number;
    informationSurge: number;
    humanitarianStress: number;
    countryAnomaly: number;
    globalSeverity: number;
  };
  sources?: Array<{
    source: string;
    label: string;
    signalCount: number;
    weightedSignal: number;
    lastEventDate?: string;
  }>;
  evidence?: Array<{
    month: string;
    source: string;
    label: string;
    url?: string;
    title?: string;
    signalType: string;
    value: number;
    confidence: number;
  }>;
  dataFreshness?: {
    newestSignalAt?: string;
    oldestSignalAt?: string;
    medianFreshnessHours?: number;
  };
};

export type EscalationForecastPoint = {
  event_month: string;
  projected_index: number;
  band_low: number;
  band_high: number;
};

export type EscalationSeries = {
  series: EscalationPoint[];
  forecast: EscalationForecastPoint[];
  /** Default 45. Used for escalation/pre-escalation flags. */
  escalationThreshold: number;
  /** ISO month strings (YYYY-MM) where smoothed index > threshold. */
  escalationFlaggedMonths: string[];
  /** ISO month strings where pre-escalation warning fired (below threshold but leading indicators elevated + rising). */
  preEscalationMonths: string[];
};

export type EscalationView = {
  series: EscalationPoint[];
  forecast: EscalationForecastPoint[];
  escalationThreshold: number;
  escalationFlaggedMonths: string[];
  preEscalationMonths: string[];
};

/**
 * Compute the monthly Escalation Index series for a given country.
 * Mirrors the logic in the original Streamlit implementation:
 * - Build global percentiles for each component across all country-months.
 * - Combine components with fixed weights into a 0–100 index.
 * - Apply a simple moving-average smoothing window.
 * - Fit a linear trend on the last 6 smoothed points to project 3 months ahead; downward slope is dampened and a floor applied so we don't over-predict de-escalation.
 * - Escalation flagged: months where smoothed > threshold.
 * - Pre-escalation: below threshold but within 20 pts, (c_strategic > 0.25 or c_explosion > 0.25), and index rising.
 */
export function computeEscalationIndex(
  allRows: AcledMonthlyRecord[],
  country: string,
  smoothWindow = 3,
  escalationThreshold = 45,
): EscalationSeries {
  const emptyResult: EscalationSeries = {
    series: [],
    forecast: [],
    escalationThreshold,
    escalationFlaggedMonths: [],
    preEscalationMonths: [],
  };
  if (!allRows.length) {
    return emptyResult;
  }

  // Sort globally for stable month-over-month calculations.
  const rows = [...allRows].sort((a, b) => {
    if (a.country === b.country) {
      return a.event_month.getTime() - b.event_month.getTime();
    }
    return a.country.localeCompare(b.country);
  });

  // Pre-compute per-row derived measures.
  const perRow = rows.map((r) => {
    const total_events =
      r.battles +
      r.explosions_remote_violence +
      r.protests +
      r.riots +
      r.strategic_developments +
      r.violence_against_civilians;
    const violent_events =
      r.battles + r.explosions_remote_violence + r.violence_against_civilians;

    const intensity_raw = r.battles + r.explosions_remote_violence;
    const explosions_raw = r.explosions_remote_violence;
    const strategic_raw = r.strategic_developments;
    const unrest_raw = r.protests + r.riots;
    const civ_ratio_raw =
      violent_events > 0 ? r.violence_against_civilians / violent_events : 0;

    return {
      ...r,
      total_events,
      intensity_raw,
      explosions_raw,
      strategic_raw,
      unrest_raw,
      civ_ratio_raw,
    };
  });

  // Event frequency acceleration: month-over-month % change in total_events, per country.
  const eventAccelRaw = new Array<number>(perRow.length).fill(0);
  let i = 0;
  while (i < perRow.length) {
    const start = i;
    const ctry = perRow[i].country;
    while (i < perRow.length && perRow[i].country === ctry) {
      i += 1;
    }
    for (let j = start; j < i; j++) {
      if (j === start) {
        eventAccelRaw[j] = 0;
      } else {
        const prev = perRow[j - 1].total_events;
        const curr = perRow[j].total_events;
        let pct =
          prev > 0 ? (curr - prev) / prev : curr > 0 ? 1 : 0; // rough equivalent
        // Clip to [-2, 10]
        if (pct < -2) pct = -2;
        if (pct > 10) pct = 10;
        eventAccelRaw[j] = pct;
      }
    }
  }

  // Helper to compute percentile rank (0–1) across all country-months.
  function percentileRank(values: number[]): number[] {
    const n = values.length;
    const sorted = values
      .map((v, idx) => ({ v, idx }))
      .sort((a, b) => a.v - b.v);
    const ranks = new Array<number>(n);
    let iSorted = 0;
    while (iSorted < n) {
      const v = sorted[iSorted].v;
      let j = iSorted + 1;
      while (j < n && sorted[j].v === v) j++;
      const rankValue = ((iSorted + j - 1) / 2 + 1) / n; // average rank / n
      for (let k = iSorted; k < j; k++) {
        ranks[sorted[k].idx] = rankValue;
      }
      iSorted = j;
    }
    return ranks;
  }

  const intensityArr = perRow.map((r) => r.intensity_raw);
  const accelArr = eventAccelRaw;
  const explosionArr = perRow.map((r) => r.explosions_raw);
  const strategicArr = perRow.map((r) => r.strategic_raw);
  const unrestArr = perRow.map((r) => r.unrest_raw);
  const civArr = perRow.map((r) => r.civ_ratio_raw);

  const c_intensity = percentileRank(intensityArr);
  const c_accel = percentileRank(accelArr);
  const c_explosion = percentileRank(explosionArr);
  const c_strategic = percentileRank(strategicArr);
  const c_unrest = percentileRank(unrestArr);
  const c_civilian = percentileRank(civArr);

  // Compute weighted composite index 0–100.
  const escalationIndex = perRow.map((_, idx) => {
    return (
      (0.3 * c_intensity[idx] +
        0.2 * c_accel[idx] +
        0.2 * c_explosion[idx] +
        0.15 * c_strategic[idx] +
        0.1 * c_unrest[idx] +
        0.05 * c_civilian[idx]) *
      100
    );
  });

  // Filter to the requested country and build series in chronological order.
  const countryRows: EscalationPoint[] = [];
  for (let idx = 0; idx < perRow.length; idx++) {
    const r = perRow[idx];
    if (r.country !== country) continue;
    countryRows.push({
      event_month: r.event_month.toISOString(),
      escalation_index: escalationIndex[idx],
      index_smoothed: 0, // placeholder, set below
      total_events: r.total_events,
      battles: r.battles,
      explosions_remote_violence: r.explosions_remote_violence,
      protests: r.protests,
      riots: r.riots,
      strategic_developments: r.strategic_developments,
      violence_against_civilians: r.violence_against_civilians,
      fatalities: r.fatalities,
      c_intensity: c_intensity[idx],
      c_accel: c_accel[idx],
      c_explosion: c_explosion[idx],
      c_strategic: c_strategic[idx],
      c_unrest: c_unrest[idx],
      c_civilian: c_civilian[idx],
    });
  }

  if (!countryRows.length) {
    return emptyResult;
  }

  // Apply simple moving average smoothing over escalation_index.
  const window = Math.max(1, Math.floor(smoothWindow));
  for (let iCountry = 0; iCountry < countryRows.length; iCountry++) {
    let sum = 0;
    let count = 0;
    for (
      let j = Math.max(0, iCountry - window + 1);
      j <= iCountry;
      j++
    ) {
      sum += countryRows[j].escalation_index;
      count += 1;
    }
    countryRows[iCountry].index_smoothed = sum / count;
  }

  // Forecast next 3 months using linear regression on the last 6 smoothed points,
  // with dampened downward trend so we don't over-predict de-escalation (e.g. ongoing conflict).
  const forecast: EscalationForecastPoint[] = [];
  if (countryRows.length >= 6) {
    const tail = countryRows.slice(-6);
    const n = tail.length;
    const xVals = new Array<number>(n);
    const yVals = new Array<number>(n);
    for (let iTail = 0; iTail < n; iTail++) {
      xVals[iTail] = iTail;
      yVals[iTail] = tail[iTail].index_smoothed;
    }
    const xMean = xVals.reduce((a, b) => a + b, 0) / n;
    const yMean = yVals.reduce((a, b) => a + b, 0) / n;
    let num = 0;
    let den = 0;
    for (let iTail = 0; iTail < n; iTail++) {
      const dx = xVals[iTail] - xMean;
      const dy = yVals[iTail] - yMean;
      num += dx * dy;
      den += dx * dx;
    }
    let slope = den === 0 ? 0 : num / den;
    // Strong dampening of downward slope: avoid over-predicting de-escalation when conflict persists (e.g. no future data ≠ peace).
    if (slope < 0) slope *= 0.15;
    const intercept = yMean - slope * xMean;

    // Residual standard deviation for uncertainty band.
    let rss = 0;
    for (let iTail = 0; iTail < n; iTail++) {
      const yHat = intercept + slope * xVals[iTail];
      const r = yVals[iTail] - yHat;
      rss += r * r;
    }
    const stdErr = Math.sqrt(rss / n);

    const lastSmoothed = tail[n - 1].index_smoothed;
    const lastDate = new Date(
      countryRows[countryRows.length - 1].event_month,
    );
    for (let step = 1; step <= 3; step++) {
      const monthIndex = n - 1 + step;
      let yHat = intercept + slope * monthIndex;
      // Conservative floor: at most ~2 index points drop per month so forecast doesn't assume conflict ends.
      const floor = Math.max(0, lastSmoothed - 2 * step);
      yHat = Math.max(yHat, floor);
      const fcDate = new Date(lastDate);
      fcDate.setMonth(fcDate.getMonth() + step);
      forecast.push({
        event_month: fcDate.toISOString(),
        projected_index: Math.max(0, Math.min(100, yHat)),
        band_low: Math.max(0, yHat - 1.5 * stdErr),
        band_high: Math.min(100, yHat + 1.5 * stdErr),
      });
    }
  }

  // Escalation flagged: smoothed > threshold
  const escalationFlaggedMonths: string[] = [];
  const preEscalationMonths: string[] = [];
  const threshold = Math.max(0, Math.min(100, escalationThreshold));

  for (let i = 0; i < countryRows.length; i++) {
    const row = countryRows[i];
    const monthKey = row.event_month.slice(0, 7); // YYYY-MM
    if (row.index_smoothed > threshold) {
      escalationFlaggedMonths.push(monthKey);
    } else if (
      row.index_smoothed < threshold &&
      row.index_smoothed > threshold - 20 &&
      (row.c_strategic > 0.25 || row.c_explosion > 0.25) &&
      i > 0 &&
      row.index_smoothed > countryRows[i - 1].index_smoothed
    ) {
      preEscalationMonths.push(monthKey);
    }
  }

  return {
    series: countryRows,
    forecast,
    escalationThreshold: threshold,
    escalationFlaggedMonths,
    preEscalationMonths,
  };
}

/**
 * Compute 3-month forecast from the tail of an existing series (e.g. after date filtering).
 * Use this so the forecast aligns with the visible chart end.
 */
export function computeForecastFromTail(
  series: EscalationPoint[],
  numMonths = 3
): EscalationForecastPoint[] {
  const forecast: EscalationForecastPoint[] = [];
  if (series.length < 6) return forecast;
  const tail = series.slice(-6);
  const n = tail.length;
  const xVals = new Array<number>(n);
  const yVals = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    xVals[i] = i;
    yVals[i] = tail[i].index_smoothed;
  }
  const xMean = xVals.reduce((a, b) => a + b, 0) / n;
  const yMean = yVals.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const dx = xVals[i] - xMean;
    const dy = yVals[i] - yMean;
    num += dx * dy;
    den += dx * dx;
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = yMean - slope * xMean;
  let rss = 0;
  for (let i = 0; i < n; i++) {
    const yHat = intercept + slope * xVals[i];
    rss += (yVals[i] - yHat) ** 2;
  }
  const stdErr = Math.sqrt(rss / n);
  const lastDate = new Date(series[series.length - 1].event_month);
  for (let step = 1; step <= numMonths; step++) {
    const monthIndex = n - 1 + step;
    const yHat = intercept + slope * monthIndex;
    const fcDate = new Date(lastDate);
    fcDate.setMonth(fcDate.getMonth() + step);
    const yyyy = fcDate.getFullYear();
    const mm = String(fcDate.getMonth() + 1).padStart(2, "0");
    forecast.push({
      event_month: `${yyyy}-${mm}-01`,
      projected_index: Math.max(0, Math.min(100, yHat)),
      band_low: Math.max(0, yHat - 1.5 * stdErr),
      band_high: Math.min(100, yHat + 1.5 * stdErr),
    });
  }
  return forecast;
}

/**
 * Recompute smoothing, threshold-based flags, and forecast from a canonical series.
 * Canonical series should have stable per-month component values and escalation_index;
 * this function applies request-time view parameters without refetching upstream data.
 */
export function buildEscalationViewFromCanonical(
  canonicalSeries: EscalationPoint[],
  smoothWindow = 3,
  escalationThreshold = 45
): EscalationView {
  if (!canonicalSeries.length) {
    return {
      series: [],
      forecast: [],
      escalationThreshold,
      escalationFlaggedMonths: [],
      preEscalationMonths: [],
    };
  }
  const series = canonicalSeries.map((row) => ({ ...row }));
  const window = Math.max(1, Math.floor(smoothWindow));
  for (let i = 0; i < series.length; i++) {
    let sum = 0;
    let count = 0;
    for (let j = Math.max(0, i - window + 1); j <= i; j++) {
      sum += series[j].escalation_index;
      count += 1;
    }
    series[i].index_smoothed = sum / count;
  }

  const threshold = Math.max(0, Math.min(100, escalationThreshold));
  const escalationFlaggedMonths: string[] = [];
  const preEscalationMonths: string[] = [];
  for (let i = 0; i < series.length; i++) {
    const row = series[i];
    const monthKey = row.event_month.slice(0, 7);
    if (row.index_smoothed > threshold) {
      escalationFlaggedMonths.push(monthKey);
    } else if (
      row.index_smoothed < threshold &&
      row.index_smoothed > threshold - 20 &&
      (row.c_strategic > 0.25 || row.c_explosion > 0.25) &&
      i > 0 &&
      row.index_smoothed > series[i - 1].index_smoothed
    ) {
      preEscalationMonths.push(monthKey);
    }
  }

  return {
    series,
    forecast: computeForecastFromTail(series),
    escalationThreshold: threshold,
    escalationFlaggedMonths,
    preEscalationMonths,
  };
}

