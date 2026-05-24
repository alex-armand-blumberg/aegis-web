import { NextRequest, NextResponse } from "next/server";
import {
  ANALYST_MAX_CONTEXT_BYTES,
  ANALYST_MAX_HISTORY_TURNS,
  ANALYST_MAX_MESSAGE_CHARS,
  renderContextForPrompt,
  trimAnalystContextToBudget,
  type AnalystContext,
} from "@/app/impact/analyst/analystContext";
import { ARGUS_ANALYST_SYSTEM } from "@/app/impact/analyst/analystPrompts";
import type {
  ConfidenceLevel,
  EventClass,
  ExposureLevel,
  GeoPrecision,
} from "@/lib/impact/types";
import type { IntelSeverity } from "@/lib/intel/types";
import type { SourceTier } from "@/lib/impact/sourceTier";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const PRIMARY_MODEL = "llama-3.3-70b-versatile";
const FALLBACK_MODEL = "llama-3.1-8b-instant";

type ChatRole = "user" | "assistant";

type ChatMessage = { role: ChatRole; content: string };

function sanitizeContent(value: unknown): string {
  if (typeof value !== "string") return "";
  // Strip control chars (except newlines and tabs) and cap length deterministically.
  // eslint-disable-next-line no-control-regex
  const cleaned = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
  return cleaned.slice(0, ANALYST_MAX_MESSAGE_CHARS);
}

function parseMessages(input: unknown): ChatMessage[] | { error: string } {
  if (!Array.isArray(input)) return { error: "messages must be an array" };
  const messages: ChatMessage[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const role = (raw as { role?: unknown }).role;
    const content = sanitizeContent((raw as { content?: unknown }).content);
    if (role !== "user" && role !== "assistant") continue;
    if (!content) continue;
    messages.push({ role, content });
  }
  if (messages.length === 0) return { error: "messages must contain at least one non-empty user message" };
  if (messages[messages.length - 1].role !== "user") {
    return { error: "the last message must be a user message" };
  }
  return messages.slice(-ANALYST_MAX_HISTORY_TURNS);
}

const ALLOWED_LEVELS = new Set(["low", "guarded", "elevated", "high", "critical"]);
const ALLOWED_CONFIDENCE = new Set(["low", "medium", "high"]);
const ALLOWED_RANGES = new Set(["24h", "7d", "30d"]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sanitizeUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const u = new URL(value);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

function clampNumber(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return value;
}

function sanitizeContext(input: unknown): AnalystContext | { error: string } {
  if (!isPlainObject(input)) return { error: "context must be an object" };

  const meta = isPlainObject(input.meta) ? input.meta : {};
  const asset = isPlainObject(input.asset) ? input.asset : null;
  if (!asset) return { error: "context.asset is required" };

  const rangeRaw = typeof meta.range === "string" ? meta.range : "";
  const range = ALLOWED_RANGES.has(rangeRaw) ? rangeRaw : "7d";

  const sanitizedAsset = {
    id: sanitizeContent(asset.id).slice(0, 120) || "unknown",
    name: sanitizeContent(asset.name).slice(0, 120) || "Selected asset",
    type: sanitizeContent(asset.type).slice(0, 40) || "other",
    city: asset.city ? sanitizeContent(asset.city).slice(0, 80) || null : null,
    country: sanitizeContent(asset.country).slice(0, 80) || "Unknown",
    lat: clampNumber(asset.lat, 0),
    lon: clampNumber(asset.lon, 0),
    importance: sanitizeContent(asset.importance).slice(0, 24) || "medium",
  };

  let risk: AnalystContext["risk"] = null;
  if (isPlainObject(input.risk)) {
    const r = input.risk;
    const level = sanitizeContent(r.level).toLowerCase();
    const confidence = sanitizeContent(r.confidence).toLowerCase();
    risk = {
      score: Math.max(0, Math.min(100, Math.round(clampNumber(r.score, 0)))),
      level: (ALLOWED_LEVELS.has(level) ? level : "guarded") as ExposureLevel,
      confidence: (ALLOWED_CONFIDENCE.has(confidence) ? confidence : "low") as ConfidenceLevel,
      headline: sanitizeContent(r.headline).slice(0, 320),
      whyItMatters: sanitizeContent(r.whyItMatters).slice(0, 600),
      uncertainty: sanitizeContent(r.uncertainty).slice(0, 400),
      watchNext: Array.isArray(r.watchNext)
        ? r.watchNext.slice(0, 8).map((item) => sanitizeContent(item).slice(0, 200)).filter(Boolean)
        : [],
    };
  }

  const evidenceRaw = Array.isArray(input.evidence) ? input.evidence : [];
  const evidence: AnalystContext["evidence"] = [];
  for (const item of evidenceRaw) {
    if (evidence.length >= 10) break;
    if (!isPlainObject(item)) continue;
    const id = sanitizeContent(item.id).slice(0, 120);
    if (!id) continue;
    evidence.push({
      id,
      title: sanitizeContent(item.title).slice(0, 240) || "Untitled event",
      relation: sanitizeContent(item.relation).slice(0, 24) || "Contextual",
      tier: (sanitizeContent(item.tier).slice(0, 8) || "tier3") as SourceTier,
      tierLabel: sanitizeContent(item.tierLabel).slice(0, 60) || "Source",
      geoPrecision: (sanitizeContent(item.geoPrecision).slice(0, 16) || "unknown") as GeoPrecision,
      geoPrecisionLabel: item.geoPrecisionLabel
        ? sanitizeContent(item.geoPrecisionLabel).slice(0, 60) || null
        : null,
      distanceKm:
        typeof item.distanceKm === "number" && Number.isFinite(item.distanceKm)
          ? item.distanceKm
          : null,
      distanceLabel: item.distanceLabel ? sanitizeContent(item.distanceLabel).slice(0, 40) || null : null,
      severity: (sanitizeContent(item.severity).slice(0, 16) || "medium") as IntelSeverity,
      sourceName: sanitizeContent(item.sourceName).slice(0, 80) || "Unknown source",
      sourceUrl: sanitizeUrl(item.sourceUrl),
      timestamp: sanitizeContent(item.timestamp).slice(0, 40),
      eventClass: (sanitizeContent(item.eventClass).slice(0, 40) || "other") as EventClass,
      country: item.country ? sanitizeContent(item.country).slice(0, 80) || null : null,
    });
  }

  const generatedAt = sanitizeContent(meta.generatedAt).slice(0, 40) || new Date().toISOString();

  const context: AnalystContext = {
    meta: { generatedAt, range },
    asset: sanitizedAsset,
    risk,
    evidence,
  };

  return trimAnalystContextToBudget(context, ANALYST_MAX_CONTEXT_BYTES);
}

type StreamLaunch =
  | { ok: true; stream: ReadableStream<Uint8Array> }
  | { ok: false; status: number; error: string };

async function launchGroqStream(opts: {
  apiKey: string;
  model: string;
  systemPrompt: string;
  messages: ChatMessage[];
}): Promise<StreamLaunch> {
  let res: Response;
  try {
    res = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: opts.model,
        stream: true,
        temperature: 0.2,
        max_tokens: 1200,
        messages: [
          { role: "system", content: opts.systemPrompt },
          ...opts.messages,
        ],
      }),
    });
  } catch (err) {
    return {
      ok: false,
      status: 502,
      error: `Could not reach Groq: ${err instanceof Error ? err.message : "network error"}`,
    };
  }

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    return { ok: false, status: res.status || 502, error: text.slice(0, 400) || "Groq returned an error" };
  }
  return { ok: true, stream: res.body };
}

