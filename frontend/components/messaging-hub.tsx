"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCheck,
  Eye,
  Info,
  Lock,
  MessageSquare,
  Pencil,
  Search,
  Send,
  Trash2,
  User,
  Users as UsersIcon,
} from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "./ui/confirm-dialog";
import { SearchInput, FilterChips } from "./ui/toolbar";

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

type ConversationKind = "project" | "dm" | "sup";
type ConversationKey = "project" | `dm:${string}` | `sup:${string}`;

type Conversation = {
  key: ConversationKey;
  kind: ConversationKind;
  label: string;
  subtitle?: string;
  participants: string[];
  lastMessage: ProjectMessage | null;
  unreadCount: number;
};

const messageTypeLabels: Record<string, string> = {
  chat: "General",
  rfi: "RFI",
  announcement: "Announcement",
};

function sortedPairKey(a: string, b: string): string {
  return [a, b].sort().join("::");
}

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
  const [sidebarQuery, setSidebarQuery] = useState("");
  const [messageQuery, setMessageQuery] = useState("");
  const [messageSearchOpen, setMessageSearchOpen] = useState(false);
  const [messageTypeFilter, setMessageTypeFilter] = useState<
    "all" | "chat" | "rfi" | "announcement"
  >("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [sending, setSending] = useState(false);
  const [selectedKey, setSelectedKey] = useState<ConversationKey>("project");
  const [mobileViewing, setMobileViewing] = useState<"list" | "conversation">("list");
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
      .sort((left, right) =>
        (left.full_name || left.email).localeCompare(right.full_name || right.email)
      );
  }, [project.client_user_id, project.supervisor_user_id, session.user.id, tasks, userMap, users]);

  function userLabel(userID: string) {
    if (userID === session.user.id) return "You";
    const user = userMap.get(userID);
    return user?.full_name || user?.email || "Unknown user";
  }

  function conversationKeyFor(m: ProjectMessage): ConversationKey {
    if (!m.to_user_id) return "project";
    const me = session.user.id;
    if (m.from_user_id === me || m.to_user_id === me) {
      const other = m.from_user_id === me ? m.to_user_id : m.from_user_id;
      return `dm:${sortedPairKey(me, other)}` as ConversationKey;
    }
    return `sup:${sortedPairKey(m.from_user_id, m.to_user_id)}` as ConversationKey;
  }

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;
    async function poll() {
      // Bail out if the effect was cleaned up before the first fetch resolves
      // (audit-findings.md F15). Without this, fetchMessages can complete and
      // setState on a stale-effect's state.
      if (cancelled) return;
      await fetchMessages();
      if (!cancelled) timer = setTimeout(poll, 5000);
    }
    void poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [project.id, session.access_token]);

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

  const conversations = useMemo((): Conversation[] => {
    const map = new Map<ConversationKey, ProjectMessage[]>();
    messages.forEach((m) => {
      const key = conversationKeyFor(m);
      const list = map.get(key) ?? [];
      list.push(m);
      map.set(key, list);
    });
    if (!map.has("project")) map.set("project", []);

    const me = session.user.id;
    const out: Conversation[] = [];

    map.forEach((list, key) => {
      const sorted = [...list].sort((a, b) => a.created_at.localeCompare(b.created_at));
      const last = sorted.length ? sorted[sorted.length - 1] : null;

      if (key === "project") {
        out.push({
          key,
          kind: "project",
          label: "Project channel",
          subtitle: "All team members",
          participants: [],
          lastMessage: last,
          unreadCount: 0,
        });
      } else if (key.startsWith("dm:")) {
        const pair = key.slice(3).split("::");
        const other = pair.find((id) => id !== me) ?? pair[0] ?? "";
        out.push({
          key,
          kind: "dm",
          label: userLabel(other),
          subtitle: userMap.get(other)?.email,
          participants: [me, other],
          lastMessage: last,
          unreadCount: list.filter((m) => m.to_user_id === me && m.status === "unread").length,
        });
      } else if (key.startsWith("sup:")) {
        const [a, b] = key.slice(4).split("::");
        out.push({
          key,
          kind: "sup",
          label: `${userLabel(a)} ↔ ${userLabel(b)}`,
          subtitle: "Supervised conversation",
          participants: [a, b],
          lastMessage: last,
          unreadCount: 0,
        });
      }
    });

    return out;
  }, [messages, session.user.id, userMap]);

  const filteredConversations = useMemo(() => {
    const q = sidebarQuery.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => {
      const hay = `${c.label} ${c.subtitle ?? ""} ${c.lastMessage?.text ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [conversations, sidebarQuery]);

  const sortedMain = useMemo(() => {
    return filteredConversations
      .filter((c) => c.kind !== "sup")
      .sort((a, b) => {
        if (a.kind === "project") return -1;
        if (b.kind === "project") return 1;
        return (b.lastMessage?.created_at ?? "").localeCompare(a.lastMessage?.created_at ?? "");
      });
  }, [filteredConversations]);

  const sortedSup = useMemo(() => {
    return filteredConversations
      .filter((c) => c.kind === "sup")
      .sort((a, b) =>
        (b.lastMessage?.created_at ?? "").localeCompare(a.lastMessage?.created_at ?? "")
      );
  }, [filteredConversations]);

  const supervisionVisible =
    sortedSup.length > 0 &&
    (session.user.role === "owner" || session.user.role === "supervisor");

  const activeConversation =
    conversations.find((c) => c.key === selectedKey) ??
    conversations.find((c) => c.kind === "project") ??
    null;

  const conversationMessages = useMemo(() => {
    if (!activeConversation) return [];
    return messages
      .filter((m) => conversationKeyFor(m) === activeConversation.key)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }, [messages, activeConversation, session.user.id]);

  const visibleMessages = useMemo(() => {
    const q = messageQuery.trim().toLowerCase();
    return conversationMessages.filter((m) => {
      if (messageTypeFilter !== "all" && m.type !== messageTypeFilter) return false;
      if (!q) return true;
      const hay = `${m.text} ${userLabel(m.from_user_id)}`.toLowerCase();
      return hay.includes(q);
    });
  }, [conversationMessages, messageTypeFilter, messageQuery, userMap]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [visibleMessages.length, activeConversation?.key]);

  useEffect(() => {
    const unreadIncoming = visibleMessages
      .filter((m) => m.to_user_id === session.user.id && m.status === "unread")
      .map((m) => m.id);
    if (unreadIncoming.length > 0) {
      void markMessagesAsRead(unreadIncoming);
    }
  }, [visibleMessages, session.user.id]);

  useEffect(() => {
    setRecipientId("");
    setMessageQuery("");
    if (activeConversation?.kind === "dm" && type === "announcement") {
      setType("chat");
    }
    if (activeConversation?.kind === "sup" && editingId) {
      setEditingId(null);
      setEditingText("");
    }
  }, [activeConversation?.key]);

  const composerRecipient =
    activeConversation?.kind === "dm"
      ? activeConversation.participants.find((id) => id !== session.user.id) ?? ""
      : activeConversation?.kind === "project"
        ? recipientId
        : "";

  const isSupActive = activeConversation?.kind === "sup";

  async function sendMessage() {
    if (!inputText.trim() || sending) return;
    if (isSupActive) return;
    const toUserId = composerRecipient;
    if (type === "announcement" && toUserId) {
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
          to_user_id: toUserId,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error ?? `HTTP ${res.status}`);
      setInputText("");
      if (activeConversation?.kind === "project" && toUserId) {
        const me = session.user.id;
        setSelectedKey(`dm:${sortedPairKey(me, toUserId)}` as ConversationKey);
        setRecipientId("");
        setType("chat");
      }
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
        body: JSON.stringify({ text: editingText.trim() }),
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

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const formatPreviewTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const sameDay =
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate();
    if (sameDay) return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  function selectConversation(key: ConversationKey) {
    setSelectedKey(key);
    if (isMobile) setMobileViewing("conversation");
  }

  function conversationAvatar(c: Conversation) {
    if (c.kind === "project") return <UsersIcon size={16} className="text-blue-400" />;
    if (c.kind === "sup") return <Eye size={16} className="text-amber-400" />;
    const other = c.participants.find((id) => id !== session.user.id) ?? c.participants[0];
    const seed = userMap.get(other)?.full_name || userMap.get(other)?.email || "?";
    return (
      <span className="text-sm font-black text-white/80">
        {seed.trim().charAt(0).toUpperCase()}
      </span>
    );
  }

  function conversationAvatarBg(c: Conversation) {
    if (c.kind === "project") return "bg-blue-600/20 border border-blue-500/30";
    if (c.kind === "sup") return "bg-amber-500/10 border border-amber-500/20";
    return "bg-white/5 border border-white/10";
  }

  const showSidebar = !isMobile || mobileViewing === "list";
  const showPanel = !isMobile || mobileViewing === "conversation";

  return (
    <div
      className={`flex flex-col glass-card border-white/5 bg-white/[0.01] overflow-hidden animate-in fade-in zoom-in-95 duration-500 ${
        isMobile ? "h-[calc(100vh-180px)]" : "h-[700px]"
      }`}
    >
      <ConfirmDialog
        open={confirmDeleteId !== null}
        title="Delete message?"
        body="This message will be permanently removed."
        confirmLabel="Delete"
        destructive
        onConfirm={() => confirmDeleteId && void handleDeleteMessage(confirmDeleteId)}
        onCancel={() => setConfirmDeleteId(null)}
      />

      <div
        className={`${isMobile ? "p-4" : "p-5"} border-b border-white/5 flex items-center justify-between bg-white/[0.01]`}
      >
        <div className="flex items-center gap-3">
          <div
            className={`${isMobile ? "h-10 w-10" : "h-12 w-12"} rounded-2xl bg-blue-600/20 flex items-center justify-center border border-blue-600/20`}
          >
            <MessageSquare className="text-blue-400" size={isMobile ? 20 : 24} />
          </div>
          <div>
            <h2
              className={`${isMobile ? "text-base" : "text-lg"} font-black text-white tracking-tight`}
            >
              Communication Hub
            </h2>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
              <span className="text-[10px] font-black uppercase tracking-widest text-white/30">
                Project: {project.name}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        {showSidebar && (
          <div
            className={`${isMobile ? "w-full" : "w-[320px] border-r border-white/5"} flex flex-col bg-black/20 min-h-0`}
          >
            <div className="p-3 border-b border-white/5">
              <SearchInput
                value={sidebarQuery}
                onChange={setSidebarQuery}
                placeholder="Search chats…"
              />
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              <div className="py-1">
                {sortedMain.map((c) => {
                  const active = c.key === selectedKey;
                  return (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => selectConversation(c.key)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors border-l-2 ${
                        active
                          ? "bg-blue-500/10 border-l-blue-500"
                          : "border-l-transparent hover:bg-white/5"
                      }`}
                    >
                      <div
                        className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${conversationAvatarBg(c)}`}
                      >
                        {conversationAvatar(c)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm font-bold text-white truncate">{c.label}</div>
                          {c.lastMessage && (
                            <span className="text-[9px] font-black uppercase tracking-[0.12em] text-white/25 shrink-0">
                              {formatPreviewTime(c.lastMessage.created_at)}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center justify-between gap-2 mt-0.5">
                          <div className="text-[11px] text-white/40 truncate">
                            {c.lastMessage
                              ? c.lastMessage.from_user_id === session.user.id
                                ? `You: ${c.lastMessage.text}`
                                : c.lastMessage.text
                              : c.kind === "project"
                                ? "No messages yet"
                                : c.kind === "dm"
                                  ? c.subtitle
                                  : "No activity"}
                          </div>
                          {c.unreadCount > 0 && (
                            <span className="shrink-0 text-[9px] font-black bg-blue-500 text-white rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
                              {c.unreadCount}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
              {supervisionVisible && (
                <div className="border-t border-white/5">
                  <div className="px-4 pt-3 pb-1.5 flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.2em] text-amber-300/60">
                    <Eye size={11} />
                    <span>Supervisión</span>
                  </div>
                  <div className="py-1">
                    {sortedSup.map((c) => {
                      const active = c.key === selectedKey;
                      return (
                        <button
                          key={c.key}
                          type="button"
                          onClick={() => selectConversation(c.key)}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors border-l-2 ${
                            active
                              ? "bg-amber-500/10 border-l-amber-500"
                              : "border-l-transparent hover:bg-white/5"
                          }`}
                        >
                          <div
                            className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${conversationAvatarBg(c)}`}
                          >
                            {conversationAvatar(c)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <div className="text-sm font-bold text-white truncate">
                                {c.label}
                              </div>
                              {c.lastMessage && (
                                <span className="text-[9px] font-black uppercase tracking-[0.12em] text-white/25 shrink-0">
                                  {formatPreviewTime(c.lastMessage.created_at)}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-amber-300/50 truncate mt-0.5">
                              {c.lastMessage?.text ?? "No activity"}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {sortedMain.length === 0 && sortedSup.length === 0 && sidebarQuery && (
                <div className="p-8 text-center text-[10px] text-white/20 font-black uppercase tracking-widest">
                  No chats match
                </div>
              )}
            </div>
          </div>
        )}

        {showPanel && (
          <div className="flex-1 flex flex-col min-h-0">
            {activeConversation && (
              <div className="px-4 py-3 border-b border-white/5 flex items-center gap-3 bg-white/[0.01]">
                {isMobile && (
                  <button
                    type="button"
                    onClick={() => setMobileViewing("list")}
                    className="p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/5"
                    aria-label="Back to chats"
                  >
                    <ArrowLeft size={16} />
                  </button>
                )}
                <div
                  className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${conversationAvatarBg(activeConversation)}`}
                >
                  {conversationAvatar(activeConversation)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-white truncate">
                    {activeConversation.label}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5 text-[10px] font-black uppercase tracking-[0.15em]">
                    {activeConversation.kind === "dm" && (
                      <span className="flex items-center gap-1 text-blue-400/80">
                        <Lock size={10} />
                        Private
                      </span>
                    )}
                    {activeConversation.kind === "sup" && (
                      <span className="flex items-center gap-1 text-amber-400/80">
                        <Eye size={10} />
                        Supervised — read only
                      </span>
                    )}
                    {activeConversation.kind === "project" && (
                      <span className="text-white/30">{activeConversation.subtitle}</span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setMessageSearchOpen((v) => !v)}
                  className={`p-2 rounded-lg transition-colors ${
                    messageSearchOpen
                      ? "bg-white/10 text-white"
                      : "text-white/40 hover:text-white hover:bg-white/5"
                  }`}
                  aria-label="Search in conversation"
                >
                  <Search size={14} />
                </button>
              </div>
            )}

            {messageSearchOpen && activeConversation && (
              <div className="px-4 py-2 border-b border-white/5 flex flex-wrap items-center gap-2">
                <SearchInput
                  value={messageQuery}
                  onChange={setMessageQuery}
                  placeholder="Search in conversation…"
                />
                <FilterChips<"all" | "chat" | "rfi" | "announcement">
                  options={[
                    { value: "all", label: "All" },
                    { value: "chat", label: "General", color: "#3b82f6" },
                    { value: "rfi", label: "RFI", color: "#f59e0b" },
                    { value: "announcement", label: "Ann.", color: "#10b981" },
                  ]}
                  value={messageTypeFilter}
                  onChange={setMessageTypeFilter}
                />
              </div>
            )}

            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar scroll-smooth"
            >
              {visibleMessages.map((message) => {
                const isOwn = message.from_user_id === session.user.id;
                const isDirect = Boolean(message.to_user_id);
                const isEditing = editingId === message.id;
                const canManageContent =
                  !isSupActive &&
                  (isOwn ||
                    session.user.role === "owner" ||
                    session.user.role === "supervisor");
                const typeLabel = messageTypeLabels[message.type] ?? message.type;

                return (
                  <div
                    key={message.id}
                    className={`flex ${isOwn ? "justify-end" : "justify-start"} animate-in slide-in-from-bottom-2`}
                  >
                    <div
                      className={`max-w-[80%] flex gap-3 ${isOwn ? "flex-row-reverse" : "flex-row"}`}
                    >
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
                          <div
                            className={`flex flex-wrap items-center gap-2 mb-2 ${
                              isOwn ? "justify-end" : "justify-start"
                            }`}
                          >
                            <span className="text-[10px] font-black uppercase tracking-[0.12em] text-white/35">
                              {userLabel(message.from_user_id)}
                            </span>
                            {message.type !== "chat" && (
                              <span className="rounded-full border border-white/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] text-white/45">
                                {typeLabel}
                              </span>
                            )}
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
                        <div
                          className={`flex items-center gap-2 px-1 ${
                            isOwn ? "justify-end" : "justify-start"
                          }`}
                        >
                          <span className="text-[10px] font-black uppercase tracking-widest text-white/20">
                            {formatTime(message.created_at)}
                          </span>
                          {isOwn && isDirect && (message.status === "read" ? (
                            <CheckCheck size={12} className="text-blue-400/70" />
                          ) : (
                            <Check size={12} className="text-blue-400/50" />
                          ))}
                          {!isOwn && isDirect && message.status === "unread" && !isSupActive && (
                            <span className="text-[9px] font-black uppercase tracking-[0.12em] text-amber-300/80">
                              Unread
                            </span>
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

              {visibleMessages.length === 0 && activeConversation && (
                <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-20">
                  <MessageSquare size={48} />
                  <div className="text-xs font-black uppercase tracking-[0.2em]">
                    {messageQuery
                      ? "No matches"
                      : activeConversation.kind === "dm"
                        ? "Start the private conversation"
                        : activeConversation.kind === "sup"
                          ? "No activity"
                          : "Start the conversation in this project"}
                  </div>
                </div>
              )}
            </div>

            {activeConversation && !isSupActive && (
              <div className="p-4 bg-white/[0.02] border-t border-white/5">
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  {[
                    { id: "chat", label: "General", icon: <MessageSquare size={12} /> },
                    { id: "rfi", label: "Requests (RFI)", icon: <AlertCircle size={12} /> },
                    { id: "announcement", label: "Announcements", icon: <Info size={12} /> },
                  ].map((option) => {
                    const dmBlocks =
                      option.id === "announcement" && activeConversation.kind === "dm";
                    const active = type === option.id && !dmBlocks;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => !dmBlocks && setType(option.id)}
                        disabled={dmBlocks}
                        title={
                          dmBlocks
                            ? "Announcements go to the whole project channel"
                            : undefined
                        }
                        className={`whitespace-nowrap flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border shadow-sm disabled:opacity-30 disabled:cursor-not-allowed ${
                          active
                            ? "bg-blue-600 border-blue-500 text-white shadow-blue-500/20"
                            : "bg-white/5 border-white/10 text-white/40 hover:text-white hover:bg-white/10"
                        }`}
                      >
                        {option.icon}
                        {option.label}
                      </button>
                    );
                  })}
                  {activeConversation.kind === "project" && (
                    <select
                      value={recipientId}
                      onChange={(event) => setRecipientId(event.target.value)}
                      className="min-w-[180px] rounded-xl border border-white/10 bg-[#0f172a] px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-white/80 outline-none focus:border-blue-500/40"
                    >
                      <option value="">Send to channel</option>
                      {recipients.map((recipient) => (
                        <option key={recipient.id} value={recipient.id}>
                          Private → {recipient.full_name || recipient.email}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="mb-2 flex items-center gap-2 text-[11px] text-white/35">
                  {activeConversation.kind === "dm" ? (
                    <span className="flex items-center gap-1.5">
                      <Lock size={11} className="text-blue-400/80" />
                      Private to {userLabel(composerRecipient)}. Read status is tracked.
                    </span>
                  ) : recipientId ? (
                    <span className="flex items-center gap-1.5">
                      <Lock size={11} className="text-blue-400/80" />
                      Starting a private DM with {userLabel(recipientId)}.
                    </span>
                  ) : (
                    <span>Visible to the whole project channel.</span>
                  )}
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
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-3 pr-28 text-sm font-medium text-white placeholder:text-white/10 focus:border-blue-500/40 focus:bg-white/[0.08] transition-all outline-none resize-none min-h-[60px] max-h-[120px]"
                  />
                  <div className="absolute right-3 bottom-3 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void sendMessage()}
                      disabled={sending || !inputText.trim()}
                      className="h-9 px-5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50 disabled:grayscale"
                    >
                      <span className="text-[10px] font-black uppercase tracking-widest">Send</span>
                      <Send size={14} />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeConversation && isSupActive && (
              <div className="p-3 bg-amber-500/5 border-t border-amber-500/10 text-center">
                <div className="text-[10px] font-black uppercase tracking-widest text-amber-300/70 flex items-center justify-center gap-2">
                  <Eye size={11} />
                  Supervised view — you cannot post here
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
