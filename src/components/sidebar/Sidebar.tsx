"use client";
import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Plus,
  Search,
  FolderKanban,
  Sliders,
  Code2,
  SlidersHorizontal,
  ChevronDown,
  Download,
  PanelLeftClose,
  Pin,
  Trash2,
  X,
  ShieldCheck,
  Pencil,
  Check,
  Palette,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Conversation } from "@/types";
import { useSession } from "@/hooks/useSession";
import { ConfirmModal } from "@/components/ui/primitives";

interface SidebarProps {
  conversations: Conversation[];
  onNew: () => void;
  onChanged: () => void;
  onDelete?: (id: string) => void;
  onRename?: (id: string, newTitle: string) => void;
  open: boolean;
  onClose: () => void;
}

export function Sidebar({
  conversations,
  onNew,
  onChanged,
  onDelete,
  onRename,
  open,
  onClose,
}: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useSession();
  const [query, setQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const editInputRef = React.useRef<HTMLInputElement>(null);

  function startRename(id: string, current: string) {
    setEditingId(id);
    setEditTitle(current);
  }

  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  function handleSaveRename(id: string) {
    const trimmed = editTitle.trim();
    setEditingId(null);
    if (!trimmed) return;
    const current = conversations.find((c) => c.id === id);
    if (current && current.title === trimmed) return;

    if (onRename) {
      onRename(id, trimmed);
    } else {
      fetch(`/api/conversations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmed }),
      }).catch(() => {});
      onChanged();
    }
    window.dispatchEvent(
      new CustomEvent("conversation:renamed", { detail: { id, title: trimmed } })
    );
  }

  function handleCancelRename() {
    setEditingId(null);
    setEditTitle("");
  }

  // Global ⌘N / Ctrl+N shortcut for new chat
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "n" && !e.shiftKey) {
        e.preventDefault();
        onNew();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onNew]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = conversations.filter((c) => !c.archived);
    if (!q) return list;
    return list.filter((c) => c.title.toLowerCase().includes(q));
  }, [conversations, query]);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  function handleDelete(id: string) {
    setConfirmDeleteId(id);
  }

  function handleConfirmDelete() {
    if (!confirmDeleteId) return;
    const id = confirmDeleteId;
    setConfirmDeleteId(null);
    if (pathname.includes(id)) router.push("/app");
    if (onDelete) {
      onDelete(id);
    } else {
      fetch(`/api/conversations/${id}`, { method: "DELETE" }).catch(() => {});
      onChanged();
    }
  }

  async function handlePin(id: string) {
    const conv = conversations.find((c) => c.id === id);
    await fetch(`/api/conversations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinned: !conv?.pinned }),
    });
    onChanged();
  }

  const username = user?.name || user?.email?.split("@")[0] || "dunggprovaidai";
  const userInitial = username.charAt(0).toUpperCase();

  return (
    <>
      {/* Mobile Drawer Backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40 md:hidden transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Claude Sidebar Panel */}
      <aside
        className={cn(
          "fixed md:static z-50 h-full w-[260px] shrink-0 bg-[#181716] text-[#ECEBE4] flex flex-col justify-between transition-transform duration-200 ease-out select-none border-r border-white/[0.06]",
          open ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
        aria-label="DungClaude Navigation"
      >
        {/* TOP SECTION */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* Logo Header */}
          <div className="h-14 px-4 flex items-center justify-between">
            <Link
              href="/app"
              className="font-serif text-xl font-semibold tracking-tight text-[#ECEBE4] hover:opacity-90 transition-opacity"
            >
              DungClaude
            </Link>
            <button
              type="button"
              className="md:hidden p-1 rounded-md text-[#A6A49B] hover:text-[#ECEBE4] cursor-pointer"
              aria-label="Đóng menu"
              onClick={onClose}
            >
              <X size={16} />
            </button>
          </div>

          {/* + New Button */}
          <div className="px-3 pb-3">
            <button
              type="button"
              onClick={() => {
                onNew();
                onClose();
              }}
              className="w-full py-2 px-3 rounded-lg bg-[#262523] hover:bg-[#302E2B] text-[#ECEBE4] text-sm font-medium flex items-center gap-2 transition-colors cursor-pointer border border-white/[0.06] active:scale-98"
            >
              <Plus size={16} className="text-[#ECEBE4]" />
              <span>New</span>
            </button>
          </div>

          {/* Primary Nav Items (Projects, Code, Customize) */}
          <nav className="px-2 space-y-0.5 text-xs text-[#A6A49B]" aria-label="Menu chính">
            <Link
              href="/app/projects"
              prefetch={false}
              onClick={onClose}
              className={cn(
                "flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors hover:bg-white/[0.04] hover:text-[#ECEBE4]",
                pathname.startsWith("/app/projects") && "text-[#ECEBE4] bg-white/[0.05]"
              )}
            >
              <FolderKanban size={15} className="text-[#A6A49B]" />
              <span className="text-sm">Projects</span>
            </Link>

            <Link
              href="/app/images"
              prefetch={false}
              onClick={onClose}
              className={cn(
                "flex items-center justify-between px-3 py-2 rounded-lg transition-colors hover:bg-white/[0.04] hover:text-[#ECEBE4]",
                pathname.startsWith("/app/images") && "text-[#ECEBE4] bg-white/[0.05]"
              )}
            >
              <div className="flex items-center gap-2.5">
                <Palette size={15} className="text-[#D97757]" />
                <span className="text-sm">Tạo ảnh</span>
              </div>
              <span className="text-[10px] font-medium text-[#D97757] bg-[#D97757]/10 border border-[#D97757]/20 px-1.5 py-0.5 rounded">
                Studio
              </span>
            </Link>


            <Link
              href="/app/explore"
              prefetch={false}
              onClick={onClose}
              className={cn(
                "flex items-center justify-between px-3 py-2 rounded-lg transition-colors hover:bg-white/[0.04] hover:text-[#ECEBE4]",
                pathname.startsWith("/app/explore") && "text-[#ECEBE4] bg-white/[0.05]"
              )}
            >
              <div className="flex items-center gap-2.5">
                <Code2 size={15} className="text-[#A6A49B]" />
                <span className="text-sm">Code</span>
              </div>
              <span className="text-[10px] font-medium text-[#A6A49B] bg-white/5 border border-white/10 px-1.5 py-0.5 rounded">
                Upgrade
              </span>
            </Link>

            <Link
              href="/app/settings"
              prefetch={false}
              onClick={onClose}
              className={cn(
                "flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors hover:bg-white/[0.04] hover:text-[#ECEBE4]",
                pathname.startsWith("/app/settings") && "text-[#ECEBE4] bg-white/[0.05]"
              )}
            >
              <Sliders size={15} className="text-[#A6A49B]" />
              <span className="text-sm">Customize</span>
            </Link>

            {user?.role === "admin" && (
              <Link
                href="/admin"
                prefetch={false}
                onClick={onClose}
                className={cn(
                  "flex items-center justify-between px-3 py-2 rounded-lg transition-colors hover:bg-[#D97757]/15 text-[#D97757] border border-[#D97757]/20 my-1",
                  pathname.startsWith("/admin") && "bg-[#D97757]/20 border-[#D97757]/40 text-white"
                )}
              >
                <div className="flex items-center gap-2.5">
                  <ShieldCheck size={15} className="text-[#D97757]" />
                  <span className="text-sm font-medium">Quản trị Admin</span>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#D97757]/25 text-[#D97757]">
                  ADMIN
                </span>
              </Link>
            )}
          </nav>

          {/* Chats and tasks Section Header */}
          <div className="px-4 pt-5 pb-1.5 flex items-center justify-between text-xs text-[#75736C]">
            <span className="font-normal text-[13px]">Chats and tasks</span>
            <button
              type="button"
              onClick={() => setShowSearch((s) => !s)}
              title="Tìm kiếm hội thoại"
              className="p-1 hover:text-[#ECEBE4] transition-colors cursor-pointer"
            >
              <SlidersHorizontal size={13} />
            </button>
          </div>

          {/* Quick Search bar if opened */}
          {showSearch && (
            <div className="px-3 pb-2 animate-in fade-in duration-100">
              <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[#262523] border border-white/[0.08] text-xs text-[#ECEBE4]">
                <Search size={12} className="text-[#75736C]" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Filter chats…"
                  className="bg-transparent outline-none w-full text-xs placeholder:text-[#75736C]"
                  autoFocus
                />
              </div>
            </div>
          )}

          {/* Conversation History List */}
          <div
            className="flex-1 overflow-y-auto thin-scroll px-2 space-y-0.5 text-xs text-[#A6A49B]"
            role="list"
          >
            {filtered.map((c) => {
              const isActive = pathname.includes(c.id);

              if (editingId === c.id) {
                return (
                  <div
                    key={c.id}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-[#262523] border border-white/20 text-xs my-0.5"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                  >
                    <input
                      ref={editInputRef}
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveRename(c.id);
                        if (e.key === "Escape") handleCancelRename();
                      }}
                      onBlur={() => handleSaveRename(c.id)}
                      className="flex-1 bg-transparent text-xs text-[#ECEBE4] outline-none min-w-0 px-1 py-0.5"
                      maxLength={200}
                    />
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleSaveRename(c.id);
                      }}
                      title="Lưu (Enter)"
                      aria-label="Lưu tên"
                      className="p-1 text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer shrink-0"
                    >
                      <Check size={12} />
                    </button>
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleCancelRename();
                      }}
                      title="Hủy (Esc)"
                      aria-label="Hủy"
                      className="p-1 text-[#75736C] hover:text-[#ECEBE4] transition-colors cursor-pointer shrink-0"
                    >
                      <X size={12} />
                    </button>
                  </div>
                );
              }

              return (
                <div
                  key={c.id}
                  className={cn(
                    "group relative rounded-md transition-colors flex items-center justify-between px-2.5 py-1.5",
                    isActive
                      ? "bg-white/[0.06] text-[#ECEBE4] font-medium"
                      : "hover:bg-white/[0.03] hover:text-[#ECEBE4]"
                  )}
                >
                  <Link
                    href={`/app/c/${c.id}`}
                    prefetch={false}
                    onClick={onClose}
                    className="flex items-center gap-2 truncate flex-1 min-w-0"
                  >
                    {c.pinned ? (
                      <Pin size={11} className="text-[#D97757] shrink-0 fill-current" />
                    ) : (
                      <span className="h-1.5 w-1.5 rounded-full bg-white/20 shrink-0 group-hover:bg-[#D97757] transition-colors" />
                    )}
                    <span className="truncate text-xs leading-relaxed text-[#B0AEA5] group-hover:text-[#ECEBE4]">
                      {c.title}
                    </span>
                  </Link>

                  {/* Hover Quick Actions */}
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button
                      type="button"
                      aria-label="Đổi tên"
                      title="Đổi tên"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        startRename(c.id, c.title);
                      }}
                      className="p-1 text-[#75736C] hover:text-[#ECEBE4] cursor-pointer"
                    >
                      <Pencil size={11} />
                    </button>
                    <button
                      type="button"
                      aria-label="Ghim"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handlePin(c.id);
                      }}
                      className="p-1 text-[#75736C] hover:text-[#ECEBE4] cursor-pointer"
                    >
                      <Pin size={11} className={c.pinned ? "fill-current text-[#D97757]" : ""} />
                    </button>
                    <button
                      type="button"
                      aria-label="Xóa"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleDelete(c.id);
                      }}
                      className="p-1 text-[#75736C] hover:text-red-400 cursor-pointer"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>
              );
            })}

            {filtered.length === 0 && (
              <div className="py-4 px-3 text-center text-xs text-[#75736C]">
                {query ? "Không tìm thấy" : "Chưa có đoạn chat"}
              </div>
            )}
          </div>
        </div>

        {/* BOTTOM SECTION */}
        <div className="border-t border-white/[0.06] p-2 space-y-1">


          {/* User Profile Footer Row (matching Claude's exact screenshot) */}
          <div className="flex items-center justify-between px-2.5 py-2 rounded-lg hover:bg-white/[0.04] transition-colors">
            {/* Left: Avatar + Username + Chevron */}
            <div className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer">
              <span className="h-6 w-6 rounded-full bg-[#363430] text-[#ECEBE4] flex items-center justify-center text-xs font-semibold shrink-0">
                {userInitial}
              </span>
              <span className="text-xs font-medium text-[#ECEBE4] truncate">
                {username}
              </span>
              <ChevronDown size={12} className="text-[#75736C] shrink-0" />
            </div>

            {/* Right Quick Icons: Download, Search, Collapse */}
            <div className="flex items-center gap-1.5 text-[#75736C] shrink-0">
              <button
                type="button"
                aria-label="Cài đặt ứng dụng"
                title="Tải ứng dụng Claude"
                className="p-1 hover:text-[#ECEBE4] transition-colors cursor-pointer"
              >
                <Download size={13} />
              </button>

              <button
                type="button"
                aria-label="Tìm kiếm"
                title="Tìm kiếm (⌘K)"
                onClick={() => setShowSearch((s) => !s)}
                className="p-1 hover:text-[#ECEBE4] transition-colors cursor-pointer"
              >
                <Search size={13} />
              </button>

              <button
                type="button"
                aria-label="Thu gọn thanh bên"
                title="Đóng sidebar"
                onClick={onClose}
                className="p-1 hover:text-[#ECEBE4] transition-colors cursor-pointer md:block hidden"
              >
                <PanelLeftClose size={13} />
              </button>
            </div>
          </div>
        </div>
      </aside>

      <ConfirmModal
        open={Boolean(confirmDeleteId)}
        onClose={() => setConfirmDeleteId(null)}
        onConfirm={handleConfirmDelete}
        title="Xóa cuộc trò chuyện?"
        description="Cuộc trò chuyện này cùng toàn bộ tin nhắn sẽ bị xóa vĩnh viễn khỏi tài khoản của bạn."
        confirmText="Xóa"
        cancelText="Hủy"
        danger
      />
    </>
  );
}
