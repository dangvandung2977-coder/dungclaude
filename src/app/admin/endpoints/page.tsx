"use client";
import { useEffect, useState } from "react";
import { Plus, PlugZap, Trash2, ClipboardPaste, Eye, Key } from "lucide-react";
import { Button, Input, Toggle, Modal } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

interface CModel {
  id: string; endpointId: string; apiName: string; displayName: string;
  contextWindow: number; capabilities: string[]; inputPricePerM: number;
  outputPricePerM: number; enabled: boolean;
}
interface Endpoint {
  id: string; name: string; baseUrl: string; enabled: boolean;
  hasKey: boolean; keyHint: string | null; keyHints?: string[]; modelCount: number; models: CModel[];
}

const CAPS = [
  { id: "chat", label: "Chat" },
  { id: "vision", label: "Đọc ảnh" },
  { id: "video", label: "Đọc video" },
  { id: "reasoning", label: "Suy luận" },
  { id: "tools", label: "Tools" },
  { id: "no_stream", label: "Non-streaming (Không stream)" },
];

export default function AdminEndpointsPage() {
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [msg, setMsg] = useState("");
  const [showEpModal, setShowEpModal] = useState(false);
  const [editingEp, setEditingEp] = useState<Endpoint | null>(null);
  const [epName, setEpName] = useState("");
  const [epUrl, setEpUrl] = useState("");
  const [epKey, setEpKey] = useState("");
  const [showEpKey, setShowEpKey] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [addingFor, setAddingFor] = useState<string | null>(null);
  const [mApi, setMApi] = useState("");
  const [mName, setMName] = useState("");
  const [mCaps, setMCaps] = useState<string[]>(["chat"]);

  function say(s: string) { setMsg(s); setTimeout(() => setMsg(""), 3500); }

  async function load() {
    const r = await fetch("/api/admin/endpoints").then((x) => x.json()).catch(() => null);
    if (r?.endpoints) setEndpoints(r.endpoints);
  }
  useEffect(() => { load(); }, []);

  async function handleEpPaste() {
    try {
      if (!navigator.clipboard?.readText) throw new Error("Trình duyệt không hỗ trợ");
      const text = await navigator.clipboard.readText();
      if (text && text.trim()) { setEpKey(text.trim()); say("📋 Đã dán key từ clipboard!"); }
      else say("⚠️ Bộ nhớ tạm đang trống.");
    } catch { say("⚠️ Vui lòng click vào ô và nhấn Ctrl + V để dán."); }
  }

  function openCreate() {
    setEditingEp(null); setEpName(""); setEpUrl(""); setEpKey(""); setShowEpKey(false);
    setShowEpModal(true);
  }
  function openEdit(e: Endpoint) {
    setEditingEp(e); setEpName(e.name); setEpUrl(e.baseUrl); setEpKey(""); setShowEpKey(false);
    setShowEpModal(true);
  }

  async function saveEndpoint() {
    if (!epName.trim() || !epUrl.trim()) return say("❌ Thiếu tên hoặc URL");
    const payload: { name: string; baseUrl: string; apiKey?: string } = { name: epName.trim(), baseUrl: epUrl.trim() };
    if (epKey) payload.apiKey = epKey;
    const url = editingEp ? `/api/admin/endpoints/${editingEp.id}` : "/api/admin/endpoints";
    const r = await fetch(url, { method: editingEp ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }).then((x) => x.json());
    if (r?.endpoint || r?.ok) { setShowEpModal(false); load(); say("Đã lưu endpoint ✓"); }
    else say(`❌ ${r?.error ?? "Lỗi"}`);
  }

  async function toggleEp(e: Endpoint, enabled: boolean) {
    await fetch(`/api/admin/endpoints/${e.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled }) });
    load();
  }

  async function deleteEp(e: Endpoint) {
    if (!confirm(`Xóa endpoint "${e.name}" và toàn bộ ${e.modelCount} model?`)) return;
    await fetch(`/api/admin/endpoints/${e.id}`, { method: "DELETE" });
    load(); say("Đã xóa.");
  }

  async function testEndpoint(e: Endpoint) {
    setTesting(e.id);
    const r = await fetch(`/api/admin/endpoints/${e.id}/test`, { method: "POST" }).then((x) => x.json());
    say(r.ok ? `✅ ${r.message}` : `❌ ${r.error ?? "Lỗi"}`);
    setTesting(null);
  }

  async function addModel(endpointId: string) {
    if (!mApi.trim()) return say("❌ Thiếu tên model (api_name).");
    const r = await fetch("/api/admin/endpoint-models", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpointId, apiName: mApi.trim(), displayName: mName.trim() || undefined, capabilities: mCaps }),
    }).then((x) => x.json());
    if (r?.model) { setAddingFor(null); setMApi(""); setMName(""); setMCaps(["chat"]); load(); say("Đã thêm model ✓"); }
    else say(`❌ ${r?.error ?? "Lỗi"}`);
  }

  async function toggleModel(m: CModel, enabled: boolean) {
    await fetch("/api/admin/endpoint-models", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: m.id, enabled }) });
    load();
  }

  async function deleteModel(m: CModel) {
    if (!confirm(`Xóa model "${m.displayName}"?`)) return;
    await fetch(`/api/admin/endpoint-models?id=${encodeURIComponent(m.id)}`, { method: "DELETE" });
    load();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Endpoints riêng</h1>
          <p className="text-xs muted mt-0.5">Thêm các server OpenAI-compatible (Ollama, vLLM, LM Studio…).</p>
        </div>
        <Button onClick={openCreate} className="text-xs"><Plus size={14} /> Thêm endpoint</Button>
      </div>

      {msg && <p className="text-xs mb-4 card px-4 py-2.5 bg-[#D97757]/10 border border-[#D97757]/30 text-[#ECEBE4]">{msg}</p>}

      <div className="flex flex-col gap-4">
        {endpoints.map((e) => (
          <div key={e.id} className={cn("card p-5", !e.enabled && "opacity-70")}>
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-semibold">{e.name} <span className="text-[11px] faint font-mono">{e.baseUrl}</span></p>
                <p className="text-xs faint">{e.modelCount} models {e.hasKey ? "· Có key" : "· Không key"}</p>
              </div>
              <Toggle checked={e.enabled} onChange={(v) => toggleEp(e, v)} label="Bật" />
              <Button variant="outline" size="sm" onClick={() => testEndpoint(e)} disabled={testing === e.id} className="text-xs">
                <PlugZap size={13} /> {testing === e.id ? "…" : "Test"}
              </Button>
              <Button variant="outline" size="sm" onClick={() => openEdit(e)} className="text-xs">Sửa</Button>
              <button className="p-2 text-red-500 hover:bg-red-500/10 rounded" onClick={() => deleteEp(e)}><Trash2 size={14} /></button>
            </div>

            <div className="mt-4 pt-3 border-t">
              <p className="text-[11px] font-bold muted mb-2 uppercase tracking-wider">Models ({e.models.length})</p>
              <div className="flex flex-wrap gap-2">
                {e.models.map((m) => (
                  <div key={m.id} className={cn("flex items-center gap-2 px-3 py-1.5 rounded-full surface-2 text-xs", !m.enabled && "opacity-50")}>
                    <span>{m.displayName}</span>
                    <Toggle checked={m.enabled} onChange={(v) => toggleModel(m, v)} label="" />
                    <button type="button" onClick={() => deleteModel(m)} className="text-red-400/70 hover:text-red-400 cursor-pointer p-0.5" title="Xóa model">
                      <Trash2 size={11} />
                    </button>
                  </div>
                ))}
                <Button variant="ghost" size="sm" onClick={() => setAddingFor(e.id)} className="text-[10px]">+ Thêm model</Button>
              </div>
              {addingFor === e.id && (
                <div className="mt-3 p-3 surface-2 rounded-lg grid gap-2.5">
                  <div className="grid sm:grid-cols-2 gap-2">
                    <Input placeholder="API Name (VD: llama-3.1-8b)" value={mApi} onChange={(e) => setMApi(e.target.value)} />
                    <Input placeholder="Display Name (VD: Llama 3.1 8B)" value={mName} onChange={(e) => setMName(e.target.value)} />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {CAPS.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setMCaps((s) => s.includes(c.id) ? s.filter((x) => x !== c.id) : [...s, c.id])}
                        className={cn("px-2.5 py-1 rounded-md text-[11px] border cursor-pointer transition-colors", mCaps.includes(c.id) ? "bg-[#D97757]/20 border-[#D97757] text-[#D97757]" : "border-white/10 text-[#75736C]")}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={() => addModel(e.id)} className="text-xs">Lưu model</Button>
                    <Button variant="ghost" onClick={() => setAddingFor(null)} className="text-xs">Hủy</Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <Modal open={showEpModal} onClose={() => setShowEpModal(false)} title={editingEp ? "Sửa endpoint" : "Thêm endpoint"}>
        <div className="flex flex-col gap-3">
          <label className="text-xs muted">Tên gợi nhớ *
            <Input className="mt-1" placeholder="Ollama local…" value={epName} onChange={(e) => setEpName(e.target.value)} />
          </label>
          <label className="text-xs muted">Base URL *
            <Input className="mt-1 font-mono" placeholder="http://localhost:11434/v1" value={epUrl} onChange={(e) => setEpUrl(e.target.value)} />
          </label>

          <div className="flex flex-col gap-2 p-3.5 rounded-xl bg-black/25 border border-white/[0.08]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[#ECEBE4] flex items-center gap-1.5">
                <Key size={13} className="text-[#D97757]" /> Danh sách API Key ({editingEp?.keyHints?.length ?? (editingEp?.hasKey ? 1 : 0)})
              </span>
              {editingEp?.hasKey && (
                <button type="button" onClick={async () => {
                  if (confirm("Xóa tất cả key?")) {
                    await fetch(`/api/admin/endpoints/${editingEp.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clearKey: true }) });
                    load(); setEditingEp((p) => p ? { ...p, hasKey: false, keyHints: [] } : null);
                  }
                }} className="text-[11px] text-red-400 hover:underline flex items-center gap-1"><Trash2 size={11} /> Xóa tất cả</button>
              )}
            </div>

            {editingEp?.keyHints && editingEp.keyHints.length > 0 && (
              <div className="flex flex-col gap-1 max-h-36 overflow-y-auto">
                {editingEp.keyHints.map((hint, idx) => (
                  <div key={idx} className="flex items-center justify-between px-2.5 py-1 rounded-lg bg-white/[0.03] border border-white/[0.06] text-xs font-mono">
                    <span className="truncate">{hint}</span>
                    <button type="button" onClick={async () => {
                      await fetch(`/api/admin/endpoints/${editingEp.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ removeKeyIndex: idx }) });
                      load();
                      const next = [...(editingEp.keyHints ?? [])]; next.splice(idx, 1);
                      setEditingEp((p) => p ? { ...p, keyHints: next } : null);
                    }} className="text-[#75736C] hover:text-red-400"><Trash2 size={12} /></button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center gap-1.5 mt-1">
              <div className="relative flex-1">
                <Input type={showEpKey ? "text" : "password"} placeholder="Dán API key…" value={epKey} onChange={(e) => setEpKey(e.target.value)} className="text-xs font-mono h-8.5 pr-8" />
                <button type="button" onClick={() => setShowEpKey(!showEpKey)} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#75736C] hover:text-[#ECEBE4]"><Eye size={13} /></button>
              </div>
              <button type="button" onClick={handleEpPaste} className="h-8.5 px-2.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-xs font-medium inline-flex items-center gap-1"><ClipboardPaste size={13} className="text-[#D97757]" /> Dán</button>
              {editingEp && (
                <Button disabled={!epKey.trim()} onClick={async () => {
                  await fetch(`/api/admin/endpoints/${editingEp.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ addKey: epKey.trim() }) });
                  setEpKey(""); load(); say("Đã thêm key ✓");
                }} className="text-xs h-8.5 px-3">Thêm</Button>
              )}
            </div>
          </div>

          <Button onClick={saveEndpoint}>{editingEp ? "Lưu thông tin" : "Thêm endpoint"}</Button>
        </div>
      </Modal>
    </div>
  );
}
