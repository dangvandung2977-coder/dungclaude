"use client";
import React from "react";
import { AuthBrand } from "./AuthBrand";
import { cn } from "@/lib/utils";

interface AuthCardProps {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

export function AuthCard({
  title,
  subtitle,
  children,
  footer,
  className,
}: AuthCardProps) {
  return (
    <div className="relative group w-full max-w-[436px] transition-all duration-300">
      {/* Outer subtle luminous back-glow */}
      <div className="absolute -inset-1 rounded-[24px] bg-gradient-to-b from-[#D97757]/20 via-[#F59E0B]/10 to-transparent blur-xl opacity-50 group-hover:opacity-85 transition-opacity duration-500 pointer-events-none" />

      {/* Rotating Conic Gradient Border Frame */}
      <div className="relative rounded-[22px] p-[1px] overflow-hidden">
        {/* Animated continuous gradient sweep */}
        <div
          className="absolute -inset-[150%] animate-conic opacity-40 group-hover:opacity-90 transition-opacity duration-500 pointer-events-none"
          style={{
            background:
              "conic-gradient(from 0deg at 50% 50%, transparent 0deg, #D97757 70deg, #F59E0B 100deg, transparent 150deg, transparent 360deg)",
          }}
        />

        {/* Static subtle inner border fallback */}
        <div className="absolute inset-0 rounded-[22px] border border-white/[0.09] pointer-events-none" />

        {/* Card Content Shell */}
        <div
          className={cn(
            "relative w-full rounded-[21px] bg-[#1C1B1A]/92 backdrop-blur-2xl p-6 sm:p-8 flex flex-col shadow-2xl shadow-black/90",
            className
          )}
        >
          {/* Brand Mark with custom logo */}
          <AuthBrand className="mb-6" />

          {/* Page Header */}
          <div className="text-center mb-6">
            <h1 className="text-xl sm:text-[22px] font-semibold tracking-tight text-[#ECEBE4] leading-snug">
              {title}
            </h1>
            <p className="text-xs sm:text-[13px] text-[#A6A49B] mt-1.5 leading-relaxed">
              {subtitle}
            </p>
          </div>

          {/* Form Content */}
          <div className="flex-1 flex flex-col">{children}</div>

          {/* Optional Footer Navigation */}
          {footer && (
            <div className="mt-6 pt-5 border-t border-white/[0.07] text-center">
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
