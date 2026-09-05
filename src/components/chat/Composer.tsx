"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Plus,
  ArrowUp,
  Square,
  Mic,
  X,
  Film,
  FileText,
  Brain,
  Zap,
  Sparkles,
  Flame,
  ChevronDown,
  Check,
  Palette,
} from "lucide-react";
import { ModelSelector } from "./ModelSelector";
import { CircularLoader } from "@/components/ui/CircularLoader";
import { cn, formatBytes } from "@/lib/utils";
import type { AIModel, ReasoningEffort } from "@/types";
import { isReasoningModel, getDefaultReasoningEffort, REASONING_EFFORT_OPTIONS } from "@/lib/ai/reasoning";

export interface PendingFile {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
  kind: string;
}

interface ComposerProps {
  onSend: (text: string, files: PendingFile[], opts: { webSearch: boolean; tools: boolean; reasoningEffort?: ReasoningEffort }) => void;
  onStop: () => void;
  streaming: boolean;
  models: AIModel[];
  modelId: string;
  setModelId: (v: string) => void;
  reasoningEffort?: ReasoningEffort;
  setReasoningEffort?: (v: ReasoningEffort) => void;
  disabled?: boolean;
  variant?: "center" | "bottom";
  systemPrompt?: string;
  onOpenSystemPromptModal?: () => void;
}