/**
 * Parse the OpenAI-compatible SSE stream and re-emit normalized
 * `data: {"token":"..."}` lines plus a final `data: [DONE]`.
 */
function transformGroqStream(source: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let buffer = "";

  return new ReadableStream({
    async start(controller) {
      const reader = source.getReader();
      const enqueueToken = (token: string) => {
        if (!token) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token })}\n\n`));
      };
      const enqueueError = (message: string) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: message })}\n\n`));
      };
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split("\n\n");
          buffer = events.pop() ?? "";
          for (const evt of events) {
            const line = evt.split("\n").find((l) => l.startsWith("data:"));
            if (!line) continue;
            const payload = line.slice(5).trim();
            if (!payload || payload === "[DONE]") continue;
            try {
              const json = JSON.parse(payload) as {
                choices?: { delta?: { content?: string } }[];
              };
              const token = json.choices?.[0]?.delta?.content;
              if (typeof token === "string" && token.length > 0) enqueueToken(token);
            } catch {
              // ignore malformed chunks; the next event should still come through.
            }
          }
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (err) {
        enqueueError(err instanceof Error ? err.message : "stream error");
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      }
    },
  });
}

const GROQ_KEY_MISSING_ERROR =
  "Groq API key not configured. Set GROQ_API_KEY in your environment.";

export async function GET() {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { configured: false, error: GROQ_KEY_MISSING_ERROR },
      { status: 503 }
    );
  }
  return NextResponse.json({ configured: true });
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!isPlainObject(body)) {
    return NextResponse.json({ error: "Request body must be an object." }, { status: 400 });
  }

  const messagesResult = parseMessages(body.messages);
  if ("error" in messagesResult) {
    return NextResponse.json({ error: messagesResult.error }, { status: 400 });
  }
  const messages = messagesResult;

  const contextResult = sanitizeContext(body.context);
  if ("error" in contextResult) {
    return NextResponse.json({ error: contextResult.error }, { status: 400 });
  }
  const context = contextResult;

  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: GROQ_KEY_MISSING_ERROR }, { status: 503 });
  }

  const systemPrompt = `${ARGUS_ANALYST_SYSTEM}\n\n${renderContextForPrompt(context)}`;

  let launch = await launchGroqStream({ apiKey, model: PRIMARY_MODEL, systemPrompt, messages });
  if (!launch.ok && (launch.status === 429 || launch.status >= 500)) {
    launch = await launchGroqStream({
      apiKey,
      model: FALLBACK_MODEL,
      systemPrompt,
      messages,
    });
  }

  if (!launch.ok) {
    return NextResponse.json(
      { error: `Argus could not stream a response (${launch.status}). ${launch.error}`.trim() },
      { status: launch.status === 401 || launch.status === 403 ? launch.status : 502 }
    );
  }

  const stream = transformGroqStream(launch.stream);
  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store, no-transform",
      connection: "keep-alive",
    },
  });
}
