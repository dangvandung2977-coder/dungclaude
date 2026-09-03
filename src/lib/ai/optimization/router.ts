// Model Router — classifies the request, then picks the best model by a
// configurable score (quality/speed/cost/capability). Explicit user model
// choice always wins; router only decides "auto".
import { estimateTokens } from "@/lib/ai/registry";
import type { AIModel } from "@/types";
import type { OptimizationSettings, TaskClass, RoutingDecision } from "@/types/optimization";

// ── Request classification (heuristic, zero tokens) ──
export function classifyTask(input: { message: string; hasImage: boolean; hasVideo: boolean; hasFiles: boolean; toolsEnabled: boolean; historyTokens: number; contextWindow: number }): TaskClass {
  const m = input.message.toLowerCase();
  if (input.hasImage || input.hasVideo) return "vision";
  if (input.toolsEnabled && /\b(search|tìm|tra cứu|web)\b/.test(m)) return "tool_use";
  if (input.historyTokens > input.contextWindow * 0.5) return "long_context";
  // Code signals
  if (hasCodeSignals(m)) return "coding";
  // Deep reasoning signals
  if (/\b(phân tích|tại sao|why|so sánh|chứng minh|proof|derive|debug|tối ưu|optimize|refactor|architecture|kiến trúc)\b/.test(m)
    || m.split(/[.?!]/).length > 4 && m.length > 300) return "reasoning";
  // Creative
  if (/\b(viết|write|story|creative|thơ|poem|marketing copy|slogan)\b/.test(m)) return "creative";
  // Simple: short, greeting-ish, factual single question
  if (m.length < 120 && !/[?]{2,}/.test(m)) {
    if (/^(hi|hello|hey|xin chào|chào|yo|thanks|cảm ơn|ok|okie)\b/.test(m.trim())) return "simple";
    if (/\b(là gì|what is|who is|ai là|mấy|hôm nay|giờ|ngày)\b/.test(m) && m.length < 80) return "simple";
  }
  return "normal";
}

function hasCodeSignals(m: string): boolean {
  return m.includes("```")
    || /\b(code|function|hàm|class|component|api|sql|bug|error|compile|typescript|python|javascript|react|next\.?js|node|css|html)\b/.test(m)
    || /def |function |const |class |import |select .* from/i.test(m);
}

// ── Model tiers for scoring ──
// intelligence/speed heuristics from price: higher price = higher quality,
// lower latency-class. Custom models from DB carry real prices.
function modelTiers(m: AIModel): { intelligence: number; speed: number } {
  const inP = m.inputPricePerM;
  // Intelligence 1..10 from input price (log scale): $0.1/M → ~4, $10/M → ~10
  const intelligence = Math.max(1, Math.min(10, Math.round(Math.log10(Math.max(inP, 0.05) / 0.05) * 2.5 + 1)));
  // Speed: cheaper = faster (approximation; custom local models are both cheap AND fast)
  const speed = Math.max(1, Math.min(10, Math.round(11 - Math.min(intelligence, 10))));
  return { intelligence, speed };
}

export function routingScore(model: AIModel, taskClass: TaskClass, s: OptimizationSettings, estInputTokens: number, estOutputTokens: number): number {
  const { intelligence, speed } = modelTiers(model);
  const estCost = (estInputTokens * model.inputPricePerM + estOutputTokens * model.outputPricePerM) / 1_000_000;
  // Cost efficiency: 0..10, $0 → 10, $0.05+ → toward 0 (log scale)
  const costEff = Math.max(0, Math.min(10, 10 - Math.log10(Math.max(estCost, 0.0005) / 0.0005) * (10 / Math.log10(100))));
  const rw = s.routing;
  const wSum = rw.qualityWeight + rw.speedWeight + rw.costWeight + rw.capabilityWeight || 1;
  let score = (rw.qualityWeight * intelligence + rw.speedWeight * speed + rw.costWeight * costEff) / wSum;

  // Capability floor: task needs capabilities the model lacks → hard reject
  // handled by caller (capableModels filter); here small bonuses:
  const caps = model.capabilities ?? [];
  if (taskClass === "coding" && caps.includes("coding")) score += 0.5;
  if (taskClass === "reasoning" && caps.includes("reasoning")) score += 0.5;
  if (taskClass === "long_context" && model.contextWindow >= 200_000) score += 0.5;
  if (taskClass === "vision" && caps.includes("vision")) score += 1;
  if (taskClass === "simple" && speed >= 8) score += 0.3;

  // Quality floor: cheap model for hard task → penalty (never sacrifice
  // quality merely to save money, per spec §43).
  if ((taskClass === "reasoning" || taskClass === "coding" || taskClass === "long_context") && intelligence < 4) score -= 3;
  if (taskClass === "simple" && intelligence >= 9) score -= 1; // don't burn premium on "hi"
  return score;
}

