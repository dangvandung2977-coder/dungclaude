import type { AIModel, Message } from "@/types";
import type { OptimizationSettings, OptimizationMode, ResponseLength, OptimizationResult } from "@/types/optimization";
import type { MemoryRoutingDecision } from "@/types/memory";
import type { GatewayMessage } from "@/lib/ai/gateway";
import { estimateTokens } from "@/lib/ai/registry";
import { retrieve, buildRagContext } from "@/lib/rag/retriever";
import {
  computeContextBudget, selectMessages, strategyFor, strategyParams,
  deduplicateMessages, deduplicateRagChunks, recoverOverflow, makeBreakdown,
  estimateMessagesTokens, outputBudgetFor,
} from "./engine";
import { buildCachedSystem } from "./prompt-cache";
import { getSummary, searchMessageMemory } from "./summarizer";
import { classifyTask, routeModel, estimateOutputTokens } from "./router";
import { routeMemory } from "@/lib/ai/memory/router";
import { listMemories, searchMemories } from "@/lib/db/memory-repo";
import { getEmbedding } from "@/lib/ai/memory/embeddings";

export interface OptimizeInput {
  user: { id: string };
  conversationId: string;
  history: Message[]; // persisted messages, chronological (before current)
  currentMessage: string;
  system: { base: string; userPrompt?: string; projectInstructions?: string };
  attachmentsCount: number;
  toolsEnabled: boolean;
  models: AIModel[]; // enabled/available models
  explicitModelId?: string;
  mode: OptimizationMode;
  responseLength: ResponseLength;
  settings: OptimizationSettings;
  projectId?: string | null;
}

export interface OptimizeOutput {
  result: OptimizationResult;
  routing: { modelId: string; taskClass: string; reason: string; alternativeModelId?: string; alternativeCostUsd?: number; estimatedCostUsd: number };
  system: string;
  stableSystemPrefix: string;
  messages: GatewayMessage[];
  outputLimit: number;
  memoryDecision?: MemoryRoutingDecision;
  memoriesUsed?: number;
}

// Rough tool-definition cost in tokens (3 tools ≈ this)
const TOOLS_TOKEN_EST = 350;

