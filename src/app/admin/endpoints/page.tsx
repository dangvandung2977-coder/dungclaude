"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, PlugZap, Trash2, Eye, EyeOff, Cpu } from "lucide-react";
import { Button, Input, Toggle, Modal } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

interface CModel {
  id: string; endpointId: string; apiName: string; displayName: string;
  contextWindow: number; capabilities: string[]; inputPricePerM: number;
  outputPricePerM: number; enabled: boolean;
}
interface Endpoint {
  id: string; name: string; baseUrl: string; enabled: boolean;
  hasKey: boolean; keyHint: string | null; modelCount: number; models: CModel[];
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
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  // add model form per endpoint
  const [addingFor, setAddingFor] = useState<string | null>(null);
  const [mApi, setMApi] = useState("");
  const [mName, setMName] = useState("");
  const [mCaps, setMCaps] = useState<string[]>(["chat"]);

  async function load() {
    const r = await fetch("/api/admin/endpoints").then((x) => x.json()).catch(() => null);
    if (r?.endpoints) setEndpoints(r.endpoints);
  }
  useEffect(() => { load(); }, []);

  function say(t: string) { setMsg(t); setTimeout(() => setMsg(""), 3000); }

  function openNew() {
    setEditingEp(null); setEpName(""); setEpUrl(""); setEpKey(""); setShowEpModal(true);
  }
  function openEdit(e: Endpoint) {
    setEditingEp(e); setEpName(e.name); setEpUrl(e.baseUrl); setEpKey(""); setShowEpModal(true);
  }

