"use client";
import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Menu, Plus } from "lucide-react";
import { Sidebar } from "@/components/sidebar/Sidebar";
import { CommandPalette } from "@/components/palette/CommandPalette";
import type { Conversation } from "@/types";

export function AppShell({
  children,
  initialConversations,
}: {
  children: React.ReactNode;
  initialConversations: Conversation[];
}) {
  const [conversations, setConversations] = useState<Conversation[]>(initialConversations);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const router = useRouter();

  const refresh = useCallback(async () => {
    const r = await fetch("/api/conversations").then((x) => x.json()).catch(() => null);
    if (r?.conversations) setConversations(r.conversations);
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

    const handleRenamed = (e: Event) => {
      const detail = (e as CustomEvent<{ id: string; title: string }>).detail;
      if (!detail?.id || !detail?.title) return;
      setConversations((prev) =>
        prev.map((c) => (c.id === detail.id ? { ...c, title: detail.title } : c))
      );
    };

    window.addEventListener("conversation:created", handleCreated);
    window.addEventListener("conversation:updated", handleUpdate);
    window.addEventListener("conversation:renamed", handleRenamed);
    return () => {
      window.removeEventListener("conversation:created", handleCreated);
      window.removeEventListener("conversation:updated", handleUpdate);
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
