/**
 * ACLED authenticated API (research tier).
 * Uses ACLED_EMAIL and ACLED_PASSWORD env vars. Server-side only.
 */

import type { AcledMonthlyRecord } from "./escalation";

const ACLED_OAUTH_URL = "https://acleddata.com/oauth/token";
const ACLED_API_URL = "https://acleddata.com/api/acled/read";
const ACLED_TOKEN_SKEW_MS = 30_000;
const ACLED_MONTHLY_CACHE_TTL_MS = 24 * 60 * 60_000;
const ACLED_PAGE_SIZE = 5000;
const ACLED_WINDOW_MONTHS = Math.max(
  1,
  Math.floor(Number(process.env.ACLED_WINDOW_MONTHS ?? 1))
);
const ACLED_WINDOW_CONCURRENCY = Math.max(
  1,
  Math.min(6, Math.floor(Number(process.env.ACLED_WINDOW_CONCURRENCY ?? 3)))
);
const ACLED_MAX_PAGES_PER_WINDOW = Math.max(
  1,
  Math.floor(Number(process.env.ACLED_MAX_PAGES_PER_WINDOW ?? 8))
);

let cachedAuthToken: { token: string; expiresAt: number } | null = null;
const acledMonthlyCache = new Map<string, { expiresAt: number; rows: AcledMonthlyRecord[] }>();

const EVENT_TYPE_MAP: Record<string, keyof Pick<AcledMonthlyRecord, "battles" | "explosions_remote_violence" | "violence_against_civilians" | "strategic_developments" | "protests" | "riots">> = {
  "Battles": "battles",
  "Explosions/Remote violence": "explosions_remote_violence",
  "Violence against civilians": "violence_against_civilians",
  "Strategic developments": "strategic_developments",
  "Protests": "protests",
  "Riots": "riots",
};

export async function getAcledToken(): Promise<string> {
  if (cachedAuthToken && Date.now() < cachedAuthToken.expiresAt) {
    return cachedAuthToken.token;
  }
  const email = process.env.ACLED_EMAIL;
  const password = process.env.ACLED_PASSWORD;
  if (!email || !password) {
    throw new Error("ACLED_EMAIL and ACLED_PASSWORD must be set");
  }
  const body = new URLSearchParams({
    username: email.trim(),
    password: password.trim(),
    grant_type: "password",
    client_id: "acled",
  });
  const res = await fetch(ACLED_OAUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ACLED login failed (${res.status}). ${text}`);
  }
  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new Error("ACLED token response missing access_token");
  const expiresInMs = Math.max(60_000, Number(data.expires_in ?? 3600) * 1000);
  cachedAuthToken = {
    token: data.access_token,
    expiresAt: Date.now() + expiresInMs - ACLED_TOKEN_SKEW_MS,
  };
  return data.access_token;
}

type AcledApiRow = Record<string, unknown>;
type DateWindow = {
  start: Date;
  end: Date;
};

function toLowerKeys(row: AcledApiRow): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    out[k.toLowerCase().trim()] = v;
  }
  return out;
}

function parseEventMonth(dateVal: unknown): Date | null {
  if (dateVal == null) return null;
  const d = new Date(String(dateVal));
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * Aggregate raw ACLED API rows for one country into monthly records.
 */
function aggregateToMonthly(
  rows: AcledApiRow[],
  country: string
): AcledMonthlyRecord[] {
  const byMonth = new Map<string, {
    battles: number;
    explosions_remote_violence: number;
    protests: number;
    riots: number;
    strategic_developments: number;
    violence_against_civilians: number;
    fatalities: number;
  }>();

  const firstLower = rows.length ? toLowerKeys(rows[0]) : {};
  const dateKey = Object.keys(firstLower).find((c) => c.includes("date")) ?? "event_date";
  const typeKey = Object.keys(firstLower).find((c) => c.includes("event_type")) ?? "event_type";

  for (const row of rows) {
    const r = toLowerKeys(row);
    const dateVal = r[dateKey];
    const eventMonth = parseEventMonth(dateVal);
    if (!eventMonth) continue;

    const key = eventMonth.toISOString().slice(0, 7);
    const existing = byMonth.get(key) ?? {
      battles: 0,
      explosions_remote_violence: 0,
      protests: 0,
      riots: 0,
      strategic_developments: 0,
      violence_against_civilians: 0,
      fatalities: 0,
    };

    const eventType = (r[typeKey] ?? "") as string;
    const typeStr = String(eventType ?? "").trim();
    const col = EVENT_TYPE_MAP[typeStr];
    if (col) existing[col] += 1;

    const fat = Number(r.fatalities) || 0;
    existing.fatalities += fat;
    byMonth.set(key, existing);
  }

  return Array.from(byMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([monthStr, agg]) => ({
      country,
      event_month: new Date(monthStr + "-01T00:00:00Z"),
      battles: agg.battles,
      explosions_remote_violence: agg.explosions_remote_violence,
      protests: agg.protests,
      riots: agg.riots,
      strategic_developments: agg.strategic_developments,
      violence_against_civilians: agg.violence_against_civilians,
      violent_actors: 0,
      fatalities: agg.fatalities,
    }));
}

function mergeMonthlyRecords(records: AcledMonthlyRecord[]): AcledMonthlyRecord[] {
  const byMonth = new Map<string, AcledMonthlyRecord>();
  for (const row of records) {
    const month = row.event_month.toISOString().slice(0, 7);
    const existing = byMonth.get(month);
    if (!existing) {
      byMonth.set(month, { ...row, event_month: new Date(row.event_month) });
      continue;
    }
    existing.battles += row.battles;
    existing.explosions_remote_violence += row.explosions_remote_violence;
    existing.protests += row.protests;
    existing.riots += row.riots;
    existing.strategic_developments += row.strategic_developments;
    existing.violence_against_civilians += row.violence_against_civilians;
    existing.violent_actors += row.violent_actors;
    existing.fatalities += row.fatalities;
  }
  return Array.from(byMonth.values()).sort(
    (a, b) => a.event_month.getTime() - b.event_month.getTime()
  );
}

function utcMonthStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function utcMonthEnd(year: number, monthIndex: number): Date {
  return new Date(Date.UTC(year, monthIndex + 1, 0, 23, 59, 59, 999));
}

function buildDateWindows(startDate: Date, endDate: Date, monthsPerWindow: number): DateWindow[] {
  const windows: DateWindow[] = [];
  let cursor = utcMonthStart(startDate);
  const end = new Date(endDate);
  end.setUTCHours(23, 59, 59, 999);

  while (cursor <= end) {
    const windowStart = new Date(Math.max(cursor.getTime(), startDate.getTime()));
    const endMonthIndex = cursor.getUTCMonth() + monthsPerWindow - 1;
    const rawWindowEnd = utcMonthEnd(cursor.getUTCFullYear(), endMonthIndex);
    const windowEnd = new Date(Math.min(rawWindowEnd.getTime(), end.getTime()));
    windows.push({ start: windowStart, end: windowEnd });
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + monthsPerWindow, 1));
  }

  return windows;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

async function fetchAcledWindowMonthly(
  token: string,
  country: string,
  window: DateWindow,
  onProgress?: (fetched: number, total: number | null) => void
): Promise<AcledMonthlyRecord[]> {
  const rows: AcledApiRow[] = [];
  let page = 1;

  while (page <= ACLED_MAX_PAGES_PER_WINDOW) {
    const params = new URLSearchParams({
      country,
      event_date: `${isoDate(window.start)}|${isoDate(window.end)}`,
      event_date_where: "BETWEEN",
      fields: "event_date|country|event_type|fatalities",
      limit: String(ACLED_PAGE_SIZE),
      page: String(page),
    });
    const res = await fetch(`${ACLED_API_URL}?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": "AEGIS-escalation-index",
      },
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`ACLED API error ${res.status}: ${await res.text()}`);
    }
    const data = (await res.json()) as { data?: AcledApiRow[]; total_count?: number };
    const chunk = data.data ?? [];
    rows.push(...chunk);
    onProgress?.(chunk.length, typeof data.total_count === "number" ? data.total_count : null);
    if (chunk.length < ACLED_PAGE_SIZE) break;
    page += 1;
  }

  return aggregateToMonthly(rows, country);
}

