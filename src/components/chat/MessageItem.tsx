"use client";
import React, { useState } from "react";
import Link from "next/link";
import {
  Check,
  Copy,
  RefreshCw,
  Pencil,
  Film,
  FileText,
  Download,
  X,
  ExternalLink,
  ThumbsUp,
  ThumbsDown,
  Wrench,
  ChevronDown,
  ChevronRight,
  Zap,
  CornerDownLeft,
  Sparkles,
  Maximize2,
  Palette,
  Loader2,
} from "lucide-react";
import { Markdown } from "./Markdown";
import { CodeBlock } from "./CodeBlock";
import { ThinkingBlock } from "./ThinkingBlock";
import { ThinkingIndicator } from "./ThinkingIndicator";
import { ProjectZipCard } from "./ProjectZipCard";
import { ImageGeneratingCard } from "./ImageGeneratingCard";
import { parseThinking, extractCodeBlocks, isLargeProject } from "@/lib/ai/thinking";
import { copyText, cn } from "@/lib/utils";
import { insertTextToComposer, extractGeneratedPrompt } from "@/lib/prompt-intent";
import type { Message } from "@/types";

function formatLatency(ms?: number): string {
  if (!ms || ms <= 0) return "";
  if (ms < 1000) return `${ms}ms`;
  const sec = ms / 1000;
  return sec < 10 ? `${sec.toFixed(2)}s` : `${sec.toFixed(1)}s`;
}

const EXT_LABELS: Record<string, string> = {
  docx: "Tài liệu Word",
  pptx: "Bài thuyết trình",
  xlsx: "Bảng tính Excel",
  pdf: "Tài liệu PDF",
  md: "Markdown",
  csv: "Dữ liệu CSV",
  txt: "Văn bản",
  json: "JSON",
  html: "Trang web",
  py: "Mã nguồn Python",
  zip: "Tệp nén ZIP",
};

// Extensions we can inline-preview in the modal (text-fetchable)
const PREVIEWABLE = new Set(["md", "csv", "txt", "json", "html", "css", "js", "ts", "tsx", "jsx", "py", "sql", "sh", "yaml", "yml", "toml", "xml"]);

