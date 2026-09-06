"use client";

import React, { useState } from "react";
import { HelpCircle, Check, ArrowRight, Send, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface ClarifyOption {
  id?: string;
  label: string;
  description?: string;
}

interface ClarifyData {
  question: string;
  options: ClarifyOption[];
  allowCustom?: boolean;
  customPlaceholder?: string;
}

interface ClarificationCardProps {
  raw: string;
  streaming?: boolean;
}

/**
 * Safely parses the clarification payload even during streaming / partial JSON.
 */
function parseClarifyData(raw: string): ClarifyData | null {
  if (!raw || !raw.trim()) return null;

  // Try standard JSON parse first
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.question === "string" && Array.isArray(parsed.options)) {
      return parsed as ClarifyData;
    }
  } catch {
    // If mid-stream, fallback to regex extraction
    try {
      const qMatch = /"question"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/.exec(raw);
      if (qMatch) {
        const question = qMatch[1].replace(/\\"/g, '"');
        const options: ClarifyOption[] = [];
        const optRegex = /"label"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"(?:\s*,\s*"description"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)")?/g;
        let match;
        while ((match = optRegex.exec(raw)) !== null) {
          options.push({
            label: match[1].replace(/\\"/g, '"'),
            description: match[2] ? match[2].replace(/\\"/g, '"') : undefined,
          });
        }
        if (question && options.length > 0) {
          return { question, options, allowCustom: true };
        }
      }
    } catch {}
  }

  return null;
}

export function ClarificationCard({ raw, streaming = false }: ClarificationCardProps) {
  const data = parseClarifyData(raw);
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const [customText, setCustomText] = useState("");
  const [hasSubmitted, setHasSubmitted] = useState(false);

  // If streaming and JSON isn't partially parsed yet, show a subtle loading skeleton
  if (!data) {
    if (streaming) {
      return (
        <div className="my-3 p-4 rounded-2xl bg-[#1C1B18]/90 border border-white/10 shadow-lg animate-pulse flex items-center gap-3">
          <div className="h-8 w-8 rounded-xl bg-[#D97757]/20 flex items-center justify-center text-[#D97757]">
            <HelpCircle size={18} />
          </div>
          <div className="flex-1 space-y-1.5">
            <div className="w-1/2 h-3.5 bg-white/10 rounded-full" />
            <div className="w-1/3 h-2.5 bg-white/5 rounded-full" />
          </div>
        </div>
      );
    }
    // Fallback: if totally unparseable and finished, render raw pre
    return (
      <pre className="my-2 p-3 text-xs bg-black/40 rounded-xl text-neutral-400 overflow-x-auto">
        {raw}
      </pre>
    );
  }

  const { question, options, allowCustom = true, customPlaceholder } = data;

  const handleSelectOption = (opt: ClarifyOption) => {
    if (hasSubmitted || streaming) return;
    setSelectedLabel(opt.label);
    setHasSubmitted(true);

    const messageText = `Tôi chọn: "${opt.label}"${opt.description ? ` (${opt.description})` : ""}. Hãy tiếp tục thực hiện theo hướng này.`;
    window.dispatchEvent(
      new CustomEvent("composer:send-direct", {
        detail: { text: messageText },
      })
    );
  };

  const handleCustomSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = customText.trim();
    if (!trimmed || hasSubmitted || streaming) return;

    setSelectedLabel(trimmed);
    setHasSubmitted(true);

    const messageText = `Về câu hỏi "${question}": ${trimmed}. Hãy tiếp tục thực hiện theo hướng này.`;
    window.dispatchEvent(
      new CustomEvent("composer:send-direct", {
        detail: { text: messageText },
      })
    );
  };

  return (
    <div className="my-4 rounded-2xl bg-[#1A1917] border border-[#D97757]/40 p-4 sm:p-5 shadow-xl space-y-3.5 select-none transition-all animate-in fade-in duration-200">
      {/* Header Tag */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-[#D97757]/20 border border-[#D97757]/40 flex items-center justify-center text-[#D97757]">
            <Sparkles size={14} />
          </div>
          <span className="text-xs font-bold uppercase tracking-wider text-[#E2886A]">
            Làm rõ yêu cầu của bạn
          </span>
        </div>
        {hasSubmitted ? (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            <Check size={12} />
            <span>Đã gửi lựa chọn</span>
          </span>
        ) : (
          <span className="text-[11px] text-[#75736C]">
            Chọn 1 ý có sẵn hoặc tự giải thích
          </span>
        )}
      </div>

      {/* The Core Question */}
      <div className="text-sm sm:text-base font-semibold text-[#ECEBE4] leading-relaxed">
        {question}
      </div>

      {/* Selectable Options Grid/List */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {options.map((opt, idx) => {
          const isSelected = selectedLabel === opt.label;
          return (
            <button
              key={idx}
              type="button"
              disabled={hasSubmitted || streaming}
              onClick={() => handleSelectOption(opt)}
              className={cn(
                "p-3 rounded-xl border text-left transition-all flex items-start gap-2.5 group cursor-pointer",
                isSelected
                  ? "bg-[#D97757]/20 border-[#D97757] text-[#ECEBE4] shadow-sm"
                  : hasSubmitted
                  ? "bg-black/20 border-white/5 opacity-50 cursor-not-allowed"
                  : "bg-black/30 border-white/10 hover:border-[#D97757]/60 hover:bg-[#D97757]/10 active:scale-[0.99]"
              )}
            >
              <div
                className={cn(
                  "h-5 w-5 rounded-md flex items-center justify-center text-[11px] font-bold shrink-0 mt-0.5 border transition-colors",
                  isSelected
                    ? "bg-[#D97757] text-white border-[#D97757]"
                    : "bg-white/5 border-white/10 text-[#A6A49B] group-hover:border-[#D97757] group-hover:text-[#D97757]"
                )}
              >
                {isSelected ? <Check size={11} /> : String.fromCharCode(65 + idx)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs sm:text-sm font-semibold text-[#ECEBE4] group-hover:text-white transition-colors">
                  {opt.label}
                </div>
                {opt.description && (
                  <p className="text-[11px] text-[#A6A49B] mt-0.5 leading-snug">
                    {opt.description}
                  </p>
                )}
              </div>
              {!hasSubmitted && (
                <ArrowRight
                  size={14}
                  className="text-[#75736C] opacity-0 group-hover:opacity-100 group-hover:text-[#D97757] group-hover:translate-x-0.5 transition-all shrink-0 mt-1"
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Custom Explanation Input Field */}
      {allowCustom && !hasSubmitted && (
        <form onSubmit={handleCustomSubmit} className="pt-2 border-t border-white/[0.06] flex gap-2">
          <input
            type="text"
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            disabled={hasSubmitted || streaming}
            placeholder={customPlaceholder || "Hoặc tự giải thích chi tiết theo ý bạn vào đây..."}
            className="flex-1 bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs sm:text-sm text-[#ECEBE4] placeholder-[#75736C] outline-none focus:border-[#D97757]/60 transition-colors"
          />
          <button
            type="submit"
            disabled={!customText.trim() || hasSubmitted || streaming}
            className={cn(
              "px-3.5 py-2 rounded-xl text-xs font-bold text-white flex items-center gap-1.5 transition-all shrink-0 cursor-pointer",
              !customText.trim() || hasSubmitted || streaming
                ? "bg-white/5 text-neutral-500 cursor-not-allowed border border-white/5"
                : "bg-[#D97757] hover:bg-[#E2886A] shadow-md active:scale-95"
            )}
          >
            <span>Gửi</span>
            <Send size={12} />
          </button>
        </form>
      )}

      {/* Success feedback after answering */}
      {hasSubmitted && (
        <div className="pt-2 border-t border-white/[0.06] text-xs text-emerald-400 flex items-center gap-1.5 font-medium">
          <Check size={13} />
          <span>Lựa chọn: <strong>&ldquo;{selectedLabel}&rdquo;</strong>. AI đang xử lý tiếp yêu cầu của bạn…</span>
        </div>
      )}
    </div>
  );
}
