import { NextResponse } from "next/server";

const MAX_HTML_BYTES = 512 * 1024;
const FETCH_TIMEOUT_MS = 10_000;

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

function absolutizeUrl(base: string, candidate: string): string | null {
  try {
    const u = new URL(candidate.trim(), base);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.href;
  } catch {
    return null;
  }
}

function pickMetaContent(html: string, prop: string, value: string): string | null {
  const re = new RegExp(
    `<meta[^>]+property=["']${prop}["'][^>]+content=["']([^"']+)["']`,
    "i"
  );
  const m1 = html.match(re);
  if (m1?.[1]) return m1[1].trim();
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${prop}["']`,
    "i"
  );
  const m2 = html.match(re2);
  if (m2?.[1]) return m2[1].trim();
  const reName = new RegExp(
    `<meta[^>]+name=["']${value}["'][^>]+content=["']([^"']+)["']`,
    "i"
  );
  const m3 = html.match(reName);
  if (m3?.[1]) return m3[1].trim();
  const reName2 = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${value}["']`,
    "i"
  );
  const m4 = html.match(reName2);
  return m4?.[1]?.trim() ?? null;
}

function pickFirstLargeImg(html: string, pageUrl: string): string | null {
  const imgRe = /<img[^>]+>/gi;
  let best: { url: string; score: number } | null = null;
  let m: RegExpExecArray | null;
  while ((m = imgRe.exec(html)) !== null) {
    const tag = m[0];
    const srcMatch = tag.match(/\bsrc=["']([^"']+)["']/i);
    if (!srcMatch?.[1]) continue;
    const abs = absolutizeUrl(pageUrl, srcMatch[1]);
    if (!abs) continue;
    const low = abs.toLowerCase();
    if (low.includes("pixel") || low.includes("tracking") || low.includes("1x1")) continue;
    let score = 0;
    const w = tag.match(/\bwidth=["']?(\d+)/i);
    const h = tag.match(/\bheight=["']?(\d+)/i);
    if (w) score += Math.min(Number(w[1]), 800);
    if (h) score += Math.min(Number(h[1]), 800);
    if (/class=["'][^"']*logo/i.test(tag)) score -= 200;
    if (!best || score > best.score) best = { url: abs, score };
  }
  return best?.url ?? null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const raw = searchParams.get("url")?.trim() ?? "";
  if (!raw) {
    return NextResponse.json({ error: "Missing url" }, { status: 400 });
  }

  let pageUrl: URL;
  try {
    pageUrl = new URL(raw);
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  if (pageUrl.protocol !== "http:" && pageUrl.protocol !== "https:") {
    return NextResponse.json({ error: "Only http(s) URLs are allowed" }, { status: 400 });
  }

  if (isBlockedHostname(pageUrl.hostname)) {
    return NextResponse.json({ error: "URL host not allowed" }, { status: 403 });
  }

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(pageUrl.href, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "User-Agent":
          "AEGISMapArticleImage/1.0 (+https://aegis; article hero preview only)",
      },
    });
    clearTimeout(t);

    if (!res.ok) {
      return NextResponse.json(
        { error: `Upstream status ${res.status}` },
        { status: 404 }
      );
    }

    const ctype = res.headers.get("content-type") ?? "";
    if (!ctype.includes("text/html") && !ctype.includes("application/xhtml")) {
      return NextResponse.json({ error: "Not HTML" }, { status: 404 });
    }

    const reader = res.body?.getReader();
    if (!reader) {
      return NextResponse.json({ error: "Empty body" }, { status: 404 });
    }

    const decoder = new TextDecoder();
    let html = "";
    let total = 0;
    while (total < MAX_HTML_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      html += decoder.decode(value, { stream: true });
      if (total >= MAX_HTML_BYTES) break;
    }
    reader.releaseLock();

    const og =
      pickMetaContent(html, "og:image", "og:image") ??
      pickMetaContent(html, "og:image:url", "og:image:url");
    const tw =
      pickMetaContent(html, "twitter:image", "twitter:image") ??
      pickMetaContent(html, "twitter:image:src", "twitter:image:src");

    const candidates = [og, tw].filter(Boolean) as string[];
    let imageUrl: string | null = null;
    for (const c of candidates) {
      const abs = absolutizeUrl(pageUrl.href, c);
      if (!abs) continue;
      try {
        const host = new URL(abs).hostname;
        if (!isBlockedHostname(host)) {
          imageUrl = abs;
          break;
        }
      } catch {
        /* skip invalid */
      }
    }

    if (!imageUrl) {
      const fallback = pickFirstLargeImg(html, pageUrl.href);
      if (fallback) {
        try {
          if (!isBlockedHostname(new URL(fallback).hostname)) imageUrl = fallback;
        } catch {
          /* skip */
        }
      }
    }

    if (!imageUrl) {
      return NextResponse.json({ error: "No image found" }, { status: 404 });
    }

    return NextResponse.json({ imageUrl });
  } catch (e) {
    clearTimeout(t);
    const msg = e instanceof Error ? e.message : "Fetch failed";
    return NextResponse.json({ error: msg }, { status: 404 });
  }
}
