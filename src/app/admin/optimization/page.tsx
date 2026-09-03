"use client";
import React, { useEffect, useState } from "react";
import { Gauge, Save, RotateCcw, TrendingDown, Zap, DollarSign, Timer, Database, AlertTriangle } from "lucide-react";
import { Button, Input, Toggle } from "@/components/ui/primitives";
import type { OptimizationSettings } from "@/types/optimization";

interface Analytics {
  today: { requests: number; inputTokens: number; outputTokens: number; cachedTokens: number; costUsd: number; avgLatencyMs: number; tokensSaved: number };
  byModel: Array<{ model: string; provider: string; requests: number; inputTokens: number; outputTokens: number; cachedTokens: number; costUsd: number }>;
  byUser: Array<{ userId: string; requests: number; tokens: number; costUsd: number }>;
  byDay: Array<{ day: string; requests: number; costUsd: number; tokens: number }>;
  totals: { requests: number; tokens: number; costUsd: number; tokensSaved: number; cacheHitRate: number; avgContextTokens: number; avgOutputTokens: number };
}

interface Budget { level: "ok" | "warning" | "critical" | "limit"; spentTodayUsd: number; budgetUsd: number; message?: string }

type Data = { settings: OptimizationSettings; analytics: Analytics | null; budget: Budget | null };

