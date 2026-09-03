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
    <div
      className={cn(
        "w-full max-w-[430px] rounded-2xl bg-[#232220] border border-white/[0.08] shadow-2xl shadow-black/70 p-6 sm:p-8 flex flex-col transition-all duration-200 animate-in fade-in zoom-in-[0.98]",
        className
      )}
    >
      {/* Brand Mark */}
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
      {footer && <div className="mt-6 pt-5 border-t border-white/[0.06] text-center">{footer}</div>}
    </div>
  );
}
