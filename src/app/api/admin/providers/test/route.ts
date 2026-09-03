import { z } from "zod";
import { requireAdmin } from "@/lib/auth/auth";
import { ok, fail, httpError } from "@/lib/http";
import { getProviderApiKey, getProviderConfig } from "@/lib/ai/providers-config";

export const runtime = "nodejs";

// POST { provider } — validates credentials server-side (never exposes key).
export async function POST(req: Request): Promise<Response> {
  try {
    await requireAdmin();
    // Custom endpoints test riêng tại /api/admin/endpoints/[id]/test
    const { provider } = z.object({ provider: z.enum(["openai", "anthropic", "gemini", "openrouter"]) }).parse(await req.json());
    const cfg = await getProviderConfig(provider);
    const key = await getProviderApiKey(provider);
    if (!key) return fail(`Chưa có API key cho ${provider}.`, 400);
    try {
      if (provider === "anthropic") {
        const r = await fetch("https://api.anthropic.com/v1/models", { headers: { "x-api-key": key, "anthropic-version": "2023-06-01" } });
        if (!r.ok) return fail(`Key không hợp lệ (HTTP ${r.status}).`, 400);
      } else if (provider === "gemini") {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`);
        if (!r.ok) return fail(`Key không hợp lệ (HTTP ${r.status}).`, 400);
      } else {
        const base = cfg.baseUrl || "https://api.openai.com/v1";
        const r = await fetch(`${base.replace(/\/$/, "")}/models`, { headers: { Authorization: `Bearer ${key}` } });
        if (!r.ok) return fail(`Không kết nối được endpoint (HTTP ${r.status}).`, 400);
      }
      return ok({ ok: true, message: `Kết nối ${provider} thành công.` });
    } catch (e) {
      return fail(`Không kết nối được: ${e instanceof Error ? e.message : String(e)}`, 400);
    }
  } catch (e) { return httpError(e); }
}
