import { NextResponse } from "next/server";
import type { RegionMarketQuote } from "@/lib/intel/types";
import { publicSearchQueries, regionMarketSearchTerms } from "@/lib/regionMarketPolymarketTerms";

const POLY_GAMMA = "https://gamma-api.polymarket.com";

function scoreTextMatch(text: string, terms: string[]): number {
  const t = text.toLowerCase();
  let score = 0;
  for (const term of terms) {
    if (t.includes(term)) score += 1;
  }
  return score;
}

const GEO_MARKET_DENY_TERMS = [
  "world cup",
  "champions league",
  "premier league",
  "nfl",
  "nba",
  "mlb",
  "nhl",
  "tennis",
  "golf",
  "olympics",
  "super bowl",
  "movie",
  "box office",
  "album",
  "grammy",
  "oscar",
  "celebrity",
  "fashion",
  "reality show",
  "openai",
  "chatgpt",
  "anthropic",
  "gemini",
  "xai",
  "elon musk",
];

const GEO_MARKET_ALLOW_TERMS = [
  "election",
  "president",
  "prime minister",
  "parliament",
  "congress",
  "senate",
  "government",
  "regime",
  "coup",
  "war",
  "military",
  "missile",
  "strike",
  "drone",
  "airstrike",
  "ceasefire",
  "peace",
  "treaty",
  "deal",
  "sanction",
  "tariff",
  "embargo",
  "nato",
  "un ",
  "united nations",
  "china",
  "taiwan",
  "iran",
  "israel",
  "ukraine",
  "russia",
  "gaza",
  "palestine",
  "sudan",
  "north korea",
  "south korea",
  "middle east",
  "red sea",
  "hormuz",
  "shipping",
  "oil",
  "energy",
  "opec",
  "nuclear",
  "sanctions",
  "invasion",
  "troops",
  "border",
  "embassy",
  "diplomat",
  "foreign policy",
];

function hasGeoDeny(text: string): boolean {
  const t = text.toLowerCase();
  return GEO_MARKET_DENY_TERMS.some((term) => t.includes(term));
}

function isModerateGeopoliticalMarket(text: string): boolean {
  const t = text.toLowerCase();
  if (hasGeoDeny(t)) return false;
  return GEO_MARKET_ALLOW_TERMS.some((term) => t.includes(term));
}

type Candidate = {
  row: Record<string, unknown>;
  title: string;
  context: string;
  score: number;
  yesPct: number | null;
};

function pickRankedOrFallback(rows: Candidate[]): Candidate[] {
  const byScore = (a: Candidate, b: Candidate) => b.score - a.score;
  const strict = rows
    .filter(
      (x) =>
        x.title &&
        x.score > 0 &&
        x.yesPct !== null &&
        !hasGeoDeny(x.context) &&
        isModerateGeopoliticalMarket(x.context)
    )
    .sort(byScore)
    .slice(0, 3);
  if (strict.length > 0) return strict;
  return rows
    .filter(
      (x) =>
        x.title &&
        x.score > 0 &&
        x.yesPct !== null &&
        !hasGeoDeny(x.context) &&
        (x.score >= 2 || isModerateGeopoliticalMarket(x.context))
    )
    .sort(byScore)
    .slice(0, 3);
}

function toPct(v: number): number {
  if (!Number.isFinite(v)) return 50;
  if (v <= 1) return Math.max(1, Math.min(99, Math.round(v * 100)));
  return Math.max(1, Math.min(99, Math.round(v)));
}

function parseJsonArrayMaybe(raw: unknown): unknown[] | null {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const p = JSON.parse(raw);
      return Array.isArray(p) ? p : null;
    } catch {
      return null;
    }
  }
  return null;
}

function parsePolymarketYesPct(row: Record<string, unknown>): number | null {
  const prob = row.probability;
  if (typeof prob === "number") return toPct(prob);
  const yesPrice = row.lastTradePrice;
  if (typeof yesPrice === "number") return toPct(yesPrice);
  const outcomes = parseJsonArrayMaybe(row.outcomes);
  const outcomePrices = parseJsonArrayMaybe(row.outcomePrices);
  if (outcomes && outcomePrices && outcomes.length === outcomePrices.length) {
    const yesIdx = outcomes.findIndex((o) => String(o).toLowerCase() === "yes");
    if (yesIdx >= 0) {
      const raw = outcomePrices[yesIdx];
      const n = Number(raw);
      if (!Number.isNaN(n)) return toPct(n <= 1 ? n * 100 : n);
    }
  }
  return null;
}

