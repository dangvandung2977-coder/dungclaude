import { requireAdmin, getUserById, signSession, setSessionCookie } from "@/lib/auth/auth";
import { fail, ok } from "@/lib/http";
import { z } from "zod";

export const runtime = "nodejs";

const schema = z.object({
  userId: z.string().min(1),
});

export async function POST(req: Request): Promise<Response> {
  const admin = await requireAdmin();
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return fail("User ID is required", 400);

  if (parsed.data.userId === admin.id) {
    return fail("Không thể tự quan sát tài khoản của chính mình", 400);
  }

  const targetUser = await getUserById(parsed.data.userId);
  if (!targetUser) return fail("Không tìm thấy người dùng", 404);

  // Create session for target user with admin impersonator attached
  const token = await signSession({
    id: targetUser.id,
    email: targetUser.email,
    name: targetUser.name,
    role: targetUser.role,
    impersonator: {
      id: admin.id,
      email: admin.email,
      name: admin.name,
    },
  });

  const c = setSessionCookie(token);
  const res = ok({ ok: true, user: targetUser });
  res.cookies.set(c.name, c.value, c.options as Parameters<typeof res.cookies.set>[2]);
  return res;
}
