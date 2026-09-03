import { requireAdmin } from "@/lib/auth/auth";
import { ok, fail, httpError } from "@/lib/http";
import { getEndpointCredentials } from "@/lib/ai/custom-endpoints";

export const runtime = "nodejs";

// POST: kiểm tra kết nối endpoint (GET /models, cần endpoint OpenAI-compatible).
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    await requireAdmin();
    const { id } = await ctx.params;
    const cred = await getEndpointCredentials(id);
    if (!cred) return fail("Không tìm thấy endpoint.", 404);
    if (!cred.key) return fail("Endpoint chưa có API key.", 400);
    try {
      const r = await fetch(`${cred.baseUrl.replace(/\/$/, "")}/models`, {
        headers: { Authorization: `Bearer ${cred.key}` },
        signal: AbortSignal.timeout(15000),
      });
      if (!r.ok) return fail(`Không kết nối được (HTTP ${r.status}). Endpoint cần hỗ trợ GET /models chuẩn OpenAI.`, 400);
      const j = await r.json().catch(() => ({}));
      const n = Array.isArray(j.data) ? j.data.length : 0;
      return ok({ ok: true, message: `Kết nối thành công${n ? ` (${n} model phía server)` : ""}.` });
    } catch (e) {
      return fail(`Không kết nối được: ${e instanceof Error ? e.message : String(e)}`, 400);
    }
  } catch (e) { return httpError(e); }
}
