import { getSupabase } from "@/lib/db/supabase";

async function main() {
  const sb = getSupabase();
  const { data, error } = await sb.from("usage_events").select("*").limit(5);
  console.log("usage_events rows:", data?.length, "error:", error?.message);
  if (data && data.length > 0) {
    console.log("First row keys:", Object.keys(data[0]));
    console.log("Sample row:", data[0]);
  }
}

main().catch(console.error);
