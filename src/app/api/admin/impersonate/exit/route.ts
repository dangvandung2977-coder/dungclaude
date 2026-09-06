import { readSession, getUserById, signSession, setSessionCookie } from "@/lib/auth/auth";
import { fail, ok } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(): Promise<Response> {
  const session = await readSession();
  if (!session || !session.impersonator) {
    return fail("Không ở trong chế độ quan sát", 400);
  }

  const adminUser = await getUserById(session.impersonator.id);
  if (!adminUser) return fail("Không tìm thấy tài khoản quản trị viên", 404);

  // Restore admin session
  const token = await signSession({
    id: adminUser.id,
    email: adminUser.email,
    name: adminUser.name,
    role: "admin",
  });

  const c = setSessionCookie(token);
  const res = ok({ ok: true, admin: adminUser });
  res.cookies.set(c.name, c.value, c.options as Parameters<typeof res.cookies.set>[2]);
  return res;
}
