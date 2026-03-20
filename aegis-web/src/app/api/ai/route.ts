import { NextRequest, NextResponse } from "next/server";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

type Mode = "country_trend" | "map_insight" | "news_summary" | "plot_events" | "sentinel_qa";

const TEMPORAL_SCOPE =
  "Use your knowledge of real-world conflict events from 2018 through the present and earlier. " +
  "Reference specific events, actors, dates, and developments. Your scope covers the full timeframe of the plot and beyond.";

function extractPromptField(prompt: string, label: string): string {
  const re = new RegExp(`^${label}:\\s*(.+)$`, "im");
  const match = prompt.match(re);
  return match?.[1]?.trim() ?? "";
}

const DISALLOWED_MAP_INSIGHT_RE =
  /\b(unavailable|insufficient information|not enough information|i don't know|cannot determine|unknown|not reported)\b/i;

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchTextWithTimeout(
  url: string,
  timeoutMs: number,
  headers?: Record<string, string>
): Promise<{ ok: boolean; text: string }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
      headers,
    });
    clearTimeout(timeout);
    if (!res.ok) return { ok: false, text: "" };
    return { ok: true, text: await res.text() };
  } catch {
    return { ok: false, text: "" };
  }
}

async function fetchArticleContext(sourceUrl: string): Promise<string | null> {
  const cleanUrl = sourceUrl.trim();
  if (!/^https?:\/\//i.test(cleanUrl)) return null;
  const headers = {
    "user-agent": "AEGIS-Intel/1.0 (+map-popup-context)",
    accept: "text/html,application/xhtml+xml",
  };
  const direct = await fetchTextWithTimeout(cleanUrl, 7000, headers);
  if (direct.ok) {
    const text = stripHtml(direct.text).slice(0, 3200);
    if (text.length >= 220) return text;
  }

  // Strong fallback: jina AI reader usually returns full readable article text.
  const noScheme = cleanUrl.replace(/^https?:\/\//i, "");
  const readerUrl = `https://r.jina.ai/http://${noScheme}`;
  const reader = await fetchTextWithTimeout(readerUrl, 9000, {
    "user-agent": "AEGIS-Intel/1.0 (+map-popup-context)",
    accept: "text/plain",
  });
  if (!reader.ok) return null;
  const readable = reader.text.replace(/\s+/g, " ").trim().slice(0, 4200);
  return readable.length >= 220 ? readable : null;
}

function extractRssTag(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i"));
  if (!m?.[1]) return "";
  return m[1]
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeHeadlineTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !["about", "after", "before", "from", "with", "report", "reports", "says", "said", "officials"].includes(w))
    .slice(0, 12);
}

function inferEventKeywordBundle(headline: string): string {
  const h = headline.toLowerCase();
  if (/\b(missile|rocket|drone|airstrike|air raid|shelling|bombardment)\b/.test(h))
    return "(missile OR drone OR airstrike OR shelling OR bombardment)";
  if (/\b(nav|warship|frigate|destroyer|carrier|sea|red sea)\b/.test(h))
    return "(naval OR warship OR carrier OR missile)";
  if (/\b(battle|clash|firefight|raid|infiltration|incursion)\b/.test(h))
    return "(battle OR clash OR firefight OR raid OR infiltration)";
  return "(conflict OR strike OR battle OR drone OR shelling)";
}

async function fetchRelatedHeadlines(
  headline: string,
  country: string,
  publisher: string
): Promise<string[]> {
  try {
    const tokens = normalizeHeadlineTokens(headline).slice(0, 5).join(" ");
    const eventBundle = inferEventKeywordBundle(headline);
    const siteHint = publisher && publisher !== "Unknown" ? ` ${publisher}` : "";
    const query = encodeURIComponent(`"${tokens}" ${country}${siteHint} ${eventBundle}`);
    const url = `https://news.google.com/rss/search?q=${query}&hl=en-US&gl=US&ceid=US:en`;
    const fetched = await fetchTextWithTimeout(url, 6500);
    if (!fetched.ok) return [];
    const xml = fetched.text;
    const items = xml.split("<item>").slice(1, 8);
    const out: string[] = [];
    const seen = new Set<string>();
    const sourceTokens = new Set(normalizeHeadlineTokens(headline));
    for (const item of items) {
      const title = extractRssTag(item, "title");
      const pubDate = extractRssTag(item, "pubDate");
      if (!title) continue;
      const normTitle = title.toLowerCase();
      if (seen.has(normTitle)) continue;
      const overlap = normalizeHeadlineTokens(title).filter((t) => sourceTokens.has(t)).length;
      if (overlap < 2 && !new RegExp(country, "i").test(title)) continue;
      seen.add(normTitle);
      out.push(pubDate ? `${pubDate}: ${title}` : title);
    }
    return out;
  } catch {
    return [];
  }
}

function extractQueryFromPrompt(prompt: string): string {
  const userQ = extractPromptField(prompt, "User question");
  if (userQ) return userQ;
  const headline = extractPromptField(prompt, "Headline");
  if (headline) return headline;
  const trimmed = prompt.replace(/\s+/g, " ").trim();
  return trimmed.slice(0, 220);
}

/** Optional Tavily / Serper — adds real web snippets before Groq synthesis. */
async function fetchTavilyWebSearch(query: string): Promise<string[]> {
  const key = process.env.TAVILY_API_KEY?.trim();
  if (!key) return [];
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: key,
        query: query.slice(0, 400),
        search_depth: "basic",
        max_results: 8,
        include_answer: false,
      }),
      cache: "no-store",
    });
    if (!res.ok) return [];
    const json = (await res.json()) as {
      results?: Array<{ title?: string; url?: string; content?: string }>;
    };
    const out: string[] = [];
    for (const r of json.results ?? []) {
      const line = [r.title, r.url, r.content?.replace(/\s+/g, " ").slice(0, 380)].filter(Boolean).join(" — ");
      if (line) out.push(line);
    }
    return out.slice(0, 10);
  } catch {
    return [];
  }
}

