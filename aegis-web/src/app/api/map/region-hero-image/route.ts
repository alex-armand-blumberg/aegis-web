import { NextResponse } from "next/server";
import {
  fetchSerperImageUrls,
  pickFirstNonExcludedImageUrl,
} from "@/lib/eventHeroImageSearch";

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { imageUrl: string | null; expiresAt: number }>();

function safeSplitExclude(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 50);
}

function isFlagLikeUrl(url: string): boolean {
  const u = url.toLowerCase();
  return (
    u.includes("flag") ||
    u.includes("flags") ||
    u.includes("emblem") ||
    u.includes("coat-of-arms")
  );
}

function isLikelyGraphicMapUrl(url: string): boolean {
  const u = url.toLowerCase();
  return (
    u.includes("map") ||
    u.includes("maps") ||
    u.includes("border") ||
    u.includes("infographic") ||
    u.includes("graphic") ||
    u.includes("diagram") ||
    u.includes("vector") ||
    u.includes("icon") ||
    u.includes("chart") ||
    u.includes("illustration") ||
    u.includes("render")
  );
}

function isLikelyBlackAndWhiteOrHistoricalUrl(url: string): boolean {
  const u = url.toLowerCase();
  return (
    u.includes("black-and-white") ||
    u.includes("blackandwhite") ||
    u.includes("black_white") ||
    u.includes("grayscale") ||
    u.includes("greyscale") ||
    u.includes("monochrome") ||
    u.includes("/bw/") ||
    u.includes("-bw-") ||
    u.includes("_bw_") ||
    u.includes("vintage") ||
    u.includes("archival") ||
    u.includes("archive-photo") ||
    u.includes("historic") ||
    u.includes("historical")
  );
}

function buildRegionImageQuery(name: string, kind: string): string {
  const suffix =
    kind === "ocean"
      ? "maritime security conflict photojournalism"
      : "geopolitical conflict event photojournalism";
  return `${name} ${suffix} color current 2024 2025 2026 -map -border -infographic -diagram -graphic -flag -black-and-white -monochrome -historic -historical -archive -vintage`
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 320);
}

async function isRenderableImageUrl(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);
    const res = await fetch(url, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "user-agent": "AEGIS-RegionImage/1.0",
        accept: "image/*,*/*;q=0.8",
      },
    });
    clearTimeout(timeout);
    if (!res.ok) return false;
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (!ct.startsWith("image/")) return false;
    return true;
  } catch {
    return false;
  }
}

async function fetchCommonsImageUrl(query: string, exclude: Set<string>): Promise<string | null> {
  try {
    const searchUrl = `https://commons.wikimedia.org/w/api.php?action=query&list=search&srnamespace=6&srsearch=${encodeURIComponent(
      `${query} photo`
    )}&format=json&srlimit=8`;
    const searchRes = await fetch(searchUrl, { cache: "no-store" });
    if (!searchRes.ok) return null;
    const searchJson = (await searchRes.json()) as {
      query?: { search?: Array<{ title?: string }> };
    };
    const titles =
      searchJson.query?.search
        ?.map((r) => String(r.title ?? "").trim())
        .filter((t) => t.toLowerCase().startsWith("file:"))
        .slice(0, 6) ?? [];
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
      if (
        isFlagLikeUrl(url) ||
        isLikelyGraphicMapUrl(url) ||
        isLikelyBlackAndWhiteOrHistoricalUrl(url)
      ) {
        continue;
      }
      if (await isRenderableImageUrl(url)) return url;
    }
    return null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const name = (searchParams.get("name") ?? "").trim();
  const kind = (searchParams.get("kind") ?? "country").trim().toLowerCase();
  if (!name) return NextResponse.json({ error: "Missing name" }, { status: 400 });

  const apiKey = process.env.SERPER_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: "Missing SERPER_API_KEY" }, { status: 404 });
  }

  const exclude = new Set(safeSplitExclude(searchParams.get("exclude")));
  const cacheKey = `${kind}|${name}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    if (cached.imageUrl && !exclude.has(cached.imageUrl)) {
      return NextResponse.json({ imageUrl: cached.imageUrl });
    }
  }

  const query = buildRegionImageQuery(name, kind);
  const candidates = (await fetchSerperImageUrls(query, apiKey)).filter(
    (url) =>
      !isFlagLikeUrl(url) &&
      !isLikelyGraphicMapUrl(url) &&
      !isLikelyBlackAndWhiteOrHistoricalUrl(url)
  );
  const ranked = candidates.filter((url) => !exclude.has(url));
  let picked = pickFirstNonExcludedImageUrl({ candidates: ranked, exclude });
  if (picked && !(await isRenderableImageUrl(picked))) {
    picked = null;
  }
  if (!picked) {
    for (const candidate of ranked.slice(0, 8)) {
      if (await isRenderableImageUrl(candidate)) {
        picked = candidate;
        break;
      }
    }
  }
  if (!picked) {
    picked = await fetchCommonsImageUrl(query, exclude);
  }
  if (!picked) return NextResponse.json({ error: "No image found" }, { status: 404 });
  cache.set(cacheKey, { imageUrl: picked, expiresAt: Date.now() + CACHE_TTL_MS });
  return NextResponse.json({ imageUrl: picked });
}
