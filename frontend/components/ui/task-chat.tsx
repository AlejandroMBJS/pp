"use client";

import { useEffect, useRef, useState } from "react";
import { Send, MessageCircle } from "lucide-react";

type Message = {
  id: string;
  task_id: string;
  sender_user_id: string;
  sender_role: "owner" | "client" | string;
  sender_name?: string;
  body: string;
  created_at: string;
};

type Props = {
  taskId: string;
  apiBase?: string;
  accessToken: string;
  currentUserId: string;
  /** "client" | "owner" — used to render bubble alignment + label. */
  selfRole: "owner" | "client";
};

const POLL_MS = 12_000;
const MAX_BODY = 4000;

function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const now = Date.now();
  const diff = now - d.getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return d.toLocaleDateString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function TaskChat({ taskId, apiBase = "", accessToken, currentUserId, selfRole }: Props) {
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  async function load() {
    if (!taskId) return;
    try {
      const res = await fetch(`${apiBase}/api/v1/tasks/${taskId}/chat`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as Message[];
      setMessages(data);
      setError(null);
    } catch (err) {
      setError((err as Error).message || "load failed");
    }
  }

  useEffect(() => {
    void load();
    const id = window.setInterval(load, POLL_MS);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId, apiBase, accessToken]);

  // Scroll to bottom whenever the message list grows.
  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages?.length]);

  async function send() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const res = await fetch(`${apiBase}/api/v1/tasks/${taskId}/chat`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const msg = (await res.json()) as Message;
      setMessages((prev) => prev ? [...prev, msg] : [msg]);
      setDraft("");
      setError(null);
    } catch (err) {
      setError((err as Error).message || "send failed");
    } finally {
      setSending(false);
    }
  }

  function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void send();
    }
  }

  return (
    <div className="task-chat">
      <div className="task-chat-header">
        <MessageCircle size={14} className="text-white/55" />
        <span>Direct message</span>
        <span className="task-chat-header-hint">{selfRole === "owner" ? "with the client" : "with the project owner"}</span>
      </div>

      <div ref={scrollRef} className="task-chat-thread">
        {messages === null ? (
          <div className="text-xs text-white/40 italic px-3 py-4">Loading…</div>
        ) : messages.length === 0 ? (
          <div className="text-xs text-white/40 italic px-3 py-4">
            {selfRole === "owner"
              ? "No messages yet. The client will see anything you write here."
              : "No messages yet. Send the project owner a message about this task."}
          </div>
        ) : (
          messages.map((m) => {
            const isMine = m.sender_user_id === currentUserId;
            return (
              <div key={m.id} className={`task-chat-msg ${isMine ? "task-chat-msg-mine" : ""}`}>
                <div className="task-chat-msg-meta">
                  <span className="font-bold">
                    {isMine ? "You" : (m.sender_role === "owner" ? (m.sender_name || "Owner") : (m.sender_name || "Client"))}
                  </span>
                  <span className="text-white/30">·</span>
                  <span>{fmtTime(m.created_at)}</span>
                </div>
                <div className="task-chat-msg-body">{m.body}</div>
              </div>
            );
          })
        )}
      </div>

      <div className="task-chat-composer">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, MAX_BODY))}
          onKeyDown={onKey}
          rows={2}
          placeholder={selfRole === "owner" ? "Write to the client…" : "Write to the project owner…"}
          className="task-chat-input"
          disabled={sending}
        />
        <button
          type="button"
          onClick={send}
          disabled={!draft.trim() || sending}
          className="task-chat-send"
          title="Send (⌘/Ctrl+Enter)"
        >
          <Send size={14} />
        </button>
      </div>
      {error && <div className="task-chat-error">{error}</div>}
    </div>
  );
}
