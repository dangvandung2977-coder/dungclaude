"use client";
import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Menu, Plus, LogOut } from "lucide-react";
import { Sidebar } from "@/components/sidebar/Sidebar";
import { CommandPalette } from "@/components/palette/CommandPalette";
import { useSession } from "@/hooks/useSession";
import type { Conversation } from "@/types";

export function AppShell({
  children,
  initialConversations,
}: {
  children: React.ReactNode;
  initialConversations: Conversation[];
}) {
  const { user } = useSession();
  const [conversations, setConversations] = useState<Conversation[]>(initialConversations);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [exitingObservation, setExitingObservation] = useState(false);
  const router = useRouter();

  const handleExitObservation = async () => {
    setExitingObservation(true);
    try {
      const res = await fetch("/api/admin/impersonate/exit", { method: "POST" });
      if (res.ok) {
        window.location.href = "/admin/users";
        return;
      }
    } catch {}
    setExitingObservation(false);
  };

  const refresh = useCallback(async () => {
    const r = await fetch("/api/conversations").then((x) => x.json()).catch(() => null);
    if (r?.conversations && Array.isArray(r.conversations)) {
      setConversations((prev) => {
        if (
          prev.length === r.conversations.length &&
          prev.every(
            (c, i) =>
              c.id === r.conversations[i].id &&
              c.title === r.conversations[i].title &&
              c.updatedAt === r.conversations[i].updatedAt
          )
        ) {
          return prev;
        }
        return r.conversations;
      });
    }
  }, []);

  const handleDeleteConversation = useCallback((id: string) => {
    // Instant optimistic update: conversation vanishes in 0ms!
    setConversations((prev) => prev.filter((c) => c.id !== id));
    fetch(`/api/conversations/${id}`, { method: "DELETE" }).catch(() => {
      refresh();
    });
  }, [refresh]);

  const handleRenameConversation = useCallback((id: string, newTitle: string) => {
    // Instant optimistic update: update conversation title in 0ms!
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, title: newTitle } : c))
    );
    fetch(`/api/conversations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newTitle }),
    }).catch(() => {
      refresh();
    });
  }, [refresh]);

  useEffect(() => {
    setConversations(initialConversations);
  }, [initialConversations]);

  // Khi bấm + New Chat, chỉ chuyển về /app mà KHÔNG tạo conversation rác trong DB
  const newChat = useCallback(() => {
    router.push("/app");
  }, [router]);

  // Lắng nghe sự kiện: hội thoại mới tạo được chèn ngay vào state (0ms, 0 network fetch)
  useEffect(() => {
    const handleCreated = (e: Event) => {
      const detail = (e as CustomEvent<{ id: string; title: string }>).detail;
      if (!detail?.id) return;
      setConversations((prev) => {
        if (prev.some((c) => c.id === detail.id)) return prev;
        const newConv: Conversation = {
          id: detail.id,
          userId: "",
          projectId: null,
          title: detail.title || "Cuộc trò chuyện mới",
          modelId: "demo:lumen-echo",
          pinned: false,
          archived: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          messageCount: 1,
          lastPreview: "",
        };
        return [newConv, ...prev];
      });
    };

    const handleUpdate = () => refresh();

    // Kéo conv vừa chat lên đầu danh sách (mới nhất đứng trước, giảm dần theo thời gian)
    const handleBump = (e: Event) => {
      const detail = (e as CustomEvent<{ id?: string }>).detail;
      const id = detail?.id;
      if (!id) { refresh(); return; }
      setConversations((prev) => {
        const i = prev.findIndex((c) => c.id === id);
        if (i <= 0) return prev;
        const conv = { ...prev[i], updatedAt: new Date().toISOString() };
        const rest = [...prev.slice(0, i), ...prev.slice(i + 1)];
        // Giữ conv đang pin luôn ở trên (server sort pinned desc trước updated_at desc)
        const firstUnpinned = rest.findIndex((c) => !c.pinned);
        if (conv.pinned) return [conv, ...rest];
        if (firstUnpinned === -1) return [...rest, conv];
        return [...rest.slice(0, firstUnpinned), conv, ...rest.slice(firstUnpinned)];
      });
    };

    const handleRenamed = (e: Event) => {
      const detail = (e as CustomEvent<{ id: string; title: string }>).detail;
      if (!detail?.id || !detail?.title) return;
      setConversations((prev) =>
        prev.map((c) => (c.id === detail.id ? { ...c, title: detail.title } : c))
      );
    };

    window.addEventListener("conversation:created", handleCreated);
    window.addEventListener("conversation:updated", handleUpdate);
    window.addEventListener("conversation:bump", handleBump);
    window.addEventListener("conversation:renamed", handleRenamed);

    // Background poll: sync sidebar across devices/tabs every 4s when visible
    const syncInterval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        refresh();
      }
    }, 4000);

    return () => {
      clearInterval(syncInterval);
      window.removeEventListener("conversation:created", handleCreated);
      window.removeEventListener("conversation:updated", handleUpdate);
      window.removeEventListener("conversation:bump", handleBump);
      window.removeEventListener("conversation:renamed", handleRenamed);
    };
  }, [refresh]);

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-[var(--bg)] text-[var(--text)]">
      {/* Workspace Sidebar */}
      <Sidebar
        conversations={conversations}
        onNew={newChat}
        onChanged={refresh}
        onDelete={handleDeleteConversation}
        onRename={handleRenameConversation}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main Workspace Frame */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 relative">
        {/* Observation Mode Top Banner */}
        {user?.impersonator && (
          <div className="bg-[#D97757]/15 border-b border-[#D97757]/30 px-3 py-1.5 flex items-center justify-between text-xs text-[#ECEBE4] z-30 shrink-0 backdrop-blur-xs select-none">
            <div className="flex items-center gap-2 min-w-0">
              <span className="flex h-2 w-2 rounded-full bg-[#D97757] animate-pulse shrink-0" />
              <span className="font-medium truncate">
                👁️ Đang quan sát tài khoản: <strong className="text-white">{user.name || user.email}</strong> ({user.email})
              </span>
              <span className="text-[10px] text-[#A6A49B] hidden sm:inline font-mono">
                · Admin: {user.impersonator.email}
              </span>
            </div>
            <button
              type="button"
              onClick={handleExitObservation}
              disabled={exitingObservation}
              className="px-2.5 py-1 rounded-md bg-[#D97757] hover:bg-[#E2886A] text-white text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer shrink-0 ml-2"
              title="Thoát khỏi chế độ quan sát và quay lại tài khoản Admin"
            >
              <LogOut size={12} />
              <span>{exitingObservation ? "Đang thoát…" : "Thoát quan sát"}</span>
            </button>
          </div>
        )}

        {/* Mobile Header */}
        <header className="md:hidden flex items-center justify-between px-3 h-12 border-b bordered surface select-none shrink-0 z-20">
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Mở thanh điều hướng"
              className="p-1.5 rounded-lg text-[var(--text-2)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={18} />
            </button>
            <span className="flex items-center gap-1.5 font-serif font-semibold text-base text-[#ECEBE4]">
              <span className="text-[#D97757] font-bold text-lg">✳</span>
              <span>Claude</span>
            </span>
          </div>

          <button
            type="button"
            aria-label="Tạo cuộc trò chuyện mới"
            onClick={newChat}
            className="p-1.5 rounded-lg text-[var(--text-2)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
          >
            <Plus size={18} />
          </button>
        </header>

        {/* Content View */}
        <main className="flex-1 min-h-0 min-w-0 relative">
          {children}
        </main>
      </div>

      {/* Global Command Palette (⌘K) */}
      <CommandPalette onNew={newChat} />
    </div>
  );
}
