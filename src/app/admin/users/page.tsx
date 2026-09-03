"use client";
import React, { useEffect, useState } from "react";
import {
  ShieldCheck,
  Search,
  MessageSquare,
  FolderKanban,
  Coins,
  Calendar,
  X,
  ChevronRight,
  Eye,
  Bot,
  User as UserIcon,
} from "lucide-react";

interface UserSummary {
  id: string;
  email: string;
  name: string | null;
  role: string;
  createdAt: string;
  conversations: number;
}

interface ConversationItem {
  id: string;
  title: string;
  modelId: string;
  messageCount: number;
  lastPreview?: string;
  createdAt: string;
  updatedAt: string;
}

interface ProjectItem {
  id: string;
  name: string;
  description?: string | null;
  instructions?: string | null;
  createdAt: string;
}

interface MessageItem {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  modelId?: string | null;
  createdAt: string;
}

interface UserDetailData {
  user: UserSummary;
  conversations: ConversationItem[];
  projects: ProjectItem[];
  usage: {
    totalTokens: number;
    inputTokens: number;
    outputTokens: number;
    totalCost: number;
    eventsCount: number;
  };
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [stats, setStats] = useState<{
    totalTokens: number;
    totalCost: number;
    requests: number;
    users: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Modal inspection state
  const [selectedUser, setSelectedUser] = useState<UserSummary | null>(null);
  const [detailData, setDetailData] = useState<UserDetailData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"conversations" | "projects" | "usage">("conversations");

  // Conversation inspector state
  const [inspectingConv, setInspectingConv] = useState<ConversationItem | null>(null);
  const [convMessages, setConvMessages] = useState<MessageItem[]>([]);
  const [convLoading, setConvLoading] = useState(false);

  useEffect(() => {
    fetch("/api/admin/users")
      .then((res) => res.json())
      .then((data) => {
        if (data) {
          setUsers(data.users ?? []);
          setStats(data.stats ?? null);
        }
      })
      .catch((err) => console.error("Error loading admin users:", err))
      .finally(() => setLoading(false));
  }, []);

  async function openUserDetails(u: UserSummary) {
    setSelectedUser(u);
    setDetailData(null);
    setDetailLoading(true);
    setActiveTab("conversations");
    setInspectingConv(null);
    setConvMessages([]);

    try {
      const res = await fetch(`/api/admin/users/${u.id}`);
      const data = await res.json();
      if (res.ok) {
        setDetailData(data);
      }
    } catch (err) {
      console.error("Failed to load user details:", err);
    } finally {
      setDetailLoading(false);
    }
  }

  async function openConversationMessages(c: ConversationItem) {
    if (!selectedUser) return;
    setInspectingConv(c);
    setConvMessages([]);
    setConvLoading(true);

    try {
      const res = await fetch(`/api/admin/users/${selectedUser.id}/conversations/${c.id}`);
      const data = await res.json();
      if (res.ok) {
        setConvMessages(data.messages ?? []);
      }
    } catch (err) {
      console.error("Failed to load conversation messages:", err);
    } finally {
      setConvLoading(false);
    }
  }

  const filteredUsers = users.filter((u) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (
      u.email.toLowerCase().includes(q) ||
      (u.name && u.name.toLowerCase().includes(q)) ||
      u.id.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Page Heading */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-[#ECEBE4]">
            Dữ liệu người dùng & Tổng quan
          </h1>
          <p className="text-xs text-[#A6A49B] mt-1 flex items-center gap-1.5">
            <ShieldCheck size={14} className="text-[#D97757]" />
            Bảng quản trị dành riêng cho Admin: Xem hồ sơ, đoạn chat, và lịch sử sử dụng của người dùng.
          </p>
        </div>

        {/* Search Bar */}
        <div className="relative w-full sm:w-64">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#75736C]" />
          <input
            type="text"
            placeholder="Tìm theo email hoặc tên..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-9 pl-9 pr-3 rounded-xl bg-[#1D1C1A] border border-white/[0.08] text-xs text-[#ECEBE4] placeholder-[#75736C] focus:outline-none focus:border-[#D97757]/50 transition-colors"
          />
        </div>
      </div>

      {/* Global Stat Cards */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Tổng Người Dùng" value={String(stats.users)} sub="Tài khoản hệ thống" />
          <StatCard label="Tổng Lượt Request" value={String(stats.requests)} sub="Cuộc gọi AI" />
          <StatCard label="Tokens Đã Xử Lý" value={stats.totalTokens.toLocaleString()} sub="Input + Output" />
          <StatCard label="Ước Tính Chi Phí" value={`$${stats.totalCost.toFixed(3)}`} sub="USD tiêu thụ" />
        </div>
      )}

      {/* User Directory List */}
      <div className="rounded-2xl border border-white/[0.08] bg-[#181716] overflow-hidden">
        <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between text-xs text-[#75736C]">
          <span>Danh sách người dùng ({filteredUsers.length})</span>
          <span>Thao tác</span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs text-[#75736C]">Đang tải dữ liệu người dùng...</div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-8 text-center text-xs text-[#75736C]">Không tìm thấy người dùng nào.</div>
        ) : (
          <div className="divide-y divide-white/[0.05]">
            {filteredUsers.map((u) => {
              const isAdmin = u.role === "admin";
              return (
                <div
                  key={u.id}
                  className="px-4 py-3.5 flex items-center justify-between gap-4 hover:bg-white/[0.02] transition-colors"
                >
                  {/* User info */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-9 w-9 rounded-xl bg-[#282624] border border-white/[0.08] flex items-center justify-center font-semibold text-sm text-[#ECEBE4] shrink-0">
                      {(u.name || u.email).slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm text-[#ECEBE4] truncate">
                          {u.name || "Chưa đặt tên"}
                        </p>
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                            isAdmin
                              ? "bg-[#D97757]/20 border-[#D97757]/40 text-[#D97757]"
                              : "bg-white/[0.04] border-white/[0.08] text-[#A6A49B]"
                          }`}
                        >
                          {isAdmin ? "Admin (Bạn)" : "Người dùng"}
                        </span>
                      </div>
                      <p className="text-xs text-[#75736C] truncate mt-0.5">
                        {u.email} · <span className="text-[#A6A49B]">{u.conversations} cuộc trò chuyện</span>
                      </p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => openUserDetails(u)}
                      className="px-3 py-1.5 rounded-lg bg-[#242321] hover:bg-[#302E2B] border border-white/[0.08] text-xs font-medium text-[#ECEBE4] flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Eye size={13} className="text-[#D97757]" />
                      <span>Xem dữ liệu</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── User Detail Inspector Modal / Drawer ── */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs select-none">
          <div className="relative w-full max-w-4xl max-h-[90vh] rounded-2xl bg-[#181716] border border-white/[0.1] shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-[0.98]">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-white/[0.08] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-[#282624] border border-white/[0.1] flex items-center justify-center font-bold text-base text-[#D97757]">
                  {(selectedUser.name || selectedUser.email).slice(0, 1).toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-semibold text-[#ECEBE4]">
                      {selectedUser.name || selectedUser.email}
                    </h2>
                    <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-[#D97757]/20 text-[#D97757] border border-[#D97757]/35">
                      {selectedUser.role}
                    </span>
                  </div>
                  <p className="text-xs text-[#75736C]">
                    Email: {selectedUser.email} · ID: <code className="font-mono">{selectedUser.id}</code>
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedUser(null)}
                className="p-1.5 rounded-lg text-[#75736C] hover:text-[#ECEBE4] hover:bg-white/[0.05] transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Navigation Tabs */}
            <div className="px-6 pt-3 border-b border-white/[0.06] flex gap-4 text-xs font-medium text-[#75736C]">
              <button
                type="button"
                onClick={() => {
                  setActiveTab("conversations");
                  setInspectingConv(null);
                }}
                className={`pb-2.5 flex items-center gap-1.5 border-b-2 transition-colors cursor-pointer ${
                  activeTab === "conversations"
                    ? "border-[#D97757] text-[#ECEBE4]"
                    : "border-transparent hover:text-[#ECEBE4]"
                }`}
              >
                <MessageSquare size={14} />
                <span>Cuộc hội thoại ({detailData?.conversations.length ?? 0})</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveTab("projects");
                  setInspectingConv(null);
                }}
                className={`pb-2.5 flex items-center gap-1.5 border-b-2 transition-colors cursor-pointer ${
                  activeTab === "projects"
                    ? "border-[#D97757] text-[#ECEBE4]"
                    : "border-transparent hover:text-[#ECEBE4]"
                }`}
              >
                <FolderKanban size={14} />
                <span>Dự án ({detailData?.projects.length ?? 0})</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveTab("usage");
                  setInspectingConv(null);
                }}
                className={`pb-2.5 flex items-center gap-1.5 border-b-2 transition-colors cursor-pointer ${
                  activeTab === "usage"
                    ? "border-[#D97757] text-[#ECEBE4]"
                    : "border-transparent hover:text-[#ECEBE4]"
                }`}
              >
                <Coins size={14} />
                <span>Chi phí & Token</span>
              </button>
            </div>

            {/* Modal Body Content */}
            <div className="p-6 overflow-y-auto flex-1 min-h-[360px]">
              {detailLoading ? (
                <div className="h-64 flex items-center justify-center text-xs text-[#75736C]">
                  Đang tải dữ liệu chi tiết của người dùng...
                </div>
              ) : !detailData ? (
                <div className="h-64 flex items-center justify-center text-xs text-[#75736C]">
                  Không tìm thấy dữ liệu.
                </div>
              ) : (
                <>
                  {/* TAB 1: CONVERSATIONS */}
                  {activeTab === "conversations" && (
                    <div>
                      {inspectingConv ? (
                        /* Conversation Messages View */
                        <div className="space-y-4">
                          <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
                            <div>
                              <button
                                type="button"
                                onClick={() => setInspectingConv(null)}
                                className="text-xs text-[#D97757] hover:underline mb-1 inline-flex items-center gap-1"
                              >
                                ← Quay lại danh sách cuộc trò chuyện
                              </button>
                              <h3 className="text-sm font-semibold text-[#ECEBE4]">
                                {inspectingConv.title}
                              </h3>
                              <p className="text-[11px] text-[#75736C]">
                                Model: {inspectingConv.modelId} · Cập nhật: {new Date(inspectingConv.updatedAt).toLocaleString("vi-VN")}
                              </p>
                            </div>
                          </div>

                          {convLoading ? (
                            <div className="py-12 text-center text-xs text-[#75736C]">
                              Đang tải tin nhắn...
                            </div>
                          ) : convMessages.length === 0 ? (
                            <div className="py-12 text-center text-xs text-[#75736C]">
                              Chưa có tin nhắn trong cuộc hội thoại này.
                            </div>
                          ) : (
                            <div className="space-y-3 max-h-[440px] overflow-y-auto pr-2">
                              {convMessages.map((m) => {
                                const isUser = m.role === "user";
                                return (
                                  <div
                                    key={m.id}
                                    className={`p-3.5 rounded-xl border text-xs leading-relaxed ${
                                      isUser
                                        ? "bg-[#252422] border-white/[0.08] text-[#ECEBE4]"
                                        : "bg-[#1C1B1A] border-white/[0.06] text-[#A6A49B]"
                                    }`}
                                  >
                                    <div className="flex items-center gap-1.5 font-semibold mb-1 text-[11px] text-[#D97757]">
                                      {isUser ? <UserIcon size={12} /> : <Bot size={12} />}
                                      <span>{isUser ? "Người dùng" : "DungClaude AI"}</span>
                                      <span className="text-[#75736C] font-normal ml-auto">
                                        {new Date(m.createdAt).toLocaleTimeString("vi-VN")}
                                      </span>
                                    </div>
                                    <div className="whitespace-pre-wrap font-sans">{m.content}</div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      ) : (
                        /* Conversations List */
                        detailData.conversations.length === 0 ? (
                          <div className="py-12 text-center text-xs text-[#75736C]">
                            Người dùng này chưa tạo cuộc trò chuyện nào.
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {detailData.conversations.map((c) => (
                              <div
                                key={c.id}
                                onClick={() => openConversationMessages(c)}
                                className="p-3.5 rounded-xl bg-[#201F1D] border border-white/[0.06] hover:border-[#D97757]/40 hover:bg-[#262422] transition-colors cursor-pointer flex items-center justify-between gap-4"
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <h4 className="text-xs font-semibold text-[#ECEBE4] truncate">
                                      {c.title}
                                    </h4>
                                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/[0.04] text-[#A6A49B] border border-white/[0.06]">
                                      {c.modelId}
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-[#75736C] mt-1 truncate">
                                    {c.lastPreview || "Không có bản xem trước"}
                                  </p>
                                </div>

                                <div className="flex items-center gap-3 shrink-0 text-xs text-[#75736C]">
                                  <span>{c.messageCount} tin nhắn</span>
                                  <ChevronRight size={14} className="text-[#D97757]" />
                                </div>
                              </div>
                            ))}
                          </div>
                        )
                      )}
                    </div>
                  )}

                  {/* TAB 2: PROJECTS */}
                  {activeTab === "projects" && (
                    <div>
                      {detailData.projects.length === 0 ? (
                        <div className="py-12 text-center text-xs text-[#75736C]">
                          Người dùng này chưa tạo dự án nào.
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {detailData.projects.map((p) => (
                            <div
                              key={p.id}
                              className="p-4 rounded-xl bg-[#201F1D] border border-white/[0.06] space-y-2"
                            >
                              <div className="flex items-center justify-between">
                                <h4 className="text-sm font-semibold text-[#ECEBE4]">{p.name}</h4>
                                <span className="text-[11px] text-[#75736C] flex items-center gap-1">
                                  <Calendar size={12} />
                                  {new Date(p.createdAt).toLocaleDateString("vi-VN")}
                                </span>
                              </div>
                              {p.description && (
                                <p className="text-xs text-[#A6A49B]">{p.description}</p>
                              )}
                              {p.instructions && (
                                <div className="p-2.5 rounded-lg bg-[#141312] border border-white/[0.05] text-[11px] text-[#75736C] font-mono whitespace-pre-wrap">
                                  <span className="text-[#D97757] font-semibold block mb-1">
                                    Chỉ dẫn tùy chỉnh (Instructions):
                                  </span>
                                  {p.instructions}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB 3: USAGE */}
                  {activeTab === "usage" && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <StatCard
                          label="Tổng Token"
                          value={detailData.usage.totalTokens.toLocaleString()}
                          sub="Input + Output"
                        />
                        <StatCard
                          label="Token Nhập (Prompt)"
                          value={detailData.usage.inputTokens.toLocaleString()}
                          sub="Input"
                        />
                        <StatCard
                          label="Token Xuất (Completion)"
                          value={detailData.usage.outputTokens.toLocaleString()}
                          sub="Output"
                        />
                        <StatCard
                          label="Chi phí tích lũy"
                          value={`$${detailData.usage.totalCost.toFixed(4)}`}
                          sub="USD"
                        />
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="p-3.5 rounded-xl bg-[#1C1B1A] border border-white/[0.08] shadow-xs">
      <p className="text-xs text-[#75736C]">{label}</p>
      <p className="text-lg font-semibold text-[#ECEBE4] mt-0.5">{value}</p>
      {sub && <p className="text-[10px] text-[#A6A49B] mt-0.5">{sub}</p>}
    </div>
  );
}
