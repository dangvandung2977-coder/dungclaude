import { requireUser } from "@/lib/auth/auth";
import { ok, httpError } from "@/lib/http";
import { getAllRoutes } from "@/lib/ai/providers-config";
import { loadCachedModels } from "@/lib/ai/models-loader";

export const runtime = "nodejs";

// Public (authenticated) model list: catalog models (enabled + provider ready)
// + custom models khả dụng (endpoint bật + có key). Cached in-memory.
export async function GET(): Promise<Response> {
  try {
    await requireUser();
    const [models, routes] = await Promise.all([
      loadCachedModels(),
      getAllRoutes(),
    ]);
    return ok({ models, routes });
  } catch (e) {
    return httpError(e);
  }
}
