"use client";
import { useEffect, useState } from "react";
import { Image as ImageIcon, Film, MessageSquare, Zap, Brain, Database, Palette } from "lucide-react";
import { Toggle } from "@/components/ui/primitives";
import { FUNCTION_LABELS, type FunctionKey } from "@/lib/config";
import type { AIModel } from "@/types";
import { cn } from "@/lib/utils";

const FUNC_ICON: Record<string, React.ReactNode> = {
  chat_default: <MessageSquare size={15} />,
  chat_fast: <Zap size={15} />,
  vision: <ImageIcon size={15} />,
  video: <Film size={15} />,
  reasoning: <Brain size={15} />,
  embeddings: <Database size={15} />,
  image_gen: <Palette size={15} className="text-rose-400" />,
};

export default function AdminModelsPage() {
  const [models, setModels] = useState<AIModel[]>([]);
  const [customModels, setCustomModels] = useState<AIModel[]>([]);
  const [routes, setRoutes] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [savingNote, setSavingNote] = useState<Record<string, boolean>>({});
  const [savedNote, setSavedNote] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState("");

  async function load() {
    const [r, e] = await Promise.all([
      fetch("/api/admin/models").then((x) => x.json()).catch(() => null),
      fetch("/api/admin/endpoints").then((x) => x.json()).catch(() => null),
    ]);
    if (r) {
      setModels(r.models ?? []);
      setRoutes(r.routes ?? {});
      if (r.notes) setNotes(r.notes);
    }
    if (e?.endpoints) {
      const customs: AIModel[] = [];
      for (const ep of e.endpoints) {
        for (const m of ep.models ?? []) {
          customs.push({
            id: m.id, provider: "custom", name: `${m.displayName} (${ep.name})`,
            contextWindow: m.contextWindow, capabilities: m.capabilities,
            inputPricePerM: m.inputPricePerM, outputPricePerM: m.outputPricePerM,
            enabled: m.enabled, requiresKey: true,
          });
        }
      }
      setCustomModels(customs);
    }
  }
  useEffect(() => { load(); }, []);

  async function toggle(m: AIModel, enabled: boolean) {
    await fetch("/api/admin/models", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "toggle", modelId: m.id, provider: m.provider, enabled }) });
    setModels((s) => s.map((x) => x.id === m.id ? { ...x, enabled } : x));
  }

  async function setRoute(fk: string, modelId: string) {
    await fetch("/api/admin/models", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "route", functionKey: fk, modelId }) });
    setRoutes((s) => ({ ...s, [fk]: modelId }));
    setMsg(`Đã gán ${FUNCTION_LABELS[fk as FunctionKey]} → ${modelId} ✓`);
    setTimeout(() => setMsg(""), 2500);
  }

  async function saveNote(modelId: string, note: string) {
    setSavingNote((s) => ({ ...s, [modelId]: true }));
    try {
      const res = await fetch("/api/admin/models", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "note", modelId, note }),
      });
      if (res.ok) {
        setSavedNote((s) => ({ ...s, [modelId]: true }));
        setTimeout(() => setSavedNote((s) => ({ ...s, [modelId]: false })), 2500);
      }
    } finally {
      setSavingNote((s) => ({ ...s, [modelId]: false }));
    }
  }

  const enabledModels = models.filter((m) => m.enabled);
  const allForRoutes = [...customModels, ...models];

  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight">Model cho từng chức năng & Ghi chú</h1>
      <p className="text-sm muted mt-1 mb-5">User gửi <b>ảnh</b> → dùng model Vision · gửi <b>video</b> → model Video · chat thường → model mặc định. Bạn có thể thêm <b>Ghi chú</b> cho từng model để hiển thị hướng dẫn cho người dùng.</p>
      {msg && <p className="text-sm mb-4 card px-4 py-2.5" role="status">{msg}</p>}

      <h2 className="font-semibold mb-2.5">1. Định tuyến chức năng</h2>
      <div className="grid sm:grid-cols-2 gap-2.5 mb-8">
        {(Object.keys(FUNCTION_LABELS) as FunctionKey[]).map((fk) => (
          <div key={fk} className="card p-4">
            <p className="text-sm font-medium flex items-center gap-2">{FUNC_ICON[fk]} {FUNCTION_LABELS[fk]}</p>
            <select
              value={routes[fk] ?? ""}
              onChange={(e) => setRoute(fk, e.target.value)}
              className="input w-full mt-2.5 text-sm px-3 py-2.5"
              aria-label={`Model cho ${FUNCTION_LABELS[fk]}`}
            >
              {allForRoutes.map((m) => (
                <option key={m.id} value={m.id}>{m.name} ({m.provider}){m.enabled ? "" : " — tắt"}</option>
              ))}
            </select>
            <RouteHint fk={fk} modelId={routes[fk] ?? ""} models={allForRoutes} />
          </div>
        ))}
      </div>

      <h2 className="font-semibold mb-2.5">2. Danh sách Model & Ghi chú của Admin</h2>
      <p className="text-xs faint mb-2.5">Điền ghi chú vào từng model bên dưới và bấm <b>Lưu ghi chú</b>. Ghi chú này sẽ được hiển thị trực tiếp cho người dùng ở menu chọn model.</p>
      <div className="flex flex-col gap-3">
        {allForRoutes.map((m) => {
          const isSaving = savingNote[m.id];
          const isSaved = savedNote[m.id];

          return (
            <div key={m.id} className={cn("card p-4 flex flex-col gap-3", !m.enabled && "opacity-60")}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold truncate">{m.name}</p>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-400/10 text-amber-400 border border-amber-400/20">
                      {m.provider}
                    </span>
                  </div>
                  <p className="text-xs faint font-mono truncate mt-0.5">
                    {m.id} · {m.contextWindow.toLocaleString()} tok · {m.capabilities.join(", ")}
                  </p>
                </div>
                {m.provider !== "custom" && (
                  <Toggle checked={m.enabled} onChange={(v) => toggle(m, v)} label={`Bật ${m.id}`} />
                )}
              </div>

              {/* Admin Note input */}
              <div className="pt-2.5 border-t border-white/[0.06] flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    placeholder="📝 Nhập ghi chú cho model (vd: Dùng cho code, văn bản dài, tiết kiệm chi phí...)"
                    value={notes[m.id] ?? ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      setNotes((prev) => ({ ...prev, [m.id]: val }));
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        saveNote(m.id, notes[m.id] ?? "");
                      }
                    }}
                    className="w-full bg-[#181716] border border-white/10 rounded-xl px-3 py-2 text-xs text-[#ECEBE4] placeholder:text-[#75736C] outline-none focus:border-[#D97757] transition-colors font-sans"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => saveNote(m.id, notes[m.id] ?? "")}
                  disabled={isSaving}
                  className={cn(
                    "px-3.5 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 shrink-0 select-none",
                    isSaved
                      ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                      : "bg-[#2A2826] hover:bg-[#343230] text-[#ECEBE4] border border-white/10"
                  )}
                >
                  {isSaved ? "Đã lưu ✓" : isSaving ? "Đang lưu..." : "Lưu ghi chú"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-xs faint mt-4">Chỉ model đang bật + provider có key mới hiện cho user. Hiện có {enabledModels.length}/{models.length} model nhà cung cấp đang bật.</p>
    </div>
  );
}

function RouteHint({ fk, modelId, models }: { fk: string; modelId: string; models: AIModel[] }) {
  const m = models.find((x) => x.id === modelId);
  if (!m) return null;
  const need = fk === "vision" ? "vision" : fk === "video" ? "video" : fk === "reasoning" ? "reasoning" : "chat";
  const okCap = m.capabilities.includes(need);
  return (
    <p className={cn("text-[11px] mt-1.5", okCap ? "text-emerald-500" : "text-amber-500")}>
      {okCap ? `✓ Hỗ trợ ${need}` : `⚠️ Model này không ghi nhận hỗ trợ ${need} — vẫn gửi được nhưng chất lượng không đảm bảo`}
      {!m.enabled && " · đang TẮT"}
    </p>
  );
}
