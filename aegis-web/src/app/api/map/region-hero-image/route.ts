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

function buildRegionImageQuery(name: string, kind: string): string {
  const suffix =
    kind === "ocean"
      ? "maritime security conflict photojournalism"
      : "geopolitical conflict event photojournalism";
  return `${name} ${suffix} -map -border -infographic -diagram -graphic -flag`
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 260);
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
    (url) => !isFlagLikeUrl(url) && !isLikelyGraphicMapUrl(url)
  );
  const picked = pickFirstNonExcludedImageUrl({ candidates, exclude });
  if (!picked) {
    return NextResponse.json({ error: "No image found" }, { status: 404 });
  }

  cache.set(cacheKey, { imageUrl: picked, expiresAt: Date.now() + CACHE_TTL_MS });
  return NextResponse.json({ imageUrl: picked });
}
