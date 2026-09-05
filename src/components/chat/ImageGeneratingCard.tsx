"use client";

import React, { useEffect, useState } from "react";
import { Sparkles, Palette, Wand2 } from "lucide-react";
import { CircularLoader } from "@/components/ui/CircularLoader";

interface ImageGeneratingCardProps {
  prompt?: string;
}

const GENERATION_STEPS = [
  "Đang phác thảo bố cục & cấu trúc ảnh…",
  "Đang hòa trộn sắc màu & ánh sáng điện ảnh…",
  "Đang tinh chỉnh độ chi tiết & kết xuất 4K Ultra HD…",
  "Đang hoàn thiện tác phẩm nghệ thuật…",
];

export function ImageGeneratingCard({ prompt }: ImageGeneratingCardProps) {
  const [seconds, setSeconds] = useState(0);
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const stepTimer = setInterval(() => {
      setStepIndex((idx) => (idx + 1) % GENERATION_STEPS.length);
    }, 3200);
    return () => clearInterval(stepTimer);
  }, []);

  const displayPrompt = prompt ? prompt.replace(/^(?:vẽ|tạo ảnh|về|với|là)\s+/i, "").trim() : "";

  return (
    <div className="relative rounded-2xl overflow-hidden border border-[#D97757]/30 bg-[#161514] shadow-2xl max-w-xl w-full my-3 animate-in fade-in zoom-in-95 duration-300 select-none">
      {/* Canvas Viewport */}
      <div className="relative aspect-video min-h-[220px] max-h-[340px] flex flex-col items-center justify-center p-6 text-center overflow-hidden">
        {/* Ambient Cosmic Background & Radial Glow */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#D97757]/15 via-[#231E1C]/60 to-[#121110]" />
        
        {/* Animated Scanning Shimmer Beam */}
        <div className="absolute inset-0 opacity-25 bg-[linear-gradient(90deg,transparent_0%,rgba(217,119,87,0.3)_50%,transparent_100%)] animate-scan-slow pointer-events-none" />

        {/* Floating Particles / Ambient Orbs */}
        <div className="absolute top-1/4 left-1/4 w-32 h-32 bg-[#D97757]/20 rounded-full blur-2xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-36 h-36 bg-amber-600/15 rounded-full blur-2xl animate-pulse delay-700" />

        {/* Center Animated Loader & Glowing Orbit */}
        <div className="relative z-10 flex flex-col items-center gap-3">
          <div className="relative flex items-center justify-center">
            {/* Spinning Aura Ring */}
            <div className="absolute -inset-3 rounded-full border border-[#D97757]/40 border-dashed animate-spin-slow" />
            <div className="relative h-14 w-14 rounded-2xl bg-[#262422] border border-[#D97757]/50 shadow-[0_0_24px_rgba(217,119,87,0.35)] flex items-center justify-center text-[#E2886A]">
              <Palette className="h-7 w-7 text-[#D97757] animate-bounce-subtle" />
            </div>
            <div className="absolute -bottom-1 -right-1 p-1 rounded-full bg-[#161514] border border-[#D97757]/40 shadow-xs text-amber-400">
              <Sparkles size={12} className="animate-spin-slow" />
            </div>
          </div>

          {/* Shimmering Dynamic Step Heading */}
          <div className="flex items-center gap-2 mt-1">
            <CircularLoader size="xs" variant="brand" showAura={false} />
            <h4 className="text-sm sm:text-base font-semibold text-[#ECEBE4] tracking-wide animate-pulse">
              {GENERATION_STEPS[stepIndex]}
            </h4>
          </div>

          {/* User Prompt Callout */}
          {displayPrompt && (
            <p className="max-w-md text-xs sm:text-sm text-[#A6A49B] italic line-clamp-2 px-4 py-1 rounded-lg bg-black/40 border border-white/5 backdrop-blur-sm mt-0.5">
              “{displayPrompt}”
            </p>
          )}
        </div>

        {/* Top Floating Badge */}
        <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/70 backdrop-blur-md border border-[#D97757]/30 text-[11px] font-medium text-[#ECEBE4]">
          <Wand2 size={11} className="text-[#D97757]" />
          <span>AI Image Engine</span>
        </div>

        {/* Top Right Timer */}
        <div className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/70 backdrop-blur-md border border-white/10 text-[11px] font-mono text-[#A6A49B]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#D97757] animate-ping" />
          <span>{seconds}s</span>
        </div>
      </div>

      {/* Progress Shimmer Bar at the bottom */}
      <div className="h-1 w-full bg-white/[0.06] overflow-hidden">
        <div className="h-full bg-gradient-to-r from-[#D97757] via-[#F3A78D] to-[#D97757] animate-indeterminate-shimmer" />
      </div>

      {/* Subtext info bar */}
      <div className="px-4 py-2 bg-[#1C1B1A] border-t border-white/[0.06] flex items-center justify-between text-[11px] text-[#75736C]">
        <div className="flex items-center gap-1.5">
          <Sparkles size={11} className="text-[#D97757]" />
          <span>Tự động kết xuất tranh nghệ thuật trực tiếp trong chat</span>
        </div>
        <span className="font-mono">1024×1024</span>
      </div>
    </div>
  );
}