async function fetchSerperWebSearch(query: string): Promise<string[]> {
  const key = process.env.SERPER_API_KEY?.trim();
  if (!key) return [];
  try {
    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-KEY": key },
      body: JSON.stringify({ q: query.slice(0, 400), num: 8 }),
      cache: "no-store",
    });
    if (!res.ok) return [];
    const json = (await res.json()) as {
      organic?: Array<{ title?: string; link?: string; snippet?: string }>;
    };
    const out: string[] = [];
    for (const r of json.organic ?? []) {
      const line = [r.title, r.link, r.snippet].filter(Boolean).join(" — ");
      if (line) out.push(line);
    }
    return out.slice(0, 10);
  } catch {
    return [];
  }
}

async function fetchWebSearchSnippets(query: string): Promise<string[]> {
  const q = query.trim();
  if (!q) return [];
  const tavily = await fetchTavilyWebSearch(q);
  if (tavily.length > 0) return tavily;
  return fetchSerperWebSearch(q);
}

function buildWebSearchQuery(prompt: string, mode: Mode): string {
  const base = extractQueryFromPrompt(prompt);
  if (mode === "map_insight") {
    const headline = extractPromptField(prompt, "Headline");
    const loc = extractPromptField(prompt, "Location country");
    return [headline, loc, base].filter(Boolean).join(" ").trim().slice(0, 400);
  }
  return `${base} geopolitics conflict military`.replace(/\s+/g, " ").trim().slice(0, 400);
}

