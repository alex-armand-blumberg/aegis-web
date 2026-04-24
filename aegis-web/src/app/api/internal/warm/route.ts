import { NextResponse } from "next/server";

export const maxDuration = 300;

const DEFAULT_PRIORITY_ESCALATION_COUNTRIES = [
  "Ukraine",
  "Israel",
  "Iran",
  "Taiwan",
  "China",
  "Russia",
  "United States of America",
  "North Korea",
  "South Korea",
  "India",
  "Pakistan",
  "Syria",
  "Iraq",
  "Yemen",
  "Lebanon",
  "Sudan",
  "Myanmar",
  "Afghanistan",
  "Haiti",
  "Venezuela",
  "Ethiopia",
  "Somalia",
  "Mexico",
  "Turkey",
];

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
    await res.text();
    return { ok: res.ok, status: res.status, elapsedMs: Date.now() - started };
  } catch {
    return { ok: false, status: 0, elapsedMs: Date.now() - started };
  }
}

function selectBatch<T>(items: T[], batch: number, batches: number): T[] {
  if (batches <= 1) return items;
  const zeroBasedBatch = Math.max(0, Math.min(batches - 1, batch - 1));
  return items.filter((_, idx) => idx % batches === zeroBasedBatch);
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const baseUrl = `${url.protocol}//${url.host}`;
  const scope = (url.searchParams.get("scope") ?? "all").toLowerCase();
  const batches = Math.max(1, Number(url.searchParams.get("batches") ?? 1) || 1);
  const batch = Math.max(1, Number(url.searchParams.get("batch") ?? 1) || 1);

  const mapRanges = ["1h", "6h", "24h", "7d", "30d"];
  const mapJobs: string[] = [];
  if (scope === "all" || scope === "map") {
    for (const range of mapRanges) {
      mapJobs.push(`${baseUrl}/api/map?range=${encodeURIComponent(range)}&refresh=stale`);
    }
  }

  const countries = (process.env.WARM_ESCALATION_COUNTRIES ?? DEFAULT_PRIORITY_ESCALATION_COUNTRIES.join(","))
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const selectedCountries = selectBatch(countries, batch, batches);
  const escalationJobs: string[] = [];
  if (scope === "all" || scope === "escalation") {
    for (const country of selectedCountries) {
      escalationJobs.push(
        `${baseUrl}/api/escalation?country=${encodeURIComponent(country)}&refresh=stale`
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
      batch,
      batches,
      total: results.length,
      success,
      failed,
      latencyMs: { p50, p95 },
      noCronFallback: `${baseUrl}/api/internal/warm?scope=${encodeURIComponent(scope)}&batch=${batch}&batches=${batches}&secret=YOUR_CRON_SECRET`,
      ranAt: new Date().toISOString(),
      jobs: results,
    },
    { status: failed > 0 ? 207 : 200 }
  );
}
