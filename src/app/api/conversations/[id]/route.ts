import { z } from "zod";
import { requireUser } from "@/lib/auth/auth";
import { ok, fail, httpError } from "@/lib/http";
import { getConversation, updateConversation, deleteConversation, listMessages } from "@/lib/db/repos";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const conv = await getConversation(id, user.id);
    if (!conv) return fail("Không tìm thấy conversation.", 404);
    return ok({ conversation: conv, messages: await listMessages(id) });
  } catch (e) { return httpError(e); }
}

const patchSchema = z.object({
  title: z.string().max(200).optional(),
  pinned: z.boolean().optional(),
  archived: z.boolean().optional(),
  modelId: z.string().max(120).optional(),
  projectId: z.string().nullable().optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    if (!(await getConversation(id, user.id))) return fail("Không tìm thấy.", 404);
    await updateConversation(id, user.id, patchSchema.parse(await req.json()));
    return ok({ ok: true });
  } catch (e) { return httpError(e); }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    await deleteConversation(id, user.id);
    return ok({ ok: true });
  } catch (e) { return httpError(e); }
}
