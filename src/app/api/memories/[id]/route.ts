import { z } from "zod";
import { requireUser } from "@/lib/auth/auth";
import { ok, fail } from "@/lib/http";
import { getMemory, updateMemory, deleteMemory } from "@/lib/db/memory-repo";
import type { MemoryCategory, MemoryStatus, MemoryScope } from "@/types/memory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  content: z.string().min(1).max(5000).optional(),
  category: z.enum(["preference", "technical", "architecture", "constraint", "fact", "decision", "rule", "general"]).optional(),
  importance: z.number().min(0).max(1).optional(),
  status: z.enum(["current", "superseded", "archived"]).optional(),
  scope: z.enum(["global", "project", "conversation"]).optional(),
  projectId: z.string().nullable().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const user = await requireUser().catch(() => null);
  if (!user) return fail("Chưa đăng nhập", 401);

  const { id } = await params;
  const existing = await getMemory(id, user.id);
  if (!existing) return fail("Không tìm thấy memory hoặc bạn không có quyền", 404);

  let body: z.infer<typeof patchSchema>;
  try {
    body = patchSchema.parse(await req.json());
  } catch {
    return fail("Dữ liệu cập nhật không hợp lệ", 400);
  }

  try {
    const patch: Record<string, unknown> = {};
    if (body.content !== undefined) patch.content = body.content;
    if (body.category !== undefined) patch.category = body.category as MemoryCategory;
    if (body.importance !== undefined) patch.importance = body.importance;
    if (body.status !== undefined) patch.status = body.status as MemoryStatus;
    if (body.scope !== undefined) patch.scope = body.scope as MemoryScope;
    if (body.projectId !== undefined) patch.projectId = body.projectId;

    const memory = await updateMemory(id, user.id, patch);
    return ok({ memory });
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Lỗi cập nhật memory", 500);
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const user = await requireUser().catch(() => null);
  if (!user) return fail("Chưa đăng nhập", 401);

  const { id } = await params;
  const existing = await getMemory(id, user.id);
  if (!existing) return fail("Không tìm thấy memory hoặc bạn không có quyền", 404);

  try {
    await deleteMemory(id, user.id);
    return ok({ ok: true });
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Lỗi xóa memory", 500);
  }
}
