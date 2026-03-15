/**
 * ACLED authenticated API (research tier).
 * Uses ACLED_EMAIL and ACLED_PASSWORD env vars. Server-side only.
 */

import type { AcledMonthlyRecord } from "./escalation";

const ACLED_OAUTH_URL = "https://acleddata.com/oauth/token";
const ACLED_API_URL = "https://acleddata.com/api/acled/read";

const EVENT_TYPE_MAP: Record<string, keyof Pick<AcledMonthlyRecord, "battles" | "explosions_remote_violence" | "violence_against_civilians" | "strategic_developments" | "protests" | "riots">> = {
  "Battles": "battles",
  "Explosions/Remote violence": "explosions_remote_violence",
  "Violence against civilians": "violence_against_civilians",
  "Strategic developments": "strategic_developments",
  "Protests": "protests",
  "Riots": "riots",
};

export async function getAcledToken(): Promise<string> {
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
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("ACLED token response missing access_token");
  return data.access_token;
}

type AcledApiRow = Record<string, unknown>;

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
  const token = await getAcledToken();
  const startYear = startDate.getFullYear();
  const endYear = endDate.getFullYear();
  const yearRange = `${startYear}|${endYear}`;
  const allRows: AcledApiRow[] = [];
  const pageSize = 5000;
  const maxPages = 60;
  let page = 1;

  while (page <= maxPages) {
    const params = new URLSearchParams({
      country,
      year: yearRange,
      year_where: "BETWEEN",
      fields: "event_date|country|event_type|fatalities|latitude|longitude",
      limit: String(pageSize),
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
    const data = (await res.json()) as { data?: AcledApiRow[] };
    const chunk = data.data ?? [];
    if (!chunk.length) break;
    allRows.push(...chunk);
    const total = chunk.length < pageSize ? allRows.length : null;
    onProgress?.(allRows.length, total);
    if (chunk.length < pageSize) break;
    page += 1;
  }

  const monthly = aggregateToMonthly(allRows, country);
  const start = startDate.getTime();
  const end = endDate.getTime();
  return monthly.filter((m) => {
    const t = m.event_month.getTime();
    return t >= start && t <= end;
  });
}

export function hasAcledEnv(): boolean {
  return Boolean(
    process.env.ACLED_EMAIL?.trim() && process.env.ACLED_PASSWORD?.trim()
  );
}