export async function optimizeContext(input: OptimizeInput): Promise<OptimizeOutput> {
  const { settings, mode } = input;

  // 1. History as gateway messages
  const historyMsgs: GatewayMessage[] = deduplicateMessages(
    input.history.map((m) => ({
      role: (m.role === "assistant" ? "assistant" : "user") as "user" | "assistant",
      content: m.content,
    }))
  );

  // 2. Strategy tier by history size
  const historyTokens = estimateMessagesTokens(historyMsgs);
  const tier = strategyFor(historyTokens, settings);
  const params = strategyParams(tier, mode, settings);

  // 3. Task classification
  const taskClass = classifyTask({
    message: input.currentMessage,
    hasImage: false, hasVideo: false, hasFiles: input.attachmentsCount > 0,
    toolsEnabled: input.toolsEnabled,
    historyTokens,
    contextWindow: 128_000,
  });

  // 4. RAG retrieval (scoped, deduped, relevance-filtered, topK adaptive)
  let ragContext = "";
  let ragChunksUsed = 0;
  if (input.attachmentsCount > 0 || input.projectId) {
    const hits = await retrieve(input.currentMessage, {
      conversationId: input.conversationId,
      projectId: input.projectId ?? undefined,
    }, params.rag).catch(() => []);
    const filtered = deduplicateRagChunks(hits.filter((h) => h.score >= 2));
    ragContext = buildRagContext(filtered);
    ragChunksUsed = filtered.length;
  }

  // 5. Memory Routing & Hierarchical Retrieval (Global + Project + Semantic + Summary)
  const memDecision = routeMemory({
    message: input.currentMessage,
    projectId: input.projectId,
    historyLength: historyMsgs.length,
  });

  const [globalMemories, projectMemories, semanticMemories, summaryObj] = await Promise.all([
    memDecision.needGlobalUserMemory
      ? listMemories({ userId: input.user.id, scope: "global", projectId: null, status: "current", limit: 5 }).catch(() => [])
      : Promise.resolve([]),
    memDecision.needProjectMemory && input.projectId
      ? listMemories({ userId: input.user.id, projectId: input.projectId, scope: "project", status: "current", limit: 8 }).catch(() => [])
      : Promise.resolve([]),
    memDecision.needSemanticSearch
      ? (async () => {
          const emb = await getEmbedding(input.currentMessage).catch(() => null);
          return await searchMemories({
            userId: input.user.id,
            projectId: input.projectId,
            query: input.currentMessage,
            queryEmbedding: emb,
            limit: 4,
          }).catch(() => []);
        })()
      : Promise.resolve([]),
    (tier === "summary" || tier === "aggressive" || memDecision.needConversationSummary)
      ? getSummary(input.conversationId).catch(() => null)
      : Promise.resolve(null),
  ]);

  const summaryText = summaryObj?.content ?? "";
  let userMemoryText = "";
  if (globalMemories.length > 0) {
    userMemoryText = `[User Profile & Preferences]:\n${globalMemories.map((m) => `• ${m.content}`).join("\n")}`;
  }

  let projectMemoryText = "";
  if (projectMemories.length > 0) {
    projectMemoryText = `[Project Architecture & Constraints]:\n${projectMemories.map((m) => `• [${m.category.toUpperCase()}] ${m.content}`).join("\n")}`;
  }

  // Deduplicate semantic memories from project memories
  const existingMemoryIds = new Set([...globalMemories.map((m) => m.id), ...projectMemories.map((m) => m.id)]);
  const uniqueSemantic = semanticMemories.filter((m) => !existingMemoryIds.has(m.id));

  let semanticMemory = "";
  if (uniqueSemantic.length > 0) {
    semanticMemory = uniqueSemantic.map((m) => `• ${m.content}`).join("\n");
  } else if (tier === "aggressive" || (tier === "summary" && historyTokens > settings.contextThresholds.aggressiveTokens * 0.5)) {
    const mem = await searchMessageMemory(input.user.id, input.conversationId, input.currentMessage, 4).catch(() => []);
    if (mem.length) {
      semanticMemory = mem.slice(0, 4).map((x, i) => `[${i + 1}] ${x.content.slice(0, 800)}`).join("\n");
    }
  }

  const memoriesUsed = globalMemories.length + projectMemories.length + uniqueSemantic.length;

  // 6. Build cached system (stable first, dynamic after)
  const { system, stablePrefix } = buildCachedSystem({
    baseSystem: input.system.base,
    userSystemPrompt: input.system.userPrompt ?? "",
    projectInstructions: input.system.projectInstructions ?? "",
    userMemory: userMemoryText,
    projectMemory: projectMemoryText,
    summary: summaryText,
    semanticMemory,
    ragContext,
  }, settings);

  // 7. Model routing (auto or explicit) — needs models with metadata
  const routed = routeModel({
    models: input.models,
    taskClass,
    settings,
    estInputTokens: historyTokens + estimateTokens(system),
    estOutputTokens: estimateOutputTokens(taskClass, settings),
    explicitModelId: input.explicitModelId,
  });
  const model = input.models.find((m) => m.id === routed.modelId)
    ?? input.models[0] ?? { id: "demo:lumen-echo", contextWindow: 128000, capabilities: ["chat"], inputPricePerM: 0, outputPricePerM: 0, provider: "demo", enabled: false, requiresKey: false } as AIModel;

  // 8. Budget with reserves → selection
  const toolsReserve = input.toolsEnabled ? TOOLS_TOKEN_EST : 0;
  const budget = computeContextBudget(model, { model, mode, settings }, {
    system: estimateTokens(stablePrefix),
    tools: toolsReserve,
    project: estimateTokens(input.system.projectInstructions ?? ""),
    rag: estimateTokens(ragContext),
  });

  const selection = selectMessages({
    history: historyMsgs,
    currentMessage: input.currentMessage,
    budget: budget.historyBudget,
    recentCount: params.recent,
    maxRelevant: params.relevant,
    summaryTokens: estimateTokens(summaryText),
  });

  // 9. Overflow recovery
  let finalMsgs = selection.selected;
  let finalSystem = system;
  if (estimateMessagesTokens(finalMsgs) + estimateTokens(system) + toolsReserve > budget.contextWindow - budget.outputReserve) {
    const rec = recoverOverflow(finalMsgs, budget.historyBudget, ragContext, summaryText);
    finalMsgs = rec.msgs;
    // rebuild system without dropped parts
    const rebuilt = buildCachedSystem({
      baseSystem: input.system.base,
      userSystemPrompt: input.system.userPrompt ?? "",
      projectInstructions: input.system.projectInstructions ?? "",
      summary: rec.summaryText,
      semanticMemory,
      ragContext: rec.ragContext,
    }, settings);
    finalSystem = rebuilt.system;
  }

  // 10. Output budget
  const outputLimit = Math.min(
    outputBudgetFor(taskClass, mode, input.responseLength, settings),
    Math.floor(model.contextWindow * 0.5)
  );

  // 11. Accounting — only count tokens optimization actually removes.
  // System/rag/project are sent in both worlds; savings come from history
  // compression (history → selection + summary). Never fabricate savings.
  const tokensWithoutOptimization = historyTokens;
  const currentMsg: GatewayMessage = { role: "user", content: input.currentMessage };
  const finalMessages = [...finalMsgs, currentMsg];

  const breakdown = makeBreakdown({
    system: stablePrefix,
    summary: summaryText,
    recentTokens: selection.tokensUsed - estimateTokens(summaryText), // selection includes the summary
    relevantTokens: 0,
    rag: ragContext,
    tools: toolsReserve,
    currentMessage: input.currentMessage,
  });

  const result: OptimizationResult = {
    messages: finalMessages,
    system: finalSystem,
    outputLimit,
    breakdown,
    strategy: `${tier}${summaryText ? "+summary" : ""}${semanticMemory ? "+memory" : ""}${ragChunksUsed ? "+rag" : ""}`,
    tokensSaved: Math.max(0, tokensWithoutOptimization - (estimateMessagesTokens(finalMsgs) + estimateTokens(summaryText) + estimateTokens(semanticMemory) + estimateTokens(ragContext))),
    tokensWithoutOptimization,
    ragChunksUsed,
    summaryUsed: Boolean(summaryText),
  };

  return {
    result,
    routing: {
      modelId: routed.modelId,
      taskClass,
      reason: routed.routingReason,
      alternativeModelId: routed.alternativeModelId,
      alternativeCostUsd: routed.alternativeCostUsd,
      estimatedCostUsd: routed.estimatedCostUsd,
    },
    system: finalSystem,
    stableSystemPrefix: stablePrefix,
    messages: finalMessages,
    outputLimit,
    memoryDecision: memDecision,
    memoriesUsed,
  };
}

export { classifyTask, estimateOutputTokens };
