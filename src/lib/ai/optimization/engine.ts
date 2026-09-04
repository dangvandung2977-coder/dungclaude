// Optimization Engine — context budgeting, intelligent message selection,
// deduplication, overflow recovery. Provider-independent: everything here
// operates on plain strings/GatewayMessages before the gateway is called.
import { estimateTokens } from "@/lib/ai/registry";
import type { GatewayMessage } from "@/lib/ai/gateway";
import type { AIModel } from "@/types";
import type { ContextBudget, ContextBreakdown, OptimizationMode } from "@/types/optimization";
import { OPTIMIZATION_SETTINGS_DEFAULTS, type OptimizationSettings } from "@/types/optimization";

export interface EngineOptions {
  model: AIModel;
  mode: OptimizationMode;
  settings: OptimizationSettings;
}

// ── Mode multipliers (cost_efficient squeezes harder, max_quality keeps more) ──
const MODE_MUL: Record<OptimizationMode, { recent: number; relevant: number; rag: number }> = {
  cost_efficient: { recent: 0.6, relevant: 0.5, rag: 0.6 },
  balanced: { recent: 1, relevant: 1, rag: 1 },
  max_quality: { recent: 1.5, relevant: 1.5, rag: 1.4 },
};

// ── Context Budget Manager ──
export function computeContextBudget(model: AIModel, opts: EngineOptions, reserves: { system: number; tools: number; project: number; rag: number }): ContextBudget {
  const ctx = model.contextWindow > 0 ? model.contextWindow : 128_000;
  const maxOut = Math.min(modelOutputCap(model, opts), Math.floor(ctx * 0.4));
  // History gets what's left after all fixed reserves.
  const historyBudget = Math.max(
    1000,
    ctx - maxOut - reserves.system - reserves.tools - reserves.project - reserves.rag
  );
  return {
    contextWindow: ctx,
    outputReserve: maxOut,
    systemReserve: reserves.system,
    toolsReserve: reserves.tools,
    projectReserve: reserves.project,
    ragReserve: reserves.rag,
    historyBudget,
  };
}

export function modelOutputCap(model: AIModel, opts: EngineOptions): number {
  const caps = [model.contextWindow, (model as { maxOutputTokens?: number }).maxOutputTokens ?? Infinity].filter((n) => n > 0);
  const cap = Math.min(...(caps.length ? caps : [128_000]));
  // ponytail: cap output at 25% of context window — generous but bounded
  return Math.min(cap, Math.max(1024, Math.floor(model.contextWindow * 0.25)));
}

// ── Task output budget by task class + response length ──
export function outputBudgetFor(taskClass: string, mode: OptimizationMode, responseLength: string, s: OptimizationSettings): number {
  if (taskClass === "coding") {
    // Coding requests should never be cut short — allow up to 64,000 tokens for full code generation
    return responseLength === "concise" ? 8192 : Math.max(s.outputLimits.coding, 64000);
  }
  const base = taskClass === "reasoning" ? Math.max(s.outputLimits.reasoning, 32000)
    : taskClass === "simple" ? s.outputLimits.simple
    : s.outputLimits.normal;
  const lenMul = responseLength === "concise" ? 0.6 : responseLength === "detailed" ? 2.5 : 1.2;
  const modeMul = mode === "cost_efficient" ? 0.9 : 1;
  const byLength = s.responseLengths[responseLength as "concise" | "balanced" | "detailed"] ?? base;
  return Math.max(4096, Math.round(Math.max(base * lenMul, byLength) * modeMul));
}

// ── Token Estimator (heuristic, chars/4 — same as existing registry) ──
export function estimateMessagesTokens(messages: Array<{ content: string }>): number {
  return messages.reduce((a, m) => a + estimateTokens(m.content) + 4, 0);
}

// ── Context Deduplicator ──
// Drops near-identical consecutive messages and repeated identical content.
export function deduplicateMessages(messages: GatewayMessage[]): GatewayMessage[] {
  const seen = new Set<string>();
  const out: GatewayMessage[] = [];
  for (const m of messages) {
    const key = `${m.role}:${normalizeForDedup(m.content)}`;
    if (m.role === "user" && seen.has(key)) continue; // same user message injected twice
    seen.add(key);
    out.push(m);
  }
  return out;
}

