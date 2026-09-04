import { getSupabase } from "@/lib/db/supabase";

async function main() {
  const sb = getSupabase();
  const userId = "user_mtm519aayds4icy7";

  // Run the same query as api/admin/users/[id]/route.ts
  const { data: usageEvents, error: uErr } = await sb
    .from("usage_events")
    .select("input_tokens, output_tokens, cost_usd, created_at, model")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(5000);

  console.log("usageEvents count:", usageEvents?.length, "error:", uErr);
  const totalInput = (usageEvents ?? []).reduce((sum, e) => sum + (Number(e.input_tokens) || 0), 0);
  const totalOutput = (usageEvents ?? []).reduce((sum, e) => sum + (Number(e.output_tokens) || 0), 0);
  const totalCost = (usageEvents ?? []).reduce((sum, e) => sum + (Number(e.cost_usd) || 0), 0);

  console.log({
    totalTokens: totalInput + totalOutput,
    inputTokens: totalInput,
    outputTokens: totalOutput,
    totalCost,
    eventsCount: (usageEvents ?? []).length,
  });
}

main().catch(console.error);
