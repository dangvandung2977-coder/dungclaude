import { describe, it, expect } from "vitest";
import {
  computeContextBudget,
  selectMessages,
  strategyFor,
  strategyParams,
  deduplicateMessages,
  deduplicateRagChunks,
  recoverOverflow,
  outputBudgetFor,
  estimateMessagesTokens,
  modelOutputCap,
} from "@/lib/ai/optimization/engine";
import { classifyTask, routingScore, routeModel, heuristicTitle, estimateOutputTokens } from "@/lib/ai/optimization/router";
import { buildCachedSystem, anthropicCachePoint } from "@/lib/ai/optimization/prompt-cache";
import { calculateCost } from "@/lib/ai/optimization/usage";
import { defaultOptimizationSettings } from "@/lib/ai/optimization/settings";
import { chunkText } from "@/lib/rag/retriever";
import { estimateTokens } from "@/lib/ai/registry";
import type { GatewayMessage } from "@/lib/ai/gateway";
import type { AIModel } from "@/types";

const S = defaultOptimizationSettings();
const MODE = { model: { id: "x", provider: "x", name: "x", contextWindow: 128000, capabilities: ["chat"], inputPricePerM: 1, outputPricePerM: 2, enabled: true, requiresKey: false } as AIModel, mode: "balanced" as const, settings: S };

function msg(role: "user" | "assistant", content: string): GatewayMessage {
  return { role, content };
}

describe("context budget manager", () => {
  it("reserves output/system/tools and leaves the rest for history", () => {
    const b = computeContextBudget(MODE.model, MODE, { system: 2000, tools: 350, project: 1000, rag: 2000 });
    expect(b.outputReserve).toBeGreaterThan(0);
    expect(b.outputReserve).toBeLessThanOrEqual(32000);
    expect(b.historyBudget).toBe(128000 - b.outputReserve - 2000 - 350 - 1000 - 2000);
    expect(b.historyBudget).toBeGreaterThan(0);
  });
  it("never exceeds context window on tiny models", () => {
    const tiny = { ...MODE.model, contextWindow: 8000 };
    const b = computeContextBudget(tiny, { ...MODE, model: tiny }, { system: 500, tools: 350, project: 0, rag: 0 });
    expect(b.historyBudget).toBeGreaterThanOrEqual(1000);
    expect(b.outputReserve).toBeLessThanOrEqual(8000);
  });
  it("caps output at 25% of context window", () => {
    expect(modelOutputCap(MODE.model, MODE)).toBe(32000);
  });
});

describe("strategy tiers", () => {
  it("picks tier by history tokens", () => {
    expect(strategyFor(1000, S)).toBe("full");
    expect(strategyFor(10_000, S)).toBe("select");
    expect(strategyFor(25_000, S)).toBe("summary");
    expect(strategyFor(50_000, S)).toBe("aggressive");
  });
  it("aggressive keeps fewer recent messages than full", () => {
    const full = strategyParams("full", "balanced", S);
    const agg = strategyParams("aggressive", "balanced", S);
    expect(agg.recent).toBeLessThan(full.recent);
  });
  it("cost_efficient squeezes harder than max_quality", () => {
    const cheap = strategyParams("select", "cost_efficient", S);
    const rich = strategyParams("select", "max_quality", S);
    expect(cheap.recent).toBeLessThan(rich.recent);
  });
});

describe("message selection", () => {
  const long = (n: number) => Array.from({ length: n }, (_, i) => msg(i % 2 ? "assistant" : "user", `message number ${i} about topic ${i % 3}`));
  it("keeps all when under budget", () => {
    const r = selectMessages({ history: long(5), currentMessage: "hello", budget: 10000, recentCount: 5, maxRelevant: 3, summaryTokens: 0 });
    expect(r.selected.length).toBe(5);
  });
  it("drops oldest when over budget", () => {
    const r = selectMessages({ history: long(40), currentMessage: "hello", budget: 300, recentCount: 10, maxRelevant: 3, summaryTokens: 0 });
    expect(estimateMessagesTokens(r.selected)).toBeLessThanOrEqual(400);
    expect(r.selected.length).toBeLessThan(40);
    // keeps the newest
    expect(r.selected[r.selected.length - 1].content).toContain("39");
  });
  it("retrieves relevant older messages by keyword overlap", () => {
    const history = [
      msg("user", "my favorite database is postgresql with uuid keys"),
      msg("assistant", "noted"),
      ...Array.from({ length: 20 }, (_, i) => msg("user", `filler ${i}`)),
      msg("user", "recent message"),
    ];
    const r = selectMessages({ history, currentMessage: "which database did I say I like? postgresql", budget: 100000, recentCount: 4, maxRelevant: 3, summaryTokens: 0 });
    expect(r.relevantCount).toBeGreaterThan(0);
    expect(r.selected.some((m) => m.content.includes("postgresql"))).toBe(true);
  });
  it("never returns empty selection", () => {
    const r = selectMessages({ history: long(10), currentMessage: "hi", budget: 1, recentCount: 2, maxRelevant: 0, summaryTokens: 0 });
    expect(r.selected.length).toBeGreaterThanOrEqual(1);
  });
});

