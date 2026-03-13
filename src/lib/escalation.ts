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
};

/**
 * Compute the monthly Escalation Index series for a given country.
 * Mirrors the logic in the original Streamlit implementation:
 * - Build global percentiles for each component across all country-months.
 * - Combine components with fixed weights into a 0–100 index.
 * - Apply a simple moving-average smoothing window.
 * - Fit a linear trend on the last 6 smoothed points to project 3 months ahead.
 */
export function computeEscalationIndex(
  allRows: AcledMonthlyRecord[],
  country: string,
  smoothWindow = 3,
): EscalationSeries {
  if (!allRows.length) {
    return { series: [], forecast: [] };
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
    return { series: [], forecast: [] };
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

  // Forecast next 3 months using a simple linear regression on the last 6 smoothed points.
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
    const slope = den === 0 ? 0 : num / den;
    const intercept = yMean - slope * xMean;

    // Residual standard deviation for a simple uncertainty band.
    let rss = 0;
    for (let iTail = 0; iTail < n; iTail++) {
      const yHat = intercept + slope * xVals[iTail];
      const r = yVals[iTail] - yHat;
      rss += r * r;
    }
    const stdErr = Math.sqrt(rss / n);

    const lastDate = new Date(
      countryRows[countryRows.length - 1].event_month,
    );
    for (let step = 1; step <= 3; step++) {
      const monthIndex = n - 1 + step;
      const yHat = Math.max(0, Math.min(100, intercept + slope * monthIndex));
      const fcDate = new Date(lastDate);
      fcDate.setMonth(fcDate.getMonth() + step);
      const yyyy = fcDate.getFullYear();
      const mm = String(fcDate.getMonth() + 1).padStart(2, "0");
      forecast.push({
        event_month: `${yyyy}-${mm}-01`,
        projected_index: yHat,
        band_low: Math.max(0, yHat - 2 * stdErr),
        band_high: Math.min(100, yHat + 2 * stdErr),
      });
    }
  }

  return { series: countryRows, forecast };
}

