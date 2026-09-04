import { z } from "zod";
import { requireAdmin } from "@/lib/auth/auth";
import { ok, httpError } from "@/lib/http";
import { updateEndpoint, deleteEndpoint } from "@/lib/ai/custom-endpoints";

export const runtime = "nodejs";

const schema = z.object({
  name: z.string().min(1).max(80).optional(),
  baseUrl: z.string().max(300).optional(),
  apiKey: z.string().max(20000).optional(),
  addKey: z.string().max(10000).optional(),
  removeKeyIndex: z.number().int().min(0).optional(),
  clearKey: z.boolean().optional(),
  enabled: z.boolean().optional(),
});

function validHttpUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch { return false; }
}

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    await requireAdmin();
    const { id } = await ctx.params;
    const body = schema.parse(await req.json());
    if (body.baseUrl !== undefined && !validHttpUrl(body.baseUrl)) {
      return ok({ error: "Base URL phải http(s)://…" }, { status: 400 });
    }
    const endpoint = await updateEndpoint(id, body);
    return ok({ endpoint });
  } catch (e) { return httpError(e); }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    await requireAdmin();
    const { id } = await ctx.params;
    await deleteEndpoint(id);
    return ok({ ok: true });
  } catch (e) { return httpError(e); }
}
