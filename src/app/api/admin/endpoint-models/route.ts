import { z } from "zod";
import { requireAdmin } from "@/lib/auth/auth";
import { ok, fail, httpError } from "@/lib/http";
import { createCustomModel, updateCustomModel, deleteCustomModel, listCustomModels } from "@/lib/ai/custom-endpoints";

export const runtime = "nodejs";

const CAPS = ["chat", "vision", "video", "reasoning", "tools"] as const;

const createSchema = z.object({
  endpointId: z.string().min(1),
  apiName: z.string().min(1, "Thiếu tên model phía server (api_name)").max(120),
  displayName: z.string().max(80).optional(),
  contextWindow: z.number().int().min(1000).max(10000000).optional(),
  capabilities: z.array(z.enum(CAPS)).optional(),
  inputPricePerM: z.number().min(0).max(10000).optional(),
  outputPricePerM: z.number().min(0).max(10000).optional(),
  enabled: z.boolean().optional(),
});

export async function GET(req: Request): Promise<Response> {
  try {
    await requireAdmin();
    const endpointId = new URL(req.url).searchParams.get("endpointId") ?? undefined;
    return ok({ models: await listCustomModels(endpointId) });
  } catch (e) { return httpError(e); }
}

export async function POST(req: Request): Promise<Response> {
  try {
    await requireAdmin();
    const body = createSchema.parse(await req.json());
    const model = await createCustomModel(body.endpointId, body);
    return ok({ model });
  } catch (e) { return httpError(e); }
}

const updateSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().max(80).optional(),
  contextWindow: z.number().int().min(1000).max(10000000).optional(),
  capabilities: z.array(z.enum(CAPS)).optional(),
  inputPricePerM: z.number().min(0).max(10000).optional(),
  outputPricePerM: z.number().min(0).max(10000).optional(),
  enabled: z.boolean().optional(),
});

export async function PUT(req: Request): Promise<Response> {
  try {
    await requireAdmin();
    const body = updateSchema.parse(await req.json());
    const { id, ...patch } = body;
    return ok({ model: await updateCustomModel(id, patch) });
  } catch (e) { return httpError(e); }
}

export async function DELETE(req: Request): Promise<Response> {
  try {
    await requireAdmin();
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return fail("Thiếu id.", 400);
    await deleteCustomModel(id);
    return ok({ ok: true });
  } catch (e) { return httpError(e); }
}
