"use client";

import React, { useId } from "react";
import { cn } from "@/lib/utils";

export type CircularLoaderSize = "xs" | "sm" | "md" | "lg" | "xl";
export type CircularLoaderVariant = "brand" | "emerald" | "amber" | "aurora";

interface CircularLoaderProps {
  size?: CircularLoaderSize;
  variant?: CircularLoaderVariant;
  className?: string;
  label?: string;
  showAura?: boolean;
}

const SIZE_MAP: Record<CircularLoaderSize, { px: number; stroke: number; innerPx: number }> = {
  xs: { px: 14, stroke: 2, innerPx: 3 },
  sm: { px: 18, stroke: 2.2, innerPx: 4 },
  md: { px: 24, stroke: 2.6, innerPx: 6 },
  lg: { px: 32, stroke: 3, innerPx: 8 },
  xl: { px: 44, stroke: 3.5, innerPx: 10 },
};

const VARIANT_MAP: Record<
  CircularLoaderVariant,
  {
    start: string;
    mid: string;
    end: string;
    glow: string;
    auraBg: string;
    coreColor: string;
    track: string;
  }
> = {
  brand: {
    start: "#D97757",
    mid: "#E2886A",
    end: "#F5C2A8",
    glow: "rgba(217, 119, 87, 0.45)",
    auraBg: "rgba(217, 119, 87, 0.25)",
    coreColor: "#D97757",
    track: "rgba(217, 119, 87, 0.15)",
  },
  emerald: {
    start: "#059669",
    mid: "#10B981",
    end: "#6EE7B7",
    glow: "rgba(16, 185, 129, 0.5)",
    auraBg: "rgba(16, 185, 129, 0.22)",
    coreColor: "#34D399",
    track: "rgba(16, 185, 129, 0.15)",
  },
  amber: {
    start: "#D97706",
    mid: "#F59E0B",
    end: "#FDE68A",
    glow: "rgba(245, 158, 11, 0.5)",
    auraBg: "rgba(245, 158, 11, 0.22)",
    coreColor: "#FBBF24",
    track: "rgba(245, 158, 11, 0.15)",
  },
  aurora: {
    start: "#EC4899",
    mid: "#8B5CF6",
    end: "#38BDF8",
    glow: "rgba(139, 92, 246, 0.5)",
    auraBg: "rgba(139, 92, 246, 0.22)",
    coreColor: "#A78BFA",
    track: "rgba(139, 92, 246, 0.15)",
  },
};

export function CircularLoader({
  size = "md",
  variant = "brand",
  className,
  label = "Đang xử lý…",
  showAura = true,
}: CircularLoaderProps) {
  const rawId = useId();
  const gradId = `cl_grad_${rawId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const glowFilterId = `cl_glow_${rawId.replace(/[^a-zA-Z0-9_-]/g, "")}`;

  const { px, stroke, innerPx } = SIZE_MAP[size] || SIZE_MAP.md;
  const v = VARIANT_MAP[variant] || VARIANT_MAP.brand;

  const radius = (px - stroke * 2) / 2;
  const center = px / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <div
      role="status"
      aria-label={label}
      className={cn(
        "relative inline-flex items-center justify-center select-none shrink-0 transition-all",
        className
      )}
      style={{ width: px, height: px }}
    >
      {/* Soft Breathing Ambient Glow Aura */}
      {showAura && (
        <div
          className="absolute inset-0 rounded-full blur-[5px] pointer-events-none animate-glow-breathe"
          style={{ backgroundColor: v.auraBg }}
        />
      )}

      {/* Main Spinning SVG Ring */}
      <svg
        width={px}
        height={px}
        viewBox={`0 0 ${px} ${px}`}
        className="animate-orbital-spin overflow-visible relative z-10"
        style={{ filter: `drop-shadow(0 0 4px ${v.glow})` }}
      >
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={v.start} stopOpacity="0.15" />
            <stop offset="50%" stopColor={v.mid} stopOpacity="0.75" />
            <stop offset="100%" stopColor={v.end} stopOpacity="1" />
          </linearGradient>
          <filter id={glowFilterId} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="0.8" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Subtle Background Track */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={v.track}
          strokeWidth={stroke}
          className="opacity-70"
        />

        {/* Dynamic Elastic Rotating Arc */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * 0.3}
          className="animate-orbital-dash origin-center"
        />
      </svg>

      {/* Counter-orbital Inner Micro-dots for sm, md, lg, xl */}
      {px >= 18 && (
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none z-20 animate-counter-spin"
        >
          <div
            className="rounded-full shadow-xs"
            style={{
              width: innerPx,
              height: innerPx,
              backgroundColor: v.coreColor,
              opacity: 0.85,
              transform: `translateY(-${Math.max(2, radius * 0.4)}px)`,
            }}
          />
        </div>
      )}

      {/* Central Breathing Core Dot for md, lg, xl */}
      {px >= 24 && (
        <div
          className="absolute rounded-full pointer-events-none z-10 animate-pulse"
          style={{
            width: Math.max(3, innerPx * 0.7),
            height: Math.max(3, innerPx * 0.7),
            backgroundColor: v.coreColor,
            opacity: 0.6,
            boxShadow: `0 0 6px ${v.glow}`,
          }}
        />
      )}
    </div>
  );
}
