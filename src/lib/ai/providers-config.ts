import { getSupabase, nowIso, str, nullableStr, bool } from "@/lib/db/supabase";
import { config, type FunctionKey } from "@/lib/config";
import { decryptSecret, maskKey, encryptSecret } from "@/lib/security/security";
import { parseModelRef } from "@/lib/ai/registry";
import { getEndpointCredentials, getAvailableCustomModels } from "@/lib/ai/custom-endpoints";

export interface ProviderConfig {
  provider: string;
  enabled: boolean;
  baseUrl: string | null;
  hasKey: boolean;
  keyHint: string | null;
  keyHints: string[];
  fromEnv: boolean;
}

type ProviderRow = {
  enabled: boolean; base_url: string | null; api_key_enc: string | null; api_key_hint: string | null;
} | null;

// In-memory cache với TTL 30 giây để triệt tiêu độ trễ mạng lặp lại trên mỗi lượt click
let providerCache: { data: Map<string, ProviderRow>; expiry: number } | null = null;
let modelOverridesCache: { data: { modelId: string; enabled: boolean }[]; expiry: number } | null = null;
let routesCache: { data: Record<string, string>; expiry: number } | null = null;
let modelNotesCache: { data: Record<string, string>; expiry: number } | null = null;

export function invalidateConfigCache(): void {
  providerCache = null;
  modelOverridesCache = null;
  routesCache = null;
  modelNotesCache = null;
}

async function getProviderMap(): Promise<Map<string, ProviderRow>> {
  if (providerCache && Date.now() < providerCache.expiry) {
    return providerCache.data;
  }
  const { data } = await getSupabase().from("provider_configs").select("*");
  const map = new Map<string, ProviderRow>();
  for (const row of ((data ?? []) as Array<Record<string, unknown>>)) {
    map.set(str(row.provider), {
      enabled: bool(row.enabled),
      base_url: nullableStr(row.base_url),
      api_key_enc: nullableStr(row.api_key_enc),
      api_key_hint: nullableStr(row.api_key_hint),
    });
  }
  providerCache = { data: map, expiry: Date.now() + 30_000 };
  return map;
}

async function readRow(provider: string): Promise<ProviderRow> {
  const map = await getProviderMap();
  return map.get(provider) ?? null;
}

function envEntry(provider: string): { key: string; baseUrl?: string } {
  return (config.providers as Record<string, { key: string; baseUrl?: string }>)[provider] ?? { key: "" };
}

// Priority: DB (admin-configured) > environment variables.
export async function getProviderConfig(provider: string): Promise<ProviderConfig> {
  const row = await readRow(provider);
  const env = envEntry(provider);
  const keys = await getProviderApiKeys(provider);
  const keyHints = keys.map((k) => maskKey(k));
  if (row) {
    return {
      provider,
      enabled: row.enabled,
      baseUrl: row.base_url ?? env.baseUrl ?? null,
      hasKey: keys.length > 0,
      keyHint: row.api_key_hint ?? (keys[0] ? maskKey(keys[0]) : null),
      keyHints,
      fromEnv: !row.api_key_enc && Boolean(env.key),
    };
  }
  return {
    provider,
    enabled: provider === "demo" ? true : Boolean(env.key),
    baseUrl: env.baseUrl ?? null,
    hasKey: keys.length > 0,
    keyHint: keys[0] ? maskKey(keys[0]) : null,
    keyHints,
    fromEnv: Boolean(env.key),
  };
}

export function parseKeyList(raw: string | string[] | null | undefined): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return Array.from(new Set(raw.map((k) => k.trim()).filter(Boolean)));
  }
  const trimmed = raw.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return Array.from(new Set(parsed.map((k) => String(k).trim()).filter(Boolean)));
      }
    } catch { /* not json */ }
  }
  const parts = trimmed.split(/[\r\n,]+/);
  return Array.from(new Set(parts.map((k) => k.trim()).filter(Boolean)));
}

