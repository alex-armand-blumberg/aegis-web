import { NextResponse } from "next/server";
import {
  buildEventHeroImageQuery,
  fetchSerperImageUrls,
  pickFirstNonExcludedImageUrl,
} from "@/lib/eventHeroImageSearch";

const CACHE_TTL_MS = 60_000;

type HeroImageSearchCacheRow = {
  imageUrl: string | null;
  expiresAt: number;
};

const cache = new Map<string, HeroImageSearchCacheRow>();
const rateLimit = new Map<string, number>(); // key -> ms timestamp

function safeSplitExclude(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 30);
}

function shouldRateLimit(key: string): boolean {
  const now = Date.now();
  const last = rateLimit.get(key);
  if (last && now - last < 2500) return true;
  rateLimit.set(key, now);
  return false;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const title = (searchParams.get("title") ?? "").trim();
  const country = (searchParams.get("country") ?? "").trim();
  const layer = (searchParams.get("layer") ?? "").trim();
  const eventType = (searchParams.get("eventType") ?? "").trim();
  const excludeList = safeSplitExclude(searchParams.get("exclude"));

  if (!title) {
    return NextResponse.json({ error: "Missing title" }, { status: 400 });
  }

  const query = buildEventHeroImageQuery({ title, country, layer, eventType });
  if (!query) return NextResponse.json({ error: "No query" }, { status: 404 });

  const apiKey = process.env.SERPER_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: "Missing SERPER_API_KEY" }, { status: 404 });
  }

  const cacheKey = `${layer}|${title}|${country}|${eventType}`.slice(0, 320);
  const exclude = new Set(excludeList);
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    if (cached.imageUrl && !exclude.has(cached.imageUrl)) {
      return NextResponse.json({ imageUrl: cached.imageUrl });
    }
    // If the cached URL is now excluded, do a fresh search.
  }

  if (shouldRateLimit(cacheKey)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const candidates = await fetchSerperImageUrls(query, apiKey);
  const picked = pickFirstNonExcludedImageUrl({ candidates, exclude });

  cache.set(cacheKey, {
    imageUrl: picked,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });

  if (!picked) {
    return NextResponse.json({ error: "No image found" }, { status: 404 });
  }
  return NextResponse.json({ imageUrl: picked });
}

