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

function buildFallbackSummary(intel: RegionIntelResponse): string {
  const latest = intel.dataPoints
    .slice(0, 5)
    .map((p) => `- ${p.layer.toUpperCase()}: ${p.title}`)
    .join("\n");
  return [
    `- Work in progress fallback: AI summary timed out, showing direct map-based snapshot for ${intel.selection.name}.`,
    `- Escalation index ${intel.escalationIndex}/100, conflict index ${intel.conflictIndex}/100 over ${intel.range}.`,
    `- Active signals: strikes ${intel.signals.liveStrikes}, conflicts ${intel.signals.conflicts}, flights ${intel.signals.militaryFlights}, vessels ${intel.signals.navalVessels}, carriers ${intel.signals.carrierSignals}.`,
    `- Infrastructure indicators in scope: ${intel.signals.infrastructure}.`,
    latest || "- No recent mapped points available.",
  ].join("\n");
}

export async function GET(request: Request) {
  try {
    const { searchParams, origin } = new URL(request.url);
    const forwardHeaders: Record<string, string> = {};
    const cookie = request.headers.get("cookie");
    const authorization = request.headers.get("authorization");
    const bypass = request.headers.get("x-vercel-protection-bypass");
    if (cookie) forwardHeaders.cookie = cookie;
    if (authorization) forwardHeaders.authorization = authorization;
    if (bypass) forwardHeaders["x-vercel-protection-bypass"] = bypass;
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
      { cache: "no-store", headers: forwardHeaders },
      9_000
    );
    const intelContentType = (intelRes.headers.get("content-type") || "").toLowerCase();
    if (!intelRes.ok || !intelContentType.includes("application/json")) {
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
      "Task: Explain why tension is happening in this selected area and what changed recently.",
      `Region: ${intel.selection.name} (${intel.selection.kind})`,
      `Range: ${intel.range}`,
      `Escalation index: ${intel.escalationIndex}/100`,
      `Conflict index: ${intel.conflictIndex}/100`,
      `Signals: liveStrikes=${intel.signals.liveStrikes}; conflicts=${intel.signals.conflicts}; flights=${intel.signals.militaryFlights}; vessels=${intel.signals.navalVessels}; carriers=${intel.signals.carrierSignals}`,
      "Recent mapped signals:",
      topSignals || "None",
      "Write exactly 6 concise bullet points.",
      "Bullet requirements:",
      "- 1) Core situation and key actors.",
      "- 2) Immediate trigger(s) in the latest period.",
      "- 3) Underlying drivers (political/military/alliance/economic).",
      "- 4) Timeline turning points from recent weeks.",
      "- 5) What changed most recently and why it matters.",
      "- 6) Near-term outlook grounded in evidence.",
      "Use mapped signals as supporting evidence, not the main story.",
      "Do not simply restate signal counts or index values; explain mechanisms and context.",
      "Include at least two concrete facts (dates, named events, units, sanctions, agreements, deployments) when available.",
      "Use broad current context beyond mapped points when needed, with source-attributed caution.",
    ].join("\n");

    try {
      const aiRes = await fetchWithTimeout(
        `${origin}/api/ai`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", ...forwardHeaders },
          body: JSON.stringify({
            mode: "sentinel_qa",
            maxTokens: 620,
            prompt,
          }),
          cache: "no-store",
        },
        35_000
      );
      const aiContentType = (aiRes.headers.get("content-type") || "").toLowerCase();
      if (!aiRes.ok || !aiContentType.includes("application/json")) {
        return NextResponse.json({ summary: buildFallbackSummary(intel) }, { status: 200 });
      }
      const aiJson = (await aiRes.json()) as { content?: string; error?: string };
      return NextResponse.json({
        summary: aiJson.content?.trim() || buildFallbackSummary(intel),
      });
    } catch {
      return NextResponse.json({ summary: buildFallbackSummary(intel) }, { status: 200 });
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "region ai summary failed" },
      { status: 500 }
    );
  }
}
