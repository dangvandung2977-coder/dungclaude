import { requireAdmin } from "@/lib/auth/auth";
import { ok, httpError } from "@/lib/http";
import { listUsers } from "@/lib/auth/auth";
import { globalUsageSummary } from "@/lib/db/repos";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  try {
    await requireAdmin();
    return ok({ users: await listUsers(), stats: await globalUsageSummary() });
  } catch (e) { return httpError(e); }
}

// Không có PUT: SINGLE-ADMIN — hệ thống chỉ có đúng 1 admin (tài khoản đầu
// tiên). Không thể nâng user thành admin qua API (gọi PUT trả 405).
