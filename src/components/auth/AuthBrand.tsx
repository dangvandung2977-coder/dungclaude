"use client";
import React from "react";
import Link from "next/link";
import { DungClaudeLogo } from "@/components/brand/DungClaudeLogo";
import { cn } from "@/lib/utils";

interface AuthBrandProps {
  className?: string;
}

export function AuthBrand({ className }: AuthBrandProps) {
  return (
    <div className={cn("flex flex-col items-center select-none", className)}>
      <Link
        href="/"
        className="group inline-flex items-center gap-3.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D97757]/50 rounded-2xl p-1 transition-all duration-300 active:scale-[0.98]"
        aria-label="Về trang chủ DungClaude"
      >
        {/* Pure SVG Brand Mark with dynamic glow */}
        <div className="relative flex items-center justify-center">
          <div className="group-hover:scale-105 transition-transform duration-300">
            <DungClaudeLogo size={46} showGlow />
          </div>
        </div>

        {/* Brand Typography */}
        <div className="flex flex-col text-left">
          <div className="flex items-center gap-2">
            <span className="text-[20px] font-semibold tracking-tight text-[#ECEBE4] group-hover:text-white transition-colors">
              DungClaude
            </span>
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase bg-gradient-to-r from-[#D97757]/30 to-amber-500/20 text-[#D97757] border border-[#D97757]/40 shadow-xs">
              AI PRO
            </span>
          </div>
          <span className="text-[11px] text-[#75736C] font-mono -mt-0.5 tracking-wide">
            Next-Gen Workspace
          </span>
        </div>
      </Link>
    </div>
  );
}
