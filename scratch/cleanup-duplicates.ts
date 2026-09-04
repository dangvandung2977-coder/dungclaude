import { getSupabase } from "@/lib/db/supabase";

async function main() {
  const sb = getSupabase();
  const { data: msgs, error } = await sb
    .from("messages")
    .select("id, conversation_id, role, content, input_tokens, output_tokens, created_at")
    .order("conversation_id", { ascending: true })
    .order("created_at", { ascending: true });

  if (error || !msgs) {
    console.error("Error fetching messages:", error);
    return;
  }

  console.log(`Total messages in DB: ${msgs.length}`);
  const toDelete: string[] = [];

  for (let i = 0; i < msgs.length - 1; i++) {
    const cur = msgs[i];
    const next = msgs[i + 1];

    if (
      cur.conversation_id === next.conversation_id &&
      cur.role === "assistant" &&
      next.role === "assistant" &&
      cur.content === next.content
    ) {
      // Duplicate found! Keep the one with token stats or the earlier one
      const deleteId = (next.input_tokens === 0 && next.output_tokens === 0 && (cur.input_tokens > 0 || cur.output_tokens > 0))
        ? next.id
        : next.id;
      toDelete.push(deleteId);
      console.log(`Duplicate pair in ${cur.conversation_id}: keeping ${cur.id} (in=${cur.input_tokens}), deleting ${deleteId} (in=${next.input_tokens})`);
    }
  }

  console.log(`Found ${toDelete.length} duplicate assistant messages to clean up.`);
  if (toDelete.length > 0) {
    const { error: delErr } = await sb.from("messages").delete().in("id", toDelete);
    if (delErr) {
      console.error("Failed to delete duplicates:", delErr);
    } else {
      console.log("Successfully cleaned up all duplicate messages!");
    }
  }
}

main().catch(console.error);
