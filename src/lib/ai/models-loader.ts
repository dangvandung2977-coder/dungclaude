import { getEffectiveModels } from "@/lib/ai/registry";
import { getModelOverrides, getProviderConfig, getAllModelNotes } from "@/lib/ai/providers-config";
import { getAvailableCustomModels } from "@/lib/ai/custom-endpoints";
import type { AIModel } from "@/types";

let cache: { models: AIModel[]; expiry: number } | null = null;

export function invalidateModelsLoaderCache(): void {
  cache = null;
}

export async function loadCachedModels(): Promise<AIModel[]> {
  if (cache && Date.now() < cache.expiry) {
    return cache.models;
  }

  const [overrides, customs, notes] = await Promise.all([
    getModelOverrides(),
    getAvailableCustomModels().catch(() => []),
    getAllModelNotes().catch(() => ({} as Record<string, string>)),
  ]);

  const all = getEffectiveModels(overrides);
  const models: AIModel[] = [];

  // Kiểm tra đồng thời các provider thay vì lặp tuần tự
  const providerChecks = await Promise.all(
    ["openai", "anthropic", "gemini", "openrouter"].map(async (p) => {
      const cfg = await getProviderConfig(p);
      return { provider: p, ready: Boolean(cfg.enabled && cfg.hasKey) };
    })
  );
  const readyProviders = new Set(providerChecks.filter((x) => x.ready).map((x) => x.provider));

  for (const m of all) {
    if (!m.enabled) continue;
    if (m.id.startsWith("demo:")) continue;
    if (readyProviders.has(m.provider)) {
      models.push({
        ...m,
        description: notes[m.id] || m.description,
      });
    }
  }

  for (const m of customs) {
    if (m.enabled) {
      models.push({
        ...m,
        description: notes[m.id] || m.description,
      });
    }
  }

  const result = models;
  cache = { models: result, expiry: Date.now() + 30_000 };
  return result;
}