export default function AdminOptimizationPage() {
  const [data, setData] = useState<Data | null>(null);
  const [draft, setDraft] = useState<OptimizationSettings | null>(null);
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    const r = await fetch("/api/admin/optimization").then((x) => x.json()).catch(() => null);
    if (r?.settings) {
      setData(r);
      setDraft(r.settings);
    } else setMsg(r?.error ?? "Không tải được (cần quyền Admin + chạy supabase/migration-optimization.sql).");
  }
  useEffect(() => { load(); }, []);

  async function save() {
    if (!draft) return;
    setSaving(true);
    const r = await fetch("/api/admin/optimization", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft),
    }).then((x) => x.json()).catch(() => null);
    setSaving(false);
    if (r?.settings) { setDraft(r.settings); setMsg("Đã lưu ✓"); }
    else setMsg(r?.error ?? "Lưu thất bại");
    setTimeout(() => setMsg(""), 3000);
  }

  if (!data || !draft) {
    return <div className="text-sm muted">{msg || "Đang tải…"}</div>;
  }

  const a = data.analytics;
  const b = data.budget;
  const reduction = a && a.totals.tokens + a.totals.tokensSaved > 0
    ? Math.round(a.totals.tokensSaved / (a.totals.tokens + a.totals.tokensSaved) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <Gauge size={20} className="text-[var(--accent)]" /> Tối ưu Token & Chi phí
          </h1>
          <p className="text-xs muted mt-1">Context budgeting · Model routing · Summarization · RAG · Prompt caching · Quota & Budget</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setDraft(data.settings)}><RotateCcw size={13} /> Reset</Button>
          <Button disabled={saving} onClick={save}><Save size={13} /> {saving ? "Đang lưu…" : "Lưu cấu hình"}</Button>
        </div>
      </div>
      {msg && <p className="text-sm card px-4 py-2.5" role="status">{msg}</p>}

      {/* Budget alert */}
      {b && b.level !== "ok" && (
        <div className="card px-4 py-3 flex items-center gap-2 text-sm border-amber-500/30 bg-amber-500/5">
          <AlertTriangle size={15} className="text-amber-500 shrink-0" />
          <span>{b.message} — đã chi <b>${b.spentTodayUsd.toFixed(2)}</b>/${b.budgetUsd} hôm nay.</span>
        </div>
      )}

      {/* Today's stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Stat icon={<Activity />} label="Requests hôm nay" value={(a?.today.requests ?? 0).toLocaleString()} />
        <Stat icon={<Zap />} label="Input tokens" value={(a?.today.inputTokens ?? 0).toLocaleString()} />
        <Stat icon={<Database />} label="Output tokens" value={(a?.today.outputTokens ?? 0).toLocaleString()} />
        <Stat icon={<TrendingDown />} label="Tokens tiết kiệm" value={`${(a?.today.tokensSaved ?? 0).toLocaleString()} (-${reduction}%)`} accent="text-emerald-500" />
        <Stat icon={<DollarSign />} label="Chi phí hôm nay" value={`$${(a?.today.costUsd ?? 0).toFixed(4)}`} />
        <Stat icon={<Timer />} label="Latency TB" value={`${a?.today.avgLatencyMs ?? 0}ms`} />
      </div>

      {/* Cost by model */}
      {a && a.byModel.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold mb-2">Chi phí theo model (30 ngày)</h2>
          <div className="card divide-y divide-[var(--border-subtle)] overflow-hidden">
            <TableHead cols={["Model", "Requests", "Input", "Cached", "Output", "Cache hit", "Chi phí"]} />
            {a.byModel.map((m) => (
              <div key={m.model} className="p-3 text-xs grid grid-cols-7 gap-2 items-center">
                <Cell><b className="truncate block">{m.model}</b><span className="text-[10px] muted">{m.provider}</span></Cell>
                <Cell>{m.requests.toLocaleString()}</Cell>
                <Cell>{m.inputTokens.toLocaleString()}</Cell>
                <Cell>{m.cachedTokens.toLocaleString()}</Cell>
                <Cell>{m.outputTokens.toLocaleString()}</Cell>
                <Cell>{m.inputTokens > 0 ? `${Math.round(m.cachedTokens / m.inputTokens * 100)}%` : "—"}</Cell>
                <Cell><span className="font-mono">${m.costUsd.toFixed(4)}</span></Cell>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Settings ── */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold">Cấu hình tối ưu</h2>

        <Row label="Chế độ mặc định" hint="cost_efficient: nén mạnh, model rẻ · balanced: cân bằng · max_quality: giữ nhiều context">
          <div className="flex gap-1">
            {(["cost_efficient", "balanced", "max_quality"] as const).map((m) => (
              <button key={m} type="button" onClick={() => setDraft({ ...draft, mode: m })}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer border ${draft.mode === m ? "bg-[var(--accent-soft)] border-[var(--accent)] text-[var(--accent)]" : "border-[var(--border-subtle)] hover:bg-[var(--surface-2)]"}`}>
                {m}
              </button>
            ))}
          </div>
        </Row>

        <h3 className="text-xs font-semibold muted pt-2">Context & Summarization</h3>
        <Grid>
          <Num label="Ngưỡng selection (tokens)" value={draft.contextThresholds.selectTokens} onChange={(v) => setDraft({ ...draft, contextThresholds: { ...draft.contextThresholds, selectTokens: v } })} />
          <Num label="Ngưỡng summary (tokens)" value={draft.contextThresholds.summaryTokens} onChange={(v) => setDraft({ ...draft, contextThresholds: { ...draft.contextThresholds, summaryTokens: v } })} />
          <Num label="Ngưỡng aggressive (tokens)" value={draft.contextThresholds.aggressiveTokens} onChange={(v) => setDraft({ ...draft, contextThresholds: { ...draft.contextThresholds, aggressiveTokens: v } })} />
          <Num label="Số tin nhắn gần đây" value={draft.recentMessages} onChange={(v) => setDraft({ ...draft, recentMessages: v })} />
          <Num label="Max tin nhắn liên quan" value={draft.maxRelevantHistory} onChange={(v) => setDraft({ ...draft, maxRelevantHistory: v })} />
          <Num label="RAG topK" value={draft.ragTopK} onChange={(v) => setDraft({ ...draft, ragTopK: v })} />
        </Grid>
        <Row label="Tóm tắt hội thoại (async)" hint="Chạy nền sau khi trả lời, không chặn user">
          <Toggle checked={draft.summarization.enabled} onChange={(v) => setDraft({ ...draft, summarization: { ...draft.summarization, enabled: v } })} label="Bật summarization" />
        </Row>
        <Grid>
          <Num label="Summarize sau N tin nhắn" value={draft.summarization.triggerMessageCount} onChange={(v) => setDraft({ ...draft, summarization: { ...draft.summarization, triggerMessageCount: v } })} />
          <div>
            <label className="text-xs muted">Model tóm tắt (để trống = tự chọn model rẻ nhất)</label>
            <Input className="mt-1 font-mono text-xs" defaultValue={draft.summarization.modelId} placeholder="custom:ce_…:gemini-flash"
              onBlur={(e) => setDraft({ ...draft, summarization: { ...draft.summarization, modelId: e.target.value.trim() } })} />
          </div>
        </Grid>

        <h3 className="text-xs font-semibold muted pt-2">Model Routing</h3>
        <Grid>
          <Num label="Weight: quality" step={0.05} value={draft.routing.qualityWeight} onChange={(v) => setDraft({ ...draft, routing: { ...draft.routing, qualityWeight: v } })} />
          <Num label="Weight: speed" step={0.05} value={draft.routing.speedWeight} onChange={(v) => setDraft({ ...draft, routing: { ...draft.routing, speedWeight: v } })} />
          <Num label="Weight: cost" step={0.05} value={draft.routing.costWeight} onChange={(v) => setDraft({ ...draft, routing: { ...draft.routing, costWeight: v } })} />
          <Num label="Weight: capability" step={0.05} value={draft.routing.capabilityWeight} onChange={(v) => setDraft({ ...draft, routing: { ...draft.routing, capabilityWeight: v } })} />
        </Grid>

        <h3 className="text-xs font-semibold muted pt-2">Output limits (tokens)</h3>
        <Grid>
          <Num label="Simple" value={draft.outputLimits.simple} onChange={(v) => setDraft({ ...draft, outputLimits: { ...draft.outputLimits, simple: v } })} />
          <Num label="Normal" value={draft.outputLimits.normal} onChange={(v) => setDraft({ ...draft, outputLimits: { ...draft.outputLimits, normal: v } })} />
          <Num label="Coding" value={draft.outputLimits.coding} onChange={(v) => setDraft({ ...draft, outputLimits: { ...draft.outputLimits, coding: v } })} />
          <Num label="Reasoning" value={draft.outputLimits.reasoning} onChange={(v) => setDraft({ ...draft, outputLimits: { ...draft.outputLimits, reasoning: v } })} />
          <Num label="Concise" value={draft.responseLengths.concise} onChange={(v) => setDraft({ ...draft, responseLengths: { ...draft.responseLengths, concise: v } })} />
          <Num label="Balanced" value={draft.responseLengths.balanced} onChange={(v) => setDraft({ ...draft, responseLengths: { ...draft.responseLengths, balanced: v } })} />
          <Num label="Detailed" value={draft.responseLengths.detailed} onChange={(v) => setDraft({ ...draft, responseLengths: { ...draft.responseLengths, detailed: v } })} />
        </Grid>

        <h3 className="text-xs font-semibold muted pt-2">Quota & Budget</h3>
        <Grid>
          <Num label="Requests/user/ngày" value={draft.quotas.dailyRequestsPerUser} onChange={(v) => setDraft({ ...draft, quotas: { ...draft.quotas, dailyRequestsPerUser: v } })} />
          <Num label="Tokens/user/ngày" value={draft.quotas.dailyTokensPerUser} onChange={(v) => setDraft({ ...draft, quotas: { ...draft.quotas, dailyTokensPerUser: v } })} />
          <Num label="Tokens/user/tháng" value={draft.quotas.monthlyTokensPerUser} onChange={(v) => setDraft({ ...draft, quotas: { ...draft.quotas, monthlyTokensPerUser: v } })} />
          <Num label="Budget ngày ($)" step={0.5} value={draft.budget.dailyUsd} onChange={(v) => setDraft({ ...draft, budget: { ...draft.budget, dailyUsd: v } })} />
          <Num label="Cảnh báo ($)" step={0.5} value={draft.budget.warningUsd} onChange={(v) => setDraft({ ...draft, budget: { ...draft.budget, warningUsd: v } })} />
          <Num label="Critical ($)" step={0.5} value={draft.budget.criticalUsd} onChange={(v) => setDraft({ ...draft, budget: { ...draft.budget, criticalUsd: v } })} />
        </Grid>

        <Row label="Prompt caching (Anthropic cache_control)" hint="Giữ stable prefix ở đầu prompt để cache hit tối đa">
          <Toggle checked={draft.promptCaching.enabled} onChange={(v) => setDraft({ ...draft, promptCaching: { enabled: v } })} label="Bật prompt caching" />
        </Row>
      </section>
    </div>
  );
}

function Stat({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent?: string }) {
  return (
    <div className="card p-3.5">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] muted">{label}</span>
        <span className={`p-1 rounded bg-[var(--surface-2)] shrink-0 ${accent ?? ""}`}>{icon}</span>
      </div>
      <p className={`text-lg font-semibold tracking-tight ${accent ?? ""}`}>{value}</p>
    </div>
  );
}

function TableHead({ cols }: { cols: string[] }) {
  return (
    <div className="px-3 py-2.5 text-[11px] muted font-semibold grid grid-cols-7 gap-2 border-b border-[var(--border-subtle)]">
      {cols.map((c) => <span key={c}>{c}</span>)}
    </div>
  );
}

function Cell({ children }: { children: React.ReactNode }) {
  return <div className="min-w-0 text-[var(--text-2)]">{children}</div>;
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="card p-4 flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="text-[11px] muted mt-0.5">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">{children}</div>;
}

function Num({ label, value, onChange, step = 1 }: { label: string; value: number; onChange: (v: number) => void; step?: number }) {
  return (
    <label className="text-xs muted">
      {label}
      <Input
        type="number" step={step} className="mt-1 font-mono text-xs" value={value}
        onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v)) onChange(v); }}
      />
    </label>
  );
}

function Activity() {
  return <ActivityIcon />;
}

function ActivityIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>;
}
