"use client";
import React, { useEffect, useRef, useState } from "react";
import { ChevronDown, Check, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AIModel } from "@/types";

interface ModelSelectorProps {
  models: AIModel[];
  modelId: string;
  onSelect: (modelId: string) => void;
  compact?: boolean;
}

export function ModelSelector({ models, modelId, onSelect, compact = false }: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  const safeModels = Array.isArray(models) ? models : [];
  const visibleModels = safeModels.filter((m) => m && m.enabled && typeof m.id === "string" && !m.id.startsWith("demo:"));
  const currentModel = visibleModels.find((m) => m.id === modelId) || visibleModels[0];

  function getDisplayLabel() {
    if (currentModel?.name) return currentModel.name;
    return "Chọn Model";
  }

  return (
    <div className="relative inline-block select-none" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Chọn Model"
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full text-xs font-medium transition-all cursor-pointer",
          compact
            ? "px-2.5 py-1 text-[#A6A49B] hover:text-[#ECEBE4] hover:bg-white/[0.06]"
            : "px-3 py-1.5 bg-[#2A2826] hover:bg-[#343230] text-[#ECEBE4] border border-white/[0.08]"
        )}
      >
        <Sparkles size={12} className="text-amber-400" />
        <span className="truncate max-w-[140px] font-medium">{getDisplayLabel()}</span>
        <ChevronDown size={11} className={cn("text-[#75736C] transition-transform duration-150", open && "rotate-180")} />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute right-0 bottom-full mb-2 z-50 w-72 p-1.5 rounded-2xl bg-[#262523] border border-white/10 shadow-2xl shadow-black/80 overflow-hidden animate-in fade-in zoom-in-95 duration-100 text-xs"
        >
          <div className="px-3 py-1.5 text-[11px] font-semibold text-[#75736C] border-b border-white/[0.06] mb-1 flex items-center justify-between">
            <span>Model khả dụng</span>
            <span className="text-[10px] text-amber-400 font-mono">{visibleModels.length} models</span>
          </div>

          <div className="max-h-64 overflow-y-auto thin-scroll space-y-1">
            {visibleModels.length === 0 ? (
              <div className="p-3 text-center text-[#75736C] text-xs">
                Chưa có model nào được bật. Vào Admin để cấu hình.
              </div>
            ) : (
              visibleModels.map((m) => {
                const selected = m.id === currentModel?.id || m.id === modelId;
                return (
                  <button
                    key={m.id}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => {
                      onSelect(m.id);
                      setOpen(false);
                    }}
                    className={cn(
                      "w-full text-left p-2 rounded-xl transition-colors cursor-pointer flex items-center justify-between gap-2",
                      selected
                        ? "bg-[#1F1E1D] text-[#ECEBE4] font-medium"
                        : "hover:bg-white/[0.04] text-[#A6A49B] hover:text-[#ECEBE4]"
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="font-semibold text-[#ECEBE4] truncate">{m.name}</p>
                        <span className="text-[9px] text-amber-400 font-mono bg-amber-400/10 px-1.5 py-0.5 rounded">
                          {m.provider === "custom" ? "Custom" : m.provider}
                        </span>
                      </div>
                      {m.description ? (
                        <p className="text-[11px] text-[#ECEBE4]/90 truncate mt-0.5 flex items-center gap-1 font-sans">
                          <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-[#D97757]/15 text-[#D97757] border border-[#D97757]/20 shrink-0">
                            Ghi chú
                          </span>
                          <span className="truncate">{m.description}</span>
                        </p>
                      ) : (
                        <p className="text-[11px] text-[#75736C] truncate mt-0.5">
                          {Math.round(m.contextWindow / 1000)}k context · {m.capabilities.join(", ")}
                        </p>
                      )}
                    </div>
                    {selected && <Check size={14} className="text-amber-400 shrink-0" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
