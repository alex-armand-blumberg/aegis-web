"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import type { AnalystContext } from "./analystContext";
import {
  ANALYST_MAX_HISTORY_TURNS,
  ANALYST_MAX_MESSAGE_CHARS,
} from "./analystContext";
import { suggestedPromptsForAsset } from "./analystPrompts";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
  error?: boolean;
};

type Props = {
  context: AnalystContext | null;
  conversationKey: string;
};

function makeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function isSafeHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

const INLINE_LINK_RE = /\[([^\]\n]+?)\]\(([^)\s]+)\)/g;

/**
 * Render a single line of assistant prose with markdown links converted to
 * <a> elements. No raw HTML is interpreted — only safe http(s) links pass
 * through and the link label is rendered as plain text.
 */
function renderInline(line: string): ReactNode {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  INLINE_LINK_RE.lastIndex = 0;
  while ((match = INLINE_LINK_RE.exec(line)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(line.slice(lastIndex, match.index));
    }
    const label = match[1];
    const url = match[2];
    if (isSafeHttpUrl(url)) {
      nodes.push(
        <a
          key={`${match.index}-${url}`}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="iv-analyst-link"
        >
          {label}
        </a>
      );
    } else {
      nodes.push(label);
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < line.length) nodes.push(line.slice(lastIndex));
  return nodes;
}

function renderAssistantContent(content: string): ReactNode {
  const lines = content.split("\n");
  const blocks: ReactNode[] = [];
  let buffer: string[] = [];
  let bullets: string[] = [];
  const flushParagraph = () => {
    if (buffer.length === 0) return;
    blocks.push(
      <p key={`p-${blocks.length}`} className="iv-analyst-msg-p">
        {renderInline(buffer.join(" "))}
      </p>
    );
    buffer = [];
  };
  const flushBullets = () => {
    if (bullets.length === 0) return;
    blocks.push(
      <ul key={`ul-${blocks.length}`} className="iv-analyst-msg-list">
        {bullets.map((b, i) => (
          <li key={i}>{renderInline(b)}</li>
        ))}
      </ul>
    );
    bullets = [];
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^\s*[-*]\s+/.test(line)) {
      flushParagraph();
      bullets.push(line.replace(/^\s*[-*]\s+/, ""));
      continue;
    }
    if (line.trim() === "") {
      flushParagraph();
      flushBullets();
      continue;
    }
    flushBullets();
    buffer.push(line);
  }
  flushParagraph();
  flushBullets();
  return blocks;
}

