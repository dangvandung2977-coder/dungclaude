// Custom endpoints (OpenAI-compatible): admin có thể thêm NHIỀU endpoint
// (Ollama, vLLM, LM Studio...), mỗi endpoint nhiều model.
// Model id dạng custom:<endpointId>:<apiName> để AI Gateway định tuyến.
// SERVER-ONLY (đọc api_key_enc giải mã) — chỉ dùng từ API routes.
import { getSupabase, uid, nowIso, str, num, bool, nullableStr } from "@/lib/db/supabase";
import { decryptSecret, encryptSecret } from "@/lib/security/security";
import { parseKeyList, formatKeyHint } from "@/lib/ai/providers-config";
import type { AIModel } from "@/types";

export interface CustomEndpoint {
  id: string;
  name: string;
  baseUrl: string;
  enabled: boolean;
  hasKey: boolean;
  keyHint: string | null;
  modelCount: number;
  createdAt: string;
}

export interface CustomModelRow {
  id: string;
  endpointId: string;
  endpointName?: string;
  apiName: string;
  displayName: string;
  contextWindow: number;
  capabilities: string[];
  inputPricePerM: number;
  outputPricePerM: number;
  enabled: boolean;
}

export function isMissingTableError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /schema cache|42P01|does not exist|Could not find the table/i.test(msg);
}

function mapEndpoint(r: Record<string, unknown>, modelCount = 0): CustomEndpoint {
  return {
    id: str(r.id), name: str(r.name), baseUrl: str(r.base_url),
    enabled: bool(r.enabled),
    hasKey: Boolean(nullableStr(r.api_key_enc)),
    keyHint: nullableStr(r.api_key_hint),
    modelCount, createdAt: str(r.created_at),
  };
}

function mapModel(r: Record<string, unknown>): CustomModelRow {  return {
    id: str(r.id), endpointId: str(r.endpoint_id),
    endpointName: nullableStr(r.endpoint_name) ?? undefined,
    apiName: str(r.api_name), displayName: str(r.display_name),
    contextWindow: num(r.context_window, 128000),
    capabilities: str(r.capabilities, "chat").split(",").map((s) => s.trim()).filter(Boolean),
    inputPricePerM: num(r.input_price_per_m), outputPricePerM: num(r.output_price_per_m),
    enabled: bool(r.enabled),
  };
}

export function toAIModel(m: CustomModelRow): AIModel {
  return {
    id: m.id, provider: "custom", name: m.displayName,
    contextWindow: m.contextWindow, capabilities: m.capabilities,
    inputPricePerM: m.inputPricePerM, outputPricePerM: m.outputPricePerM,
    enabled: m.enabled, requiresKey: true,
    description: `Custom · ${m.endpointName ?? m.endpointId} · ${m.apiName}`,
  };
}

// ── Endpoints ──
export async function listEndpoints(): Promise<CustomEndpoint[]> {
  const sb = getSupabase();
  let rows: Array<Record<string, unknown>>;
  try {
    const { data, error } = await sb.from("custom_endpoints").select("*").order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    rows = ((data ?? []) as Array<Record<string, unknown>>);
  } catch (e) {
    if (isMissingTableError(e)) {
      throw Object.assign(new Error("Bảng custom_endpoints chưa có — chạy supabase/migration-custom-endpoints.sql trong SQL Editor."), { status: 503 });
    }
    throw e;
  }
  const out: CustomEndpoint[] = [];
  for (const r of rows) {
    const { count } = await sb.from("custom_models").select("id", { count: "exact", head: true }).eq("endpoint_id", str(r.id));
    out.push(mapEndpoint(r, count ?? 0));
  }
  return out;
}

export async function createEndpoint(input: { name: string; baseUrl: string; apiKey?: string; enabled?: boolean }): Promise<CustomEndpoint> {
  const id = uid("ce");
  const keys = parseKeyList(input.apiKey);
  let enc: string | null = null;
  let hint: string | null = null;
  if (keys.length > 1) {
    enc = encryptSecret(JSON.stringify(keys));
    hint = formatKeyHint(keys);
  } else if (keys.length === 1) {
    enc = encryptSecret(keys[0]);
    hint = formatKeyHint(keys);
  }
  const { data, error } = await getSupabase().from("custom_endpoints").insert({
    id, name: input.name.slice(0, 80), base_url: input.baseUrl.replace(/\/$/, ""),
    api_key_enc: enc,
    api_key_hint: hint,
    enabled: input.enabled ?? true, updated_at: nowIso(),
  }).select("*").single();
  if (error) throw new Error(error.message);
  return mapEndpoint(data as Record<string, unknown>);
}

