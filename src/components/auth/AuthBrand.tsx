"use client";
import React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface AuthBrandProps {
  className?: string;
}

export function AuthBrand({ className }: AuthBrandProps) {
  return (
    <div className={cn("flex flex-col items-center select-none", className)}>
      <Link
        href="/"
        className="group inline-flex items-center gap-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D97757]/50 rounded-xl transition-all duration-200 active:scale-[0.98]"
        aria-label="Về trang chủ DungClaude"
      >
        {/* Brand Mark with subtle layered ambient glow */}
        <div className="relative flex items-center justify-center">
          <div className="absolute -inset-1 rounded-2xl bg-gradient-to-tr from-[#D97757]/30 to-amber-500/10 blur-sm opacity-60 group-hover:opacity-100 transition-opacity duration-300" />
          <div className="relative h-10 w-10 rounded-xl bg-gradient-to-b from-[#2E2C29] to-[#201F1E] border border-white/[0.12] shadow-lg shadow-black/40 flex items-center justify-center transition-all duration-200 group-hover:border-[#D97757]/50 group-hover:shadow-[#D97757]/15">
            <span className="font-serif font-bold text-base text-[#ECEBE4] tracking-tight group-hover:text-white transition-colors">
              D
            </span>
            <div className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-[#D97757] ring-2 ring-[#201F1E]" />
          </div>
        </div>

        {/* Brand Text */}
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5">
            <span className="text-[17px] font-semibold tracking-tight text-[#ECEBE4] group-hover:text-white transition-colors">
              DungClaude
            </span>
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium tracking-wide uppercase bg-[#D97757]/15 text-[#D97757] border border-[#D97757]/30">
              AI
            </span>
          </div>
        </div>
      </Link>
    </div>
  );
}
