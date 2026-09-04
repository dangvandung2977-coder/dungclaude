import { notFound, redirect } from "next/navigation";
import { readSession } from "@/lib/auth/auth";
import { getConversation, listMessages } from "@/lib/db/repos";
import { loadCachedModels } from "@/lib/ai/models-loader";
import { getActiveTask } from "@/lib/ai/active-tasks";
import { ChatView } from "@/components/chat/ChatView";

export const dynamic = "force-dynamic";

export default async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await readSession();
  if (!session) redirect("/login");
  const { id } = await params;

  // Run DB queries concurrently
  const [conv, messages, models] = await Promise.all([
    getConversation(id, session.id),
    listMessages(id),
    loadCachedModels(),
  ]);

  if (!conv) notFound();

  const msgs = [...(messages ?? [])];
  const activeTask = getActiveTask(id);
  if (activeTask && activeTask.userId === session.id && activeTask.status === "streaming") {
    const activeMsgId = activeTask.messageId || `asst_active_${id}`;
    if (!msgs.some((m) => m.id === activeMsgId)) {
      msgs.push({
        id: activeMsgId,
        conversationId: id,
        role: "assistant",
        content: activeTask.text,
        status: "streaming",
        parts: [{ id: `part_${activeTask.startedAt}`, type: "text", text: activeTask.text }],
        createdAt: new Date(activeTask.startedAt).toISOString(),
        modelId: activeTask.modelId,
      });
    }
  }

  const lastMsgWithModel = [...msgs].reverse().find((m) => m.modelId);
  const lastUsedModelId = lastMsgWithModel?.modelId || conv.modelId || null;

  return (
    <ChatView
      conversationId={id}
      initialMessages={msgs}
      models={models ?? []}
      projectId={conv.projectId}
      conversationTitle={conv.title ?? "Cuộc trò chuyện"}
      pinned={conv.pinned ?? false}
      initialModelId={lastUsedModelId}
    />
  );
}
