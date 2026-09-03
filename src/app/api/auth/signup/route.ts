import { z } from "zod";
import { createUser, findUserByEmail, signSession, setSessionCookie, ensureAdminRole } from "@/lib/auth/auth";
import { ok, fail, httpError } from "@/lib/http";
import { rateLimit } from "@/lib/security/security";
import { config } from "@/lib/config";

export const runtime = "nodejs";

const schema = z.object({
  email: z.string().email("Email không hợp lệ"),
  password: z.string().min(6, "Mật khẩu tối thiểu 6 ký tự").max(100),
  name: z.string().max(80).optional(),
});

export async function POST(req: Request): Promise<Response> {
  try {
    const ip = req.headers.get("x-forwarded-for") ?? "local";
    const rl = rateLimit(`auth:${ip}`, config.rateLimit.authPerMin);
    if (!rl.ok) return fail("Thử lại sau vài giây (rate limit).", 429);
    const body = schema.parse(await req.json());
    if (await findUserByEmail(body.email)) return fail("Email đã được đăng ký.", 409);
    const user = await createUser(body.email, body.password, body.name);
    await ensureAdminRole(user.email);
    const token = await signSession({ id: user.id, email: user.email, name: user.name, role: user.role });
    const c = setSessionCookie(token);
    const res = ok({ id: user.id, email: user.email, name: user.name, role: user.role });
    res.cookies.set(c.name, c.value, c.options as Parameters<typeof res.cookies.set>[2]);
    return res;
  } catch (e) { return httpError(e); }
}

export async function GET(): Promise<Response> {
  // Login helper lives in /api/auth/login; keep shape consistent
  const { readSession } = await import("@/lib/auth/auth");
  const s = await readSession();
  if (!s) return fail("Chưa đăng nhập", 401);
  if (!(await findUserByEmail(s.email))) return fail("Chưa đăng nhập", 401);
  return ok(s);
}
