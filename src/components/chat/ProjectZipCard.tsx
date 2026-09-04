"use client";

import React, { useState, useMemo } from "react";
import { FolderArchive, Download, Check, Loader2, FolderTree } from "lucide-react";
import JSZip from "jszip";
import type { ExtractedCodeFile } from "@/lib/ai/thinking";

interface ProjectZipCardProps {
  files: ExtractedCodeFile[];
  title?: string;
}

function slugifyTitle(rawTitle?: string, files?: ExtractedCodeFile[]): string {
  const isGeneric =
    !rawTitle ||
    /^(cuộc trò chuyện|new conversation|project|project-code|chat|cuộc trò chuyện mới)$/i.test(
      rawTitle.trim()
    );

  if (!isGeneric && rawTitle) {
    const clean = rawTitle
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D")
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 45);
    if (clean.length > 2) return clean;
  }

  // Try to extract common top-level directory from files (e.g. `game/...` or `flappy-bird/...`)
  if (files && files.length > 0) {
    for (const f of files) {
      const parts = f.filename.split("/");
      if (parts.length > 1 && parts[0] && !/^(src|app|lib|dist|build|public)$/i.test(parts[0])) {
        const dirSlug = parts[0].toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
        if (dirSlug.length > 1) return dirSlug;
      }
    }

    const namedFile = files.find(
      (f) =>
        /\.(py|js|tsx|ts|html)$/i.test(f.filename) &&
        !f.filename.startsWith("file_")
    );
    if (namedFile) {
      const base = namedFile.filename.split("/").pop()?.split(".")[0];
      if (base && base !== "index" && base !== "main" && base !== "app") {
        const fileSlug = base.toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
        if (fileSlug.length > 1) return fileSlug;
      }
    }
  }

  return "project-code";
}

export const ProjectZipCard = React.memo(function ProjectZipCard({
  files,
  title = "project-code",
}: ProjectZipCardProps) {
  const [downloading, setDownloading] = useState(false);
  const [downloaded, setDownloaded] = useState(false);

  const folderCount = useMemo(() => {
    const set = new Set<string>();
    for (const f of files) {
      const parts = f.filename.split("/");
      if (parts.length > 1) {
        set.add(parts.slice(0, -1).join("/"));
      }
    }
    return set.size;
  }, [files]);

  if (!files || files.length < 2) return null;

  const handleDownloadZip = async () => {
    if (downloading) return;
    try {
      setDownloading(true);
      const zip = new JSZip();

      for (const f of files) {
        const normalizedPath = f.filename.replace(/\\/g, "/").replace(/^\.?\/+/, "");
        zip.file(normalizedPath, f.code);
      }

      const blob = await zip.generateAsync({
        type: "blob",
        compression: "DEFLATE",
        compressionOptions: { level: 6 },
      });

      const zipName = slugifyTitle(title, files);

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${zipName}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setDownloaded(true);
      setTimeout(() => setDownloaded(false), 2500);
    } catch (err) {
      console.error("Failed to generate ZIP:", err);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="my-3.5 p-3.5 rounded-xl bg-[#262523] border border-[#D97757]/30 hover:border-[#D97757]/60 transition-colors shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="h-10 w-10 rounded-lg bg-[#D97757]/15 border border-[#D97757]/30 flex items-center justify-center shrink-0">
            <FolderArchive size={20} className="text-[#D97757]" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-medium text-[#ECEBE4]">
                Dự án mã nguồn
              </p>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#D97757]/20 text-[#D97757] border border-[#D97757]/30">
                {files.length} tệp
              </span>
              {folderCount > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  <FolderTree size={10} />
                  <span>{folderCount} thư mục</span>
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5 mt-1.5 max-h-16 overflow-y-auto thin-scroll pr-1">
              {files.map((f, i) => {
                const lastSlash = f.filename.lastIndexOf("/");
                const dir = lastSlash !== -1 ? f.filename.slice(0, lastSlash + 1) : "";
                const base = lastSlash !== -1 ? f.filename.slice(lastSlash + 1) : f.filename;
                return (
                  <span
                    key={i}
                    className="px-2 py-0.5 rounded-md text-[11px] font-mono bg-white/[0.05] text-[#A6A49B] border border-white/[0.06] flex items-center gap-0.5"
                    title={f.filename}
                  >
                    {dir && <span className="text-[#75736C] font-sans">{dir}</span>}
                    <span className="text-[#ECEBE4]">{base}</span>
                  </span>
                );
              })}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleDownloadZip}
          disabled={downloading}
          className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium bg-[#D97757] hover:bg-[#E28769] text-white transition-all cursor-pointer shadow-sm disabled:opacity-50 shrink-0 self-end sm:self-center"
        >
          {downloading ? (
            <>
              <Loader2 size={13} className="animate-spin" />
              <span>Đang nén ZIP…</span>
            </>
          ) : downloaded ? (
            <>
              <Check size={13} className="text-white" />
              <span>Đã tải về!</span>
            </>
          ) : (
            <>
              <Download size={13} />
              <span>Tải toàn bộ (.zip)</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
});