export function Composer({
  onSend,
  onStop,
  streaming,
  models,
  modelId,
  setModelId,
  reasoningEffort: reasoningEffortProp,
  setReasoningEffort: setReasoningEffortProp,
  disabled = false,
  variant = "bottom",
}: ComposerProps) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [mode, setMode] = useState<"chat" | "cowork">("chat");

  const activeModelObj = models.find((m) => m.id === modelId);
  const isReasoning = isReasoningModel(modelId, activeModelObj?.capabilities);
  const [internalEffort, setInternalEffort] = useState<ReasoningEffort>(() => getDefaultReasoningEffort(modelId));
  const activeEffort = reasoningEffortProp ?? internalEffort;

  const updateEffort = useCallback(
    (eff: ReasoningEffort) => {
      if (setReasoningEffortProp) {
        setReasoningEffortProp(eff);
      } else {
        setInternalEffort(eff);
      }
    },
    [setReasoningEffortProp]
  );

  const [showEffortMenu, setShowEffortMenu] = useState(false);
  const effortMenuRef = useRef<HTMLDivElement>(null);

  // Auto-adjust reasoning effort whenever model changes if not externally managed
  useEffect(() => {
    if (!reasoningEffortProp) {
      setInternalEffort(getDefaultReasoningEffort(modelId));
    }
  }, [modelId, reasoningEffortProp]);

  // Click outside to close effort menu
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (effortMenuRef.current && !effortMenuRef.current.contains(e.target as Node)) {
        setShowEffortMenu(false);
      }
    }
    if (showEffortMenu) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showEffortMenu]);

  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, variant === "center" ? 220 : 160)}px`;
  }, [text, variant]);

  // Draft persistence
  useEffect(() => {
    try {
      const key = `claude:draft:${modelId}`;
      const saved = sessionStorage.getItem(key);
      if (saved) setText(saved);
    } catch {
      // Ignore security/quota errors
    }
  }, [modelId]);

  useEffect(() => {
    try {
      sessionStorage.setItem(`claude:draft:${modelId}`, text);
    } catch {
      // Ignore security/quota errors
    }
  }, [text, modelId]);

  // Handle external text insertion (e.g. auto-filling generated prompt or clicking "Use Prompt")
  useEffect(() => {
    const handleSetText = (e: Event) => {
      const custom = e as CustomEvent<{
        text: string;
        mode?: "replace" | "append";
        focus?: boolean;
        onlyIfEmpty?: boolean;
      }>;
      const detail = custom.detail;
      if (!detail || typeof detail.text !== "string") return;

      setText((prev) => {
        if (detail.onlyIfEmpty && prev.trim().length > 0) {
          // Do not overwrite user's in-progress typing
          return prev;
        }
        if (detail.mode === "append" && prev.trim().length > 0) {
          return `${prev}\n\n${detail.text}`;
        }
        return detail.text;
      });

      if (detail.focus !== false) {
        requestAnimationFrame(() => {
          if (taRef.current) {
            taRef.current.focus();
            const len = taRef.current.value.length;
            taRef.current.setSelectionRange(len, len);
            taRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
          }
        });
      }
    };

    window.addEventListener("composer:set-text", handleSetText);
    return () => window.removeEventListener("composer:set-text", handleSetText);
  }, []);

  const lastPickRef = useRef<{ time: number; sig: string }>({ time: 0, sig: "" });

  async function pickFiles(list: FileList | File[] | null) {
    if (!list) return;
    const rawItems = Array.isArray(list) ? list : Array.from(list);
    if (!rawItems.length) return;

    // Deduplicate items in the input list and against files currently in state
    const seen = new Set<string>();
    files.forEach((f) => seen.add(`${f.fileName}-${f.sizeBytes}`));

    const items = rawItems.filter((f) => {
      const key = `${f.name}-${f.size}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    if (items.length === 0) return;

    // Debounce rapid duplicate invocations (e.g. concurrent events)
    const currentSig = items.map((f) => `${f.name}-${f.size}`).sort().join("|");
    const now = Date.now();
    if (now - lastPickRef.current.time < 1000 && lastPickRef.current.sig === currentSig) {
      return;
    }
    lastPickRef.current = { time: now, sig: currentSig };

    setUploading(true);
    try {
      const fd = new FormData();
      items.slice(0, 8).forEach((f) => fd.append("files", f));
      const r = await fetch("/api/files/upload", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Upload lỗi");
      setFiles((prev) => {
        const existingIds = new Set(prev.map((f) => f.id));
        const existingSigs = new Set(prev.map((f) => `${f.fileName}-${f.sizeBytes}`));
        const newFiles = (j.files ?? []).filter(
          (f: PendingFile) => !existingIds.has(f.id) && !existingSigs.has(`${f.fileName}-${f.sizeBytes}`)
        );
        return [...prev, ...newFiles];
      });
    } catch (e) {
      alert(e instanceof Error ? e.message : "Upload lỗi");
    } finally {
      setUploading(false);
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    const clipboardData = e.clipboardData;
    if (!clipboardData) return;

    const pastedFiles: File[] = [];
    const seenSigs = new Set<string>();

    // 1. Check clipboardData.files (files copied from filesystem or browser)
    if (clipboardData.files && clipboardData.files.length > 0) {
      for (let i = 0; i < clipboardData.files.length; i++) {
        const file = clipboardData.files[i];
        if (file.type.startsWith("image/") || file.type.startsWith("video/") || file.name.match(/\.(png|jpe?g|gif|webp|bmp|svg|pdf)$/i)) {
          const sig = `${file.name}-${file.size}`;
          if (!seenSigs.has(sig)) {
            seenSigs.add(sig);
            pastedFiles.push(file);
          }
        }
      }
    } else if (clipboardData.items && clipboardData.items.length > 0) {
      // 2. Fallback to clipboardData.items ONLY if files was empty (vital for screenshots, e.g. Snipping Tool)
      for (let i = 0; i < clipboardData.items.length; i++) {
        const item = clipboardData.items[i];
        if (item.type.startsWith("image/")) {
          const blob = item.getAsFile();
          if (blob) {
            const ext = item.type.split("/")[1]?.replace("jpeg", "jpg") || "png";
            const file = new File([blob], `pasted-image-${Date.now()}.${ext}`, { type: item.type });
            const sig = `${file.size}`;
            if (!seenSigs.has(sig)) {
              seenSigs.add(sig);
              pastedFiles.push(file);
            }
            break; // Stop after first screenshot blob to avoid duplicate item representations
          }
        }
      }
    }

    if (pastedFiles.length > 0) {
      e.preventDefault();
      e.stopPropagation();
      void pickFiles(pastedFiles);
    }
  }

  const isSubmittingRef = useRef(false);

  function handleSend() {
    if (streaming || uploading || disabled || isSubmittingRef.current) return;
    if (!text.trim() && !files.length) return;

    isSubmittingRef.current = true;
    try {
      const trimmed = text.trim();
      const effectiveText = trimmed || (files.some((f) => f.kind === "image") ? "Hãy phân tích và mô tả chi tiết nội dung bức ảnh này." : "Hãy đọc và tóm tắt nội dung tệp tin này.");
      onSend(effectiveText, files, {
        webSearch: mode === "cowork",
        tools: mode === "cowork" || files.length > 0,
        reasoningEffort: isReasoning ? activeEffort : undefined,
      });
      setText("");
      setFiles([]);
      sessionStorage.removeItem(`claude:draft:${modelId}`);
      if (taRef.current) {
        taRef.current.style.height = "auto";
      }
    } finally {
      setTimeout(() => {
        isSubmittingRef.current = false;
      }, 250);
    }
  }

  const canSend = (text.trim().length > 0 || files.length > 0) && !uploading && !disabled;

  return (
    <div
      className={cn(
        "w-full transition-all duration-150",
        variant === "center" ? "max-w-2xl mx-auto" : "max-w-4xl mx-auto px-4 pb-4"
      )}
    >
      {/* File attachment preview shelf */}
      {(files.length > 0 || uploading) && (
        <div className="flex flex-wrap gap-2 mb-2 p-1 max-h-36 overflow-y-auto thin-scroll">
          {files.map((f) => (
            <div
              key={f.id}
              className="flex items-center gap-2 pl-2 pr-2.5 py-1.5 text-xs bg-[#262523] border border-white/10 rounded-lg shadow-xs animate-in fade-in zoom-in-95 duration-100"
            >
              {f.kind === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={f.url}
                  alt={f.fileName}
                  className="h-8 w-8 rounded-md object-cover border border-white/10"
                />
              ) : (
                <span className="h-8 w-8 rounded-md bg-white/5 border border-white/10 flex items-center justify-center text-[#A6A49B]">
                  {f.kind === "video" ? <Film size={14} /> : <FileText size={14} />}
                </span>
              )}
              <div className="min-w-0 max-w-[130px]">
                <p className="font-medium truncate text-[#ECEBE4]">{f.fileName}</p>
                <p className="text-[10px] text-[#75736C] font-mono">{formatBytes(f.sizeBytes)}</p>
              </div>
              <button
                type="button"
                aria-label="Xóa tệp đính kèm"
                onClick={() => setFiles((prev) => prev.filter((x) => x.id !== f.id))}
                className="p-1 rounded-md text-[#75736C] hover:text-[#ECEBE4] hover:bg-white/10 transition-colors cursor-pointer ml-1"
              >
                <X size={12} />
              </button>
            </div>
          ))}
          {uploading && (
            <div className="flex items-center gap-2 px-3 py-1.5 text-xs bg-[#262523] border border-[#D97757]/30 rounded-lg text-[#ECEBE4] shadow-xs">
              <CircularLoader size="xs" variant="brand" showAura={false} />
              <span className="text-[#D97757] font-medium">Đang tải ảnh...</span>
            </div>
          )}
        </div>
      )}

      {/* Claude Style Input Box */}
      <div
        onPaste={handlePaste}
        className={cn(
          "rounded-3xl bg-[#262523] border border-white/[0.08] shadow-2xl transition-all duration-150 relative",
          "focus-within:border-white/20 focus-within:ring-1 focus-within:ring-white/10"
        )}
      >
        <textarea
          ref={taRef}
          rows={variant === "center" ? 2 : 1}
          value={text}
          disabled={disabled}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="How can I help you today? (Dán ảnh trực tiếp Ctrl+V)"
          aria-label="Hỏi Claude"
          className={cn(
            "w-full bg-transparent outline-none px-5 pt-4 pb-2 text-sm leading-relaxed resize-none text-[#ECEBE4] placeholder:text-[#75736C] font-sans",
            variant === "center" ? "min-h-[72px]" : "min-h-[46px]"
          )}
          onDrop={(e) => {
            e.preventDefault();
            pickFiles(e.dataTransfer.files);
          }}
          onDragOver={(e) => e.preventDefault()}
        />

        {/* Bottom Toolbar inside Claude Input Box */}
        <div className="flex items-center justify-between px-3 pb-3 pt-1">
          {/* Left Controls: (+) Attachment & [Chat | Cowork] Segmented Pill */}
          <div className="flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              multiple
              className="hidden"
              accept="image/*,video/mp4,video/webm,.pdf,.txt,.md,.json,.ts,.tsx,.js,.py"
              onChange={(e) => {
                pickFiles(e.target.files);
                e.target.value = "";
              }}
            />

            {/* + Attachment Button */}
            <button
              type="button"
              aria-label="Đính kèm tệp"
              title="Thêm file hoặc ảnh"
              onClick={() => fileRef.current?.click()}
              className="h-8 w-8 rounded-full text-[#A6A49B] hover:text-[#ECEBE4] hover:bg-white/[0.06] flex items-center justify-center transition-colors cursor-pointer"
            >
              <Plus size={18} />
            </button>

            {/* [ Chat | Cowork ] Segmented Pill Toggle */}
            <div className="flex items-center p-0.5 rounded-full bg-[#1F1E1D] border border-white/[0.06] text-xs">
              <button
                type="button"
                onClick={() => setMode("chat")}
                className={cn(
                  "px-3 py-1 rounded-full font-medium transition-colors cursor-pointer",
                  mode === "chat"
                    ? "bg-[#2E2C29] text-[#ECEBE4] shadow-xs"
                    : "text-[#75736C] hover:text-[#ECEBE4]"
                )}
              >
                Chat
              </button>
              <button
                type="button"
                onClick={() => setMode("cowork")}
                className={cn(
                  "px-3 py-1 rounded-full font-medium transition-colors cursor-pointer",
                  mode === "cowork"
                    ? "bg-[#2E2C29] text-[#ECEBE4] shadow-xs"
                    : "text-[#75736C] hover:text-[#ECEBE4]"
                )}
              >
                Cowork
              </button>
            </div>

            {/* Quick Tạo ảnh button */}
            <button
              type="button"
              onClick={() => {
                if (!text.trim()) {
                  setText("Vẽ cho tôi: ");
                } else if (!/^(?:vẽ|tạo ảnh|sinh ảnh|draw)/i.test(text.trim())) {
                  setText(`Vẽ cho tôi: ${text.trim()}`);
                }
                taRef.current?.focus();
              }}
              title="Yêu cầu AI vẽ / tạo hình ảnh trực tiếp trong cuộc trò chuyện"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 transition-all cursor-pointer select-none"
            >
              <Palette size={12} className="text-rose-400" />
              <span>Tạo ảnh</span>
            </button>

            {/* Reasoning Effort Pill Toggle */}
            {isReasoning && (
              <div className="relative" ref={effortMenuRef}>
                <button
                  type="button"
                  onClick={() => setShowEffortMenu(!showEffortMenu)}
                  title="Mức độ suy luận (Reasoning Effort)"
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all cursor-pointer select-none",
                    activeEffort === "max"
                      ? "bg-rose-950/40 text-rose-300 border-rose-500/30 hover:bg-rose-900/50 hover:border-rose-500/50"
                      : activeEffort === "high"
                      ? "bg-purple-950/40 text-purple-300 border-purple-500/30 hover:bg-purple-900/50 hover:border-purple-500/50"
                      : activeEffort === "medium"
                      ? "bg-amber-950/40 text-amber-300 border-amber-500/30 hover:bg-amber-900/50 hover:border-amber-500/50"
                      : "bg-blue-950/40 text-blue-300 border-blue-500/30 hover:bg-blue-900/50 hover:border-blue-500/50"
                  )}
                >
                  {activeEffort === "max" ? (
                    <Flame size={12} className="text-rose-400" />
                  ) : activeEffort === "high" ? (
                    <Sparkles size={12} className="text-purple-400" />
                  ) : activeEffort === "medium" ? (
                    <Brain size={12} className="text-amber-400" />
                  ) : (
                    <Zap size={12} className="text-blue-400" />
                  )}
                  <span>
                    {activeEffort === "max"
                      ? "Effort: Max"
                      : activeEffort === "high"
                      ? "Effort: Cao"
                      : activeEffort === "medium"
                      ? "Effort: Vừa"
                      : "Effort: Thấp"}
                  </span>
                  <ChevronDown
                    size={10}
                    className={cn(
                      "transition-transform duration-150 text-white/50",
                      showEffortMenu && "rotate-180"
                    )}
                  />
                </button>

                {showEffortMenu && (
                  <div className="absolute left-0 bottom-full mb-2 z-50 w-60 p-1.5 rounded-2xl bg-[#262523] border border-white/10 shadow-2xl shadow-black/80 animate-in fade-in zoom-in-95 duration-100 text-xs">
                    <div className="px-3 py-1.5 text-[10px] font-semibold text-[#75736C] uppercase tracking-wider border-b border-white/[0.06] mb-1 flex items-center justify-between">
                      <span>Mức độ suy luận</span>
                      {modelId.toLowerCase().includes("glm-5.3-free") && (
                        <span className="text-[10px] text-purple-400 font-mono">GLM 5.3</span>
                      )}
                    </div>
                    <div className="space-y-0.5">
                      {REASONING_EFFORT_OPTIONS.map((opt) => {
                        const isSelected = activeEffort === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => {
                              updateEffort(opt.id);
                              setShowEffortMenu(false);
                            }}
                            className={cn(
                              "w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-left transition-colors cursor-pointer",
                              isSelected
                                ? "bg-white/10 text-[#ECEBE4]"
                                : "text-[#A6A49B] hover:bg-white/[0.06] hover:text-[#ECEBE4]"
                            )}
                          >
                            <div>
                              <div
                                className={cn(
                                  "font-medium flex items-center gap-1.5",
                                  opt.id === "max"
                                    ? "text-rose-300"
                                    : opt.id === "high"
                                    ? "text-purple-300"
                                    : opt.id === "medium"
                                    ? "text-amber-300"
                                    : "text-blue-300"
                                )}
                              >
                                {opt.id === "max" ? (
                                  <Flame size={12} />
                                ) : opt.id === "high" ? (
                                  <Sparkles size={12} />
                                ) : opt.id === "medium" ? (
                                  <Brain size={12} />
                                ) : (
                                  <Zap size={12} />
                                )}
                                <span>{opt.label}</span>
                              </div>
                              <div className="text-[10px] text-[#75736C]">{opt.description}</div>
                            </div>
                            {isSelected && (
                              <Check
                                size={12}
                                className={cn(
                                  "shrink-0 ml-1.5",
                                  opt.id === "max"
                                    ? "text-rose-400"
                                    : opt.id === "high"
                                    ? "text-purple-400"
                                    : opt.id === "medium"
                                    ? "text-amber-400"
                                    : "text-blue-400"
                                )}
                              />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Controls: Model Pill, Mic, and Send/Stop */}
          <div className="flex items-center gap-1.5">
            {/* Model Selector Pill (e.g. Sonnet 3.7 / Sonnet 5 Max) */}
            <ModelSelector
              models={models}
              modelId={modelId}
              onSelect={setModelId}
              compact
            />

            {/* Microphone Icon Button */}
            <button
              type="button"
              aria-label="Nhập bằng giọng nói"
              title="Nhập bằng giọng nói"
              className="p-1.5 rounded-full text-[#75736C] hover:text-[#ECEBE4] hover:bg-white/[0.06] transition-colors cursor-pointer"
            >
              <Mic size={15} />
            </button>

            {/* Send or Stop button */}
            {streaming ? (
              <button
                type="button"
                aria-label="Dừng"
                title="Dừng"
                onClick={onStop}
                className="h-8 w-8 rounded-full bg-[#ECEBE4] text-[#1F1E1D] hover:opacity-90 flex items-center justify-center transition-opacity cursor-pointer shadow-xs ml-1"
              >
                <Square size={11} fill="currentColor" />
              </button>
            ) : canSend ? (
              <button
                type="button"
                aria-label="Gửi"
                title="Gửi (Enter)"
                onClick={handleSend}
                className="h-8 w-8 rounded-full bg-[#ECEBE4] text-[#1F1E1D] hover:opacity-90 flex items-center justify-center transition-all cursor-pointer shadow-xs ml-1 active:scale-95"
              >
                <ArrowUp size={15} strokeWidth={2.5} />
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
