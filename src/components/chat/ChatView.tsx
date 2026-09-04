"use client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  Pencil,
  GraduationCap,
  Code2,
  Coffee,
  Lightbulb,
  X,
  Trash2,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Composer, type PendingFile } from "./Composer";
import { MessageItem } from "./MessageItem";
import { useToast, ConfirmModal } from "@/components/ui/primitives";
import type { AIModel, Message, ReasoningEffort } from "@/types";
import { useSession } from "@/hooks/useSession";
import { cn } from "@/lib/utils";

function formatSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

// Anthropic's Signature Terracotta Sunburst Asterisk
export function ClaudeAsterisk({ className = "h-8 w-8 text-[#D97757]" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="10.5" y="1" width="3" height="22" rx="1.5" />
      <rect x="1" y="10.5" width="22" height="3" rx="1.5" />
      <rect x="10.5" y="1" width="3" height="22" rx="1.5" transform="rotate(45 12 12)" />
      <rect x="10.5" y="1" width="3" height="22" rx="1.5" transform="rotate(-45 12 12)" />
    </svg>
  );
}

// Claude's Ghost / Incognito Icon (matching the exact reference image)
export function ClaudeGhostIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M12 3a8 8 0 0 0-8 8v9l3-2 3 2 2-2 2 2 3-2 3 2v-9a8 8 0 0 0-8-8z" />
      <circle cx="9" cy="11" r="1.2" fill="currentColor" />
      <circle cx="15" cy="11" r="1.2" fill="currentColor" />
    </svg>
  );
}

// Category Prompt Data (exact match with Claude's official prompts)
type CategoryKey = "write" | "learn" | "code" | "life" | "choice";

interface CategoryData {
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  items: string[];
}

const CATEGORIES: Record<CategoryKey, CategoryData> = {
  write: {
    label: "Write",
    icon: Pencil,
    items: [
      "Develop editorial guidelines",
      "Write event descriptions",
      "Write marketing copy",
      "Write speech drafts",
      "Create a piece that blends two completely different writing styles",
    ],
  },
  learn: {
    label: "Learn",
    icon: GraduationCap,
    items: [
      "Create educational rubrics",
      "Develop research methodologies",
      "Design learning portfolios",
      "Create annotated bibliographies",
      "Help me make sense of these ideas",
    ],
  },
  code: {
    label: "Code",
    icon: Code2,
    items: [
      "Design error handling",
      "Create dependency maps",
      "Create technical diagrams",
      "Assess my approach to debugging problems",
      "Tell me what programming paradigm suits my thinking style",
    ],
  },
  life: {
    label: "Life stuff",
    icon: Coffee,
    items: [
      "Develop self-care practices",
      "Manage personal stress",
      "Create personal boundaries",
      "Explore productivity systems",
      "Manage household tasks",
    ],
  },
  choice: {
    label: "Claude's choice",
    icon: Lightbulb,
    items: [
      "Consider innovation patterns",
      "Play a word game together",
      "Explore thought experiments",
      "Investigate scientific mysteries",
      "Consider alternate histories",
    ],
  },
};

interface ChatViewProps {
  conversationId: string;
  initialMessages: Message[];
  models: AIModel[];
  projectId?: string | null;
  conversationTitle?: string;
  pinned?: boolean;
}