export function formatKeyHint(keys: string[]): string | null {
  if (!keys.length) return null;
  if (keys.length === 1) return maskKey(keys[0]);
  return `${maskKey(keys[0])} (+${keys.length - 1} key${keys.length > 2 ? "s" : ""})`;
}

export async function getProviderApiKeys(provider: string): Promise<string[]> {
  const row = await readRow(provider);
  if (row?.api_key_enc) {
    try {
      const decrypted = decryptSecret(row.api_key_enc);
      const parsed = parseKeyList(decrypted);
      if (parsed.length > 0) return parsed;
    } catch { /* decrypt failed */ }
  }
  const envRaw = envEntry(provider).key ?? "";
  return parseKeyList(envRaw);
}

export async function getProviderApiKey(provider: string): Promise<string> {
  const keys = await getProviderApiKeys(provider);
  return keys[0] ?? "";
}

export async function listProviderConfigs(): Promise<ProviderConfig[]> {
  // Custom endpoints quản lý riêng tại /admin/endpoints (hỗ trợ nhiều endpoint).
  return Promise.all(["openai", "anthropic", "gemini", "openrouter", "demo"].map(getProviderConfig));
}

export async function setProviderConfig(
  provider: string,
  patch: {
    enabled?: boolean;
    baseUrl?: string | null;
    apiKey?: string | null | undefined;
    addKey?: string;
    removeKeyIndex?: number;
    clearKey?: boolean;
  }
): Promise<ProviderConfig> {
  invalidateConfigCache();
  const cur = await readRow(provider);
  let currentKeys = await getProviderApiKeys(provider);

  if (patch.clearKey) {
    currentKeys = [];
  } else if (typeof patch.removeKeyIndex === "number" && patch.removeKeyIndex >= 0 && patch.removeKeyIndex < currentKeys.length) {
    currentKeys.splice(patch.removeKeyIndex, 1);
  } else if (typeof patch.addKey === "string" && patch.addKey.trim().length > 0) {
    const toAdd = parseKeyList(patch.addKey);
    currentKeys = Array.from(new Set([...currentKeys, ...toAdd]));
  } else if (typeof patch.apiKey === "string") {
    currentKeys = parseKeyList(patch.apiKey);
  }

  let enc: string | null = null;
  let hint: string | null = null;
  if (currentKeys.length > 1) {
    enc = encryptSecret(JSON.stringify(currentKeys));
    hint = formatKeyHint(currentKeys);
  } else if (currentKeys.length === 1) {
    enc = encryptSecret(currentKeys[0]);
    hint = formatKeyHint(currentKeys);
  }

  const enabled = patch.enabled ?? cur?.enabled ?? false;
  const baseUrl = patch.baseUrl !== undefined ? patch.baseUrl : (cur?.base_url ?? null);
  const { error } = await getSupabase().from("provider_configs").upsert(
    { provider, enabled, base_url: baseUrl, api_key_enc: enc, api_key_hint: hint, updated_at: nowIso() },
    { onConflict: "provider" }
  );
  if (error) throw new Error(error.message);
  invalidateConfigCache();
  return getProviderConfig(provider);
}

// ── Model enable/disable ──
export async function getModelOverrides(): Promise<{ modelId: string; enabled: boolean }[]> {
  if (modelOverridesCache && Date.now() < modelOverridesCache.expiry) {
    return modelOverridesCache.data;
  }
  const { data } = await getSupabase().from("model_configs").select("model_id,enabled");
  const list = (((data ?? []) as Array<Record<string, unknown>>)).map((r) => ({ modelId: str(r.model_id), enabled: bool(r.enabled) }));
  modelOverridesCache = { data: list, expiry: Date.now() + 30_000 };
  return list;
}

