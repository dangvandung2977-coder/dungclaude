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
  Wand2,
  Trash2,
  Layers,
  ChevronRight,
  Lightbulb,
  Upload,
  X,
  Plus,
  Compass,
  History,
  Grid2X2,
  SlidersHorizontal,
  ArrowUpRight,
  Pin,
  Flame,
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
  { id: "1:1", label: "1:1", sub: "Vuông", iconWidth: "w-4 h-4" },
  { id: "16:9", label: "16:9", sub: "Ngang", iconWidth: "w-6 h-3.5" },
  { id: "9:16", label: "9:16", sub: "Dọc", iconWidth: "w-3.5 h-6" },
  { id: "4:3", label: "4:3", sub: "Khổ rộng", iconWidth: "w-5 h-4" },
  { id: "3:4", label: "3:4", sub: "Khổ cao", iconWidth: "w-4 h-5" },
];

const STYLE_OPTIONS = [
  { id: "", label: "Tự do (Không áp đặt)", desc: "100% bám sát mô tả của bạn", icon: "✨" },
  { id: "photographic", label: "Nhiếp ảnh chân thực", desc: "Ảnh chụp 8k sắc nét, ống kính 35mm", icon: "📸" },
  { id: "cinematic", label: "Điện ảnh (Cinematic)", desc: "Ánh sáng ấn tượng, chiều sâu điện ảnh", icon: "🎬" },
  { id: "anime", label: "Anime / Manga", desc: "Nét vẽ Makoto Shinkai rực rỡ", icon: "🌸" },
  { id: "digital_art", label: "Nghệ thuật số", desc: "Minh họa phong cách ArtStation", icon: "🎨" },
  { id: "cyberpunk", label: "Cyberpunk", desc: "Đèn neon, thành phố tương lai", icon: "🌆" },
  { id: "three_d", label: "3D Render / CGI", desc: "Đổ bóng Octane mượt mà", icon: "🧊" },
  { id: "watercolor", label: "Màu nước nghệ thuật", desc: "Vết loang thanh thoát, nhẹ nhàng", icon: "🖌️" },
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
    title: "Cô Gái Anime Trà Chiều",
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

  // Reference images (Ảnh tham chiếu kiểu Google Flow)
  const [referenceImages, setReferenceImages] = useState<ImageReference[]>([]);
  const [showRefUploadModal, setShowRefUploadModal] = useState(false);
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
        if (Array.isArray(parsed)) {
          setHistory(parsed);
          if (parsed.length > 0 && currentBatch.length === 0) {
            setCurrentBatch([parsed[0]]);
          }
        }
      }
    } catch {}
  }, []);

  const saveBatchToHistory = (imgs: GeneratedImage[]) => {
    setHistory((prev) => {
      const newIds = new Set(imgs.map((i) => i.id || i.url));
      const filtered = prev.filter((item) => !newIds.has(item.id || item.url));
      const updated = [...imgs, ...filtered].slice(0, 40);
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

  // Initialize prompt from query params (e.g. ?prompt=...)
  useEffect(() => {
    const qPrompt = searchParams.get("prompt");
    if (qPrompt) {
      setPrompt(qPrompt);
    }
  }, [searchParams]);

  // Handle image upload for reference
  const handleAddReferenceFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (referenceImages.length >= 4) {
      toast("Tối đa 4 ảnh tham chiếu cho mỗi lần tạo", "info");
      return;
    }

    const file = files[0];
    if (!file.type.startsWith("image/")) {
      toast("Vui lòng chọn tệp hình ảnh hợp lệ (PNG, JPG, WebP)", "error");
      return;
    }

    const reader = new FileReader();
    reader.onload = (loadEvt) => {
      const dataUrl = loadEvt.target?.result as string;
      if (dataUrl) {
        const newRef: ImageReference = {
          id: `ref_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          url: dataUrl,
          fileName: file.name,
          role: "style",
          weight: 0.8,
        };
        setReferenceImages((prev) => [...prev.slice(0, 3), newRef]);
        toast("✨ Đã nạp ảnh tham chiếu phong cách!", "success");
      }
    };
    reader.readAsDataURL(file);
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
    toast("📌 Đã thêm ảnh vào danh sách tham chiếu Flow!", "success");
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

      // Only pass style if user explicitly picked one (optional style!)
      if (selectedStyle) {
        payload.style = selectedStyle;
      }

      // Pass reference images if attached
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
      toast("Đã sao chép prompt vào bộ nhớ tạm", "success");
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
    <div className="h-full flex flex-col bg-[#121110] text-[#ECEBE4] overflow-hidden select-none">
      <Toasts />

      {/* Hidden File Input for Reference Images */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleAddReferenceFile}
        accept="image/png,image/jpeg,image/webp,image/jpg"
        className="hidden"
      />

      {/* GOOGLE FLOW HEADER */}
      <header className="border-b border-white/[0.08] bg-[#181715]/90 backdrop-blur-xl px-4 sm:px-6 py-3 shrink-0 z-30 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-[#D97757] to-[#E2886A] flex items-center justify-center text-white shadow-[0_0_15px_rgba(217,119,87,0.35)]">
            <Sparkles size={19} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold tracking-tight text-[#ECEBE4] font-sans">
                Google Flow Studio
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#D97757]/15 text-[#E2886A] border border-[#D97757]/30 flex items-center gap-1">
                <Flame size={10} className="text-[#D97757]" /> Flow Canvas
              </span>
            </div>
            <p className="text-[11px] text-[#A6A49B] hidden sm:block">
              Không gian sáng tạo hình ảnh AI tự do · Hỗ trợ ảnh tham chiếu & tạo hàng loạt
            </p>
          </div>
        </div>

        {/* Header Actions & Mode Switcher */}
        <div className="flex items-center gap-2">
          {/* Tab Switcher: Flow Canvas vs Gallery History */}
          <div className="flex items-center p-1 bg-black/40 rounded-xl border border-white/[0.08]">
            <button
              type="button"
              onClick={() => setActiveTab("canvas")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer",
                activeTab === "canvas"
                  ? "bg-[#D97757] text-white shadow-sm font-semibold"
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
                "flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer",
                activeTab === "history"
                  ? "bg-[#D97757] text-white shadow-sm font-semibold"
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
              className="hidden md:inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-[#A6A49B] hover:text-[#ECEBE4] hover:bg-white/[0.06] border border-white/10 transition-colors"
              title="Cấu hình Model trong Admin"
            >
              <Sliders size={12} className="text-[#D97757]" />
              <span>Admin Models</span>
            </Link>
          )}

          <Link
            href="/app"
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-[#A6A49B] hover:text-[#ECEBE4] hover:bg-white/[0.06] border border-white/10 transition-colors"
          >
            <span>Về Chat</span>
            <ChevronRight size={13} />
          </Link>
        </div>
      </header>

      {/* MAIN WORKSPACE VIEWPORT */}
      <main className="flex-1 relative overflow-y-auto thin-scroll p-4 sm:p-6 pb-48">
        {activeTab === "history" ? (
          /* ========================================================================= */
          /* HISTORY GALLERY VIEW                                                      */
          /* ========================================================================= */
          <div className="max-w-7xl mx-auto space-y-5">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div>
                <h2 className="text-base font-bold text-[#ECEBE4] flex items-center gap-2">
                  <History size={17} className="text-[#D97757]" />
                  <span>Dòng chảy tác phẩm đã lưu ({history.length})</span>
                </h2>
                <p className="text-xs text-[#75736C] mt-0.5">
                  Nhấp vào ảnh để xem lại trên Flow Canvas hoặc ghim làm ảnh tham chiếu
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
              <div className="py-24 text-center">
                <ImageIcon size={40} className="mx-auto text-[#75736C] mb-3 opacity-40" />
                <p className="text-sm font-medium text-[#A6A49B]">Chưa có tác phẩm nào trong lịch sử</p>
                <p className="text-xs text-[#75736C] mt-1">Chuyển sang Canvas Flow để tạo tác phẩm đầu tiên của bạn</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5">
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
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-3 flex flex-col justify-between">
                      <div className="flex justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePinAsReference(img);
                          }}
                          className="p-1.5 rounded-lg bg-black/60 text-white hover:bg-[#D97757] transition-colors"
                          title="Ghim làm ảnh tham chiếu"
                        >
                          <Pin size={13} />
                        </button>
                        <a
                          href={img.url}
                          download={img.fileName}
                          onClick={(e) => e.stopPropagation()}
                          className="p-1.5 rounded-lg bg-black/60 text-white hover:bg-[#D97757] transition-colors"
                          title="Tải ảnh"
                        >
                          <Download size={13} />
                        </a>
                      </div>
                      <div>
                        <p className="text-xs text-white line-clamp-2 leading-snug">
                          {img.prompt}
                        </p>
                        <div className="flex items-center gap-1.5 mt-1.5 text-[10px] text-[#D97757] font-mono">
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
          /* ========================================================================= */
          /* FLOW CANVAS VIEW (Google Flow Center Stage)                              */
          /* ========================================================================= */
          <div className="max-w-6xl mx-auto space-y-6">
            {/* Quick Inspiration Pills */}
            <div className="flex items-center gap-2 overflow-x-auto thin-scroll pb-1">
              <span className="text-xs text-[#A6A49B] flex items-center gap-1 shrink-0 font-medium">
                <Lightbulb size={13} className="text-[#D97757]" /> Gợi ý Flow:
              </span>
              {PROMPT_INSPIRATIONS.map((item, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setPrompt(item.prompt);
                    setSelectedStyle(item.style);
                    setSelectedRatio(item.ratio);
                  }}
                  className="px-3 py-1 rounded-full text-xs font-sans text-[#A6A49B] bg-[#1E1D1A] hover:bg-[#D97757]/15 hover:text-[#ECEBE4] hover:border-[#D97757]/40 border border-white/[0.08] transition-all shrink-0 cursor-pointer"
                >
                  {item.title}
                </button>
              ))}
            </div>

            {/* FLOW CANVAS DISPLAY CONTAINER */}
            <div className="relative rounded-3xl bg-[#171614] border border-white/[0.08] p-4 sm:p-6 shadow-2xl min-h-[460px] flex flex-col justify-center items-center">
              {isGenerating ? (
                /* LOADING SHIMMER GRID FOR BATCH */
                <div className="w-full py-8 flex flex-col items-center justify-center">
                  <div className="flex items-center justify-center gap-2 mb-4">
                    <div className="h-10 w-10 rounded-2xl bg-[#D97757]/20 border border-[#D97757]/40 flex items-center justify-center text-[#D97757] shadow-[0_0_20px_rgba(217,119,87,0.3)] animate-pulse">
                      <Sparkles size={20} className="animate-spin-slow" />
                    </div>
                  </div>
                  <h3 className="text-base font-semibold text-[#ECEBE4] mb-1 text-center">
                    Đang kết xuất {batchCount > 1 ? `loạt ${batchCount} ảnh Flow` : "tác phẩm Flow của bạn"}…
                  </h3>
                  <p className="text-xs text-[#A6A49B] max-w-md text-center mb-6">
                    {referenceImages.length > 0
                      ? `Đang áp dụng ${referenceImages.length} ảnh tham chiếu phong cách & kết xuất pixel chất lượng cao.`
                      : "Hệ thống AI đang tổng hợp chi tiết màu sắc, bố cục và ánh sáng sắc nét."}
                  </p>

                  {/* Dynamic Shimmer Skeletons matching batch count */}
                  <div
                    className={cn(
                      "w-full max-w-4xl grid gap-4",
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
                /* RENDERED BATCH DISPLAY GRID */
                <div className="w-full space-y-4">
                  {/* Batch Header Indicator */}
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

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleCopyPrompt(currentBatch[0].prompt, "header")}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-[#A6A49B] hover:text-[#ECEBE4] hover:bg-white/[0.06] border border-white/10 transition-colors cursor-pointer"
                        title="Sao chép prompt"
                      >
                        {copiedId === "header" ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                        <span>Sao chép Prompt</span>
                      </button>
                    </div>
                  </div>

                  {/* Layout Engine: 1 Image Hero vs 2 Images Side-by-Side vs 4 Images 2x2 Flow Grid */}
                  {currentBatch.length === 1 && currentHeroImage ? (
                    /* 1 Image: Large Flow Showcase */
                    <div className="relative rounded-2xl overflow-hidden bg-black/60 border border-white/10 shadow-2xl group max-h-[580px] flex items-center justify-center">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={currentHeroImage.url}
                        alt={currentHeroImage.prompt}
                        className="max-h-[560px] max-w-full object-contain rounded-xl transition-transform duration-300 group-hover:scale-[1.01]"
                        onClick={() => setLightboxImg(currentHeroImage)}
                      />

                      {/* Top Overlay Badge */}
                      <div className="absolute top-3 left-3 px-3 py-1 rounded-full bg-black/75 backdrop-blur-md border border-white/15 text-xs text-white flex items-center gap-2">
                        <span className="font-mono text-[#E2886A]">{currentHeroImage.aspectRatio}</span>
                        <span className="text-white/40">·</span>
                        <span>{currentHeroImage.width}x{currentHeroImage.height}</span>
                      </div>

                      {/* Floating Action Menu */}
                      <div className="absolute bottom-3 right-3 flex items-center gap-1.5 p-1.5 rounded-2xl bg-black/80 backdrop-blur-md border border-white/15 shadow-xl">
                        <button
                          type="button"
                          onClick={() => handlePinAsReference(currentHeroImage)}
                          className="px-3 py-1.5 rounded-xl bg-white/[0.08] hover:bg-[#D97757] text-white text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer"
                          title="Ghim làm ảnh tham chiếu cho lần tạo sau"
                        >
                          <Pin size={12} />
                          <span>Dùng làm tham chiếu</span>
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
                          title="Xem toàn màn hình"
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
                  ) : (
                    /* 2 or 4 Images: Flow Batch Grid */
                    <div
                      className={cn(
                        "grid gap-4",
                        currentBatch.length === 2 && "grid-cols-1 sm:grid-cols-2",
                        currentBatch.length >= 3 && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
                      )}
                    >
                      {currentBatch.map((img, idx) => (
                        <div
                          key={img.id || idx}
                          className="group relative rounded-2xl overflow-hidden bg-black/60 border border-white/10 hover:border-[#D97757]/80 transition-all shadow-xl aspect-square flex items-center justify-center cursor-pointer"
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

                          {/* Hover Action Overlay */}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-3 flex flex-col justify-between">
                            <div className="flex justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handlePinAsReference(img);
                                }}
                                className="p-1.5 rounded-lg bg-black/70 text-white hover:bg-[#D97757] transition-colors"
                                title="Ghim làm ảnh tham chiếu"
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
                /* EMPTY STATE: Google Flow Canvas Welcome */
                <div className="py-16 text-center max-w-md">
                  <div className="h-16 w-16 rounded-3xl bg-gradient-to-br from-[#D97757]/20 to-[#E2886A]/10 border border-[#D97757]/30 flex items-center justify-center text-[#D97757] mx-auto mb-4 shadow-[0_0_25px_rgba(217,119,87,0.2)]">
                    <Palette size={28} />
                  </div>
                  <h3 className="text-base font-bold text-[#ECEBE4] mb-1.5">
                    Khởi tạo tác phẩm trên Flow Canvas
                  </h3>
                  <p className="text-xs text-[#A6A49B] mb-5 leading-relaxed">
                    Nhập ý tưởng bên dưới, thêm ảnh tham chiếu phong cách tùy chọn, chọn số lượng và nhấn <strong>Sáng tạo</strong> để tạo nên những bức tranh độc bản.
                  </p>

                  <div className="flex flex-wrap justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-white/[0.06] hover:bg-white/[0.12] text-[#ECEBE4] border border-white/10 transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <Upload size={13} className="text-[#D97757]" />
                      <span>Thêm ảnh tham chiếu</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPrompt(PROMPT_INSPIRATIONS[0].prompt);
                        setSelectedStyle(PROMPT_INSPIRATIONS[0].style);
                        setSelectedRatio(PROMPT_INSPIRATIONS[0].ratio);
                      }}
                      className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-[#D97757]/20 hover:bg-[#D97757]/30 text-[#E2886A] border border-[#D97757]/40 transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <Sparkles size={13} />
                      <span>Thử prompt mẫu</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* ========================================================================= */}
      {/* GOOGLE FLOW FLOATING COMMAND DOCK (Bottom Controls)                      */}
      {/* ========================================================================= */}
      <div className="fixed inset-x-0 bottom-0 z-30 p-3 sm:p-5 pointer-events-none">
        <div className="max-w-4xl mx-auto pointer-events-auto">
          {/* Reference Images Deck (Appears directly above dock when images are added) */}
          {referenceImages.length > 0 && (
            <div className="mb-2.5 p-3 rounded-2xl bg-[#1C1B18]/95 backdrop-blur-xl border border-white/10 shadow-2xl flex items-center gap-3 overflow-x-auto thin-scroll animate-in fade-in slide-in-from-bottom-2 duration-200">
              <div className="flex items-center gap-1.5 text-xs text-[#A6A49B] shrink-0 font-medium pl-1">
                <Pin size={13} className="text-[#D97757]" />
                <span>Ảnh tham chiếu ({referenceImages.length}/4):</span>
              </div>

              {referenceImages.map((refImg) => (
                <div
                  key={refImg.id}
                  className="flex items-center gap-2 p-1.5 pr-2.5 rounded-xl bg-black/40 border border-white/10 shrink-0"
                >
                  {/* Thumbnail */}
                  <div className="h-9 w-9 rounded-lg overflow-hidden bg-black/60 shrink-0 border border-white/10">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={refImg.url} alt="Reference" className="w-full h-full object-cover" />
                  </div>

                  {/* Role Selector Chip */}
                  <select
                    value={refImg.role}
                    onChange={(e) => {
                      const newRole = e.target.value as "style" | "subject" | "composition";
                      setReferenceImages((prev) =>
                        prev.map((r) => (r.id === refImg.id ? { ...r, role: newRole } : r))
                      );
                    }}
                    className="bg-transparent text-[11px] font-medium text-[#ECEBE4] outline-none cursor-pointer border-b border-white/20 pb-0.5"
                  >
                    <option value="style" className="bg-[#242321]">🎨 Phong cách</option>
                    <option value="subject" className="bg-[#242321]">👤 Đối tượng</option>
                    <option value="composition" className="bg-[#242321]">📐 Bố cục</option>
                  </select>

                  {/* Remove Chip */}
                  <button
                    type="button"
                    onClick={() => handleRemoveReference(refImg.id)}
                    className="p-1 rounded-md text-[#75736C] hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                    title="Xóa ảnh tham chiếu này"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}

              {referenceImages.length < 4 && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-2.5 py-1.5 rounded-xl text-xs font-medium text-[#A6A49B] hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-dashed border-white/20 transition-all flex items-center gap-1 shrink-0 cursor-pointer"
                  title="Thêm ảnh tham chiếu khác"
                >
                  <Plus size={12} />
                  <span>Thêm</span>
                </button>
              )}
            </div>
          )}

          {/* Core Command Box */}
          <div className="rounded-3xl bg-[#1C1B18]/95 backdrop-blur-2xl border border-white/[0.12] shadow-[0_10px_40px_rgba(0,0,0,0.6)] p-3 sm:p-4 space-y-3">
            {/* Multi-line Prompt Textarea */}
            <div className="relative">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                    e.preventDefault();
                    handleGenerate();
                  }
                }}
                rows={2}
                placeholder="Mô tả ý tưởng bạn muốn tạo (VD: Chú rồng vàng bay qua đỉnh núi Fansipan tuyết phủ, ánh bình minh vàng kim...)"
                className="w-full bg-transparent outline-none text-sm sm:text-base text-[#ECEBE4] placeholder-[#75736C] resize-none pr-10 font-sans leading-relaxed"
              />
              {prompt && (
                <button
                  type="button"
                  onClick={() => setPrompt("")}
                  className="absolute top-0 right-0 p-1.5 rounded-lg text-[#75736C] hover:text-[#ECEBE4] hover:bg-white/10 text-xs transition-colors cursor-pointer"
                  title="Xóa prompt"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* FLOW PILLS & ACTION CONTROLS */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-white/[0.06]">
              {/* Left Pills: Reference + Batch Count + Aspect Ratio + Optional Style */}
              <div className="flex flex-wrap items-center gap-1.5">
                {/* Reference Image Button */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium border transition-all cursor-pointer",
                    referenceImages.length > 0
                      ? "bg-[#D97757]/20 border-[#D97757]/50 text-[#E2886A]"
                      : "bg-white/[0.04] border-white/10 text-[#A6A49B] hover:text-[#ECEBE4] hover:bg-white/[0.08]"
                  )}
                  title="Tải ảnh tham chiếu phong cách hoặc đối tượng"
                >
                  <Upload size={12} className={referenceImages.length > 0 ? "text-[#D97757]" : undefined} />
                  <span>Ảnh tham chiếu</span>
                  {referenceImages.length > 0 && (
                    <span className="h-4 w-4 rounded-full bg-[#D97757] text-white text-[10px] font-bold flex items-center justify-center">
                      {referenceImages.length}
                    </span>
                  )}
                </button>

                {/* Batch Count Selector (1, 2, or 4 images at once!) */}
                <div className="flex items-center p-0.5 bg-black/40 rounded-xl border border-white/10 text-xs">
                  <span className="px-2 text-[10px] font-semibold text-[#75736C] uppercase hidden sm:inline">
                    SL:
                  </span>
                  {[1, 2, 4].map((cnt) => (
                    <button
                      key={cnt}
                      type="button"
                      onClick={() => setBatchCount(cnt)}
                      className={cn(
                        "px-2 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer",
                        batchCount === cnt
                          ? "bg-[#D97757] text-white font-semibold shadow-xs"
                          : "text-[#A6A49B] hover:text-[#ECEBE4]"
                      )}
                      title={`Tạo đồng thời ${cnt} ảnh`}
                    >
                      {cnt}x
                    </button>
                  ))}
                </div>

                {/* Aspect Ratio Selector Pills */}
                <div className="flex items-center p-0.5 bg-black/40 rounded-xl border border-white/10 text-xs">
                  {ASPECT_RATIO_OPTIONS.map((ar) => (
                    <button
                      key={ar.id}
                      type="button"
                      onClick={() => setSelectedRatio(ar.id)}
                      className={cn(
                        "px-2 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center gap-1",
                        selectedRatio === ar.id
                          ? "bg-white/15 text-[#ECEBE4] font-semibold"
                          : "text-[#A6A49B] hover:text-[#ECEBE4]"
                      )}
                      title={`Tỷ lệ ${ar.id} (${ar.sub})`}
                    >
                      <span>{ar.id}</span>
                    </button>
                  ))}
                </div>

                {/* Art Style Selector (Optional - defaults to None!) */}
                <div className="relative">
                  <select
                    value={selectedStyle}
                    onChange={(e) => setSelectedStyle(e.target.value)}
                    className={cn(
                      "px-2.5 py-1.5 rounded-xl text-xs font-medium border outline-none cursor-pointer appearance-none pr-6 transition-all",
                      selectedStyle
                        ? "bg-[#D97757]/15 border-[#D97757]/40 text-[#E2886A]"
                        : "bg-white/[0.04] border-white/10 text-[#A6A49B] hover:text-[#ECEBE4]"
                    )}
                    title="Phong cách nghệ thuật (không bắt buộc)"
                  >
                    {STYLE_OPTIONS.map((st) => (
                      <option key={st.id} value={st.id} className="bg-[#242321] text-[#ECEBE4]">
                        {st.icon} {st.label}
                      </option>
                    ))}
                  </select>
                  <span className="absolute right-2 top-2 pointer-events-none text-[9px] text-[#75736C]">
                    ▼
                  </span>
                </div>

                {/* Advanced Settings Toggle */}
                <button
                  type="button"
                  onClick={() => setShowAdvanced((v) => !v)}
                  className={cn(
                    "p-1.5 rounded-xl border transition-all cursor-pointer",
                    showAdvanced || negativePrompt
                      ? "bg-[#D97757]/20 border-[#D97757]/40 text-[#E2886A]"
                      : "bg-white/[0.04] border-white/10 text-[#A6A49B] hover:text-[#ECEBE4]"
                  )}
                  title="Cài đặt nâng cao (Negative Prompt, Model)"
                >
                  <SlidersHorizontal size={13} />
                </button>
              </div>

              {/* Right: Sáng Tạo / Generate Action Button */}
              <button
                type="button"
                onClick={() => handleGenerate()}
                disabled={isGenerating || !prompt.trim()}
                className={cn(
                  "px-5 py-2.5 rounded-2xl font-bold text-xs sm:text-sm text-white flex items-center justify-center gap-2 transition-all shadow-xl active:scale-[0.98] cursor-pointer shrink-0 border border-[#D97757]/40",
                  isGenerating || !prompt.trim()
                    ? "bg-[#D97757]/30 text-white/40 cursor-not-allowed border-white/5"
                    : "bg-gradient-to-r from-[#D97757] to-[#E2886A] hover:brightness-110 shadow-[0_0_25px_rgba(217,119,87,0.5)]"
                )}
              >
                {isGenerating ? (
                  <>
                    <RefreshCw size={14} className="animate-spin text-white" />
                    <span>Đang tạo…</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={14} />
                    <span>Sáng tạo {batchCount > 1 ? `(${batchCount} ảnh)` : ""}</span>
                  </>
                )}
              </button>
            </div>

            {/* EXPANDABLE ADVANCED SETTINGS PANEL */}
            {showAdvanced && (
              <div className="pt-3 border-t border-white/[0.06] grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs animate-in fade-in duration-150">
                {/* Negative Prompt */}
                <div>
                  <label className="text-[11px] font-semibold text-[#A6A49B] block mb-1">
                    Negative Prompt (Loại bỏ chi tiết):
                  </label>
                  <input
                    type="text"
                    value={negativePrompt}
                    onChange={(e) => setNegativePrompt(e.target.value)}
                    placeholder="VD: mờ ảo, biến dạng, chữ ký, watermark, xấu..."
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
        </div>
      </div>

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
                <span>Làm ảnh tham chiếu</span>
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