export function ChatView({
  conversationId,
  initialMessages,
  models,
  projectId,
  conversationTitle = "Cuộc trò chuyện",
}: ChatViewProps) {
  const [messages, setMessages] = useState<Message[]>(() => (Array.isArray(initialMessages) ? initialMessages : []));
  const [activeConvId, setActiveConvId] = useState(conversationId);
  const [currentTitle, setCurrentTitle] = useState(conversationTitle);

  useEffect(() => {
    if (conversationTitle) setCurrentTitle(conversationTitle);
  }, [conversationTitle]);

  const router = useRouter();
  const [streaming, setStreaming] = useState(false);
  const [status, setStatus] = useState("");
  const safeModels = useMemo(() => (Array.isArray(models) ? models : []), [models]);
  const [modelId, setModelId] = useState<string>(() => safeModels[0]?.id ?? "auto");
  // Optimization telemetry from last response (subtle indicator, spec §27)
  const [lastOpt, setLastOpt] = useState<{ tokensSaved: number; model: string; strategy: string; costUsd?: number; cachedInputTokens?: number } | null>(null);
  // Response length preference (concise/balanced/detailed → output budget, spec §16)
  const [responseLength, setResponseLength] = useState<"concise" | "balanced" | "detailed">("balanced");

  useEffect(() => {
    if ((!modelId || modelId === "auto") && safeModels.length > 0) {
      setModelId(safeModels[0].id);
    }
  }, [safeModels, modelId]);
  const [showJump, setShowJump] = useState(false);
  const [activeCategory, setActiveCategory] = useState<CategoryKey | null>(null);
  const [isIncognito, setIsIncognito] = useState(false);

  const { user } = useSession();
  const { toast, Toasts } = useToast();

  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isGeneratingRef = useRef(false);
  const hasMessages = messages.length > 0;

  const currentConvIdRef = useRef(conversationId);
  useEffect(() => {
    // Only re-sync state when navigating to a different conversation
    if (currentConvIdRef.current !== conversationId) {
      currentConvIdRef.current = conversationId;
      setMessages(Array.isArray(initialMessages) ? initialMessages : []);
      setActiveConvId(conversationId);
    }
  }, [conversationId, initialMessages]);

  const autoScrollRef = useRef(true);
  const lastScrollTopRef = useRef(0);

  const scrollToBottom = useCallback((smooth = false) => {
    autoScrollRef.current = true;
    setShowJump(false);
    const container = scrollRef.current;
    if (!container) return;
    if (smooth) {
      container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
    } else {
      container.scrollTop = container.scrollHeight;
    }
    lastScrollTopRef.current = container.scrollTop;
  }, []);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const currentScrollTop = el.scrollTop;
    const distanceToBottom = el.scrollHeight - currentScrollTop - el.clientHeight;

    // Detect intentional user scroll UP (scrollTop decreased by user action)
    if (currentScrollTop < lastScrollTopRef.current - 15) {
      autoScrollRef.current = false;
      setShowJump(true);
    } else if (distanceToBottom <= 80) {
      // User is at or returned near the bottom
      autoScrollRef.current = true;
      setShowJump(false);
    }

    lastScrollTopRef.current = currentScrollTop;
  }, []);

  // Continuous auto-follow via ResizeObserver on the messages list:
  // As tokens stream in, thinking blocks expand, or code blocks render,
  // continuously follow the stream down unless the user intentionally scrolled up!
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const content = container.firstElementChild;
    if (!content) return;

    const ro = new ResizeObserver(() => {
      if (autoScrollRef.current && scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        lastScrollTopRef.current = scrollRef.current.scrollTop;
      }
    });
    ro.observe(content);
    return () => ro.disconnect();
  }, [hasMessages]);

  useEffect(() => {
    if (autoScrollRef.current && scrollRef.current) {
      requestAnimationFrame(() => {
        if (autoScrollRef.current && scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
          lastScrollTopRef.current = scrollRef.current.scrollTop;
        }
      });
    }
  }, [messages, streaming, status]);

  const toggleIncognito = useCallback(() => {
    setIsIncognito((prev) => {
      const next = !prev;
      toast(
        next
          ? "Đã bật chế độ ẩn danh: Tin nhắn sẽ không được lưu vào lịch sử."
          : "Đã tắt chế độ ẩn danh.",
        next ? "info" : undefined
      );
      return next;
    });
  }, [toast]);

  // Keyboard shortcut: Ctrl + Shift + I (or Cmd + Shift + I)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "i") {
        e.preventDefault();
        toggleIncognito();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleIncognito]);

  // ── Stable refs so memoized MessageItems never get new callback refs ──
  const messagesRef = useRef<Message[]>(messages);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  const streamingRef = useRef(streaming);
  useEffect(() => { streamingRef.current = streaming; }, [streaming]);
  const modelIdRef = useRef(modelId);
  useEffect(() => { modelIdRef.current = modelId; }, [modelId]);
  const responseLengthRef = useRef(responseLength);
  useEffect(() => { responseLengthRef.current = responseLength; }, [responseLength]);
  const activeConvIdRef = useRef(activeConvId);
  useEffect(() => { activeConvIdRef.current = activeConvId; }, [activeConvId]);

  // The one true stream executor. Stored in a ref so consumers get a stable
  // callable while always running the latest closure.
  const executeStreamImpl = async ({
    text,
    files,
    targetAsstId,
    tools,
    reasoningEffort,
    isRegenerate,
  }: {
    text: string;
    files: PendingFile[];
    targetAsstId: string;
    tools: string[];
    reasoningEffort?: ReasoningEffort;
    isRegenerate?: boolean;
  }) => {
    if (isGeneratingRef.current) return;
    isGeneratingRef.current = true;
    setStreaming(true);
    setStatus("Thinking…");
    const streamStartTime = Date.now();

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    // Token batching state (smooth streaming — declared before try so the
    // finally block can flush/cancel; see "token" handler)
    let flushTimer: number | null = null;
    let acc = "";
    let currentAsstId = targetAsstId;
    const flushNow = () => {
      flushTimer = null;
      // Patches ONLY the streaming message; every other message keeps its
      // object ref so React.memo skips re-rendering them.
      setMessages((s) =>
        s.map((m) =>
          m.id === currentAsstId ? { ...m, content: acc, status: "streaming" as const } : m
        )
      );
      if (autoScrollRef.current && scrollRef.current) {
        requestAnimationFrame(() => {
          if (autoScrollRef.current && scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
            lastScrollTopRef.current = scrollRef.current.scrollTop;
          }
        });
      }
    };

    if (process.env.NODE_ENV !== "production") {
      console.log(`[CHAT] send start: conv=${activeConvIdRef.current} targetAsst=${targetAsstId}`);
    }

    try {
      const r = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: activeConvIdRef.current,
          content: text,
          modelId: modelIdRef.current,
          attachmentIds: files.map((f) => f.id),
          tools,
          projectId: projectId ?? undefined,
          responseLength: responseLengthRef.current,
          reasoningEffort,
          regenerate: Boolean(isRegenerate),
        }),
        signal: ctrl.signal,
      });

      if (!r.ok || !r.body) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error ?? `Lỗi kết nối máy chủ (${r.status})`);
      }

      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buf += decoder.decode(value, { stream: true });
        const events = buf.split("\n\n");
        buf = events.pop() ?? "";

        for (const ev of events) {
          const lines = ev.split("\n");
          let type = "";
          let data = "";
          for (const l of lines) {
            if (l.startsWith("event:")) type = l.slice(6).trim();
            else if (l.startsWith("data:")) data += l.slice(5).trim();
          }
          if (!data) continue;

          try {
            const j = JSON.parse(data);
            if (type === "conversation") {
              if (j.title) setCurrentTitle(j.title);
              if (j.conversationId && (activeConvIdRef.current === "new" || activeConvIdRef.current !== j.conversationId)) {
                currentConvIdRef.current = j.conversationId;
                setActiveConvId(j.conversationId);
                window.history.replaceState(null, "", `/app/c/${j.conversationId}`);
                window.dispatchEvent(
                  new CustomEvent("conversation:created", {
                    detail: { id: j.conversationId, title: j.title || text.slice(0, 40) },
                  })
                );
              }
            } else if (type === "token") {
              acc += j.delta ?? "";
              // If it's a full response from a non-streaming model or a large batch, render immediately
              if (j.delta && j.delta.length > 50) {
                flushNow();
              } else if (!flushTimer) {
                flushTimer = window.setTimeout(flushNow, 40);
              }
            } else if (type === "artifact") {
              // Artifact card: real generated file (docx/pptx/xlsx/pdf/md)
              setMessages((s) => {
                const idx = s.findIndex((m) => m.id === currentAsstId);
                if (idx === -1) return s;
                const target = s[idx];
                return [
                  ...s.slice(0, idx),
                  {
                    ...target,
                    content: `Tôi đã tạo thành công file **${j.fileName}** (${formatSize(j.sizeBytes ?? 0)}) dựa trên dữ liệu cuộc trò chuyện:`,
                    status: "completed" as const,
                    parts: [
                      ...target.parts.filter((p) => p.type !== "text" || (p.text ?? "").trim() !== ""),
                      {
                        id: `art_${Date.now()}`,
                        type: "file" as const,
                        fileName: j.fileName,
                        fileId: j.id,
                        url: j.url,
                        mimeType: j.mimeType,
                      },
                    ],
                  },
                  ...s.slice(idx + 1),
                ];
              });
              acc = `Tôi đã tạo thành công file **${j.fileName}** (${formatSize(j.sizeBytes ?? 0)}) dựa trên dữ liệu cuộc trò chuyện:`;
            } else if (type === "status") {
              setStatus(j.status ?? "");
            } else if (type === "optimization") {
              setLastOpt({
                tokensSaved: j.tokensSaved ?? 0,
                model: j.model ?? "",
                strategy: j.strategy ?? "",
                costUsd: j.estimatedCostUsd,
                cachedInputTokens: undefined,
              });
              if (typeof j.latencyMs === "number" && j.latencyMs > 0) {
                setMessages((s) =>
                  s.map((m) =>
                    m.id === currentAsstId
                      ? { ...m, latencyMs: j.latencyMs }
                      : m
                  )
                );
              }
            } else if (type === "done") {
              const finalId = j.messageId || currentAsstId;
              if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
              setStatus("");
              const finalLatency = typeof j.latencyMs === "number" && j.latencyMs > 0
                ? j.latencyMs
                : (streamStartTime ? Date.now() - streamStartTime : undefined);
              setMessages((s) =>
                s.map((m) =>
                  m.id === currentAsstId
                    ? { ...m, id: finalId, content: acc, latencyMs: finalLatency, status: "completed" as const }
                    : m
                )
              );
              currentAsstId = finalId;
            } else if (type === "cancelled") {
              if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
              setStatus("");
              setMessages((s) =>
                s
                  .filter((m) => !(m.id === currentAsstId && !acc))
                  .map((m) =>
                    m.id === currentAsstId
                      ? { ...m, content: acc, status: "cancelled" as const }
                      : m
                  )
              );
            } else if (type === "error") {
              setStatus("");
              setMessages((s) =>
                s.map((m) =>
                  m.id === currentAsstId
                    ? {
                        ...m,
                        content: acc ? `${acc}\n\n❌ **Lỗi:** ${j.message}` : `❌ **Lỗi:** ${j.message}`,
                        status: "error" as const,
                      }
                    : m
                )
              );
            }
          } catch {
            /* partial json */
          }
        }
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        setMessages((s) =>
          s
            .filter((m) => !(m.id === targetAsstId && !acc))
            .map((m) =>
              m.id === targetAsstId
                ? { ...m, content: acc, status: "cancelled" as const }
                : m
            )
        );
      } else {
        setMessages((s) =>
          s.map((m) =>
            m.id === targetAsstId
              ? {
                  ...m,
                  content: acc
                    ? `${acc}\n\n❌ Lỗi: ${e instanceof Error ? e.message : String(e)}`
                    : `❌ Không gửi được: ${e instanceof Error ? e.message : String(e)}`,
                  status: "error" as const,
                }
              : m
          )
        );
      }
    } finally {
      if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
      setStreaming(false);
      setStatus("");
      isGeneratingRef.current = false;
      abortRef.current = null;
    }
  };

  const executeStreamRef = useRef(executeStreamImpl);
  executeStreamRef.current = executeStreamImpl;

  async function send(
    text: string,
    files: PendingFile[],
    opts: { webSearch: boolean; tools: boolean; reasoningEffort?: ReasoningEffort }
  ) {
    if (isGeneratingRef.current) return;
    const tools = [
      ...(opts.tools ? ["calculator", "file_search"] : []),
      ...(opts.webSearch ? ["web_search"] : []),
    ];

    // Deduplicate files by id and signature to guarantee 100% no duplicate images
    const seenFiles = new Set<string>();
    const uniqueFiles = files.filter((f) => {
      const sig = `${f.fileName}-${f.sizeBytes}`;
      if (seenFiles.has(f.id) || seenFiles.has(sig)) return false;
      seenFiles.add(f.id);
      seenFiles.add(sig);
      return true;
    });

    const asstId = `tmp_asst_${Date.now()}`;

    // Optimistic user message
    const tempUser: Message = {
      id: `tmp_user_${Date.now()}`,
      conversationId: activeConvIdRef.current,
      role: "user",
      content: text || "(đính kèm tệp)",
      status: "completed",
      parts: [
        { id: `t1_${Date.now()}`, type: "text", text },
        ...uniqueFiles.map((f, i) => ({
          id: `tf_${i}_${Date.now()}`,
          type: (f.kind === "image" ? "image" : "file") as "image" | "file",
          url: f.url,
          mimeType: f.mimeType,
          fileName: f.fileName,
          fileId: f.id,
        })),
      ],
      createdAt: new Date().toISOString(),
    };

    // Optimistic assistant placeholder
    const tempAsst: Message = {
      id: asstId,
      conversationId: activeConvIdRef.current,
      role: "assistant",
      content: "",
      status: "streaming",
      modelId: modelId === "auto" ? undefined : modelId,
      parts: [{ id: `ta_${Date.now()}`, type: "text", text: "" }],
      createdAt: new Date().toISOString(),
    };

    setMessages((s) => [...s, tempUser, tempAsst]);

    autoScrollRef.current = true;
    setShowJump(false);
    requestAnimationFrame(() => {
      scrollToBottom(false);
    });

    void executeStreamRef.current({
      text,
      files: uniqueFiles,
      targetAsstId: asstId,
      tools,
      reasoningEffort: opts.reasoningEffort,
    });
  }

  const sendRef = useRef(send);
  sendRef.current = send;

  // Stable regenerate: reads latest messages via ref, no closure staleness,
  // no inline-arrow churn breaking MessageItem memo.
  const stableRegen = useCallback((id: string) => {
    if (isGeneratingRef.current) return;
    const asstIndex = messagesRef.current.findIndex((m) => m.id === id);
    if (asstIndex === -1) return;
    const userMsg = [...messagesRef.current.slice(0, asstIndex)].reverse().find((m) => m.role === "user");
    if (!userMsg) return;

    setMessages((prev) =>
      prev.map((m) =>
        m.id === id
          ? { ...m, content: "", status: "streaming" as const, parts: [{ id: `ta_${Date.now()}`, type: "text" as const, text: "" }] }
          : m
      )
    );
    autoScrollRef.current = true;
    setShowJump(false);
    requestAnimationFrame(() => {
      scrollToBottom(false);
    });
    toast("Đang tạo lại câu trả lời…", "info");
    void executeStreamRef.current({
      text: userMsg.content,
      files: [],
      targetAsstId: id,
      tools: [],
      isRegenerate: true,
    });
  }, [scrollToBottom, toast]);

  // Stable edit-and-resend for memoized MessageItem
  const handleEditMessage = useCallback((editedText: string) => {
    sendRef.current(editedText, [], { webSearch: false, tools: true });
  }, []);

  const stop = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setStreaming(false);
    setStatus("");
    isGeneratingRef.current = false;
    setMessages((prev) =>
      prev
        .filter((m) => !(m.id.startsWith("tmp_asst") && !m.content))
        .map((m) =>
          m.status === "streaming" || m.id.startsWith("tmp_asst")
            ? { ...m, status: "cancelled" as const }
            : m
        )
    );
    toast("Đã dừng tạo câu trả lời", "info");
  }, [toast]);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  function handleDeleteChat() {
    if (!activeConvId || activeConvId === "new") return;
    setShowDeleteConfirm(true);
  }

  function confirmDeleteChat() {
    if (!activeConvId || activeConvId === "new") return;
    const targetId = activeConvId;
    toast("Đã xóa đoạn chat", "info");
    setActiveConvId("new");
    setMessages([]);
    router.replace("/app");
    window.dispatchEvent(new CustomEvent("conversation:updated"));
    fetch(`/api/conversations/${targetId}`, { method: "DELETE" }).catch(() => {});
  }

  const username = user?.name || user?.email?.split("@")[0] || "dunggprovaidai";

  return (
    <div className="flex h-full min-h-0 relative bg-[#1F1E1D] text-[#ECEBE4] font-sans">
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {/* Top Header Bar (Claude Style with Incognito Button) */}
        <header className="h-12 px-5 border-b border-white/[0.06] flex items-center justify-between shrink-0 select-none">
          <div className="flex items-center gap-2">
            {hasMessages && (
              <>
                <span className="font-serif text-sm font-semibold text-[#ECEBE4] truncate max-w-xs sm:max-w-md">
                  {conversationTitle}
                </span>
                <button
                  type="button"
                  aria-label="Xóa đoạn chat này"
                  title="Xóa đoạn chat này"
                  onClick={handleDeleteChat}
                  className="p-1 rounded-md text-[#75736C] hover:text-red-400 hover:bg-white/[0.06] transition-colors cursor-pointer ml-1"
                >
                  <Trash2 size={13} />
                </button>
              </>
            )}
          </div>

          {/* Right Header: Free plan · Upgrade + "Use incognito Ctrl ⇧ I" Pill + Ghost Button */}
          <div className="flex items-center gap-3 text-xs text-[#A6A49B]">
            {/* Response length selector (spec §16): concise/balanced/detailed → output budget */}
            <div className="hidden sm:flex items-center p-0.5 rounded-full bg-[#1F1E1D] border border-white/[0.06]">
              {(["concise", "balanced", "detailed"] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setResponseLength(l)}
                  title={l === "concise" ? "Ngắn gọn (~1.5k tokens)" : l === "balanced" ? "Cân bằng (~4k tokens)" : "Chi tiết (~8k tokens)"}
                  className={cn(
                    "px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors cursor-pointer",
                    responseLength === l ? "bg-[#2E2C29] text-[#ECEBE4]" : "text-[#75736C] hover:text-[#ECEBE4]"
                  )}
                >
                  {l === "concise" ? "Ngắn" : l === "balanced" ? "Vừa" : "Chi tiết"}
                </button>
              ))}
            </div>

            {/* Subtle context optimization indicator (spec §27) — unobtrusive */}
            {lastOpt && (lastOpt.tokensSaved > 0 || lastOpt.strategy) && (
              <span
                title={`Context tối ưu (${lastOpt.strategy || "full"})${lastOpt.tokensSaved > 0 ? ` · tiết kiệm ~${lastOpt.tokensSaved.toLocaleString()} tokens` : ""}`}
                className="hidden md:inline-flex items-center gap-1 text-[11px] text-[#75736C] font-mono"
              >
                <Sparkles size={10} className="text-amber-400/70" />
                {lastOpt.tokensSaved > 0 ? "Context tối ưu" : lastOpt.strategy}
              </span>
            )}

            <div className="hidden md:flex items-center gap-1.5 text-xs">
              <span>Free plan</span>
              <span className="text-[#75736C]">·</span>
              <Link
                href="/app/settings"
                className="text-[#D97757] hover:underline font-medium"
              >
                Upgrade
              </Link>
            </div>

            {/* Use incognito Pill + Ghost Button (exact match to screenshot) */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={toggleIncognito}
                title="Chế độ ẩn danh (Ctrl ⇧ I)"
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all cursor-pointer select-none text-xs font-medium",
                  isIncognito
                    ? "bg-[#D97757]/15 border-[#D97757]/40 text-[#D97757]"
                    : "bg-[#262523] border-white/[0.08] hover:bg-[#302E2B] text-[#ECEBE4]"
                )}
              >
                <span>{isIncognito ? "Incognito on" : "Use incognito"}</span>
                <span className="text-[11px] text-[#75736C] font-mono tracking-tight">
                  Ctrl ⇧ I
                </span>
              </button>

              <button
                type="button"
                onClick={toggleIncognito}
                aria-label="Chế độ ẩn danh"
                title={isIncognito ? "Tắt ẩn danh" : "Bật ẩn danh (Ctrl ⇧ I)"}
                className={cn(
                  "h-8 w-8 rounded-lg border flex items-center justify-center transition-all cursor-pointer",
                  isIncognito
                    ? "bg-[#D97757]/15 border-[#D97757]/40 text-[#D97757]"
                    : "bg-[#262523] border-white/[0.08] text-[#ECEBE4] hover:bg-[#302E2B]"
                )}
              >
                <ClaudeGhostIcon className="h-4 w-4" />
              </button>
            </div>
          </div>
        </header>

        {/* Incognito Notice Banner when active */}
        {isIncognito && (
          <div className="px-4 py-2 bg-[#262523] border-b border-white/[0.06] flex items-center justify-center gap-2 text-xs text-[#A6A49B] animate-in fade-in duration-150">
            <ClaudeGhostIcon className="h-3.5 w-3.5 text-[#D97757]" />
            <span>Chế độ ẩn danh đang bật: Tin nhắn trong phiên này sẽ không được lưu vào lịch sử.</span>
          </div>
        )}

        {/* Workspace Body */}
        {hasMessages ? (
          /* CONVERSATION VIEW (Claude Document Flow) */
          <>
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto thin-scroll"
              onScroll={handleScroll}
            >
              <div className="max-w-4xl mx-auto px-4 sm:px-8 py-8 flex flex-col gap-8">
                {messages.map((m) => (
                  <MessageItem
                    key={m.id}
                    message={m}
                    streaming={streaming && (m.status === "streaming" || (typeof m.id === "string" && m.id.startsWith("tmp_asst")))}
                    onRegenerate={
                      m.role === "assistant"
                        ? stableRegen.bind(null, m.id)
                        : undefined
                    }
                    onEdit={m.role === "user" ? handleEditMessage : undefined}
                    conversationTitle={currentTitle}
                  />
                ))}

                <div ref={bottomRef} className="h-2" />
              </div>
            </div>

            {/* Jump to latest */}
            {showJump && (
              <button
                type="button"
                aria-label="Cuộn xuống"
                onClick={() => scrollToBottom(true)}
                className="absolute bottom-28 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-[#262523] text-[#ECEBE4] hover:bg-[#302E2B] transition-all cursor-pointer shadow-xl border border-white/10 flex items-center gap-1.5 text-xs font-medium animate-in fade-in slide-in-from-bottom-2 duration-150"
              >
                <ArrowDown size={13} />
                <span>Xuống dưới cùng</span>
              </button>
            )}

            {/* Floating Composer at Bottom */}
            <Composer
              variant="bottom"
              onSend={send}
              onStop={stop}
              streaming={streaming}
              models={models}
              modelId={modelId}
              setModelId={setModelId}
            />
          </>
        ) : (
          /* CLAUDE AUTHENTIC EMPTY STATE */
          <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-8 max-w-2xl mx-auto w-full select-none animate-in fade-in duration-200">
            {/* Terracotta Sunburst Asterisk + "[username] returns!" Greeting */}
            <div className="flex items-center gap-3 mb-7">
              <ClaudeAsterisk className="h-9 w-9 text-[#D97757] shrink-0" />
              <h1 className="font-serif text-2xl sm:text-3xl font-normal text-[#ECEBE4] tracking-tight">
                {username} returns!
              </h1>
            </div>

            {/* Central Claude Input Box */}
            <div className="w-full mb-5">
              <Composer
                variant="center"
                onSend={send}
                onStop={stop}
                streaming={streaming}
                models={models}
                modelId={modelId}
                setModelId={setModelId}
              />
            </div>

            {/* If Category is Active: Display the Exact Prompt Choice Card */}
            {activeCategory ? (
              <div className="w-full rounded-2xl bg-[#262523] border border-white/[0.08] shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                {/* Header */}
                <div className="px-4 py-3 flex items-center justify-between border-b border-white/[0.06]">
                  <div className="flex items-center gap-2 text-xs font-medium text-[#A6A49B]">
                    {React.createElement(CATEGORIES[activeCategory].icon, { size: 14 })}
                    <span>{CATEGORIES[activeCategory].label}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveCategory(null)}
                    className="p-1 text-[#75736C] hover:text-[#ECEBE4] transition-colors cursor-pointer"
                    aria-label="Đóng"
                  >
                    <X size={15} />
                  </button>
                </div>

                {/* 5 Prompt Items */}
                <div className="divide-y divide-white/[0.04]">
                  {CATEGORIES[activeCategory].items.map((promptText, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        send(promptText, [], { webSearch: false, tools: true });
                        setActiveCategory(null);
                      }}
                      className="w-full text-left px-4 py-3.5 text-sm text-[#ECEBE4] hover:bg-white/[0.04] transition-colors cursor-pointer"
                    >
                      {promptText}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-[#ECEBE4]">
                {(Object.keys(CATEGORIES) as CategoryKey[]).map((key) => {
                  const cat = CATEGORIES[key];
                  const Icon = cat.icon;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setActiveCategory(key)}
                      className="px-3.5 py-2 rounded-xl bg-[#262523] hover:bg-[#302E2B] border border-white/[0.06] flex items-center gap-2 transition-colors cursor-pointer text-[#ECEBE4]"
                    >
                      <Icon size={14} className="text-[#A6A49B]" />
                      <span>{cat.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Floating Toast notifications */}
      <Toasts />

      <ConfirmModal
        open={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={confirmDeleteChat}
        title="Xóa cuộc trò chuyện này?"
        description="Toàn bộ tin nhắn trong cuộc trò chuyện này sẽ bị xóa vĩnh viễn khỏi tài khoản."
        confirmText="Xóa"
        cancelText="Hủy"
        danger
      />
    </div>
  );
}
