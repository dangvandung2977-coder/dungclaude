import React from "react";
import Link from "next/link";
import { ArrowRight, Pencil, GraduationCap, Code2 } from "lucide-react";
import { ClaudeAsterisk } from "@/components/chat/ChatView";

export default function LandingPage() {
  return (
    <div className="min-h-dvh flex flex-col bg-[#1F1E1D] text-[#ECEBE4] font-sans selection:bg-[#D97757]/30 selection:text-[#ECEBE4]">
      {/* Minimal Header */}
      <header className="h-16 px-6 sm:px-12 flex items-center justify-between border-b border-white/[0.06] select-none">
        <Link
          href="/"
          className="flex items-center gap-2 text-[#ECEBE4] hover:opacity-90 transition-opacity"
        >
          <ClaudeAsterisk className="h-5 w-5 text-[#D97757]" />
          <span className="font-serif text-xl font-semibold tracking-tight">Claude</span>
        </Link>

        <div className="flex items-center gap-4 text-xs">
          <Link
            href="/login"
            className="text-[#A6A49B] hover:text-[#ECEBE4] transition-colors font-medium px-2 py-1"
          >
            Đăng nhập
          </Link>
          <Link
            href="/signup"
            className="px-4 py-2 rounded-xl bg-[#D97757] hover:bg-[#E2886A] text-white font-medium transition-colors cursor-pointer shadow-xs active:scale-98"
          >
            Bắt đầu
          </Link>
        </div>
      </header>

      {/* Main Minimalist Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 sm:px-8 py-16 sm:py-24 max-w-4xl mx-auto w-full text-center">
        {/* Terracotta Asterisk Icon */}
        <div className="mb-5 flex items-center justify-center">
          <ClaudeAsterisk className="h-12 w-12 text-[#D97757]" />
        </div>

        {/* Elegant Serif Headline */}
        <h1 className="font-serif text-3xl sm:text-5xl lg:text-6xl font-normal text-[#ECEBE4] tracking-tight leading-tight max-w-2xl mx-auto">
          Trí tuệ nhân tạo thế hệ mới.
        </h1>

        {/* Calm Subtitle */}
        <p className="text-sm sm:text-base text-[#A6A49B] mt-5 max-w-xl mx-auto leading-relaxed font-normal">
          Claude là trợ lý AI thông minh, hỗ trợ bạn viết lách, phân tích tài liệu
          và xử lý mã nguồn với độ tin cậy cao.
        </p>

        {/* Primary Action Button */}
        <div className="mt-8">
          <Link
            href="/signup"
            className="px-6 py-3 rounded-xl bg-[#D97757] hover:bg-[#E2886A] text-white text-sm font-medium transition-all inline-flex items-center gap-2 shadow-md active:scale-98 cursor-pointer"
          >
            <span>Trải nghiệm Claude</span>
            <ArrowRight size={15} />
          </Link>
        </div>

        {/* Minimalist Prompt Preview Box */}
        <div className="mt-14 w-full max-w-2xl text-left">
          <Link
            href="/app"
            className="block p-4 sm:p-5 rounded-2xl bg-[#262523] border border-white/[0.08] hover:border-white/20 transition-all shadow-xl group cursor-pointer"
          >
            <div className="flex items-center justify-between text-xs text-[#75736C] mb-3">
              <span>Bắt đầu cuộc trò chuyện</span>
              <span className="group-hover:text-[#ECEBE4] transition-colors">Vào ứng dụng →</span>
            </div>
            <p className="text-sm text-[#ECEBE4] font-normal leading-relaxed">
              How can I help you today?
            </p>

            <div className="flex flex-wrap items-center gap-2 mt-4 pt-3 border-t border-white/[0.04] text-xs text-[#A6A49B]">
              <span className="px-2.5 py-1 rounded-lg bg-[#1F1E1D] border border-white/[0.06] flex items-center gap-1.5">
                <Pencil size={12} className="text-[#D97757]" />
                <span>Viết lách</span>
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-[#1F1E1D] border border-white/[0.06] flex items-center gap-1.5">
                <GraduationCap size={12} className="text-[#D97757]" />
                <span>Giải thích</span>
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-[#1F1E1D] border border-white/[0.06] flex items-center gap-1.5">
                <Code2 size={12} className="text-[#D97757]" />
                <span>Lập trình</span>
              </span>
            </div>
          </Link>
        </div>

        {/* 3 Simple Core Pillars (Clean & Minimal) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-16 max-w-3xl w-full text-left pt-12 border-t border-white/[0.06]">
          <div>
            <h3 className="font-serif text-sm font-semibold text-[#ECEBE4] mb-1.5">
              Soạn thảo & Sáng tạo
            </h3>
            <p className="text-xs text-[#A6A49B] leading-relaxed">
              Tạo lập văn bản, đề xuất và báo cáo với văn phong tự nhiên, sâu sắc và chuẩn mực.
            </p>
          </div>

          <div>
            <h3 className="font-serif text-sm font-semibold text-[#ECEBE4] mb-1.5">
              Lập trình & Artifacts
            </h3>
            <p className="text-xs text-[#A6A49B] leading-relaxed">
              Phân tích, gỡ lỗi và trực tiếp xem trước giao diện mã nguồn trên Live Canvas độc lập.
            </p>
          </div>

          <div>
            <h3 className="font-serif text-sm font-semibold text-[#ECEBE4] mb-1.5">
              Tài liệu & Projects
            </h3>
            <p className="text-xs text-[#A6A49B] leading-relaxed">
              Tải lên tệp PDF, dữ liệu scan và cấu hình chỉ dẫn chuyên biệt cho từng dự án.
            </p>
          </div>
        </div>
      </main>

      {/* Minimalist Footer */}
      <footer className="h-16 px-6 sm:px-12 border-t border-white/[0.06] flex items-center justify-between text-xs text-[#75736C] select-none">
        <div className="flex items-center gap-2">
          <span>© 2026 Claude</span>
        </div>

        <div className="flex items-center gap-5">
          <Link href="/login" className="hover:text-[#ECEBE4] transition-colors">
            Đăng nhập
          </Link>
          <Link href="/signup" className="hover:text-[#ECEBE4] transition-colors">
            Đăng ký
          </Link>
        </div>
      </footer>
    </div>
  );
}
