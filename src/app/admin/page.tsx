"use client";
import { useEffect, useState } from "react";
import { Check, PlugZap, Trash2, Plus, Key } from "lucide-react";
import Link from "next/link";
import { Button, Input, Toggle } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

interface Provider {
  provider: string;
  enabled: boolean;
  baseUrl: string | null;
  hasKey: boolean;
  keyHint: string | null;
  keyHints?: string[];
  fromEnv: boolean;
}

const META: Record<string, { name: string; hint: string }> = {
  openai: { name: "OpenAI", hint: "GPT-4o, o4-mini… Base URL mặc định api.openai.com" },
  anthropic: { name: "Anthropic", hint: "Claude Sonnet / Haiku" },
  gemini: { name: "Google Gemini", hint: "Gemini 2.5 — đọc video rất tốt" },
  openrouter: { name: "OpenRouter", hint: "DeepSeek, Qwen… qua 1 key" },
  demo: { name: "Demo nội bộ", hint: "Chế độ dev, luôn bật khi chưa có key thật" },
};

export default function AdminProvidersPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [testing, setTesting] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  async function load() {
    const r = await fetch("/api/admin/providers").then((x) => x.json()).catch(() => null);
    if (r?.providers) setProviders(r.providers);
    else setMsg("Không tải được (cần quyền Admin).");
  }
  useEffect(() => { load(); }, []);

  async function save(
    p: Provider,
    patch: Partial<{
      enabled: boolean;
      baseUrl: string | null;
      apiKey: string;
      addKey: string;
      removeKeyIndex: number;
      clearKey: boolean;
    }>
  ) {
    const r = await fetch("/api/admin/providers", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: p.provider, ...patch }),
    }).then((x) => x.json());
    if (r?.provider) {
      setProviders((s) => s.map((x) => x.provider === p.provider ? r.provider : x));
      setKeys((s) => ({ ...s, [p.provider]: "" }));
      setMsg(`Đã lưu ${META[p.provider]?.name ?? p.provider} ✓`);
      setTimeout(() => setMsg(""), 2500);
    }
  }

  async function test(p: string) {
    setTesting(p); setMsg("");
    const r = await fetch("/api/admin/providers/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider: p }) }).then((x) => x.json());
    setMsg(r.ok ? `✅ ${r.message}` : `❌ ${r.error ?? "Lỗi"}`);
    setTesting(null);
  }

  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight">Đầu nguồn API</h1>
      <p className="text-sm muted mt-1 mb-4">Key được <b>mã hóa AES-256</b> khi lưu, chỉ hiện dạng <code>sk-••••1234</code>. User thường không bao giờ thấy trang này.</p>
      <Link href="/admin/endpoints" className="card p-4 mb-5 flex items-center gap-3 hover:border-[var(--accent)] transition-colors">
        <span className="h-9 w-9 rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center"><PlugZap size={17} /></span>
        <span>
          <span className="block text-sm font-semibold">Endpoints riêng (OpenAI-compatible) →</span>
          <span className="block text-xs muted mt-0.5">Thêm NHIỀU server tự host: Ollama, vLLM, LM Studio… mỗi endpoint nhiều model</span>
        </span>
      </Link>
      {msg && <p className="text-sm mb-4 card px-4 py-2.5" role="status">{msg}</p>}
      <div className="flex flex-col gap-3">
        {providers.map((p) => (
          <div key={p.provider} className="card p-5">
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <p className="font-semibold flex items-center gap-2">
                  {META[p.provider]?.name ?? p.provider}
                  {p.hasKey ? <span className="text-[11px] font-medium text-emerald-500 inline-flex items-center gap-1"><Check size={12} /> đã có key</span>
                    : p.provider !== "demo" && <span className="text-[11px] faint">chưa có key</span>}
                  {p.fromEnv && <span className="text-[11px] faint bordered rounded-full px-2 py-0.5">từ ENV</span>}
                </p>
                <p className="text-xs muted mt-0.5">{META[p.provider]?.hint}</p>
              </div>
              {p.provider !== "demo" && <Toggle checked={p.enabled} onChange={(v) => save(p, { enabled: v })} label={`Bật ${p.provider}`} />}
            </div>
            {p.provider !== "demo" && (
              <div className="grid sm:grid-cols-2 gap-2.5 mt-4">
                <label className="text-xs muted">Base URL
                  <Input
                    className="mt-1 font-mono" defaultValue={p.baseUrl ?? ""} key={p.baseUrl ?? ""}
                    placeholder="https://…" onBlur={(e) => { if (e.target.value !== (p.baseUrl ?? "")) save(p, { baseUrl: e.target.value || null }); }}
                  />
                </label>
                <div className="flex flex-col gap-2 p-3 rounded-xl bg-black/20 border border-white/[0.08]">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-[#ECEBE4] flex items-center gap-1.5">
                      <Key size={13} className="text-[#D97757]" /> Danh sách API Key ({p.keyHints?.length ?? (p.hasKey ? 1 : 0)})
                    </span>
                    {p.hasKey && (
                      <button
                        type="button"
                        onClick={() => save(p, { clearKey: true })}
                        className="text-[11px] text-red-400 hover:underline cursor-pointer flex items-center gap-1"
                      >
                        <Trash2 size={11} /> Xóa tất cả
                      </button>
                    )}
                  </div>

                  {/* Existing Keys Badges with Delete */}
                  {p.keyHints && p.keyHints.length > 0 ? (
                    <div className="flex flex-col gap-1.5 max-h-36 overflow-y-auto pr-1">
                      {p.keyHints.map((hint, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between px-2.5 py-1 rounded-lg bg-white/[0.03] border border-white/[0.06] text-xs font-mono"
                        >
                          <div className="flex items-center gap-2 text-[#ECEBE4]">
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#D97757]/20 text-[#D97757] font-sans font-medium">
                              Key #{idx + 1}
                            </span>
                            <span>{hint}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => save(p, { removeKeyIndex: idx })}
                            title="Xóa key này"
                            className="text-[#75736C] hover:text-red-400 p-1 cursor-pointer transition-colors"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-[#75736C] italic py-1">Chưa có API key nào. Nhập key bên dưới để thêm.</p>
                  )}

                  {/* Add Key Input Row with explicit "+ Thêm key" button */}
                  <div className="flex items-center gap-2 mt-1">
                    <Input
                      type="password"
                      placeholder="Dán API key mới vào đây…"
                      value={keys[p.provider] ?? ""}
                      onChange={(e) => setKeys((s) => ({ ...s, [p.provider]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && keys[p.provider]?.trim()) {
                          e.preventDefault();
                          save(p, { addKey: keys[p.provider] });
                          setKeys((s) => ({ ...s, [p.provider]: "" }));
                        }
                      }}
                      className="text-xs font-mono h-8 flex-1"
                    />
                    <Button
                      disabled={!keys[p.provider]?.trim()}
                      onClick={() => {
                        save(p, { addKey: keys[p.provider] });
                        setKeys((s) => ({ ...s, [p.provider]: "" }));
                      }}
                      className="text-xs h-8 px-3 shrink-0"
                    >
                      <Plus size={13} /> Thêm key
                    </Button>
                  </div>
                  <span className="text-[10px] text-[#75736C]">
                    💡 Khi 1 key bị Rate Limit (429) hoặc hết quota, hệ thống sẽ tự động đổi sang key tiếp theo.
                  </span>
                </div>
              </div>
            )}
            <div className="mt-3">
              <Button variant="outline" disabled={testing === p.provider} onClick={() => test(p.provider)} className={cn("text-xs")}>
                <PlugZap size={13} /> {testing === p.provider ? "Đang kiểm tra…" : "Kiểm tra kết nối"}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
