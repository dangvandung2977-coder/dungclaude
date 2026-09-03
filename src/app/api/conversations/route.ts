import { z } from "zod";
import { requireUser } from "@/lib/auth/auth";
import { ok, httpError } from "@/lib/http";
import { listConversations, createConversation } from "@/lib/db/repos";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  try {
    const user = await requireUser();
    return ok({ conversations: await listConversations(user.id) });
  } catch (e) { return httpError(e); }
}

const createSchema = z.object({
  title: z.string().max(200).optional(),
  modelId: z.string().max(120).optional(),
  projectId: z.string().nullable().optional(),
});

export async function POST(req: Request): Promise<Response> {
  try {
    const user = await requireUser();
    const body = createSchema.parse(await req.json().catch(() => ({})));
    const conv = await createConversation(user.id, { title: body.title, modelId: body.modelId, projectId: body.projectId });
    return ok({ conversation: conv });
  } catch (e) { return httpError(e); }
}