// Modal preview for artifact files: md renders, csv → table, code → CodeBlock
function ArtifactPreviewModal({ fileName, href, ext, onClose }: { fileName: string; href: string; ext: string; onClose: () => void }) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [isRendered, setIsRendered] = useState(true);

  React.useEffect(() => {
    let cancelled = false;
    fetch(href)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error("fetch failed"))))
      .then((t) => { if (!cancelled) setText(t.slice(0, 200_000)); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [href]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const lang = LANG_BY_EXT[ext] ?? "text";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-label={`Xem trước ${fileName}`}
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl max-h-[85vh] rounded-xl bg-[var(--surface)] border border-[var(--border)] shadow-lg flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[10px] font-bold tracking-wide text-[#D97757] uppercase">{ext}</span>
            <p className="text-sm font-medium truncate text-[var(--text)]">{fileName}</p>
          </div>
          <div className="flex items-center gap-2">
            {(ext === "md" || ext === "csv") && (
              <button
                type="button"
                onClick={() => setIsRendered((r) => !r)}
                className="px-2.5 py-1 rounded-md text-xs text-[var(--text-2)] hover:text-[var(--text)] hover:bg-white/[0.06] transition-colors cursor-pointer"
              >
                {isRendered ? "Xem nguồn" : "Xem renders"}
              </button>
            )}
            <a
              href={href}
              download={fileName}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-[#D97757]/15 hover:bg-[#D97757]/25 text-[#D97757] border border-[#D97757]/30 transition-colors"
            >
              <Download size={12} />
              <span>Tải xuống</span>
            </a>
            <button
              type="button"
              onClick={onClose}
              aria-label="Đóng"
              className="p-1.5 rounded-md text-[var(--text-3)] hover:text-[var(--text)] hover:bg-white/[0.06] transition-colors cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>
        </div>
        <div className="overflow-y-auto thin-scroll p-4">
          {error ? (
            <p className="text-sm text-[var(--text-3)] py-8 text-center">Không tải được nội dung để xem trước.</p>
          ) : text === null ? (
            <p className="text-sm text-[var(--text-3)] py-8 text-center">Đang tải…</p>
          ) : ext === "md" && isRendered ? (
            <Markdown text={text} />
          ) : ext === "csv" && isRendered ? (
            <CsvTable text={text} />
          ) : (
            <CodeBlock code={text} language={lang} filename={fileName} />
          )}
        </div>
      </div>
    </div>
  );
}

function ImageLightboxModal({
  url,
  fileName,
  onClose,
}: {
  url: string;
  fileName?: string;
  onClose: () => void;
}) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/85 backdrop-blur-md p-4 sm:p-6 select-none animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-label={fileName ?? "Xem ảnh"}
      onClick={onClose}
    >
      {/* Top action bar */}
      <div
        className="w-full max-w-5xl flex items-center justify-between mb-3 px-2 shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="px-2.5 py-1 rounded-md text-xs font-mono text-[#ECEBE4] bg-white/10 border border-white/10 truncate max-w-xs sm:max-w-md">
            {fileName || "image.png"}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <a
            href={url}
            download={fileName || "image.png"}
            target="_blank"
            rel="noopener noreferrer"
            title="Tải ảnh về máy"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[#ECEBE4] bg-white/10 hover:bg-white/20 border border-white/10 transition-colors"
          >
            <Download size={14} />
            <span className="hidden sm:inline">Tải về</span>
          </a>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            title="Mở tab mới"
            className="p-2 rounded-lg text-[#ECEBE4] bg-white/10 hover:bg-white/20 border border-white/10 transition-colors"
          >
            <ExternalLink size={15} />
          </a>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng (Esc)"
            title="Đóng (Esc)"
            className="flex items-center justify-center h-8 w-8 rounded-lg bg-[#D97757] hover:bg-[#E2886A] text-white shadow-md transition-all cursor-pointer hover:scale-105 active:scale-95"
          >
            <X size={18} strokeWidth={2.5} />
          </button>
        </div>
      </div>

      {/* Main Image Container */}
      <div
        className="relative max-w-5xl max-h-[85vh] flex items-center justify-center overflow-hidden rounded-xl border border-white/10 shadow-2xl bg-black/40"
        onClick={(e) => e.stopPropagation()}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={fileName ?? "Hình ảnh"}
          className="max-h-[82vh] max-w-full object-contain rounded-lg"
        />
      </div>
    </div>
  );
}

const LANG_BY_EXT: Record<string, string> = {
  js: "javascript", ts: "typescript", tsx: "tsx", jsx: "jsx", py: "python",
  json: "json", sql: "sql", sh: "bash", yaml: "yaml", yml: "yaml", toml: "toml",
  html: "html", css: "css", md: "markdown", xml: "xml", txt: "text",
};

function CsvTable({ text }: { text: string }) {
  const rows = React.useMemo(() => {
    // ponytail: naive CSV split — no quoted-comma handling; use PapaParse if needed
    return text.trim().split(/\r?\n/).slice(0, 100).map((r) => r.split(","));
  }, [text]);
  if (!rows.length) return null;
  const [head, ...body] = rows;
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr>
          {head.map((h, i) => (
            <th key={i} className="border border-[var(--border)] px-3 py-2 text-left bg-[var(--surface-2)] font-semibold text-[var(--text)]">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {body.map((r, ri) => (
          <tr key={ri}>
            {head.map((_, ci) => (
              <td key={ci} className="border border-[var(--border)] px-3 py-2 text-[var(--text-2)]">{r[ci] ?? ""}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function GeneratedImageCardItem({
  img,
  onOpenLightbox,
}: {
  img: { url: string; fileName: string; prompt?: string; aspectRatio?: string; model?: string };
  onOpenLightbox: (item: { url: string; fileName: string }) => void;
}) {
  const [hasError, setHasError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  return (
    <div className="group/imgcard rounded-2xl bg-[#1E1D1B] border border-white/10 hover:border-[#D97757]/40 shadow-xl overflow-hidden max-w-xl transition-all duration-200">
      {/* Image visual container */}
      <div
        className="relative overflow-hidden cursor-zoom-in bg-black/40 flex items-center justify-center min-h-[220px] max-h-[500px]"
        onClick={() => !hasError && onOpenLightbox({ url: img.url, fileName: img.fileName })}
      >
        {!isLoaded && !hasError && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#181716]">
            <Loader2 size={24} className="animate-spin text-[#D97757]" />
          </div>
        )}
        {hasError ? (
          <div className="p-8 text-center flex flex-col items-center gap-2 text-[#A6A49B]">
            <Sparkles size={24} className="text-[#D97757]/60 mb-1" />
            <p className="text-xs font-medium text-[#ECEBE4]">Không thể hiển thị ảnh trực tiếp</p>
            <p className="text-[11px] text-[#75736C]">Bạn có thể tải ảnh về máy hoặc mở rộng</p>
          </div>
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={img.url}
            alt={img.prompt || img.fileName}
            onLoad={() => setIsLoaded(true)}
            onError={() => setHasError(true)}
            className={cn(
              "w-full h-auto max-h-[500px] object-contain transition-transform duration-300 group-hover/imgcard:scale-[1.01]",
              !isLoaded && "opacity-0"
            )}
          />
        )}
        {/* Overlay Badge */}
        <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/70 backdrop-blur-md border border-white/15 text-[11px] font-medium text-[#ECEBE4]">
          <Sparkles size={11} className="text-[#D97757]" />
          <span>AI Generated</span>
          {img.aspectRatio && (
            <span className="text-[#A6A49B] font-mono text-[10px]">· {img.aspectRatio}</span>
          )}
        </div>

        {/* Quick Expand Button */}
        {!hasError && (
          <div className="absolute top-2.5 right-2.5 p-1.5 rounded-lg bg-black/70 backdrop-blur-md border border-white/15 text-[#ECEBE4] opacity-0 group-hover/imgcard:opacity-100 transition-opacity">
            <Maximize2 size={13} />
          </div>
        )}
      </div>

      {/* Footer Bar */}
      <div className="p-3 bg-[#242321] border-t border-white/[0.06] flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          {img.prompt ? (
            <p className="text-xs text-[#ECEBE4] line-clamp-1 italic font-sans" title={img.prompt}>
              “{img.prompt}”
            </p>
          ) : (
            <p className="text-xs text-[#ECEBE4] truncate font-mono">{img.fileName}</p>
          )}
          <p className="text-[11px] text-[#75736C] mt-0.5">
            {img.model ? `${img.model} · ` : ""}Nhấp vào ảnh để phóng to
          </p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => onOpenLightbox({ url: img.url, fileName: img.fileName })}
            disabled={hasError}
            className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-[#A6A49B] hover:text-[#ECEBE4] hover:bg-white/[0.06] border border-white/10 transition-colors cursor-pointer disabled:opacity-40"
            title="Xem toàn màn hình"
          >
            <Maximize2 size={13} />
          </button>
          <a
            href={img.url}
            download={img.fileName}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#D97757]/15 hover:bg-[#D97757]/25 text-[#D97757] border border-[#D97757]/30 transition-colors"
            title="Tải ảnh về máy"
          >
            <Download size={12} />
            <span>Tải về</span>
          </a>
          {img.prompt && (
            <Link
              href={`/app/images?prompt=${encodeURIComponent(img.prompt)}`}
              className="inline-flex items-center gap-1 p-1.5 rounded-lg text-xs font-medium text-[#A6A49B] hover:text-[#ECEBE4] hover:bg-white/[0.06] border border-white/10 transition-colors"
              title="Mở trong Studio Tạo ảnh"
            >
              <Palette size={13} className="text-[#D97757]" />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

interface MessageItemProps {
  message: Message;
  streaming?: boolean;
  onRegenerate?: () => void;
  onEdit?: (text: string) => void;
  conversationTitle?: string;
}

export const MessageItem = React.memo(function MessageItem({
  message,
  streaming = false,
  onRegenerate,
  onEdit,
  conversationTitle,
}: MessageItemProps) {
  const [copied, setCopied] = useState(false);
  const [inserted, setInserted] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const [feedback, setFeedback] = useState<"good" | "bad" | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [showTools, setShowTools] = useState(false);
  const [preview, setPreview] = useState<{ fileName: string; href: string; ext: string } | null>(null);
  const [lightboxImg, setLightboxImg] = useState<{ url: string; fileName?: string } | null>(null);

  const isAssistant = message.role === "assistant";

  // Live stopwatch while streaming response
  const [liveElapsed, setLiveElapsed] = useState(0);
  React.useEffect(() => {
    if (!streaming || !isAssistant) {
      setLiveElapsed(0);
      return;
    }
    const start = Date.now();
    const interval = setInterval(() => {
      setLiveElapsed(Date.now() - start);
    }, 100);
    return () => clearInterval(interval);
  }, [streaming, isAssistant]);

  const parsed = React.useMemo(
    () => (isAssistant ? parseThinking(message.content || "") : { thinking: "", content: message.content || "", isThinking: false, wordCount: 0 }),
    [isAssistant, message.content]
  );
  const codeFiles = React.useMemo(
    () => (isAssistant ? extractCodeBlocks(parsed.content || "") : []),
    [isAssistant, parsed.content]
  );
  const isProject = React.useMemo(
    () => (isAssistant ? isLargeProject(codeFiles, parsed.content || "") : false),
    [isAssistant, codeFiles, parsed.content]
  );

  const safeParts = React.useMemo(() => (Array.isArray(message.parts) ? message.parts : []), [message.parts]);
  const generatingImagePart = React.useMemo(() => {
    if (!isAssistant) return null;
    return safeParts.find(
      (p) => p && p.type === "image" && p.status === "running"
    );
  }, [isAssistant, safeParts]);
  const generatedImages = React.useMemo(() => {
    if (!isAssistant) return [];
    const list: Array<{ url: string; fileName: string; prompt?: string; aspectRatio?: string; model?: string }> = [];
    const seen = new Set<string>();

    for (const p of safeParts) {
      if (p && p.type === "image" && (p.url || p.fileId)) {
        const rawUrl = (p.url && typeof p.url === "string" ? p.url.trim() : "");
        const rawFileId = (p.fileId && typeof p.fileId === "string" && !p.fileId.startsWith("img_") ? p.fileId.trim() : "");
        const url = rawUrl || (rawFileId ? `/api/files/${rawFileId}` : "");
        if (url && !seen.has(url)) {
          seen.add(url);
          list.push({ url, fileName: p.fileName || "ai-generated-image.png" });
        }
      }
      if (p && p.type === "tool_call" && p.toolName === "generate_image" && p.toolOutput) {
        try {
          const raw = p.toolOutput;
          const parsed: Record<string, unknown> =
            typeof raw === "object" && raw !== null
              ? (raw as Record<string, unknown>)
              : typeof raw === "string"
              ? JSON.parse(raw)
              : {};
          if (parsed.success && (parsed.imageUrl || parsed.fileId)) {
            const rawUrl = (typeof parsed.imageUrl === "string" ? parsed.imageUrl.trim() : "");
            const rawFileId = (typeof parsed.fileId === "string" && !parsed.fileId.startsWith("img_") ? parsed.fileId.trim() : "");
            const url = rawUrl || (rawFileId ? `/api/files/${rawFileId}` : "");
            if (url && !seen.has(url)) {
              seen.add(url);
              list.push({
                url,
                fileName: (parsed.fileName as string) || "ai-generated-image.png",
                prompt: parsed.prompt as string | undefined,
                aspectRatio: parsed.aspectRatio as string | undefined,
                model: parsed.model as string | undefined,
              });
            }
          }
        } catch {}
      }
    }
    return list;
  }, [isAssistant, safeParts]);

  // USER MESSAGE (Claude style: right-aligned pill bubble)
  if (message.role === "user") {
    const seenImageKeys = new Set<string>();
    const images = safeParts.filter((p) => {
      if (!p || p.type !== "image") return false;
      const key = p.fileId || p.url || p.fileName || p.id;
      if (key && seenImageKeys.has(key)) return false;
      if (key) seenImageKeys.add(key);
      return true;
    });
    const files = safeParts.filter((p) => p && p.type === "file");

    return (
      <article className="group relative py-2 flex flex-col items-end w-full select-text" aria-label="Tin nhắn của bạn">
        <div className="flex items-center gap-2 max-w-[85%] sm:max-w-[75%] justify-end">
          {/* Hover actions */}
          <div className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity flex items-center gap-0.5 order-first">
            <button
              type="button"
              aria-label="Sao chép"
              title="Sao chép"
              onClick={async () => {
                if (await copyText(message.content)) {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }
              }}
              className="p-1.5 rounded-md text-[#75736C] hover:text-[#ECEBE4] transition-colors cursor-pointer"
            >
              {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
            </button>
            {onEdit && (
              <button
                type="button"
                aria-label="Chỉnh sửa tin nhắn"
                title="Chỉnh sửa"
                onClick={() => {
                  setDraft(message.content);
                  setEditing(true);
                }}
                className="p-1.5 rounded-md text-[#75736C] hover:text-[#ECEBE4] transition-colors cursor-pointer"
              >
                <Pencil size={13} />
              </button>
            )}
          </div>

          {/* User message bubble */}
          {editing ? (
            <div className="w-full card p-3.5 border border-[#D97757]/40 bg-[#262523] rounded-2xl">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={2}
                className="w-full bg-transparent outline-none text-[16px] text-[#ECEBE4] leading-relaxed resize-none font-sans"
                aria-label="Chỉnh sửa nội dung tin nhắn"
              />
              <div className="flex items-center justify-end gap-2 mt-2 pt-2 border-t border-white/[0.06]">
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="px-3 py-1 rounded-lg text-xs text-[#A6A49B] hover:text-[#ECEBE4] cursor-pointer transition-colors"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onEdit?.(draft);
                    setEditing(false);
                  }}
                  className="px-3.5 py-1 rounded-lg text-xs bg-[#D97757] hover:bg-[#E2886A] text-white font-medium cursor-pointer transition-colors"
                >
                  Gửi lại
                </button>
              </div>
            </div>
          ) : (
            <div className="px-4.5 py-3 rounded-2xl rounded-tr-sm bg-[#2B2927] text-[#ECEBE4] border border-white/[0.08] text-[16px] leading-relaxed whitespace-pre-wrap break-words shadow-sm font-sans">
              {message.content}
            </div>
          )}
        </div>

        {/* Attachment chips / thumbnails */}
        {(images.length > 0 || files.length > 0) && (
          <div className="flex flex-wrap justify-end gap-2 my-2 max-w-[85%]">
            {images.map((p) => (
              <button
                key={p.id || p.url}
                type="button"
                onClick={() => setLightboxImg({ url: p.url ?? "", fileName: p.fileName })}
                aria-label={`Xem ảnh: ${p.fileName ?? "Hình ảnh"}`}
                className="group/img relative overflow-hidden rounded-xl border border-white/10 bg-[#262523] shadow-xs transition-transform hover:scale-[1.02] cursor-zoom-in text-left"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.url}
                  alt={p.fileName ?? "Hình ảnh đính kèm"}
                  className="h-28 w-28 sm:h-36 sm:w-36 object-cover"
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center">
                  <span className="px-2 py-1 rounded-md text-[11px] font-medium bg-black/70 text-white backdrop-blur-sm border border-white/20">
                    Xem ảnh
                  </span>
                </div>
              </button>
            ))}

            {files.map((p) => (
              <div
                key={p.id}
                className="px-3 py-2 text-xs flex items-center gap-2 bg-[#262523] border border-white/10 rounded-xl shadow-xs"
              >
                <div className="h-7 w-7 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-[#A6A49B] shrink-0">
                  {p.mimeType?.startsWith("video/") ? <Film size={13} /> : <FileText size={13} />}
                </div>
                <div className="min-w-0 max-w-[140px]">
                  <p className="font-medium truncate text-[#ECEBE4]">{p.fileName}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {lightboxImg && (
          <ImageLightboxModal
            url={lightboxImg.url}
            fileName={lightboxImg.fileName}
            onClose={() => setLightboxImg(null)}
          />
        )}
      </article>
    );
  }

  // ASSISTANT MESSAGE (Claude style)
  const toolParts = safeParts.filter((p) => p && p.type === "tool_call");
  const artifactParts = safeParts.filter(
    (p) => p && p.type === "file" && Boolean(p.fileId || p.url)
  );


  return (
    <article className="group relative py-3 select-text w-full flex items-start gap-3.5 sm:gap-4" aria-label="Câu trả lời từ Claude">
      {/* Claude Avatar Icon on the LEFT with glowing aura & gentle spin when thinking */}
      <div
        className={cn(
          "h-8 w-8 rounded-xl bg-[#262523] border border-white/10 flex items-center justify-center shrink-0 mt-0.5 select-none shadow-xs transition-all duration-300",
          streaming && (!parsed.content || !parsed.content.trim()) && "border-[#D97757]/40 shadow-[0_0_12px_rgba(217,119,87,0.3)] ring-1 ring-[#D97757]/20"
        )}
      >
        <svg
          viewBox="0 0 24 24"
          fill="currentColor"
          className={cn(
            "h-4.5 w-4.5 text-[#D97757] transition-all duration-300",
            streaming && (!parsed.content || !parsed.content.trim()) && "animate-spin-slow text-[#E2886A]"
          )}
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect x="10.5" y="1" width="3" height="22" rx="1.5" />
          <rect x="1" y="10.5" width="22" height="3" rx="1.5" />
          <rect x="10.5" y="1" width="3" height="22" rx="1.5" transform="rotate(45 12 12)" />
          <rect x="10.5" y="1" width="3" height="22" rx="1.5" transform="rotate(-45 12 12)" />
        </svg>
      </div>

      <div className="flex-1 min-w-0">
        {/* Tool calls indicator (if any) */}
      {toolParts.length > 0 && (
        <div className="mb-2">
          <button
            type="button"
            onClick={() => setShowTools((s) => !s)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs bg-[#262523] hover:bg-[#302E2B] border border-white/10 text-[#A6A49B] transition-colors cursor-pointer mb-1.5"
          >
            <Wrench size={12} className="text-[#D97757]" />
            <span>Đã dùng {toolParts.length} công cụ</span>
            {showTools ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>

          {showTools && (
            <div className="flex flex-col gap-1.5 mt-1.5 p-2 rounded-lg bg-[#262523] border border-white/10 text-xs">
              {toolParts.map((t) => (
                <div key={t.id} className="flex items-center gap-2 text-[#A6A49B]">
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full shrink-0",
                      t.status === "error" ? "bg-red-400" : "bg-emerald-400"
                    )}
                  />
                  <span className="font-mono text-[11px]">{t.toolName}</span>
                  <span className="text-[#75736C]">·</span>
                  <span className="text-[#75736C]">{t.status === "error" ? "Thất bại" : "Hoàn tất"}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Content or Claude thinking state */}
      <div>
        {/* Collapsible Thinking Block ("dấu đi" by default) */}
        {(parsed.thinking || parsed.isThinking) && (
          <ThinkingBlock
            thinking={parsed.thinking}
            isThinking={Boolean(parsed.isThinking && streaming)}
            wordCount={parsed.wordCount}
          />
        )}

        {parsed.content && parsed.content.trim().length > 0 ? (
          <div>
            <Markdown text={parsed.content} streaming={Boolean(streaming)} />
            {streaming && (
              <span className="inline-block w-1.5 h-4 ml-0.5 bg-[#D97757] animate-pulse align-middle rounded-xs" title="Đang sinh câu trả lời…" />
            )}
          </div>
        ) : streaming ? (
          <div className="py-1">
            <ThinkingIndicator
              label={generatingImagePart ? "Đang phác thảo và tạo hình ảnh AI…" : "Đang suy nghĩ & xử lý câu trả lời…"}
            />
          </div>
        ) : !streaming && parsed.thinking ? (
          <p className="text-xs text-[#8E8B82] italic py-1">
            ⚠️ Mô hình đã dừng phản hồi trước khi xuất kết quả hoàn chỉnh.
          </p>
        ) : null}

        {/* Project ZIP card: rendered at the bottom of the response, only for real projects */}
        {isProject && !streaming && (
          <div className="mt-3">
            <ProjectZipCard files={codeFiles} title={conversationTitle || "project"} />
          </div>
        )}

        {/* AI Image Generation In-Progress Loading Screen Card */}
        {generatingImagePart && generatedImages.length === 0 && (
          <ImageGeneratingCard prompt={generatingImagePart.fileName} />
        )}

        {/* Artifact cards — real generated files (docx/pptx/xlsx/pdf/md) */}
        {artifactParts.length > 0 && (
          <div className="flex flex-col gap-2 my-3">
            {artifactParts.map((p) => {
              const ext = (p.fileName ?? "").split(".").pop()?.toLowerCase() ?? "";
              const label = EXT_LABELS[ext] ?? "Tệp";
              const href = p.fileId ? `/api/files/${p.fileId}` : p.url;
              const previewable = PREVIEWABLE.has(ext);
              return (
                <div
                  key={p.id}
                  className="flex items-center gap-3 p-3 rounded-xl bg-[#262523] border border-[#D97757]/30 hover:border-[#D97757]/60 transition-colors max-w-md"
                >
                  <div className="h-10 w-10 rounded-lg bg-[#D97757]/15 border border-[#D97757]/30 flex items-center justify-center shrink-0">
                    <span className="text-[10px] font-bold tracking-wide text-[#D97757] uppercase">{ext.slice(0, 4) || "file"}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate text-[#ECEBE4]">{p.fileName}</p>
                    <p className="text-[11px] text-[#75736C]">{label} · AI tạo</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {previewable && href && (
                      <button
                        type="button"
                        onClick={() => setPreview({ fileName: p.fileName ?? "", href, ext })}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium text-[#A6A49B] hover:text-[#ECEBE4] hover:bg-white/[0.06] border border-white/10 transition-colors cursor-pointer"
                        title="Xem trước"
                        aria-label={`Xem trước ${p.fileName}`}
                      >
                        Preview
                      </button>
                    )}
                    {href && (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 rounded-lg text-[#A6A49B] hover:text-[#ECEBE4] hover:bg-white/[0.06] transition-colors"
                        title="Mở file"
                        aria-label={`Mở ${p.fileName}`}
                      >
                        <FileText size={14} />
                      </a>
                    )}
                    {href && (
                      <a
                        href={href}
                        download={p.fileName}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#D97757]/15 hover:bg-[#D97757]/25 text-[#D97757] border border-[#D97757]/30 transition-colors"
                      >
                        <Download size={12} />
                        <span>Tải xuống</span>
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* AI Generated Image Cards */}
        {generatedImages.length > 0 && (
          <div className="flex flex-col gap-3 my-3">
            {generatedImages.map((img, idx) => (
              <GeneratedImageCardItem
                key={`${img.url}-${idx}`}
                img={img}
                onOpenLightbox={(item) => setLightboxImg(item)}
              />
            ))}
          </div>
        )}

        {preview && (
          <ArtifactPreviewModal
            fileName={preview.fileName}
            href={preview.href}
            ext={preview.ext}
            onClose={() => setPreview(null)}
          />
        )}

        {lightboxImg && (
          <ImageLightboxModal
            url={lightboxImg.url}
            fileName={lightboxImg.fileName}
            onClose={() => setLightboxImg(null)}
          />
        )}

        {message.status === "cancelled" && (
          <p className="mt-2 text-xs text-[#75736C] italic select-none">
            (Đã dừng tạo câu trả lời)
          </p>
        )}

        {message.status === "error" && onRegenerate && (
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={onRegenerate}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs bg-[#D97757]/15 hover:bg-[#D97757]/25 text-[#D97757] transition-colors cursor-pointer border border-[#D97757]/30 font-medium"
            >
              <RefreshCw size={11} />
              <span>Thử lại</span>
            </button>
          </div>
        )}

        {/* Footer info: Action buttons on the left + Response time badge on the right */}
        <div className="flex items-center justify-between gap-2 mt-3 pt-1.5 min-h-[28px]">
          {/* Action buttons (Copy, Feedback, Retry) */}
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
            {!streaming && message.content && (
              <>
                <button
                  type="button"
                  aria-label="Sao chép câu trả lời"
                  title={copied ? "Đã sao chép!" : "Sao chép câu trả lời"}
                  onClick={async () => {
                    const ok = await copyText(parsed.content || message.content);
                    if (ok) {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }
                  }}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-all cursor-pointer font-sans",
                    copied
                      ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-medium"
                      : "text-[#A6A49B] hover:text-[#ECEBE4] hover:bg-white/[0.06]"
                  )}
                >
                  {copied ? (
                    <>
                      <Check size={12} className="text-emerald-400" />
                      <span>Đã chép</span>
                    </>
                  ) : (
                    <>
                      <Copy size={12} />
                      <span>Sao chép</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  aria-label="Đưa vào ô nhập"
                  title="Đưa prompt hoặc nội dung này vào ô chat"
                  onClick={() => {
                    const textToInsert =
                      extractGeneratedPrompt(parsed.content || message.content) ||
                      parsed.content ||
                      message.content;
                    insertTextToComposer(textToInsert, { focus: true });
                    setInserted(true);
                    setTimeout(() => setInserted(false), 2000);
                  }}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-all cursor-pointer font-sans",
                    inserted
                      ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-medium"
                      : "text-[#A6A49B] hover:text-[#ECEBE4] hover:bg-white/[0.06]"
                  )}
                >
                  {inserted ? (
                    <>
                      <Check size={12} className="text-emerald-400" />
                      <span>Đã vào ô chat</span>
                    </>
                  ) : (
                    <>
                      <CornerDownLeft size={12} />
                      <span>Đưa vào ô nhập</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  aria-label="Câu trả lời hữu ích"
                  title={feedback === "good" ? "Đã đánh giá hữu ích" : "Hữu ích"}
                  onClick={() => setFeedback(feedback === "good" ? null : "good")}
                  className={cn(
                    "p-1.5 rounded-lg text-xs transition-all cursor-pointer flex items-center gap-1",
                    feedback === "good"
                      ? "text-emerald-400 bg-emerald-500/15 border border-emerald-500/30"
                      : "text-[#A6A49B] hover:text-[#ECEBE4] hover:bg-white/[0.06]"
                  )}
                >
                  <ThumbsUp size={12} />
                  {feedback === "good" && <span className="text-[11px] font-medium pr-0.5">Hữu ích</span>}
                </button>

                <button
                  type="button"
                  aria-label="Chưa hài lòng"
                  title={feedback === "bad" ? "Đã ghi nhận phản hồi" : "Chưa hài lòng"}
                  onClick={() => setFeedback(feedback === "bad" ? null : "bad")}
                  className={cn(
                    "p-1.5 rounded-lg text-xs transition-all cursor-pointer flex items-center gap-1",
                    feedback === "bad"
                      ? "text-rose-400 bg-rose-500/15 border border-rose-500/30"
                      : "text-[#A6A49B] hover:text-[#ECEBE4] hover:bg-white/[0.06]"
                  )}
                >
                  <ThumbsDown size={12} />
                  {feedback === "bad" && <span className="text-[11px] font-medium pr-0.5">Cần cải thiện</span>}
                </button>

                {onRegenerate && (
                  <button
                    type="button"
                    aria-label="Tạo lại câu trả lời"
                    title="Tạo lại câu trả lời"
                    onClick={() => {
                      setIsRetrying(true);
                      onRegenerate();
                      setTimeout(() => setIsRetrying(false), 2000);
                    }}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs text-[#A6A49B] hover:text-[#ECEBE4] hover:bg-white/[0.06] transition-all cursor-pointer font-sans active:scale-95"
                  >
                    <RefreshCw size={12} className={cn("transition-transform", isRetrying && "animate-spin text-[#D97757]")} />
                    <span>{isRetrying ? "Đang tạo lại..." : "Tạo lại"}</span>
                  </button>
                )}
              </>
            )}
          </div>

          {/* Response time indicator: Live ticking while streaming, exact latency when done */}
          {Boolean((streaming && liveElapsed > 0) || message.latencyMs) && (
            <div
              className={cn(
                "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono select-none transition-all",
                streaming
                  ? "text-[#D97757] bg-[#D97757]/10 border border-[#D97757]/20 animate-pulse"
                  : "text-[#75736C] hover:text-[#A6A49B] bg-white/[0.03] border border-white/[0.05]"
              )}
              title={
                streaming
                  ? "Đang tính thời gian phản hồi..."
                  : `Thời gian phản hồi câu hỏi: ${formatLatency(message.latencyMs)}`
              }
            >
              <Zap
                size={11}
                className={cn(
                  "shrink-0",
                  streaming ? "text-[#D97757] fill-[#D97757]" : "text-[#8E8B82]"
                )}
              />
              <span>
                {streaming
                  ? `${(liveElapsed / 1000).toFixed(1)}s`
                  : formatLatency(message.latencyMs)}
              </span>
            </div>
          )}
        </div>
      </div>
      </div>
    </article>
  );
});