function normalizeForDedup(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 500);
}

// Deduplicate RAG chunks: same attachment + overlapping text → keep best.
export function deduplicateRagChunks<T extends { attachmentId: string; chunk: string; score: number }>(hits: T[]): T[] {
  const byAtt = new Map<string, T>();
  for (const h of hits) {
    const cur = byAtt.get(h.attachmentId);
    if (!cur || h.score > cur.score) byAtt.set(h.attachmentId, h);
  }
  return [...byAtt.values()].sort((a, b) => b.score - a.score);
}

// ── Intelligent Message Selection ──
// Selects: recent window (verbatim) + semantically relevant older messages
// (keyword overlap with current query — cheap, no embeddings required).
export interface SelectInput {
  history: GatewayMessage[]; // full conversation (chronological)
  currentMessage: string;
  budget: number; // token budget for history
  recentCount: number;
  maxRelevant: number;
  summaryTokens: number;
}

export interface SelectionResult {
  selected: GatewayMessage[]; // chronological, gap-joined
  tokensUsed: number;
  tokensFull: number;
  relevantCount: number;
  omittedCount: number;
}

export function selectMessages(input: SelectInput): SelectionResult {
  const { history, budget, recentCount, maxRelevant } = input;
  const tokensFull = estimateMessagesTokens(history);

  // Always keep the most recent messages verbatim (tool dependencies, task state).
  const recentStart = Math.max(0, history.length - recentCount);
  const recent = history.slice(recentStart);
  const older = history.slice(0, recentStart);

  const recentTokens = estimateMessagesTokens(recent);

  // Relevant older messages: keyword overlap with the current message.
  const queryTerms = tokenize(input.currentMessage);
  let relevant: GatewayMessage[] = [];
  if (older.length && maxRelevant > 0 && queryTerms.size > 0) {
    const scored = older
      .filter((m) => m.role !== "system")
      .map((m) => ({ m, score: overlapScore(tokenize(m.content), queryTerms) }))
      .filter((x) => x.score >= 2)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxRelevant);
    relevant = scored.map((x) => x.m);
    // keep chronological order
    const idx = new Set(scored.map((x) => x.m));
    relevant = older.filter((m) => idx.has(m));
  }

  // Fit within budget: drop lowest-scoring relevant first, then trim recent.
  let selected = [...relevant, ...recent];
  let tokensUsed = estimateMessagesTokens(selected) + (input.summaryTokens || 0);
  while (tokensUsed > budget && selected.length > 1) {
    // Remove the oldest non-recent message; if only recent left, drop oldest.
    const removable = selected[0]; // oldest — relevant older messages come first
    selected = selected.filter((m) => m !== removable);
    tokensUsed = estimateMessagesTokens(selected) + (input.summaryTokens || 0);
  }
  // Hard trim: if still over, cut from the front by characters.
  if (tokensUsed > budget && selected.length) {
    selected = trimFront(selected, budget - (input.summaryTokens || 0));
    tokensUsed = estimateMessagesTokens(selected) + (input.summaryTokens || 0);
  }

  return {
    selected,
    tokensUsed,
    tokensFull,
    relevantCount: relevant.length,
    omittedCount: history.length - selected.length,
  };
}

function trimFront(msgs: GatewayMessage[], budgetTokens: number): GatewayMessage[] {
  // Drop oldest messages whole until within budget (never split a message).
  const out = [...msgs];
  while (out.length > 1 && estimateMessagesTokens(out) > budgetTokens) out.shift();
  return out;
}

function tokenize(s: string): Set<string> {
  return new Set(
    (s.toLowerCase().match(/[a-z0-9À-ɏḀ-ỿ]{3,}/g) ?? []).slice(0, 60)
  );
}

function overlapScore(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const w of a) if (b.has(w)) n += w.length > 5 ? 2 : 1;
  return n;
}

// ── Strategy decision: which compression tier applies ──
export type StrategyTier = "full" | "select" | "summary" | "aggressive";

