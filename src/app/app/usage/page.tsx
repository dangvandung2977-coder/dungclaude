"use client";
import React, { useEffect, useState } from "react";
import { BarChart3, Zap, DollarSign, Activity, Cpu } from "lucide-react";

export default function UsagePage() {
  const [usage, setUsage] = useState<{
    totalTokens: number;
    totalCost: number;
    requests: number;
    byModel: Array<{ model: string; tokens: number; cost: number; requests: number }>;
  } | null>(null);

  useEffect(() => {
    fetch("/api/usage")
      .then((x) => x.json())
      .then((j) => setUsage(j.usage))
      .catch(() => {});
  }, []);

  if (!usage) {
    return (
      <div className="p-8 text-xs text-[var(--text-3)] font-mono">
        Đang tải thống kê…
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto thin-scroll">
      <div className="max-w-3xl mx-auto px-4 sm:px-8 py-8">
        <div className="mb-6">
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-[var(--text)] flex items-center gap-2">
            <BarChart3 size={20} className="text-[var(--accent)]" />
            <span>Thống kê mức dùng</span>
          </h1>
          <p className="text-xs text-[var(--text-2)] mt-1">
            Theo dõi lưu lượng truy vấn, số lượng tokens đã tiêu thụ và chi phí ước tính theo thời gian thực.
          </p>
        </div>

        {/* 3 Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
          <StatCard
            icon={<Activity size={16} className="text-indigo-400" />}
            label="Tổng lượt gọi (Requests)"
            value={usage.requests.toLocaleString()}
          />
          <StatCard
            icon={<Zap size={16} className="text-amber-400" />}
            label="Tokens đã tiêu thụ"
            value={usage.totalTokens.toLocaleString()}
          />
          <StatCard
            icon={<DollarSign size={16} className="text-emerald-400" />}
            label="Chi phí ước tính"
            value={`$${usage.totalCost.toFixed(4)}`}
          />
        </div>

        {/* Usage by model */}
        <section>
          <h2 className="text-sm font-semibold text-[var(--text)] mb-3 flex items-center gap-1.5">
            <Cpu size={15} className="text-[var(--text-3)]" />
            <span>Chi tiết theo mô hình AI</span>
          </h2>

          <div className="card divide-y divide-[var(--border-subtle)] overflow-hidden shadow-xs">
            {usage.byModel.map((m) => (
              <div
                key={m.model}
                className="p-3.5 text-xs flex items-center justify-between gap-3 text-[var(--text)]"
              >
                <div className="min-w-0 flex-1">
                  <span className="font-semibold text-xs truncate block">{m.model}</span>
                  <span className="text-[11px] text-[var(--text-3)] font-mono mt-0.5 block">
                    {m.requests} yêu cầu · {m.tokens.toLocaleString()} tokens
                  </span>
                </div>
                <span className="text-xs font-mono font-medium text-[var(--text-2)] shrink-0">
                  ${m.cost.toFixed(4)}
                </span>
              </div>
            ))}

            {usage.byModel.length === 0 && (
              <div className="py-8 text-center text-xs text-[var(--text-3)]">
                Chưa có dữ liệu tiêu thụ nào — hãy bắt đầu chat để ghi nhận!
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="card p-4 shadow-xs">
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-xs text-[var(--text-3)]">{label}</span>
        <span className="p-1 rounded bg-[var(--surface-2)] shrink-0">{icon}</span>
      </div>
      <p className="text-xl font-semibold tracking-tight text-[var(--text)]">{value}</p>
    </div>
  );
}
