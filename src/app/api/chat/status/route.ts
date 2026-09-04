import { requireUser } from "@/lib/auth/auth";
import { ok, fail, httpError } from "@/lib/http";
import { getActiveTask } from "@/lib/ai/active-tasks";
import { listMessages, getConversation } from "@/lib/db/repos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  try {
    const user = await requireUser();
    const { searchParams } = new URL(req.url);
    const conversationId = searchParams.get("conversationId");

    if (!conversationId) {
      return fail("Thiếu conversationId", 400);
    }

    // Verify conversation access
    const conv = await getConversation(conversationId, user.id);
    if (!conv) {
      return fail("Không tìm thấy conversation", 404);
    }

    const task = getActiveTask(conversationId);
    if (task && task.userId === user.id) {
      return ok({
        active: task.status === "streaming",
        status: task.status,
        text: task.text,
        messageId: task.messageId,
        modelId: task.modelId,
        latencyMs: task.latencyMs,
        error: task.error,
      });
    }

    // If no active in-memory task, retrieve latest message from DB
    const messages = await listMessages(conversationId, 2);
    const lastMsg = messages[messages.length - 1] ?? null;

    return ok({
      active: false,
      status: lastMsg?.role === "assistant" ? "completed" : "idle",
      latestMessage: lastMsg,
    });
  } catch (e) {
    return httpError(e);
  }
}
