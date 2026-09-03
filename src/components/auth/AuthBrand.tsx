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
        className="group inline-flex items-center gap-3.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D97757]/50 rounded-2xl p-1 transition-all duration-300 active:scale-[0.98]"
        aria-label="Về trang chủ DungClaude"
      >
        {/* Brand Mark with glowing ambient halo */}
        <div className="relative flex items-center justify-center">
          {/* Animated pulsing glow backdrop */}
          <div className="absolute -inset-2 rounded-2xl bg-gradient-to-tr from-[#D97757]/45 via-amber-500/20 to-transparent blur-md opacity-60 group-hover:opacity-100 group-hover:scale-110 transition-all duration-300" />

          {/* Logo container */}
          <div className="relative h-12 w-12 rounded-xl overflow-hidden border border-white/[0.18] shadow-2xl shadow-black/80 bg-[#181716] flex items-center justify-center transition-all duration-300 group-hover:scale-105 group-hover:border-[#D97757]/70">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/dungclaude-logo.jpg"
              alt="DungClaude Logo"
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
            />
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
