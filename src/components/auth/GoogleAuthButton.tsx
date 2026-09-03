"use client";
import React, { useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

interface GoogleAuthButtonProps {
  onError?: (msg: string) => void;
  disabled?: boolean;
  className?: string;
  nextUrl?: string;
}

export function GoogleAuthButton({
  onError,
  disabled = false,
  className,
  nextUrl = "/app",
}: GoogleAuthButtonProps) {
  const [loading, setLoading] = useState(false);

  async function handleGoogleSignIn() {
    if (loading || disabled) return;
    setLoading(true);

    try {
      const supabase = createBrowserSupabaseClient();
      const origin = window.location.origin;
      const callbackUrl = `${origin}/auth/callback?next=${encodeURIComponent(nextUrl)}`;

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: callbackUrl,
          queryParams: {
            access_type: "offline",
            prompt: "consent",
          },
        },
      });

      if (error) {
        throw error;
      }

      // If Supabase returned an OAuth URL and did not auto-redirect
      if (data?.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      console.error("[Google Auth Error]:", err);
      const errorMessage =
        err instanceof Error
          ? err.message
          : "Không thể kết nối với dịch vụ Google. Vui lòng thử lại.";
      onError?.(errorMessage);
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleGoogleSignIn}
      disabled={disabled || loading}
      aria-label="Tiếp tục với Google"
      className={cn(
        "group relative w-full h-12 rounded-xl font-medium text-sm select-none cursor-pointer flex items-center justify-center gap-3 transition-all duration-200 overflow-hidden",
        "bg-[#181716] text-[#ECEBE4] border border-white/[0.1] hover:bg-[#242321] hover:border-white/[0.22]",
        "active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D97757]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#1C1B1A]",
        "shadow-xs hover:shadow-lg hover:shadow-black/50",
        (disabled || loading) && "opacity-60 cursor-not-allowed hover:bg-[#181716] active:scale-100",
        className
      )}
    >
      {loading ? (
        <span className="inline-flex items-center gap-2.5 text-[#ECEBE4]">
          <svg
            className="animate-spin h-4 w-4 text-[#D97757]"
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
              className="opacity-90"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <span className="font-normal text-xs sm:text-sm text-[#A6A49B]">
            Đang kết nối với Google...
          </span>
        </span>
      ) : (
        <>
          {/* Authentic Google "G" Vector Icon */}
          <svg
            className="h-4 w-4 shrink-0"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              fill="#EA4335"
              d="M12 5c1.54 0 2.92.54 4.02 1.43l3.01-3.01C17.21 1.71 14.77 1 12 1 7.48 1 3.65 3.58 1.77 7.35l3.68 2.85C6.33 7.15 8.93 5 12 5z"
            />
            <path
              fill="#4285F4"
              d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58l3.71 2.88c2.16-1.99 3.71-4.92 3.71-8.7z"
            />
            <path
              fill="#FBBC05"
              d="M5.45 14.8c-.24-.71-.38-1.47-.38-2.26s.14-1.55.38-2.26L1.77 7.43C.64 9.68 0 12.22 0 14.99s.64 5.31 1.77 7.56l3.68-2.87c0-.29.14-.59.14-.88z"
            />
            <path
              fill="#34A853"
              d="M12 23c3.24 0 5.95-1.08 7.93-2.91l-3.71-2.88c-1.07.72-2.45 1.16-4.22 1.16-3.07 0-5.67-2.15-6.55-5.2l-3.68 2.87C3.65 20.42 7.48 23 12 23z"
            />
          </svg>
          <span className="text-[#ECEBE4]">Tiếp tục với Google</span>
        </>
      )}
    </button>
  );
}
