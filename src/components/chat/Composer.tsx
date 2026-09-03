"use client";
import React, { useEffect, useRef, useState } from "react";
import {
  Plus,
  ArrowUp,
  Square,
  Mic,
  X,
  Film,
  FileText,
} from "lucide-react";
import { ModelSelector } from "./ModelSelector";
import { cn, formatBytes } from "@/lib/utils";
import type { AIModel } from "@/types";

export interface PendingFile {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
  kind: string;
}

interface ComposerProps {
  onSend: (text: string, files: PendingFile[], opts: { webSearch: boolean; tools: boolean }) => void;
  onStop: () => void;
  streaming: boolean;
  models: AIModel[];
  modelId: string;
  setModelId: (v: string) => void;
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
  disabled = false,
  variant = "bottom",
}: ComposerProps) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [mode, setMode] = useState<"chat" | "cowork">("chat");
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

  async function pickFiles(list: FileList | File[] | null) {
    if (!list) return;
    const items = Array.isArray(list) ? list : Array.from(list);
    if (!items.length) return;
    setUploading(true);
    try {
      const fd = new FormData();
      items.slice(0, 8).forEach((f) => fd.append("files", f));
      const r = await fetch("/api/files/upload", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Upload lỗi");
      setFiles((prev) => [...prev, ...j.files]);
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

    // 1. Check clipboardData.files (files copied from filesystem or browser)
    if (clipboardData.files && clipboardData.files.length > 0) {
      for (let i = 0; i < clipboardData.files.length; i++) {
        const file = clipboardData.files[i];
        if (file.type.startsWith("image/") || file.type.startsWith("video/") || file.name.match(/\.(png|jpe?g|gif|webp|bmp|svg|pdf)$/i)) {
          pastedFiles.push(file);
        }
      }
    }

    // 2. Check clipboardData.items (vital for screenshots, e.g. Snipping Tool, PrintScreen)
    if (clipboardData.items && clipboardData.items.length > 0) {
      for (let i = 0; i < clipboardData.items.length; i++) {
        const item = clipboardData.items[i];
        if (item.type.startsWith("image/")) {
          const blob = item.getAsFile();
          if (blob && !pastedFiles.some((f) => f.size === blob.size)) {
            const ext = item.type.split("/")[1]?.replace("jpeg", "jpg") || "png";
            const file = new File([blob], `pasted-image-${Date.now()}.${ext}`, { type: item.type });
            pastedFiles.push(file);
          }
        }
      }
    }

    if (pastedFiles.length > 0) {
      e.preventDefault();
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
      onSend(effectiveText, files, { webSearch: mode === "cowork", tools: mode === "cowork" || files.length > 0 });
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
            <div className="flex items-center gap-2 px-3 py-1.5 text-xs bg-[#262523] border border-[#D97757]/30 rounded-lg text-[#ECEBE4] animate-pulse">
              <div className="h-3.5 w-3.5 rounded-full border-2 border-[#D97757] border-t-transparent animate-spin" />
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
          onPaste={handlePaste}
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
