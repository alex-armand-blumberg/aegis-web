import { NextResponse } from "next/server";
import type { RegionMarketQuote } from "@/lib/intel/types";

const POLY_GAMMA = "https://gamma-api.polymarket.com";

function regionMarketSearchTerms(name: string): string[] {
  const n = name.toLowerCase();
  if (n.includes("south china sea")) return ["china", "taiwan", "philippines", "navy"];
  if (n.includes("hormuz")) return ["iran", "oil", "shipping", "middle east"];
  if (n.includes("indian ocean")) return ["iran", "shipping", "india", "red sea"];
  if (n.includes("arctic")) return ["arctic", "oil", "russia", "nato"];
  if (n.includes("antarctica")) return ["antarctica", "resources", "treaty", "climate"];
  if (n.includes("atlantic")) return ["nato", "shipping", "russia", "carrier"];
  const tokens = n.split(/\s+/).filter(Boolean);
  if (n.includes("united states")) tokens.push("us", "usa", "america", "u.s.");
  if (n.includes("united kingdom")) tokens.push("uk", "britain", "u.k.");
  if (n.includes("judea") || n.includes("palestine")) tokens.push("palestine", "gaza", "west bank", "israel");
  if (n.includes("russia")) tokens.push("russian");
  if (n.includes("ukraine")) tokens.push("ukrainian");
  if (n.includes("iran")) tokens.push("iranian");
  if (n.includes("afghanistan")) tokens.push("afghan", "taliban", "kabul");
  if (n.includes("israel")) tokens.push("israeli", "tel aviv", "jerusalem", "gaza");
  if (n.includes("russia")) tokens.push("moscow");
  if (n.includes("china")) tokens.push("beijing");
  if (n.includes("india")) tokens.push("indian");
  if (n.includes("pakistan")) tokens.push("pakistani");
  if (n.includes("sudan")) tokens.push("khartoum", "darfur");
  return Array.from(new Set(tokens));
}

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
];

function isModerateGeopoliticalMarket(text: string): boolean {
  const t = text.toLowerCase();
  if (GEO_MARKET_DENY_TERMS.some((term) => t.includes(term))) return false;
  return GEO_MARKET_ALLOW_TERMS.some((term) => t.includes(term));
}

function pickRankedOrFallback<T extends { title: string; score: number; yesPct: number | null }>(
  rows: T[]
): T[] {
  const strict = rows
    .filter((x) => x.title && x.score > 0 && x.yesPct !== null && isModerateGeopoliticalMarket(x.title))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  if (strict.length > 0) return strict;
  return rows
    .filter((x) => x.title && x.score > 0 && x.yesPct !== null && isModerateGeopoliticalMarket(x.title))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

function toPct(v: number): number {
  if (!Number.isFinite(v)) return 50;
  if (v <= 1) return Math.max(1, Math.min(99, Math.round(v * 100)));
  return Math.max(1, Math.min(99, Math.round(v)));
}

function parsePolymarketYesPct(row: Record<string, unknown>): number | null {
  const prob = row.probability;
  if (typeof prob === "number") return toPct(prob);
  const yesPrice = row.lastTradePrice;
  if (typeof yesPrice === "number") return toPct(yesPrice);
  const outcomes = row.outcomes;
  const outcomePrices = row.outcomePrices;
  if (Array.isArray(outcomes) && Array.isArray(outcomePrices)) {
    const yesIdx = outcomes.findIndex((o) => String(o).toLowerCase() === "yes");
    if (yesIdx >= 0) {
      const raw = outcomePrices[yesIdx];
      const n = Number(raw);
      if (!Number.isNaN(n)) return toPct(n <= 1 ? n * 100 : n);
    }
  }
  return null;
}

async function fetchPolymarketQuotes(name: string): Promise<RegionMarketQuote[]> {
  try {
    const terms = regionMarketSearchTerms(name);
    const res = await fetch(`${POLY_GAMMA}/markets?active=true&closed=false&limit=2000`, {
      cache: "no-store",
    });
    if (!res.ok) return [];
    const rows = (await res.json()) as Array<Record<string, unknown>>;
    const candidates = rows
      .map((row) => {
        const title = String(row.question ?? row.title ?? "").trim();
        const context = String(
          `${row.question ?? ""} ${row.title ?? ""} ${row.description ?? ""} ${row.category ?? ""} ${row.slug ?? ""} ${row.tags ?? ""}`
        ).trim();
        const score = scoreTextMatch(context, terms);
        const yesPct = parsePolymarketYesPct(row);
        return { row, title, score, yesPct, context };
      });
    const ranked = pickRankedOrFallback(
      candidates.filter((x) => isModerateGeopoliticalMarket(x.context))
    );
    return ranked.map((x) => ({
      provider: "Polymarket",
      title: x.title,
      yesChancePct: x.yesPct ?? 50,
      noChancePct: 100 - (x.yesPct ?? 50),
      updatedAt: new Date().toISOString(),
      url: String(x.row.url ?? "").startsWith("http")
        ? String(x.row.url)
        : String(x.row.slug ?? "").trim()
          ? `https://polymarket.com/event/${String(x.row.slug).trim()}`
          : undefined,
    }));
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
