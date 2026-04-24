import { NextResponse } from "next/server";

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return true;
  const auth = request.headers.get("authorization")?.trim() ?? "";
  if (auth === `Bearer ${secret}`) return true;
  const url = new URL(request.url);
  return url.searchParams.get("secret") === secret;
}

async function safeFetch(url: string): Promise<{ ok: boolean; status: number; elapsedMs: number }> {
  const started = Date.now();
  try {
    const res = await fetch(url, {
      method: "GET",
      cache: "no-store",
      headers: {
        "x-aegis-warmer": "1",
      },
    });
    return { ok: res.ok, status: res.status, elapsedMs: Date.now() - started };
  } catch {
    return { ok: false, status: 0, elapsedMs: Date.now() - started };
  }
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const baseUrl = `${url.protocol}//${url.host}`;
  const scope = (url.searchParams.get("scope") ?? "all").toLowerCase();

  const mapRanges = ["1h", "6h", "24h", "7d", "30d"];
  const mapJobs: string[] = [];
  if (scope === "all" || scope === "map") {
    for (const range of mapRanges) {
      mapJobs.push(`${baseUrl}/api/map?range=${encodeURIComponent(range)}`);
    }
  }

  const defaultCountries = ["Ukraine", "Israel", "Taiwan", "Iran", "United States", "China"];
  const countries = (process.env.WARM_ESCALATION_COUNTRIES ?? defaultCountries.join(","))
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const escalationJobs: string[] = [];
  if (scope === "all" || scope === "escalation") {
    for (const country of countries) {
      escalationJobs.push(
        `${baseUrl}/api/escalation?country=${encodeURIComponent(country)}`
      );
    }
  }

  const jobs = [...mapJobs, ...escalationJobs];
  const maxConcurrent = Math.max(1, Number(process.env.WARM_MAX_CONCURRENCY ?? 4));
  const queue = [...jobs];
  const results: Array<{ url: string; ok: boolean; status: number; elapsedMs: number }> = [];

  const workers = Array.from({ length: Math.min(maxConcurrent, queue.length || 1) }, async () => {
    while (queue.length > 0) {
      const job = queue.shift();
      if (!job) continue;
      const res = await safeFetch(job);
      results.push({ url: job, ...res });
    }
  });
  await Promise.all(workers);

  const success = results.filter((r) => r.ok).length;
  const failed = results.length - success;
  const durations = results.map((r) => r.elapsedMs).sort((a, b) => a - b);
  const p50 =
    durations.length > 0 ? durations[Math.min(durations.length - 1, Math.floor(durations.length * 0.5))] : 0;
  const p95 =
    durations.length > 0 ? durations[Math.min(durations.length - 1, Math.floor(durations.length * 0.95))] : 0;
  return NextResponse.json(
    {
      scope,
      total: results.length,
      success,
      failed,
      latencyMs: { p50, p95 },
      noCronFallback: `${baseUrl}/api/internal/warm?scope=${encodeURIComponent(scope)}&secret=YOUR_CRON_SECRET`,
      ranAt: new Date().toISOString(),
      jobs: results,
    },
    { status: failed > 0 ? 207 : 200 }
  );
}
