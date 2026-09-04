"use client";
import { useEffect, useState } from "react";
import { Check, PlugZap, Eye, EyeOff, Trash2 } from "lucide-react";
import Link from "next/link";
import { Button, Input, Toggle } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

interface Provider { provider: string; enabled: boolean; baseUrl: string | null; hasKey: boolean; keyHint: string | null; fromEnv: boolean; }

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
  const [show, setShow] = useState<Record<string, boolean>>({});
  const [testing, setTesting] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  async function load() {
    const r = await fetch("/api/admin/providers").then((x) => x.json()).catch(() => null);
    if (r?.providers) setProviders(r.providers);
    else setMsg("Không tải được (cần quyền Admin).");
  }
  useEffect(() => { load(); }, []);

  async function save(p: Provider, patch: Partial<{ enabled: boolean; baseUrl: string | null; apiKey: string; clearKey: boolean }>) {
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
                <div className="text-xs muted flex flex-col">
                  <div className="flex items-center justify-between">
                    <span>API Key (hỗ trợ nhiều key)</span>
                    {p.keyHint && (
                      <span className="font-mono text-[11px] text-[#D97757] bg-[#D97757]/10 px-1.5 py-0.5 rounded">
                        {p.keyHint}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5 mt-1">
                    <div className="relative w-full">
                      <textarea
                        rows={show[p.provider] ? 3 : 1}
                        placeholder={p.hasKey ? "•••••• (dán 1 hoặc nhiều key mới để thay, mỗi dòng 1 key)" : "Dán API key (mỗi key 1 dòng hoặc cách nhau dấu phẩy)…"}
                        value={keys[p.provider] ?? ""}
                        onChange={(e) => setKeys((s) => ({ ...s, [p.provider]: e.target.value }))}
                        className="w-full rounded-lg border border-white/10 bg-black/20 p-2 text-xs font-mono outline-none focus:border-[#D97757]/50 resize-y"
                        style={!show[p.provider] && (keys[p.provider]?.length ?? 0) > 0 ? { WebkitTextSecurity: "disc" } as React.CSSProperties : undefined}
                      />
                      <button
                        type="button"
                        aria-label="Hiện/ẩn key"
                        className="absolute right-2 top-2 text-[#75736C] hover:text-white cursor-pointer"
                        onClick={() => setShow((s) => ({ ...s, [p.provider]: !s[p.provider] }))}
                      >
                        {show[p.provider] ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-[#75736C]">
                        💡 Tự động đổi key khi bị Rate Limit (429)
                      </span>
                      <div className="flex items-center gap-2">
                        {p.hasKey && (
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 text-xs text-red-400 hover:underline cursor-pointer"
                            onClick={() => save(p, { clearKey: true })}
                          >
                            <Trash2 size={12} /> Xóa key
                          </button>
                        )}
                        <Button
                          variant="outline"
                          disabled={!keys[p.provider]}
                          onClick={() => {
                            save(p, { apiKey: keys[p.provider] });
                            setKeys((s) => ({ ...s, [p.provider]: "" }));
                          }}
                          className="text-xs h-7 px-3"
                        >
                          Lưu key
                        </Button>
                      </div>
                    </div>
                  </div>
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
