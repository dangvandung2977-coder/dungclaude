"use client";
import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";

interface U { id: string; email: string; name: string | null; role: string; createdAt: string; conversations: number; }

export default function AdminUsersPage() {
  const [users, setUsers] = useState<U[]>([]);
  const [stats, setStats] = useState<{ totalTokens: number; totalCost: number; requests: number; users: number } | null>(null);

  useEffect(() => {
    fetch("/api/admin/users").then((x) => x.json()).then((r) => {
      if (r) { setUsers(r.users ?? []); setStats(r.stats ?? null); }
    }).catch(() => {});
  }, []);

  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight">Người dùng & tổng quan</h1>
      <p className="text-sm muted mt-1 mb-5 flex items-center gap-1.5">
        <ShieldCheck size={14} /> Hệ thống chỉ có <b>1 Admin duy nhất</b> (là bạn). Mọi user khác dùng theo cấu hình bạn đã đặt, không thể tự lên admin.
      </p>
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 my-5">
          <Stat label="Users" value={String(stats.users)} />
          <Stat label="Requests" value={String(stats.requests)} />
          <Stat label="Tokens" value={stats.totalTokens.toLocaleString()} />
          <Stat label="Chi phí" value={`$${stats.totalCost.toFixed(2)}`} />
        </div>
      )}
      <div className="flex flex-col gap-2">
        {users.map((u) => (
          <div key={u.id} className="card px-4 py-3 flex items-center gap-3 text-sm">
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{u.name ?? u.email}</p>
              <p className="text-xs faint truncate">{u.email} · {u.conversations} chats</p>
            </div>
            <span className={`text-[11px] rounded-full px-2.5 py-1 font-medium ${u.role === "admin" ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "bordered faint"}`}>
              {u.role === "admin" ? "Admin (bạn)" : "Người dùng"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs faint">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}
