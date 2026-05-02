import { NextRequest, NextResponse } from "next/server";
import type { EscalationPoint } from "@/lib/escalation";
import {
  DEFAULT_LABEL_DEFINITIONS,
  evaluateCaseStudies,
  summarizeWalkForwardBacktest,
  type EscalationV2Point,
} from "@/lib/escalation-v2";

export const maxDuration = 300;

type EscalationApiBacktestPayload = {
  series?: EscalationPoint[];
  methodologyVersion?: string;
  modelVersion?: string;
  dataSource?: string;
};

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const country = url.searchParams.get("country")?.trim();
  if (!country) {
    return NextResponse.json({ error: "Missing 'country' query parameter." }, { status: 400 });
  }

  const baseUrl = `${url.protocol}//${url.host}`;
  const dataUrl = new URL("/api/escalation", baseUrl);
  dataUrl.searchParams.set("country", country);
  dataUrl.searchParams.set("smooth", url.searchParams.get("smooth") ?? "3");
  dataUrl.searchParams.set("threshold", url.searchParams.get("threshold") ?? "45");
  dataUrl.searchParams.set("start", url.searchParams.get("start") ?? "2018-01-01");
  dataUrl.searchParams.set("end", url.searchParams.get("end") ?? new Date().toISOString().slice(0, 10));
  if (url.searchParams.get("refresh")) {
    dataUrl.searchParams.set("refresh", url.searchParams.get("refresh") ?? "");
  }

  const res = await fetch(dataUrl, { cache: "no-store" });
  const text = await res.text();
  if (!res.ok) {
    return NextResponse.json(
      { error: `Failed to load escalation series for backtest (${res.status}).`, detail: text.slice(0, 500) },
      { status: 502 }
    );
  }

  const resultLine = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .reverse()
    .find((line) => {
      try {
        return JSON.parse(line).type === "result";
      } catch {
        return false;
      }
    });
  const payload = (resultLine ? JSON.parse(resultLine) : JSON.parse(text)) as EscalationApiBacktestPayload & {
    type?: string;
  };
  const series = (payload.series ?? []) as EscalationV2Point[];
  if (!series.length) {
    return NextResponse.json({ error: "No series data available for backtest." }, { status: 404 });
  }

  return NextResponse.json({
    country,
    methodologyVersion: payload.methodologyVersion,
    modelVersion: payload.modelVersion,
    dataSource: payload.dataSource,
    labelDefinitions: DEFAULT_LABEL_DEFINITIONS,
    metrics: DEFAULT_LABEL_DEFINITIONS.map((definition) =>
      summarizeWalkForwardBacktest(series, definition)
    ),
    caseStudies: evaluateCaseStudies(series, country),
    caveat:
      "Backtests are walk-forward summaries over the returned historical series. They validate warning behavior but are not proof of future accuracy.",
  });
}