function buildContext(row: Record<string, unknown>): string {
  return String(
    `${row.question ?? ""} ${row.title ?? ""} ${row.description ?? ""} ${row.category ?? ""} ${row.slug ?? ""} ${row.tags ?? ""}`
  ).trim();
}

function dedupeKey(row: Record<string, unknown>): string {
  return String(row.conditionId ?? row.id ?? row.slug ?? "").trim();
}

function flattenPublicSearchEvents(json: unknown): Record<string, unknown>[] {
  if (!json || typeof json !== "object") return [];
  const events = (json as { events?: unknown[] }).events;
  if (!Array.isArray(events)) return [];
  const out: Record<string, unknown>[] = [];
  for (const ev of events) {
    if (!ev || typeof ev !== "object") continue;
    const e = ev as { slug?: string; markets?: unknown[] };
    const markets = e.markets;
    if (!Array.isArray(markets)) continue;
    for (const m of markets) {
      if (!m || typeof m !== "object") continue;
      const row = { ...(m as Record<string, unknown>) };
      const slug = String(row.slug ?? e.slug ?? "").trim();
      if (slug) {
        row.slug = slug;
        row.url = `https://polymarket.com/event/${slug}`;
      }
      out.push(row);
    }
  }
  return out;
}

function isOpenMarket(row: Record<string, unknown>): boolean {
  return row.active === true && row.closed === false;
}

async function fetchPolymarketQuotes(name: string): Promise<RegionMarketQuote[]> {
  try {
    const terms = regionMarketSearchTerms(name);
    const queries = publicSearchQueries(name);

    const bulkUrl = `${POLY_GAMMA}/markets?active=true&closed=false&limit=2000`;
    const searchUrls = queries.map((q) => {
      const u = new URL(`${POLY_GAMMA}/public-search`);
      u.searchParams.set("q", q);
      u.searchParams.set("search_profiles", "false");
      u.searchParams.set("search_tags", "false");
      u.searchParams.set("limit_per_type", "15");
      u.searchParams.set("keep_closed_markets", "0");
      return u.toString();
    });

    const responses = await Promise.all([
      fetch(bulkUrl, { cache: "no-store" }),
      ...searchUrls.map((u) => fetch(u, { cache: "no-store" })),
    ]);

    const [bulkRes, ...searchRes] = responses;
    const rawRows: Record<string, unknown>[] = [];

    if (bulkRes.ok) {
      const bulk = (await bulkRes.json()) as Array<Record<string, unknown>>;
      rawRows.push(...bulk);
    }

    for (const sr of searchRes) {
      if (!sr.ok) continue;
      const j = await sr.json();
      const flat = flattenPublicSearchEvents(j).filter(isOpenMarket);
      rawRows.push(...flat);
    }

    const seen = new Set<string>();
    const merged: Record<string, unknown>[] = [];
    for (const row of rawRows) {
      const key = dedupeKey(row);
      if (!key) continue;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(row);
    }

    const candidates: Candidate[] = merged.map((row) => {
      const title = String(row.question ?? row.title ?? "").trim();
      const context = buildContext(row);
      const score = scoreTextMatch(context, terms);
      const yesPct = parsePolymarketYesPct(row);
      return { row, title, score, yesPct, context };
    });

    const relevant = candidates.filter((x) => x.score > 0);
    const ranked = pickRankedOrFallback(relevant);
    return ranked.map((x) => {
      const slug = String(x.row.slug ?? "").trim();
      const url =
        String(x.row.url ?? "").startsWith("http")
          ? String(x.row.url)
          : slug
            ? `https://polymarket.com/event/${slug}`
            : undefined;
      return {
        provider: "Polymarket",
        title: x.title,
        yesChancePct: x.yesPct ?? 50,
        noChancePct: 100 - (x.yesPct ?? 50),
        updatedAt: new Date().toISOString(),
        url,
      };
    });
  } catch {
    return [];
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const name = (searchParams.get("name") ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "Missing name" }, { status: 400 });
  }
  const poly = await fetchPolymarketQuotes(name);
  return NextResponse.json({ markets: poly.slice(0, 6) });
}