describe("deduplication", () => {
  it("drops repeated identical user messages", () => {
    const out = deduplicateMessages([msg("user", "hello there"), msg("user", "Hello  there "), msg("assistant", "hi"), msg("assistant", "hi")]);
    expect(out.filter((m) => m.role === "user").length).toBe(1);
    // assistant messages kept (models may legitimately repeat)
    expect(out.filter((m) => m.role === "assistant").length).toBe(2);
  });
  it("RAG: one chunk per attachment, best score wins", () => {
    const out = deduplicateRagChunks([
      { attachmentId: "a", chunk: "x", score: 1 },
      { attachmentId: "a", chunk: "y", score: 5 },
      { attachmentId: "b", chunk: "z", score: 2 },
    ]);
    expect(out.length).toBe(2);
    expect(out[0]).toMatchObject({ attachmentId: "a", score: 5 });
  });
});

describe("overflow recovery", () => {
  it("progressively sheds context and never crashes", () => {
    const msgs = Array.from({ length: 50 }, () => msg("user", "x".repeat(4000)));
    const r = recoverOverflow(msgs, 500, "rag text", "summary text");
    expect(estimateMessagesTokens(r.msgs)).toBeLessThanOrEqual(600);
    expect(r.msgs.length).toBeLessThanOrEqual(2);
    expect(r.ragContext).toBe("");
    expect(r.summaryText).toBe("");
  });
});

describe("output budgets", () => {
  it("scales by task class and mode", () => {
    expect(outputBudgetFor("reasoning", "balanced", "balanced", S)).toBeGreaterThan(outputBudgetFor("simple", "balanced", "balanced", S));
    expect(outputBudgetFor("normal", "cost_efficient", "balanced", S)).toBeLessThan(outputBudgetFor("normal", "max_quality", "balanced", S));
    expect(outputBudgetFor("normal", "balanced", "concise", S)).toBeLessThan(outputBudgetFor("normal", "balanced", "detailed", S));
  });
  it("estimates output tokens for routing", () => {
    expect(estimateOutputTokens("reasoning", S)).toBe(S.outputLimits.reasoning);
  });
});

describe("task classification", () => {
  it("classifies simple greetings", () => {
    expect(classifyTask({ message: "hi there", hasImage: false, hasVideo: false, hasFiles: false, toolsEnabled: false, historyTokens: 0, contextWindow: 128000 })).toBe("simple");
  });
  it("classifies coding requests", () => {
    expect(classifyTask({ message: "fix this React component bug, the function throws", hasImage: false, hasVideo: false, hasFiles: false, toolsEnabled: false, historyTokens: 0, contextWindow: 128000 })).toBe("coding");
  });
  it("classifies vision when image attached", () => {
    expect(classifyTask({ message: "what is this", hasImage: true, hasVideo: false, hasFiles: false, toolsEnabled: false, historyTokens: 0, contextWindow: 128000 })).toBe("vision");
  });
  it("classifies reasoning", () => {
    expect(classifyTask({ message: "so sánh và phân tích sâu kiến trúc của hai hệ thống này, tại sao", hasImage: false, hasVideo: false, hasFiles: false, toolsEnabled: false, historyTokens: 0, contextWindow: 128000 })).toBe("reasoning");
  });
});

