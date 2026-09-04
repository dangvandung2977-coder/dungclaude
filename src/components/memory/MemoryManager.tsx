"use client";
import React, { useEffect, useState } from "react";
import {
  Brain,
  Plus,
  Trash2,
  Edit2,
  Search,
  Sliders,
  Sparkles,
  Layers,
  Clock,
} from "lucide-react";
import type { MemoryRecord, MemoryScope, MemoryCategory } from "@/types/memory";
import { Button, Modal, useToast } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

interface MemoryManagerProps {
  projectId?: string | null;
  scope?: MemoryScope;
  title?: string;
  description?: string;
}

export function MemoryManager({
  projectId,
  scope,
  title = "Bộ nhớ AI (Persistent Memory)",
  description = "Quản lý các thông tin, sở thích cá nhân và kiến trúc dự án mà AI đã ghi nhớ qua các cuộc hội thoại.",
}: MemoryManagerProps) {
  const [memories, setMemories] = useState<MemoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "current" | "superseded" | "archived">("current");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  // Create / Edit Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<{
    content: string;
    key: string;
    scope: MemoryScope;
    category: MemoryCategory;
    importance: number;
  }>({
    content: "",
    key: "",
    scope: scope ?? (projectId ? "project" : "global"),
    category: "general",
    importance: 0.8,
  });

  const { toast, Toasts } = useToast();

  async function loadMemories() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (projectId) params.set("projectId", projectId);
      if (scope) params.set("scope", scope);
      if (statusFilter !== "all") params.set("status", statusFilter);

      const res = await fetch(`/api/memories?${params.toString()}`);
      if (res.ok) {
        const j = await res.json();
        setMemories(j.memories ?? []);
      }
    } catch {
      toast("Không thể tải danh sách bộ nhớ", "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMemories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, scope, statusFilter]);

  async function handleSaveMemory() {
    if (!formData.content.trim()) {
      toast("Nội dung bộ nhớ không được để trống", "error");
      return;
    }

    const key = formData.key.trim() || formData.content.slice(0, 25).toLowerCase().replace(/[^a-z0-9]+/g, "_");

    try {
      if (editingId) {
        const res = await fetch(`/api/memories/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: formData.content,
            category: formData.category,
            importance: formData.importance,
            scope: formData.scope,
            projectId: formData.scope === "project" ? projectId : null,
          }),
        });
        if (!res.ok) throw new Error();
        toast("Đã cập nhật bộ nhớ thành công", "success");
      } else {
        const res = await fetch("/api/memories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: formData.content,
            key,
            scope: formData.scope,
            category: formData.category,
            importance: formData.importance,
            projectId: formData.scope === "project" ? projectId : null,
          }),
        });
        if (!res.ok) throw new Error();
        toast("Đã thêm ký ức mới vào bộ nhớ", "success");
      }

      setShowModal(false);
      setEditingId(null);
      setFormData({
        content: "",
        key: "",
        scope: scope ?? (projectId ? "project" : "global"),
        category: "general",
        importance: 0.8,
      });
      loadMemories();
    } catch {
      toast("Có lỗi xảy ra khi lưu", "error");
    }
  }

  async function handleDeleteMemory(id: string) {
    try {
      const res = await fetch(`/api/memories/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast("Đã xóa khỏi bộ nhớ (Quên thành công)", "success");
      setMemories((prev) => prev.filter((m) => m.id !== id));
    } catch {
      toast("Lỗi khi xóa bộ nhớ", "error");
    }
  }

  function startEdit(mem: MemoryRecord) {
    setEditingId(mem.id);
    setFormData({
      content: mem.content,
      key: mem.key,
      scope: mem.scope,
      category: mem.category,
      importance: mem.importance,
    });
    setShowModal(true);
  }

  const filtered = memories.filter((m) => {
    if (categoryFilter !== "all" && m.category !== categoryFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return m.content.toLowerCase().includes(q) || m.key.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Header card */}
      <div className="card p-5 border border-white/[0.08] bg-[#22211F]/60">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-[#D97757]/10 text-[#D97757] shrink-0 mt-0.5 border border-[#D97757]/20">
              <Brain size={18} />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-semibold text-[#ECEBE4] flex items-center gap-2">
                <span>{title}</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  Active RAG
                </span>
              </h2>
              <p className="text-xs text-[#A6A49B] mt-0.5 leading-relaxed">{description}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setEditingId(null);
              setFormData({
                content: "",
                key: "",
                scope: scope ?? (projectId ? "project" : "global"),
                category: "general",
                importance: 0.8,
              });
              setShowModal(true);
            }}
            className="px-3.5 py-1.5 rounded-xl text-xs font-medium bg-[#D97757] hover:bg-[#E2886A] text-white transition-colors cursor-pointer inline-flex items-center gap-1.5 shrink-0 shadow-sm"
          >
            <Plus size={14} />
            <span>Thêm ký ức mới</span>
          </button>
        </div>

        {/* Controls: Search & Category filters */}
        <div className="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t border-white/[0.06]">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#75736C]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm kiếm thông tin đã ghi nhớ..."
              className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-black/20 border border-white/10 text-xs text-[#ECEBE4] placeholder-[#75736C] focus:outline-none focus:border-[#D97757]/50"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "all" | "current" | "superseded" | "archived")}
            className="px-2.5 py-1.5 rounded-lg bg-black/20 border border-white/10 text-xs text-[#ECEBE4] focus:outline-none cursor-pointer"
          >
            <option value="current">Trạng thái: Đang áp dụng</option>
            <option value="superseded">Đã được thay thế (Superseded)</option>
            <option value="archived">Đã lưu trữ / Đã quên</option>
            <option value="all">Tất cả trạng thái</option>
          </select>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg bg-black/20 border border-white/10 text-xs text-[#ECEBE4] focus:outline-none cursor-pointer"
          >
            <option value="all">Tất cả phân loại</option>
            <option value="preference">Sở thích cá nhân</option>
            <option value="architecture">Kiến trúc hệ thống</option>
            <option value="technical">Kỹ thuật / Tech Stack</option>
            <option value="rule">Quy tắc bắt buộc</option>
            <option value="constraint">Ràng buộc kỹ thuật</option>
            <option value="decision">Quyết định quan trọng</option>
            <option value="fact">Sự thật / Fact</option>
          </select>
        </div>
      </div>

      {/* Memory items list */}
      <div className="space-y-2">
        {loading ? (
          <div className="p-8 text-center text-xs text-[#75736C] animate-pulse">Đang tải ký ức...</div>
        ) : filtered.length === 0 ? (
          <div className="card p-8 text-center border border-white/[0.06] bg-[#22211F]/40 rounded-2xl">
            <Sparkles size={24} className="mx-auto text-[#75736C] mb-2" />
            <p className="text-sm font-medium text-[#ECEBE4]">Chưa có thông tin ghi nhớ nào</p>
            <p className="text-xs text-[#75736C] mt-1 max-w-md mx-auto leading-relaxed">
              AI sẽ tự động ghi nhớ các quyết định kỹ thuật, quy tắc code và sở thích của bạn qua các cuộc trò chuyện,
              hoặc bạn có thể bấm &quot;Thêm ký ức mới&quot; ở trên.
            </p>
          </div>
        ) : (
          filtered.map((mem) => {
            const isSuperseded = mem.status === "superseded";
            const isArchived = mem.status === "archived";

            return (
              <div
                key={mem.id}
                className={cn(
                  "card p-4 border transition-all rounded-xl flex flex-col sm:flex-row sm:items-start justify-between gap-3 group",
                  isSuperseded
                    ? "bg-amber-500/[0.02] border-amber-500/20 opacity-70"
                    : isArchived
                    ? "bg-white/[0.01] border-white/[0.05] opacity-50"
                    : "bg-[#22211F]/50 border-white/[0.08] hover:border-white/20"
                )}
              >
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        "px-2 py-0.5 rounded-md text-[10px] font-semibold tracking-wide uppercase",
                        mem.scope === "global"
                          ? "bg-sky-500/15 text-sky-400 border border-sky-500/30"
                          : "bg-purple-500/15 text-purple-400 border border-purple-500/30"
                      )}
                    >
                      {mem.scope === "global" ? "User Profile" : "Project Memory"}
                    </span>

                    <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-white/5 text-[#A6A49B] border border-white/10">
                      {mem.category}
                    </span>

                    {isSuperseded && (
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-amber-500/20 text-amber-300 border border-amber-500/40">
                        Đã có bản cập nhật mới
                      </span>
                    )}

                    <span className="text-[11px] text-[#75736C] font-mono">key: {mem.key}</span>
                  </div>

                  <p className="text-xs sm:text-sm text-[#ECEBE4] leading-relaxed break-words font-sans">
                    {mem.content}
                  </p>

                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-[#75736C] pt-1">
                    <span className="flex items-center gap-1">
                      <Sliders size={11} />
                      Độ ưu tiên: {(mem.importance * 100).toFixed(0)}%
                    </span>
                    <span className="flex items-center gap-1">
                      <Layers size={11} />
                      Đã truy xuất: {mem.accessCount} lần
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock size={11} />
                      {new Date(mem.updatedAt).toLocaleDateString("vi-VN")}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-start opacity-80 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={() => startEdit(mem)}
                    title="Chỉnh sửa"
                    className="p-1.5 rounded-lg border border-white/10 text-[#A6A49B] hover:text-[#ECEBE4] hover:bg-white/5 transition-colors cursor-pointer"
                  >
                    <Edit2 size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteMemory(mem.id)}
                    title="Quên ký ức này"
                    className="p-1.5 rounded-lg border border-white/10 text-[#75736C] hover:text-red-400 hover:bg-white/5 transition-colors cursor-pointer"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Create / Edit Modal */}
      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editingId ? "Chỉnh sửa ký ức" : "Thêm ký ức mới cho AI"}
        description="Thông tin này sẽ được lưu trữ vĩnh viễn và tự động đưa vào ngữ cảnh AI khi có câu hỏi liên quan."
      >
        <div className="space-y-3.5 pt-2">
          <div>
            <label className="block text-xs font-medium text-[#A6A49B] mb-1">
              Phạm vi áp dụng (Scope)
            </label>
            <select
              value={formData.scope}
              onChange={(e) => setFormData((p) => ({ ...p, scope: e.target.value as MemoryScope }))}
              disabled={Boolean(projectId)}
              className="w-full px-3 py-2 rounded-lg bg-black/20 border border-white/10 text-xs text-[#ECEBE4] focus:outline-none"
            >
              <option value="global">Toàn cục (Áp dụng cho mọi Project & Chat)</option>
              <option value="project">Chỉ trong dự án này (Project Isolated)</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-[#A6A49B] mb-1">Phân loại</label>
              <select
                value={formData.category}
                onChange={(e) => setFormData((p) => ({ ...p, category: e.target.value as MemoryCategory }))}
                className="w-full px-3 py-2 rounded-lg bg-black/20 border border-white/10 text-xs text-[#ECEBE4] focus:outline-none"
              >
                <option value="preference">Sở thích cá nhân</option>
                <option value="architecture">Kiến trúc hệ thống</option>
                <option value="technical">Kỹ thuật / Stack</option>
                <option value="rule">Quy tắc bắt buộc</option>
                <option value="constraint">Ràng buộc kỹ thuật</option>
                <option value="decision">Quyết định</option>
                <option value="general">Chung</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#A6A49B] mb-1">Mã định danh (Key)</label>
              <input
                type="text"
                value={formData.key}
                onChange={(e) => setFormData((p) => ({ ...p, key: e.target.value }))}
                placeholder="e.g. arch:database"
                className="w-full px-3 py-2 rounded-lg bg-black/20 border border-white/10 text-xs text-[#ECEBE4] focus:outline-none font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#A6A49B] mb-1">
              Nội dung thông tin cần AI ghi nhớ
            </label>
            <textarea
              rows={4}
              value={formData.content}
              onChange={(e) => setFormData((p) => ({ ...p, content: e.target.value }))}
              placeholder="e.g. Dự án này sử dụng Next.js 15 App Router, Supabase PostgreSQL và không dùng Tailwind..."
              className="w-full px-3 py-2 rounded-lg bg-black/20 border border-white/10 text-xs text-[#ECEBE4] focus:outline-none resize-none leading-relaxed"
            />
          </div>

          <div>
            <div className="flex items-center justify-between text-xs font-medium text-[#A6A49B] mb-1">
              <span>Độ ưu tiên (Importance)</span>
              <span className="text-[#ECEBE4] font-mono">{(formData.importance * 100).toFixed(0)}%</span>
            </div>
            <input
              type="range"
              min={0.1}
              max={1.0}
              step={0.05}
              value={formData.importance}
              onChange={(e) => setFormData((p) => ({ ...p, importance: parseFloat(e.target.value) }))}
              className="w-full accent-[#D97757] cursor-pointer"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/[0.08]">
            <Button variant="ghost" size="sm" onClick={() => setShowModal(false)}>
              Hủy bỏ
            </Button>
            <Button variant="primary" size="sm" onClick={handleSaveMemory}>
              {editingId ? "Lưu thay đổi" : "Lưu vào bộ nhớ"}
            </Button>
          </div>
        </div>
      </Modal>

      <Toasts />
    </div>
  );
}