export function AnalystChat({ context, conversationKey }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [apiKeyMissing, setApiKeyMissing] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const messagesRef = useRef<ChatMessage[]>(messages);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/impact/analyst", { cache: "no-store" });
        const json = (await res.json()) as { configured?: boolean; error?: string };
        if (cancelled) return;
        if (json.configured === false) {
          setApiKeyMissing(true);
        }
      } catch {
        /* readiness probe failed — do not permanently disable chat */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Reset thread when the selected asset changes.
  useEffect(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setMessages([]);
    setDraft("");
    setStreaming(false);
    setErrorBanner(null);
  }, [conversationKey]);

  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    []
  );

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const suggestions = useMemo(
    () => (context ? suggestedPromptsForAsset(context) : []),
    [context]
  );

  const sendMessage = useCallback(
    async (rawContent: string) => {
      if (apiKeyMissing) return;
      if (!context) return;
      const content = rawContent.trim().slice(0, ANALYST_MAX_MESSAGE_CHARS);
      if (!content || streaming) return;

      const userMessage: ChatMessage = { id: makeId(), role: "user", content };
      const assistantId = makeId();
      const placeholder: ChatMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
        streaming: true,
      };

      const priorMessages = messagesRef.current.filter(
        (m) => !m.error && !m.streaming && m.content.trim().length > 0
      );
      const payloadMessages = [...priorMessages, userMessage]
        .slice(-ANALYST_MAX_HISTORY_TURNS)
        .map((m) => ({ role: m.role, content: m.content }));

      setMessages((prev) => [...prev, userMessage, placeholder]);

      setDraft("");
      setStreaming(true);
      setErrorBanner(null);
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch("/api/impact/analyst", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: payloadMessages, context }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          const fallback = await res
            .json()
            .catch(() => ({ error: `HTTP ${res.status}` }));
          const errMessage =
            typeof fallback?.error === "string"
              ? fallback.error
              : "Argus could not stream a response. Try again.";
          if (res.status === 503 && /groq api key/i.test(errMessage)) {
            setApiKeyMissing(true);
          }
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, streaming: false, error: true, content: errMessage }
                : m
            )
          );
          setErrorBanner(errMessage);
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let streamError: string | null = null;

        const flushAssistant = (token: string) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: m.content + token } : m
            )
          );
        };

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
              const json = JSON.parse(payload) as { token?: string; error?: string };
              if (typeof json.error === "string" && json.error.length > 0) {
                streamError = json.error;
                continue;
              }
              if (typeof json.token === "string" && json.token.length > 0) {
                flushAssistant(json.token);
              }
            } catch {
              // ignore malformed chunk
            }
          }
        }

        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== assistantId) return m;
            if (streamError) {
              return {
                ...m,
                streaming: false,
                error: true,
                content: m.content
                  ? `${m.content}\n\n(stream interrupted: ${streamError})`
                  : `Argus could not stream a response: ${streamError}`,
              };
            }
            if (!m.content) {
              return {
                ...m,
                streaming: false,
                error: true,
                content: "Argus returned an empty response. Try again.",
              };
            }
            return { ...m, streaming: false };
          })
        );
        if (streamError) setErrorBanner(streamError);
      } catch (err) {
        if (controller.signal.aborted) {
          setMessages((prev) => prev.filter((m) => m.id !== assistantId));
          return;
        }
        const msg =
          err instanceof Error
            ? err.message
            : "Argus could not stream a response. Try again.";
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, streaming: false, error: true, content: msg }
              : m
          )
        );
        setErrorBanner(msg);
      } finally {
        setStreaming(false);
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [apiKeyMissing, context, streaming]
  );

  const resolveComposerText = useCallback((): string => {
    return (textareaRef.current?.value ?? draft).trim();
  }, [draft]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const text = resolveComposerText();
        if (!streaming && text.length > 0) void sendMessage(text);
      }
    },
    [resolveComposerText, sendMessage, streaming]
  );

  const handleDraftChange = useCallback((e: ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value.slice(0, ANALYST_MAX_MESSAGE_CHARS);
    setDraft(value);
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
    }
  }, []);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const composerDisabled = apiKeyMissing || !context;

  return (
    <section className="iv-analyst-chat" aria-label="Argus analyst chat">
      <div ref={scrollRef} className="iv-analyst-scroll">
        {messages.length === 0 ? (
          <div className="iv-analyst-empty">
            <h2 className="iv-analyst-empty-title">Ask Argus</h2>
            <p className="iv-analyst-empty-copy">
              Argus answers from the evidence and exposure context for the asset you have selected.
              It will name sources, separate confirmed facts from cautious inferences, and stay
              quiet when the evidence does not support an answer.
            </p>
            {suggestions.length > 0 ? (
              <div className="iv-analyst-suggestions" role="list">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    role="listitem"
                    className="iv-analyst-suggestion"
                    onClick={() => void sendMessage(s)}
                    disabled={composerDisabled || streaming}
                  >
                    {s}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="iv-analyst-messages">
            {messages.map((m) => (
              <article
                key={m.id}
                className={`iv-analyst-msg iv-analyst-msg-${m.role}${
                  m.error ? " is-error" : ""
                }${m.streaming ? " is-streaming" : ""}`}
              >
                <div className="iv-analyst-msg-body">
                  {m.role === "assistant" ? (
                    <>
                      {renderAssistantContent(m.content)}
                      {m.streaming && !m.content ? (
                        <span className="iv-analyst-typing" aria-live="polite">
                          <span />
                          <span />
                          <span />
                        </span>
                      ) : null}
                    </>
                  ) : (
                    <p className="iv-analyst-msg-p">{m.content}</p>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {errorBanner ? (
        <div className="iv-analyst-error" role="alert">
          {errorBanner}
        </div>
      ) : null}

      <form
        className="iv-analyst-composer"
        onSubmit={(e) => {
          e.preventDefault();
          const text = resolveComposerText();
          if (!streaming && text.length > 0) void sendMessage(text);
        }}
      >
        {apiKeyMissing ? (
          <p className="iv-analyst-key-missing">
            Argus is offline because <code>GROQ_API_KEY</code> is not configured on the server.
          </p>
        ) : null}
        <div className="iv-analyst-composer-row">
          <textarea
            ref={textareaRef}
            className="iv-analyst-textarea"
            placeholder={
              composerDisabled
                ? "Argus is unavailable for this asset."
                : "Ask Argus about this asset…"
            }
            value={draft}
            onChange={handleDraftChange}
            onKeyDown={handleKeyDown}
            disabled={composerDisabled}
            rows={1}
            maxLength={ANALYST_MAX_MESSAGE_CHARS}
            aria-label="Message Argus"
          />
          {streaming ? (
            <button
              type="button"
              className="iv-analyst-send iv-analyst-send-stop"
              onClick={handleStop}
            >
              Stop
            </button>
          ) : (
            <button
              type="submit"
              className="iv-analyst-send"
              disabled={composerDisabled || draft.trim().length === 0}
            >
              Send
            </button>
          )}
        </div>
        <p className="iv-analyst-disclaimer">
          Argus answers only from the selected asset's evidence. It does not browse the web and
          cannot revise the AEGIS score.
        </p>
      </form>
    </section>
  );
}