export function strategyFor(historyTokens: number, s: OptimizationSettings): StrategyTier {
  const t = s.contextThresholds;
  if (historyTokens >= t.aggressiveTokens) return "aggressive";
  if (historyTokens >= t.summaryTokens) return "summary";
  if (historyTokens >= t.selectTokens) return "select";
  return "full";
}

export function strategyParams(tier: StrategyTier, mode: OptimizationMode, s: OptimizationSettings): { recent: number; relevant: number; rag: number } {
  const mul = MODE_MUL[mode];
  switch (tier) {
    case "full":
      return { recent: Math.ceil(s.recentMessages * 1.5 * mul.recent), relevant: Math.ceil(s.maxRelevantHistory * mul.relevant), rag: s.ragTopK };
    case "select":
      return { recent: Math.ceil(s.recentMessages * mul.recent), relevant: Math.ceil(s.maxRelevantHistory * mul.relevant), rag: s.ragTopK };
    case "summary":
      return { recent: Math.ceil(s.recentMessages * 0.7 * mul.recent), relevant: s.maxRelevantHistory, rag: Math.ceil(s.ragTopK * 0.8) };
    case "aggressive":
      return { recent: Math.ceil(s.recentMessages * 0.5 * mul.recent), relevant: Math.ceil(s.maxRelevantHistory * 0.5), rag: Math.ceil(s.ragTopK * 0.6 * mul.rag) };
  }
}

// ── Context Overflow Recovery ──
// Progressive: drop low-relevance history → drop RAG → trim summary → hard trim.
export function recoverOverflow(
  msgs: GatewayMessage[],
  budgetTokens: number,
  ragContext: string,
  summaryText: string
): { msgs: GatewayMessage[]; ragContext: string; summaryText: string; recovered: boolean } {
  let m = msgs;
  let rag = ragContext;
  let summary = summaryText;
  // 1. drop oldest messages
  while (estimateMessagesTokens(m) > budgetTokens && m.length > 1) m.shift();
  // 2. drop RAG entirely
  if (estimateMessagesTokens(m) + estimateTokens(rag) > budgetTokens) rag = "";
  // 3. halve summary
  if (summary && estimateMessagesTokens(m) + estimateTokens(summary) + estimateTokens(rag) > budgetTokens) {
    summary = halveText(summary);
  }
  // 4. last resort: keep only final exchange
  if (estimateMessagesTokens(m) + estimateTokens(summary) + estimateTokens(rag) > budgetTokens) {
    m = m.slice(-2);
    summary = "";
    rag = "";
    // 5. absolute last resort: truncate the final message content itself
    while (estimateMessagesTokens(m) > budgetTokens && m.length) {
      const last = m[m.length - 1];
      const overChars = (estimateMessagesTokens(m) - budgetTokens) * 4;
      m[m.length - 1] = { ...last, content: last.content.slice(0, Math.max(200, last.content.length - overChars)) };
      if (last.content.length <= 200) break;
    }
  }
  return { msgs: m, ragContext: rag, summaryText: summary, recovered: true };
}

function halveText(s: string): string {
  const half = Math.floor(s.length / 2);
  const cut = s.lastIndexOf("\n", half);
  return s.slice(0, cut > 0 ? cut : half);
}

// ── Breakdown accounting ──
export function makeBreakdown(parts: { system: string; summary: string; recentTokens: number; relevantTokens: number; rag: string; tools: number; currentMessage: string }): ContextBreakdown {
  const system = estimateTokens(parts.system);
  const summary = estimateTokens(parts.summary);
  const rag = estimateTokens(parts.rag);
  const current = estimateTokens(parts.currentMessage);
  return {
    system,
    summary,
    recentMessages: parts.recentTokens,
    relevantHistory: parts.relevantTokens,
    rag,
    tools: parts.tools,
    currentMessage: current,
    total: system + summary + parts.recentTokens + parts.relevantTokens + rag + parts.tools + current,
  };
}

// Re-export defaults so callers have one import point.
export { OPTIMIZATION_SETTINGS_DEFAULTS };
