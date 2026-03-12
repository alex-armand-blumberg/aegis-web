import { NextRequest, NextResponse } from "next/server";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

type Mode = "country_trend" | "map_insight" | "news_summary";

function systemPromptForMode(mode: Mode): string {
  switch (mode) {
    case "map_insight":
      return (
        "You are AEGIS, an analytical assistant for a geopolitical early-warning system. " +
        "You receive structured summaries of conflict hotspots and must write concise, sober intelligence briefs. " +
        "Ground every statement in the provided data. Do not speculate or give policy advice."
      );
    case "news_summary":
      return (
        "You summarize recent conflict-related news into short, neutral bullet points. " +
        "Avoid speculation and keep each bullet tied to specific reported events."
      );
    case "country_trend":
    default:
      return (
        "You are AEGIS, an escalation-analysis assistant. " +
        "You receive time-series escalation index data for a country plus a short summary. " +
        "Explain the trend in 3–5 sentences, tie it to plausible real-world drivers, and be explicit about uncertainty. " +
        "Do not claim access to classified information."
      );
  }
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
      return NextResponse.json(
        { error: `Groq API error ${res.status}: ${text}` },
        { status: 500 },
      );
    }

    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };

    const content = json.choices?.[0]?.message?.content ?? "";
    return NextResponse.json({ content }, { status: 200 });
  } catch (err) {
    console.error("AI API error", err);
    return NextResponse.json(
      { error: "AI analysis unavailable. Please try again later." },
      { status: 500 },
    );
  }
}

