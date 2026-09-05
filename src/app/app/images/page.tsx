"use client";

import React, { Suspense, useEffect, useState } from "react";
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

const ASPECT_RATIO_OPTIONS = [
  { id: "1:1", label: "Vuông 1:1", sub: "Avatar / Social", iconWidth: "w-5 h-5" },
  { id: "16:9", label: "Ngang 16:9", sub: "Màn hình / Wallpaper", iconWidth: "w-7 h-4" },
  { id: "9:16", label: "Dọc 9:16", sub: "Story / TikTok", iconWidth: "w-4 h-7" },
  { id: "4:3", label: "Ngang 4:3", sub: "Tiêu chuẩn", iconWidth: "w-6 h-4.5" },
  { id: "3:4", label: "Dọc 3:4", sub: "Chân dung", iconWidth: "w-4.5 h-6" },
];

const STYLE_OPTIONS = [
  { id: "photographic", label: "Nhiếp ảnh chân thực", desc: "Ảnh chụp 8k sắc nét", icon: "📸" },
  { id: "cinematic", label: "Điện ảnh (Cinematic)", desc: "Ánh sáng ấn tượng, sâu lắng", icon: "🎬" },
  { id: "anime", label: "Anime / Manga", desc: "Nét vẽ Makoto Shinkai rực rỡ", icon: "✨" },
  { id: "digital_art", label: "Nghệ thuật số", desc: "Minh họa phong cách ArtStation", icon: "🎨" },
  { id: "cyberpunk", label: "Cyberpunk", desc: "Đèn neon, thành phố tương lai", icon: "🌆" },
  { id: "three_d", label: "3D Render / CGI", desc: "Đổ bóng Octane mượt mà", icon: "🧊" },
  { id: "watercolor", label: "Màu nước nghệ thuật", desc: "Vết loang thanh thoát, nhẹ nhàng", icon: "🖌️" },
  { id: "minimalist", label: "Tối giản (Minimalist)", desc: "Mảng màu tinh tế, hiện đại", icon: "📐" },
];

