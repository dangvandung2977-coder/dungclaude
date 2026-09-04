"use client";

import React, { useState } from "react";
import { Brain, ChevronDown, Copy, Check } from "lucide-react";
import { cn, copyText } from "@/lib/utils";

interface ThinkingBlockProps {
  thinking: string;
  isThinking?: boolean;
  wordCount?: number;
}

export const ThinkingBlock = React.memo(function ThinkingBlock({
  thinking,
  isThinking = false,
  wordCount = 0,
}: ThinkingBlockProps) {
  // Default is COLLAPSED ("dấu đi") to keep chat clean and elegant
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!thinking && !isThinking) return null;

  const count = wordCount || (thinking ? thinking.split(/\s+/).filter(Boolean).length : 0);

  return (
    <div className="mb-2 select-none">
      {/* Subtle, minimal inline trigger (Claude-like) */}
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs text-[#8E8B82] hover:text-[#ECEBE4] hover:bg-white/[0.04] transition-all cursor-pointer group"
        aria-expanded={expanded}
        aria-label="Thu gọn hoặc mở rộng quá trình suy nghĩ"
      >
        <Brain
          size={13}
          className={cn("text-[#D97757]", isThinking && "animate-pulse")}
        />
        <span className="font-medium">
          {isThinking ? "Đang suy nghĩ…" : `Đã suy nghĩ (${count} từ)`}
        </span>
        {isThinking && (
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#D97757] animate-pulse" />
        )}
        <ChevronDown
          size={12}
          className={cn(
            "text-[#75736C] group-hover:text-[#A6A49B] transition-transform duration-200",
            expanded ? "rotate-180" : ""
          )}
        />
      </button>

      {/* Expanded reasoning body: subtle indented block with left accent line */}
      {expanded && (
        <div className="mt-2 ml-1 pl-3.5 border-l-2 border-[#D97757]/30 py-1 text-xs text-[#8E8B82] leading-relaxed select-text animate-in fade-in duration-150">
          <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-white/[0.04] text-[11px] text-[#75736C]">
            <span className="font-mono text-[10px] uppercase tracking-wider text-[#A6A49B]/70">
              Quá trình suy luận
            </span>
            {thinking && (
              <button
                type="button"
                onClick={async (e) => {
                  e.stopPropagation();
                  if (await copyText(thinking)) {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }
                }}
                className="inline-flex items-center gap-1 text-[11px] text-[#75736C] hover:text-[#ECEBE4] transition-colors cursor-pointer"
                title="Sao chép suy nghĩ"
              >
                {copied ? (
                  <>
                    <Check size={11} className="text-emerald-400" />
                    <span className="text-emerald-400">Đã chép</span>
                  </>
                ) : (
                  <>
                    <Copy size={11} />
                    <span>Sao chép</span>
                  </>
                )}
              </button>
            )}
          </div>
          <div className="max-h-72 overflow-y-auto thin-scroll text-xs text-[#A6A49B]/90 leading-relaxed whitespace-pre-wrap font-mono pr-2">
            {thinking || (isThinking ? "Đang hình thành chuỗi suy luận…" : "")}
          </div>
        </div>
      )}
    </div>
  );
});
