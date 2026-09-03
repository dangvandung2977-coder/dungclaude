"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, FolderKanban, Trash2 } from "lucide-react";
import { Button, Input, Textarea, Modal, ConfirmModal, useToast } from "@/components/ui/primitives";
import type { Project } from "@/types";

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [instructions, setInstructions] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast, Toasts } = useToast();

  async function load() {
    const r = await fetch("/api/projects").then((x) => x.json()).catch(() => null);
    if (r?.projects) setProjects(r.projects);
  }

  useEffect(() => {
    load();
  }, []);

  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  function handleDeleteProject(e: React.MouseEvent, id: string) {
    e.preventDefault();
    e.stopPropagation();
    setDeleteTargetId(id);
  }

  async function confirmDeleteProject() {
    if (!deleteTargetId) return;
    const id = deleteTargetId;
    setDeleteTargetId(null);
    setProjects((prev) => prev.filter((p) => p.id !== id));
    toast("Đã xóa dự án", "info");
    try {
      await fetch(`/api/projects/${id}`, { method: "DELETE" });
    } catch {
      toast("Không thể xóa dự án", "error");
      load();
    }
  }

  async function create() {
    if (!name.trim()) return;
    setLoading(true);
    try {
      const r = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description: desc.trim(), instructions: instructions.trim() }),
      }).then((x) => x.json());
      if (r?.project) {
        setOpen(false);
        setName("");
        setDesc("");
        setInstructions("");
        load();
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="h-full overflow-y-auto thin-scroll bg-[#1F1E1D] text-[#ECEBE4] font-sans">
      <div className="max-w-4xl mx-auto px-5 sm:px-8 py-10">
        {/* Header (Claude Style) */}
        <div className="flex items-start sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="font-serif text-2xl sm:text-3xl font-semibold tracking-tight text-[#ECEBE4]">
              Projects
            </h1>
            <p className="text-xs text-[#A6A49B] mt-1.5 leading-relaxed">
              Tổ chức các cuộc trò chuyện, tài liệu đính kèm và chỉ dẫn tùy chỉnh theo từng dự án.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="px-3.5 py-2 rounded-lg bg-[#262523] hover:bg-[#302E2B] text-[#ECEBE4] border border-white/10 text-xs font-medium flex items-center gap-2 transition-colors cursor-pointer shrink-0 shadow-xs"
          >
            <Plus size={14} className="text-[#D97757]" />
            <span>Create project</span>
          </button>
        </div>

        {/* Projects Grid or Empty State */}
        {projects.length === 0 ? (
          <div className="p-12 text-center rounded-2xl bg-[#262523] border border-white/[0.08] shadow-sm my-4">
            <div className="h-12 w-12 rounded-xl bg-white/5 border border-white/10 text-[#D97757] flex items-center justify-center mx-auto mb-4">
              <FolderKanban size={24} />
            </div>
            <h3 className="font-serif text-lg font-semibold text-[#ECEBE4] mb-1">
              Chưa có Project nào
            </h3>
            <p className="text-xs text-[#A6A49B] max-w-md mx-auto mb-6 leading-relaxed">
              Tạo không gian riêng cho từng dự án để Claude luôn nắm rõ tài liệu tham chiếu và tuân thủ chỉ dẫn chuyên biệt của bạn.
            </p>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="px-4 py-2 rounded-xl bg-[#D97757] hover:bg-[#E2886A] text-white text-xs font-medium transition-colors cursor-pointer inline-flex items-center gap-2 shadow-sm"
            >
              <Plus size={14} />
              <span>Tạo Project đầu tiên</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {projects.map((p) => (
              <Link
                key={p.id}
                href={`/app/projects/${p.id}`}
                className="p-5 rounded-2xl bg-[#262523] hover:bg-[#2A2826] border border-white/[0.08] hover:border-white/20 transition-all cursor-pointer flex flex-col justify-between group shadow-sm"
              >
                <div>
                  <div className="flex items-center justify-between gap-2.5 mb-2.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="h-8 w-8 rounded-lg bg-white/5 border border-white/10 text-[#D97757] flex items-center justify-center shrink-0">
                        <FolderKanban size={16} />
                      </span>
                      <h2 className="font-serif font-semibold text-base text-[#ECEBE4] truncate group-hover:text-[#D97757] transition-colors">
                        {p.name}
                      </h2>
                    </div>
                    <button
                      type="button"
                      aria-label="Xóa dự án"
                      title="Xóa dự án"
                      onClick={(e) => handleDeleteProject(e, p.id)}
                      className="p-1.5 rounded-lg text-[#75736C] hover:text-red-400 hover:bg-white/[0.08] transition-colors cursor-pointer shrink-0 opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  {p.description ? (
                    <p className="text-xs text-[#A6A49B] line-clamp-2 leading-relaxed">
                      {p.description}
                    </p>
                  ) : (
                    <p className="text-xs text-[#75736C] italic">Không có mô tả dự án</p>
                  )}
                </div>

                <div className="pt-4 mt-4 border-t border-white/[0.06] flex items-center justify-between text-[11px] text-[#75736C]">
                  <span>{new Date(p.createdAt).toLocaleDateString("vi-VN")}</span>
                  <span className="text-[#A6A49B] group-hover:text-[#ECEBE4] transition-colors">
                    Xem chi tiết →
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
        <Toasts />
      </div>

      {/* Create Project Modal (Claude Style) */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Tạo Project mới"
        description="Gom nhóm các đoạn chat và hướng dẫn cụ thể cho Claude."
      >
        <div className="space-y-4 pt-2">
          <div>
            <label className="block text-xs font-medium text-[#ECEBE4] mb-1.5">
              Tên Project
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="VD: Xây dựng ứng dụng E-commerce, Khóa học AI..."
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#ECEBE4] mb-1.5">
              Mô tả ngắn
            </label>
            <Input
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Mô tả mục tiêu của project này..."
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#ECEBE4] mb-1.5">
              Chỉ dẫn riêng cho Claude (Project Instructions)
            </label>
            <Textarea
              rows={4}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="VD: Luôn trả lời bằng TypeScript và Tailwind CSS, phong cách súc tích, chuyên nghiệp..."
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/[0.06]">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Hủy
            </Button>
            <Button size="sm" onClick={create} disabled={!name.trim() || loading}>
              {loading ? "Đang tạo…" : "Tạo Project"}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={Boolean(deleteTargetId)}
        onClose={() => setDeleteTargetId(null)}
        onConfirm={confirmDeleteProject}
        title="Xóa dự án này?"
        description="Dự án cùng toàn bộ dữ liệu chỉ dẫn liên quan sẽ bị xóa vĩnh viễn."
        confirmText="Xóa dự án"
        cancelText="Hủy"
        danger
      />
    </div>
  );
}