async function fetchOnlineContextForPrompt(prompt: string): Promise<string[]> {
  const query = extractQueryFromPrompt(prompt);
  if (!query) return [];
  try {
    const encoded = encodeURIComponent(
      `${query} (conflict OR strike OR missile OR battle OR naval OR escalation)`
    );
    const urls = [
      `https://news.google.com/rss/search?q=${encoded}&hl=en-US&gl=US&ceid=US:en`,
      `https://news.google.com/rss/search?q=${encoded}&hl=en-GB&gl=GB&ceid=GB:en`,
    ];
    const out: string[] = [];
    const seen = new Set<string>();
    for (const url of urls) {
      const fetched = await fetchTextWithTimeout(url, 7000);
      if (!fetched.ok) continue;
      const items = fetched.text.split("<item>").slice(1, 6);
      for (const item of items) {
        const title = extractRssTag(item, "title");
        const pubDate = extractRssTag(item, "pubDate");
        if (!title) continue;
        const key = title.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(pubDate ? `${pubDate}: ${title}` : title);
      }
    }
    return out.slice(0, 10);
  } catch {
    return [];
  }
}

function systemPromptForMode(mode: Mode): string {
  switch (mode) {
    case "map_insight":
      return (
        "You are AEGIS, an analytical assistant for a geopolitical early-warning system. " +
        "You receive one mapped event and must write a concise, event-specific intelligence brief focused on what happened, where, when, actors, and immediate trigger/background. " +
        "Output exactly 4 bullet points. Every bullet must start with '- '. " +
        "Label each bullet with either 'Confirmed:' (directly supported by evidence) or 'Inferred:' (best-effort synthesis from context). " +
        "If direct details are sparse, infer the most plausible explanation from article text, nearby same-event context, and external corroboration headlines; do not reply with 'unknown', 'not reported', or 'insufficient information'. " +
        "If the event is plotted, explain why it is plotted and what likely happened at that location and time. " +
        "Include concrete numbers/statistics when available (casualties, interceptions, units, strikes, dates, distances, counts). " +
        "Reject unrelated context that does not match the event type, place, and timeframe. " +
        "Never describe confidence scores, magnitude scores, model behavior, or generic 'why flagged' explanations unless directly tied to factual event evidence. " +
        "Do not give policy advice. Keep a neutral, analytical tone. " +
        TEMPORAL_SCOPE
      );
    case "news_summary":
      return (
        "You summarize recent conflict-related news into short, neutral bullet points. " +
        "Avoid speculation and keep each bullet tied to specific reported events. " +
        TEMPORAL_SCOPE
      );
    case "plot_events":
      return (
        "You are AEGIS, an escalation-analysis assistant. " +
        "You receive escalation index data for a country with flagged months, pre-escalation warnings, and a forecast. " +
        "Your task: (1) List real-world events during the plot's timeframe that led to major escalation spikes. " +
        "(2) ALWAYS justify each pre-escalation warning with specific events that occurred around that time—e.g. if a pre-escalation was flagged in August 2023, explain what Hamas or other actors were doing then that preceded October 7. " +
        "(3) Justify the trend forecast with events or developments that support or explain the projected direction. " +
        "Be specific: name actors, dates, and developments. Do not claim access to classified information. " +
        TEMPORAL_SCOPE
      );
    case "sentinel_qa":
      return (
        "You are the Aegis Sentinel, an AI that answers questions about escalation index plots. " +
        "You receive the plot data (country, date range, flagged months, pre-escalation warnings, peaks, forecast) and a user question. " +
        "Answer concisely and ground your response in the provided data and real-world events. " +
        "Reference specific events, actors, and dates when relevant. Be explicit about uncertainty. " +
        TEMPORAL_SCOPE
      );
    case "country_trend":
    default:
      return (
        "You are AEGIS, an escalation-analysis assistant. " +
        "You receive time-series escalation index data for a country plus a short summary. " +
        "Explain the trend in 3–5 sentences, tie it to plausible real-world drivers, and be explicit about uncertainty. " +
        "Do not claim access to classified information. " +
        TEMPORAL_SCOPE
      );
  }
}

