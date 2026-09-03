"use client";
import React, { useEffect, useState } from "react";
import {
  Wrench,
  Globe,
  Calculator,
  FileSearch,
  Image as ImageIcon,
  Film,
  Cpu,
  Sparkles,
  Zap,
} from "lucide-react";
import type { AIModel } from "@/types";

export default function ExplorePage() {
  const [models, setModels] = useState<AIModel[]>([]);

  useEffect(() => {
    fetch("/api/models")
      .then((x) => x.json())
      .then((j) => setModels(j.models ?? []))
      .catch(() => {});
  }, []);

  return (
    <div className="h-full overflow-y-auto thin-scroll">
      <div className="max-w-4xl mx-auto px-4 sm:px-8 py-8">
        <div className="mb-6">
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-[var(--text)]">
            Khám phá Mô hình & Công cụ
          </h1>
          <p className="text-xs text-[var(--text-2)] mt-1">
            Tổng hợp các mô hình trí tuệ nhân tạo và công cụ tính toán đang được kích hoạt trong hệ thống.
          </p>
        </div>

        {/* Models Grid */}
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-[var(--text)] mb-3 flex items-center gap-1.5">
            <Cpu size={15} className="text-[var(--accent)]" />
            <span>Mô hình AI khả dụng ({models.length})</span>
          </h2>

          <div className="grid sm:grid-cols-2 gap-3">
            {models.map((m) => (
              <div
                key={m.id}
                className="card p-4 hover:border-[var(--accent)] transition-all flex flex-col justify-between shadow-xs"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-xs text-[var(--text)] flex items-center gap-1.5 truncate">
                      <span>{m.name}</span>
                    </p>
                    <span className="text-[10px] font-mono text-[var(--accent)] bg-[var(--accent-soft)] px-1.5 py-0.5 rounded border border-[var(--accent-border)] uppercase shrink-0">
                      {m.provider}
                    </span>
                  </div>

                  <p className="text-[11px] text-[var(--text-3)] mt-1 font-mono">
                    Context: {m.contextWindow.toLocaleString()} tokens
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 mt-3 pt-3 border-t border-[var(--border-subtle)]">
                  {m.capabilities.map((cap) => (
                    <span
                      key={cap}
                      className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-[var(--surface-2)] text-[var(--text-2)] border border-[var(--border)]"
                    >
                      {cap === "vision" && <ImageIcon size={10} />}
                      {cap === "video" && <Film size={10} />}
                      {cap === "fast" && <Zap size={10} />}
                      {cap === "reasoning" && <Sparkles size={10} />}
                      <span className="capitalize">{cap}</span>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Tools Section */}
        <section>
          <h2 className="text-sm font-semibold text-[var(--text)] mb-3 flex items-center gap-1.5">
            <Wrench size={15} className="text-[var(--accent)]" />
            <span>Bộ công cụ mở rộng (Smart Tools)</span>
          </h2>

          <div className="grid sm:grid-cols-3 gap-3">
            <ToolCard
              icon={<Calculator size={16} />}
              name="Calculator"
              desc="Giải quyết các phép tính số học và biểu thức phức tạp với độ chính xác tuyệt đối."
            />
            <ToolCard
              icon={<FileSearch size={16} />}
              name="File Search"
              desc="Tra cứu ngữ cảnh từ các tài liệu đính kèm và trích xuất câu trả lời chuẩn xác."
            />
            <ToolCard
              icon={<Globe size={16} />}
              name="Web Search"
              desc="Truy xuất dữ liệu trực tuyến thời gian thực (yêu cầu cấu hình API key từ Quản trị viên)."
            />
          </div>

          <div className="mt-4 p-3 rounded-lg bg-[var(--surface-2)] border border-[var(--border-subtle)] flex items-center gap-2 text-xs text-[var(--text-2)]">
            <Wrench size={14} className="text-[var(--accent)] shrink-0" />
            <span>
              Bạn có thể linh hoạt bật/tắt Web Search và Tools ngay tại thanh công cụ phía dưới khung chat.
            </span>
          </div>
        </section>
      </div>
    </div>
  );
}

function ToolCard({ icon, name, desc }: { icon: React.ReactNode; name: string; desc: string }) {
  return (
    <div className="card p-4 shadow-xs">
      <span className="h-8 w-8 rounded-lg bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent-border)] flex items-center justify-center mb-2.5">
        {icon}
      </span>
      <p className="font-semibold text-xs text-[var(--text)]">{name}</p>
      <p className="text-[11px] text-[var(--text-2)] mt-1 leading-relaxed">{desc}</p>
    </div>
  );
}
