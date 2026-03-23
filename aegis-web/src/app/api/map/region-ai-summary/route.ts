import { NextResponse } from "next/server";
import type { RegionIntelResponse } from "@/lib/intel/types";

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams, origin } = new URL(request.url);
    const kind = (searchParams.get("kind") ?? "country").trim();
    const key = (searchParams.get("key") ?? "").trim();
    const name = (searchParams.get("name") ?? "").trim();
    const range = (searchParams.get("range") ?? "7d").trim();
    if (!key || !name) {
      return NextResponse.json({ error: "Missing key or name" }, { status: 400 });
    }

    const intelRes = await fetchWithTimeout(
      `${origin}/api/map/region?kind=${encodeURIComponent(kind)}&key=${encodeURIComponent(
        key
      )}&name=${encodeURIComponent(name)}&range=${encodeURIComponent(range)}`,
      { cache: "no-store" },
      9_000
    );
    if (!intelRes.ok) {
      const details = (await intelRes.text().catch(() => "")).slice(0, 300);
      return NextResponse.json(
        { error: details || "Failed region intel context" },
        { status: 502 }
      );
    }
    const intel = (await intelRes.json()) as RegionIntelResponse;

    const topSignals = intel.dataPoints
      .slice(0, 12)
      .map((p) => `${p.timestamp} | ${p.layer} | ${p.title} | ${p.source}`)
      .join("\n");
    const prompt = [
      "Task: Summarize current geopolitical tension for this region with current developments.",
      `Region: ${intel.selection.name} (${intel.selection.kind})`,
      `Range: ${intel.range}`,
      `Escalation index: ${intel.escalationIndex}/100`,
      `Conflict index: ${intel.conflictIndex}/100`,
      `Signals: liveStrikes=${intel.signals.liveStrikes}; conflicts=${intel.signals.conflicts}; flights=${intel.signals.militaryFlights}; vessels=${intel.signals.navalVessels}; carriers=${intel.signals.carrierSignals}`,
      "Recent mapped signals:",
      topSignals || "None",
      "Write 6 concise bullet points.",
      "Include latest geopolitical moves by relevant governments and military actors.",
      "Include at least two quantitative facts/statistics if available from current public reporting.",
      "Use broad current context even beyond mapped points when needed.",
    ].join("\n");

    const aiRes = await fetchWithTimeout(
      `${origin}/api/ai`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "sentinel_qa",
          maxTokens: 620,
          prompt,
        }),
        cache: "no-store",
      },
      18_000
    );
    const aiJson = (await aiRes.json()) as { content?: string; error?: string };
    if (!aiRes.ok) {
      return NextResponse.json(
        { error: aiJson.error ?? "AI summary failed" },
        { status: 502 }
      );
    }
    return NextResponse.json({
      summary:
        aiJson.content?.trim() ||
        "- Geopolitical summary is temporarily unavailable. Refresh to retry.",
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "region ai summary failed" },
      { status: 500 }
    );
  }
}
