"use client";
import { useEffect, useState } from "react";
import { Check, PlugZap, Trash2, Plus, Key, ClipboardPaste, Eye, EyeOff, ListPlus } from "lucide-react";
import Link from "next/link";
import { Button, Input, Toggle, Modal, Textarea } from "@/components/ui/primitives";
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
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});
  const [bulkProvider, setBulkProvider] = useState<Provider | null>(null);
  const [bulkText, setBulkText] = useState("");
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
      setTimeout(() => setMsg(""), 3000);
    }
  }

  async function handlePaste(provider: string) {
    try {
      if (!navigator.clipboard?.readText) {
        throw new Error("Trình duyệt không hỗ trợ");
      }
      const text = await navigator.clipboard.readText();
      if (text && text.trim()) {
        setKeys((s) => ({ ...s, [provider]: text.trim() }));
        setMsg("📋 Đã dán từ clipboard! Bạn bấm nút '+ Thêm key' để lưu.");
      } else {
        setMsg("⚠️ Bộ nhớ tạm (clipboard) đang trống.");
      }
    } catch {
      setMsg("⚠️ Trình duyệt chặn đọc clipboard. Vui lòng click vào ô và nhấn phím Ctrl + V để dán.");
    }
  }

  async function handleBulkPaste() {
    try {
      if (!navigator.clipboard?.readText) {
        throw new Error("Trình duyệt không hỗ trợ");
      }
      const text = await navigator.clipboard.readText();
      if (text && text.trim()) {
        setBulkText(text.trim());
      }
    } catch {
      setMsg("⚠️ Vui lòng nhấn Ctrl + V vào ô văn bản để dán danh sách key.");
    }
  }

  async function test(p: string) {
    setTesting(p); setMsg("");
    const r = await fetch("/api/admin/providers/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider: p }) }).then((x) => x.json());
    setMsg(r.ok ? `✅ ${r.message}` : `❌ ${r.error ?? "Lỗi"}`);
    setTesting(null);
  }

  const detectedBulkCount = bulkText
    .split(/[\n,;]+/)
    .map((k) => k.trim())
    .filter((k) => k.length > 5).length;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Đầu nguồn & API Key</h1>
          <p className="text-xs muted mt-0.5">
            Key được <b>mã hóa AES-256</b> khi lưu trữ. Hệ thống tự động đảo key khi gặp Rate Limit (429).
          </p>
        </div>
      </div>

      {/* Quick guide box */}
      <div className="card p-3.5 mb-4 bg-gradient-to-r from-[#D97757]/10 via-transparent to-transparent border-[#D97757]/20 flex items-start gap-3">
        <div className="h-8 w-8 rounded-lg bg-[#D97757]/15 text-[#D97757] flex items-center justify-center shrink-0 mt-0.5">
          <Key size={16} />
        </div>
        <div className="text-xs leading-relaxed text-[#ECEBE4]">
          <span className="font-semibold text-[#D97757]">Hướng dẫn dán & thêm key:</span> Bạn có thể copy key rồi bấm nút{" "}
          <span className="font-semibold text-[#D97757]">📋 Dán</span> (hoặc nhấn <kbd className="px-1 py-0.5 rounded bg-white/10 font-mono text-[10px]">Ctrl + V</kbd>), sau đó bấm nút{" "}
          <span className="font-semibold text-[#D97757]">+ Thêm key</span>. Có thể thêm <b>nhiều key</b> cho 1 provider để xoay vòng tự động!
        </div>
      </div>

      <Link href="/admin/endpoints" className="card p-4 mb-5 flex items-center gap-3 hover:border-[var(--accent)] transition-colors">
        <span className="h-9 w-9 rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center"><PlugZap size={17} /></span>
        <span>
          <span className="block text-sm font-semibold">Endpoints riêng (OpenAI-compatible) →</span>
          <span className="block text-xs muted mt-0.5">Thêm server tự host: Ollama, vLLM, LM Studio… mỗi endpoint nhiều model</span>
        </span>
      </Link>

      {msg && (
        <div className="text-xs mb-4 card px-4 py-2.5 bg-[#D97757]/10 border-[#D97757]/30 text-[#ECEBE4] animate-in fade-in" role="status">
          {msg}
        </div>
      )}

      <div className="flex flex-col gap-4">
        {providers.map((p) => (
          <div key={p.provider} className="card p-5">
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <p className="font-semibold flex items-center gap-2">
                  {META[p.provider]?.name ?? p.provider}
                  {p.hasKey ? (
                    <span className="text-[11px] font-medium text-emerald-500 inline-flex items-center gap-1">
                      <Check size={12} /> {p.keyHints?.length ?? 1} key đang chạy
                    </span>
                  ) : p.provider !== "demo" && (
                    <span className="text-[11px] text-amber-500/80 font-medium">chưa có key</span>
                  )}
                  {p.fromEnv && <span className="text-[11px] faint bordered rounded-full px-2 py-0.5">từ ENV</span>}
                </p>
                <p className="text-xs muted mt-0.5">{META[p.provider]?.hint}</p>
              </div>
              {p.provider !== "demo" && (
                <Toggle checked={p.enabled} onChange={(v) => save(p, { enabled: v })} label={`Bật ${p.provider}`} />
              )}
            </div>

            {p.provider !== "demo" && (
              <div className="grid sm:grid-cols-2 gap-3 mt-4">
                <label className="text-xs muted flex flex-col justify-between">
                  <span>Base URL</span>
                  <Input
                    className="mt-1 font-mono" defaultValue={p.baseUrl ?? ""} key={p.baseUrl ?? ""}
                    placeholder="https://…" onBlur={(e) => { if (e.target.value !== (p.baseUrl ?? "")) save(p, { baseUrl: e.target.value || null }); }}
                  />
                  <span className="text-[10px] text-[#75736C] mt-1">Để trống nếu dùng URL mặc định của hãng.</span>
                </label>

                {/* Key Pool Box */}
                <div className="flex flex-col gap-2 p-3.5 rounded-xl bg-black/25 border border-white/[0.08]">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-[#ECEBE4] flex items-center gap-1.5">
                      <Key size={13} className="text-[#D97757]" /> Danh sách API Key ({p.keyHints?.length ?? (p.hasKey ? 1 : 0)})
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => { setBulkProvider(p); setBulkText(""); }}
                        className="text-[11px] text-[#D97757] hover:underline cursor-pointer flex items-center gap-1"
                        title="Dán nhiều key cùng lúc"
                      >
                        <ListPlus size={12} /> Thêm nhiều key
                      </button>
                      {p.hasKey && (
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm(`Bạn có chắc muốn xóa tất cả key của ${META[p.provider]?.name ?? p.provider}?`)) {
                              save(p, { clearKey: true });
                            }
                          }}
                          className="text-[11px] text-red-400 hover:underline cursor-pointer flex items-center gap-1"
                        >
                          <Trash2 size={11} /> Xóa hết
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Existing Keys Badges */}
                  {p.keyHints && p.keyHints.length > 0 ? (
                    <div className="flex flex-col gap-1.5 max-h-36 overflow-y-auto pr-1">
                      {p.keyHints.map((hint, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between px-2.5 py-1 rounded-lg bg-white/[0.03] border border-white/[0.06] text-xs font-mono"
                        >
                          <div className="flex items-center gap-2 text-[#ECEBE4] min-w-0">
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#D97757]/20 text-[#D97757] font-sans font-medium shrink-0">
                              Key #{idx + 1}
                            </span>
                            <span className="truncate">{hint}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => save(p, { removeKeyIndex: idx })}
                            title="Xóa key này"
                            className="text-[#75736C] hover:text-red-400 p-1 cursor-pointer transition-colors shrink-0"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-[#75736C] italic py-1">Chưa có API key nào. Nhập hoặc dán key bên dưới để thêm.</p>
                  )}

                  {/* Add / Paste Key Row */}
                  <div className="flex items-center gap-1.5 mt-1">
                    <div className="relative flex-1">
                      <Input
                        type={showKey[p.provider] ? "text" : "password"}
                        placeholder="Dán API key vào đây…"
                        value={keys[p.provider] ?? ""}
                        onChange={(e) => setKeys((s) => ({ ...s, [p.provider]: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && keys[p.provider]?.trim()) {
                            e.preventDefault();
                            save(p, { addKey: keys[p.provider] });
                            setKeys((s) => ({ ...s, [p.provider]: "" }));
                          }
                        }}
                        className="text-xs font-mono h-8.5 pr-8 w-full"
                      />
                      <button
                        type="button"
                        onClick={() => setShowKey((s) => ({ ...s, [p.provider]: !s[p.provider] }))}
                        title={showKey[p.provider] ? "Ẩn key" : "Hiện key"}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-[#75736C] hover:text-[#ECEBE4] transition-colors p-1"
                      >
                        {showKey[p.provider] ? <EyeOff size={13} /> : <Eye size={13} />}
                      </button>
                    </div>

                    {/* Quick Paste Button */}
                    <button
                      type="button"
                      onClick={() => handlePaste(p.provider)}
                      title="Dán từ Clipboard (bộ nhớ tạm)"
                      className="h-8.5 px-2.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-[#ECEBE4] text-xs font-medium inline-flex items-center gap-1 transition-colors cursor-pointer shrink-0"
                    >
                      <ClipboardPaste size={13} className="text-[#D97757]" /> Dán
                    </button>

                    {/* Submit Add Key Button */}
                    <Button
                      disabled={!keys[p.provider]?.trim()}
                      onClick={() => {
                        save(p, { addKey: keys[p.provider] });
                        setKeys((s) => ({ ...s, [p.provider]: "" }));
                      }}
                      className="text-xs h-8.5 px-3 shrink-0 bg-[#D97757] hover:bg-[#c46849] text-white font-medium"
                    >
                      <Plus size={13} /> Thêm key
                    </Button>
                  </div>

                  <span className="text-[10px] text-[#75736C] leading-tight">
                    💡 Hệ thống tự động đảo sang key khác khi key hiện tại bị Rate Limit (429).
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

      {/* Bulk Add Keys Modal */}
      {bulkProvider && (
        <Modal
          open={Boolean(bulkProvider)}
          onClose={() => setBulkProvider(null)}
          title={`Thêm nhiều API Key cho ${META[bulkProvider.provider]?.name ?? bulkProvider.provider}`}
          description="Dán danh sách nhiều key cùng lúc (mỗi dòng một key hoặc cách nhau bởi dấu phẩy). Hệ thống sẽ tự động lọc các key hợp lệ và lưu."
        >
          <div className="flex flex-col gap-3 mt-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[#ECEBE4]">
                Nội dung danh sách key {detectedBulkCount > 0 && <span className="text-[#D97757]">({detectedBulkCount} key hợp lệ)</span>}
              </span>
              <button
                type="button"
                onClick={handleBulkPaste}
                className="text-xs text-[#D97757] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <ClipboardPaste size={12} /> Dán toàn bộ từ clipboard
              </button>
            </div>

            <Textarea
              rows={6}
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              placeholder={`Dán danh sách key vào đây...\nVí dụ:\nsk-ant-api03-xxxx1\nsk-ant-api03-xxxx2\nsk-ant-api03-xxxx3`}
              className="font-mono text-xs"
            />

            <div className="flex items-center justify-end gap-2 mt-2">
              <Button variant="ghost" onClick={() => setBulkProvider(null)}>
                Hủy
              </Button>
              <Button
                disabled={detectedBulkCount === 0}
                onClick={async () => {
                  if (bulkProvider && detectedBulkCount > 0) {
                    await save(bulkProvider, { addKey: bulkText });
                    setBulkProvider(null);
                    setBulkText("");
                  }
                }}
                className="bg-[#D97757] hover:bg-[#c46849] text-white"
              >
                <Plus size={14} /> Thêm {detectedBulkCount > 0 ? `${detectedBulkCount} key` : "key"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

