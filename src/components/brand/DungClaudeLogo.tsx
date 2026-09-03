import React from "react";
import { cn } from "@/lib/utils";

interface DungClaudeLogoProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
  className?: string;
  showGlow?: boolean;
}

export function DungClaudeLogo({
  size = 36,
  className,
  showGlow = false,
  ...props
}: DungClaudeLogoProps) {
  return (
    <div
      className={cn("relative inline-flex items-center justify-center select-none", className)}
      style={{ width: size, height: size }}
    >
      {showGlow && (
        <div
          className="absolute -inset-1.5 rounded-full blur-md opacity-70 pointer-events-none"
          style={{
            background:
              "radial-gradient(circle, rgba(217,119,87,0.5) 0%, rgba(245,158,11,0.2) 40%, transparent 70%)",
          }}
        />
      )}

      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="relative z-10 overflow-visible"
        aria-label="DungClaude Logo"
        {...props}
      >
        <defs>
          {/* Gradients */}
          <linearGradient id="dc-terracotta" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFA685" />
            <stop offset="50%" stopColor="#D97757" />
            <stop offset="100%" stopColor="#B34F30" />
          </linearGradient>

          <linearGradient id="dc-amber" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FDE68A" />
            <stop offset="50%" stopColor="#F59E0B" />
            <stop offset="100%" stopColor="#D97706" />
          </linearGradient>

          <linearGradient id="dc-metal-dark" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#383633" />
            <stop offset="50%" stopColor="#252422" />
            <stop offset="100%" stopColor="#181716" />
          </linearGradient>

          <linearGradient id="dc-metal-rim" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="rgba(255, 255, 255, 0.35)" />
            <stop offset="50%" stopColor="rgba(255, 255, 255, 0.08)" />
            <stop offset="100%" stopColor="rgba(255, 255, 255, 0.02)" />
          </linearGradient>

          <filter id="dc-glow-filter" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Outer Background Squircle Plate */}
        <rect
          x="4"
          y="4"
          width="92"
          height="92"
          rx="24"
          fill="url(#dc-metal-dark)"
          stroke="url(#dc-metal-rim)"
          strokeWidth="1.5"
        />

        {/* Ambient Neon Accent Contour */}
        <rect
          x="5"
          y="5"
          width="90"
          height="90"
          rx="23"
          fill="none"
          stroke="url(#dc-terracotta)"
          strokeWidth="0.75"
          strokeOpacity="0.4"
        />

        {/* ── Left Monogram 'D' Structure ── */}
        {/* Main Stem & Arch of 'D' */}
        <path
          d="M20 22 C20 19.8 21.8 18 24 18 H44 C61.7 18 76 32.3 76 50 C76 67.7 61.7 82 44 82 H24 C21.8 82 20 80.2 20 78 V22 Z"
          fill="none"
          stroke="url(#dc-metal-rim)"
          strokeWidth="1.5"
        />
        <path
          d="M22 24 H44 C58.4 24 70 35.6 70 50 C70 64.4 58.4 76 44 76 H22 V24 Z"
          fill="none"
          stroke="rgba(255, 255, 255, 0.06)"
          strokeWidth="8"
          strokeLinecap="round"
        />
        <path
          d="M22 24 H43 C57.4 24 69 35.6 69 50 C69 64.4 57.4 76 43 76 H22 V24 Z"
          fill="none"
          stroke="url(#dc-terracotta)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeOpacity="0.85"
        />

        {/* Inner Counter cutout outline */}
        <path
          d="M33 34 H43 C51.8 34 59 41.2 59 50 C59 58.8 51.8 66 43 66 H33 V34 Z"
          fill="#141312"
          stroke="rgba(255, 255, 255, 0.08)"
          strokeWidth="1"
        />

        {/* ── Radiant 8-Point Cosmic Starburst (Claude Fusion) ── */}
        {/* Core Starburst Center at (57, 50) */}
        <g transform="translate(57, 50)" filter="url(#dc-glow-filter)">
          {/* North Ray */}
          <polygon points="0,0 -4,-8 0,-34 4,-8" fill="url(#dc-terracotta)" />
          <polygon points="0,0 0,-34 4,-8" fill="url(#dc-amber)" opacity="0.9" />

          {/* South Ray */}
          <polygon points="0,0 -4,8 0,34 4,8" fill="url(#dc-terracotta)" />
          <polygon points="0,0 0,34 -4,8" fill="#B34F30" />

          {/* East Ray */}
          <polygon points="0,0 8,-4 34,0 8,4" fill="url(#dc-terracotta)" />
          <polygon points="0,0 34,0 8,-4" fill="url(#dc-amber)" />

          {/* West Ray */}
          <polygon points="0,0 -8,-4 -34,0 -8,4" fill="url(#dc-terracotta)" />
          <polygon points="0,0 -34,0 -8,4" fill="#B34F30" />

          {/* North-East Ray */}
          <polygon points="0,0 3,-7 22,-22 7,-3" fill="url(#dc-amber)" />
          <polygon points="0,0 22,-22 3,-7" fill="#FFA685" />

          {/* South-West Ray */}
          <polygon points="0,0 -3,7 -22,22 -7,3" fill="#B34F30" />
          <polygon points="0,0 -22,22 -3,7" fill="url(#dc-terracotta)" />

          {/* North-West Ray */}
          <polygon points="0,0 -7,-3 -22,-22 -3,-7" fill="url(#dc-terracotta)" />
          <polygon points="0,0 -22,-22 -3,-7" fill="#FFA685" />

          {/* South-East Ray */}
          <polygon points="0,0 7,3 22,22 3,7" fill="url(#dc-amber)" />
          <polygon points="0,0 22,22 7,3" fill="#B34F30" />

          {/* Central Luminous Core Nucleus */}
          <circle cx="0" cy="0" r="4.5" fill="#FFF8F0" />
          <circle cx="0" cy="0" r="2.5" fill="url(#dc-amber)" />
        </g>
      </svg>
    </div>
  );
}
