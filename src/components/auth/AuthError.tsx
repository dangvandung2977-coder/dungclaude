"use client";
import React from "react";
import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface AuthErrorProps {
  message?: string | null;
  className?: string;
}

export function AuthError({ message, className }: AuthErrorProps) {
  if (!message) return null;

  return (
    <div
      role="alert"
      aria-live="polite"
      className={cn(
        "flex items-start gap-2.5 p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-300 text-xs leading-relaxed animate-in fade-in slide-in-from-top-1 duration-150",
        className
      )}
    >
      <AlertCircle size={15} className="text-rose-400 shrink-0 mt-0.5" aria-hidden="true" />
      <span className="flex-1 font-medium">{message}</span>
    </div>
  );
}