export async function setModelEnabled(modelId: string, provider: string, enabled: boolean): Promise<void> {
  invalidateConfigCache();
  const { error } = await getSupabase().from("model_configs").upsert(
    { model_id: modelId, provider, enabled, updated_at: nowIso() },
    { onConflict: "model_id" }
  );
  if (error) throw new Error(error.message);
  invalidateConfigCache();
}

// ── Per-function routing ──
export async function getRoute(functionKey: FunctionKey): Promise<string> {
  const routes = await getAllRoutes();
  return routes[functionKey] ?? config.ai.defaultModel;
}

export async function getAllRoutes(): Promise<Record<string, string>> {
  if (routesCache && Date.now() < routesCache.expiry) {
    return routesCache.data;
  }
  const { data } = await getSupabase().from("model_routes").select("function_key,model_id");
  const result = Object.fromEntries((((data ?? []) as Array<Record<string, unknown>>)).map((r) => [str(r.function_key), str(r.model_id)]));
  routesCache = { data: result, expiry: Date.now() + 30_000 };
  return result;
}

export async function setRoute(functionKey: FunctionKey, modelId: string): Promise<void> {
  invalidateConfigCache();
  const { error } = await getSupabase().from("model_routes").upsert(
    { function_key: functionKey, model_id: modelId, updated_at: nowIso() },
    { onConflict: "function_key" }
  );
  if (error) throw new Error(error.message);
  invalidateConfigCache();
}

// Choose model for a request: explicit user choice wins; otherwise route by
// content (video > vision) so admin's per-function config is honored.
export async function resolveModel(opts: { explicit?: string; hasVideo: boolean; hasImage: boolean }): Promise<{ modelId: string; functionKey: FunctionKey }> {
  let target = opts.explicit && opts.explicit !== "auto" ? opts.explicit : null;
  const functionKey: FunctionKey = opts.hasVideo ? "video" : opts.hasImage ? "vision" : "chat_default";

  if (!target) {
    target = await getRoute(functionKey);
  }

  // Validate target model has key/endpoint
  const ref = parseModelRef(target);
  let isValid = false;
  if (ref.provider === "custom" && ref.endpointId) {
    const cred = await getEndpointCredentials(ref.endpointId).catch(() => null);
    if (cred && cred.enabled && cred.key) isValid = true;
  } else if (ref.provider !== "demo") {
    const cfg = await getProviderConfig(ref.provider).catch(() => null);
    if (cfg && cfg.enabled && cfg.hasKey) isValid = true;
  }

  // If the target is not valid or was demo, try to find the first valid custom/provider model
  if (!isValid) {
    const customs = await getAvailableCustomModels().catch(() => []);
    if (customs.length > 0) {
      target = customs[0].id;
    } else {
      const geminiCfg = await getProviderConfig("gemini").catch(() => null);
      if (geminiCfg?.enabled && geminiCfg?.hasKey) {
        target = "gemini:gemini-2.5-flash";
      } else {
        target = "demo:lumen-echo";
      }
    }
  }

  return { modelId: target, functionKey };
}

// ── Model Notes (Admin remarks/guides per model) ──
export async function getAllModelNotes(): Promise<Record<string, string>> {
  if (modelNotesCache && Date.now() < modelNotesCache.expiry) {
    return modelNotesCache.data;
  }
  const { data } = await getSupabase()
    .from("optimization_settings")
    .select("value")
    .eq("key", "model_notes")
    .maybeSingle();

  const notes = (data?.value && typeof data.value === "object" ? data.value : {}) as Record<string, string>;
  modelNotesCache = { data: notes, expiry: Date.now() + 30_000 };
  return notes;
}

export async function setModelNote(modelId: string, note: string): Promise<void> {
  invalidateConfigCache();
  const current = await getAllModelNotes();
  const updated = { ...current, [modelId]: note.trim() };
  const { error } = await getSupabase().from("optimization_settings").upsert({
    key: "model_notes",
    value: updated,
    updated_at: nowIso(),
  });
  if (error) throw new Error(error.message);
  invalidateConfigCache();
}
