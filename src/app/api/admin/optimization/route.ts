import { requireAdmin } from "@/lib/auth/auth";
import { ok, httpError } from "@/lib/http";
import { getOptimizationSettings, saveOptimizationSettings } from "@/lib/ai/optimization/settings";
import { optimizationSettingsSchema } from "@/types/optimization";
import { usageAnalytics, checkCostBudget } from "@/lib/ai/optimization/usage";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  try {
    await requireAdmin();
    const settings = await getOptimizationSettings();
    const [analytics, budget] = await Promise.all([
      usageAnalytics().catch(() => null),
      checkCostBudget(settings).catch(() => null),
    ]);
    return ok({ settings, analytics, budget });
  } catch (e) { return httpError(e); }
}

export async function PUT(req: Request): Promise<Response> {
  try {
    await requireAdmin();
    const body = await req.json();
    const parsed = optimizationSettingsSchema.parse(body);
    const saved = await saveOptimizationSettings(parsed);
    return ok({ settings: saved });
  } catch (e) { return httpError(e); }
}
