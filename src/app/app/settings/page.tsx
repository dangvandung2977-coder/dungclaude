"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import {
  User,
  Sun,
  Moon,
  Laptop,
  Shield,
  Trash2,
  LogOut,
  Sliders,
  Cpu,
  BarChart3,
  Check,
  AlertTriangle,
  Key,
  Brain,
} from "lucide-react";
import { Button, Modal, useToast } from "@/components/ui/primitives";
import { useSession } from "@/hooks/useSession";
import { cn } from "@/lib/utils";
import { MemoryManager } from "@/components/memory/MemoryManager";

type SettingsTab = "general" | "appearance" | "models" | "memory" | "privacy";

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const { user, logout } = useSession();
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { toast, Toasts } = useToast();

  useEffect(() => {
    setMounted(true);
  }, []);

  async function handleDeleteAll() {
    setDeleting(true);
    try {
      const list = await fetch("/api/conversations").then((x) => x.json());
      for (const c of list.conversations ?? []) {
        await fetch(`/api/conversations/${c.id}`, { method: "DELETE" });
      }
      toast("Đã xóa tất cả cuộc trò chuyện thành công", "success");
      setConfirmDelete(false);
      window.location.href = "/app";
    } catch {
      toast("Có lỗi xảy ra khi xóa", "error");
    } finally {
      setDeleting(false);
    }
  }

  const tabs: Array<{ id: SettingsTab; label: string; icon: React.ReactNode }> = [
    { id: "general", label: "Tài khoản & Hồ sơ", icon: <User size={15} /> },
    { id: "appearance", label: "Giao diện hiển thị", icon: <Sun size={15} /> },
    { id: "models", label: "Mô hình AI & Hệ thống", icon: <Cpu size={15} /> },
    { id: "memory", label: "Bộ nhớ AI (Memory)", icon: <Brain size={15} /> },
    { id: "privacy", label: "Dữ liệu & Quyền riêng tư", icon: <Shield size={15} /> },
  ];

  return (
    <div className="h-full overflow-y-auto thin-scroll">
      <div className="max-w-4xl mx-auto px-4 sm:px-8 py-8">
        <div className="mb-6">
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-[var(--text)]">
            Cài đặt không gian làm việc
          </h1>
          <p className="text-xs text-[var(--text-2)] mt-1">
            Quản lý tài khoản, tuỳ biến giao diện và kiểm soát dữ liệu của bạn.
          </p>
        </div>

        {/* Two-column Layout */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
          {/* Left Column: Navigation */}
          <aside className="md:col-span-4 card p-1.5 space-y-0.5">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer text-left",
                  activeTab === tab.id
                    ? "bg-[var(--surface-2)] text-[var(--text)] border border-[var(--border-subtle)]"
                    : "text-[var(--text-2)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)]"
                )}
              >
                <span className={cn(activeTab === tab.id ? "text-[var(--accent)]" : "text-[var(--text-3)]")}>
                  {tab.icon}
                </span>
                <span>{tab.label}</span>
              </button>
            ))}

            <div className="my-1 border-t border-[var(--border-subtle)]" />

            <Link
              href="/app/usage"
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-[var(--text-2)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)] transition-colors"
            >
              <BarChart3 size={15} className="text-[var(--text-3)]" />
              <span>Thống kê mức dùng</span>
            </Link>

            {user?.role === "admin" && (
              <Link
                href="/admin"
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-[var(--accent)] hover:bg-[var(--surface-hover)] transition-colors"
              >
                <Sliders size={15} />
                <span>Quản trị Provider & Model</span>
              </Link>
            )}
          </aside>

          {/* Right Column: Settings Content */}
          <div className="md:col-span-8 space-y-4">
            {/* GENERAL TAB */}
            {activeTab === "general" && (
              <div className="space-y-4 animate-in fade-in duration-100">
                <section className="card p-5">
                  <h2 className="text-sm font-semibold text-[var(--text)] mb-1">Hồ sơ người dùng</h2>
                  <p className="text-xs text-[var(--text-2)] mb-4">
                    Thông tin tài khoản đang đăng nhập trong không gian Lumen.
                  </p>

                  <div className="flex items-center gap-4 py-2 border-b border-[var(--border-subtle)]">
                    <div className="h-12 w-12 rounded-full bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent-border)] flex items-center justify-center text-base font-bold">
                      {(user?.name ?? user?.email ?? "?").slice(0, 1).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium text-sm text-[var(--text)]">{user?.name ?? "Chưa đặt tên"}</p>
                      <p className="text-xs text-[var(--text-2)]">{user?.email}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mt-4 text-xs">
                    <div>
                      <span className="text-[var(--text-3)] block mb-1">Vai trò</span>
                      <span className="font-mono px-2 py-0.5 rounded bg-[var(--surface-2)] border border-[var(--border)]">
                        {user?.role === "admin" ? "Quản trị viên (Admin)" : "Thành viên (User)"}
                      </span>
                    </div>
                    <div>
                      <span className="text-[var(--text-3)] block mb-1">Trạng thái tài khoản</span>
                      <span className="text-emerald-400 font-medium flex items-center gap-1">
                        <Check size={12} /> Đang hoạt động
                      </span>
                    </div>
                  </div>
                </section>

                <section className="card p-5">
                  <h2 className="text-sm font-semibold text-[var(--text)] mb-1">Phiên đăng nhập</h2>
                  <p className="text-xs text-[var(--text-2)] mb-3">
                    Đăng xuất khỏi phiên hiện tại trên trình duyệt này.
                  </p>
                  <Button variant="outline" size="sm" onClick={logout}>
                    <LogOut size={13} />
                    <span>Đăng xuất tài khoản</span>
                  </Button>
                </section>
              </div>
            )}

            {/* APPEARANCE TAB */}
            {activeTab === "appearance" && (
              <div className="space-y-4 animate-in fade-in duration-100">
                <section className="card p-5">
                  <h2 className="text-sm font-semibold text-[var(--text)] mb-1">Chủ đề giao diện</h2>
                  <p className="text-xs text-[var(--text-2)] mb-4">
                    Tuỳ biến trải nghiệm màu sắc theo sở thích của bạn.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {[
                      { id: "dark", label: "Giao diện Tối", sub: "Deep Charcoal", icon: <Moon size={18} /> },
                      { id: "light", label: "Giao diện Sáng", sub: "Clean Slate", icon: <Sun size={18} /> },
                      { id: "system", label: "Theo hệ điều hành", sub: "Tự động", icon: <Laptop size={18} /> },
                    ].map((item) => {
                      const selected = mounted && theme === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setTheme(item.id)}
                          className={cn(
                            "p-3.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col gap-2 relative",
                            selected
                              ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text)]"
                              : "border-[var(--border)] hover:bg-[var(--surface-hover)] text-[var(--text-2)]"
                          )}
                        >
                          <div className={cn(selected ? "text-[var(--accent)]" : "text-[var(--text-3)]")}>
                            {item.icon}
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-[var(--text)]">{item.label}</p>
                            <p className="text-[11px] text-[var(--text-3)] mt-0.5">{item.sub}</p>
                          </div>
                          {selected && (
                            <Check size={14} className="absolute top-3 right-3 text-[var(--accent)]" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </section>
              </div>
            )}

            {/* MODELS TAB */}
            {activeTab === "models" && (
              <div className="space-y-4 animate-in fade-in duration-100">
                <section className="card p-5">
                  <h2 className="text-sm font-semibold text-[var(--text)] mb-1">Mô hình AI tích hợp</h2>
                  <p className="text-xs text-[var(--text-2)] mb-4">
                    Hệ thống tự động hỗ trợ chuyển đổi thông minh giữa các mô hình mạnh mẽ hàng đầu.
                  </p>

                  <div className="space-y-2 text-xs">
                    <div className="p-3 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-[var(--text)]">Smart Router</p>
                        <p className="text-[11px] text-[var(--text-3)] mt-0.5">
                          Tự động nhận diện prompt, hình ảnh hoặc video để định tuyến mô hình thích hợp.
                        </p>
                      </div>
                      <span className="text-[11px] font-mono text-[var(--accent)] bg-[var(--accent-soft)] px-2 py-0.5 rounded border border-[var(--accent-border)]">
                        Bật sẵn
                      </span>
                    </div>

                    <div className="p-3 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-[var(--text)]">Claude, GPT, Gemini, DeepSeek</p>
                        <p className="text-[11px] text-[var(--text-3)] mt-0.5">
                          Cấu hình khóa API và danh mục mô hình do Quản trị viên quản lý.
                        </p>
                      </div>
                      <Link
                        href="/app/explore"
                        className="text-[11px] font-medium text-[var(--accent)] hover:underline"
                      >
                        Khám phá models →
                      </Link>
                    </div>

                    {user?.role === "admin" && (
                      <div className="p-3.5 rounded-lg bg-gradient-to-r from-[#D97757]/15 to-transparent border border-[#D97757]/30 flex items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold text-xs text-[#D97757] flex items-center gap-1.5">
                            <Key size={13} /> Quản lý & Dán API Key
                          </p>
                          <p className="text-[11px] text-[var(--text-2)] mt-0.5">
                            Dán key cho Gemini, Claude, OpenAI hoặc Custom Endpoints. Tự động đổi key khi gặp Rate Limit (429).
                          </p>
                        </div>
                        <Link
                          href="/admin"
                          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#D97757] hover:bg-[#c46849] text-white transition-all shrink-0 shadow-xs"
                        >
                          Đến trang Quản trị Key →
                        </Link>
                      </div>
                    )}
                  </div>
                </section>
              </div>
            )}

            {/* MEMORY TAB */}
            {activeTab === "memory" && (
              <div className="animate-in fade-in duration-100">
                <MemoryManager
                  title="Bộ nhớ AI cá nhân & Toàn cục"
                  description="Các thông tin, sở thích code, quy chuẩn và kiến thức được AI ghi nhớ tự động hoặc thủ công để phục vụ các cuộc trò chuyện."
                />
              </div>
            )}

            {/* PRIVACY TAB */}
            {activeTab === "privacy" && (
              <div className="space-y-4 animate-in fade-in duration-100">
                <section className="card p-5 border-red-500/20 bg-red-500/[0.02]">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-red-500/10 text-red-400 shrink-0">
                      <AlertTriangle size={18} />
                    </div>
                    <div>
                      <h2 className="text-sm font-semibold text-[var(--text)]">Vùng nguy hiểm</h2>
                      <p className="text-xs text-[var(--text-2)] mt-1 leading-relaxed">
                        Xóa toàn bộ lịch sử các cuộc trò chuyện của bạn trên Lumen AI. Hành động này không thể hoàn tác.
                      </p>
                      <div className="mt-4">
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => setConfirmDelete(true)}
                        >
                          <Trash2 size={13} />
                          <span>Xóa tất cả cuộc trò chuyện</span>
                        </Button>
                      </div>
                    </div>
                  </div>
                </section>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Xác nhận xóa tất cả dữ liệu chat"
        description="Toàn bộ lịch sử trò chuyện của bạn sẽ bị xóa vĩnh viễn khỏi cơ sở dữ liệu."
      >
        <div className="pt-2 flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
            Hủy bỏ
          </Button>
          <Button variant="danger" size="sm" loading={deleting} onClick={handleDeleteAll}>
            Xóa vĩnh viễn
          </Button>
        </div>
      </Modal>

      <Toasts />
    </div>
  );
}
