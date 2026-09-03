"use client";
import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Pin,
  Share2,
  Download,
  MoreHorizontal,
  FolderKanban,
  FileCode,
  FileText,
  Trash2,
  Copy,
  Archive,
  Pencil,
} from "lucide-react";
import { ModelSelector } from "./ModelSelector";
import { copyText, cn } from "@/lib/utils";
import type { AIModel } from "@/types";

interface ChatHeaderProps {
  conversationId: string;
  title?: string;
  projectId?: string | null;
  models: AIModel[];
  modelId: string;
  onModelChange: (m: string) => void;
  pinned?: boolean;
  onPinToggle?: () => void;
  onTitleUpdate?: (newTitle: string) => void;
  onDelete?: () => void;
  onToast: (msg: string, type?: "success" | "error" | "info") => void;
}

export function ChatHeader({
  conversationId,
  title = "Cuộc trò chuyện",
  projectId,
  models,
  modelId,
  onModelChange,
  pinned = false,
  onPinToggle,
  onTitleUpdate,
  onDelete,
  onToast,
}: ChatHeaderProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(title);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setEditTitle(title);
  }, [title]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setShowExportMenu(false);
      }
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setShowMoreMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function saveTitle() {
    if (!editTitle.trim() || editTitle === title) {
      setEditing(false);
      return;
    }
    try {
      await fetch(`/api/conversations/${conversationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: editTitle.trim() }),
      });
      onTitleUpdate?.(editTitle.trim());
      setEditing(false);
      onToast("Đã đổi tên cuộc trò chuyện", "success");
    } catch {
      onToast("Không thể đổi tên", "error");
    }
  }

  async function shareChat() {
    const url = window.location.href;
    const ok = await copyText(url);
    if (ok) {
      onToast("Đã sao chép liên kết cuộc trò chuyện", "success");
    } else {
      onToast("Không thể sao chép liên kết", "error");
    }
  }

  function downloadExport(format: "md" | "json") {
    setShowExportMenu(false);
    window.open(`/api/conversations/${conversationId}/export?format=${format}`, "_blank");
    onToast(`Đang tải xuất file ${format.toUpperCase()}…`, "info");
  }

  async function duplicateChat() {
    setShowMoreMenu(false);
    try {
      const src = await fetch(`/api/conversations/${conversationId}`).then((r) => r.json());
      const created = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: (src.conversation?.title ?? title) + " (bản sao)", projectId }),
      }).then((r) => r.json());
      if (created?.conversation) {
        onToast("Đã nhân bản cuộc trò chuyện", "success");
        router.push(`/app/c/${created.conversation.id}`);
      }
    } catch {
      onToast("Lỗi khi nhân bản cuộc trò chuyện", "error");
    }
  }

  async function archiveChat() {
    setShowMoreMenu(false);
    try {
      await fetch(`/api/conversations/${conversationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: true }),
      });
      onToast("Đã lưu trữ cuộc trò chuyện", "info");
      router.push("/app");
    } catch {
      onToast("Không thể lưu trữ", "error");
    }
  }

  return (
    <header className="h-13 shrink-0 surface border-b bordered px-3 sm:px-4 flex items-center justify-between gap-3 select-none">
      {/* Left: Model Selector & Project Badge */}
      <div className="flex items-center gap-2 min-w-0">
        <ModelSelector models={models} modelId={modelId} onSelect={onModelChange} />
        {projectId && (
          <Link
            href={`/app/projects/${projectId}`}
            className="hidden sm:inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium bg-[var(--surface-2)] text-[var(--accent)] hover:bg-[var(--surface-hover)] border border-[var(--border)] transition-colors truncate max-w-[140px]"
            title="Xem project"
          >
            <FolderKanban size={11} className="shrink-0" />
            <span className="truncate">Project</span>
          </Link>
        )}
      </div>

      {/* Center: Conversation Title */}
      <div className="flex-1 min-w-0 max-w-md hidden md:flex items-center justify-center">
        {editing ? (
          <div className="flex items-center gap-1 w-full max-w-xs">
            <input
              autoFocus
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveTitle();
                if (e.key === "Escape") {
                  setEditTitle(title);
                  setEditing(false);
                }
              }}
              onBlur={saveTitle}
              className="input w-full text-xs px-2.5 py-1 text-center font-medium"
              placeholder="Tiêu đề cuộc trò chuyện…"
            />
          </div>
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="group flex items-center gap-1.5 px-2.5 py-1 rounded-md hover:bg-[var(--surface-hover)] transition-colors cursor-pointer text-xs font-medium text-[var(--text-2)] hover:text-[var(--text)] truncate max-w-full"
            title="Bấm để đổi tên"
          >
            <span className="truncate">{title}</span>
            <Pencil size={11} className="opacity-0 group-hover:opacity-60 shrink-0 transition-opacity" />
          </button>
        )}
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-1">
        {/* Pin toggle */}
        {onPinToggle && (
          <button
            onClick={onPinToggle}
            aria-label={pinned ? "Bỏ ghim" : "Ghim cuộc trò chuyện"}
            title={pinned ? "Bỏ ghim" : "Ghim cuộc trò chuyện"}
            className={cn(
              "p-1.5 rounded-lg text-xs transition-colors cursor-pointer",
              pinned
                ? "text-[var(--accent)] bg-[var(--accent-soft)]"
                : "text-[var(--text-3)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)]"
            )}
          >
            <Pin size={15} />
          </button>
        )}

        {/* Share */}
        <button
          onClick={shareChat}
          aria-label="Chia sẻ cuộc trò chuyện"
          title="Sao chép liên kết"
          className="p-1.5 rounded-lg text-xs text-[var(--text-3)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
        >
          <Share2 size={15} />
        </button>

        {/* Export dropdown */}
        <div className="relative" ref={exportRef}>
          <button
            onClick={() => setShowExportMenu((s) => !s)}
            aria-label="Xuất cuộc trò chuyện"
            title="Xuất file"
            className={cn(
              "p-1.5 rounded-lg text-xs text-[var(--text-3)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer",
              showExportMenu && "bg-[var(--surface-hover)] text-[var(--text)]"
            )}
          >
            <Download size={15} />
          </button>

          {showExportMenu && (
            <div className="absolute right-0 top-full mt-1.5 z-50 card-elevated w-48 p-1 shadow-xl border border-[var(--border)] animate-in fade-in zoom-in-95 duration-100">
              <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-3)]">
                Xuất cuộc trò chuyện
              </div>
              <button
                type="button"
                onClick={() => downloadExport("md")}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-[var(--text)] hover:bg-[var(--surface-hover)] rounded-md cursor-pointer transition-colors"
              >
                <FileText size={14} className="text-[var(--text-2)]" />
                <span>Tải Markdown (.md)</span>
              </button>
              <button
                type="button"
                onClick={() => downloadExport("json")}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-[var(--text)] hover:bg-[var(--surface-hover)] rounded-md cursor-pointer transition-colors"
              >
                <FileCode size={14} className="text-[var(--text-2)]" />
                <span>Tải JSON (.json)</span>
              </button>
            </div>
          )}
        </div>

        {/* More options menu */}
        <div className="relative" ref={moreRef}>
          <button
            onClick={() => setShowMoreMenu((s) => !s)}
            aria-label="Tùy chọn khác"
            title="Thao tác"
            className={cn(
              "p-1.5 rounded-lg text-xs text-[var(--text-3)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer",
              showMoreMenu && "bg-[var(--surface-hover)] text-[var(--text)]"
            )}
          >
            <MoreHorizontal size={15} />
          </button>

          {showMoreMenu && (
            <div className="absolute right-0 top-full mt-1.5 z-50 card-elevated w-44 p-1 shadow-xl border border-[var(--border)] animate-in fade-in zoom-in-95 duration-100">
              <button
                type="button"
                onClick={() => {
                  setShowMoreMenu(false);
                  setEditing(true);
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-[var(--text)] hover:bg-[var(--surface-hover)] rounded-md cursor-pointer transition-colors md:hidden"
              >
                <Pencil size={13} className="text-[var(--text-2)]" />
                <span>Đổi tên</span>
              </button>
              <button
                type="button"
                onClick={duplicateChat}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-[var(--text)] hover:bg-[var(--surface-hover)] rounded-md cursor-pointer transition-colors"
              >
                <Copy size={13} className="text-[var(--text-2)]" />
                <span>Nhân bản</span>
              </button>
              <button
                type="button"
                onClick={archiveChat}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-[var(--text)] hover:bg-[var(--surface-hover)] rounded-md cursor-pointer transition-colors"
              >
                <Archive size={13} className="text-[var(--text-2)]" />
                <span>Lưu trữ</span>
              </button>
              {onDelete && (
                <>
                  <div className="my-1 border-t border-[var(--border-subtle)]" />
                  <button
                    type="button"
                    onClick={() => {
                      setShowMoreMenu(false);
                      onDelete();
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-red-400 hover:bg-red-500/10 rounded-md cursor-pointer transition-colors"
                  >
                    <Trash2 size={13} />
                    <span>Xóa chat</span>
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
