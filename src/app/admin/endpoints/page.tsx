"use client";
import { useEffect, useState, useMemo } from "react";
import {
  Plus,
  PlugZap,
  Trash2,
  ClipboardPaste,
  Eye,
  Key,
  Search,
  ArrowUpDown,
  Palette,
  Edit2,
  Star,
  Check,
  LayoutGrid,
  List,
  Sparkles,
} from "lucide-react";
import { Button, Input, Toggle, Modal } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

interface CModel {
  id: string;
  endpointId: string;
  apiName: string;
  displayName: string;
  contextWindow: number;
  capabilities: string[];
  inputPricePerM: number;
  outputPricePerM: number;
  enabled: boolean;
}

interface Endpoint {
  id: string;
  name: string;
  baseUrl: string;
  enabled: boolean;
  hasKey: boolean;
  keyHint: string | null;
  keyHints?: string[];
  modelCount: number;
  models: CModel[];
}

const CAPS = [
  { id: "chat", label: "Chat", color: "bg-sky-500/15 text-sky-400 border-sky-500/30" },
  { id: "vision", label: "Đọc ảnh", color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  { id: "video", label: "Đọc video", color: "bg-indigo-500/15 text-indigo-400 border-indigo-500/30" },
  { id: "reasoning", label: "Suy luận", color: "bg-purple-500/15 text-purple-400 border-purple-500/30" },
  { id: "image_gen", label: "🎨 Tạo ảnh (Image Gen)", color: "bg-rose-500/15 text-rose-400 border-rose-500/30 font-semibold" },
  { id: "tools", label: "Tools", color: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  { id: "no_stream", label: "Non-streaming", color: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30" },
];

type SortMode = "newest" | "name_asc" | "name_desc" | "active_first" | "image_first";

const IMAGE_PRESETS = [
  {
    title: "OpenAI DALL·E",
    desc: "Cổng chuẩn OpenAI cho mô hình DALL·E 3 & DALL·E 2",
    baseUrl: "https://api.openai.com/v1",
    name: "OpenAI Image Studio",
    models: [
      { apiName: "dall-e-3", displayName: "DALL·E 3 (OpenAI)", capabilities: ["image_gen"] },
      { apiName: "dall-e-2", displayName: "DALL·E 2 (OpenAI)", capabilities: ["image_gen"] },
    ],
  },
  {
    title: "OpenRouter FLUX & SDXL",
    desc: "Cổng sinh ảnh qua OpenRouter (FLUX.1, Stable Diffusion XL)",
    baseUrl: "https://openrouter.ai/api/v1",
    name: "OpenRouter Image Gen",
    models: [
      { apiName: "black-forest-labs/flux-1-schnell", displayName: "FLUX.1 Schnell", capabilities: ["image_gen"] },
      { apiName: "stabilityai/stable-diffusion-xl-base-1.0", displayName: "SDXL 1.0 Base", capabilities: ["image_gen"] },
    ],
  },
  {
    title: "Local Stable Diffusion / ComfyUI",
    desc: "Server tạo ảnh nội bộ (SD WebUI / Fooocus / ComfyUI / proxy)",
    baseUrl: "http://localhost:7860/v1",
    name: "Local SD WebUI",
    models: [
      { apiName: "sdxl-turbo", displayName: "SDXL Turbo (Local)", capabilities: ["image_gen"] },
    ],
  },
  {
    title: "Custom Image Gen Proxy",
    desc: "Tự cấu hình máy chủ tạo ảnh tương thích chuẩn OpenAI",
    baseUrl: "https://my-image-proxy.com/v1",
    name: "Custom Image Server",
    models: [
      { apiName: "custom-image-model", displayName: "Custom Image Model", capabilities: ["image_gen"] },
    ],
  },
];

export default function AdminEndpointsPage() {
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [activeRoutes, setActiveRoutes] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");
  const [epFilter, setEpFilter] = useState<"all" | "image" | "chat">("all");

  // Endpoint modal state
  const [showEpModal, setShowEpModal] = useState(false);
  const [editingEp, setEditingEp] = useState<Endpoint | null>(null);
  const [epName, setEpName] = useState("");
  const [epUrl, setEpUrl] = useState("");
  const [epKey, setEpKey] = useState("");
  const [showEpKey, setShowEpKey] = useState(false);
  const [isImageEndpoint, setIsImageEndpoint] = useState(false);
  const [pendingPresetModels, setPendingPresetModels] = useState<Array<{ apiName: string; displayName: string; capabilities: string[] }>>([]);

  // Testing endpoint
  const [testing, setTesting] = useState<string | null>(null);

  // Add Model state
  const [addingFor, setAddingFor] = useState<string | null>(null);
  const [mApi, setMApi] = useState("");
  const [mName, setMName] = useState("");
  const [mCaps, setMCaps] = useState<string[]>(["chat"]);

  // Edit Model state
  const [editingModel, setEditingModel] = useState<CModel | null>(null);
  const [editMName, setEditMName] = useState("");
  const [editMCaps, setEditMCaps] = useState<string[]>([]);
  const [editMContext, setEditMContext] = useState(128000);
  const [editMEnabled, setEditMEnabled] = useState(true);

  // Per-endpoint model UI controls (Search, Sort, Filter, ViewMode)
  const [modelSearch, setModelSearch] = useState<Record<string, string>>({});
  const [modelSort, setModelSort] = useState<Record<string, SortMode>>({});
  const [modelCapFilter, setModelCapFilter] = useState<Record<string, string>>({});
  const [modelViewMode, setModelViewMode] = useState<Record<string, "grid" | "compact">>({});

  function say(s: string) {
    setMsg(s);
    setTimeout(() => setMsg(""), 4000);
  }

  async function load() {
    const [r, m] = await Promise.all([
      fetch("/api/admin/endpoints").then((x) => x.json()).catch(() => null),
      fetch("/api/admin/models").then((x) => x.json()).catch(() => null),
    ]);
    if (r?.endpoints) setEndpoints(r.endpoints);
    if (m?.routes) setActiveRoutes(m.routes);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleEpPaste() {
    try {
      if (!navigator.clipboard?.readText) throw new Error("Trình duyệt không hỗ trợ");
      const text = await navigator.clipboard.readText();
      if (text && text.trim()) {
        setEpKey(text.trim());
        say("📋 Đã dán key từ clipboard!");
      } else {
        say("⚠️ Bộ nhớ tạm đang trống.");
      }
    } catch {
      say("⚠️ Vui lòng click vào ô và nhấn Ctrl + V để dán.");
    }
  }

  function openCreate(presetForImage = false) {
    setEditingEp(null);
    setEpName("");
    setEpUrl("");
    setEpKey("");
    setShowEpKey(false);
    setIsImageEndpoint(presetForImage);
    setPendingPresetModels([]);
    if (presetForImage) {
      applyImagePreset(IMAGE_PRESETS[0]);
    }
    setShowEpModal(true);
  }

  function applyImagePreset(preset: typeof IMAGE_PRESETS[0]) {
    setEpName(preset.name);
    setEpUrl(preset.baseUrl);
    setIsImageEndpoint(true);
    setPendingPresetModels(preset.models);
  }

  function openEdit(e: Endpoint) {
    setEditingEp(e);
    setEpName(e.name);
    setEpUrl(e.baseUrl);
    setEpKey("");
    setShowEpKey(false);
    const hasImg = e.models.some((m) => m.capabilities.includes("image_gen"));
    setIsImageEndpoint(hasImg);
    setPendingPresetModels([]);
    setShowEpModal(true);
  }

  async function saveEndpoint() {
    if (!epName.trim() || !epUrl.trim()) return say("❌ Thiếu tên hoặc URL");
    const payload: { name: string; baseUrl: string; apiKey?: string } = {
      name: epName.trim(),
      baseUrl: epUrl.trim(),
    };
    if (epKey) payload.apiKey = epKey;

    const url = editingEp ? `/api/admin/endpoints/${editingEp.id}` : "/api/admin/endpoints";
    const r = await fetch(url, {
      method: editingEp ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then((x) => x.json());

    if (r?.endpoint || r?.ok) {
      const savedEpId = r.endpoint?.id || editingEp?.id;
      // If newly created and has pending preset models, auto-create them!
      if (!editingEp && savedEpId && pendingPresetModels.length > 0) {
        for (const pm of pendingPresetModels) {
          await fetch("/api/admin/endpoint-models", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              endpointId: savedEpId,
              apiName: pm.apiName,
              displayName: pm.displayName,
              capabilities: pm.capabilities,
            }),
          }).catch(() => null);
        }
      }

      setShowEpModal(false);
      load();
      say(editingEp ? "Đã cập nhật endpoint ✓" : "Đã tạo endpoint thành công ✓");
    } else {
      say(`❌ ${r?.error ?? "Lỗi lưu endpoint"}`);
    }
  }

  async function toggleEp(e: Endpoint, enabled: boolean) {
    await fetch(`/api/admin/endpoints/${e.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    load();
  }

  async function deleteEp(e: Endpoint) {
    if (!confirm(`Xóa endpoint "${e.name}" và toàn bộ ${e.modelCount} model?`)) return;
    await fetch(`/api/admin/endpoints/${e.id}`, { method: "DELETE" });
    load();
    say("Đã xóa.");
  }

  async function testEndpoint(e: Endpoint) {
    setTesting(e.id);
    const r = await fetch(`/api/admin/endpoints/${e.id}/test`, { method: "POST" }).then((x) => x.json());
    say(r.ok ? `✅ ${r.message}` : `❌ ${r.error ?? "Lỗi kết nối"}`);
    setTesting(null);
  }

  function startAddingModel(endpoint: Endpoint) {
    setAddingFor(endpoint.id);
    setMApi("");
    setMName("");
    const isImg = endpoint.models.some((m) => m.capabilities.includes("image_gen")) || /ảnh|image|flux|dall|sdxl/i.test(endpoint.name);
    setMCaps(isImg ? ["image_gen"] : ["chat"]);
  }

  async function addModel(endpointId: string) {
    if (!mApi.trim()) return say("❌ Thiếu tên model (api_name).");
    const r = await fetch("/api/admin/endpoint-models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpointId,
        apiName: mApi.trim(),
        displayName: mName.trim() || undefined,
        capabilities: mCaps,
      }),
    }).then((x) => x.json());

    if (r?.model) {
      setAddingFor(null);
      setMApi("");
      setMName("");
      setMCaps(["chat"]);
      load();
      say("Đã thêm model ✓");
    } else {
      say(`❌ ${r?.error ?? "Lỗi thêm model"}`);
    }
  }

  function openEditModel(m: CModel) {
    setEditingModel(m);
    setEditMName(m.displayName);
    setEditMCaps([...m.capabilities]);
    setEditMContext(m.contextWindow || 128000);
    setEditMEnabled(m.enabled);
  }

  async function saveEditedModel() {
    if (!editingModel) return;
    const r = await fetch("/api/admin/endpoint-models", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editingModel.id,
        displayName: editMName.trim() || undefined,
        capabilities: editMCaps,
        contextWindow: editMContext,
        enabled: editMEnabled,
      }),
    }).then((x) => x.json());

    if (r?.model) {
      setEditingModel(null);
      load();
      say("Đã cập nhật model ✓");
    } else {
      say(`❌ ${r?.error ?? "Lỗi cập nhật model"}`);
    }
  }

  async function toggleModel(m: CModel, enabled: boolean) {
    await fetch("/api/admin/endpoint-models", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: m.id, enabled }),
    });
    load();
  }

  async function deleteModel(m: CModel) {
    if (!confirm(`Xóa model "${m.displayName}"?`)) return;
    await fetch(`/api/admin/endpoint-models?id=${encodeURIComponent(m.id)}`, { method: "DELETE" });
    load();
  }

  async function setAsActiveImageModel(modelId: string, modelName: string) {
    try {
      const res = await fetch("/api/admin/models", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "route", functionKey: "image_gen", modelId }),
      }).then((x) => x.json());

      if (res.ok) {
        setActiveRoutes((prev) => ({ ...prev, image_gen: modelId }));
        say(`⭐ Đã đặt "${modelName}" làm model Tạo Ảnh mặc định!`);
      } else {
        say("❌ Không thể đặt làm mặc định");
      }
    } catch {
      say("❌ Lỗi khi định tuyến");
    }
  }

  async function bulkToggleModels(endpointId: string, targetModels: CModel[], enabled: boolean) {
    try {
      await Promise.all(
        targetModels.map((m) =>
          fetch("/api/admin/endpoint-models", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: m.id, enabled }),
          })
        )
      );
      load();
      say(`Đã ${enabled ? "bật" : "tắt"} ${targetModels.length} models ✓`);
    } catch {
      say("❌ Lỗi khi cập nhật hàng loạt");
    }
  }

  // Filter endpoints
  const filteredEndpoints = useMemo(() => {
    return endpoints.filter((e) => {
      const hasImg = e.models.some((m) => m.capabilities.includes("image_gen")) || /ảnh|image|flux|dall|sdxl/i.test(e.name);
      if (epFilter === "image") return hasImg;
      if (epFilter === "chat") return !hasImg;
      return true;
    });
  }, [endpoints, epFilter]);

  const imageEndpointsCount = useMemo(
    () => endpoints.filter((e) => e.models.some((m) => m.capabilities.includes("image_gen")) || /ảnh|image|flux|dall|sdxl/i.test(e.name)).length,
    [endpoints]
  );
  const chatEndpointsCount = endpoints.length - imageEndpointsCount;

  return (
    <div className="pb-16">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl font-bold tracking-tight flex items-center gap-2 text-[#ECEBE4]">
            <PlugZap size={22} className="text-[#D97757]" />
            Cài đặt Endpoints riêng & Tạo ảnh AI
          </h1>
          <p className="text-xs text-[#9B9990] mt-1">
            Quản lý server OpenAI-compatible (Ollama, vLLM, LM Studio) và cấu hình máy chủ chuyên Tạo ảnh (DALL-E, FLUX, SDXL, ComfyUI).
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            onClick={() => openCreate(true)}
            className="text-xs bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30"
          >
            <Palette size={14} className="text-rose-400" />
            + Thêm Endpoint Tạo Ảnh
          </Button>
          <Button onClick={() => openCreate(false)} className="text-xs">
            <Plus size={14} /> Thêm endpoint thường
          </Button>
        </div>
      </div>

      {msg && (
        <div className="text-xs mb-4 px-4 py-2.5 rounded-xl bg-[#D97757]/15 border border-[#D97757]/30 text-[#ECEBE4] animate-in fade-in flex items-center justify-between">
          <span>{msg}</span>
          <button onClick={() => setMsg("")} className="text-[#9B9990] hover:text-white text-xs">✕</button>
        </div>
      )}

      {/* Filter Tabs for Endpoints */}
      <div className="flex items-center justify-between gap-2 border-b border-white/[0.08] pb-3 mb-5">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setEpFilter("all")}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer",
              epFilter === "all" ? "bg-[#D97757]/20 text-[#D97757] border border-[#D97757]/40" : "text-[#9B9990] hover:text-white"
            )}
          >
            Tất cả Endpoints ({endpoints.length})
          </button>
          <button
            onClick={() => setEpFilter("image")}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5",
              epFilter === "image" ? "bg-rose-500/20 text-rose-300 border-rose-500/40" : "text-[#9B9990] hover:text-white"
            )}
          >
            <Palette size={13} className="text-rose-400" />
            Endpoints Tạo Ảnh ({imageEndpointsCount})
          </button>
          <button
            onClick={() => setEpFilter("chat")}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer",
              epFilter === "chat" ? "bg-sky-500/20 text-sky-300 border-sky-500/40" : "text-[#9B9990] hover:text-white"
            )}
          >
            Endpoints Chat & LLM ({chatEndpointsCount})
          </button>
        </div>
        <div className="text-[11px] text-[#9B9990]">
          Model Tạo Ảnh mặc định hiện tại:{" "}
          <span className="font-mono text-[#ECEBE4] font-semibold">
            {activeRoutes.image_gen ?? "dall-e-3"}
          </span>
        </div>
      </div>

      {/* Endpoints List */}
      <div className="flex flex-col gap-6">
        {filteredEndpoints.length === 0 ? (
          <div className="card p-8 text-center text-[#9B9990]">
            <PlugZap size={32} className="mx-auto mb-2 opacity-40" />
            <p className="text-sm font-medium text-[#ECEBE4]">Chưa có endpoint nào trong danh mục này</p>
            <p className="text-xs mt-1">Bấm nút &quot;Thêm Endpoint Tạo Ảnh&quot; hoặc &quot;Thêm endpoint thường&quot; ở trên để bắt đầu cấu hình.</p>
          </div>
        ) : (
          filteredEndpoints.map((e) => {
            const hasImgModel = e.models.some((m) => m.capabilities.includes("image_gen")) || /ảnh|image|flux|dall|sdxl/i.test(e.name);
            const query = (modelSearch[e.id] ?? "").toLowerCase().trim();
            const sort = modelSort[e.id] ?? "newest";
            const capFilter = modelCapFilter[e.id] ?? "all";
            const viewMode = modelViewMode[e.id] ?? "grid";

            // Filter models
            let displayModels = [...e.models];
            if (query) {
              displayModels = displayModels.filter(
                (m) =>
                  m.displayName.toLowerCase().includes(query) ||
                  m.apiName.toLowerCase().includes(query)
              );
            }
            if (capFilter !== "all") {
              displayModels = displayModels.filter((m) => m.capabilities.includes(capFilter));
            }

            // Sort models
            displayModels.sort((a, b) => {
              if (sort === "name_asc") return a.displayName.localeCompare(b.displayName);
              if (sort === "name_desc") return b.displayName.localeCompare(a.displayName);
              if (sort === "active_first") return (b.enabled ? 1 : 0) - (a.enabled ? 1 : 0);
              if (sort === "image_first") {
                const aImg = a.capabilities.includes("image_gen") ? 1 : 0;
                const bImg = b.capabilities.includes("image_gen") ? 1 : 0;
                return bImg - aImg;
              }
              return 0; // newest / default order
            });

            const imgModelCount = e.models.filter((m) => m.capabilities.includes("image_gen")).length;
            const chatModelCount = e.models.filter((m) => m.capabilities.includes("chat")).length;
            const visionModelCount = e.models.filter((m) => m.capabilities.includes("vision")).length;
            const reasoningModelCount = e.models.filter((m) => m.capabilities.includes("reasoning")).length;

            return (
              <div
                key={e.id}
                className={cn(
                  "card p-5 border transition-all duration-200",
                  !e.enabled && "opacity-75",
                  hasImgModel
                    ? "border-rose-500/20 bg-gradient-to-b from-[#1C1A18] to-[#161514]"
                    : "border-white/[0.08]"
                )}
              >
                {/* Endpoint Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-white/[0.08]">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-semibold text-[#ECEBE4] truncate">{e.name}</h2>
                      {hasImgModel && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                          <Palette size={10} /> Endpoint Tạo Ảnh
                        </span>
                      )}
                      <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-black/40 border border-white/[0.06] text-[#9B9990] truncate">
                        {e.baseUrl}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-xs text-[#9B9990]">
                      <span>{e.modelCount} models</span>
                      <span>·</span>
                      <span className={e.hasKey ? "text-emerald-400" : "text-amber-400"}>
                        {e.hasKey ? `Có ${e.keyHints?.length || 1} API key` : "Không dùng key"}
                      </span>
                      {hasImgModel && (
                        <>
                          <span>·</span>
                          <span className="text-rose-400 font-medium">{imgModelCount} model tạo ảnh</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Toggle checked={e.enabled} onChange={(v) => toggleEp(e, v)} label="Bật" />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => testEndpoint(e)}
                      disabled={testing === e.id}
                      className="text-xs h-8"
                    >
                      <PlugZap size={13} /> {testing === e.id ? "…" : "Test kết nối"}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => openEdit(e)} className="text-xs h-8">
                      <Edit2 size={12} /> Sửa
                    </Button>
                    <button
                      className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg cursor-pointer transition-colors"
                      onClick={() => deleteEp(e)}
                      title="Xóa endpoint"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* Models Section with Sorting & Filtering Toolbar */}
                <div className="mt-4">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5 mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-[#9B9990]">
                        Danh sách Models ({e.models.length})
                      </span>
                      {query && (
                        <span className="text-[11px] text-amber-400">
                          (Khớp {displayModels.length} kết quả)
                        </span>
                      )}
                    </div>

                    {/* Toolbar Controls */}
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Search */}
                      <div className="relative">
                        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#75736C]" />
                        <input
                          type="text"
                          placeholder="Tìm model..."
                          value={modelSearch[e.id] ?? ""}
                          onChange={(ev) =>
                            setModelSearch((prev) => ({ ...prev, [e.id]: ev.target.value }))
                          }
                          className="h-7 pl-7 pr-2.5 text-xs rounded-lg bg-black/30 border border-white/10 text-[#ECEBE4] placeholder:text-[#75736C] focus:border-[#D97757] outline-none w-36 sm:w-44 font-sans"
                        />
                      </div>

                      {/* Sort Dropdown */}
                      <div className="flex items-center gap-1 bg-black/30 border border-white/10 rounded-lg px-2 h-7 text-xs text-[#9B9990]">
                        <ArrowUpDown size={11} className="text-[#D97757]" />
                        <select
                          value={sort}
                          onChange={(ev) =>
                            setModelSort((prev) => ({ ...prev, [e.id]: ev.target.value as SortMode }))
                          }
                          className="bg-transparent text-xs text-[#ECEBE4] outline-none cursor-pointer pr-1"
                        >
                          <option value="newest" className="bg-[#1C1A18] text-[#ECEBE4]">Mới thêm</option>
                          <option value="name_asc" className="bg-[#1C1A18] text-[#ECEBE4]">Tên A → Z</option>
                          <option value="name_desc" className="bg-[#1C1A18] text-[#ECEBE4]">Tên Z → A</option>
                          <option value="image_first" className="bg-[#1C1A18] text-[#ECEBE4]">🎨 Ưu tiên Tạo ảnh</option>
                          <option value="active_first" className="bg-[#1C1A18] text-[#ECEBE4]">🟢 Ưu tiên Bật</option>
                        </select>
                      </div>

                      {/* View Mode Switcher */}
                      <div className="flex items-center rounded-lg bg-black/30 border border-white/10 p-0.5 h-7">
                        <button
                          type="button"
                          onClick={() => setModelViewMode((p) => ({ ...p, [e.id]: "grid" }))}
                          className={cn(
                            "px-1.5 py-1 rounded cursor-pointer transition-colors",
                            viewMode === "grid" ? "bg-[#D97757]/30 text-[#D97757]" : "text-[#75736C] hover:text-white"
                          )}
                          title="Dạng lưới thẻ"
                        >
                          <LayoutGrid size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setModelViewMode((p) => ({ ...p, [e.id]: "compact" }))}
                          className={cn(
                            "px-1.5 py-1 rounded cursor-pointer transition-colors",
                            viewMode === "compact" ? "bg-[#D97757]/30 text-[#D97757]" : "text-[#75736C] hover:text-white"
                          )}
                          title="Dạng thẻ gọn"
                        >
                          <List size={13} />
                        </button>
                      </div>

                      {/* Bulk Toggle Buttons */}
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => bulkToggleModels(e.id, displayModels, true)}
                          className="text-[10px] px-2 py-1 rounded bg-white/[0.04] hover:bg-white/[0.08] text-[#9B9990] hover:text-white border border-white/[0.08] cursor-pointer"
                        >
                          Bật tất cả
                        </button>
                        <button
                          type="button"
                          onClick={() => bulkToggleModels(e.id, displayModels, false)}
                          className="text-[10px] px-2 py-1 rounded bg-white/[0.04] hover:bg-white/[0.08] text-[#9B9990] hover:text-white border border-white/[0.08] cursor-pointer"
                        >
                          Tắt tất cả
                        </button>
                      </div>

                      {/* Add Model Button */}
                      <Button
                        size="xs"
                        onClick={() => startAddingModel(e)}
                        className="h-7 text-xs bg-[#D97757]/20 hover:bg-[#D97757]/30 text-[#D97757] border border-[#D97757]/40"
                      >
                        <Plus size={12} /> Thêm model
                      </Button>
                    </div>
                  </div>

                  {/* Capability Filters Row */}
                  <div className="flex flex-wrap items-center gap-1.5 mb-3.5 pb-2 border-b border-white/[0.05]">
                    <button
                      type="button"
                      onClick={() => setModelCapFilter((p) => ({ ...p, [e.id]: "all" }))}
                      className={cn(
                        "text-[11px] px-2.5 py-0.5 rounded-full cursor-pointer transition-colors border",
                        capFilter === "all"
                          ? "bg-white/10 text-white border-white/20 font-medium"
                          : "text-[#75736C] border-transparent hover:text-[#ECEBE4]"
                      )}
                    >
                      Tất cả ({e.models.length})
                    </button>
                    {imgModelCount > 0 && (
                      <button
                        type="button"
                        onClick={() => setModelCapFilter((p) => ({ ...p, [e.id]: "image_gen" }))}
                        className={cn(
                          "text-[11px] px-2.5 py-0.5 rounded-full cursor-pointer transition-colors border flex items-center gap-1",
                          capFilter === "image_gen"
                            ? "bg-rose-500/20 text-rose-300 border-rose-500/40 font-medium"
                            : "text-[#75736C] border-transparent hover:text-rose-400"
                        )}
                      >
                        <Palette size={10} /> Tạo ảnh ({imgModelCount})
                      </button>
                    )}
                    {chatModelCount > 0 && (
                      <button
                        type="button"
                        onClick={() => setModelCapFilter((p) => ({ ...p, [e.id]: "chat" }))}
                        className={cn(
                          "text-[11px] px-2.5 py-0.5 rounded-full cursor-pointer transition-colors border",
                          capFilter === "chat"
                            ? "bg-sky-500/20 text-sky-300 border-sky-500/40 font-medium"
                            : "text-[#75736C] border-transparent hover:text-sky-400"
                        )}
                      >
                        Chat ({chatModelCount})
                      </button>
                    )}
                    {visionModelCount > 0 && (
                      <button
                        type="button"
                        onClick={() => setModelCapFilter((p) => ({ ...p, [e.id]: "vision" }))}
                        className={cn(
                          "text-[11px] px-2.5 py-0.5 rounded-full cursor-pointer transition-colors border",
                          capFilter === "vision"
                            ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40 font-medium"
                            : "text-[#75736C] border-transparent hover:text-emerald-400"
                        )}
                      >
                        Đọc ảnh ({visionModelCount})
                      </button>
                    )}
                    {reasoningModelCount > 0 && (
                      <button
                        type="button"
                        onClick={() => setModelCapFilter((p) => ({ ...p, [e.id]: "reasoning" }))}
                        className={cn(
                          "text-[11px] px-2.5 py-0.5 rounded-full cursor-pointer transition-colors border",
                          capFilter === "reasoning"
                            ? "bg-purple-500/20 text-purple-300 border-purple-500/40 font-medium"
                            : "text-[#75736C] border-transparent hover:text-purple-400"
                        )}
                      >
                        Suy luận ({reasoningModelCount})
                      </button>
                    )}
                  </div>

                  {/* Add Model Inline Form */}
                  {addingFor === e.id && (
                    <div className="mb-4 p-4 surface-2 rounded-xl border border-white/10 grid gap-3 animate-in fade-in">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-[#ECEBE4]">
                          Thêm model mới vào &quot;{e.name}&quot;
                        </span>
                        <button
                          type="button"
                          onClick={() => setAddingFor(null)}
                          className="text-xs text-[#75736C] hover:text-white"
                        >
                          ✕ Đóng
                        </button>
                      </div>
                      <div className="grid sm:grid-cols-2 gap-2">
                        <div>
                          <label className="text-[11px] text-[#9B9990] mb-1 block">API Name (tên máy chủ nhận) *</label>
                          <Input
                            placeholder="VD: dall-e-3 hoặc flux-1-schnell"
                            value={mApi}
                            onChange={(ev) => setMApi(ev.target.value)}
                            className="text-xs font-mono"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] text-[#9B9990] mb-1 block">Tên hiển thị (Display Name)</label>
                          <Input
                            placeholder="VD: FLUX.1 Schnell (Nhanh)"
                            value={mName}
                            onChange={(ev) => setMName(ev.target.value)}
                            className="text-xs"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="text-[11px] text-[#9B9990] mb-1.5 block">Chọn khả năng (Capabilities):</label>
                        <div className="flex flex-wrap gap-1.5">
                          {CAPS.map((c) => {
                            const isSelected = mCaps.includes(c.id);
                            return (
                              <button
                                key={c.id}
                                type="button"
                                onClick={() =>
                                  setMCaps((s) =>
                                    s.includes(c.id) ? s.filter((x) => x !== c.id) : [...s, c.id]
                                  )
                                }
                                className={cn(
                                  "px-2.5 py-1 rounded-lg text-xs border cursor-pointer transition-colors flex items-center gap-1",
                                  isSelected
                                    ? "bg-[#D97757]/20 border-[#D97757] text-[#D97757] font-medium"
                                    : "border-white/10 text-[#75736C] hover:border-white/20"
                                )}
                              >
                                {isSelected && <Check size={11} />}
                                {c.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="flex gap-2 pt-1">
                        <Button onClick={() => addModel(e.id)} className="text-xs">
                          Lưu model vào endpoint
                        </Button>
                        <Button variant="ghost" onClick={() => setAddingFor(null)} className="text-xs">
                          Hủy
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Render Models */}
                  {displayModels.length === 0 ? (
                    <div className="p-4 rounded-xl bg-black/20 text-center text-xs text-[#75736C]">
                      {query ? "Không tìm thấy model phù hợp với tìm kiếm." : "Endpoint này chưa có model nào."}
                    </div>
                  ) : viewMode === "grid" ? (
                    /* Grid Cards View */
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                      {displayModels.map((m) => {
                        const isImageGen = m.capabilities.includes("image_gen");
                        const isActiveImage = activeRoutes.image_gen === m.id;

                        return (
                          <div
                            key={m.id}
                            className={cn(
                              "p-3 rounded-xl border flex flex-col justify-between transition-all duration-150 relative",
                              !m.enabled ? "opacity-50 bg-white/[0.01] border-white/[0.04]" : "bg-white/[0.03] border-white/[0.08] hover:border-white/[0.15]",
                              isActiveImage && "ring-1 ring-amber-400/50 border-amber-400/30"
                            )}
                          >
                            <div>
                              <div className="flex items-start justify-between gap-1.5 mb-1.5">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5">
                                    <p className="font-semibold text-xs text-[#ECEBE4] truncate">
                                      {m.displayName}
                                    </p>
                                    {isImageGen && (
                                      <span className="shrink-0 text-rose-400" title="Model tạo ảnh">
                                        <Palette size={12} />
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[10px] font-mono text-[#75736C] truncate mt-0.5">
                                    {m.apiName}
                                  </p>
                                </div>
                                <Toggle
                                  checked={m.enabled}
                                  onChange={(v) => toggleModel(m, v)}
                                  label=""
                                />
                              </div>

                              {/* Capability Tags */}
                              <div className="flex flex-wrap gap-1 mt-2">
                                {m.capabilities.map((cap) => {
                                  const cDef = CAPS.find((c) => c.id === cap);
                                  return (
                                    <span
                                      key={cap}
                                      className={cn(
                                        "text-[9px] px-1.5 py-0.5 rounded border leading-tight",
                                        cDef?.color ?? "bg-white/5 text-[#9B9990] border-white/10"
                                      )}
                                    >
                                      {cDef?.label ?? cap}
                                    </span>
                                  );
                                })}
                              </div>
                            </div>

                            {/* Card Footer: Context, Action buttons & Set Route */}
                            <div className="pt-2.5 mt-2.5 border-t border-white/[0.06] flex items-center justify-between text-[11px]">
                              <span className="text-[10px] text-[#75736C]">
                                {m.contextWindow ? `${(m.contextWindow / 1000).toFixed(0)}k tok` : ""}
                              </span>

                              <div className="flex items-center gap-1">
                                {isImageGen && (
                                  isActiveImage ? (
                                    <span className="text-[10px] text-amber-400 bg-amber-400/15 border border-amber-400/30 px-1.5 py-0.5 rounded flex items-center gap-1 font-medium">
                                      <Star size={9} fill="currentColor" /> Mặc định
                                    </span>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => setAsActiveImageModel(m.id, m.displayName)}
                                      className="text-[10px] text-[#75736C] hover:text-amber-400 hover:bg-amber-400/10 px-1.5 py-0.5 rounded border border-white/10 transition-colors cursor-pointer flex items-center gap-1"
                                      title="Đặt làm model tạo ảnh mặc định cho hệ thống"
                                    >
                                      <Star size={9} /> Dùng tạo ảnh
                                    </button>
                                  )
                                )}
                                <button
                                  type="button"
                                  onClick={() => openEditModel(m)}
                                  className="p-1 text-[#75736C] hover:text-[#ECEBE4] hover:bg-white/[0.06] rounded cursor-pointer transition-colors"
                                  title="Chỉnh sửa model"
                                >
                                  <Edit2 size={12} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => deleteModel(m)}
                                  className="p-1 text-red-400/60 hover:text-red-400 hover:bg-red-500/10 rounded cursor-pointer transition-colors"
                                  title="Xóa model"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    /* Compact Pills View */
                    <div className="flex flex-wrap gap-2">
                      {displayModels.map((m) => {
                        const isImg = m.capabilities.includes("image_gen");
                        const isActiveImage = activeRoutes.image_gen === m.id;

                        return (
                          <div
                            key={m.id}
                            className={cn(
                              "flex items-center gap-2 pl-3 pr-2 py-1.5 rounded-full surface-2 text-xs border border-white/[0.08] transition-all",
                              !m.enabled && "opacity-50",
                              isActiveImage && "border-amber-400/40 bg-amber-400/10"
                            )}
                          >
                            <span className="flex items-center gap-1 font-medium">
                              {isImg && <Palette size={11} className="text-rose-400 shrink-0" />}
                              {m.displayName}
                            </span>
                            {isImg && !isActiveImage && (
                              <button
                                type="button"
                                onClick={() => setAsActiveImageModel(m.id, m.displayName)}
                                className="text-[10px] text-amber-400 hover:underline cursor-pointer"
                                title="Đặt làm mặc định tạo ảnh"
                              >
                                <Star size={11} />
                              </button>
                            )}
                            <Toggle checked={m.enabled} onChange={(v) => toggleModel(m, v)} label="" />
                            <button
                              type="button"
                              onClick={() => openEditModel(m)}
                              className="text-[#75736C] hover:text-[#ECEBE4] cursor-pointer p-0.5"
                              title="Sửa model"
                            >
                              <Edit2 size={11} />
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteModel(m)}
                              className="text-red-400/70 hover:text-red-400 cursor-pointer p-0.5"
                              title="Xóa model"
                            >
                              <Trash2 size={11} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal Thêm/Sửa Endpoint */}
      <Modal
        open={showEpModal}
        onClose={() => setShowEpModal(false)}
        title={
          editingEp
            ? "Chỉnh sửa Endpoint"
            : isImageEndpoint
            ? "🎨 Thêm Endpoint Tạo Ảnh Riêng (Image Gen)"
            : "Thêm Endpoint Mới"
        }
        wide={true}
      >
        <div className="flex flex-col gap-4">
          {/* Preset Buttons for Image Gen if creating */}
          {!editingEp && (
            <div className="p-3 rounded-xl bg-black/30 border border-white/[0.08]">
              <p className="text-xs font-semibold text-[#ECEBE4] mb-2 flex items-center gap-1.5">
                <Sparkles size={13} className="text-[#D97757]" /> Chọn mẫu cấu hình nhanh (Presets):
              </p>
              <div className="grid sm:grid-cols-2 gap-2">
                {IMAGE_PRESETS.map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => applyImagePreset(preset)}
                    className={cn(
                      "p-2.5 rounded-lg border text-left cursor-pointer transition-colors text-xs flex flex-col justify-between",
                      epName === preset.name
                        ? "bg-rose-500/15 border-rose-500/40 text-[#ECEBE4]"
                        : "bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.06] text-[#9B9990]"
                    )}
                  >
                    <div>
                      <p className="font-semibold text-[#ECEBE4] flex items-center justify-between">
                        {preset.title}
                        {epName === preset.name && <Check size={12} className="text-rose-400" />}
                      </p>
                      <p className="text-[11px] text-[#75736C] mt-0.5">{preset.desc}</p>
                    </div>
                    <span className="text-[10px] font-mono text-[#D97757] mt-1.5">
                      {preset.baseUrl}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-3">
            <label className="text-xs text-[#9B9990]">
              Tên gợi nhớ *
              <Input
                className="mt-1 text-xs"
                placeholder="VD: OpenAI Image Gen, ComfyUI Local…"
                value={epName}
                onChange={(e) => setEpName(e.target.value)}
              />
            </label>
            <label className="text-xs text-[#9B9990]">
              Base URL *
              <Input
                className="mt-1 font-mono text-xs"
                placeholder="https://api.openai.com/v1 hoặc http://localhost:7860/v1"
                value={epUrl}
                onChange={(e) => setEpUrl(e.target.value)}
              />
            </label>
          </div>

          {/* Pending models preview if preset was selected */}
          {!editingEp && pendingPresetModels.length > 0 && (
            <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-[#ECEBE4]">
              <span className="font-semibold text-rose-300">Tự động khởi tạo {pendingPresetModels.length} models tạo ảnh: </span>
              <span className="text-[11px] text-[#9B9990]">
                {pendingPresetModels.map((p) => p.displayName).join(", ")}
              </span>
            </div>
          )}

          {/* API Keys Management */}
          <div className="flex flex-col gap-2 p-3.5 rounded-xl bg-black/25 border border-white/[0.08]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[#ECEBE4] flex items-center gap-1.5">
                <Key size={13} className="text-[#D97757]" /> Danh sách API Key (
                {editingEp?.keyHints?.length ?? (editingEp?.hasKey ? 1 : 0)})
              </span>
              {editingEp?.hasKey && (
                <button
                  type="button"
                  onClick={async () => {
                    if (confirm("Xóa tất cả key?")) {
                      await fetch(`/api/admin/endpoints/${editingEp.id}`, {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ clearKey: true }),
                      });
                      load();
                      setEditingEp((p) => (p ? { ...p, hasKey: false, keyHints: [] } : null));
                    }
                  }}
                  className="text-[11px] text-red-400 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 size={11} /> Xóa tất cả
                </button>
              )}
            </div>

            {editingEp?.keyHints && editingEp.keyHints.length > 0 && (
              <div className="flex flex-col gap-1 max-h-32 overflow-y-auto">
                {editingEp.keyHints.map((hint, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between px-2.5 py-1 rounded-lg bg-white/[0.03] border border-white/[0.06] text-xs font-mono"
                  >
                    <span className="truncate text-[#ECEBE4]">{hint}</span>
                    <button
                      type="button"
                      onClick={async () => {
                        await fetch(`/api/admin/endpoints/${editingEp.id}`, {
                          method: "PUT",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ removeKeyIndex: idx }),
                        });
                        load();
                        const next = [...(editingEp.keyHints ?? [])];
                        next.splice(idx, 1);
                        setEditingEp((p) => (p ? { ...p, keyHints: next } : null));
                      }}
                      className="text-[#75736C] hover:text-red-400 cursor-pointer"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center gap-1.5 mt-1">
              <div className="relative flex-1">
                <Input
                  type={showEpKey ? "text" : "password"}
                  placeholder="Dán API key (để trống nếu server cục bộ không cần key)…"
                  value={epKey}
                  onChange={(e) => setEpKey(e.target.value)}
                  className="text-xs font-mono h-8.5 pr-8"
                />
                <button
                  type="button"
                  onClick={() => setShowEpKey(!showEpKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[#75736C] hover:text-[#ECEBE4] cursor-pointer"
                >
                  <Eye size={13} />
                </button>
              </div>
              <button
                type="button"
                onClick={handleEpPaste}
                className="h-8.5 px-2.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-xs font-medium inline-flex items-center gap-1 cursor-pointer"
              >
                <ClipboardPaste size={13} className="text-[#D97757]" /> Dán
              </button>
              {editingEp && (
                <Button
                  disabled={!epKey.trim()}
                  onClick={async () => {
                    await fetch(`/api/admin/endpoints/${editingEp.id}`, {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ addKey: epKey.trim() }),
                    });
                    setEpKey("");
                    load();
                    say("Đã thêm key ✓");
                  }}
                  className="text-xs h-8.5 px-3"
                >
                  Thêm
                </Button>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setShowEpModal(false)} className="text-xs">
              Hủy
            </Button>
            <Button onClick={saveEndpoint} className="text-xs">
              {editingEp ? "Lưu thông tin" : "Hoàn tất thêm Endpoint"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal Sửa Model */}
      <Modal
        open={Boolean(editingModel)}
        onClose={() => setEditingModel(null)}
        title={`Chỉnh sửa Model: ${editingModel?.displayName || ""}`}
      >
        <div className="flex flex-col gap-3">
          <label className="text-xs text-[#9B9990]">
            Tên hiển thị (Display Name)
            <Input
              className="mt-1 text-xs"
              value={editMName}
              onChange={(e) => setEditMName(e.target.value)}
            />
          </label>

          <label className="text-xs text-[#9B9990]">
            Mã API (Server Name - Không thể đổi)
            <Input
              disabled
              className="mt-1 text-xs font-mono opacity-60"
              value={editingModel?.apiName || ""}
            />
          </label>

          <div>
            <label className="text-xs text-[#9B9990] mb-1.5 block">Các khả năng hỗ trợ:</label>
            <div className="flex flex-wrap gap-1.5">
              {CAPS.map((c) => {
                const isChecked = editMCaps.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() =>
                      setEditMCaps((prev) =>
                        prev.includes(c.id) ? prev.filter((x) => x !== c.id) : [...prev, c.id]
                      )
                    }
                    className={cn(
                      "px-2.5 py-1 rounded-lg text-xs border cursor-pointer transition-colors flex items-center gap-1",
                      isChecked
                        ? "bg-[#D97757]/20 border-[#D97757] text-[#D97757] font-semibold"
                        : "border-white/10 text-[#75736C] hover:border-white/20"
                    )}
                  >
                    {isChecked && <Check size={11} />}
                    {c.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-white/[0.08]">
            <span className="text-xs text-[#ECEBE4]">Trạng thái kích hoạt</span>
            <Toggle checked={editMEnabled} onChange={(v) => setEditMEnabled(v)} label="Bật model" />
          </div>

          <div className="flex justify-end gap-2 pt-3">
            <Button variant="ghost" onClick={() => setEditingModel(null)} className="text-xs">
              Hủy
            </Button>
            <Button onClick={saveEditedModel} className="text-xs">
              Lưu thay đổi
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
