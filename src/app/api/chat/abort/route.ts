import { z } from "zod";
import { requireUser } from "@/lib/auth/auth";
import { ok, httpError } from "@/lib/http";
import { abortActiveTask } from "@/lib/ai/active-tasks";

export const runtime = "nodejs";

const schema = z.object({
  conversationId: z.string().min(1),
});

export async function POST(req: Request): Promise<Response> {
  try {
    const user = await requireUser();
    const body = schema.parse(await req.json());

    const aborted = abortActiveTask(body.conversationId, user.id);
    return ok({ aborted });
  } catch (e) {
    return httpError(e);
  }
}