  async function saveEndpoint() {
    if (!epName.trim() || !epUrl.trim()) { say("❌ Thiếu tên hoặc base URL."); return; }
    const payload: Record<string, unknown> = { name: epName.trim(), baseUrl: epUrl.trim() };
    if (epKey) payload.apiKey = epKey;
    let r;
    if (editingEp) {
      r = await fetch(`/api/admin/endpoints/${editingEp.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }).then((x) => x.json());
    } else {
      r = await fetch("/api/admin/endpoints", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, enabled: true }) }).then((x) => x.json());
    }
    if (r?.endpoint || r?.ok) { setShowEpModal(false); say("Đã lưu endpoint ✓"); load(); }
    else say(`❌ ${r?.error ?? "Lỗi"}`);
  }

  async function toggleEndpoint(e: Endpoint, v: boolean) {
    await fetch(`/api/admin/endpoints/${e.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: v }) });
    load();
  }

  async function deleteEndpoint(e: Endpoint) {
    if (!confirm(`Xóa endpoint "${e.name}" và toàn bộ ${e.modelCount} model của nó?`)) return;
    await fetch(`/api/admin/endpoints/${e.id}`, { method: "DELETE" });
    say("Đã xóa endpoint."); load();
  }

  async function testEndpoint(e: Endpoint) {
    setTesting(e.id);
    const r = await fetch(`/api/admin/endpoints/${e.id}/test`, { method: "POST" }).then((x) => x.json());
    say(r.ok ? `✅ ${r.message}` : `❌ ${r.error ?? "Lỗi"}`);
    setTesting(null);
  }

  async function addModel(endpointId: string) {
    if (!mApi.trim()) { say("❌ Thiếu tên model phía server (api_name)."); return; }
    const r = await fetch("/api/admin/endpoint-models", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpointId, apiName: mApi.trim(), displayName: mName.trim() || undefined, capabilities: mCaps }),
    }).then((x) => x.json());
    if (r?.model) { setAddingFor(null); setMApi(""); setMName(""); setMCaps(["chat"]); say("Đã thêm model ✓"); load(); }
    else say(`❌ ${r?.error ?? "Lỗi"}`);
  }

  async function toggleModel(m: CModel, v: boolean) {
    await fetch("/api/admin/endpoint-models", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: m.id, enabled: v }) });
    load();
  }

  async function deleteModel(m: CModel) {
    if (!confirm(`Xóa model "${m.displayName}"?`)) return;
    await fetch(`/api/admin/endpoint-models?id=${encodeURIComponent(m.id)}`, { method: "DELETE" });
    load();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-semibold tracking-tight">Endpoints riêng</h1>
        <Button onClick={openNew}><Plus size={15} /> Thêm endpoint</Button>
      </div>
      <p className="text-sm muted mb-5">Thêm <b>nhiều</b> server OpenAI-compatible (Ollama <code>http://localhost:11434/v1</code>, vLLM, LM Studio…). Mỗi endpoint thêm nhiều model; user chỉ thấy model khi endpoint <b>bật + có key</b>.</p>
      {msg && <p className="text-sm mb-4 card px-4 py-2.5" role="status">{msg}</p>}

      {endpoints.length === 0 && (
        <div className="card p-8 text-center text-sm muted">
          Chưa có endpoint nào. Bấm <b>Thêm endpoint</b> — VD: Ollama local, vLLM trên VPS…
        </div>
      )}

      <div className="flex flex-col gap-3">
        {endpoints.map((e) => (
          <div key={e.id} className={cn("card p-5", !e.enabled && "opacity-70")}>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex-1 min-w-[200px]">
                <p className="font-semibold flex items-center gap-2 flex-wrap">
                  {e.name}
                  {e.hasKey
                    ? <span className="text-[11px] font-medium text-emerald-500 font-mono">({e.keyHint})</span>
                    : <span className="text-[11px] faint">chưa có key</span>}
                  <span className="text-[11px] faint">{e.modelCount} model</span>
                </p>
                <p className="text-xs faint font-mono mt-0.5 truncate">{e.baseUrl}</p>
              </div>
              <Toggle checked={e.enabled} onChange={(v) => toggleEndpoint(e, v)} label={`Bật ${e.name}`} />
              <Button variant="outline" className="!text-xs" onClick={() => testEndpoint(e)} disabled={testing === e.id}>
                <PlugZap size={13} /> {testing === e.id ? "Đang test…" : "Test"}
              </Button>
              <Button variant="outline" className="!text-xs" onClick={() => openEdit(e)}>Sửa</Button>
              <Button variant="danger" className="!text-xs" onClick={() => deleteEndpoint(e)}><Trash2 size={13} /></Button>
            </div>

            <div className="mt-4 border-t bordered pt-3">
              <p className="text-xs font-semibold muted mb-2 flex items-center gap-1.5"><Cpu size={13} /> MODELS ({e.models.length})</p>
              <div className="flex flex-col gap-1.5">
                {e.models.map((m) => (
                  <div key={m.id} className={cn("flex items-center gap-2 text-sm px-3 py-2 rounded-lg surface-2", !m.enabled && "opacity-60")}>
                    <div className="flex-1 min-w-0">
                      <span className="font-medium">{m.displayName}</span>{" "}
                      <span className="text-xs faint font-mono">{m.apiName}</span>
                      <span className="block text-[11px] faint">{m.capabilities.join(" · ")}</span>
                    </div>
                    <Toggle checked={m.enabled} onChange={(v) => toggleModel(m, v)} label={`Bật ${m.id}`} />
                    <button aria-label={`Xóa ${m.displayName}`} className="p-1.5 rounded-md text-red-500 hover:bg-red-500/10 cursor-pointer" onClick={() => deleteModel(m)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
              {addingFor === e.id ? (
                <div className="card p-3.5 mt-2.5 flex flex-col gap-2.5">
                  <div className="grid sm:grid-cols-2 gap-2.5">
                    <label className="text-xs muted">Tên model phía server (api_name) *
                      <Input className="mt-1 font-mono" placeholder="llama-3.1-8b" value={mApi} onChange={(ev) => setMApi(ev.target.value)} />
                    </label>
                    <label className="text-xs muted">Tên hiển thị
                      <Input className="mt-1" placeholder="Llama 3.1 8B (local)" value={mName} onChange={(ev) => setMName(ev.target.value)} />
                    </label>
                  </div>
                  <div className="text-xs muted">Khả năng
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {CAPS.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => setMCaps((s) => s.includes(c.id) ? s.filter((x) => x !== c.id) : [...s, c.id])}
                          className={cn("px-3 py-1.5 rounded-full text-xs bordered cursor-pointer", mCaps.includes(c.id) ? "bg-[var(--accent-soft)] border-[var(--accent)]" : "hover:bg-[var(--surface-2)]")}
                          aria-pressed={mCaps.includes(c.id)}
                        >
                          {c.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={() => addModel(e.id)}>Thêm model</Button>
                    <Button variant="ghost" onClick={() => setAddingFor(null)}>Hủy</Button>
                  </div>
                </div>
              ) : (
                <button onClick={() => { setAddingFor(e.id); setMApi(""); setMName(""); setMCaps(["chat"]); }} className="mt-2.5 text-xs font-medium text-[var(--accent)] hover:underline cursor-pointer">
                  + Thêm model vào endpoint này
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <Modal open={showEpModal} onClose={() => setShowEpModal(false)} title={editingEp ? "Sửa endpoint" : "Thêm endpoint mới"}>
        <div className="flex flex-col gap-3">
          <label className="text-xs muted">Tên gợi nhớ *
            <Input className="mt-1" placeholder="Ollama local / vLLM VPS…" value={epName} onChange={(e) => setEpName(e.target.value)} />
          </label>
          <label className="text-xs muted">Base URL (chuẩn OpenAI) *
            <Input className="mt-1 font-mono" placeholder="http://localhost:11434/v1" value={epUrl} onChange={(e) => setEpUrl(e.target.value)} />
          </label>
          <label className="text-xs muted">API key {editingEp?.hasKey && <span className="font-mono text-[#D97757]">({editingEp.keyHint} — để trống để giữ)</span>}
            <div className="relative mt-1">
              <textarea
                rows={showKey ? 3 : 2}
                className="w-full rounded-lg border border-white/10 bg-black/20 p-2 text-xs font-mono outline-none focus:border-[#D97757]/50 resize-y"
                placeholder={editingEp?.hasKey ? "•••••• (dán 1 hoặc nhiều key mới để thay, mỗi dòng 1 key)" : "Dán API key (mỗi dòng 1 key hoặc cách nhau dấu phẩy)…"}
                value={epKey}
                onChange={(e) => setEpKey(e.target.value)}
                style={!showKey && epKey.length > 0 ? { WebkitTextSecurity: "disc" } as React.CSSProperties : undefined}
              />
              <button
                type="button"
                aria-label="Hiện/ẩn key"
                className="absolute right-2 top-2 text-[#75736C] hover:text-white cursor-pointer"
                onClick={() => setShowKey((s) => !s)}
              >
                {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <span className="text-[10px] text-[#75736C] mt-1 block">
              💡 Hỗ trợ nhiều key: tự động đổi sang key tiếp theo khi gặp lỗi Rate Limit (429) hoặc 403.
            </span>
          </label>
          <Button onClick={saveEndpoint}>{editingEp ? "Lưu" : "Thêm endpoint"}</Button>
          <p className="text-[11px] faint">Xong bước này → thêm model (api_name đúng tên phía server) → <Link href="/admin/models" className="underline">gán vào chức năng</Link>.</p>
        </div>
      </Modal>
    </div>
  );
}