/**
 * Fetch ACLED event data for one country in the given date range and return
 * monthly aggregated records. Uses ACLED_EMAIL and ACLED_PASSWORD.
 * Optional onProgress(fetched, total) is called after each page; total is set when last page is partial.
 */
export async function fetchAcledCountryMonthly(
  country: string,
  startDate: Date,
  endDate: Date,
  onProgress?: (fetched: number, total: number | null) => void
): Promise<AcledMonthlyRecord[]> {
  const cacheKey = `${country.toLowerCase()}|${startDate.toISOString().slice(0, 10)}|${endDate
    .toISOString()
    .slice(0, 10)}`;
  const cached = acledMonthlyCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    const rows = cached.rows.map((row) => ({
      ...row,
      event_month: new Date(row.event_month),
    }));
    onProgress?.(rows.length, rows.length);
    return rows;
  }

  const token = await getAcledToken();
  const windows = buildDateWindows(startDate, endDate, ACLED_WINDOW_MONTHS);
  const queue = [...windows];
  const monthlyChunks: AcledMonthlyRecord[][] = [];
  let fetchedRows = 0;

  const workers = Array.from(
    { length: Math.min(ACLED_WINDOW_CONCURRENCY, queue.length || 1) },
    async () => {
      while (queue.length > 0) {
        const window = queue.shift();
        if (!window) continue;
        const rows = await fetchAcledWindowMonthly(token, country, window, (fetched) => {
          fetchedRows += fetched;
          onProgress?.(fetchedRows, null);
        });
        monthlyChunks.push(rows);
      }
    }
  );
  await Promise.all(workers);

  const monthly = mergeMonthlyRecords(monthlyChunks.flat());
  const start = startDate.getTime();
  const end = endDate.getTime();
  const filtered = monthly.filter((m) => {
    const t = m.event_month.getTime();
    return t >= start && t <= end;
  });
  acledMonthlyCache.set(cacheKey, {
    expiresAt: Date.now() + ACLED_MONTHLY_CACHE_TTL_MS,
    rows: filtered.map((row) => ({ ...row, event_month: new Date(row.event_month) })),
  });
  return filtered;
}

export function hasAcledEnv(): boolean {
  return Boolean(
    process.env.ACLED_EMAIL?.trim() && process.env.ACLED_PASSWORD?.trim()
  );
}
