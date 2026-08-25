"use client";

import { useEffect, useRef, useState } from "react";

import { ClipboardList, FileText, Paperclip, RefreshCw, Send, Sparkles, X } from "lucide-react";

import type { PortfolioAnalysis } from "@/lib/analytics";
import type { Plan } from "@/lib/plan";
import {
  attachmentDataUrl,
  fileToAttachment,
  formatBytes,
  MAX_ATTACHMENTS,
  MAX_TOTAL_BYTES,
  type Attachment,
} from "@/lib/attachments";
import { fmtPct, fmtUSD } from "@/lib/format";
import Markdown from "@/components/Markdown";
import PlanCards from "@/components/PlanCards";

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  /** When present, this assistant turn renders as structured plan cards. */
  plan?: Plan;
  /** Screenshots / PDFs the owner attached to this (user) turn. */
  attachments?: Attachment[];
}

/** Anthropic content-block shapes sent to /api/strategist. */
type ReqBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
  | { type: "document"; source: { type: "base64"; media_type: string; data: string } };
type ReqContent = string | ReqBlock[];
interface ReqMessage {
  role: "user" | "assistant";
  content: ReqContent;
}

const CHIPS = [
  "How concentrated am I, really?",
  "What are my riskiest holdings?",
  "Where should my next $150 go?",
  "Any news affecting my holdings today?",
];

/** Sent as the text block when the owner attaches something without typing. */
const DEFAULT_ATTACH_PROMPT =
  "Take a look at what I've attached and tell me what's relevant to my portfolio and any moves I should consider.";

/** Turn a turn's text + attachments into a string or an array of content blocks. */
function buildContent(text: string, attachments: Attachment[]): ReqContent {
  if (attachments.length === 0) return text;
  const blocks: ReqBlock[] = [];
  // Documents and images go before the text block, per Anthropic guidance.
  for (const a of attachments) {
    if (a.kind === "pdf") {
      blocks.push({ type: "document", source: { type: "base64", media_type: a.mediaType, data: a.data } });
    }
  }
  for (const a of attachments) {
    if (a.kind === "image") {
      blocks.push({ type: "image", source: { type: "base64", media_type: a.mediaType, data: a.data } });
    }
  }
  blocks.push({ type: "text", text: text.trim() || DEFAULT_ATTACH_PROMPT });
  return blocks;
}

/**
 * Map a displayed message to an API message. Also substitutes non-empty text
 * for assistant plan turns (which display as cards with empty text) so the
 * request never carries an empty content string.
 */
function toApiMessage(m: ChatMessage): ReqMessage {
  if (m.role === "assistant") {
    const text = m.text.trim() || (m.plan ? "(Provided a structured sell & reinvest plan.)" : "(no response)");
    return { role: "assistant", content: text };
  }
  return { role: "user", content: buildContent(m.text, m.attachments ?? []) };
}

function AttachmentRow({ attachments }: { attachments: Attachment[] }) {
  return (
    <div className="attach-row">
      {attachments.map((a, i) =>
        a.kind === "image" ? (
          <a
            className="att-thumb"
            key={i}
            href={attachmentDataUrl(a)}
            target="_blank"
            rel="noreferrer"
            title={a.name}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={attachmentDataUrl(a)} alt={a.name} />
          </a>
        ) : (
          <a className="att-doc" key={i} href={attachmentDataUrl(a)} target="_blank" rel="noreferrer" title={a.name}>
            <FileText size={14} />
            <span className="att-name">{a.name}</span>
          </a>
        ),
      )}
    </div>
  );
}

