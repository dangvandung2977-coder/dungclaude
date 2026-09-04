import { getSupabase } from "@/lib/db/supabase";

async function main() {
  const sb = getSupabase();
  const { data: convs, error: cErr } = await sb
    .from("conversations")
    .select("id, title, user_id, created_at, updated_at")
    .order("updated_at", { ascending: false })
    .limit(5);

  console.log("Recent conversations:", convs);

  if (convs && convs.length > 0) {
    for (const c of convs.slice(0, 3)) {
      console.log(`\n--- Messages for conv ${c.id} (${c.title}) ---`);
      const { data: msgs } = await sb
        .from("messages")
        .select("id, role, content, model_id, input_tokens, output_tokens, cost_usd, created_at")
        .eq("conversation_id", c.id)
        .order("created_at", { ascending: true });
      
      console.log(`Total messages: ${msgs?.length}`);
      msgs?.forEach((m, idx) => {
        console.log(`[${idx}] ${m.role} (${m.id}) | model=${m.model_id} | inTok=${m.input_tokens} outTok=${m.output_tokens} cost=${m.cost_usd}`);
        console.log(`    Content: "${m.content?.slice(0, 100).replace(/\n/g, " ")}..."`);
      });
    }
  }

  console.log("\n--- Checking usage / usage_events / optimized_usage table ---");
  const { data: usageEvents, error: uErr } = await sb
    .from("usage_events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(5);
  console.log("usage_events count / sample:", usageEvents?.length, uErr?.message || "");

  const { data: usageLegacy, error: lErr } = await sb
    .from("usage")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(5);
  console.log("usage table count / sample:", usageLegacy?.length, lErr?.message || "");
}

main().catch(console.error);