export async function updateEndpoint(id: string, patch: { name?: string; baseUrl?: string; apiKey?: string; clearKey?: boolean; enabled?: boolean }): Promise<CustomEndpoint> {
  const sb = getSupabase();
  const { data: cur } = await sb.from("custom_endpoints").select("*").eq("id", id).maybeSingle();
  if (!cur) throw Object.assign(new Error("Không tìm thấy endpoint"), { status: 404 });
  const c = cur as Record<string, unknown>;
  let enc = nullableStr(c.api_key_enc);
  let hint = nullableStr(c.api_key_hint);
  if (patch.clearKey) { enc = null; hint = null; }
  else if (typeof patch.apiKey === "string" && patch.apiKey.length > 0) {
    const keys = parseKeyList(patch.apiKey);
    if (keys.length > 1) {
      enc = encryptSecret(JSON.stringify(keys));
      hint = formatKeyHint(keys);
    } else if (keys.length === 1) {
      enc = encryptSecret(keys[0]);
      hint = formatKeyHint(keys);
    } else {
      enc = null;
      hint = null;
    }
  }
  const upd: Record<string, unknown> = { updated_at: nowIso() };
  if (patch.name !== undefined) upd.name = patch.name.slice(0, 80);
  if (patch.baseUrl !== undefined) upd.base_url = patch.baseUrl.replace(/\/$/, "");
  if (patch.enabled !== undefined) upd.enabled = patch.enabled;
  upd.api_key_enc = enc;
  upd.api_key_hint = hint;
  const { data, error } = await sb.from("custom_endpoints").update(upd).eq("id", id).select("*").single();
  if (error) throw new Error(error.message);
  const { count } = await sb.from("custom_models").select("id", { count: "exact", head: true }).eq("endpoint_id", id);
  return mapEndpoint(data as Record<string, unknown>, count ?? 0);
}

export async function deleteEndpoint(id: string): Promise<void> {
  const { error } = await getSupabase().from("custom_endpoints").delete().eq("id", id);
  if (error) throw new Error(error.message);
  // custom_models cascade theo FK.
}

export async function getEndpointCredentials(endpointId: string): Promise<{ baseUrl: string; key: string; keys: string[]; enabled: boolean; name: string } | null> {
  const { data } = await getSupabase().from("custom_endpoints").select("*").eq("id", endpointId).maybeSingle();
  if (!data) return null;
  const r = data as Record<string, unknown>;
  const enc = nullableStr(r.api_key_enc);
  let keys: string[] = [];
  if (enc) {
    try {
      const decrypted = decryptSecret(enc);
      keys = parseKeyList(decrypted);
    } catch { keys = []; }
  }
  const key = keys[0] ?? "";
  return { baseUrl: str(r.base_url), key, keys, enabled: bool(r.enabled), name: str(r.name) };
}

// ── Models ──
function sanitizeApiName(apiName: string): string {
  return apiName.trim().replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80) || "model";
}

export async function listCustomModels(endpointId?: string): Promise<CustomModelRow[]> {
  const sb = getSupabase();
  let q = sb.from("custom_models").select("*, custom_endpoints!inner(name)").order("created_at", { ascending: true });
  if (endpointId) q = q.eq("endpoint_id", endpointId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => {
    const ep = r.custom_endpoints as Record<string, unknown> | undefined;
    return mapModel({ ...r, endpoint_name: ep ? str(ep.name) : nullableStr(r.endpoint_name) });
  });
}

