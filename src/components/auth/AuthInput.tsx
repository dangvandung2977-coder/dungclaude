"use client";
import React, { useState, forwardRef } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AuthInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
  isPassword?: boolean;
}

export const AuthInput = forwardRef<HTMLInputElement, AuthInputProps>(function AuthInput(
  {
    label,
    error,
    hint,
    id,
    type = "text",
    className,
    isPassword = false,
    disabled,
    ...props
  },
  ref
) {
  const [showPassword, setShowPassword] = useState(false);
  const inputId = id || `auth-input-${label.toLowerCase().replace(/\s+/g, "-")}`;
  const effectiveType = isPassword ? (showPassword ? "text" : "password") : type;

  return (
    <div className="w-full space-y-1.5">
      <div className="flex items-center justify-between">
        <label
          htmlFor={inputId}
          className="text-xs font-medium text-[#A6A49B] tracking-wide select-none"
        >
          {label}
        </label>
        {hint && <span className="text-[11px] text-[#75736C]">{hint}</span>}
      </div>

      <div
        className={cn(
          "relative flex items-center rounded-xl bg-[#1A1918] border transition-all duration-200",
          error
            ? "border-rose-500/50 focus-within:border-rose-500 focus-within:ring-2 focus-within:ring-rose-500/20"
            : "border-white/[0.09] hover:border-white/[0.16] focus-within:border-[#D97757]/70 focus-within:ring-2 focus-within:ring-[#D97757]/20",
          disabled && "opacity-50 cursor-not-allowed bg-[#151413]"
        )}
      >
        <input
          {...props}
          ref={ref}
          id={inputId}
          type={effectiveType}
          disabled={disabled}
          className={cn(
            "w-full h-12 px-3.5 bg-transparent text-sm text-[#ECEBE4] placeholder:text-[#75736C] font-normal outline-none transition-colors",
            isPassword && "pr-11",
            className
          )}
        />

        {isPassword && (
          <button
            type="button"
            tabIndex={-1}
            disabled={disabled}
            aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-3 p-1 rounded-lg text-[#75736C] hover:text-[#ECEBE4] hover:bg-white/[0.06] transition-colors cursor-pointer focus:outline-none focus:text-[#ECEBE4]"
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        )}
      </div>

      {error && (
        <p className="text-[11px] font-medium text-rose-400 mt-1 animate-in fade-in duration-150">
          {error}
        </p>
      )}
    </div>
  );
});