async function runGroqCompletion(
  apiKey: string,
  mode: Mode,
  prompt: string,
  maxTokens: number
): Promise<{ ok: boolean; content?: string; error?: string }> {
  const res = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.1-8b-instant",
      max_tokens: maxTokens,
      messages: [
        {
          role: "system",
          content: systemPromptForMode(mode),
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    return { ok: false, error: `Groq API error ${res.status}: ${text}` };
  }
  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return { ok: true, content: json.choices?.[0]?.message?.content ?? "" };
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    prompt?: string;
    mode?: Mode;
    maxTokens?: number;
  };

  const prompt = body.prompt?.trim();
  const mode: Mode = (body.mode as Mode) ?? "country_trend";
  const maxTokens = body.maxTokens ?? 500;

  if (!prompt) {
    return NextResponse.json(
      { error: "Missing 'prompt' in request body." },
      { status: 400 },
    );
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "Groq API key not configured. Set GROQ_API_KEY in your environment.",
      },
      { status: 500 },
    );
  }

  try {
    let enrichedPrompt = prompt;
    if (mode === "map_insight") {
      const sourceUrl = extractPromptField(prompt, "Article URL");
      const headline = extractPromptField(prompt, "Headline");
      const country = extractPromptField(prompt, "Location country");
      const publisher = extractPromptField(prompt, "Publisher");
      const externalBlocks: string[] = [];

      if (/^https?:\/\//i.test(sourceUrl)) {
        const articleContext = await fetchArticleContext(sourceUrl);
        if (articleContext) {
          externalBlocks.push(
            "Full article context extract (primary evidence):\n" + articleContext
          );
        }
      }

      if (headline) {
        const related = await fetchRelatedHeadlines(headline, country || "global", publisher || "");
        if (related.length > 0) {
          externalBlocks.push(
            "Related external headlines for corroboration:\n" +
              related.map((h, i) => `${i + 1}. ${h}`).join("\n")
          );
        }
      }

      if (externalBlocks.length > 0) {
        enrichedPrompt = `${prompt}\n\nExternal context (for corroboration and inference):\n${externalBlocks.join(
          "\n\n"
        )}`;
      }
    } else if (mode === "news_summary" || mode === "sentinel_qa") {
      const related = await fetchOnlineContextForPrompt(prompt);
      if (related.length > 0) {
        enrichedPrompt = `${prompt}\n\nExternal online corroboration headlines:\n${related
          .map((h, i) => `${i + 1}. ${h}`)
          .join("\n")}`;
      }
    }

    const hasWebSearchKey = Boolean(
      process.env.TAVILY_API_KEY?.trim() || process.env.SERPER_API_KEY?.trim()
    );
    if (hasWebSearchKey) {
      const webQuery = buildWebSearchQuery(prompt, mode);
      const webSnippets = await fetchWebSearchSnippets(webQuery);
      if (webSnippets.length > 0) {
        enrichedPrompt = `${enrichedPrompt}\n\nWeb search results (ground answers in these facts; do not invent sources):\n${webSnippets
          .map((s, i) => `${i + 1}. ${s}`)
          .join("\n")}`;
      }
    }

    const firstPass = await runGroqCompletion(apiKey, mode, enrichedPrompt, maxTokens);
    if (!firstPass.ok) {
      return NextResponse.json({ error: firstPass.error ?? "Groq API failure" }, { status: 500 });
    }
    let content = firstPass.content ?? "";

    // One-pass quality guard for map point summaries.
    if (mode === "map_insight" && DISALLOWED_MAP_INSIGHT_RE.test(content)) {
      const strictRetryPrompt = [
        enrichedPrompt,
        "",
        "CRITICAL RETRY RULES:",
        "- Do not use 'unavailable', 'unknown', 'not reported', 'cannot determine', or similar phrases.",
        "- The point exists; provide the most likely event-causal explanation from available evidence.",
        "- Keep exactly 4 bullets with Confirmed/Inferred prefixes.",
        "- Add at least one concrete number/date/statistic if present in evidence.",
      ].join("\n");
      const retry = await runGroqCompletion(apiKey, mode, strictRetryPrompt, maxTokens);
      if (retry.ok && (retry.content?.trim() ?? "").length > 0) {
        content = retry.content ?? content;
      }
    }
    return NextResponse.json({ content }, { status: 200 });
  } catch (err) {
    console.error("AI API error", err);
    return NextResponse.json(
      { error: "AI analysis unavailable. Please try again later." },
      { status: 500 },
    );
  }
}

