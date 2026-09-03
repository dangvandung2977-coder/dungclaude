"use client";
import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Save,
  Trash2,
  Upload,
  MessageSquarePlus,
  MessageSquare,
  FileText,
  Sliders,
  Film,
  ChevronRight,
  FolderKanban,
} from "lucide-react";
import { formatBytes, cn } from "@/lib/utils";
import { useToast, ConfirmModal } from "@/components/ui/primitives";

type ProjectTab = "chats" | "knowledge" | "instructions";

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [project, setProject] = useState<{
    name: string;
    description: string | null;
    instructions: string | null;
  } | null>(null);
  const [convs, setConvs] = useState<Array<{ id: string; title: string; updatedAt: string }>>([]);
  const [files, setFiles] = useState<
    Array<{ id: string; file_name: string; mime_type: string; size_bytes: number }>
  >([]);
  const [activeTab, setActiveTab] = useState<ProjectTab>("chats");
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const { toast, Toasts } = useToast();

  async function load() {
    const r = await fetch(`/api/projects/${id}`).then((x) => x.json()).catch(() => null);
    if (!r?.project) return;
    setProject(r.project);
    setConvs(r.conversations ?? []);
    setFiles(r.files ?? []);
  }

  useEffect(() => {
    load();
  }, [id]);

  async function save() {
    if (!project) return;
    await fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(project),
    });
    setSaved(true);
    toast("Đã lưu thông tin Project", "success");
    setTimeout(() => setSaved(false), 1500);
  }

  async function handleUpload(list: FileList | null) {
    if (!list?.length) return;
    setUploading(true);
    try {
      const fd = new FormData();
      Array.from(list).forEach((f) => fd.append("files", f));
      fd.append("projectId", id as string);
      const res = await fetch("/api/files/upload", { method: "POST", body: fd });
      if (!res.ok) throw new Error("Upload lỗi");
      toast("Đã tải tài liệu vào Project", "success");
      load();
    } catch {
      toast("Không thể tải tệp lên", "error");
    } finally {
      setUploading(false);
    }
  }

  async function newChatInProject() {
    try {
      const r = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: id, title: `${project?.name} — Chat` }),
      }).then((x) => x.json());
      if (r?.conversation) {
        router.push(`/app/c/${r.conversation.id}`);
      }
    } catch {
      toast("Lỗi tạo chat mới", "error");
    }
  }

  const [showDeleteModal, setShowDeleteModal] = useState(false);

  function confirmDelete() {
    toast("Đã xóa Project", "info");
    router.replace("/app/projects");
    fetch(`/api/projects/${id}`, { method: "DELETE" }).catch(() => {});
  }

  if (!project) {
    return (
      <div className="h-full flex items-center justify-center bg-[#1F1E1D] text-[#ECEBE4]">
        <div className="h-6 w-6 border-2 border-[#D97757] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto thin-scroll bg-[#1F1E1D] text-[#ECEBE4] font-sans">
      <div className="max-w-4xl mx-auto px-5 sm:px-8 py-10">
        {/* Back Link */}
        <Link
          href="/app/projects"
          className="inline-flex items-center gap-1.5 text-xs text-[#A6A49B] hover:text-[#ECEBE4] mb-6 transition-colors"
        >
          <ArrowLeft size={13} />
          <span>Projects</span>
        </Link>

        {/* Project Header (Claude Style) */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-white/[0.06]">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl bg-white/5 border border-white/10 text-[#D97757] flex items-center justify-center shrink-0 mt-0.5">
              <FolderKanban size={20} />
            </div>
            <div>
              <h1 className="font-serif text-2xl sm:text-3xl font-semibold tracking-tight text-[#ECEBE4]">
                {project.name}
              </h1>
              <p className="text-xs text-[#A6A49B] mt-1 leading-relaxed">
                {project.description || "Project workspace with dedicated instructions and knowledge."}
              </p>
            </div>
          </div>

          {/* Header Action Buttons */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={newChatInProject}
              className="px-4 py-2 rounded-xl bg-[#D97757] hover:bg-[#E2886A] text-white text-xs font-medium transition-colors cursor-pointer inline-flex items-center gap-1.5 shadow-sm active:scale-98"
            >
              <MessageSquarePlus size={14} />
              <span>New chat</span>
            </button>
            <button
              type="button"
              onClick={() => setShowDeleteModal(true)}
              title="Xóa project"
              className="p-2 rounded-xl border border-white/10 text-[#75736C] hover:text-red-400 hover:bg-white/5 transition-colors cursor-pointer"
            >
              <Trash2 size={15} />
            </button>
          </div>
        </div>

        {/* Segmented Claude Tabs */}
        <div className="flex items-center gap-1 border-b border-white/[0.06] mt-6 mb-6">
          <button
            type="button"
            onClick={() => setActiveTab("chats")}
            className={cn(
              "px-4 py-2 text-xs font-medium border-b-2 -mb-px transition-colors cursor-pointer flex items-center gap-2",
              activeTab === "chats"
                ? "border-[#D97757] text-[#ECEBE4]"
                : "border-transparent text-[#75736C] hover:text-[#ECEBE4]"
            )}
          >
            <MessageSquare size={13} />
            <span>Chats ({convs.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("knowledge")}
            className={cn(
              "px-4 py-2 text-xs font-medium border-b-2 -mb-px transition-colors cursor-pointer flex items-center gap-2",
              activeTab === "knowledge"
                ? "border-[#D97757] text-[#ECEBE4]"
                : "border-transparent text-[#75736C] hover:text-[#ECEBE4]"
            )}
          >
            <FileText size={13} />
            <span>Project knowledge ({files.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("instructions")}
            className={cn(
              "px-4 py-2 text-xs font-medium border-b-2 -mb-px transition-colors cursor-pointer flex items-center gap-2",
              activeTab === "instructions"
                ? "border-[#D97757] text-[#ECEBE4]"
                : "border-transparent text-[#75736C] hover:text-[#ECEBE4]"
            )}
          >
            <Sliders size={13} />
            <span>Custom instructions</span>
          </button>
        </div>

        {/* TAB 1: CHATS */}
        {activeTab === "chats" && (
          <div>
            {convs.length === 0 ? (
              <div className="p-8 text-center rounded-2xl bg-[#262523] border border-white/[0.08]">
                <p className="font-serif text-base font-semibold text-[#ECEBE4] mb-1">
                  Chưa có cuộc trò chuyện nào trong Project
                </p>
                <p className="text-xs text-[#A6A49B] mb-4">
                  Bắt đầu cuộc trò chuyện mới để Claude tự động áp dụng tài liệu và chỉ dẫn của dự án này.
                </p>
                <button
                  type="button"
                  onClick={newChatInProject}
                  className="px-4 py-2 rounded-xl bg-[#262523] hover:bg-[#302E2B] text-[#ECEBE4] border border-white/10 text-xs font-medium inline-flex items-center gap-2 cursor-pointer shadow-xs"
                >
                  <MessageSquarePlus size={14} className="text-[#D97757]" />
                  <span>Bắt đầu Chat trong Project</span>
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {convs.map((c) => (
                  <Link
                    key={c.id}
                    href={`/app/c/${c.id}`}
                    className="p-4 rounded-xl bg-[#262523] hover:bg-[#2A2826] border border-white/[0.06] hover:border-white/15 transition-all flex items-center justify-between group cursor-pointer"
                  >
                    <div className="flex items-center gap-3 truncate">
                      <span className="h-2 w-2 rounded-full bg-[#D97757]" />
                      <span className="text-xs font-medium text-[#ECEBE4] truncate group-hover:text-white">
                        {c.title}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-[#75736C] shrink-0">
                      <span>{new Date(c.updatedAt).toLocaleDateString("vi-VN")}</span>
                      <ChevronRight size={13} className="group-hover:text-[#ECEBE4] transition-colors" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: PROJECT KNOWLEDGE (FILES) */}
        {activeTab === "knowledge" && (
          <div className="space-y-6">
            {/* Upload Dropzone */}
            <label className="p-8 rounded-2xl border-2 border-dashed border-white/10 hover:border-[#D97757]/60 bg-[#262523]/50 hover:bg-[#262523] transition-all flex flex-col items-center justify-center cursor-pointer text-center">
              <Upload size={22} className="text-[#D97757] mb-2" />
              <p className="text-xs font-medium text-[#ECEBE4]">
                {uploading ? "Đang tải tệp lên…" : "Kéo thả tài liệu vào đây, hoặc nhấp để chọn tệp"}
              </p>
              <p className="text-[11px] text-[#75736C] mt-1">
                Hỗ trợ PDF, DOCX, TXT, MD, JSON, TS, Python (Tối đa 10 tệp)
              </p>
              <input
                type="file"
                multiple
                className="hidden"
                accept=".pdf,.docx,.txt,.md,.json,.ts,.tsx,.js,.py,.csv"
                onChange={(e) => handleUpload(e.target.files)}
                disabled={uploading}
              />
            </label>

            {/* List of uploaded files */}
            {files.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-[#A6A49B] uppercase tracking-wider font-mono">
                  Tài liệu đã lập chỉ mục
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {files.map((f) => (
                    <div
                      key={f.id}
                      className="p-3 rounded-xl bg-[#262523] border border-white/[0.06] flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-[#D97757] shrink-0">
                          {f.mime_type.startsWith("video/") ? <Film size={14} /> : <FileText size={14} />}
                        </span>
                        <div className="min-w-0">
                          <p className="font-medium text-[#ECEBE4] truncate">{f.file_name}</p>
                          <p className="text-[10px] text-[#75736C] font-mono">{formatBytes(f.size_bytes)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: CUSTOM INSTRUCTIONS */}
        {activeTab === "instructions" && (
          <div className="p-6 rounded-2xl bg-[#262523] border border-white/[0.08] space-y-4">
            <div>
              <h3 className="font-serif text-base font-semibold text-[#ECEBE4]">
                Chỉ dẫn riêng cho Claude (Project Instructions)
              </h3>
              <p className="text-xs text-[#A6A49B] mt-1 leading-relaxed">
                Mọi truy vấn được tạo bên trong Project này sẽ tự động tuân thủ chỉ dẫn dưới đây.
              </p>
            </div>

            <textarea
              rows={8}
              value={project.instructions ?? ""}
              onChange={(e) => setProject({ ...project, instructions: e.target.value })}
              placeholder="VD: Bạn là Tech Lead chuyên ngành hệ thống phân tán. Luôn trả lời bằng TypeScript và tuân thủ các quy tắc clean code..."
              className="w-full p-4 rounded-xl bg-[#1F1E1D] text-[#ECEBE4] border border-white/10 text-xs leading-relaxed outline-none focus:border-[#D97757]/60 font-sans thin-scroll resize-none"
            />

            <div className="flex items-center justify-between pt-2">
              <span className="text-[11px] text-[#75736C]">
                Tự động áp dụng cho tất cả cuộc trò chuyện thuộc Project này.
              </span>
              <button
                type="button"
                onClick={save}
                className="px-4 py-2 rounded-xl bg-[#D97757] hover:bg-[#E2886A] text-white text-xs font-medium transition-colors cursor-pointer inline-flex items-center gap-1.5 shadow-sm"
              >
                <Save size={13} />
                <span>{saved ? "Đã lưu!" : "Lưu chỉ dẫn"}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      <Toasts />

      <ConfirmModal
        open={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={confirmDelete}
        title="Xóa project này?"
        description="Project này cùng toàn bộ các cuộc trò chuyện và tài liệu chỉ dẫn liên quan sẽ bị xóa vĩnh viễn."
        confirmText="Xóa project"
        cancelText="Hủy"
        danger
      />
    </div>
  );
}
