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
  Check,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Composer, type PendingFile } from "./Composer";
import { MessageItem } from "./MessageItem";
import { useToast, ConfirmModal } from "@/components/ui/primitives";
import type { AIModel, Message, ReasoningEffort } from "@/types";
import { useSession } from "@/hooks/useSession";
import { cn } from "@/lib/utils";
import { getDefaultReasoningEffort } from "@/lib/ai/reasoning";

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
  initialModelId?: string | null;
}

export function ChatView({
  conversationId,
  initialMessages,
  models,
  projectId,
  conversationTitle = "Cuộc trò chuyện",
  initialModelId,
}: ChatViewProps) {
  const [messages, setMessages] = useState<Message[]>(() => (Array.isArray(initialMessages) ? initialMessages : []));
  const [activeConvId, setActiveConvId] = useState(conversationId);
  const [currentTitle, setCurrentTitle] = useState(conversationTitle);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitleVal, setEditTitleVal] = useState(conversationTitle);
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (conversationTitle) {
      setCurrentTitle(conversationTitle);
      setEditTitleVal(conversationTitle);
    }
  }, [conversationTitle]);

  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditingTitle]);

  useEffect(() => {
    const handleRenamed = (e: Event) => {
      const detail = (e as CustomEvent<{ id: string; title: string }>).detail;
      if (detail?.id === activeConvId && detail?.title) {
        setCurrentTitle(detail.title);
        setEditTitleVal(detail.title);
      }
    };
    window.addEventListener("conversation:renamed", handleRenamed);
    return () => window.removeEventListener("conversation:renamed", handleRenamed);
  }, [activeConvId]);

  const handleSaveTitle = async () => {
    const trimmed = editTitleVal.trim();
    setIsEditingTitle(false);
    if (!trimmed || trimmed === currentTitle) {
      setEditTitleVal(currentTitle);
      return;
    }
    if (!activeConvId || activeConvId === "new") return;

    setCurrentTitle(trimmed);
    try {
      await fetch(`/api/conversations/${activeConvId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmed }),
      });
      window.dispatchEvent(
        new CustomEvent("conversation:renamed", {
          detail: { id: activeConvId, title: trimmed },
        })
      );
      window.dispatchEvent(new CustomEvent("conversation:updated"));
      toast("Đã đổi tên cuộc trò chuyện", "success");
    } catch {
      toast("Lỗi khi đổi tên cuộc trò chuyện", "error");
    }
  };

  const router = useRouter();
  const [streaming, setStreaming] = useState(() =>
    Array.isArray(initialMessages) && initialMessages.some((m) => m.status === "streaming")
  );
  const [status, setStatus] = useState("");
  const safeModels = useMemo(() => (Array.isArray(models) ? models : []), [models]);

  // Helper to determine the last used model for a conversation
  const resolveConversationModel = useCallback(
    (msgs: Message[], preferred?: string | null): string => {
      // 1. If explicit preferred / conversation.modelId exists in available models
      if (preferred && preferred !== "auto") {
        if (safeModels.some((m) => m.id === preferred)) return preferred;
      }
      // 2. Look up the last message that specifies a modelId
      const lastMsgWithModel = [...msgs].reverse().find((m) => m.modelId);
      if (lastMsgWithModel?.modelId) {
        if (safeModels.some((m) => m.id === lastMsgWithModel.modelId)) {
          return lastMsgWithModel.modelId;
        }
      }
      // 3. Fallback to localStorage last used model (if available and valid)
      if (typeof window !== "undefined") {
        const cached = localStorage.getItem("dclaude_last_model");
        if (cached && safeModels.some((m) => m.id === cached)) {
          return cached;
        }
      }
      // 4. Default to first model
      return safeModels[0]?.id ?? "auto";
    },
    [safeModels]
  );

  const resolveConversationEffort = useCallback(
    (convId: string | null | undefined, targetModelId: string): ReasoningEffort => {
      if (typeof window !== "undefined") {
        if (convId && convId !== "new") {
          const savedConvEffort = localStorage.getItem(`dclaude_conv_effort_${convId}`);
          if (savedConvEffort === "low" || savedConvEffort === "medium" || savedConvEffort === "high") {
            return savedConvEffort;
          }
        }
        const savedModelEffort = localStorage.getItem(`dclaude_model_effort_${targetModelId}`);
        if (savedModelEffort === "low" || savedModelEffort === "medium" || savedModelEffort === "high") {
          return savedModelEffort;
        }
        const savedLastEffort = localStorage.getItem("dclaude_last_effort");
        if (savedLastEffort === "low" || savedLastEffort === "medium" || savedLastEffort === "high") {
          return savedLastEffort;
        }
      }
      return getDefaultReasoningEffort(targetModelId);
    },
    []
  );

  const [modelId, setModelId] = useState<string>(() => {
    return resolveConversationModel(initialMessages, initialModelId);
  });

  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>(() => {
    const initialModel = resolveConversationModel(initialMessages, initialModelId);
    return resolveConversationEffort(conversationId, initialModel);
  });
  const reasoningEffortRef = useRef(reasoningEffort);
  reasoningEffortRef.current = reasoningEffort;

  const handleEffortChange = useCallback(
    (newEffort: ReasoningEffort) => {
      setReasoningEffort(newEffort);
      if (typeof window !== "undefined") {
        if (activeConvId && activeConvId !== "new") {
          localStorage.setItem(`dclaude_conv_effort_${activeConvId}`, newEffort);
        }
        if (modelId) {
          localStorage.setItem(`dclaude_model_effort_${modelId}`, newEffort);
        }
        localStorage.setItem("dclaude_last_effort", newEffort);
      }
    },
    [activeConvId, modelId]
  );

  const handleModelChange = useCallback(
    (newModelId: string) => {
      setModelId(newModelId);
      const targetEffort = resolveConversationEffort(activeConvId, newModelId);
      setReasoningEffort(targetEffort);

      if (typeof window !== "undefined") {
        localStorage.setItem("dclaude_last_model", newModelId);
      }
      // Persist model to the conversation record in database so it is remembered
      if (activeConvId && activeConvId !== "new") {
        fetch(`/api/conversations/${activeConvId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ modelId: newModelId }),
        }).catch(() => {});
      }
    },
    [activeConvId, resolveConversationEffort]
  );

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
  const [isReconnecting, setIsReconnecting] = useState(false);
  const isExplicitStopRef = useRef(false);
  const isRecoveringRef = useRef(false);

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
      const msgs = Array.isArray(initialMessages) ? initialMessages : [];
      setMessages(msgs);
      setActiveConvId(conversationId);

      // Re-sync modelId and reasoningEffort to the exact settings this conversation used!
      const targetModel = resolveConversationModel(msgs, initialModelId);
      setModelId(targetModel);
      const targetEffort = resolveConversationEffort(conversationId, targetModel);
      setReasoningEffort(targetEffort);
    }
  }, [conversationId, initialMessages, initialModelId, resolveConversationModel, resolveConversationEffort]);

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

  // Poll VPS status to recover background generation after a local network drop
  const [isStreamingLive, setIsStreamingLive] = useState(false);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const pollRecovery = useCallback(
    (convId: string, asstId: string) => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }

      setIsReconnecting(true);
      setIsStreamingLive(false);
      setStatus("Mất kết nối mạng tạm thời · VPS vẫn đang sinh câu trả lời ngầm…");

      let attempts = 0;
      const maxAttempts = 300; // 300 * 400ms = 2 minutes of active real-time recovery polling

      pollIntervalRef.current = setInterval(async () => {
        attempts++;
        if (attempts > maxAttempts || !isGeneratingRef.current) {
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
          isRecoveringRef.current = false;
          setIsReconnecting(false);
          setIsStreamingLive(false);
          setStatus("");
          return;
        }

        try {
          const res = await fetch(`/api/chat/status?conversationId=${convId}`);
          if (!res.ok) return; // still offline or server unavailable
          const data = await res.json();

          if (data.status === "streaming") {
            setIsStreamingLive(true);
            setStreaming(true);
            const currentText = data.text || "";

            setMessages((prev) => {
              const targetIdx = prev.findIndex((m) => m.id === asstId);
              if (targetIdx !== -1) {
                // Deduplicate any orphan empty streaming messages
                return prev
                  .filter((m) => m.id === asstId || !(m.role === "assistant" && m.status === "streaming" && !m.content?.trim()))
                  .map((m) =>
                    m.id === asstId
                      ? {
                          ...m,
                          content: currentText,
                          status: "streaming" as const,
                          modelId: data.modelId ?? m.modelId,
                        }
                      : m
                  );
              }
              // If not found in current messages, append exactly one:
              const cleaned = prev.filter((m) => !(m.role === "assistant" && m.status === "streaming" && !m.content?.trim()));
              return [
                ...cleaned,
                {
                  id: asstId,
                  conversationId: convId,
                  role: "assistant",
                  content: currentText,
                  status: "streaming" as const,
                  parts: [{ id: `part_${Date.now()}`, type: "text", text: currentText }],
                  createdAt: new Date().toISOString(),
                  modelId: data.modelId,
                },
              ];
            });

            // Keep scrolling to bottom so user tracks it live
            if (autoScrollRef.current && scrollRef.current) {
              requestAnimationFrame(() => {
                if (autoScrollRef.current && scrollRef.current) {
                  scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
                  lastScrollTopRef.current = scrollRef.current.scrollTop;
                }
              });
            }
          } else if (data.status === "completed" || data.latestMessage?.role === "assistant") {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
            isRecoveringRef.current = false;
            setIsReconnecting(false);
            setIsStreamingLive(false);
            setStreaming(false);
            setStatus("");
            isGeneratingRef.current = false;

            const finalMsg: Message = data.latestMessage ?? {
              id: data.messageId || asstId,
              conversationId: convId,
              role: "assistant",
              content: data.text || "",
              status: "completed",
              parts: [{ id: `part_${Date.now()}`, type: "text", text: data.text || "" }],
              createdAt: new Date().toISOString(),
              modelId: data.modelId,
              latencyMs: data.latencyMs,
            };

            setMessages((prev) => {
              // Deduplicate all orphan streaming messages
              const withoutStreaming = prev.filter((m) => m.id !== asstId && m.id !== finalMsg.id && !(m.role === "assistant" && m.status === "streaming"));
              return [...withoutStreaming, finalMsg];
            });

            toast("Đã kết nối lại · Đã nhận câu trả lời hoàn chỉnh từ VPS!", "success");
          } else if (data.status === "error") {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
            isRecoveringRef.current = false;
            setIsReconnecting(false);
            setIsStreamingLive(false);
            setStreaming(false);
            setStatus("");
            isGeneratingRef.current = false;
            setMessages((prev) => {
              const withoutDuplicates = prev.filter((m) => m.id === asstId || !(m.role === "assistant" && m.status === "streaming" && !m.content?.trim()));
              return withoutDuplicates.map((m) =>
                m.id === asstId || m.status === "streaming"
                  ? {
                      ...m,
                      content: m.content ? `${m.content}\n\n❌ Lỗi: ${data.error || "Không thể hoàn thành"}` : `❌ Lỗi: ${data.error || "Không thể hoàn thành"}`,
                      status: "error" as const,
                    }
                  : m
              );
            });
            toast("Lỗi từ AI", "error");
          } else if (!data.active && (data.status === "idle" || data.status === "cancelled")) {
            // Background generation on VPS is no longer active; stop reconnecting banner cleanly
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
            isRecoveringRef.current = false;
            setIsReconnecting(false);
            setIsStreamingLive(false);
            setStreaming(false);
            setStatus("");
            isGeneratingRef.current = false;
            setMessages((prev) => {
              const withoutDuplicates = prev.filter((m) => m.id === asstId || !(m.role === "assistant" && m.status === "streaming" && !m.content?.trim()));
              return withoutDuplicates.map((m) => {
                if (m.id === asstId || m.status === "streaming") {
                  const hasContent = Boolean(m.content?.trim());
                  return {
                    ...m,
                    content: hasContent
                      ? m.content
                      : "⚠️ Mô hình AI đã dừng phản hồi trước khi xuất kết quả. Vui lòng bấm \"Thử lại\".",
                    status: "completed" as const,
                  };
                }
                return m;
              });
            });
          }
        } catch {
          // Network still down; continue polling next tick
        }
      }, 400);

      const onOnline = () => {
        // Fast reaction when OS reports online
      };
      window.addEventListener("online", onOnline, { once: true });
    },
    [toast]
  );

  const pollRecoveryRef = useRef(pollRecovery);
  pollRecoveryRef.current = pollRecovery;

  const resumeAbortRef = useRef<AbortController | null>(null);

  const attachResumeStream = useCallback(
    async (convId: string, asstId: string) => {
      if (resumeAbortRef.current) {
        resumeAbortRef.current.abort();
        resumeAbortRef.current = null;
      }
      const ctrl = new AbortController();
      resumeAbortRef.current = ctrl;

      setIsReconnecting(true);
      setIsStreamingLive(true);
      setStreaming(true);
      setStatus("");
      isRecoveringRef.current = true;
      isGeneratingRef.current = true;

      let acc = "";
      setMessages((prev) => {
        const target = prev.find((m) => m.id === asstId);
        if (target?.content) acc = target.content;
        return prev;
      });

      let currentAsstId = asstId;

      try {
        const r = await fetch(`/api/chat/resume?conversationId=${convId}`, {
          signal: ctrl.signal,
        });

        if (!r.ok || !r.body) {
          pollRecovery(convId, asstId);
          return;
        }

        const contentType = r.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          const data = await r.json().catch(() => ({}));
          if (data.status === "idle" || !data.active) {
            setIsReconnecting(false);
            setIsStreamingLive(false);
            setStreaming(false);
            isGeneratingRef.current = false;
            isRecoveringRef.current = false;
            return;
          }
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
              if (type === "init") {
                if (typeof j.text === "string" && j.text) {
                  acc = j.text;
                  setMessages((s) =>
                    s.map((m) =>
                      m.id === currentAsstId
                        ? { ...m, content: acc, status: "streaming" as const }
                        : m
                    )
                  );
                }
              } else if (type === "token") {
                acc += j.delta ?? "";
                setMessages((s) =>
                  s.map((m) =>
                    m.id === currentAsstId
                      ? { ...m, content: acc, status: "streaming" as const }
                      : m
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
              } else if (type === "done") {
                const finalId = j.messageId || currentAsstId;
                const finalContent = j.text || acc;
                setMessages((s) => {
                  const withoutDuplicates = s.filter(
                    (m) => m.id === currentAsstId || m.id === finalId || !(m.role === "assistant" && m.status === "streaming")
                  );
                  return withoutDuplicates.map((m) =>
                    m.id === currentAsstId || m.id === finalId
                      ? {
                          ...m,
                          id: finalId,
                          content: finalContent,
                          status: "completed" as const,
                          latencyMs: j.latencyMs ?? m.latencyMs,
                        }
                      : m
                  );
                });
                setIsReconnecting(false);
                setIsStreamingLive(false);
                setStreaming(false);
                isGeneratingRef.current = false;
                isRecoveringRef.current = false;
                toast("Đã nhận câu trả lời hoàn chỉnh từ VPS!", "success");
              } else if (type === "error") {
                setMessages((s) =>
                  s.map((m) =>
                    m.id === currentAsstId
                      ? {
                          ...m,
                          content: acc ? `${acc}\n\n❌ Lỗi: ${j.error || "Không thể hoàn thành"}` : `❌ Lỗi: ${j.error || "Không thể hoàn thành"}`,
                          status: "error" as const,
                        }
                      : m
                  )
                );
                setIsReconnecting(false);
                setIsStreamingLive(false);
                setStreaming(false);
                isGeneratingRef.current = false;
                isRecoveringRef.current = false;
              } else if (type === "cancelled") {
                setMessages((s) =>
                  s.map((m) =>
                    m.id === currentAsstId
                      ? { ...m, content: acc, status: "cancelled" as const }
                      : m
                  )
                );
                setIsReconnecting(false);
                setIsStreamingLive(false);
                setStreaming(false);
                isGeneratingRef.current = false;
                isRecoveringRef.current = false;
              }
            } catch {
              /* ignore parse error */
            }
          }
        }
      } catch (err) {
        if ((err as Error)?.name !== "AbortError") {
          console.warn("[Resume Stream] Connection dropped, falling back to polling...", err);
          pollRecovery(convId, currentAsstId);
        }
      }
    },
    [pollRecovery, toast]
  );

  const attachResumeStreamRef = useRef(attachResumeStream);
  attachResumeStreamRef.current = attachResumeStream;

  // Cleanup polling & resume stream timers on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      if (resumeAbortRef.current) {
        resumeAbortRef.current.abort();
        resumeAbortRef.current = null;
      }
    };
  }, []);

  // When loading a conversation (e.g. reload or navigation), attach to VPS background streaming immediately!
  useEffect(() => {
    if (!activeConvId || activeConvId === "new") return;

    // Check if initial SSR messages already contain a streaming assistant message
    const initialStreaming = messages.find(
      (m) => m.role === "assistant" && (m.status === "streaming" || m.id.startsWith("asst_active_") || m.id.startsWith("asst_bg_"))
    );
    if (initialStreaming) {
      attachResumeStreamRef.current?.(activeConvId, initialStreaming.id);
      return;
    }

    if (isGeneratingRef.current || isRecoveringRef.current) return;

    fetch(`/api/chat/status?conversationId=${activeConvId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.active && data.status === "streaming") {
          isRecoveringRef.current = true;
          isGeneratingRef.current = true;
          setStreaming(true);

          let targetId = data.messageId;
          setMessages((prev) => {
            const existingStreaming = prev.find(
              (m) => m.role === "assistant" && (m.status === "streaming" || m.id.startsWith("asst_bg_") || m.id.startsWith("tmp_asst_") || m.id.startsWith("asst_active_"))
            );
            if (existingStreaming) {
              targetId = existingStreaming.id;
              return prev.map((m) =>
                m.id === targetId ? { ...m, content: data.text || m.content, status: "streaming" as const } : m
              );
            }
            if (!targetId) targetId = `asst_bg_${activeConvId}`;
            if (prev.some((m) => m.id === targetId)) return prev;
            return [
              ...prev,
              {
                id: targetId,
                conversationId: activeConvId,
                role: "assistant",
                content: data.text || "",
                status: "streaming" as const,
                parts: [{ id: `part_${Date.now()}`, type: "text", text: data.text || "" }],
                createdAt: new Date().toISOString(),
                modelId: data.modelId,
              },
            ];
          });

          if (targetId) {
            attachResumeStreamRef.current?.(activeConvId, targetId);
          }
        }
      })
      .catch(() => {});
  }, [activeConvId]);

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
    isExplicitStopRef.current = false;
    isRecoveringRef.current = false;
    setIsReconnecting(false);
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
      const fetchPayload = {
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
      };

      let r: Response;
      try {
        r = await fetch("/api/chat/stream", fetchPayload);
      } catch (initialErr) {
        // Quick retry if micro-drop or server process was reloading
        if (!isExplicitStopRef.current && (initialErr as Error)?.name !== "AbortError") {
          await new Promise((res) => setTimeout(res, 1200));
          if (isExplicitStopRef.current) throw initialErr;
          r = await fetch("/api/chat/stream", fetchPayload);
        } else {
          throw initialErr;
        }
      }

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
      if (isExplicitStopRef.current || ((e as Error).name === "AbortError" && isExplicitStopRef.current)) {
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
        // Client network dropped / disconnected while streaming!
        // VPS is still running 24/7 on the cloud and will complete the AI generation!
        // Do NOT show fatal red network error; initiate background recovery polling!
        console.warn("[ChatView] Client connection dropped, initiating VPS recovery polling...", e);
        const targetConv = activeConvIdRef.current;
        if (targetConv && targetConv !== "new") {
          isRecoveringRef.current = true;
          void attachResumeStream(targetConv, currentAsstId);
          return;
        }

        const rawErr = e instanceof Error ? e.message : String(e);
        const isNetworkErr =
          rawErr.includes("Failed to fetch") ||
          rawErr.includes("Load failed") ||
          rawErr.includes("NetworkError") ||
          rawErr.includes("network");
        const formattedErr = isNetworkErr
          ? "Không thể kết nối đến máy chủ (mạng chập chờn hoặc máy chủ đang tải lại). Vui lòng bấm \"Thử lại\" bên dưới."
          : rawErr;

        setMessages((s) =>
          s.map((m) =>
            m.id === targetAsstId
              ? {
                  ...m,
                  content: acc
                    ? `${acc}\n\n❌ Lỗi: ${formattedErr}`
                    : `❌ Không gửi được: ${formattedErr}`,
                  status: "error" as const,
                }
              : m
          )
        );
      }
    } finally {
      if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
      if (!isRecoveringRef.current) {
        setStreaming(false);
        setStatus("");
        isGeneratingRef.current = false;
        abortRef.current = null;
      }
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
      reasoningEffort: opts.reasoningEffort ?? reasoningEffortRef.current,
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
      reasoningEffort: reasoningEffortRef.current,
      isRegenerate: true,
    });
  }, [scrollToBottom, toast]);

  // Stable edit-and-resend for memoized MessageItem
  const handleEditMessage = useCallback((editedText: string) => {
    sendRef.current(editedText, [], { webSearch: false, tools: true });
  }, []);

  const stop = useCallback(() => {
    isExplicitStopRef.current = true;
    isRecoveringRef.current = false;
    setIsReconnecting(false);

    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }

    // Explicitly notify VPS to stop the background generation
    if (activeConvId && activeConvId !== "new") {
      fetch("/api/chat/abort", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: activeConvId }),
      }).catch(() => {});
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
  }, [activeConvId, toast]);

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
          <div className="flex items-center gap-2 min-w-0">
            {hasMessages && (
              <>
                {isEditingTitle ? (
                  <div className="flex items-center gap-1.5 max-w-xs sm:max-w-md">
                    <input
                      ref={titleInputRef}
                      type="text"
                      value={editTitleVal}
                      onChange={(e) => setEditTitleVal(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void handleSaveTitle();
                        if (e.key === "Escape") {
                          setEditTitleVal(currentTitle);
                          setIsEditingTitle(false);
                        }
                      }}
                      onBlur={() => void handleSaveTitle()}
                      className="bg-[#262523] border border-white/20 rounded px-2 py-0.5 text-xs text-[#ECEBE4] font-medium outline-none focus:border-[#D97757] w-full"
                      maxLength={200}
                    />
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        void handleSaveTitle();
                      }}
                      title="Lưu (Enter)"
                      aria-label="Lưu tên"
                      className="p-1 rounded text-emerald-400 hover:text-emerald-300 hover:bg-white/[0.06] transition-colors cursor-pointer shrink-0"
                    >
                      <Check size={13} />
                    </button>
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setEditTitleVal(currentTitle);
                        setIsEditingTitle(false);
                      }}
                      title="Hủy (Esc)"
                      aria-label="Hủy"
                      className="p-1 rounded text-[#75736C] hover:text-[#ECEBE4] hover:bg-white/[0.06] transition-colors cursor-pointer shrink-0"
                    >
                      <X size={13} />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 group/title min-w-0">
                    <span
                      onClick={() => {
                        setEditTitleVal(currentTitle);
                        setIsEditingTitle(true);
                      }}
                      title="Bấm để đổi tên đoạn chat"
                      className="font-serif text-sm font-semibold text-[#ECEBE4] truncate max-w-xs sm:max-w-md cursor-pointer hover:text-white transition-colors"
                    >
                      {currentTitle}
                    </span>
                    <button
                      type="button"
                      aria-label="Đổi tên đoạn chat"
                      title="Đổi tên đoạn chat"
                      onClick={() => {
                        setEditTitleVal(currentTitle);
                        setIsEditingTitle(true);
                      }}
                      className="p-1 rounded-md text-[#75736C] opacity-0 group-hover/title:opacity-100 hover:text-[#ECEBE4] hover:bg-white/[0.06] transition-all cursor-pointer shrink-0"
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      type="button"
                      aria-label="Xóa đoạn chat này"
                      title="Xóa đoạn chat này"
                      onClick={handleDeleteChat}
                      className="p-1 rounded-md text-[#75736C] hover:text-red-400 hover:bg-white/[0.06] transition-colors cursor-pointer shrink-0 ml-0.5"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                )}
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

            {/* Reconnecting / Live Tracking banner */}
            {isReconnecting && (
              <div className="max-w-2xl mx-auto px-4 w-full mb-2 animate-in fade-in slide-in-from-bottom-2 duration-200">
                {isStreamingLive ? (
                  <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs shadow-lg backdrop-blur-sm">
                    <div className="relative flex h-2.5 w-2.5 shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                    </div>
                    <span className="flex-1 font-medium">
                      Đã kết nối lại · Đang theo dõi trực tiếp tiến trình trả lời từ VPS…
                    </span>
                    <Loader2 size={13} className="animate-spin text-emerald-400 shrink-0" />
                  </div>
                ) : (
                  <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs shadow-lg backdrop-blur-sm">
                    <div className="relative flex h-2.5 w-2.5 shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
                    </div>
                    <span className="flex-1 font-medium">
                      Mất kết nối mạng tạm thời · VPS vẫn đang sinh câu trả lời ngầm và sẽ tự động đồng bộ khi có mạng lại...
                    </span>
                    <Loader2 size={13} className="animate-spin text-amber-400 shrink-0" />
                  </div>
                )}
              </div>
            )}

            {/* Floating Composer at Bottom */}
            <Composer
              variant="bottom"
              onSend={send}
              onStop={stop}
              streaming={streaming}
              models={models}
              modelId={modelId}
              setModelId={handleModelChange}
              reasoningEffort={reasoningEffort}
              setReasoningEffort={handleEffortChange}
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
                setModelId={handleModelChange}
                reasoningEffort={reasoningEffort}
                setReasoningEffort={handleEffortChange}
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
