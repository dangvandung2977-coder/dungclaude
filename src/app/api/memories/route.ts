import { z } from "zod";
import { requireUser } from "@/lib/auth/auth";
import { ok, fail } from "@/lib/http";
import { listMemories, createMemory } from "@/lib/db/memory-repo";
import { getEmbedding } from "@/lib/ai/memory/embeddings";
import type { MemoryScope, MemoryCategory } from "@/types/memory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  scope: z.enum(["global", "project", "conversation"]).default("global"),
  category: z.enum(["preference", "technical", "architecture", "constraint", "fact", "decision", "rule", "general"]).default("general"),
  key: z.string().min(1).max(100),
  content: z.string().min(1).max(5000),
  importance: z.number().min(0).max(1).default(0.7),
  confidence: z.number().min(0).max(1).default(1.0),
  projectId: z.string().nullable().optional(),
});

export async function GET(req: Request): Promise<Response> {
  const user = await requireUser().catch(() => null);
  if (!user) return fail("Chưa đăng nhập", 401);

  const url = new URL(req.url);
  const projectId = url.searchParams.get("projectId") || undefined;
  const scope = (url.searchParams.get("scope") as MemoryScope) || undefined;
  const status = (url.searchParams.get("status") as "current" | "superseded" | "archived") || "current";

  try {
    const memories = await listMemories({
      userId: user.id,
      projectId,
      scope,
      status,
      limit: 100,
    });
    return ok({ memories });
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Lỗi tải bộ nhớ", 500);
  }
}

export async function POST(req: Request): Promise<Response> {
  const user = await requireUser().catch(() => null);
  if (!user) return fail("Chưa đăng nhập", 401);

  let body: z.infer<typeof createSchema>;
  try {
    body = createSchema.parse(await req.json());
  } catch {
    return fail("Dữ liệu memory không hợp lệ", 400);
  }

  try {
    const embedding = await getEmbedding(body.content).catch(() => null);
    const memory = await createMemory({
      userId: user.id,
      projectId: body.scope === "project" ? (body.projectId ?? null) : null,
      scope: body.scope as MemoryScope,
      category: body.category as MemoryCategory,
      key: body.key,
      content: body.content,
      importance: body.importance,
      confidence: body.confidence,
      status: "current",
      embedding,
    });

    return ok({ memory });
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Lỗi tạo memory", 500);
  }
}