export async function createCustomModel(endpointId: string, input: {
  apiName: string; displayName?: string; contextWindow?: number; capabilities?: string[];
  inputPricePerM?: number; outputPricePerM?: number; enabled?: boolean;
}): Promise<CustomModelRow> {
  const sb = getSupabase();
  const { data: ep } = await sb.from("custom_endpoints").select("id,name").eq("id", endpointId).maybeSingle();
  if (!ep) throw Object.assign(new Error("Không tìm thấy endpoint"), { status: 404 });
  const apiName = input.apiName.trim().slice(0, 120);
  if (!apiName) throw Object.assign(new Error("Thiếu api_name"), { status: 400 });
  // id duy nhất trong endpoint
  const base = `custom:${endpointId}:${sanitizeApiName(apiName)}`;
  let id = base;
  for (let i = 2; i < 100; i++) {
    const { data: exists } = await sb.from("custom_models").select("id").eq("id", id).maybeSingle();
    if (!exists) break;
    id = `${base}_${i}`;
  }
  const { data, error } = await sb.from("custom_models").insert({
    id, endpoint_id: endpointId, api_name: apiName,
    display_name: (input.displayName?.trim() || apiName).slice(0, 80),
    context_window: input.contextWindow || 128000,
    capabilities: (input.capabilities?.length ? input.capabilities : ["chat"]).join(","),
    input_price_per_m: input.inputPricePerM ?? 0,
    output_price_per_m: input.outputPricePerM ?? 0,
    enabled: input.enabled ?? true, updated_at: nowIso(),
  }).select("*").single();
  if (error) throw new Error(error.message);
  return mapModel({ ...(data as Record<string, unknown>), endpoint_name: str((ep as Record<string, unknown>).name) });
}

export async function updateCustomModel(id: string, patch: {
  displayName?: string; contextWindow?: number; capabilities?: string[];
  inputPricePerM?: number; outputPricePerM?: number; enabled?: boolean;
}): Promise<CustomModelRow> {
  const sb = getSupabase();
  const upd: Record<string, unknown> = { updated_at: nowIso() };
  if (patch.displayName !== undefined) upd.display_name = patch.displayName.slice(0, 80);
  if (patch.contextWindow !== undefined) upd.context_window = patch.contextWindow;
  if (patch.capabilities !== undefined) upd.capabilities = patch.capabilities.join(",");
  if (patch.inputPricePerM !== undefined) upd.input_price_per_m = patch.inputPricePerM;
  if (patch.outputPricePerM !== undefined) upd.output_price_per_m = patch.outputPricePerM;
  if (patch.enabled !== undefined) upd.enabled = patch.enabled;
  const { data, error } = await sb.from("custom_models").update(upd).eq("id", id).select("*").single();
  if (error) throw new Error(error.message);
  return mapModel(data as Record<string, unknown>);
}

export async function deleteCustomModel(id: string): Promise<void> {
  const { error } = await getSupabase().from("custom_models").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// Models custom ở dạng AIModel (gộp endpoint name để hiển thị).
export async function getCustomModelsAsAIModels(): Promise<AIModel[]> {
  try {
    return (await listCustomModels()).map(toAIModel);
  } catch (e) {
    if (isMissingTableError(e)) return []; // migration chưa chạy → coi như không có custom model
    throw e;
  }
}

let availableCustomModelsCache: { data: AIModel[]; expiry: number } | null = null;

export function invalidateCustomModelsCache(): void {
  availableCustomModelsCache = null;
}

// Models custom KHẢ DỤNG cho user: model bật + endpoint bật + có key.
export async function getAvailableCustomModels(): Promise<AIModel[]> {
  if (availableCustomModelsCache && Date.now() < availableCustomModelsCache.expiry) {
    return availableCustomModelsCache.data;
  }
  const sb = getSupabase();
  let data: Array<Record<string, unknown>> | null = null;
  try {
    const res = await sb.from("custom_models")
      .select("*, custom_endpoints!inner(name,enabled,api_key_enc)").eq("enabled", true);
    if (res.error) throw new Error(res.error.message);
    data = (res.data ?? []) as Array<Record<string, unknown>>;
  } catch (e) {
    if (isMissingTableError(e)) return [];
    throw e;
  }
  const result = ((data ?? []) as Array<Record<string, unknown>>)
    .filter((r) => {
      const ep = r.custom_endpoints as Record<string, unknown>;
      return bool(ep.enabled) && Boolean(nullableStr(ep.api_key_enc));
    })
    .map((r) => {
      const ep = r.custom_endpoints as Record<string, unknown>;
      return toAIModel(mapModel({ ...r, endpoint_name: str(ep.name) }));
    });
  availableCustomModelsCache = { data: result, expiry: Date.now() + 30_000 };
  return result;
}
