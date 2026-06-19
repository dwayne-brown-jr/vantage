"use client";

import { useEffect, useRef, useState } from "react";

import { RefreshCw, Send, Sparkles } from "lucide-react";

import type { PortfolioAnalysis } from "@/lib/analytics";
import { fmtPct, fmtUSD } from "@/lib/format";

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}

const CHIPS = [
  "How concentrated am I, really?",
  "Where should my next $150 go?",
  "What are my riskiest holdings?",
  "Any news affecting my holdings today?",
];

export default function Strategist({ a }: { a: PortfolioAnalysis }) {
  const greeting = `I've got your full picture — ${fmtUSD(a.total)} across ${a.byAccount.length} accounts, with Tesla at ${
    a.tsla ? fmtPct(a.tsla.pct) : "0%"
  }. Ask me anything: where new money should go, what's overlapping, your riskiest holdings, or what's moving your positions today.`;

  const [messages, setMessages] = useState<ChatMessage[]>([{ role: "assistant", text: greeting }]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [streaming, setStreaming] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, streaming, busy]);

  async function send(q?: string) {
    const question = (q ?? input).trim();
    if (!question || busy) return;

    setInput("");
    setBusy(true);
    setStreaming("");

    // Conversation for the API: drop the display-only greeting (first message),
    // then append the new user turn. First API message must be a user turn.
    const apiMessages = [
      ...messages.slice(1).map((m) => ({ role: m.role, content: m.text })),
      { role: "user" as const, content: question },
    ];

    setMessages((m) => [...m, { role: "user", text: question }]);

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

  return (
    <div className="card chat">
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
            <div className="bubble">{m.text}</div>
          </div>
        ))}

        {busy && streaming && (
          <div className="msg ai">
            <div className="who">
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Sparkles size={12} /> Strategist
              </span>
            </div>
            <div className="bubble">{streaming}</div>
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

      <div className="inbar">
        <input
          value={input}
          placeholder="Ask your strategist…"
          aria-label="Ask your strategist"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void send();
          }}
        />
        <button className="sendbtn" disabled={busy || !input.trim()} onClick={() => void send()} aria-label="Send">
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
