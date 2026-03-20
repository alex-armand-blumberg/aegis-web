import { NextResponse } from "next/server";

const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

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

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const raw = (searchParams.get("url") ?? "").trim();
    if (!raw) {
      return NextResponse.json({ error: "Missing url" }, { status: 400 });
    }
    let target: URL;
    try {
      target = new URL(raw);
    } catch {
      return NextResponse.json({ error: "Invalid url" }, { status: 400 });
    }
    if (target.protocol !== "http:" && target.protocol !== "https:") {
      return NextResponse.json({ error: "Unsupported protocol" }, { status: 400 });
    }
    if (isBlockedHostname(target.hostname)) {
      return NextResponse.json({ error: "Blocked host" }, { status: 400 });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 9000);
    const res = await fetch(target.href, {
      signal: controller.signal,
      cache: "no-store",
      headers: {
        "user-agent": "AEGIS-ImageProxy/1.0",
        accept: "image/*,*/*;q=0.8",
      },
    });
    clearTimeout(timeout);
    if (!res.ok) {
      return NextResponse.json({ error: `Upstream ${res.status}` }, { status: 502 });
    }
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.toLowerCase().startsWith("image/")) {
      return NextResponse.json({ error: "Upstream is not image content" }, { status: 415 });
    }
    const ab = await res.arrayBuffer();
    if (ab.byteLength > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: "Image too large" }, { status: 413 });
    }
    return new NextResponse(ab, {
      status: 200,
      headers: {
        "content-type": contentType,
        "cache-control": "public, max-age=300, s-maxage=300",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Image proxy failed" },
      { status: 500 }
    );
  }
}
