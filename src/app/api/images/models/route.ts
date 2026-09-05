import { requireUser } from "@/lib/auth/auth";
import { ok, fail, httpError } from "@/lib/http";
import { getAvailableImageModels } from "@/lib/ai/image-gen";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  try {
    const user = await requireUser().catch(() => null);
    if (!user) return fail("Chưa đăng nhập", 401);

    const { models, activeRoute } = await getAvailableImageModels();
    return ok({ models, activeRoute });
  } catch (e) {
    return httpError(e);
  }
}
