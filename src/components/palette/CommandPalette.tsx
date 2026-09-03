"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Plus,
  Moon,
  Sun,
  Settings,
  FolderKanban,
  Library,
  MessageSquare,
  ArrowRight,
} from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

interface CommandPaletteProps {
  onNew: () => void;
}

export function CommandPalette({ onNew }: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [results, setResults] = useState<{
    conversations: Array<{ id: string; title: string }>;
    projects: Array<{ id: string; name: string }>;
  }>({ conversations: [], projects: [] });

  const router = useRouter();
  const { theme, setTheme } = useTheme();

  // Listen for Ctrl+K or ⌘K
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((s) => !s);
      }
      if (e.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Debounced search
  useEffect(() => {
    if (!open || !q.trim()) {
      setResults({ conversations: [], projects: [] });
      return;
    }
    const timer = setTimeout(async () => {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`)
        .then((x) => x.json())
        .catch(() => null);
      if (res) {
        setResults({
          conversations: res.conversations ?? [],
          projects: res.projects ?? [],
        });
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [q, open]);

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      setQ("");
      router.push(href);
    },
    [router]
  );

  const quickActions = useMemo(
    () => [
      {
        id: "action-new",
        icon: <Plus size={14} className="text-[var(--accent)]" />,
        label: "Bắt đầu cuộc trò chuyện mới",
        category: "Hành động",
        run: () => {
          setOpen(false);
          onNew();
        },
      },
      {
        id: "action-theme",
        icon: theme === "dark" ? <Sun size={14} className="text-amber-400" /> : <Moon size={14} className="text-indigo-400" />,
        label: `Chuyển sang chế độ ${theme === "dark" ? "Sáng (Light)" : "Tối (Dark)"}`,
        category: "Hành động",
        run: () => {
          setTheme(theme === "dark" ? "light" : "dark");
          setOpen(false);
        },
      },
      {
        id: "action-projects",
        icon: <FolderKanban size={14} className="text-[var(--text-3)]" />,
        label: "Mở danh sách Projects",
        category: "Điều hướng",
        run: () => go("/app/projects"),
      },
      {
        id: "action-library",
        icon: <Library size={14} className="text-[var(--text-3)]" />,
        label: "Mở Thư viện lưu trữ",
        category: "Điều hướng",
        run: () => go("/app/library"),
      },
      {
        id: "action-settings",
        icon: <Settings size={14} className="text-[var(--text-3)]" />,
        label: "Mở Cài đặt hệ thống",
        category: "Điều hướng",
        run: () => go("/app/settings"),
      },
    ],
    [theme, setTheme, onNew, go]
  );

  const allItems = useMemo(
    () => [
      ...quickActions.filter((a) => !q || a.label.toLowerCase().includes(q.toLowerCase())),
      ...results.conversations.map((c) => ({
        id: `conv-${c.id}`,
        icon: <MessageSquare size={14} className="text-[var(--accent)]" />,
        label: c.title,
        category: "Cuộc trò chuyện",
        run: () => go(`/app/c/${c.id}`),
      })),
      ...results.projects.map((p) => ({
        id: `proj-${p.id}`,
        icon: <FolderKanban size={14} className="text-amber-400" />,
        label: p.name,
        category: "Dự án",
        run: () => go(`/app/projects/${p.id}`),
      })),
    ],
    [quickActions, q, results, go]
  );

  // Reset index when search query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [q]);

  // Keyboard navigation for search items
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((idx) => (idx + 1) % (allItems.length || 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((idx) => (idx - 1 + allItems.length) % (allItems.length || 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (allItems[selectedIndex]) {
          allItems[selectedIndex].run();
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, allItems, selectedIndex]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex justify-center pt-[10vh] px-4 select-none"
      role="dialog"
      aria-modal="true"
      aria-label="Command Palette"
    >
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
        onClick={() => setOpen(false)}
      />

      <div className="card-elevated relative w-full max-w-xl shadow-2xl overflow-hidden h-fit z-10 border border-[var(--border)] animate-in fade-in zoom-in-95 duration-150">
        {/* Search Input Bar */}
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-[var(--border-subtle)] bg-[var(--surface)]">
          <Search size={16} className="text-[var(--text-3)] shrink-0" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm kiếm cuộc trò chuyện, dự án hoặc gõ lệnh…"
            className="bg-transparent outline-none w-full text-sm text-[var(--text)] placeholder:text-[var(--text-3)]"
            aria-label="Tìm kiếm hoặc lệnh"
          />
          <kbd className="text-[10px] font-mono text-[var(--text-3)] border border-[var(--border)] rounded px-1.5 py-0.5 bg-[var(--surface-2)]">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div className="max-h-80 overflow-y-auto p-1.5 thin-scroll bg-[var(--surface)] divide-y-0">
          {allItems.length === 0 ? (
            <div className="py-8 text-center text-xs text-[var(--text-3)]">
              Không tìm thấy kết quả nào
            </div>
          ) : (
            allItems.map((item, index) => {
              const isSelected = index === selectedIndex;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={item.run}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={cn(
                    "w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-xs transition-colors cursor-pointer text-left",
                    isSelected
                      ? "bg-[var(--surface-hover)] text-[var(--text)]"
                      : "text-[var(--text-2)] hover:text-[var(--text)]"
                  )}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {item.icon}
                    <span className="truncate font-medium">{item.label}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 text-[10px] text-[var(--text-3)]">
                    <span>{item.category}</span>
                    {isSelected && <ArrowRight size={11} className="text-[var(--accent)]" />}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer shortcuts helper */}
        <div className="px-4 py-2 bg-[var(--surface-2)] border-t border-[var(--border-subtle)] flex items-center justify-between text-[11px] text-[var(--text-3)]">
          <span>Dùng phím ↑ ↓ để di chuyển, Enter để chọn</span>
          <span className="font-mono">⌘K</span>
        </div>
      </div>
    </div>
  );
}
