"use client";

import React, { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Sparkles,
  Palette,
  Download,
  Maximize2,
  Copy,
  Check,
  RefreshCw,
  Sliders,
  Image as ImageIcon,
  Trash2,
  ChevronRight,
  Lightbulb,
  Upload,
  X,
  Plus,
  Compass,
  History,
  SlidersHorizontal,
  Pin,
  Flame,
  ChevronDown,
  Layers,
  ClipboardPaste,
  Sliders as SlidersIcon,
  ExternalLink,
} from "lucide-react";
import { useSession } from "@/hooks/useSession";
import { copyText, cn } from "@/lib/utils";
import { useToast } from "@/components/ui/primitives";
import type { AIModel } from "@/types";

interface GeneratedImage {
  id: string;
  url: string;
  fileName: string;
  prompt: string;
  aspectRatio: string;
  width: number;
  height: number;
  model: string;
  style?: string;
  createdAt: string;
}

interface ImageReference {
  id: string;
  url: string;
  fileName?: string;
  role: "style" | "subject" | "composition";
  weight: number;
}

const ASPECT_RATIO_OPTIONS = [
  { id: "1:1", label: "1:1", sub: "Vuông" },
  { id: "16:9", label: "16:9", sub: "Ngang" },
  { id: "9:16", label: "9:16", sub: "Dọc" },
  { id: "4:3", label: "4:3", sub: "Khổ rộng" },
  { id: "3:4", label: "3:4", sub: "Khổ cao" },
];

const STYLE_OPTIONS = [
  { id: "", label: "Tự do (Không áp đặt)", desc: "Theo sát 100% prompt của bạn", icon: "✨" },
  { id: "photographic", label: "Nhiếp ảnh chân thực", desc: "Ảnh chụp 8k sắc nét", icon: "📸" },
  { id: "cinematic", label: "Điện ảnh (Cinematic)", desc: "Ánh sáng ấn tượng, sâu lắng", icon: "🎬" },
  { id: "anime", label: "Anime / Manga", desc: "Nét vẽ Makoto Shinkai rực rỡ", icon: "🌸" },
  { id: "digital_art", label: "Nghệ thuật số", desc: "Minh họa ArtStation", icon: "🎨" },
  { id: "cyberpunk", label: "Cyberpunk", desc: "Đèn neon, thành phố tương lai", icon: "🌆" },
  { id: "three_d", label: "3D Render / CGI", desc: "Đổ bóng Octane mượt mà", icon: "🧊" },
  { id: "watercolor", label: "Màu nước nghệ thuật", desc: "Vết loang thanh thoát", icon: "🖌️" },
  { id: "minimalist", label: "Tối giản (Minimalist)", desc: "Mảng màu tinh tế, hiện đại", icon: "📐" },
];

const PROMPT_INSPIRATIONS = [
  {
    title: "Rồng Đông Phương Fansipan",
    prompt: "Một con rồng vàng phương Đông uy nghi đang bay lượn trên biển mây đỉnh núi Fansipan tuyết trắng phủ mờ, ánh bình minh vàng kim rực rỡ",
    style: "cinematic",
    ratio: "16:9",
  },
  {
    title: "Phố Cổ Hội An Cyberpunk",
    prompt: "Phố cổ Hội An ban đêm dưới góc nhìn tương lai Cyberpunk, lồng đèn neon phát sáng phản chiếu trên mặt nước sông Hoài, mưa bụi lấp lánh",
    style: "cyberpunk",
    ratio: "16:9",
  },
  {
    title: "Mèo Phi Hành Gia",
    prompt: "Chú mèo lông ngắn mập mạp mặc bộ đồ du hành vũ trụ tí hon, đang trôi bồng bềnh ngắm nhìn Trái Đất xanh biếc từ trạm không gian",
    style: "three_d",
    ratio: "1:1",
  },
  {
    title: "Rừng Phát Quang Kỷ Jura",
    prompt: "Khu rừng nhiệt đới cổ đại huyền bí với những thác nước tầng bậc khổng lồ, thảm thực vật phát quang kỳ ảo trong sương sớm",
    style: "photographic",
    ratio: "16:9",
  },
  {
    title: "Cô Gái Trà Chiều Kyoto",
    prompt: "Cô gái trẻ ngồi bên ban công quán cà phê phong cách Kyoto ngắm hoa anh đào rơi, ánh hoàng hôn dịu nhẹ, phong cách Studio Ghibli",
    style: "anime",
    ratio: "3:4",
  },
];

const STORAGE_KEY = "dungclaude_image_studio_history_v1";