const TASK_CLASS_LABEL: Record<TaskClass, string> = {
  simple: "câu hỏi đơn giản", normal: "trò chuyện thông thường", coding: "lập trình",
  reasoning: "suy luận sâu", long_context: "ngữ cảnh dài", creative: "sáng tạo",
  analysis: "phân tích", agentic: "agentic", tool_use: "dùng tool", vision: "đa phương thức",
};

export function routeModel(opts: {
  models: AIModel[]; // enabled + available only
  taskClass: TaskClass;
  settings: OptimizationSettings;
  estInputTokens: number;
  estOutputTokens: number;
  explicitModelId?: string;
}): RoutingDecision {
  const { models, taskClass, settings, estInputTokens, estOutputTokens } = opts;
  if (opts.explicitModelId && opts.explicitModelId !== "auto") {
    const m = models.find((x) => x.id === opts.explicitModelId);
    if (m) {
      return {
        modelId: m.id, taskClass,
        routingReason: `Người dùng chọn model này`,
        estimatedInputTokens: estInputTokens, estimatedOutputTokens: estOutputTokens,
        estimatedCostUsd: estCost(m, estInputTokens, estOutputTokens),
      };
    }
  }

  // Capability filter for the task
  const capable = models.filter((m) => {
    const caps = m.capabilities ?? [];
    if (taskClass === "vision") return caps.includes("vision") || caps.includes("video");
    return caps.length === 0 || caps.includes("chat") || caps.includes("text") || caps.includes("coding") || caps.includes("reasoning") || caps.includes("tools");
  });
  const pool = capable.length ? capable : models;
  if (!pool.length) {
    return { modelId: "demo:lumen-echo", taskClass, routingReason: "Không có model khả dụng", estimatedInputTokens: estInputTokens, estimatedOutputTokens: estOutputTokens, estimatedCostUsd: 0 };
  }

  // Cost-aware: minimum intelligence needed for the task
  const minIntelligence = taskClass === "reasoning" || taskClass === "coding" ? 5
    : taskClass === "long_context" ? 4 : 1;
  const strong = pool.filter((m) => modelTiers(m).intelligence >= minIntelligence);
  const candidates = strong.length ? strong : pool;

  const scored = candidates
    .map((m) => ({ m, score: routingScore(m, taskClass, settings, estInputTokens, estOutputTokens) }))
    .sort((a, b) => b.score - a.score);
  const best = scored[0];
  const alt = scored[scored.length - 1];

  const label = TASK_CLASS_LABEL[taskClass];
  const reason = taskClass === "simple" || taskClass === "normal"
    ? `${label} → model nhanh, tiết kiệm`
    : taskClass === "reasoning" || taskClass === "coding"
      ? `${label} → cần model mạnh`
      : `${label} → chọn theo capability`;

  return {
    modelId: best.m.id,
    taskClass,
    routingReason: reason,
    estimatedInputTokens: estInputTokens,
    estimatedOutputTokens: estOutputTokens,
    estimatedCostUsd: estCost(best.m, estInputTokens, estOutputTokens),
    alternativeModelId: alt && alt.m.id !== best.m.id ? alt.m.id : undefined,
    alternativeCostUsd: alt && alt.m.id !== best.m.id ? estCost(alt.m, estInputTokens, estOutputTokens) : undefined,
  };
}

export function estCost(m: AIModel, inTok: number, outTok: number): number {
  return (inTok / 1_000_000) * m.inputPricePerM + (outTok / 1_000_000) * m.outputPricePerM;
}

// Estimate output tokens before the request (task-based heuristic).
export function estimateOutputTokens(taskClass: TaskClass, settings: OptimizationSettings): number {
  const o = settings.outputLimits;
  return taskClass === "reasoning" ? o.reasoning : taskClass === "coding" ? o.coding : taskClass === "simple" ? o.simple : o.normal;
}

// Heuristic title from first message — zero tokens (spec §17).
export function heuristicTitle(message: string): string | null {
  const t = message.trim().replace(/\s+/g, " ");
  if (!t) return null;
  // Strip common request prefixes
  const stripped = t
    .replace(/^(help me|hãy|giúp tôi|giúp|làm giúp|can you|could you|please|hãy giúp|i want to|tôi muốn|tôi cần)\s+/i, "")
    .replace(/^(debug|fix|viết|write|create|tạo|build|xây dựng|review|phân tích|analyze)\s+/i, "");
  const words = stripped.split(" ").filter(Boolean).slice(0, 7).join(" ");
  if (!words) return null;
  return words.charAt(0).toUpperCase() + words.slice(1, 60);
}
