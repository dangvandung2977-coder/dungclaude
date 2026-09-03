"use client";
import React from "react";
import { cn } from "@/lib/utils";

export interface AuthButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  loadingText?: string;
}

export function AuthButton({
  children,
  loading = false,
  loadingText,
  disabled,
  className,
  ...props
}: AuthButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={cn(
        "relative w-full h-12 rounded-xl font-medium text-sm transition-all duration-150 select-none cursor-pointer flex items-center justify-center gap-2",
        "bg-[#ECEBE4] text-[#181716] shadow-md shadow-black/20 hover:bg-white hover:shadow-lg hover:shadow-black/30",
        "active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D97757]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#232220]",
        (disabled || loading) && "opacity-60 cursor-not-allowed hover:bg-[#ECEBE4] hover:shadow-md active:scale-100",
        className
      )}
    >
      {loading ? (
        <span className="inline-flex items-center gap-2.5 text-[#181716] font-medium">
          <svg
            className="animate-spin h-4 w-4 text-[#181716]"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="3.5"
            />
            <path
              className="opacity-85"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <span>{loadingText || "Đang xử lý..."}</span>
        </span>
      ) : (
        children
      )}
    </button>
  );
}
