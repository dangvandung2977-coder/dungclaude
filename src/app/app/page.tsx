import { redirect } from "next/navigation";
import { readSession } from "@/lib/auth/auth";
import { loadCachedModels } from "@/lib/ai/models-loader";
import { ChatView } from "@/components/chat/ChatView";

export const dynamic = "force-dynamic";

export default async function NewChatPage() {
  const session = await readSession();
  if (!session) redirect("/login");

  const models = await loadCachedModels();

  // Không tạo conversation trong DB khi chưa chat!
  // Chỉ khi user gửi tin nhắn đầu tiên, hội thoại mới được lưu.
  return (
    <ChatView
      conversationId="new"
      initialMessages={[]}
      models={models}
      conversationTitle="Cuộc trò chuyện mới"
    />
  );
}
