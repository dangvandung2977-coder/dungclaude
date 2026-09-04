import { getSupabase } from "@/lib/db/supabase";

async function run() {
  const sb = getSupabase();
  const { data } = await sb
    .from("messages")
    .select("id, conversation_id, role, content, model_id, created_at")
    .order("created_at", { ascending: false })
    .limit(10);
  console.log(JSON.stringify(data, null, 2));
}

run().catch(console.error);
