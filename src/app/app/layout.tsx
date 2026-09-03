import { redirect } from "next/navigation";
import { readSession } from "@/lib/auth/auth";
import { listConversations } from "@/lib/db/repos";
import { AppShell } from "@/components/shell/AppShell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await readSession();
  if (!session) redirect("/login");
  const conversations = await listConversations(session.id);
  return <AppShell initialConversations={conversations}>{children}</AppShell>;
}
