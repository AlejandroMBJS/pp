"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Check, CheckCheck, Info, MessageSquare, Pencil, Search, Send, Trash2, User } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "./ui/confirm-dialog";

type ProjectMessage = {
  id: string;
  from_user_id: string;
  to_user_id?: string;
  text: string;
  type: string;
  status: string;
  created_at: string;
};

type UserSummary = {
  id: string;
  full_name: string;
  email: string;
  role: string;
};

type Task = {
  assigned_to_user_id: string;
};

type Project = {
  id: string;
  name: string;
  client_user_id: string;
  supervisor_user_id: string;
};

type Session = {
  access_token: string;
  user: {
    id: string;
    full_name: string;
    email: string;
    role: string;
  };
};

const messageTypeLabels: Record<string, string> = {
  chat: "General",
  rfi: "RFI",
  announcement: "Announcement",
};

export function MessagingHub({
  project,
  session,
  users,
  tasks,
  isMobile = false,
}: {
  project: Project;
  session: Session;
  users: UserSummary[];
  tasks: Task[];
  isMobile?: boolean;
}) {
  const [messages, setMessages] = useState<ProjectMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [type, setType] = useState("chat");
  const [recipientId, setRecipientId] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const readInFlightRef = useRef<Set<string>>(new Set());

  const userMap = useMemo(() => {
    const map = new Map<string, UserSummary>();
    users.forEach((user) => map.set(user.id, user));
    map.set(session.user.id, {
      id: session.user.id,
      full_name: session.user.full_name,
      email: session.user.email,
      role: session.user.role,
    });
    return map;
  }, [session.user.email, session.user.full_name, session.user.id, session.user.role, users]);

  const recipients = useMemo(() => {
    const participantIDs = new Set<string>();
    if (project.supervisor_user_id) participantIDs.add(project.supervisor_user_id);
    if (project.client_user_id) participantIDs.add(project.client_user_id);
    tasks.forEach((task) => {
      if (task.assigned_to_user_id) participantIDs.add(task.assigned_to_user_id);
    });
    users.forEach((user) => {
      if (user.role === "owner") participantIDs.add(user.id);
    });
    participantIDs.delete(session.user.id);
    return Array.from(participantIDs)
      .map((id) => userMap.get(id))
      .filter((user): user is UserSummary => Boolean(user))
      .sort((left, right) => (left.full_name || left.email).localeCompare(right.full_name || right.email));
  }, [project.client_user_id, project.supervisor_user_id, session.user.id, tasks, userMap, users]);

  function userLabel(userID: string) {
    if (userID === session.user.id) return "You";
    const user = userMap.get(userID);
    return user?.full_name || user?.email || "Unknown user";
  }

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;
    async function poll() {
      await fetchMessages();
      if (!cancelled) timer = setTimeout(poll, 5000);
    }
    void poll();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [project.id, session.access_token]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    const unreadIncoming = messages
      .filter((message) => message.to_user_id === session.user.id && message.status === "unread")
      .map((message) => message.id);
    if (unreadIncoming.length > 0) {
      void markMessagesAsRead(unreadIncoming);
    }
  }, [messages, session.user.id]);

  async function fetchMessages() {
    try {
      const res = await fetch(`/api/v1/projects/${project.id}/messages`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json().catch(() => []);
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      setMessages(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
      toast.error("Could not load messages.");
    }
  }

  async function markMessagesAsRead(messageIDs: string[]) {
    const pendingIDs = messageIDs.filter((messageID) => !readInFlightRef.current.has(messageID));
    if (pendingIDs.length === 0) return;
    pendingIDs.forEach((messageID) => readInFlightRef.current.add(messageID));
    try {
      await Promise.all(
        pendingIDs.map(async (messageID) => {
          const res = await fetch(`/api/v1/messages/${messageID}`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ status: "read" }),
          });
          if (!res.ok) {
            const payload = await res.json().catch(() => ({}));
            throw new Error(payload?.error ?? `HTTP ${res.status}`);
          }
        })
      );
      await fetchMessages();
    } catch (error) {
      console.error(error);
    } finally {
      pendingIDs.forEach((messageID) => readInFlightRef.current.delete(messageID));
    }
  }

  async function sendMessage() {
    if (!inputText.trim() || sending) return;
    if (type === "announcement" && recipientId) {
      toast.error("Announcements must use the project channel.");
      return;
    }
    setSending(true);
    try {
      const res = await fetch(`/api/v1/projects/${project.id}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          text: inputText.trim(),
          type,
          to_user_id: recipientId,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error ?? `HTTP ${res.status}`);
      setInputText("");
      setRecipientId("");
      setType("chat");
      await fetchMessages();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Could not send the message.");
    } finally {
      setSending(false);
    }
  }

  async function handleUpdateMessage(message: ProjectMessage) {
    if (!editingText.trim()) return;
    try {
      const res = await fetch(`/api/v1/messages/${message.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ text: editingText.trim(), type: message.type, status: message.status }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error ?? `HTTP ${res.status}`);
      setEditingId(null);
      setEditingText("");
      toast.success("Message updated.");
      await fetchMessages();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Could not edit the message.");
    }
  }

  async function handleDeleteMessage(messageId: string) {
    setConfirmDeleteId(null);
    try {
      const res = await fetch(`/api/v1/messages/${messageId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error ?? `HTTP ${res.status}`);
      toast.success("Message deleted.");
      await fetchMessages();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Could not delete the message.");
    }
  }

  const filteredMessages = useMemo(() => {
    const normalizedQuery = query.toLowerCase();
    return messages.filter((message) => {
      const searchable = [
        message.text,
        messageTypeLabels[message.type] ?? message.type,
        userLabel(message.from_user_id),
        message.to_user_id ? userLabel(message.to_user_id) : "Project channel",
      ]
        .join(" ")
        .toLowerCase();
      return searchable.includes(normalizedQuery);
    });
  }, [messages, query, session.user.id, userMap]);

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className={`flex flex-col glass-card border-white/5 bg-white/[0.01] overflow-hidden animate-in fade-in zoom-in-95 duration-500 ${isMobile ? 'h-[calc(100vh-180px)]' : 'h-[700px]'}`}>
      <ConfirmDialog
        open={confirmDeleteId !== null}
        title="Delete message?"
        body="This message will be permanently removed."
        confirmLabel="Delete"
        destructive
        onConfirm={() => confirmDeleteId && void handleDeleteMessage(confirmDeleteId)}
        onCancel={() => setConfirmDeleteId(null)}
      />
      <div className={`${isMobile ? 'p-4' : 'p-6'} border-b border-white/5 flex items-center justify-between bg-white/[0.01]`}>
        <div className="flex items-center gap-3">
          <div className={`${isMobile ? 'h-10 w-10' : 'h-12 w-12'} rounded-2xl bg-blue-600/20 flex items-center justify-center border border-blue-600/20`}>
            <MessageSquare className="text-blue-400" size={isMobile ? 20 : 24} />
          </div>
          <div>
            <h2 className={`${isMobile ? 'text-base' : 'text-lg'} font-black text-white tracking-tight`}>Communication Hub</h2>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
              <span className="text-[10px] font-black uppercase tracking-widest text-white/30">Project: {project.name}</span>
            </div>
          </div>
        </div>

        <div className="relative hidden md:block">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20" />
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="SEARCH MESSAGES..."
            className="bg-white/5 border border-white/5 rounded-xl pl-9 pr-4 py-2 text-[10px] font-black uppercase tracking-widest text-white placeholder:text-white/10 w-56 focus:border-blue-500/30 transition-all outline-none"
          />
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar scroll-smooth">
        {filteredMessages.map((message) => {
          const isOwn = message.from_user_id === session.user.id;
          const isDirect = Boolean(message.to_user_id);
          const isEditing = editingId === message.id;
          const canManageContent = isOwn || session.user.role === "owner" || session.user.role === "supervisor";
          const typeLabel = messageTypeLabels[message.type] ?? message.type;
          const recipientLabel = message.to_user_id ? userLabel(message.to_user_id) : "Project channel";

          return (
            <div key={message.id} className={`flex ${isOwn ? "justify-end" : "justify-start"} animate-in slide-in-from-bottom-2`}>
              <div className={`max-w-[80%] flex gap-3 ${isOwn ? "flex-row-reverse" : "flex-row"}`}>
                <div className="h-8 w-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center shrink-0 mt-1">
                  <User size={14} className="text-white/40" />
                </div>
                <div className="space-y-1 w-full">
                  <div
                    className={`px-4 py-3 rounded-2xl text-sm font-medium leading-relaxed ${
                      isOwn
                        ? "bg-blue-600/20 border border-blue-500/30 text-white rounded-tr-none"
                        : message.type === "rfi"
                          ? "bg-amber-500/10 border border-amber-500/20 text-white rounded-tl-none"
                          : message.type === "announcement"
                            ? "bg-emerald-500/10 border border-emerald-500/20 text-white rounded-tl-none"
                            : "bg-white/5 border border-white/10 text-white/90 rounded-tl-none"
                    }`}
                  >
                    <div className={`flex flex-wrap items-center gap-2 mb-2 ${isOwn ? "justify-end" : "justify-start"}`}>
                      <span className="text-[10px] font-black uppercase tracking-[0.12em] text-white/35">
                        {userLabel(message.from_user_id)}
                      </span>
                      <span className="rounded-full border border-white/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] text-white/45">
                        {typeLabel}
                      </span>
                      <span className="rounded-full border border-white/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] text-white/45">
                        {isDirect ? `Private to ${recipientLabel}` : "Project channel"}
                      </span>
                    </div>
                    {isEditing ? (
                      <div className="space-y-3">
                        <textarea
                          value={editingText}
                          onChange={(event) => setEditingText(event.target.value)}
                          className="w-full min-h-[88px] rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm text-white outline-none focus:border-blue-400/40"
                        />
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(null);
                              setEditingText("");
                            }}
                            className="rounded-xl border border-white/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white/60"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleUpdateMessage(message)}
                            className="rounded-xl bg-blue-600 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white"
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    ) : (
                      message.text
                    )}
                  </div>
                  <div className={`flex items-center gap-2 px-1 ${isOwn ? "justify-end" : "justify-start"}`}>
                    <span className="text-[10px] font-black uppercase tracking-widest text-white/20">{formatTime(message.created_at)}</span>
                    {isOwn && isDirect && (
                      message.status === "read"
                        ? <CheckCheck size={12} className="text-blue-400/70" />
                        : <Check size={12} className="text-blue-400/50" />
                    )}
                    {!isOwn && isDirect && message.status === "unread" && (
                      <span className="text-[9px] font-black uppercase tracking-[0.12em] text-amber-300/80">Unread</span>
                    )}
                    {canManageContent && !isEditing && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(message.id);
                            setEditingText(message.text);
                          }}
                          className="rounded-lg border border-white/10 bg-white/5 p-1.5 text-white/35 transition-colors hover:text-white/70"
                          aria-label="Edit message"
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(message.id)}
                          className="rounded-lg border border-red-500/10 bg-red-500/[0.08] p-1.5 text-red-300/60 transition-colors hover:text-red-200"
                          aria-label="Delete message"
                        >
                          <Trash2 size={12} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {filteredMessages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-20">
            <MessageSquare size={48} />
            <div className="text-xs font-black uppercase tracking-[0.2em]">
              {query ? "No matches" : "Start the conversation in this project"}
            </div>
          </div>
        )}
      </div>

      <div className="p-6 bg-white/[0.02] border-t border-white/5">
        <div className="flex flex-wrap items-center gap-4 mb-4">
          {[
            { id: "chat", label: "General", icon: <MessageSquare size={12} /> },
            { id: "rfi", label: "Requests (RFI)", icon: <AlertCircle size={12} /> },
            { id: "announcement", label: "Announcements", icon: <Info size={12} /> },
          ].map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setType(option.id)}
              className={`whitespace-nowrap flex items-center gap-3 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border shadow-sm ${
                type === option.id
                  ? "bg-blue-600 border-blue-500 text-white shadow-blue-500/20"
                  : "bg-white/5 border-white/10 text-white/40 hover:text-white hover:bg-white/10"
              }`}
            >
              {option.icon}
              {option.label}
            </button>
          ))}
          <select
            value={recipientId}
            onChange={(event) => setRecipientId(event.target.value)}
            className="min-w-[220px] rounded-xl border border-white/10 bg-[#0f172a] px-4 py-2.5 text-[11px] font-black uppercase tracking-[0.12em] text-white/80 outline-none focus:border-blue-500/40"
          >
            <option value="">Project channel</option>
            {recipients.map((recipient) => (
              <option key={recipient.id} value={recipient.id}>
                {recipient.full_name || recipient.email}
              </option>
            ))}
          </select>
        </div>

        <div className="mb-3 text-[11px] text-white/35">
          {recipientId
            ? `Direct message to ${userLabel(recipientId)}. Read status is tracked.`
            : "Project channel message visible to the whole project thread."}
        </div>

        <div className="relative group">
          <textarea
            value={inputText}
            onChange={(event) => setInputText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void sendMessage();
              }
            }}
            placeholder="WRITE YOUR MESSAGE HERE..."
            className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 pr-32 text-sm font-medium text-white placeholder:text-white/10 focus:border-blue-500/40 focus:bg-white/[0.08] transition-all outline-none resize-none min-h-[60px] max-h-[120px]"
          />
          <div className="absolute right-3 bottom-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => void sendMessage()}
              disabled={sending || !inputText.trim()}
              className="h-10 px-6 rounded-xl bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50 disabled:grayscale"
            >
              <span className="text-[10px] font-black uppercase tracking-widest">Send</span>
              <Send size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
