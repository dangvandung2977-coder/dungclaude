import { requireUser } from "@/lib/auth/auth";
import { ok, httpError } from "@/lib/http";
import { searchAll } from "@/lib/db/repos";

export const runtime = "nodejs";

export async function GET(req: Request): Promise<Response> {
  try {
    const user = await requireUser();
    const q = new URL(req.url).searchParams.get("q")?.slice(0, 100) ?? "";
    if (!q) return ok({ conversations: [], messages: [], projects: [] });
    return ok(await searchAll(user.id, q));
  } catch (e) { return httpError(e); }
}
