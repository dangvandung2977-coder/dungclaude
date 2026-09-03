// Usage Tracker + Cost Calculator + Quota/Budget manager.
// Normalizes provider-specific usage into one internal schema and enforces
// daily budget / per-user quotas before a request goes out.
import { getSupabase, uid, nowIso, num, str, type Row } from "@/lib/db/supabase";
import type { AIModel } from "@/types";
import type { CostAlertState, NormalizedUsage, OptimizationSettings, UserQuotaState } from "@/types/optimization";

// ── Cost Calculator (cached-token aware) ──
export function calculateCost(model: AIModel, usage: { inputTokens: number; outputTokens: number; cachedInputTokens?: number; cacheCreationTokens?: number }): number {
  const cached = usage.cachedInputTokens ?? 0;
  const fresh = Math.max(0, usage.inputTokens - cached);
  // cachedInputPrice: use if model defines it; assume 10% of input price otherwise
  const cachedPrice = (model as AIModel & { cachedInputPricePerM?: number }).cachedInputPricePerM ?? model.inputPricePerM * 0.1;
  return (
    (fresh / 1e6) * model.inputPricePerM +
    (cached / 1e6) * cachedPrice +
    (usage.cacheCreationTokens ?? 0) / 1e6 * model.inputPricePerM * 1.25 +
    (usage.outputTokens / 1e6) * model.outputPricePerM
  );
}

// ── Usage Tracker (extends existing usage_events row) ──
export interface UsageRecordInput {
  userId: string;
  conversationId?: string | null;
  messageId?: string | null;
  model: string;
  provider: string;
  functionKey?: string;
  usage: NormalizedUsage;
  costUsd: number;
  requestId?: string;
  routingReason?: string;
  optimizationStrategy?: string;
  tokensSaved?: number;
  tokensWithoutOptimization?: number;
}

export async function recordOptimizedUsage(e: UsageRecordInput): Promise<void> {
  const u = e.usage;
  const { error } = await getSupabase().from("usage_events").insert({
    id: uid("use"),
    user_id: e.userId,
    conversation_id: e.conversationId ?? null,
    message_id: e.messageId ?? null,
    model: e.model, provider: e.provider,
    function_key: e.functionKey ?? "chat_default",
    input_tokens: u.inputTokens,
    output_tokens: u.outputTokens,
    cached_input_tokens: u.cachedInputTokens,
    cache_creation_tokens: u.cacheCreationTokens,
    total_tokens: u.inputTokens + u.outputTokens,
    cost_usd: e.costUsd,
    duration_ms: u.latencyMs,
    request_id: e.requestId ?? null,
    routing_reason: e.routingReason?.slice(0, 200) ?? null,
    optimization_strategy: e.optimizationStrategy?.slice(0, 100) ?? null,
    tokens_saved: e.tokensSaved ?? 0,
    tokens_without_optimization: e.tokensWithoutOptimization ?? 0,
  });
  if (error) {
    // Missing columns (pre-migration) → fall back to original schema
    if (error.message?.includes("column") || error.message?.includes("does not exist")) {
      const { error: e2 } = await getSupabase().from("usage_events").insert({
        id: uid("use"), user_id: e.userId, conversation_id: e.conversationId ?? null,
        model: e.model, provider: e.provider, function_key: e.functionKey ?? "chat_default",
        input_tokens: u.inputTokens, output_tokens: u.outputTokens,
        total_tokens: u.inputTokens + u.outputTokens,
        cost_usd: e.costUsd, duration_ms: u.latencyMs,
      });
      if (e2) throw new Error(e2.message);
      return;
    }
    throw new Error(error.message);
  }
}

function startOfTodayIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function startOfMonthIso(): string {
  const d = new Date();
  d.setDate(1); d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

// ── Quota Manager (per-user) ──
export async function checkUserQuota(userId: string, s: OptimizationSettings): Promise<UserQuotaState> {
  const sb = getSupabase();
  const today = startOfTodayIso();
  const month = startOfMonthIso();
  const [dayReq, dayTok, monTok] = await Promise.all([
    sb.from("usage_events").select("cost_usd", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", today),
    sb.from("usage_events").select("total_tokens", { count: "exact", head: false }).eq("user_id", userId).gte("created_at", today).limit(10000),
    sb.from("usage_events").select("total_tokens", { count: "exact", head: false }).eq("user_id", userId).gte("created_at", month).limit(50000),
  ]);
  const dailyRequests = dayReq.count ?? 0;
  const dailyTokens = ((dayTok.data ?? []) as Row[]).reduce((a, r) => a + num(r.total_tokens), 0);
  const monthlyTokens = ((monTok.data ?? []) as Row[]).reduce((a, r) => a + num(r.total_tokens), 0);

  const issues: string[] = [];
  const q = s.quotas;
  if (dailyRequests >= q.dailyRequestsPerUser) issues.push(`Đã đạt giới hạn ${q.dailyRequestsPerUser} yêu cầu/ngày`);
  if (dailyTokens >= q.dailyTokensPerUser) issues.push(`Đã đạt giới hạn ${q.dailyTokensPerUser.toLocaleString()} tokens/ngày`);
  if (monthlyTokens >= q.monthlyTokensPerUser) issues.push(`Đã đạt giới hạn tokens/tháng`);
  return {
    ok: issues.length === 0,
    dailyRequests: { used: dailyRequests, limit: q.dailyRequestsPerUser },
    dailyTokens: { used: dailyTokens, limit: q.dailyTokensPerUser },
    monthlyTokens: { used: monthlyTokens, limit: q.monthlyTokensPerUser },
    message: issues[0],
  };
}

// ── Cost Alerts (global daily budget) ──
export async function checkCostBudget(s: OptimizationSettings): Promise<CostAlertState> {
  const { data, error } = await getSupabase()
    .from("usage_events").select("cost_usd")
    .gte("created_at", startOfTodayIso()).limit(20000);
  if (error) return { level: "ok", spentTodayUsd: 0, budgetUsd: s.budget.dailyUsd };
  const spent = ((data ?? []) as Row[]).reduce((a, r) => a + num(r.cost_usd), 0);
  const b = s.budget;
  let level: CostAlertState["level"] = "ok";
  let message: string | undefined;
  if (spent >= b.dailyUsd) { level = "limit"; message = `Đã vượt ngân sách ngày $${b.dailyUsd}`; }
  else if (spent >= b.criticalUsd) { level = "critical"; message = `Gần chạm trần ngân sách ngày ($${b.criticalUsd}/${b.dailyUsd})`; }
  else if (spent >= b.warningUsd) { level = "warning"; message = `Cảnh báo chi phí ngày: $${spent.toFixed(2)}/${b.dailyUsd}`; }
  return { level, spentTodayUsd: spent, budgetUsd: b.dailyUsd, message };
}

// ── Cost Analytics (admin dashboard) ──
export interface UsageAnalytics {
  today: { requests: number; inputTokens: number; outputTokens: number; cachedTokens: number; costUsd: number; avgLatencyMs: number; tokensSaved: number };
  byModel: Array<{ model: string; provider: string; requests: number; inputTokens: number; outputTokens: number; cachedTokens: number; costUsd: number }>;
  byUser: Array<{ userId: string; requests: number; tokens: number; costUsd: number }>;
  byDay: Array<{ day: string; requests: number; costUsd: number; tokens: number }>;
  totals: { requests: number; tokens: number; costUsd: number; tokensSaved: number; cacheHitRate: number; avgContextTokens: number; avgOutputTokens: number };
}

export async function usageAnalytics(): Promise<UsageAnalytics> {
  const sb = getSupabase();
  const today = startOfTodayIso();
  const [todayRows, recentRows] = await Promise.all([
    sb.from("usage_events").select("model,provider,input_tokens,output_tokens,cached_input_tokens,total_tokens,cost_usd,duration_ms,tokens_saved")
      .gte("created_at", today).limit(20000),
    sb.from("usage_events").select("model,provider,user_id,input_tokens,output_tokens,cached_input_tokens,total_tokens,cost_usd,created_at,tokens_saved")
      .gte("created_at", new Date(Date.now() - 30 * 86400_000).toISOString()).limit(50000),
  ]);

  const t = ((todayRows.data ?? []) as Row[]);
  const all = ((recentRows.data ?? []) as Row[]);

  interface Agg {
    requests: number; inputTokens: number; outputTokens: number; cachedTokens: number; costUsd: number; latencyMs: number; tokensSaved: number;
  }
  const todayAgg = t.reduce<Agg>((a, r) => ({
    requests: a.requests + 1,
    inputTokens: a.inputTokens + num(r.input_tokens),
    outputTokens: a.outputTokens + num(r.output_tokens),
    cachedTokens: a.cachedTokens + num(r.cached_input_tokens),
    costUsd: a.costUsd + num(r.cost_usd),
    latencyMs: a.latencyMs + num(r.duration_ms),
    tokensSaved: a.tokensSaved + num(r.tokens_saved),
  }), { requests: 0, inputTokens: 0, outputTokens: 0, cachedTokens: 0, costUsd: 0, latencyMs: 0, tokensSaved: 0 });

  const byModelMap = new Map<string, { model: string; provider: string; requests: number; inputTokens: number; outputTokens: number; cachedTokens: number; costUsd: number }>();
  for (const r of all) {
    const k = str(r.model);
    const cur = byModelMap.get(k) ?? { model: k, provider: str(r.provider), requests: 0, inputTokens: 0, outputTokens: 0, cachedTokens: 0, costUsd: 0 };
    cur.requests++; cur.inputTokens += num(r.input_tokens); cur.outputTokens += num(r.output_tokens);
    cur.cachedTokens += num(r.cached_input_tokens); cur.costUsd += num(r.cost_usd);
    byModelMap.set(k, cur);
  }

  const byUserMap = new Map<string, { userId: string; requests: number; tokens: number; costUsd: number }>();
  for (const r of all) {
    const k = str(r.user_id);
    const cur = byUserMap.get(k) ?? { userId: k, requests: 0, tokens: 0, costUsd: 0 };
    cur.requests++; cur.tokens += num(r.total_tokens); cur.costUsd += num(r.cost_usd);
    byUserMap.set(k, cur);
  }

  const byDayMap = new Map<string, { day: string; requests: number; costUsd: number; tokens: number }>();
  for (const r of all) {
    const k = str(r.created_at).slice(0, 10);
    const cur = byDayMap.get(k) ?? { day: k, requests: 0, costUsd: 0, tokens: 0 };
    cur.requests++; cur.costUsd += num(r.cost_usd); cur.tokens += num(r.total_tokens);
    byDayMap.set(k, cur);
  }

  const totalInput = all.reduce((a, r) => a + num(r.input_tokens), 0);
  const totalCached = all.reduce((a, r) => a + num(r.cached_input_tokens), 0);
  const totalOut = all.reduce((a, r) => a + num(r.output_tokens), 0);

  return {
    today: { ...todayAgg, avgLatencyMs: todayAgg.requests ? Math.round(todayAgg.latencyMs / todayAgg.requests) : 0 },
    byModel: [...byModelMap.values()].sort((a, b) => b.costUsd - a.costUsd),
    byUser: [...byUserMap.values()].sort((a, b) => b.costUsd - a.costUsd),
    byDay: [...byDayMap.values()].sort((a, b) => a.day.localeCompare(b.day)),
    totals: {
      requests: all.length,
      tokens: all.reduce((a, r) => a + num(r.total_tokens), 0),
      costUsd: all.reduce((a, r) => a + num(r.cost_usd), 0),
      tokensSaved: all.reduce((a, r) => a + num(r.tokens_saved), 0),
      cacheHitRate: totalInput > 0 ? totalCached / totalInput : 0,
      avgContextTokens: all.length ? Math.round(totalInput / all.length) : 0,
      avgOutputTokens: all.length ? Math.round(totalOut / all.length) : 0,
    },
  };
}

// Log fallback event (observability — routing fallbacks tracked, spec §44).
export async function recordFallbackEvent(userId: string, conversationId: string, primaryModel: string, fallbackModel: string, reason: string): Promise<void> {
  try {
    await getSupabase().from("fallback_events").insert({
      id: uid("fb"), user_id: userId, conversation_id: conversationId,
      primary_model: primaryModel, fallback_model: fallbackModel, reason: reason.slice(0, 300), created_at: nowIso(),
    });
  } catch { /* table optional */ }
}
