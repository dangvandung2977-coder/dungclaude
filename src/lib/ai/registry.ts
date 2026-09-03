import type { AIModel } from "@/types";

// Static catalog. Admin can enable/disable each model and can add custom
// OpenAI-compatible models via the Admin page (stored in model_configs).
export const MODEL_CATALOG: AIModel[] = [
  {
    id: "demo:lumen-echo",
    provider: "demo",
    name: "Lumen Echo",
    contextWindow: 128000,
    capabilities: ["chat", "vision", "video", "tools", "reasoning"],
    inputPricePerM: 0,
    outputPricePerM: 0,
    enabled: false,
    requiresKey: false,
    description: "Internal fallback engine",
  },
];

export function providerOf(modelId: string): string {
  return parseModelRef(modelId).provider;
}
export function modelNameOf(modelId: string): string {
  return parseModelRef(modelId).model;
}

// Custom models có id 3 phần: custom:<endpointId>:<apiName>.
export function parseModelRef(modelId: string): { provider: string; endpointId?: string; model: string } {
  const parts = modelId.split(":");
  if (parts[0] === "custom" && parts.length >= 3) {
    return { provider: "custom", endpointId: parts[1], model: parts.slice(2).join(":") };
  }
  return { provider: parts[0] ?? "demo", model: parts.slice(1).join(":") || modelId };
}

export function estimateTokens(text: string): number {
  return Math.ceil((text ?? "").length / 4);
}

export function calcCost(modelId: string, inputTokens: number, outputTokens: number, extra?: AIModel[]): number {
  const m = MODEL_CATALOG.find((x) => x.id === modelId) ?? extra?.find((x) => x.id === modelId);
  if (!m) return 0;
  return (inputTokens / 1_000_000) * m.inputPricePerM + (outputTokens / 1_000_000) * m.outputPricePerM;
}

// Effective model list = catalog overlaid with admin model_configs + custom models.
export function getEffectiveModels(overrides?: { modelId: string; enabled: boolean }[], customs?: AIModel[]): AIModel[] {
  const off = new Map((overrides ?? []).map((o) => [o.modelId, o.enabled]));
  const base = MODEL_CATALOG.map((m) => (off.has(m.id) ? { ...m, enabled: off.get(m.id)! } : m));
  return [...base, ...(customs ?? [])];
}

export function supports(models: AIModel[], modelId: string, cap: string): boolean {
  const m = models.find((x) => x.id === modelId) ?? MODEL_CATALOG.find((x) => x.id === modelId);
  if (!m) return cap === "chat";
  return m.capabilities.includes(cap);
}