const PROMPT_INSPIRATIONS = [
  {
    title: "Rồng Đông Phương",
    prompt: "Một con rồng vàng phương Đông uy nghi đang bay lượn trên biển mây đỉnh núi Fansipan tuyết trắng phủ mờ, ánh bình minh vàng kim rực rỡ",
    style: "cinematic",
    ratio: "16:9",
  },
  {
    title: "Phố Cổ Cyberpunk",
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
    title: "Khu Vườn Kỷ Jura",
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
  const [selectedStyle, setSelectedStyle] = useState<string>("photographic");
  const [selectedModel, setSelectedModel] = useState<string>("");

  const [availableModels, setAvailableModels] = useState<AIModel[]>([]);
  const [activeRoute, setActiveRoute] = useState<string>("");
  const [modelsLoading, setModelsLoading] = useState(true);

  const [isGenerating, setIsGenerating] = useState(false);
  const [currentImage, setCurrentImage] = useState<GeneratedImage | null>(null);
  const [history, setHistory] = useState<GeneratedImage[]>([]);
  const [lightboxImg, setLightboxImg] = useState<GeneratedImage | null>(null);
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  // Load history from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setHistory(parsed);
          if (parsed.length > 0) {
            setCurrentImage(parsed[0]);
          }
        }
      }
    } catch {}
  }, []);

  // Save history to localStorage
  const saveToHistory = (img: GeneratedImage) => {
    setHistory((prev) => {
      const filtered = prev.filter((item) => item.id !== img.id && item.url !== img.url);
      const updated = [img, ...filtered].slice(0, 30);
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

  const handleGenerate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanPrompt = prompt.trim();
    if (!cleanPrompt) {
      toast("Vui lòng nhập mô tả ảnh bạn muốn tạo", "error");
      return;
    }

    setIsGenerating(true);
    try {
      const res = await fetch("/api/images/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: cleanPrompt,
          aspectRatio: selectedRatio,
          style: selectedStyle,
          modelId: selectedModel || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.image) {
        throw new Error(data.error || "Không thể tạo ảnh, vui lòng thử lại sau.");
      }

      const newImg = data.image as GeneratedImage;
      setCurrentImage(newImg);
      saveToHistory(newImg);
      toast("✨ Đã tạo hình ảnh thành công!", "success");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Lỗi khi tạo ảnh.";
      toast(msg, "error");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleClearHistory = () => {
    if (confirm("Bạn có chắc chắn muốn xóa lịch sử tạo ảnh này không?")) {
      setHistory([]);
      localStorage.removeItem(STORAGE_KEY);
      toast("Đã xóa lịch sử tạo ảnh", "info");
    }
  };

  const handleCopyPrompt = async (text: string) => {
    if (await copyText(text)) {
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 2000);
      toast("Đã sao chép prompt vào bộ nhớ tạm", "success");
    }
  };

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--text)] pb-16">
      <Toasts />

      {/* Header Banner */}
      <div className="border-b border-[var(--border)] bg-[#1A1917]/70 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-[#D97757]/15 border border-[#D97757]/30 flex items-center justify-center text-[#D97757] shadow-sm">
              <Palette size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg sm:text-xl font-bold tracking-tight text-[#ECEBE4]">
                  AI Image Studio
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#D97757]/20 text-[#D97757] border border-[#D97757]/30">
                  Sáng tạo
                </span>
              </div>
              <p className="text-xs text-[#A6A49B]">
                Biến ngôn từ thành tác phẩm hình ảnh nghệ thuật sắc nét với AI
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            {user?.role === "admin" && (
              <Link
                href="/admin/models"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[#A6A49B] hover:text-[#ECEBE4] hover:bg-white/[0.06] border border-white/10 transition-colors"
                title="Cấu hình mô hình tạo ảnh"
              >
                <Sliders size={13} className="text-[#D97757]" />
                <span>Cấu hình Model Admin</span>
              </Link>
            )}
            <Link
              href="/app"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[#A6A49B] hover:text-[#ECEBE4] hover:bg-white/[0.06] border border-white/10 transition-colors"
            >
              <span>Về Chat</span>
              <ChevronRight size={13} />
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-6">
        {/* Main 2-Column Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* LEFT: Controls & Form */}
          <div className="lg:col-span-5 space-y-5">
            <div className="card p-5 border border-white/10 shadow-lg space-y-5">
              {/* Prompt Box */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label htmlFor="promptInput" className="text-xs font-semibold text-[#ECEBE4] flex items-center gap-1.5">
                    <Sparkles size={13} className="text-[#D97757]" />
                    <span>Mô tả hình ảnh (Prompt)</span>
                  </label>
                  <span className="text-[11px] text-[#75736C]">
                    {prompt.length}/2000 ký tự
                  </span>
                </div>
                <div className="relative">
                  <textarea
                    id="promptInput"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                        e.preventDefault();
                        handleGenerate();
                      }
                    }}
                    rows={4}
                    placeholder="VD: Một chú rồng vàng uy nghi bay qua đỉnh núi tuyết mờ ảo, ánh bình minh điện ảnh rực rỡ..."
                    className="w-full bg-[#1A1917] border border-white/10 rounded-xl p-3 text-sm text-[#ECEBE4] placeholder-[#75736C] focus:outline-none focus:border-[#D97757]/60 focus:ring-1 focus:ring-[#D97757]/40 resize-none transition-all"
                  />
                  {prompt && (
                    <button
                      type="button"
                      onClick={() => setPrompt("")}
                      className="absolute top-2.5 right-2.5 p-1 rounded-md text-[#75736C] hover:text-[#ECEBE4] hover:bg-white/10 text-xs transition-colors cursor-pointer"
                      title="Xóa nội dung"
                    >
                      ✕
                    </button>
                  )}
                </div>

                </div>
              </div>

              {/* Inspiration Pills */}
              <div>
                <div className="flex items-center gap-1.5 text-xs text-[#A6A49B] mb-2">
                  <Lightbulb size={13} className="text-[#D97757]" />
                  <span>Gợi ý ý tưởng nhanh:</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {PROMPT_INSPIRATIONS.map((item, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setPrompt(item.prompt);
                        setSelectedStyle(item.style);
                        setSelectedRatio(item.ratio);
                      }}
                      className="px-2.5 py-1 rounded-lg text-xs font-sans text-[#A6A49B] bg-white/[0.03] hover:bg-[#D97757]/15 hover:text-[#ECEBE4] hover:border-[#D97757]/30 border border-white/[0.06] transition-all cursor-pointer text-left"
                    >
                      {item.title}
                    </button>
                  ))}
                </div>
              </div>

              {/* Style Presets */}
              <div>
                <label className="text-xs font-semibold text-[#ECEBE4] flex items-center gap-1.5 mb-2.5">
                  <Palette size={13} className="text-[#D97757]" />
                  <span>Phong cách nghệ thuật</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {STYLE_OPTIONS.map((style) => {
                    const isSelected = selectedStyle === style.id;
                    return (
                      <button
                        key={style.id}
                        type="button"
                        onClick={() => setSelectedStyle(style.id)}
                        className={cn(
                          "p-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-center gap-2.5",
                          isSelected
                            ? "bg-[#D97757]/15 border-[#D97757] text-[#ECEBE4] shadow-xs"
                            : "bg-[#1A1917] border-white/[0.06] text-[#A6A49B] hover:border-white/20 hover:text-[#ECEBE4]"
                        )}
                      >
                        <span className="text-base shrink-0">{style.icon}</span>
                        <div className="min-w-0">
                          <p className="text-xs font-medium truncate">{style.label}</p>
                          <p className="text-[10px] text-[#75736C] truncate">{style.desc}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Aspect Ratio Selector */}
              <div>
                <label className="text-xs font-semibold text-[#ECEBE4] flex items-center gap-1.5 mb-2.5">
                  <Layers size={13} className="text-[#D97757]" />
                  <span>Tỷ lệ khung hình</span>
                </label>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                  {ASPECT_RATIO_OPTIONS.map((ar) => {
                    const isSelected = selectedRatio === ar.id;
                    return (
                      <button
                        key={ar.id}
                        type="button"
                        onClick={() => setSelectedRatio(ar.id)}
                        className={cn(
                          "p-2 rounded-xl border flex flex-col items-center justify-center text-center transition-all cursor-pointer gap-1.5",
                          isSelected
                            ? "bg-[#D97757]/15 border-[#D97757] text-[#ECEBE4] shadow-xs ring-1 ring-[#D97757]/30"
                            : "bg-[#1A1917] border-white/[0.06] text-[#A6A49B] hover:border-white/20 hover:text-[#ECEBE4]"
                        )}
                      >
                        <div className="h-7 flex items-center justify-center">
                          <div
                            className={cn(
                              "border-2 rounded-sm transition-colors",
                              ar.iconWidth,
                              isSelected ? "border-[#D97757] bg-[#D97757]/20" : "border-white/30"
                            )}
                          />
                        </div>
                        <span className="text-[11px] font-semibold">{ar.id}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Model Selector */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="modelSelect" className="text-xs font-semibold text-[#ECEBE4] flex items-center gap-1.5">
                    <Wand2 size={13} className="text-[#D97757]" />
                    <span>Mô hình tạo ảnh</span>
                  </label>
                  {activeRoute && (
                    <span className="text-[10px] text-[#D97757] font-mono">
                      Mặc định hệ thống
                    </span>
                  )}
                </div>
                <div className="relative">
                  <select
                    id="modelSelect"
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    disabled={modelsLoading}
                    className="w-full bg-[#1A1917] border border-white/10 rounded-xl px-3 py-2.5 text-xs text-[#ECEBE4] focus:outline-none focus:border-[#D97757]/60 cursor-pointer appearance-none pr-8"
                  >
                    {availableModels.map((m) => (
                      <option key={m.id} value={m.id} className="bg-[#242321] text-[#ECEBE4]">
                        {m.name || m.id} {m.id === activeRoute ? "★ (Admin mặc định)" : ""}
                      </option>
                    ))}
                    {availableModels.length === 0 && (
                      <option value="" className="bg-[#242321] text-[#ECEBE4]">
                        DALL·E 3 (OpenAI Mặc định)
                      </option>
                    )}
                  </select>
                  <div className="absolute right-3 top-3 pointer-events-none text-[#75736C]">
                    ▾
                  </div>
                </div>
              </div>

              {/* Primary Generate Action Button */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => handleGenerate()}
                  disabled={isGenerating || !prompt.trim()}
                  className={cn(
                    "w-full py-3.5 px-4 rounded-xl font-semibold text-sm text-white flex items-center justify-center gap-2 transition-all shadow-xl active:scale-[0.99] cursor-pointer border border-[#D97757]/30",
                    isGenerating || !prompt.trim()
                      ? "bg-[#D97757]/40 text-white/50 cursor-not-allowed"
                      : "bg-[#D97757] hover:bg-[#E2886A] shadow-[0_0_25px_rgba(217,119,87,0.45)] hover:shadow-[0_0_30px_rgba(217,119,87,0.6)]"
                  )}
                >
                  {isGenerating ? (
                    <>
                      <RefreshCw size={16} className="animate-spin text-white" />
                      <span>Đang tạo ảnh nghệ thuật...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles size={16} />
                      <span>Tạo ảnh ngay (Ctrl + Enter)</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* RIGHT: Canvas & Visual Output */}
          <div className="lg:col-span-7 space-y-4">
            <div className="card p-4 sm:p-5 border border-white/10 shadow-lg min-h-[480px] flex flex-col justify-between">
              {/* Output Image Canvas */}
              <div className="flex-1 flex flex-col items-center justify-center min-h-[380px]">
                {isGenerating ? (
                  <div className="w-full h-full min-h-[360px] flex flex-col items-center justify-center p-8 text-center rounded-2xl bg-black/40 border border-[#D97757]/30 animate-pulse relative overflow-hidden">
                    <div className="h-16 w-16 rounded-2xl bg-[#D97757]/15 border border-[#D97757]/40 flex items-center justify-center text-[#D97757] mb-4 shadow-[0_0_25px_rgba(217,119,87,0.35)]">
                      <Sparkles size={32} className="animate-spin-slow" />
                    </div>
                    <h3 className="text-base font-semibold text-[#ECEBE4] mb-1">
                      Đang kiến tạo bức tranh của bạn…
                    </h3>
                    <p className="text-xs text-[#A6A49B] max-w-sm mb-4">
                      Hệ thống AI đang phân tích mô tả, tổng hợp chi tiết ánh sáng và kết xuất pixel chất lượng cao.
                    </p>
                    <div className="w-48 h-1.5 bg-white/10 rounded-full overflow-hidden">
                      <div className="h-full bg-[#D97757] animate-[shimmer_1.5s_infinite]" style={{ width: "60%" }} />
                    </div>
                  </div>
                ) : currentImage ? (
                  <div className="w-full flex flex-col items-center">
                    {/* Visual Frame */}
                    <div
                      className="relative rounded-2xl overflow-hidden bg-black/50 border border-white/10 shadow-2xl cursor-zoom-in group max-h-[560px] flex items-center justify-center"
                      onClick={() => setLightboxImg(currentImage)}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={currentImage.url}
                        alt={currentImage.prompt}
                        className="max-h-[540px] max-w-full object-contain rounded-xl transition-transform duration-300 group-hover:scale-[1.01]"
                      />
                      <div className="absolute top-3 right-3 p-2 rounded-xl bg-black/75 backdrop-blur-md border border-white/15 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                        <Maximize2 size={16} />
                      </div>
                      <div className="absolute bottom-3 left-3 px-3 py-1 rounded-full bg-black/75 backdrop-blur-md border border-white/15 text-xs text-white flex items-center gap-1.5">
                        <Sparkles size={11} className="text-[#D97757]" />
                        <span>{currentImage.aspectRatio}</span>
                        <span className="text-white/40">·</span>
                        <span className="text-white/80">{currentImage.width}x{currentImage.height}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="w-full h-full min-h-[360px] flex flex-col items-center justify-center p-8 text-center rounded-2xl bg-[#1A1917]/50 border border-dashed border-white/10">
                    <div className="h-16 w-16 rounded-2xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-center text-[#75736C] mb-4">
                      <ImageIcon size={30} />
                    </div>
                    <h3 className="text-sm font-semibold text-[#ECEBE4] mb-1">
                      Chưa có tác phẩm nào
                    </h3>
                    <p className="text-xs text-[#75736C] max-w-sm mb-4">
                      Nhập ý tưởng của bạn ở bảng điều khiển bên trái, chọn phong cách yêu thích và nhấn <strong>Tạo ảnh ngay</strong> để bắt đầu.
                    </p>
                    {prompt.trim() && (
                      <button
                        type="button"
                        onClick={() => handleGenerate()}
                        disabled={isGenerating}
                        className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#D97757] hover:bg-[#E2886A] text-white flex items-center gap-2 shadow-md cursor-pointer transition-all active:scale-95"
                      >
                        <Sparkles size={13} />
                        <span>Bấm để tạo ảnh ngay với prompt này</span>
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Action Bar for Current Image */}
              {currentImage && (
                <div className="mt-4 pt-4 border-t border-white/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-[#ECEBE4] line-clamp-1 italic" title={currentImage.prompt}>
                      “{currentImage.prompt}”
                    </p>
                    <p className="text-[11px] text-[#75736C] mt-0.5 font-mono">
                      Model: {currentImage.model}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleCopyPrompt(currentImage.prompt)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[#A6A49B] hover:text-[#ECEBE4] hover:bg-white/[0.06] border border-white/10 transition-colors cursor-pointer"
                      title="Sao chép prompt"
                    >
                      {copiedPrompt ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                      <span>{copiedPrompt ? "Đã sao chép" : "Copy Prompt"}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setLightboxImg(currentImage)}
                      className="p-1.5 rounded-lg text-[#A6A49B] hover:text-[#ECEBE4] hover:bg-white/[0.06] border border-white/10 transition-colors cursor-pointer"
                      title="Phóng to"
                    >
                      <Maximize2 size={15} />
                    </button>

                    <a
                      href={currentImage.url}
                      download={currentImage.fileName}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium bg-[#D97757] hover:bg-[#E2886A] text-white shadow-sm transition-colors"
                      title="Tải ảnh về máy"
                    >
                      <Download size={13} />
                      <span>Tải ảnh về</span>
                    </a>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RECENT GENERATIONS GALLERY */}
        {history.length > 0 && (
          <div className="mt-12 space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-[#ECEBE4]">
                  Lịch sử tác phẩm gần đây
                </h2>
                <span className="px-2 py-0.5 rounded-full text-xs font-mono bg-white/5 text-[#A6A49B] border border-white/10">
                  {history.length}
                </span>
              </div>
              <button
                type="button"
                onClick={handleClearHistory}
                className="inline-flex items-center gap-1.5 text-xs text-[#75736C] hover:text-red-400 transition-colors cursor-pointer"
              >
                <Trash2 size={13} />
                <span>Xóa lịch sử</span>
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {history.map((img) => (
                <div
                  key={img.id}
                  className="group relative rounded-xl overflow-hidden bg-[#1A1917] border border-white/10 hover:border-[#D97757]/50 transition-all shadow-sm cursor-pointer aspect-square"
                  onClick={() => setCurrentImage(img)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.url}
                    alt={img.prompt}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-2.5 flex flex-col justify-between">
                    <div className="flex justify-end">
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
                      <p className="text-[11px] text-white line-clamp-2 leading-snug">
                        {img.prompt}
                      </p>
                      <span className="text-[10px] text-[#D97757] font-mono mt-1 inline-block">
                        {img.aspectRatio}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Lightbox Modal */}
      {lightboxImg && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 backdrop-blur-md p-4 select-none animate-in fade-in duration-200"
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
              <a
                href={lightboxImg.url}
                download={lightboxImg.fileName}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-white/10 hover:bg-white/20 border border-white/10 transition-colors"
              >
                <Download size={14} />
                <span>Tải về</span>
              </a>
              <button
                type="button"
                onClick={() => setLightboxImg(null)}
                className="h-8 w-8 rounded-lg bg-[#D97757] hover:bg-[#E2886A] text-white flex items-center justify-center shadow-md transition-all cursor-pointer hover:scale-105"
                title="Đóng (Esc)"
              >
                ✕
              </button>
            </div>
          </div>

          <div
            className="relative max-w-5xl max-h-[85vh] flex items-center justify-center overflow-hidden rounded-xl border border-white/10 shadow-2xl bg-black/60"
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lightboxImg.url}
              alt={lightboxImg.prompt}
              className="max-h-[82vh] max-w-full object-contain rounded-lg"
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
        <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
          <div className="flex items-center gap-2 text-[#D97757]">
            <RefreshCw size={20} className="animate-spin" />
            <span className="text-sm font-medium text-[#ECEBE4]">Đang tải Image Studio...</span>
          </div>
        </div>
      }
    >
      <ImageStudioContent />
    </Suspense>
  );
}
