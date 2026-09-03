"use client";

import React, { useState } from "react";
import { FolderArchive, Download, Check, Loader2 } from "lucide-react";
import JSZip from "jszip";
import type { ExtractedCodeFile } from "@/lib/ai/thinking";

interface ProjectZipCardProps {
  files: ExtractedCodeFile[];
  title?: string;
}

export const ProjectZipCard = React.memo(function ProjectZipCard({
  files,
  title = "project-code",
}: ProjectZipCardProps) {
  const [downloading, setDownloading] = useState(false);
  const [downloaded, setDownloaded] = useState(false);

  if (!files || files.length < 2) return null;

  const handleDownloadZip = async () => {
    if (downloading) return;
    try {
      setDownloading(true);
      const zip = new JSZip();

      for (const f of files) {
        zip.file(f.filename, f.code);
      }

      const blob = await zip.generateAsync({
        type: "blob",
        compression: "DEFLATE",
        compressionOptions: { level: 6 },
      });

      const cleanTitle = (title || "project")
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, "-")
        .replace(/^-+|-+$/g, "") || "project";

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${cleanTitle}.zip`;
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
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-[#ECEBE4]">
                Dự án mã nguồn
              </p>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#D97757]/20 text-[#D97757] border border-[#D97757]/30">
                {files.length} tệp
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-1.5 max-h-16 overflow-y-auto thin-scroll pr-1">
              {files.map((f, i) => (
                <span
                  key={i}
                  className="px-2 py-0.5 rounded-md text-[11px] font-mono bg-white/[0.05] text-[#A6A49B] border border-white/[0.06]"
                  title={f.filename}
                >
                  {f.filename}
                </span>
              ))}
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