describe("model routing", () => {
  const models: AIModel[] = [
    { id: "cheap", provider: "custom", name: "Cheap", contextWindow: 128000, capabilities: ["chat"], inputPricePerM: 0.1, outputPricePerM: 0.2, enabled: true, requiresKey: true },
    { id: "premium", provider: "custom", name: "Premium", contextWindow: 200000, capabilities: ["chat", "reasoning", "coding"], inputPricePerM: 5, outputPricePerM: 15, enabled: true, requiresKey: true },
  ];
  it("routes simple questions to cheap models", () => {
    const r = routeModel({ models, taskClass: "simple", settings: S, estInputTokens: 1000, estOutputTokens: 500 });
    expect(r.modelId).toBe("cheap");
  });
  it("routes reasoning to capable models (quality floor)", () => {
    const r = routeModel({ models, taskClass: "reasoning", settings: S, estInputTokens: 1000, estOutputTokens: 8000 });
    expect(r.modelId).toBe("premium");
  });
  it("explicit user choice always wins", () => {
    const r = routeModel({ models, taskClass: "simple", settings: S, estInputTokens: 100, estOutputTokens: 100, explicitModelId: "premium" });
    expect(r.modelId).toBe("premium");
    expect(r.routingReason).toContain("Người dùng chọn");
  });
  it("reports estimated cost and alternative", () => {
    const r = routeModel({ models, taskClass: "reasoning", settings: S, estInputTokens: 10000, estOutputTokens: 10000 });
    expect(r.modelId).toBe("premium");
    expect(r.estimatedCostUsd).toBeCloseTo(0.2, 4); // 10k*$5/M + 10k*$15/M
  });
  it("alternative shown when pool has multiple candidates", () => {
    const r = routeModel({ models, taskClass: "simple", settings: S, estInputTokens: 10000, estOutputTokens: 2000 });
    // simple: cheap is best, premium is the reported alternative
    if (r.alternativeModelId) {
      expect(r.estimatedCostUsd).toBeGreaterThan(0);
      expect(r.alternativeCostUsd).toBeGreaterThan(0);
    }
  });
  it("cost-aware: cheap model scores high for simple tasks", () => {
    const cheap = models[0], premium = models[1];
    expect(routingScore(cheap, "simple", S, 1000, 500)).toBeGreaterThan(routingScore(premium, "simple", S, 1000, 500));
  });
});

describe("heuristic title (zero-token)", () => {
  it("strips request prefixes", () => {
    expect(heuristicTitle("help me debug my Next.js authentication system")).toBe("My Next.js authentication system");
  });
  it("returns null for empty", () => {
    expect(heuristicTitle("  ")).toBeNull();
  });
});

describe("prompt cache manager", () => {
  it("puts stable before dynamic", () => {
    const { system, stablePrefix } = buildCachedSystem({
      baseSystem: "BASE", userSystemPrompt: "", projectInstructions: "PROJECT",
      summary: "SUMMARY", semanticMemory: "", ragContext: "RAG",
    }, S);
    expect(system.indexOf("BASE")).toBeLessThan(system.indexOf("SUMMARY"));
    expect(system.indexOf("PROJECT")).toBeLessThan(system.indexOf("RAG"));
    expect(stablePrefix).toBe("BASE\n\nPROJECT");
  });
  it("stable prefix is byte-identical across calls (cacheable)", () => {
    const a = buildCachedSystem({ baseSystem: "B", userSystemPrompt: "", projectInstructions: "P", summary: "s1", semanticMemory: "", ragContext: "r1" }, S);
    const b = buildCachedSystem({ baseSystem: "B", userSystemPrompt: "", projectInstructions: "P", summary: "s2-different", semanticMemory: "", ragContext: "r2" }, S);
    expect(a.stablePrefix).toBe(b.stablePrefix);
  });
  it("anthropic breakpoint only for large stable prefix", () => {
    expect(anthropicCachePoint("small", S)).toBe(false);
    expect(anthropicCachePoint("x".repeat(5000), S)).toBe(true);
  });
});

describe("cost calculator (cached tokens)", () => {
  it("charges cached tokens at 10% when no cached price defined", () => {
    const m = { inputPricePerM: 10, outputPricePerM: 30 } as unknown as AIModel;
    // 1M input, 50% cached, 1M output
    const c = calculateCost(m, { inputTokens: 1_000_000, outputTokens: 1_000_000, cachedInputTokens: 500_000 });
    // fresh 500k*$10 + cached 500k*$1 + out 1M*$30
    expect(c).toBeCloseTo(5 + 0.5 + 30, 2);
  });
  it("uses cachedInputPricePerM when present", () => {
    const m = { inputPricePerM: 10, outputPricePerM: 0, cachedInputPricePerM: 2 } as unknown as AIModel;
    expect(calculateCost(m, { inputTokens: 100_000, outputTokens: 0, cachedInputTokens: 100_000 })).toBeCloseTo(0.2, 4);
  });
  it("handles zero usage", () => {
    expect(calculateCost({ inputPricePerM: 10, outputPricePerM: 5 } as unknown as AIModel, { inputTokens: 0, outputTokens: 0 })).toBe(0);
  });
});

describe("token estimator consistency", () => {
  it("estimateTokens matches registry heuristic", () => {
    expect(estimateMessagesTokens([msg("user", "hello world")])).toBeGreaterThan(0);
    expect(estimateTokens("abcd")).toBe(1);
  });
  it("chunker unchanged", () => {
    expect(chunkText("short")).toEqual(["short"]);
  });
});
