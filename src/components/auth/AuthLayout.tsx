"use client";
import React, { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface AuthLayoutProps {
  children: React.ReactNode;
  className?: string;
}

export function AuthLayout({ children, className }: AuthLayoutProps) {
  const [mousePos, setMousePos] = useState({ x: 50, y: 35 });

  useEffect(() => {
    function handleMouseMove(e: MouseEvent) {
      // Calculate percentage across viewport for smooth hardware-accelerated radial spotlight
      const x = Math.round((e.clientX / window.innerWidth) * 100);
      const y = Math.round((e.clientY / window.innerHeight) * 100);
      setMousePos({ x, y });
    }
    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  return (
    <div
      className={cn(
        "relative min-h-dvh w-full flex flex-col items-center justify-center p-4 sm:p-6 bg-[#141312] text-[#ECEBE4] overflow-hidden select-none",
        className
      )}
    >
      {/* Dynamic Layered Atmospheric Visual Effects */}
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden"
        aria-hidden="true"
      >
        {/* 1. Interactive Mouse Spotlight Glow */}
        <div
          className="absolute inset-0 transition-opacity duration-700 pointer-events-none"
          style={{
            background: `radial-gradient(700px circle at ${mousePos.x}% ${mousePos.y}%, rgba(217, 119, 87, 0.12) 0%, rgba(245, 158, 11, 0.03) 35%, transparent 70%)`,
          }}
        />

        {/* 2. Deep Rotating Nebula / Aurora Glow */}
        <div
          className="absolute top-1/2 left-1/2 w-[700px] sm:w-[900px] h-[550px] sm:h-[700px] rounded-full blur-[140px] opacity-45 pointer-events-none animate-aurora"
          style={{
            background:
              "radial-gradient(circle, rgba(217, 119, 87, 0.2) 0%, rgba(245, 158, 11, 0.08) 35%, rgba(67, 56, 202, 0.06) 65%, transparent 80%)",
          }}
        />

        {/* 3. Secondary Warm Ambient Center Ring */}
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[450px] sm:w-[550px] h-[450px] sm:h-[550px] rounded-full blur-[100px] opacity-35 pointer-events-none"
          style={{
            background:
              "radial-gradient(circle, rgba(217, 119, 87, 0.25) 0%, rgba(217, 119, 87, 0.05) 50%, transparent 75%)",
          }}
        />

        {/* 4. Fine Spatial Dot Matrix Pattern */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "radial-gradient(rgba(255, 255, 255, 0.8) 1.2px, transparent 1.2px)",
            backgroundSize: "28px 28px",
          }}
        />

        {/* 5. Vignette Shadow Rim */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_20%,rgba(10,9,8,0.75)_100%)]" />
      </div>

      {/* Main Centered Content */}
      <main className="relative z-10 w-full flex items-center justify-center my-auto py-4">
        {children}
      </main>

      {/* Subtle Legal & Status Footer */}
      <footer className="relative z-10 mt-auto pt-4 pb-2 text-center text-[11px] text-[#75736C] flex items-center gap-3">
        <span>© {new Date().getFullYear()} DungClaude</span>
        <span>·</span>
        <span className="inline-flex items-center gap-1.5 text-[#A6A49B]">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Hệ thống hoạt động bình thường
        </span>
      </footer>
    </div>
  );
}
