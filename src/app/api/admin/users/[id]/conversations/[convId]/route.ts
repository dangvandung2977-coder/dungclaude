import { requireAdmin } from "@/lib/auth/auth";
import { ok, fail, httpError } from "@/lib/http";
import { getConversation, listMessages } from "@/lib/db/repos";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; convId: string }> }
): Promise<Response> {
  try {
    await requireAdmin();
    const { id, convId } = await params;

    const conv = await getConversation(convId, id);
    if (!conv) {
      return fail("Không tìm thấy cuộc hội thoại", 404);
    }

    const messages = await listMessages(convId, 500);

    return ok({
      conversation: conv,
      messages,
    });
  } catch (e) {
    return httpError(e);
  }
}
