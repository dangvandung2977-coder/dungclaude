import { requireAdmin } from "@/lib/auth/auth";
import { ok, fail, httpError } from "@/lib/http";
import { getSupabase } from "@/lib/db/supabase";
import { listConversations, listProjects } from "@/lib/db/repos";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    await requireAdmin();
    const { id } = await params;

    const sb = getSupabase();
    // 1. Get user profile
    const { data: user, error: userErr } = await sb
      .from("users")
      .select("id, email, name, role, created_at")
      .eq("id", id)
      .maybeSingle();

    if (userErr || !user) {
      return fail("Không tìm thấy người dùng", 404);
    }

    // 2. Get conversations
    const conversations = await listConversations(id, true);

    // 3. Get projects
    const projects = await listProjects(id);

    // 4. Get usage summary
    const { data: usageEvents } = await sb
      .from("usage_events")
      .select("input_tokens, output_tokens, cost_usd, created_at, model")
      .eq("user_id", id)
      .order("created_at", { ascending: false })
      .limit(5000);

    const totalInput = (usageEvents ?? []).reduce((sum, e) => sum + (Number(e.input_tokens) || 0), 0);
    const totalOutput = (usageEvents ?? []).reduce((sum, e) => sum + (Number(e.output_tokens) || 0), 0);
    const totalCost = (usageEvents ?? []).reduce((sum, e) => sum + (Number(e.cost_usd) || 0), 0);

    return ok({
      user,
      conversations,
      projects,
      usage: {
        totalTokens: totalInput + totalOutput,
        inputTokens: totalInput,
        outputTokens: totalOutput,
        totalCost,
        eventsCount: (usageEvents ?? []).length,
      },
    });
  } catch (e) {
    return httpError(e);
  }
}
