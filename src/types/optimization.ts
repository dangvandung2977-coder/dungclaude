import { z } from "zod";
import type { GatewayMessage } from "@/lib/ai/gateway";

// ── Token & Cost Optimization System — shared types ──

export type OptimizationMode = "cost_efficient" | "balanced" | "max_quality";
export type TaskClass =
  | "simple" | "normal" | "coding" | "reasoning"
  | "long_context" | "creative" | "analysis" | "agentic" | "tool_use" | "vision";
export type ResponseLength = "concise" | "balanced" | "detailed";

export interface ContextBudget {
  contextWindow: number;
  outputReserve: number;
  systemReserve: number;
  toolsReserve: number;
  projectReserve: number;
  ragReserve: number;
  historyBudget: number;
}

export interface ContextBreakdown {
  system: number;
  summary: number;
  recentMessages: number;
  relevantHistory: number;
  rag: number;
  tools: number;
  currentMessage: number;
  total: number;
}

export interface RoutingDecision {
  modelId: string;
  taskClass: TaskClass;
  routingReason: string;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedCostUsd: number;
  alternativeModelId?: string;
  alternativeCostUsd?: number;
}

export interface OptimizationResult {
  messages: GatewayMessage[];
  system: string;
  outputLimit: number;
  breakdown: ContextBreakdown;
  strategy: string;
  tokensSaved: number;
  tokensWithoutOptimization: number;
  ragChunksUsed: number;
  summaryUsed: boolean;
}

export interface NormalizedUsage {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  cacheCreationTokens: number;
  latencyMs: number;
}

// ── Admin-configurable optimization settings (single row, key/value JSON) ──

export const OPTIMIZATION_SETTINGS_DEFAULTS = {
  mode: "balanced" as OptimizationMode,
  contextThresholds: {
    // "normal" full context below this; selection above
    selectTokens: 8000,
    // summary + recent above this
    summaryTokens: 20000,
    // aggressive compression above this
    aggressiveTokens: 40000,
  },
  recentMessages: 14,
  maxRelevantHistory: 6,
  ragTopK: 5,
  routing: { qualityWeight: 0.4, speedWeight: 0.15, costWeight: 0.3, capabilityWeight: 0.15 },
  outputLimits: { simple: 2000, normal: 4000, coding: 8000, reasoning: 16000 },
  responseLengths: { concise: 1500, balanced: 4000, detailed: 8000 },
  quotas: {
    dailyRequestsPerUser: 200,
    dailyTokensPerUser: 500_000,
    monthlyTokensPerUser: 5_000_000,
  },
  budget: { dailyUsd: 10, warningUsd: 7, criticalUsd: 9 },
  summarization: { enabled: true, modelId: "", triggerMessageCount: 20 },
  promptCaching: { enabled: true },
  fallbackEnabled: true,
};

export const optimizationSettingsSchema = z.object({
  mode: z.enum(["cost_efficient", "balanced", "max_quality"]),
  contextThresholds: z.object({
    selectTokens: z.number().min(1000).max(200000),
    summaryTokens: z.number().min(2000).max(400000),
    aggressiveTokens: z.number().min(4000).max(1000000),
  }),
  recentMessages: z.number().int().min(2).max(60),
  maxRelevantHistory: z.number().int().min(0).max(20),
  ragTopK: z.number().int().min(1).max(12),
  routing: z.object({
    qualityWeight: z.number().min(0).max(1),
    speedWeight: z.number().min(0).max(1),
    costWeight: z.number().min(0).max(1),
    capabilityWeight: z.number().min(0).max(1),
  }),
  outputLimits: z.object({
    simple: z.number().int().min(256).max(65536),
    normal: z.number().int().min(256).max(65536),
    coding: z.number().int().min(256).max(65536),
    reasoning: z.number().int().min(256).max(65536),
  }),
  responseLengths: z.object({
    concise: z.number().int().min(256).max(65536),
    balanced: z.number().int().min(256).max(65536),
    detailed: z.number().int().min(256).max(65536),
  }),
  quotas: z.object({
    dailyRequestsPerUser: z.number().int().min(1).max(100000),
    dailyTokensPerUser: z.number().int().min(1000).max(100_000_000),
    monthlyTokensPerUser: z.number().int().min(1000).max(1_000_000_000),
  }),
  budget: z.object({
    dailyUsd: z.number().min(0.1).max(10000),
    warningUsd: z.number().min(0).max(10000),
    criticalUsd: z.number().min(0).max(10000),
  }),
  summarization: z.object({
    enabled: z.boolean(),
    modelId: z.string().max(160),
    triggerMessageCount: z.number().int().min(4).max(200),
  }),
  promptCaching: z.object({ enabled: z.boolean() }),
  fallbackEnabled: z.boolean(),
});

export type OptimizationSettings = z.infer<typeof optimizationSettingsSchema>;

export interface CostAlertState {
  level: "ok" | "warning" | "critical" | "limit";
  spentTodayUsd: number;
  budgetUsd: number;
  message?: string;
}

export interface UserQuotaState {
  ok: boolean;
  dailyRequests?: { used: number; limit: number };
  dailyTokens?: { used: number; limit: number };
  monthlyTokens?: { used: number; limit: number };
  message?: string;
}
