import { NextResponse } from "next/server";
import {
  fetchSerperImageUrls,
  pickFirstNonExcludedImageUrl,
} from "@/lib/eventHeroImageSearch";
import type { RegionIntelResponse } from "@/lib/intel/types";

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

function isLikelyNonMilitaryCivilianUrl(url: string): boolean {
  const u = url.toLowerCase();
  return (
    u.includes("protest") ||
    u.includes("parade") ||
    u.includes("olympic") ||
    u.includes("football") ||
    u.includes("soccer") ||
    u.includes("celebration") ||
    u.includes("festival")
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

const MILITARY_NEGATIVE =
  "-protest -parade -sport -celebration -map -infographic -diagram -graphic -border -flag -black-and-white -monochrome -historic -historical -archive -vintage";

function buildRegionImageQuery(name: string, kind: string): string {
  const suffix =
    kind === "ocean"
      ? "naval fleet warship navy exercise maritime military photo color"
      : "military army navy air force tank soldier warship fighter jet armed forces photo color";
  return `${name} ${suffix} current 2024 2025 2026 ${MILITARY_NEGATIVE}`
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 320);
}

function buildFallbackQueries(name: string, kind: string, contextTerms: string[]): string[] {
  const ctx = contextTerms.length > 0 ? contextTerms.join(" ") : "";
  if (kind === "ocean") {
    return [
      `${name} naval exercise warship fleet maritime military navy photo color ${MILITARY_NEGATIVE}`,
      `${name} navy destroyer carrier maritime military photo ${MILITARY_NEGATIVE}`,
      `${name} naval fleet military maritime photo Reuters AP ${MILITARY_NEGATIVE}`,
    ]
      .map((q) => q.replace(/\s+/g, " ").trim().slice(0, 320))
      .filter(Boolean);
  }
  return [
    `${name} military army navy air force tank soldier armed forces photo ${ctx} Reuters AP AFP Getty current ${MILITARY_NEGATIVE}`,
    `${name} military exercise troops defense forces photo ${ctx} ${MILITARY_NEGATIVE}`,
    `${name} army navy air force warship fighter jet military photo ${MILITARY_NEGATIVE}`,
    `${name} armed forces military hardware defense photo ${MILITARY_NEGATIVE}`,
  ]
    .map((q) => q.replace(/\s+/g, " ").trim().slice(0, 320))
    .filter(Boolean);
}

function normalizeToken(t: string): string {
  return t
    .toLowerCase()
    .replace(/[^a-z0-9\- ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildContextEventTerms(intel: RegionIntelResponse | null): string[] {
  if (!intel) return [];
  const stop = new Set([
    "the",
    "and",
    "with",
    "from",
    "into",
    "over",
    "near",
    "current",
    "country",
    "region",
    "context",
    "event",
    "report",
    "news",
    "intel",
  ]);
  const ranked = intel.dataPoints
    .filter((p) =>
      p.layer === "liveStrikes" ||
      p.layer === "conflicts" ||
      p.layer === "vessels" ||
      p.layer === "carriers" ||
      p.layer === "flights"
    )
    .slice(0, 20);
  const counts = new Map<string, number>();
  for (const p of ranked) {
    const text = `${p.title} ${p.subtitle ?? ""} ${String(p.metadata?.event_type ?? "")}`;
    for (const raw of normalizeToken(text).split(" ")) {
      if (!raw || raw.length < 4 || stop.has(raw)) continue;
      counts.set(raw, (counts.get(raw) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([token]) => token);
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

async function fetchCommonsImageUrl(
  exclude: Set<string>,
  kind: string,
  regionName: string
): Promise<string | null> {
  try {
    const commonsSearch =
      kind === "ocean"
        ? `${regionName} naval warship navy military maritime`
        : `${regionName} military army navy armed forces air force tank`;
    const searchUrl = `https://commons.wikimedia.org/w/api.php?action=query&list=search&srnamespace=6&srsearch=${encodeURIComponent(
      `${commonsSearch} photo`
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
        isLikelyBlackAndWhiteOrHistoricalUrl(url) ||
        isLikelyNonMilitaryCivilianUrl(url)
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
  const { searchParams, origin } = new URL(request.url);
  const name = (searchParams.get("name") ?? "").trim();
  const kind = (searchParams.get("kind") ?? "country").trim().toLowerCase();
  const key = (searchParams.get("key") ?? "").trim();
  const range = (searchParams.get("range") ?? "7d").trim();
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

  let intel: RegionIntelResponse | null = null;
  if (key) {
    try {
      const intelRes = await fetch(
        `${origin}/api/map/region?kind=${encodeURIComponent(kind)}&key=${encodeURIComponent(
          key
        )}&name=${encodeURIComponent(name)}&range=${encodeURIComponent(range)}`,
        { cache: "no-store" }
      );
      if (intelRes.ok) {
        intel = (await intelRes.json()) as RegionIntelResponse;
      }
    } catch {
      intel = null;
    }
  }

  const contextTerms = buildContextEventTerms(intel);
  const primaryQuery = `${buildRegionImageQuery(name, kind)} ${
    contextTerms.length > 0 ? contextTerms.join(" ") : "armed forces defense military exercise"
  } Reuters AP AFP Getty`;
  const allQueries = [primaryQuery, ...buildFallbackQueries(name, kind, contextTerms)];
  let picked: string | null = null;

  for (const query of allQueries) {
    const candidates = (await fetchSerperImageUrls(query, apiKey)).filter(
      (url) =>
        !isFlagLikeUrl(url) &&
        !isLikelyGraphicMapUrl(url) &&
        !isLikelyBlackAndWhiteOrHistoricalUrl(url) &&
        !isLikelyNonMilitaryCivilianUrl(url)
    );
    const ranked = candidates.filter((url) => !exclude.has(url));
    picked = pickFirstNonExcludedImageUrl({ candidates: ranked, exclude });
    if (picked && (await isRenderableImageUrl(picked))) {
      break;
    }
    picked = null;
    for (const candidate of ranked.slice(0, 10)) {
      if (
        isLikelyNonMilitaryCivilianUrl(candidate) ||
        !(await isRenderableImageUrl(candidate))
      ) {
        continue;
      }
      picked = candidate;
      break;
    }
    if (picked) break;
  }

  if (!picked) {
    picked = await fetchCommonsImageUrl(exclude, kind, name);
  }
  if (!picked) return NextResponse.json({ error: "No image found" }, { status: 404 });
  cache.set(cacheKey, { imageUrl: picked, expiresAt: Date.now() + CACHE_TTL_MS });
  return NextResponse.json({ imageUrl: picked });
}
