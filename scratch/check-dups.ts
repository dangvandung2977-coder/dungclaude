import { getSupabase } from "@/lib/db/supabase";

async function main() {
  const sb = getSupabase();
  const { data: msgs } = await sb
    .from("messages")
    .select("*")
    .in("id", ["msg_mtm5elcsunf3yy4s", "msg_mtm5emfwhvdy5zto"])
    .order("created_at", { ascending: true });

  console.log("Detailed comparison of the two duplicate messages:");
  console.dir(msgs, { depth: null });
}

main().catch(console.error);
