"use client";
import React from "react";
import { cn } from "@/lib/utils";

interface AuthLayoutProps {
  children: React.ReactNode;
  className?: string;
}

export function AuthLayout({ children, className }: AuthLayoutProps) {
  return (
    <div
      className={cn(
        "relative min-h-dvh w-full flex flex-col items-center justify-center p-4 sm:p-6 bg-[#181716] text-[#ECEBE4] overflow-hidden select-none",
        className
      )}
    >
      {/* Subtle Atmospheric Lighting / Ambient Background Glow */}
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden"
        aria-hidden="true"
      >
        {/* Soft Central Warm Glow */}
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] sm:w-[800px] h-[500px] sm:h-[600px] rounded-full opacity-40 blur-[120px] pointer-events-none"
          style={{
            background:
              "radial-gradient(circle, rgba(217, 119, 87, 0.12) 0%, rgba(217, 119, 87, 0.03) 45%, transparent 70%)",
          }}
        />

        {/* Faint Dark Vignette overlay */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(10,10,9,0.5)_100%)]" />

        {/* Subtle grid pattern / noise dots (almost invisible, 2% opacity) */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "radial-gradient(rgba(255, 255, 255, 0.7) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }}
        />
      </div>

      {/* Main Centered Content */}
      <main className="relative z-10 w-full flex items-center justify-center my-auto">
        {children}
      </main>

      {/* Subtle Legal & Status Footer */}
      <footer className="relative z-10 mt-6 pb-2 text-center text-[11px] text-[#75736C] flex items-center gap-3">
        <span>© {new Date().getFullYear()} DungClaude</span>
        <span>·</span>
        <span className="inline-flex items-center gap-1 text-[#A6A49B]">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          Hệ thống hoạt động bình thường
        </span>
      </footer>
    </div>
  );
}