function ImageStudioContent() {
  const searchParams = useSearchParams();
  const { user } = useSession();
  const { toast, Toasts } = useToast();

  const [prompt, setPrompt] = useState("");
  const [selectedRatio, setSelectedRatio] = useState<string>("1:1");
  const [selectedStyle, setSelectedStyle] = useState<string>(""); // Optional art style, defaults to None!
  const [batchCount, setBatchCount] = useState<number>(1); // 1, 2, or 4 images
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [negativePrompt, setNegativePrompt] = useState<string>("");

  // Dedicated Reference Images Board state
  const [referenceImages, setReferenceImages] = useState<ImageReference[]>([]);
  const [showRefBoardModal, setShowRefBoardModal] = useState(false);
  const [isDraggingWindow, setIsDraggingWindow] = useState(false);
  const dragCounterRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [availableModels, setAvailableModels] = useState<AIModel[]>([]);
  const [activeRoute, setActiveRoute] = useState<string>("");
  const [modelsLoading, setModelsLoading] = useState(true);

  const [isGenerating, setIsGenerating] = useState(false);
  const [currentBatch, setCurrentBatch] = useState<GeneratedImage[]>([]);
  const [selectedImageIndex, setSelectedImageIndex] = useState<number>(0);

  const [history, setHistory] = useState<GeneratedImage[]>([]);
  const [activeTab, setActiveTab] = useState<"canvas" | "history">("canvas");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [lightboxImg, setLightboxImg] = useState<GeneratedImage | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Load history from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setHistory(parsed);
          setCurrentBatch([parsed[0]]);
        }
      }
    } catch {}
  }, []);

  const saveBatchToHistory = (imgs: GeneratedImage[]) => {
    setHistory((prev) => {
      const newIds = new Set(imgs.map((i) => i.id || i.url));
      const filtered = prev.filter((item) => !newIds.has(item.id || item.url));
      const updated = [...imgs, ...filtered].slice(0, 50);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch {}
      return updated;
    });
  };

  // Fetch image models
  useEffect(() => {
    let mounted = true;
    async function loadModels() {
      try {
        const res = await fetch("/api/images/models");
        if (!res.ok) return;
        const data = await res.json();
        if (mounted && data.models) {
          setAvailableModels(data.models);
          setActiveRoute(data.activeRoute || "");
          if (data.activeRoute) {
            setSelectedModel(data.activeRoute);
          } else if (data.models.length > 0) {
            setSelectedModel(data.models[0].id);
          }
        }
      } catch (err) {
        console.error("Failed to load image models:", err);
      } finally {
        if (mounted) setModelsLoading(false);
      }
    }
    loadModels();
    return () => {
      mounted = false;
    };
  }, []);

  // Initialize prompt from query params
  useEffect(() => {
    const qPrompt = searchParams.get("prompt");
    if (qPrompt) setPrompt(qPrompt);
  }, [searchParams]);

  // Helper to ingest an image file into reference board
  const processReferenceImageFile = (file: File | Blob, customName?: string) => {
    if (!file.type.startsWith("image/")) {
      toast("Vui lòng chọn tệp hình ảnh (PNG, JPG, WebP)", "error");
      return;
    }

    if (referenceImages.length >= 4) {
      toast("Tối đa 4 ảnh tham chiếu. Vui lòng xóa bớt ảnh cũ trước khi thêm.", "info");
      return;
    }

    const reader = new FileReader();
    reader.onload = (loadEvt) => {
      const dataUrl = loadEvt.target?.result as string;
      if (dataUrl) {
        const newRef: ImageReference = {
          id: `ref_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          url: dataUrl,
          fileName: customName || (file instanceof File ? file.name : `anh_tham_chieu_${Date.now().toString().slice(-4)}.png`),
          role: "style",
          weight: 0.8,
        };
        setReferenceImages((prev) => [...prev.slice(0, 3), newRef]);
        toast("✨ Đã nạp ảnh vào Bảng Tham Chiếu!", "success");
      }
    };
    reader.readAsDataURL(file);
  };

  // CLIPBOARD PASTE LISTENER (Hỗ trợ dán ảnh từ clipboard ở bất kỳ đâu trong Studio)
  useEffect(() => {
    const handleGlobalPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith("image/")) {
          const blob = item.getAsFile();
          if (blob) {
            processReferenceImageFile(blob, `clipboard_anh_${Date.now().toString().slice(-4)}.png`);
            e.preventDefault();
            break;
          }
        }
      }
    };

    window.addEventListener("paste", handleGlobalPaste);
    return () => {
      window.removeEventListener("paste", handleGlobalPaste);
    };
  }, [referenceImages.length]);

  // DRAG AND DROP HANDLERS (Kéo thả ảnh trực tiếp từ màn hình / thư mục)
  const handleWindowDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current += 1;
    if (e.dataTransfer?.items && e.dataTransfer.items.length > 0) {
      setIsDraggingWindow(true);
    }
  };

  const handleWindowDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) {
      setIsDraggingWindow(false);
      dragCounterRef.current = 0;
    }
  };

  const handleWindowDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleWindowDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingWindow(false);
    dragCounterRef.current = 0;

    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      for (let i = 0; i < files.length; i++) {
        if (files[i].type.startsWith("image/")) {
          processReferenceImageFile(files[i]);
          break;
        }
      }
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    processReferenceImageFile(files[0]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handlePinAsReference = (img: GeneratedImage) => {
    if (referenceImages.length >= 4) {
      toast("Tối đa 4 ảnh tham chiếu. Hãy xóa bớt trước khi thêm.", "info");
      return;
    }
    const newRef: ImageReference = {
      id: `ref_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      url: img.url,
      fileName: img.fileName,
      role: "style",
      weight: 0.8,
    };
    setReferenceImages((prev) => [...prev, newRef]);
    toast("📌 Đã ghim ảnh vào Bảng Tham Chiếu Flow!", "success");
  };

  const handleRemoveReference = (id: string) => {
    setReferenceImages((prev) => prev.filter((r) => r.id !== id));
  };

  const handleGenerate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanPrompt = prompt.trim();
    if (!cleanPrompt) {
      toast("Vui lòng nhập mô tả ảnh bạn muốn tạo", "error");
      return;
    }

    setIsGenerating(true);
    setActiveTab("canvas");

    try {
      const payload: Record<string, unknown> = {
        prompt: cleanPrompt,
        aspectRatio: selectedRatio,
        modelId: selectedModel || undefined,
        count: batchCount,
      };

      if (selectedStyle) {
        payload.style = selectedStyle;
      }

      if (referenceImages.length > 0) {
        payload.referenceImages = referenceImages.map((r) => ({
          url: r.url,
          role: r.role,
          weight: r.weight,
          fileName: r.fileName,
        }));
      }

      if (negativePrompt.trim()) {
        payload.negativePrompt = negativePrompt.trim();
      }

      const res = await fetch("/api/images/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Không thể tạo ảnh, vui lòng kiểm tra endpoint.");
      }

      const returnedImages: GeneratedImage[] = Array.isArray(data.images) && data.images.length > 0
        ? data.images
        : data.image
        ? [data.image]
        : [];

      if (returnedImages.length === 0) {
        throw new Error("Endpoint không trả về kết quả hình ảnh nào.");
      }

      setCurrentBatch(returnedImages);
      setSelectedImageIndex(0);
      saveBatchToHistory(returnedImages);
      toast(
        returnedImages.length > 1
          ? `✨ Đã tạo thành công loạt ${returnedImages.length} ảnh!`
          : "✨ Đã tạo hình ảnh thành công!",
        "success"
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Lỗi khi tạo ảnh.";
      toast(msg, "error");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleClearHistory = () => {
    if (confirm("Bạn có chắc chắn muốn xóa toàn bộ lịch sử tạo ảnh này không?")) {
      setHistory([]);
      localStorage.removeItem(STORAGE_KEY);
      toast("Đã xóa lịch sử tạo ảnh", "info");
    }
  };

  const handleCopyPrompt = async (text: string, id: string) => {
    if (await copyText(text)) {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1800);
      toast("Đã sao chép prompt", "success");
    }
  };

  const handleRemix = (img: GeneratedImage) => {
    setPrompt(img.prompt);
    if (img.aspectRatio) setSelectedRatio(img.aspectRatio);
    if (img.style) setSelectedStyle(img.style);
    toast("🔄 Đã nạp lại thông số để tạo biến thể mới!", "info");
  };

  const currentHeroImage = currentBatch[selectedImageIndex] || currentBatch[0] || null;

  return (
    <div
      className="h-full flex flex-col bg-[#121110] text-[#ECEBE4] overflow-hidden select-none relative"
      onDragEnter={handleWindowDragEnter}
      onDragOver={handleWindowDragOver}
      onDragLeave={handleWindowDragLeave}
      onDrop={handleWindowDrop}
    >
      <Toasts />

      {/* Global Drag & Drop Overlay */}
      {isDraggingWindow && (
        <div className="absolute inset-0 z-50 bg-[#181715]/90 backdrop-blur-md border-2 border-dashed border-[#D97757] flex flex-col items-center justify-center pointer-events-none animate-in fade-in duration-150">
          <div className="h-16 w-16 rounded-3xl bg-[#D97757]/20 border border-[#D97757]/50 flex items-center justify-center text-[#D97757] mb-3 shadow-[0_0_30px_rgba(217,119,87,0.4)] animate-bounce">
            <Upload size={32} />
          </div>
          <h2 className="text-lg font-bold text-white mb-1">Thả ảnh vào đây</h2>
          <p className="text-xs text-[#A6A49B]">
            Ảnh sẽ tự động được thêm vào Bảng Tham Chiếu phong cách Flow
          </p>
        </div>
      )}

      {/* Hidden File Input for Reference Images */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileInputChange}
        accept="image/png,image/jpeg,image/webp,image/jpg"
        className="hidden"
      />

      {/* TOP NAVBAR */}
      <header className="border-b border-white/[0.08] bg-[#181715] px-4 py-2.5 shrink-0 z-20 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-[#D97757] to-[#E2886A] flex items-center justify-center text-white shadow-[0_0_12px_rgba(217,119,87,0.35)]">
            <Sparkles size={16} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm sm:text-base font-bold text-[#ECEBE4]">
                Google Flow Studio
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#D97757]/15 text-[#E2886A] border border-[#D97757]/30 flex items-center gap-1">
                <Flame size={10} className="text-[#D97757]" /> Flow Canvas
              </span>
            </div>
          </div>
        </div>

        {/* Top Right Controls */}
        <div className="flex items-center gap-2">
          {/* Reference Board Trigger */}
          <button
            type="button"
            onClick={() => setShowRefBoardModal(true)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer",
              referenceImages.length > 0
                ? "bg-[#D97757]/20 border-[#D97757]/50 text-[#E2886A] shadow-[0_0_15px_rgba(217,119,87,0.25)]"
                : "bg-white/[0.04] border-white/10 text-[#A6A49B] hover:text-[#ECEBE4] hover:bg-white/[0.08]"
            )}
            title="Mở Bảng Ảnh Tham Chiếu (Kéo thả, dán Clipboard)"
          >
            <Layers size={13} className={referenceImages.length > 0 ? "text-[#D97757]" : undefined} />
            <span>Bảng Tham Chiếu</span>
            {referenceImages.length > 0 && (
              <span className="h-4 w-4 rounded-full bg-[#D97757] text-white text-[10px] font-bold flex items-center justify-center">
                {referenceImages.length}
              </span>
            )}
          </button>

          {/* Tab Switcher */}
          <div className="flex items-center p-0.5 bg-black/40 rounded-xl border border-white/[0.08] text-xs">
            <button
              type="button"
              onClick={() => setActiveTab("canvas")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1 rounded-lg font-medium transition-all cursor-pointer",
                activeTab === "canvas"
                  ? "bg-[#D97757] text-white font-semibold shadow-xs"
                  : "text-[#A6A49B] hover:text-[#ECEBE4]"
              )}
            >
              <Compass size={13} />
              <span>Canvas Flow</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("history")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1 rounded-lg font-medium transition-all cursor-pointer",
                activeTab === "history"
                  ? "bg-[#D97757] text-white font-semibold shadow-xs"
                  : "text-[#A6A49B] hover:text-[#ECEBE4]"
              )}
            >
              <History size={13} />
              <span>Lịch sử ({history.length})</span>
            </button>
          </div>

          {user?.role === "admin" && (
            <Link
              href="/admin/models"
              className="hidden md:inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-[#A6A49B] hover:text-[#ECEBE4] hover:bg-white/[0.06] border border-white/10 transition-colors"
              title="Cấu hình Model trong Admin"
            >
              <Sliders size={12} className="text-[#D97757]" />
              <span>Admin Models</span>
            </Link>
          )}

          <Link
            href="/app"
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-[#A6A49B] hover:text-[#ECEBE4] hover:bg-white/[0.06] border border-white/10 transition-colors"
          >
            <span>Về Chat</span>
            <ChevronRight size={13} />
          </Link>
        </div>
      </header>

      {/* MAIN TWO-PANEL WORKSPACE (No fixed bottom bar, 100% visible) */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
        {/* ========================================================================= */}
        {/* LEFT PANEL: CREATIVE CONTROLS                                             */}
        {/* ========================================================================= */}
        <aside className="w-full lg:w-[380px] xl:w-[410px] shrink-0 border-b lg:border-b-0 lg:border-r border-white/[0.08] bg-[#161513] flex flex-col min-h-0 overflow-y-auto thin-scroll">
          <div className="p-4 sm:p-5 space-y-4">
            {/* Quick Inspiration Pills */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-[#A6A49B]">
                <span className="flex items-center gap-1 font-medium">
                  <Lightbulb size={13} className="text-[#D97757]" /> Gợi ý Flow nhanh:
                </span>
              </div>
              <div className="flex items-center gap-1.5 overflow-x-auto thin-scroll pb-1">
                {PROMPT_INSPIRATIONS.map((item, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setPrompt(item.prompt);
                      setSelectedStyle(item.style);
                      setSelectedRatio(item.ratio);
                    }}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-sans text-[#A6A49B] bg-[#201F1C] hover:bg-[#D97757]/15 hover:text-[#ECEBE4] hover:border-[#D97757]/40 border border-white/[0.06] transition-all shrink-0 cursor-pointer"
                  >
                    {item.title}
                  </button>
                ))}
              </div>
            </div>

            {/* Prompt Textarea */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-semibold text-[#ECEBE4]">
                <span>Ý tưởng tạo ảnh (Prompt)</span>
                {prompt && (
                  <button
                    type="button"
                    onClick={() => setPrompt("")}
                    className="text-[11px] text-[#75736C] hover:text-[#ECEBE4] transition-colors"
                  >
                    Xóa
                  </button>
                )}
              </div>
              <div className="relative rounded-2xl bg-[#201F1C] border border-white/10 p-2.5 focus-within:border-[#D97757]/60 transition-colors">
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                      e.preventDefault();
                      handleGenerate();
                    }
                  }}
                  rows={3}
                  placeholder="Mô tả chi tiết bức ảnh bạn muốn AI tạo (VD: Chú rồng vàng phương Đông bay lượn trên biển mây Fansipan tuyết trắng phủ mờ...)"
                  className="w-full bg-transparent outline-none text-xs sm:text-sm text-[#ECEBE4] placeholder-[#75736C] resize-none leading-relaxed"
                />
                <div className="flex items-center justify-between pt-1 border-t border-white/[0.04] text-[10px] text-[#75736C]">
                  <span>Nhấn Ctrl + Enter để tạo</span>
                  <span>{prompt.length} ký tự</span>
                </div>
              </div>
            </div>

            {/* BẢNG ẢNH THAM CHIẾU (DEDICATED REFERENCE BOARD CARD) */}
            <div className="rounded-2xl bg-[#1C1B18] border border-white/10 p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Layers size={14} className="text-[#D97757]" />
                  <span className="text-xs font-bold text-[#ECEBE4]">Bảng Ảnh Tham Chiếu</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-[#D97757]/15 text-[#E2886A] font-semibold border border-[#D97757]/30">
                    {referenceImages.length}/4
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowRefBoardModal(true)}
                  className="text-[11px] font-semibold text-[#D97757] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <span>Mở bảng riêng</span>
                  <ExternalLink size={11} />
                </button>
              </div>

              {/* Drag/Drop and Paste mini dropzone */}
              {referenceImages.length === 0 ? (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="p-3.5 rounded-xl border border-dashed border-white/15 bg-black/25 hover:bg-white/[0.03] hover:border-[#D97757]/50 transition-all text-center cursor-pointer flex flex-col items-center justify-center gap-1.5 group"
                >
                  <div className="flex items-center gap-2 text-[#A6A49B] group-hover:text-[#D97757] transition-colors">
                    <Upload size={15} />
                    <ClipboardPaste size={15} />
                  </div>
                  <p className="text-xs font-medium text-[#ECEBE4]">
                    Kéo thả ảnh hoặc dán <span className="text-[#E2886A] font-mono font-bold">Ctrl + V</span>
                  </p>
                  <span className="text-[10px] text-[#75736C]">
                    Nhấp để duyệt tệp hoặc dán trực tiếp ảnh chụp màn hình
                  </span>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    {referenceImages.map((refImg) => (
                      <div
                        key={refImg.id}
                        className="group relative rounded-xl overflow-hidden bg-black/40 border border-white/10 p-1.5 flex items-center gap-2"
                      >
                        <div className="h-11 w-11 rounded-lg overflow-hidden bg-black/70 shrink-0 border border-white/10">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={refImg.url} alt="Ref" className="w-full h-full object-cover" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-semibold text-[#ECEBE4] truncate">
                            {refImg.fileName || "Ảnh tham chiếu"}
                          </p>
                          <span className="text-[10px] font-medium text-[#E2886A] block">
                            {refImg.role === "style" ? "🎨 Phong cách" : refImg.role === "subject" ? "👤 Chủ thể" : "📐 Bố cục"}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveReference(refImg.id)}
                          className="absolute top-1 right-1 p-1 rounded-md bg-black/70 text-[#A6A49B] hover:text-white hover:bg-red-500/50 transition-colors"
                          title="Xóa ảnh này"
                        >
                          <X size={10} />
                        </button>
                      </div>
                    ))}
                  </div>

                  {referenceImages.length < 4 && (
                    <button
                      type="button"
                      onClick={() => setShowRefBoardModal(true)}
                      className="w-full py-1.5 rounded-xl border border-dashed border-white/15 hover:border-[#D97757]/40 text-xs text-[#A6A49B] hover:text-[#ECEBE4] flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                    >
                      <Plus size={13} />
                      <span>Thêm ảnh khác vào Bảng Tham Chiếu</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* BATCH COUNT SELECTOR (1, 2, 4 ảnh) */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#ECEBE4] block">
                Số lượng ảnh tạo cùng lúc
              </label>
              <div className="grid grid-cols-3 gap-2 p-1 bg-black/40 rounded-xl border border-white/10">
                {[1, 2, 4].map((cnt) => (
                  <button
                    key={cnt}
                    type="button"
                    onClick={() => setBatchCount(cnt)}
                    className={cn(
                      "py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-1",
                      batchCount === cnt
                        ? "bg-[#D97757] text-white shadow-xs"
                        : "text-[#A6A49B] hover:text-[#ECEBE4] hover:bg-white/[0.04]"
                    )}
                  >
                    <span>{cnt} ảnh</span>
                    {cnt > 1 && <span className="text-[10px] opacity-75">({cnt}x)</span>}
                  </button>
                ))}
              </div>
            </div>

            {/* ASPECT RATIO SELECTOR */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#ECEBE4] block">
                Tỷ lệ khung hình
              </label>
              <div className="grid grid-cols-5 gap-1.5 p-1 bg-black/40 rounded-xl border border-white/10">
                {ASPECT_RATIO_OPTIONS.map((ar) => (
                  <button
                    key={ar.id}
                    type="button"
                    onClick={() => setSelectedRatio(ar.id)}
                    className={cn(
                      "py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer flex flex-col items-center justify-center",
                      selectedRatio === ar.id
                        ? "bg-white/15 text-[#ECEBE4] font-semibold"
                        : "text-[#A6A49B] hover:text-[#ECEBE4]"
                    )}
                    title={`${ar.id} - ${ar.sub}`}
                  >
                    <span className="text-[11px] font-bold">{ar.id}</span>
                    <span className="text-[9px] text-[#75736C]">{ar.sub}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* ART STYLE SELECTOR (Không bắt buộc dùng - Mặc định Tự do!) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-semibold text-[#ECEBE4]">
                <span>Phong cách nghệ thuật</span>
                <span className="text-[10px] text-[#A6A49B] font-normal">Không bắt buộc</span>
              </div>
              <div className="relative">
                <select
                  value={selectedStyle}
                  onChange={(e) => setSelectedStyle(e.target.value)}
                  className={cn(
                    "w-full px-3 py-2 rounded-xl text-xs font-medium border outline-none cursor-pointer appearance-none pr-8 transition-all",
                    selectedStyle
                      ? "bg-[#D97757]/15 border-[#D97757]/40 text-[#E2886A]"
                      : "bg-[#201F1C] border-white/10 text-[#ECEBE4]"
                  )}
                >
                  {STYLE_OPTIONS.map((st) => (
                    <option key={st.id} value={st.id} className="bg-[#242321] text-[#ECEBE4]">
                      {st.icon} {st.label} {st.id === "" ? "(Mặc định - Tự do)" : ""}
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-2.5 pointer-events-none text-[#75736C]" />
              </div>
            </div>

            {/* ADVANCED SETTINGS ACCORDION */}
            <div className="pt-2 border-t border-white/[0.06] space-y-2">
              <button
                type="button"
                onClick={() => setShowAdvanced((v) => !v)}
                className="w-full flex items-center justify-between text-xs font-medium text-[#A6A49B] hover:text-[#ECEBE4] transition-colors cursor-pointer py-1"
              >
                <span className="flex items-center gap-1.5">
                  <SlidersHorizontal size={12} className={negativePrompt ? "text-[#D97757]" : undefined} />
                  <span>Cài đặt nâng cao (Negative Prompt, Model)</span>
                </span>
                <ChevronDown
                  size={13}
                  className={cn("transition-transform duration-200", showAdvanced && "rotate-180")}
                />
              </button>

              {showAdvanced && (
                <div className="space-y-3 pt-1 animate-in fade-in duration-150">
                  {/* Negative Prompt */}
                  <div>
                    <label className="text-[11px] font-semibold text-[#A6A49B] block mb-1">
                      Negative Prompt (Chi tiết cần loại bỏ):
                    </label>
                    <input
                      type="text"
                      value={negativePrompt}
                      onChange={(e) => setNegativePrompt(e.target.value)}
                      placeholder="VD: mờ ảo, biến dạng, watermark, chữ xấu..."
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-[#ECEBE4] placeholder-[#75736C] outline-none focus:border-[#D97757]/50"
                    />
                  </div>

                  {/* Model Selector */}
                  <div>
                    <label className="text-[11px] font-semibold text-[#A6A49B] block mb-1">
                      Mô hình AI tạo ảnh:
                    </label>
                    <select
                      value={selectedModel}
                      onChange={(e) => setSelectedModel(e.target.value)}
                      disabled={modelsLoading}
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-[#ECEBE4] outline-none focus:border-[#D97757]/50 cursor-pointer"
                    >
                      {availableModels.map((m) => (
                        <option key={m.id} value={m.id} className="bg-[#242321] text-[#ECEBE4]">
                          {m.name || m.id} {m.id === activeRoute ? "★ (Mặc định)" : ""}
                        </option>
                      ))}
                      {availableModels.length === 0 && (
                        <option value="" className="bg-[#242321] text-[#ECEBE4]">
                          Custom Image Server (Hamter / Gemini)
                        </option>
                      )}
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* GENERATE BUTTON */}
            <div className="pt-2">
              <button
                type="button"
                onClick={() => handleGenerate()}
                disabled={isGenerating || !prompt.trim()}
                className={cn(
                  "w-full py-3 rounded-2xl font-bold text-sm text-white flex items-center justify-center gap-2 transition-all shadow-xl active:scale-[0.99] cursor-pointer border border-[#D97757]/40",
                  isGenerating || !prompt.trim()
                    ? "bg-[#D97757]/30 text-white/40 cursor-not-allowed border-white/5"
                    : "bg-gradient-to-r from-[#D97757] to-[#E2886A] hover:brightness-110 shadow-[0_0_25px_rgba(217,119,87,0.45)]"
                )}
              >
                {isGenerating ? (
                  <>
                    <RefreshCw size={16} className="animate-spin text-white" />
                    <span>Đang kết xuất pixel…</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={16} />
                    <span>Sáng tạo {batchCount > 1 ? `(${batchCount} ảnh)` : "ảnh"}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </aside>

        {/* ========================================================================= */}
        {/* RIGHT AREA: CREATIVE CANVAS & GALLERY                                     */}
        {/* ========================================================================= */}
        <section className="flex-1 flex flex-col min-w-0 min-h-0 bg-[#121110] overflow-y-auto thin-scroll p-4 sm:p-6">
          {activeTab === "history" ? (
            /* HISTORY GALLERY */
            <div className="max-w-6xl mx-auto w-full space-y-4">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div>
                  <h2 className="text-sm font-bold text-[#ECEBE4] flex items-center gap-2">
                    <History size={16} className="text-[#D97757]" />
                    <span>Lịch sử tác phẩm ({history.length})</span>
                  </h2>
                  <p className="text-xs text-[#75736C] mt-0.5">
                    Nhấp vào ảnh để xem lại hoặc ghim làm ảnh tham chiếu phong cách
                  </p>
                </div>
                {history.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearHistory}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-[#A6A49B] hover:text-red-400 hover:bg-red-500/10 border border-white/10 transition-colors cursor-pointer"
                  >
                    <Trash2 size={13} />
                    <span>Xóa lịch sử</span>
                  </button>
                )}
              </div>

              {history.length === 0 ? (
                <div className="py-20 text-center">
                  <ImageIcon size={36} className="mx-auto text-[#75736C] mb-2 opacity-40" />
                  <p className="text-sm font-medium text-[#A6A49B]">Chưa có tác phẩm nào được lưu</p>
                  <p className="text-xs text-[#75736C] mt-1">Chuyển sang Canvas Flow để bắt đầu sáng tạo</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3.5">
                  {history.map((img) => (
                    <div
                      key={img.id || img.url}
                      className="group relative rounded-2xl overflow-hidden bg-[#181715] border border-white/10 hover:border-[#D97757]/60 transition-all shadow-md cursor-pointer aspect-square"
                      onClick={() => {
                        setCurrentBatch([img]);
                        setSelectedImageIndex(0);
                        setActiveTab("canvas");
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={img.url}
                        alt={img.prompt}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-2.5 flex flex-col justify-between">
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePinAsReference(img);
                            }}
                            className="p-1.5 rounded-lg bg-black/70 text-white hover:bg-[#D97757] transition-colors"
                            title="Ghim làm ảnh tham chiếu"
                          >
                            <Pin size={12} />
                          </button>
                          <a
                            href={img.url}
                            download={img.fileName}
                            onClick={(e) => e.stopPropagation()}
                            className="p-1.5 rounded-lg bg-black/70 text-white hover:bg-[#D97757] transition-colors"
                            title="Tải ảnh"
                          >
                            <Download size={12} />
                          </a>
                        </div>
                        <div>
                          <p className="text-[11px] text-white line-clamp-2 leading-snug">
                            {img.prompt}
                          </p>
                          <div className="flex items-center gap-1.5 mt-1 text-[10px] text-[#D97757] font-mono">
                            <span>{img.aspectRatio}</span>
                            <span className="text-white/40">·</span>
                            <span className="text-white/70 truncate">{img.model}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* CANVAS FLOW DISPLAY */
            <div className="max-w-6xl mx-auto w-full h-full flex flex-col">
              {isGenerating ? (
                /* LOADING SHIMMER SKELETONS */
                <div className="flex-1 rounded-3xl bg-[#171614] border border-white/[0.08] p-6 flex flex-col items-center justify-center shadow-xl">
                  <div className="h-12 w-12 rounded-2xl bg-[#D97757]/20 border border-[#D97757]/40 flex items-center justify-center text-[#D97757] mb-3 animate-pulse shadow-[0_0_20px_rgba(217,119,87,0.3)]">
                    <Sparkles size={24} className="animate-spin-slow" />
                  </div>
                  <h3 className="text-base font-bold text-[#ECEBE4] mb-1">
                    Đang kết xuất {batchCount > 1 ? `loạt ${batchCount} ảnh Flow` : "tác phẩm Flow"}…
                  </h3>
                  <p className="text-xs text-[#A6A49B] max-w-sm text-center mb-6">
                    {referenceImages.length > 0
                      ? `Đang áp dụng ${referenceImages.length} ảnh từ Bảng Tham Chiếu & kết xuất pixel chất lượng cao.`
                      : "Hệ thống AI đang tổng hợp chi tiết màu sắc, bố cục và độ sắc nét."}
                  </p>

                  <div
                    className={cn(
                      "w-full max-w-3xl grid gap-4",
                      batchCount === 1 && "grid-cols-1 max-w-md",
                      batchCount === 2 && "grid-cols-1 sm:grid-cols-2",
                      batchCount === 4 && "grid-cols-2 sm:grid-cols-4"
                    )}
                  >
                    {Array.from({ length: batchCount }).map((_, i) => (
                      <div
                        key={i}
                        className="rounded-2xl bg-[#201F1C] border border-white/[0.06] p-4 aspect-square flex flex-col justify-end overflow-hidden relative animate-pulse"
                      >
                        <div className="w-full h-2 bg-white/10 rounded-full mb-2" />
                        <div className="w-2/3 h-2 bg-white/10 rounded-full" />
                      </div>
                    ))}
                  </div>
                </div>
              ) : currentBatch.length > 0 ? (
                /* RENDERED BATCH DISPLAY */
                <div className="flex-1 flex flex-col space-y-3">
                  {/* Top Bar on Canvas */}
                  <div className="flex items-center justify-between px-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-[#A6A49B] uppercase tracking-wider">
                        Tác phẩm hiện tại ({currentBatch.length} ảnh)
                      </span>
                      {currentBatch[0]?.style && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-white/[0.06] text-[#E2886A] border border-white/10">
                          {currentBatch[0].style}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopyPrompt(currentBatch[0].prompt, "top")}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-[#A6A49B] hover:text-[#ECEBE4] hover:bg-white/[0.06] border border-white/10 transition-colors cursor-pointer"
                    >
                      {copiedId === "top" ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                      <span>Sao chép Prompt</span>
                    </button>
                  </div>

                  {/* 1 Image: Large Hero */}
                  {currentBatch.length === 1 && currentHeroImage ? (
                    <div className="flex-1 rounded-3xl bg-[#171614] border border-white/[0.08] p-4 sm:p-6 flex flex-col items-center justify-center relative group shadow-2xl">
                      <div className="relative max-h-[620px] max-w-full flex items-center justify-center">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={currentHeroImage.url}
                          alt={currentHeroImage.prompt}
                          className="max-h-[580px] max-w-full object-contain rounded-2xl shadow-2xl cursor-pointer transition-transform duration-300 group-hover:scale-[1.008]"
                          onClick={() => setLightboxImg(currentHeroImage)}
                        />

                        {/* Top Badge */}
                        <div className="absolute top-3 left-3 px-3 py-1 rounded-full bg-black/80 backdrop-blur-md border border-white/15 text-xs text-white flex items-center gap-2">
                          <span className="font-mono text-[#E2886A]">{currentHeroImage.aspectRatio}</span>
                          <span className="text-white/40">·</span>
                          <span>{currentHeroImage.width}x{currentHeroImage.height}</span>
                        </div>

                        {/* Bottom Actions Bar */}
                        <div className="absolute bottom-3 right-3 flex items-center gap-1.5 p-1.5 rounded-2xl bg-black/85 backdrop-blur-md border border-white/15 shadow-2xl">
                          <button
                            type="button"
                            onClick={() => handlePinAsReference(currentHeroImage)}
                            className="px-3 py-1.5 rounded-xl bg-white/[0.08] hover:bg-[#D97757] text-white text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer"
                            title="Ghim vào Bảng Tham Chiếu"
                          >
                            <Pin size={12} />
                            <span>Ghim vào Bảng tham chiếu</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemix(currentHeroImage)}
                            className="p-1.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.18] text-white transition-all cursor-pointer"
                            title="Tạo biến thể mới"
                          >
                            <RefreshCw size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setLightboxImg(currentHeroImage)}
                            className="p-1.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.18] text-white transition-all cursor-pointer"
                            title="Xem phóng to"
                          >
                            <Maximize2 size={14} />
                          </button>
                          <a
                            href={currentHeroImage.url}
                            download={currentHeroImage.fileName}
                            className="px-3 py-1.5 rounded-xl bg-[#D97757] hover:bg-[#E2886A] text-white text-xs font-medium transition-all flex items-center gap-1.5 shadow-sm"
                            title="Tải ảnh về máy"
                          >
                            <Download size={13} />
                            <span>Tải về</span>
                          </a>
                        </div>
                      </div>

                      {/* Prompt caption below image */}
                      <p className="mt-3 text-xs text-[#A6A49B] text-center max-w-2xl line-clamp-2">
                        {currentHeroImage.prompt}
                      </p>
                    </div>
                  ) : (
                    /* 2 or 4 Images: Batch Grid */
                    <div
                      className={cn(
                        "grid gap-4 flex-1",
                        currentBatch.length === 2 && "grid-cols-1 sm:grid-cols-2",
                        currentBatch.length >= 3 && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
                      )}
                    >
                      {currentBatch.map((img, idx) => (
                        <div
                          key={img.id || idx}
                          className="group relative rounded-2xl overflow-hidden bg-[#181715] border border-white/10 hover:border-[#D97757]/80 transition-all shadow-xl aspect-square flex items-center justify-center cursor-pointer"
                          onClick={() => setLightboxImg(img)}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={img.url}
                            alt={img.prompt}
                            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                          />

                          {/* Index Badge */}
                          <div className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-md bg-black/70 backdrop-blur-md border border-white/15 text-[11px] font-mono font-semibold text-white">
                            #{idx + 1}
                          </div>

                          {/* Hover Actions */}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-3 flex flex-col justify-between">
                            <div className="flex justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handlePinAsReference(img);
                                }}
                                className="p-1.5 rounded-lg bg-black/70 text-white hover:bg-[#D97757] transition-colors"
                                title="Ghim vào Bảng Tham Chiếu"
                              >
                                <Pin size={13} />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRemix(img);
                                }}
                                className="p-1.5 rounded-lg bg-black/70 text-white hover:bg-white/20 transition-colors"
                                title="Remix thông số này"
                              >
                                <RefreshCw size={13} />
                              </button>
                              <a
                                href={img.url}
                                download={img.fileName}
                                onClick={(e) => e.stopPropagation()}
                                className="p-1.5 rounded-lg bg-[#D97757] hover:bg-[#E2886A] text-white transition-colors"
                                title="Tải ảnh"
                              >
                                <Download size={13} />
                              </a>
                            </div>
                            <div>
                              <p className="text-xs text-white font-medium line-clamp-1">
                                {img.prompt}
                              </p>
                              <span className="text-[10px] text-[#E2886A] font-mono mt-0.5 block">
                                {img.aspectRatio} · {img.width}x{img.height}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                /* EMPTY STATE */
                <div className="flex-1 rounded-3xl bg-[#171614] border border-white/[0.08] p-8 flex flex-col items-center justify-center text-center shadow-xl">
                  <div className="h-14 w-14 rounded-2xl bg-[#D97757]/15 border border-[#D97757]/30 flex items-center justify-center text-[#D97757] mb-3 shadow-[0_0_20px_rgba(217,119,87,0.2)]">
                    <Palette size={24} />
                  </div>
                  <h3 className="text-base font-bold text-[#ECEBE4] mb-1">
                    Khởi tạo tác phẩm trên Flow Canvas
                  </h3>
                  <p className="text-xs text-[#A6A49B] max-w-sm mb-5 leading-relaxed">
                    Nhập ý tưởng bên trái, mở Bảng Tham Chiếu nếu muốn định hình phong cách, và bấm <strong>Sáng tạo</strong> để tạo tác phẩm độc bản.
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowRefBoardModal(true)}
                      className="px-4 py-2 rounded-xl text-xs font-semibold bg-white/[0.06] hover:bg-white/[0.12] text-[#ECEBE4] border border-white/10 transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
                    >
                      <Layers size={13} className="text-[#D97757]" />
                      <span>Mở Bảng Ảnh Tham Chiếu</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPrompt(PROMPT_INSPIRATIONS[0].prompt);
                        setSelectedStyle(PROMPT_INSPIRATIONS[0].style);
                        setSelectedRatio(PROMPT_INSPIRATIONS[0].ratio);
                      }}
                      className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#D97757] hover:bg-[#E2886A] text-white transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
                    >
                      <Sparkles size={13} />
                      <span>Thử prompt mẫu ngay</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      {/* ========================================================================= */}
      {/* BẢNG ẢNH THAM CHIẾU RIÊNG BIỆT (DEDICATED REFERENCE BOARD MODAL)          */}
      {/* Hỗ trợ KÉO THẢ, DÁN ẢNH TỪ CLIPBOARD (Ctrl+V), THIẾT LẬP VAI TRÒ & TRỌNG SỐ*/}
      {/* ========================================================================= */}
      {showRefBoardModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 select-none animate-in fade-in duration-200"
          role="dialog"
          aria-modal="true"
          onClick={() => setShowRefBoardModal(false)}
        >
          <div
            className="w-full max-w-2xl rounded-3xl bg-[#181715] border border-white/15 shadow-[0_20px_60px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between shrink-0 bg-[#201F1C]">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl bg-[#D97757]/20 border border-[#D97757]/40 flex items-center justify-center text-[#D97757]">
                  <Layers size={18} />
                </div>
                <div>
                  <h2 className="text-base font-bold text-[#ECEBE4] flex items-center gap-2">
                    <span>Bảng Ảnh Tham Chiếu (Reference Board)</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-[#D97757]/20 text-[#E2886A] font-mono">
                      {referenceImages.length}/4
                    </span>
                  </h2>
                  <p className="text-xs text-[#A6A49B]">
                    Hỗ trợ kéo thả ảnh vào bảng hoặc nhấn <strong className="text-[#ECEBE4]">Ctrl + V</strong> để dán từ bộ nhớ tạm
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowRefBoardModal(false)}
                className="h-8 w-8 rounded-xl bg-white/5 hover:bg-white/15 text-[#A6A49B] hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                title="Đóng (Esc)"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-5 overflow-y-auto thin-scroll flex-1">
              {/* Drag & Drop & Clipboard Paste Zone */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="p-6 rounded-2xl border-2 border-dashed border-white/20 hover:border-[#D97757] bg-black/30 hover:bg-white/[0.02] transition-all text-center cursor-pointer flex flex-col items-center justify-center gap-2 group"
              >
                <div className="h-12 w-12 rounded-2xl bg-white/5 group-hover:bg-[#D97757]/20 flex items-center justify-center text-[#A6A49B] group-hover:text-[#D97757] transition-all">
                  <Upload size={22} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#ECEBE4]">
                    Kéo thả ảnh vào đây, hoặc nhấn <span className="text-[#E2886A] font-mono px-1.5 py-0.5 rounded bg-white/10">Ctrl + V</span> để dán
                  </p>
                  <p className="text-xs text-[#75736C] mt-1">
                    Hỗ trợ tệp PNG, JPG, WebP hoặc ảnh chụp màn hình từ Snipping Tool
                  </p>
                </div>
              </div>

              {/* Reference Image Cards Grid */}
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs font-semibold text-[#ECEBE4]">
                  <span>Danh sách ảnh tham chiếu đang kích hoạt</span>
                  {referenceImages.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setReferenceImages([])}
                      className="text-[#75736C] hover:text-red-400 text-xs transition-colors"
                    >
                      Xóa tất cả
                    </button>
                  )}
                </div>

                {referenceImages.length === 0 ? (
                  <div className="py-8 text-center text-xs text-[#75736C] bg-black/20 rounded-2xl border border-white/5">
                    Chưa có ảnh tham chiếu nào. Hãy kéo thả ảnh hoặc dán ảnh từ clipboard ở trên.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {referenceImages.map((refImg) => (
                      <div
                        key={refImg.id}
                        className="rounded-2xl bg-[#201F1C] border border-white/10 p-3 flex flex-col justify-between gap-3 shadow-md"
                      >
                        <div className="flex items-start gap-3">
                          {/* Thumbnail */}
                          <div className="h-16 w-16 rounded-xl overflow-hidden bg-black/60 shrink-0 border border-white/10 relative group">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={refImg.url} alt="Ref" className="w-full h-full object-cover" />
                          </div>

                          {/* Info and Role */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-bold text-[#ECEBE4] truncate max-w-[150px]">
                                {refImg.fileName || "Ảnh tham chiếu"}
                              </p>
                              <button
                                type="button"
                                onClick={() => handleRemoveReference(refImg.id)}
                                className="text-[#75736C] hover:text-red-400 p-1 rounded transition-colors cursor-pointer"
                                title="Xóa ảnh"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>

                            {/* Role Selector Pills */}
                            <div className="mt-2 space-y-1">
                              <label className="text-[10px] text-[#A6A49B] block font-medium">
                                Vai trò tham chiếu:
                              </label>
                              <div className="grid grid-cols-3 gap-1">
                                {[
                                  { id: "style", label: "Phong cách" },
                                  { id: "subject", label: "Chủ thể" },
                                  { id: "composition", label: "Bố cục" },
                                ].map((roleOpt) => (
                                  <button
                                    key={roleOpt.id}
                                    type="button"
                                    onClick={() => {
                                      setReferenceImages((prev) =>
                                        prev.map((r) =>
                                          r.id === refImg.id
                                            ? { ...r, role: roleOpt.id as "style" | "subject" | "composition" }
                                            : r
                                        )
                                      );
                                    }}
                                    className={cn(
                                      "py-1 rounded-lg text-[10px] font-semibold transition-all text-center cursor-pointer",
                                      refImg.role === roleOpt.id
                                        ? "bg-[#D97757] text-white shadow-xs"
                                        : "bg-black/30 text-[#A6A49B] hover:text-white"
                                    )}
                                  >
                                    {roleOpt.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Weight Slider */}
                        <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between gap-3 text-xs">
                          <span className="text-[11px] text-[#A6A49B]">Mức độ ảnh hưởng:</span>
                          <div className="flex items-center gap-2 flex-1 max-w-[140px]">
                            <input
                              type="range"
                              min="0.2"
                              max="1"
                              step="0.1"
                              value={refImg.weight}
                              onChange={(e) => {
                                const w = parseFloat(e.target.value);
                                setReferenceImages((prev) =>
                                  prev.map((r) => (r.id === refImg.id ? { ...r, weight: w } : r))
                                );
                              }}
                              className="w-full accent-[#D97757] cursor-pointer"
                            />
                            <span className="font-mono text-[11px] text-[#E2886A] font-bold w-8 text-right">
                              {Math.round(refImg.weight * 100)}%
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3 border-t border-white/10 bg-[#201F1C] flex items-center justify-between shrink-0">
              <span className="text-xs text-[#A6A49B]">
                {referenceImages.length > 0
                  ? `Đang áp dụng ${referenceImages.length} ảnh tham chiếu vào lượt tạo kế tiếp`
                  : "Chưa chọn ảnh tham chiếu nào"}
              </span>
              <button
                type="button"
                onClick={() => setShowRefBoardModal(false)}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-[#D97757] hover:bg-[#E2886A] text-white transition-all shadow-md cursor-pointer"
              >
                Xác nhận & Áp dụng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FULLSCREEN LIGHTBOX MODAL */}
      {lightboxImg && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/95 backdrop-blur-md p-4 select-none animate-in fade-in duration-200"
          role="dialog"
          aria-modal="true"
          onClick={() => setLightboxImg(null)}
        >
          <div
            className="w-full max-w-5xl flex items-center justify-between mb-3 px-2 shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="text-xs font-mono text-[#A6A49B] truncate max-w-md">
              {lightboxImg.prompt}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handlePinAsReference(lightboxImg)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-white/10 hover:bg-[#D97757] border border-white/10 transition-colors cursor-pointer"
              >
                <Pin size={13} />
                <span>Ghim vào Bảng tham chiếu</span>
              </button>
              <a
                href={lightboxImg.url}
                download={lightboxImg.fileName}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-[#D97757] hover:bg-[#E2886A] transition-colors"
              >
                <Download size={13} />
                <span>Tải về</span>
              </a>
              <button
                type="button"
                onClick={() => setLightboxImg(null)}
                className="h-8 w-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center shadow-md transition-all cursor-pointer"
                title="Đóng (Esc)"
              >
                ✕
              </button>
            </div>
          </div>

          <div
            className="relative max-w-5xl max-h-[85vh] flex items-center justify-center overflow-hidden rounded-2xl border border-white/10 shadow-2xl bg-black/60"
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lightboxImg.url}
              alt={lightboxImg.prompt}
              className="max-h-[82vh] max-w-full object-contain rounded-xl"
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default function ImageStudioPage() {
  return (
    <Suspense
      fallback={
        <div className="h-full bg-[#121110] flex items-center justify-center">
          <div className="flex items-center gap-2 text-[#D97757]">
            <RefreshCw size={20} className="animate-spin" />
            <span className="text-sm font-medium text-[#ECEBE4]">Đang tải Google Flow Studio...</span>
          </div>
        </div>
      }
    >
      <ImageStudioContent />
    </Suspense>
  );
}
