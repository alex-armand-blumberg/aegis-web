import { NextRequest, NextResponse } from "next/server";
import Parser from "rss-parser";

type NewsItem = {
  title: string;
  link: string;
  source: string;
  published: string;
};

const parser = new Parser();

function buildNewsUrl(country?: string): string {
  if (country) {
    const q = encodeURIComponent(`${country} conflict war military`);
    return `https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`;
  }
  const q = encodeURIComponent(
    "(war OR conflict OR airstrike OR missile OR battle OR explosion)",
  );
  return `https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const country = searchParams.get("country") ?? undefined;

  try {
    const feed = await parser.parseURL(buildNewsUrl(country));
    const items: NewsItem[] = (feed.items ?? []).slice(0, 8).map((item) => ({
      title: item.title ?? "Untitled",
      link: item.link ?? "",
      source: (item.creator as string) ?? "Unknown source",
      published: item.pubDate ?? "",
    }));

    return NextResponse.json({ items }, { status: 200 });
  } catch (err) {
    console.error("News API error", err);
    return NextResponse.json(
      { error: "Unable to load news feed." },
      { status: 500 },
    );
  }
}

