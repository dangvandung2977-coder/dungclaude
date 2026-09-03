// Optimization settings — single JSON row in optimization_settings table.
// Falls back to defaults when table/row missing so nothing breaks pre-migration.
import { getSupabase, nowIso, str } from "@/lib/db/supabase";
import {
  OPTIMIZATION_SETTINGS_DEFAULTS,
  optimizationSettingsSchema,
  type OptimizationSettings,
} from "@/types/optimization";

let cache: { data: OptimizationSettings; expiry: number } | null = null;

export function invalidateSettingsCache(): void {
  cache = null;
}

export function defaultOptimizationSettings(): OptimizationSettings {
  return optimizationSettingsSchema.parse(OPTIMIZATION_SETTINGS_DEFAULTS);
}

export async function getOptimizationSettings(): Promise<OptimizationSettings> {
  if (cache && Date.now() < cache.expiry) return cache.data;
  let parsed: OptimizationSettings = defaultOptimizationSettings();
  try {
    const { data, error } = await getSupabase()
      .from("optimization_settings").select("value")
      .eq("key", "global").maybeSingle();
    if (!error && data) {
      const raw = (data as { value: unknown }).value;
      const obj = typeof raw === "string" ? JSON.parse(raw) : raw;
      parsed = optimizationSettingsSchema.parse(obj);
    }
  } catch { /* table missing or invalid → defaults */ }
  cache = { data: parsed, expiry: Date.now() + 15_000 };
  return parsed;
}

export async function saveOptimizationSettings(s: OptimizationSettings): Promise<OptimizationSettings> {
  const parsed = optimizationSettingsSchema.parse(s);
  const { error } = await getSupabase().from("optimization_settings").upsert(
    { key: "global", value: JSON.stringify(parsed), updated_at: nowIso() },
    { onConflict: "key" }
  );
  if (error) throw new Error(error.message);
  invalidateSettingsCache();
  return parsed;
}

// Per-user override stored in localStorage-like users table column is
// overkill for 5 users — user mode lives in the request body, validated:
export function parseUserMode(v: unknown): OptimizationSettings["mode"] | undefined {
  return v === "cost_efficient" || v === "balanced" || v === "max_quality" ? v : undefined;
}
