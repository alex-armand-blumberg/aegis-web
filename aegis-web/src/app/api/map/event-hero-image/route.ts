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

function isBlockedHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local")) return true;
  if (h === "0.0.0.0") return true;
  const ipv4 = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
  }
  return false;
}

async function fetchCommonsImageUrl(
  query: string,
  exclude: Set<string>
): Promise<string | null> {
  try {
    // Search Commons for File: pages.
    const srsearch = `${query} conflict photo`;
    const searchUrl = `https://commons.wikimedia.org/w/api.php?action=query&list=search&srnamespace=6&srsearch=${encodeURIComponent(
      srsearch
    )}&format=json&srlimit=6`;
    const searchRes = await fetch(searchUrl, { cache: "no-store" });
    if (!searchRes.ok) return null;
    const searchJson = (await searchRes.json()) as {
      query?: { search?: Array<{ title?: string }> };
    };
    const titles =
      searchJson.query?.search
        ?.map((r) => String(r.title ?? "").trim())
        .filter((t) => t.toLowerCase().startsWith("file:"))
        .slice(0, 4) ?? [];
    if (titles.length === 0) return null;

    const infoUrl = `https://commons.wikimedia.org/w/api.php?action=query&prop=imageinfo&iiprop=url&iiurlwidth=1600&format=json&titles=${encodeURIComponent(
      titles.join("|")
    )}`;
    const infoRes = await fetch(infoUrl, { cache: "no-store" });
    if (!infoRes.ok) return null;
    const infoJson = (await infoRes.json()) as {
      query?: { pages?: Record<string, { imageinfo?: Array<{ url?: string }> }> };
    };

    const pageList = Object.values(infoJson.query?.pages ?? {});
    for (const page of pageList) {
      const url = page.imageinfo?.[0]?.url ? String(page.imageinfo[0].url) : "";
      if (!url) continue;
      if (exclude.has(url)) continue;
      try {
        const host = new URL(url).hostname;
        if (isBlockedHostname(host)) continue;
      } catch {
        continue;
      }
      return url;
    }
    return null;
  } catch {
    return null;
  }
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
  if (picked) {
    cache.set(cacheKey, {
      imageUrl: picked,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });
    return NextResponse.json({ imageUrl: picked });
  }

  // Wikimedia Commons fallback (no API key; may be slower but prevents placeholders).
  const commonsPicked = await fetchCommonsImageUrl(query, exclude);
  if (!commonsPicked) {
    return NextResponse.json({ error: "No image found" }, { status: 404 });
  }
  cache.set(cacheKey, {
    imageUrl: commonsPicked,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
  return NextResponse.json({ imageUrl: commonsPicked });
}

