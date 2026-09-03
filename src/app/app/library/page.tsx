"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Box, RotateCcw, ArrowRight } from "lucide-react";
import type { Conversation } from "@/types";

export default function ArtifactsLibraryPage() {
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/conversations")
      .then((x) => x.json())
      .then((j) => {
        setConvs((j.conversations ?? []).filter((c: Conversation) => c.archived));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function unarchive(id: string) {
    await fetch(`/api/conversations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: false }),
    });
    setConvs((s) => s.filter((c) => c.id !== id));
  }

  return (
    <div className="h-full overflow-y-auto thin-scroll bg-[#1F1E1D] text-[#ECEBE4] font-sans">
      <div className="max-w-4xl mx-auto px-5 sm:px-8 py-10">
        <div className="mb-8">
          <h1 className="font-serif text-2xl sm:text-3xl font-semibold tracking-tight text-[#ECEBE4]">
            Artifacts & Thư viện
          </h1>
          <p className="text-xs text-[#A6A49B] mt-1.5 leading-relaxed">
            Xem lại các sản phẩm mã nguồn, giao diện sống và các cuộc trò chuyện lưu trữ.
          </p>
        </div>

        {loading ? (
          <div className="text-xs text-[#75736C] font-mono">Đang tải…</div>
        ) : convs.length === 0 ? (
          <div className="p-12 text-center rounded-2xl bg-[#262523] border border-white/[0.08]">
            <div className="h-12 w-12 rounded-xl bg-white/5 border border-white/10 text-[#D97757] flex items-center justify-center mx-auto mb-4">
              <Box size={24} />
            </div>
            <h3 className="font-serif text-lg font-semibold text-[#ECEBE4] mb-1">
              Chưa có Artifacts lưu trữ
            </h3>
            <p className="text-xs text-[#A6A49B] max-w-sm mx-auto leading-relaxed">
              Các sản phẩm code và đoạn chat lưu trữ sẽ hiển thị tập trung tại đây.
            </p>
          </div>
        ) : (
          <div className="rounded-2xl bg-[#262523] border border-white/[0.08] divide-y divide-white/[0.04] overflow-hidden">
            {convs.map((c) => (
              <div
                key={c.id}
                className="p-4 flex items-center justify-between gap-3 text-xs text-[#ECEBE4] hover:bg-white/[0.03] transition-colors group"
              >
                <Link
                  href={`/app/c/${c.id}`}
                  className="flex items-center gap-2.5 truncate flex-1 min-w-0 font-medium group-hover:text-[#D97757] transition-colors"
                >
                  <span className="h-2 w-2 rounded-full bg-[#D97757]" />
                  <span className="truncate">{c.title}</span>
                </Link>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => unarchive(c.id)}
                    className="p-1.5 rounded-lg text-[#75736C] hover:text-[#ECEBE4] hover:bg-white/5 transition-colors cursor-pointer inline-flex items-center gap-1"
                    title="Khôi phục"
                  >
                    <RotateCcw size={13} />
                    <span className="hidden sm:inline text-[11px]">Khôi phục</span>
                  </button>
                  <Link
                    href={`/app/c/${c.id}`}
                    className="p-1.5 rounded-lg text-[#75736C] hover:text-[#ECEBE4] hover:bg-white/5 transition-colors"
                  >
                    <ArrowRight size={13} />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
