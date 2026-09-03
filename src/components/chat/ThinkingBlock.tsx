"use client";

import React, { useState } from "react";
import { Brain, ChevronDown, ChevronRight, Sparkles, Copy, Check } from "lucide-react";
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
    <div className="my-2.5 rounded-xl border border-white/[0.08] bg-[#1c1b1a]/80 overflow-hidden transition-all text-xs">
      {/* Header bar — compact, clickable toggle */}
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="w-full flex items-center justify-between px-3.5 py-2 text-left hover:bg-white/[0.03] transition-colors cursor-pointer group"
        aria-expanded={expanded}
        aria-label="Thu gọn hoặc mở rộng quá trình suy nghĩ"
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-5 w-5 rounded-md bg-[#D97757]/15 border border-[#D97757]/30 flex items-center justify-center shrink-0">
            {isThinking ? (
              <Sparkles size={11} className="text-[#D97757] animate-pulse" />
            ) : (
              <Brain size={11} className="text-[#D97757]" />
            )}
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <span className={cn(
              "font-medium transition-colors text-xs",
              isThinking ? "text-[#ECEBE4]" : "text-[#A6A49B] group-hover:text-[#ECEBE4]"
            )}>
              {isThinking ? "Đang suy nghĩ…" : "Quá trình suy nghĩ"}
            </span>
            {!isThinking && count > 0 && (
              <span className="text-[11px] text-[#75736C]">
                ({count} từ)
              </span>
            )}
            {isThinking && (
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#D97757] animate-pulse" />
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 text-[#75736C] group-hover:text-[#A6A49B] shrink-0 text-[11px]">
          <span>{expanded ? "Thu gọn" : "Xem chi tiết"}</span>
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </div>
      </button>

      {/* Expanded thoughts body */}
      {expanded && (
        <div className="border-t border-white/[0.06] bg-black/20 px-3.5 py-3">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/[0.04]">
            <span className="text-[10px] uppercase font-mono tracking-wider text-[#75736C]">
              Suy luận chi tiết
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
                className="inline-flex items-center gap-1 text-[11px] text-[#A6A49B] hover:text-[#ECEBE4] transition-colors cursor-pointer"
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
          <div className="max-h-80 overflow-y-auto thin-scroll text-xs text-[#A6A49B] leading-relaxed whitespace-pre-wrap font-mono select-text pr-1">
            {thinking || (isThinking ? "Đang hình thành chuỗi suy luận…" : "")}
          </div>
        </div>
      )}
    </div>
  );
});
