"use client";

import type { ReactNode } from "react";

const KNOWN_HEADINGS = [
  "situation",
  "why this asset is exposed",
  "evidence",
  "uncertainty",
  "what to watch next",
];

const HEADING_RE = new RegExp(
  `^\\s*(?:\\*\\*)?\\s*(?:\\d+\\.\\s+)?(${KNOWN_HEADINGS.map((h) =>
    h.replace(/ /g, "\\s+")
  ).join("|")})\\s*(?::|\\*\\*)?\\s*\\*?\\*?\\s*$`,
  "i"
);

const BULLET_RE = /^\s*[-*•]\s+(.*)$/;
const NUMBERED_RE = /^\s*(\d+)\.\s+(.*)$/;

type Block =
  | { kind: "heading"; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] };

function classify(line: string):
  | { kind: "heading"; text: string }
  | { kind: "bullet"; text: string }
  | { kind: "numbered"; text: string }
  | { kind: "text"; text: string }
  | { kind: "blank" } {
  const trimmed = line.replace(/\s+$/, "");
  if (!trimmed.trim()) return { kind: "blank" };
  const h = HEADING_RE.exec(trimmed);
  if (h) {
    return {
      kind: "heading",
      text: h[1].replace(/\s+/g, " ").trim().replace(/(^|\s)(\w)/g, (_m, p1, p2: string) => p1 + p2.toUpperCase()),
    };
  }
  const b = BULLET_RE.exec(trimmed);
  if (b) return { kind: "bullet", text: stripMarkers(b[1]) };
  const n = NUMBERED_RE.exec(trimmed);
  if (n) return { kind: "numbered", text: stripMarkers(n[2]) };
  return { kind: "text", text: stripMarkers(trimmed) };
}

function stripMarkers(text: string): string {
  return text.replace(/^\s*\*\*\s*|\s*\*\*\s*$/g, "").trim();
}

function parseBlocks(text: string): Block[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out: Block[] = [];
  let currentUl: string[] | null = null;
  let currentOl: string[] | null = null;
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      out.push({ kind: "paragraph", text: paragraph.join(" ") });
      paragraph = [];
    }
  };
  const flushLists = () => {
    if (currentUl && currentUl.length) {
      out.push({ kind: "ul", items: currentUl });
      currentUl = null;
    }
    if (currentOl && currentOl.length) {
      out.push({ kind: "ol", items: currentOl });
      currentOl = null;
    }
  };

  for (const raw of lines) {
    const tok = classify(raw);
    if (tok.kind === "blank") {
      flushParagraph();
      flushLists();
      continue;
    }
    if (tok.kind === "heading") {
      flushParagraph();
      flushLists();
      out.push({ kind: "heading", text: tok.text });
      continue;
    }
    if (tok.kind === "bullet") {
      flushParagraph();
      if (currentOl) {
        out.push({ kind: "ol", items: currentOl });
        currentOl = null;
      }
      if (!currentUl) currentUl = [];
      currentUl.push(tok.text);
      continue;
    }
    if (tok.kind === "numbered") {
      flushParagraph();
      if (currentUl) {
        out.push({ kind: "ul", items: currentUl });
        currentUl = null;
      }
      if (!currentOl) currentOl = [];
      currentOl.push(tok.text);
      continue;
    }
    flushLists();
    paragraph.push(tok.text);
  }

  flushParagraph();
  flushLists();
  return out;
}

function renderInlineBold(text: string, baseKey: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts
    .filter((p) => p.length > 0)
    .map((p, i) => {
      if (p.startsWith("**") && p.endsWith("**")) {
        return <strong key={`${baseKey}-b-${i}`}>{p.slice(2, -2)}</strong>;
      }
      return <span key={`${baseKey}-t-${i}`}>{p}</span>;
    });
}

type Props = { text: string };

export function BriefRenderer({ text }: Props) {
  const blocks = parseBlocks(text);
  if (blocks.length === 0) {
    return <p className="impact-brief-empty">(empty response)</p>;
  }
  return (
    <div className="impact-brief">
      {blocks.map((block, i) => {
        if (block.kind === "heading") {
          return (
            <h3 key={`h-${i}`} className="impact-brief-heading">
              {block.text}
            </h3>
          );
        }
        if (block.kind === "paragraph") {
          return (
            <p key={`p-${i}`} className="impact-brief-paragraph">
              {renderInlineBold(block.text, `p-${i}`)}
            </p>
          );
        }
        if (block.kind === "ul") {
          return (
            <ul key={`ul-${i}`} className="impact-brief-list">
              {block.items.map((item, j) => (
                <li key={`ul-${i}-${j}`}>{renderInlineBold(item, `ul-${i}-${j}`)}</li>
              ))}
            </ul>
          );
        }
        return (
          <ol key={`ol-${i}`} className="impact-brief-list impact-brief-list-ol">
            {block.items.map((item, j) => (
              <li key={`ol-${i}-${j}`}>{renderInlineBold(item, `ol-${i}-${j}`)}</li>
            ))}
          </ol>
        );
      })}
    </div>
  );
}
