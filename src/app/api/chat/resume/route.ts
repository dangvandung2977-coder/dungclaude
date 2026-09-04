import { requireUser } from "@/lib/auth/auth";
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
      return new Response(JSON.stringify({ error: "Thiếu conversationId" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const conv = await getConversation(conversationId, user.id);
    if (!conv) {
      return new Response(JSON.stringify({ error: "Không tìm thấy conversation" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const encoder = new TextEncoder();
    const task = getActiveTask(conversationId);

    // If no active in-memory task, retrieve latest message from DB
    if (!task || task.userId !== user.id) {
      const messages = await listMessages(conversationId, 2);
      const lastMsg = messages[messages.length - 1];

      if (lastMsg?.role === "assistant") {
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(
              encoder.encode(
                `event: init\ndata: ${JSON.stringify({ text: lastMsg.content, modelId: lastMsg.modelId, messageId: lastMsg.id })}\n\n`
              )
            );
            controller.enqueue(
              encoder.encode(
                `event: done\ndata: ${JSON.stringify({ messageId: lastMsg.id, latencyMs: lastMsg.latencyMs, text: lastMsg.content })}\n\n`
              )
            );
            controller.close();
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no",
          },
        });
      }

      return new Response(JSON.stringify({ active: false, status: "idle" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Task is already completed in memory
    if (task.status === "completed") {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              `event: init\ndata: ${JSON.stringify({ text: task.text, modelId: task.modelId, messageId: task.messageId })}\n\n`
            )
          );
          controller.enqueue(
            encoder.encode(
              `event: done\ndata: ${JSON.stringify({ messageId: task.messageId, latencyMs: task.latencyMs, text: task.text })}\n\n`
            )
          );
          controller.close();
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        },
      });
    }

    // Task is actively streaming: pipe real-time events to the reconnected client
    let cleanupListeners: (() => void) | null = null;
    let pingInterval: NodeJS.Timeout | null = null;

    const stream = new ReadableStream({
      start(controller) {
        // Send initial state with all text generated so far
        controller.enqueue(
          encoder.encode(
            `event: init\ndata: ${JSON.stringify({ text: task.text, modelId: task.modelId, messageId: task.messageId })}\n\n`
          )
        );

        const onToken = (delta: string) => {
          try {
            controller.enqueue(encoder.encode(`event: token\ndata: ${JSON.stringify({ delta })}\n\n`));
          } catch {
            // client disconnected
          }
        };

        const onDone = (payload: { messageId?: string; latencyMs?: number; text?: string }) => {
          try {
            controller.enqueue(encoder.encode(`event: done\ndata: ${JSON.stringify(payload)}\n\n`));
            controller.close();
          } catch {
            // ignore
          }
        };

        const onError = (payload: { error?: string }) => {
          try {
            controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify(payload)}\n\n`));
            controller.close();
          } catch {
            // ignore
          }
        };

        const onCancelled = (payload: { text?: string }) => {
          try {
            controller.enqueue(encoder.encode(`event: cancelled\ndata: ${JSON.stringify(payload)}\n\n`));
            controller.close();
          } catch {
            // ignore
          }
        };

        task.emitter.on("token", onToken);
        task.emitter.on("done", onDone);
        task.emitter.on("error", onError);
        task.emitter.on("cancelled", onCancelled);

        cleanupListeners = () => {
          task.emitter.off("token", onToken);
          task.emitter.off("done", onDone);
          task.emitter.off("error", onError);
          task.emitter.off("cancelled", onCancelled);
        };

        // Keep-alive ping every 15s to keep proxy/Cloudflare connection open
        pingInterval = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(": ping\n\n"));
          } catch {
            if (pingInterval) clearInterval(pingInterval);
          }
        }, 15000);
      },
      cancel() {
        if (pingInterval) clearInterval(pingInterval);
        cleanupListeners?.();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (e) {
    console.error("[Resume Stream] Error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Internal Error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
