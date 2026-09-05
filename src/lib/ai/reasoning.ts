import type { ReasoningEffort } from "@/types";

/**
 * Determines whether a model supports reasoning / thinking depth adjustments.
 */
export function isReasoningModel(modelId: string, capabilities?: string[]): boolean {
  if (capabilities?.includes("reasoning_effort") || capabilities?.includes("reasoning")) return true;
  const lower = (modelId || "").toLowerCase();
  return (
    /(?:^|[:/_ -])(?:o[134]|deepseek-r1|deepseek-reasoner|qwq|glm-5|claude-3-7|astra)/i.test(lower) ||
    lower.includes("glm-5") ||
    lower.includes("thinking") ||
    lower.includes("astra") ||
    lower.includes("reasoning")
  );
}

/**
 * Returns the default reasoning effort for a model.
 * Specially defaults to "high" (max effort) for z-ai/glm-5.3-free as requested.
 */
export function getDefaultReasoningEffort(modelId: string): ReasoningEffort {
  const lower = (modelId || "").toLowerCase();
  if (lower.includes("glm-5.3-free")) {
    return "high";
  }
  return "medium";
}

export const REASONING_EFFORT_OPTIONS: Array<{
  id: ReasoningEffort;
  label: string;
  shortLabel: string;
  description: string;
}> = [
  {
    id: "minimal",
    label: "Nhanh (Minimal)",
    shortLabel: "Nhanh",
    description: "Gần như tắt suy luận — trả kết quả càng nhanh càng tốt",
  },
  {
    id: "low",
    label: "Thấp (Low)",
    shortLabel: "Thấp",
    description: "Suy luận nhanh, tiết kiệm token",
  },
  {
    id: "medium",
    label: "Vừa (Medium)",
    shortLabel: "Vừa",
    description: "Cân bằng giữa tốc độ và chiều sâu suy luận",
  },
  {
    id: "high",
    label: "Cao (High)",
    shortLabel: "Cao",
    description: "Suy luận chuyên sâu cho logic, toán & code",
  },
  {
    id: "max",
    label: "Tối đa (Max)",
    shortLabel: "Tối đa (Max)",
    description: "Mức suy luận cao nhất cho bài toán phức tạp",
  },
];
