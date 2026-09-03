import React from "react";
import Link from "next/link";
import {
  ArrowRight,
  Code2,
  FileText,
  FolderKanban,
  Zap,
  ShieldCheck,
  Cpu,
  ChevronRight,
} from "lucide-react";
import { DungClaudeLogo } from "@/components/brand/DungClaudeLogo";

export default function LandingPage() {
  return (
    <div className="relative min-h-dvh flex flex-col bg-[#121110] text-[#ECEBE4] font-sans selection:bg-[#D97757]/30 selection:text-[#ECEBE4] overflow-x-hidden">
      {/* ── Dynamic Atmospheric Background Lighting & Rotating Aurora ── */}
      <div
        className="pointer-events-none fixed inset-0 overflow-hidden z-0"
        aria-hidden="true"
      >
        {/* Deep Rotating Multi-color Aurora Nebula */}
        <div
          className="absolute top-[-15%] left-1/2 -translate-x-1/2 w-[850px] sm:w-[1100px] h-[600px] sm:h-[800px] rounded-full blur-[150px] opacity-40 animate-aurora"
          style={{
            background:
              "radial-gradient(circle, rgba(217, 119, 87, 0.28) 0%, rgba(245, 158, 11, 0.12) 35%, rgba(99, 102, 241, 0.08) 65%, transparent 80%)",
          }}
        />

        {/* Ambient Center Glow */}
        <div
          className="absolute top-[35%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[500px] rounded-full blur-[130px] opacity-30"
          style={{
            background:
              "radial-gradient(circle, rgba(217, 119, 87, 0.25) 0%, rgba(217, 119, 87, 0.05) 50%, transparent 75%)",
          }}
        />

        {/* Spatial Micro-Dot Grid Pattern */}
        <div
          className="absolute inset-0 opacity-[0.035]"
          style={{
            backgroundImage:
              "radial-gradient(rgba(255, 255, 255, 0.8) 1.2px, transparent 1.2px)",
            backgroundSize: "32px 32px",
          }}
        />

        {/* Vignette Shadow Overlay */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,rgba(10,9,8,0.8)_100%)]" />
      </div>

      {/* ── Glassmorphic Sticky Header ── */}
      <header className="relative z-20 sticky top-0 h-18 px-6 sm:px-12 flex items-center justify-between border-b border-white/[0.07] bg-[#121110]/80 backdrop-blur-xl select-none transition-all">
        <Link
          href="/"
          className="group flex items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D97757]/50 rounded-xl transition-transform active:scale-[0.98]"
          aria-label="DungClaude Home"
        >
          {/* Glowing Brand Icon Frame (Pure SVG) */}
          <div className="group-hover:scale-105 transition-transform duration-300">
            <DungClaudeLogo size={38} showGlow />
          </div>

          {/* Brand Name Typography */}
          <div className="flex items-center gap-2">
            <span className="text-xl font-semibold tracking-tight text-[#ECEBE4] group-hover:text-white transition-colors">
              DungClaude
            </span>
            <span className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase bg-[#D97757]/20 text-[#D97757] border border-[#D97757]/40 shadow-xs">
              AI PRO
            </span>
          </div>
        </Link>

        {/* Top Navigation CTAs */}
        <div className="flex items-center gap-3 sm:gap-4 text-xs">
          <Link
            href="/login"
            className="text-[#A6A49B] hover:text-[#ECEBE4] transition-colors font-medium px-3 py-1.5 rounded-lg hover:bg-white/[0.05]"
          >
            Đăng nhập
          </Link>
          <Link
            href="/signup"
            className="relative group px-4 sm:px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#D97757] to-[#E2886A] text-white font-medium transition-all shadow-md shadow-[#D97757]/20 hover:shadow-lg hover:shadow-[#D97757]/35 active:scale-[0.98] overflow-hidden"
          >
            <span className="relative z-10 flex items-center gap-1.5 font-medium">
              <span>Bắt đầu ngay</span>
              <ArrowRight size={13} className="group-hover:translate-x-0.5 transition-transform" />
            </span>
            <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/25 to-transparent pointer-events-none" />
          </Link>
        </div>
      </header>

      {/* ── Main Hero Section ── */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-5 sm:px-8 py-16 sm:py-24 max-w-5xl mx-auto w-full text-center">
        {/* Announcement / Status Pill Badge */}
        <div className="mb-6 inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.1] backdrop-blur-md text-xs text-[#ECEBE4] shadow-sm hover:border-[#D97757]/40 transition-colors cursor-default animate-float">
          <span className="flex h-2 w-2 rounded-full bg-[#D97757] animate-pulse" />
          <span className="text-[#D97757] font-semibold">DungClaude AI</span>
          <span className="text-white/30">|</span>
          <span className="text-[#A6A49B]">Không gian làm việc thông minh thế hệ mới</span>
          <ChevronRight size={13} className="text-[#75736C]" />
        </div>

        {/* Elegant Hero Title */}
        <h1 className="text-4xl sm:text-6xl lg:text-7xl font-bold tracking-tight text-[#ECEBE4] leading-[1.12] max-w-3xl mx-auto">
          Trí tuệ nhân tạo{" "}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#D97757] via-[#F59E0B] to-[#ECEBE4]">
            đột phá
          </span>{" "}
          mọi giới hạn sáng tạo.
        </h1>

        {/* Hero Subtitle */}
        <p className="text-sm sm:text-lg text-[#A6A49B] mt-6 max-w-2xl mx-auto leading-relaxed font-normal">
          DungClaude là trợ lý AI cao cấp hỗ trợ lập trình, tư duy giải thuật, phân tích tài liệu sâu và sinh giao diện thời gian thực với độ chính xác vượt trội.
        </p>

        {/* Dual Hero Action Buttons */}
        <div className="mt-9 flex flex-wrap items-center justify-center gap-3.5 sm:gap-4 w-full max-w-md">
          <Link
            href="/signup"
            className="group relative flex-1 min-w-[200px] h-13 rounded-xl bg-gradient-to-r from-[#D97757] to-[#E2886A] text-white text-sm font-semibold transition-all inline-flex items-center justify-center gap-2 shadow-xl shadow-[#D97757]/25 hover:shadow-2xl hover:shadow-[#D97757]/40 active:scale-[0.98] overflow-hidden"
          >
            <span>Trải nghiệm DungClaude</span>
            <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
            <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none" />
          </Link>

          <Link
            href="/login"
            className="flex-1 min-w-[170px] h-13 rounded-xl bg-[#1D1C1A] hover:bg-[#262523] border border-white/[0.12] hover:border-white/[0.22] text-[#ECEBE4] text-sm font-medium transition-all inline-flex items-center justify-center gap-2.5 shadow-sm active:scale-[0.98]"
          >
            {/* Google SVG */}
            <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24">
              <path fill="#EA4335" d="M12 5c1.54 0 2.92.54 4.02 1.43l3.01-3.01C17.21 1.71 14.77 1 12 1 7.48 1 3.65 3.58 1.77 7.35l3.68 2.85C6.33 7.15 8.93 5 12 5z" />
              <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58l3.71 2.88c2.16-1.99 3.71-4.92 3.71-8.7z" />
              <path fill="#FBBC05" d="M5.45 14.8c-.24-.71-.38-1.47-.38-2.26s.14-1.55.38-2.26L1.77 7.43C.64 9.68 0 12.22 0 14.99s.64 5.31 1.77 7.56l3.68-2.87c0-.29.14-.59.14-.88z" />
              <path fill="#34A853" d="M12 23c3.24 0 5.95-1.08 7.93-2.91l-3.71-2.88c-1.07.72-2.45 1.16-4.22 1.16-3.07 0-5.67-2.15-6.55-5.2l-3.68 2.87C3.65 20.42 7.48 23 12 23z" />
            </svg>
            <span>Đăng nhập Google</span>
          </Link>
        </div>

        {/* ── Interactive Live Preview Showcase Card with Rotating Light Beam ── */}
        <div className="mt-14 w-full max-w-2xl text-left">
          <div className="relative group rounded-3xl p-[1px] overflow-hidden transition-all duration-300">
            {/* Rotating Conic Gradient Beam */}
            <div
              className="absolute -inset-[150%] animate-conic opacity-40 group-hover:opacity-90 transition-opacity duration-500 pointer-events-none"
              style={{
                background:
                  "conic-gradient(from 0deg at 50% 50%, transparent 0deg, #D97757 70deg, #F59E0B 110deg, transparent 170deg, transparent 360deg)",
              }}
            />

            <Link
              href="/app"
              className="relative block p-6 sm:p-7 rounded-[23px] bg-[#1A1918]/94 backdrop-blur-2xl border border-white/[0.08] group-hover:border-white/[0.18] transition-all shadow-2xl shadow-black/80 cursor-pointer"
            >
              {/* Card Header Bar */}
              <div className="flex items-center justify-between text-xs text-[#75736C] mb-4 pb-3 border-b border-white/[0.06]">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                  <span className="font-medium text-[#ECEBE4]">DungClaude Canvas v2.5</span>
                </div>
                <span className="group-hover:text-[#D97757] font-medium transition-colors inline-flex items-center gap-1">
                  Mở không gian làm việc →
                </span>
              </div>

              {/* Prompt Query Preview */}
              <div className="text-base sm:text-lg text-[#ECEBE4] font-medium leading-relaxed mb-4">
                &ldquo;Phân tích kiến trúc hệ thống và sinh mã nguồn component với hiệu ứng ánh sáng động...&rdquo;
              </div>

              {/* Interactive Pills */}
              <div className="flex flex-wrap items-center gap-2.5 pt-3 border-t border-white/[0.05] text-xs text-[#A6A49B]">
                <span className="px-3 py-1.5 rounded-xl bg-[#141312] border border-white/[0.08] hover:border-[#D97757]/40 transition-colors flex items-center gap-2">
                  <Code2 size={13} className="text-[#D97757]" />
                  <span>Full-Stack Artifacts</span>
                </span>
                <span className="px-3 py-1.5 rounded-xl bg-[#141312] border border-white/[0.08] hover:border-amber-400/40 transition-colors flex items-center gap-2">
                  <Zap size={13} className="text-amber-400" />
                  <span>Phản hồi tức thì</span>
                </span>
                <span className="px-3 py-1.5 rounded-xl bg-[#141312] border border-white/[0.08] hover:border-emerald-400/40 transition-colors flex items-center gap-2">
                  <ShieldCheck size={13} className="text-emerald-400" />
                  <span>Bảo mật dữ liệu</span>
                </span>
              </div>
            </Link>
          </div>
        </div>

        {/* ── 3 Enhanced Feature Pillars ── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-16 max-w-4xl w-full text-left pt-12 border-t border-white/[0.08]">
          {/* Pillar 1 */}
          <div className="group p-5 rounded-2xl bg-white/[0.02] border border-white/[0.06] hover:border-[#D97757]/40 hover:bg-white/[0.04] transition-all duration-300">
            <div className="h-10 w-10 rounded-xl bg-[#D97757]/15 border border-[#D97757]/30 flex items-center justify-center text-[#D97757] mb-4 group-hover:scale-110 transition-transform">
              <FileText size={18} />
            </div>
            <h3 className="text-sm font-semibold text-[#ECEBE4] mb-2">
              Soạn thảo & Sáng tạo
            </h3>
            <p className="text-xs text-[#A6A49B] leading-relaxed">
              Tạo lập văn bản, đề xuất và báo cáo với văn phong tự nhiên, sâu sắc và chuẩn mực kỹ thuật cao.
            </p>
          </div>

          {/* Pillar 2 */}
          <div className="group p-5 rounded-2xl bg-white/[0.02] border border-white/[0.06] hover:border-amber-500/40 hover:bg-white/[0.04] transition-all duration-300">
            <div className="h-10 w-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-4 group-hover:scale-110 transition-transform">
              <Cpu size={18} />
            </div>
            <h3 className="text-sm font-semibold text-[#ECEBE4] mb-2">
              Lập trình & Live Canvas
            </h3>
            <p className="text-xs text-[#A6A49B] leading-relaxed">
              Phân tích, gỡ lỗi và trực tiếp xem trước giao diện mã nguồn trên Live Canvas độc lập, đa ngôn ngữ.
            </p>
          </div>

          {/* Pillar 3 */}
          <div className="group p-5 rounded-2xl bg-white/[0.02] border border-white/[0.06] hover:border-indigo-400/40 hover:bg-white/[0.04] transition-all duration-300">
            <div className="h-10 w-10 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400 mb-4 group-hover:scale-110 transition-transform">
              <FolderKanban size={18} />
            </div>
            <h3 className="text-sm font-semibold text-[#ECEBE4] mb-2">
              Dự án & Tài liệu
            </h3>
            <p className="text-xs text-[#A6A49B] leading-relaxed">
              Đính kèm tệp tin tài liệu, đồng bộ dự án và cấu hình hệ thống chỉ dẫn thông minh cho từng tác vụ.
            </p>
          </div>
        </div>
      </main>

      {/* ── Minimalist Glassmorphic Footer ── */}
      <footer className="relative z-10 h-16 px-6 sm:px-12 border-t border-white/[0.07] flex items-center justify-between text-xs text-[#75736C] select-none bg-[#121110]/90 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <span>© {new Date().getFullYear()} DungClaude AI</span>
          <span>·</span>
          <span className="text-emerald-400 inline-flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Hệ thống ổn định
          </span>
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