export default function Strategist({ a }: { a: PortfolioAnalysis }) {
  const greeting = `I've got your full picture — ${fmtUSD(a.total)} across ${a.byAccount.length} accounts, with Tesla at ${
    a.tsla ? fmtPct(a.tsla.pct) : "0%"
  }. Ask me anything: where new money should go, what's overlapping, your riskiest holdings, or what's moving your positions today. You can also attach a screenshot or statement for me to read.`;

  const [messages, setMessages] = useState<ChatMessage[]>([{ role: "assistant", text: greeting }]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [streaming, setStreaming] = useState("");
  const [pending, setPending] = useState<Attachment[]>([]);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, streaming, busy, pending]);

  /** Validate and stage picked/pasted/dropped files as pending attachments. */
  async function addFiles(files: File[]) {
    if (!files.length || busy) return;
    setAttachError(null);
    let current = pending;
    for (const file of files) {
      if (current.length >= MAX_ATTACHMENTS) {
        setAttachError(`Up to ${MAX_ATTACHMENTS} attachments per message.`);
        break;
      }
      try {
        const att = await fileToAttachment(file);
        const total = current.reduce((s, x) => s + x.bytes, 0) + att.bytes;
        if (total > MAX_TOTAL_BYTES) {
          setAttachError(`That would exceed the ${formatBytes(MAX_TOTAL_BYTES)} limit for one message.`);
          continue;
        }
        current = [...current, att];
        setPending(current);
      } catch (e) {
        setAttachError(e instanceof Error ? e.message : "Couldn't attach that file.");
      }
    }
  }

  function removePending(i: number) {
    setPending((p) => p.filter((_, idx) => idx !== i));
  }

  function onPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it && it.kind === "file") {
        const f = it.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length) {
      e.preventDefault();
      void addFiles(files);
    }
  }

  async function send(q?: string) {
    const question = (q ?? input).trim();
    const atts = pending;
    if ((!question && atts.length === 0) || busy) return;

    setInput("");
    setPending([]);
    setAttachError(null);
    setBusy(true);
    setStreaming("");

    const userMsg: ChatMessage = {
      role: "user",
      text: question,
      attachments: atts.length ? atts : undefined,
    };

    // Conversation for the API: drop the display-only greeting (first message),
    // then append the new user turn. First API message must be a user turn.
    const apiMessages: ReqMessage[] = [...messages.slice(1).map(toApiMessage), toApiMessage(userMsg)];

    setMessages((m) => [...m, userMsg]);

    try {
      const res = await fetch("/api/strategist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages }),
      });

      if (!res.ok || !res.body) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Request failed (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setStreaming(acc);
      }
      acc += decoder.decode();
      setMessages((m) => [...m, { role: "assistant", text: acc.trim() || "(no response)" }]);
    } catch (e) {
      setMessages((m) => [
        ...m,
        { role: "assistant", text: e instanceof Error ? e.message : "Something went wrong. Try again in a moment." },
      ]);
    } finally {
      setStreaming("");
      setBusy(false);
    }
  }

  /** Ask for a structured sell/reinvest plan and render it as action cards. */
  async function buildPlan() {
    if (busy) return;
    setBusy(true);
    setStreaming("");
    setMessages((m) => [...m, { role: "user", text: "Build my full sell & reinvest plan." }]);

    try {
      const res = await fetch("/api/strategist/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = (await res.json().catch(() => null)) as { plan?: Plan; error?: string } | null;
      if (!res.ok || !body?.plan) throw new Error(body?.error ?? `Request failed (${res.status})`);
      setMessages((m) => [...m, { role: "assistant", text: "", plan: body.plan }]);
    } catch (e) {
      setMessages((m) => [
        ...m,
        { role: "assistant", text: e instanceof Error ? e.message : "Couldn't build the plan. Try again in a moment." },
      ]);
    } finally {
      setBusy(false);
    }
  }

  const canSend = !busy && (input.trim().length > 0 || pending.length > 0);

  return (
    <div
      className={"card chat" + (dragOver ? " drag" : "")}
      onDragOver={(e) => {
        e.preventDefault();
        if (!busy) setDragOver(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setDragOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const files = e.dataTransfer?.files ? Array.from(e.dataTransfer.files) : [];
        void addFiles(files);
      }}
    >
      <div className="msgs" ref={scrollRef}>
        {messages.map((m, i) => (
          <div className={"msg " + (m.role === "assistant" ? "ai" : "user")} key={i}>
            <div className="who">
              {m.role === "assistant" ? (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <Sparkles size={12} /> Strategist
                </span>
              ) : (
                "You"
              )}
            </div>
            <div className="bubble">
              {m.role !== "assistant" ? (
                <>
                  {m.attachments?.length ? <AttachmentRow attachments={m.attachments} /> : null}
                  {m.text ? <span>{m.text}</span> : null}
                </>
              ) : m.plan ? (
                <PlanCards plan={m.plan} />
              ) : (
                <Markdown source={m.text} />
              )}
            </div>
          </div>
        ))}

        {busy && streaming && (
          <div className="msg ai">
            <div className="who">
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Sparkles size={12} /> Strategist
              </span>
            </div>
            <div className="bubble"><Markdown source={streaming} /></div>
          </div>
        )}

        {busy && !streaming && (
          <div className="think">
            <RefreshCw size={14} className="spin" /> Reading your portfolio and the market…
          </div>
        )}
      </div>

      {messages.length <= 1 && (
        <div className="chips">
          {CHIPS.map((c) => (
            <button className="chip" key={c} onClick={() => void send(c)}>
              {c}
            </button>
          ))}
        </div>
      )}

      <div className="planbar">
        <button type="button" className="planbtn" onClick={() => void buildPlan()} disabled={busy}>
          <ClipboardList size={15} /> Build my full sell &amp; reinvest plan
        </button>
        <span className="planbar-hint">structured cards with per-account tax</span>
      </div>

      {pending.length > 0 && (
        <div className="pending">
          {pending.map((att, i) => (
            <div className={"att " + att.kind} key={i}>
              {att.kind === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={attachmentDataUrl(att)} alt={att.name} />
              ) : (
                <FileText size={15} />
              )}
              <span className="att-meta">
                <span className="att-name">{att.name}</span>
                <span className="att-size">{formatBytes(att.bytes)}</span>
              </span>
              <button className="rm" onClick={() => removePending(i)} aria-label={`Remove ${att.name}`}>
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      {attachError && <div className="attwarn">{attachError}</div>}

      <div className="inbar">
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,application/pdf"
          multiple
          hidden
          onChange={(e) => {
            const files = e.target.files ? Array.from(e.target.files) : [];
            void addFiles(files);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          className="attachbtn"
          onClick={() => fileRef.current?.click()}
          disabled={busy || pending.length >= MAX_ATTACHMENTS}
          aria-label="Attach a screenshot or PDF"
          title="Attach a screenshot or PDF"
        >
          <Paperclip size={17} />
        </button>
        <input
          value={input}
          placeholder="Ask your strategist…  (attach or paste a screenshot)"
          aria-label="Ask your strategist"
          onChange={(e) => setInput(e.target.value)}
          onPaste={onPaste}
          onKeyDown={(e) => {
            if (e.key === "Enter") void send();
          }}
        />
        <button className="sendbtn" disabled={!canSend} onClick={() => void send()} aria-label="Send">
          <Send size={17} />
        </button>
      </div>

      <div className="disc">
        Educational analysis using your own data and live web search — not licensed investment, tax, or legal advice.
        Figures come from your holdings; verify before acting.
      </div>
    </div>
  );
}
