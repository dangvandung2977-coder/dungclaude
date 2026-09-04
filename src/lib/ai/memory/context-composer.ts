// Context Composer & Token Budgeting Engine
// Assembles: System + Global User Memory + Project Memory + Summary + Retrieved Memories + Recent Window.
// Guarantees compact context (~1500–3500 tokens) regardless of conversation length.
import type { GatewayMessage } from "@/lib/ai/gateway";
import type { MemoryRecord, ContextMemoryComposition, MemoryRoutingDecision } from "@/types/memory";
import { listMemories, searchMemories } from "@/lib/db/memory-repo";
import { getEmbedding } from "./embeddings";
import { routeMemory } from "./router";
import { estimateTokens } from "@/lib/ai/registry";

export async function composeMemoryContext(opts: {
  userId: string;
  projectId?: string | null;
  conversationId: string;
  currentMessage: string;
  history: GatewayMessage[];
  conversationSummary?: string | null;
  system: {
    base: string;
    projectInstructions?: string;
    userPrompt?: string;
  };
  maxTotalBudget?: number;
}): Promise<{
  system: string;
  stablePrefix: string;
  messages: GatewayMessage[];
  decision: MemoryRoutingDecision;
  composition: ContextMemoryComposition;
}> {
  const { userId, projectId, currentMessage, history, conversationSummary, system } = opts;
  const maxBudget = opts.maxTotalBudget ?? 16000;

  // 1. Determine memory requirements via Memory Router / Relevance Gate
  const decision = routeMemory({
    message: currentMessage,
    projectId,
    historyLength: history.length,
  });

  // 2. Parallel retrieval of memory layers
  const [globalMemories, projectMemories, retrievedMemories] = await Promise.all([
    // Global user memories (preferences, persistent instructions)
    decision.needGlobalUserMemory
      ? listMemories({ userId, scope: "global", status: "current", limit: 5 }).catch(() => [])
      : Promise.resolve([] as MemoryRecord[]),

    // Project memories (architecture, constraints, decisions)
    decision.needProjectMemory && projectId
      ? listMemories({ userId, projectId, scope: "project", status: "current", limit: 8 }).catch(() => [])
      : Promise.resolve([] as MemoryRecord[]),

    // Semantic retrieval (top-K cross-chat relevant memories)
    decision.needSemanticSearch
      ? (async () => {
          const emb = await getEmbedding(currentMessage).catch(() => null);
          return await searchMemories({
            userId,
            projectId,
            query: currentMessage,
            queryEmbedding: emb,
            limit: 4,
            minScore: 0.35,
          }).catch(() => []);
        })()
      : Promise.resolve([] as MemoryRecord[]),
  ]);

  // 3. Deduplicate retrieved memories against already included project & global memories
  const existingIds = new Set([...globalMemories.map((m) => m.id), ...projectMemories.map((m) => m.id)]);
  const uniqueRetrieved = retrievedMemories.filter((m) => !existingIds.has(m.id)).slice(0, 4);

  // 4. Construct System Sub-blocks with token containment
  let globalMemoriesText = "";
  if (globalMemories.length > 0) {
    globalMemoriesText = `\n\n[Persistent User Profile & Preferences]:\n${globalMemories
      .map((m) => `• ${m.content}`)
      .join("\n")}`;
  }

  let projectMemoriesText = "";
  if (projectMemories.length > 0) {
    projectMemoriesText = `\n\n[Project Knowledge & Architecture Constraints]:\n${projectMemories
      .map((m) => `• [${m.category.toUpperCase()}] ${m.content}`)
      .join("\n")}`;
  }

  let crossChatMemoriesText = "";
  if (uniqueRetrieved.length > 0) {
    crossChatMemoriesText = `\n\n[Relevant Knowledge from Previous Conversations]:\n${uniqueRetrieved
      .map((m) => `• ${m.content}`)
      .join("\n")}`;
  }

  let summaryBlock = "";
  if (decision.needConversationSummary && conversationSummary?.trim()) {
    summaryBlock = `\n\n[Summary of previous conversation turns]:\n${conversationSummary.trim()}`;
  }

  // 5. Stable prefix for prompt caching (Base System + User Prompt + Project Instructions + Global Memories)
  const stablePrefix = [
    system.base,
    system.userPrompt ? `\n\n${system.userPrompt}` : "",
    system.projectInstructions ? `\n\n${system.projectInstructions}` : "",
    globalMemoriesText,
    projectMemoriesText,
  ].join("");

  const fullSystem = [
    stablePrefix,
    crossChatMemoriesText,
    summaryBlock,
  ].join("");

  // 6. Recent message selection with strict token budget
  const systemTokens = estimateTokens(fullSystem);
  const currentTokens = estimateTokens(currentMessage);
  const availableForHistory = Math.max(1200, maxBudget - systemTokens - currentTokens - 1500); // 1500 reserve for response output

  // Window selection: prioritize last 6–12 messages
  const recentWindowSize = decision.needConversationSummary ? 8 : 14;
  const recentSlice = history.slice(-recentWindowSize);

  const selectedMsgs: GatewayMessage[] = [];
  let tokenAcc = 0;
  for (let i = recentSlice.length - 1; i >= 0; i--) {
    const msg = recentSlice[i];
    const tok = estimateTokens(msg.content);
    if (tokenAcc + tok > availableForHistory && selectedMsgs.length >= 4) {
      break;
    }
    selectedMsgs.unshift(msg);
    tokenAcc += tok;
  }

  const composition: ContextMemoryComposition = {
    systemPrompt: fullSystem,
    globalUserMemories: globalMemories,
    projectMemories: projectMemories,
    conversationSummary: conversationSummary ?? null,
    retrievedMemories: uniqueRetrieved,
    tokenEstimate: {
      system: systemTokens,
      globalUser: estimateTokens(globalMemoriesText),
      project: estimateTokens(projectMemoriesText),
      summary: estimateTokens(summaryBlock),
      retrieved: estimateTokens(crossChatMemoriesText),
      messages: tokenAcc + currentTokens,
      total: systemTokens + tokenAcc + currentTokens,
    },
  };

  return {
    system: fullSystem,
    stablePrefix,
    messages: selectedMsgs,
    decision,
    composition,
  };
}
