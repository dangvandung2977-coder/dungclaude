"use client";

import React, { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { CircularLoader } from "@/components/ui/CircularLoader";

interface ThinkingIndicatorProps {
  label?: string;
  className?: string;
}

export function ThinkingIndicator({
  label = "Claude đang suy nghĩ…",
  className,
}: ThinkingIndicatorProps) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div
      className={cn(
        "flex items-center gap-2.5 py-1.5 px-3 rounded-full bg-[#262523]/80 border border-white/[0.08] backdrop-blur-md shadow-lg w-fit select-none animate-in fade-in duration-200 ring-1 ring-white/[0.03]",
        className
      )}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      {/* Premium Circular Orbital Loader */}
      <CircularLoader size="sm" variant="brand" showAura />

      {/* Shimmering Dynamic Text */}
      <span className="animate-text-shimmer font-serif italic text-xs sm:text-sm tracking-wide font-normal">
        {label}
      </span>


      {/* Neural Wave Bars */}
      <div className="flex items-center gap-0.5 h-3.5 px-1 opacity-75">
        <span className="w-0.5 bg-[#D97757] rounded-full animate-wave-1" />
        <span className="w-0.5 bg-[#E2886A] rounded-full animate-wave-2" />
        <span className="w-0.5 bg-[#D97757] rounded-full animate-wave-3" />
      </div>

      {/* Real-time Elapsed Seconds Pill */}
      {seconds > 0 && (
        <span className="text-[10px] font-mono text-[#75736C] px-1.5 py-0.5 rounded bg-white/[0.04]">
          {seconds}s
        </span>
      )}
    </div>
  );
}
