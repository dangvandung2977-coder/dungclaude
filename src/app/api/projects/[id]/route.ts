import { z } from "zod";
import { requireUser } from "@/lib/auth/auth";
import { ok, fail, httpError } from "@/lib/http";
import { updateProject, deleteProject, getProject, listConversationsByProject, listAttachmentsByProject } from "@/lib/db/repos";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const prj = await getProject(id, user.id);
    if (!prj) return fail("Không tìm thấy project.", 404);
    const [convs, files] = await Promise.all([
      listConversationsByProject(id, user.id),
      listAttachmentsByProject(id, user.id),
    ]);
    return ok({
      project: { id: prj.id, name: prj.name, description: prj.description, instructions: prj.instructions, createdAt: prj.createdAt, updatedAt: prj.updatedAt },
      conversations: convs.map((c) => ({ id: c.id, title: c.title, updated_at: c.updatedAt })),
      files: files.map((f) => ({ id: f.id, file_name: f.fileName, mime_type: f.mimeType, size_bytes: f.sizeBytes, created_at: f.createdAt })),
    });
  } catch (e) { return httpError(e); }
}

const patch = z.object({ name: z.string().max(120).optional(), description: z.string().max(2000).nullable().optional(), instructions: z.string().max(8000).nullable().optional() });

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    await updateProject(id, user.id, patch.parse(await req.json()) as never);
    return ok({ ok: true });
  } catch (e) { return httpError(e); }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    await deleteProject(id, user.id);
    return ok({ ok: true });
  } catch (e) { return httpError(e); }
}
