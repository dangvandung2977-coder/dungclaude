"use client";
import React from "react";
import { cn } from "@/lib/utils";

interface AuthDividerProps {
  label?: string;
  className?: string;
}

export function AuthDivider({ label = "hoặc", className }: AuthDividerProps) {
  return (
    <div className={cn("relative my-4 flex items-center justify-center", className)}>
      <div className="absolute inset-0 flex items-center" aria-hidden="true">
        <div className="w-full border-t border-white/[0.08]" />
      </div>
      <div className="relative flex justify-center text-[11px] uppercase tracking-wider">
        <span className="bg-[#232220] px-3 font-medium text-[#75736C]">
          {label}
        </span>
      </div>
    </div>
  );
}
