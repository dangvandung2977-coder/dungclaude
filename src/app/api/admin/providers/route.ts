import { z } from "zod";
import { requireAdmin } from "@/lib/auth/auth";
import { ok, httpError } from "@/lib/http";
import { listProviderConfigs, setProviderConfig } from "@/lib/ai/providers-config";

export const runtime = "nodejs";

// GET: list all provider sources (keys masked). Admin only.
export async function GET(): Promise<Response> {
  try {
    await requireAdmin();
    return ok({ providers: await listProviderConfigs() });
  } catch (e) { return httpError(e); }
}

const schema = z.object({
  provider: z.enum(["openai", "anthropic", "gemini", "openrouter"]),
  enabled: z.boolean().optional(),
  baseUrl: z.string().max(300).nullable().optional(),
  apiKey: z.string().max(500).optional(), // empty/omitted = keep existing
  clearKey: z.boolean().optional(),
});

export async function PUT(req: Request): Promise<Response> {
  try {
    await requireAdmin();
    const body = schema.parse(await req.json());
    const updated = await setProviderConfig(body.provider, {
      enabled: body.enabled,
      baseUrl: body.baseUrl === null ? null : body.baseUrl,
      apiKey: body.apiKey || undefined,
      clearKey: body.clearKey,
    });
    return ok({ provider: updated });
  } catch (e) { return httpError(e); }
}
