import { requireUser } from "@/lib/auth/auth";
import { ok, httpError } from "@/lib/http";
import { usageSummary } from "@/lib/db/repos";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  try {
    const user = await requireUser();
    return ok({ usage: await usageSummary(user.id) });
  } catch (e) { return httpError(e); }
}
