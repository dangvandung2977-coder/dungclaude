import { z } from "zod";
import { findUserByEmail, verifyPassword, signSession, setSessionCookie, ensureAdminRole } from "@/lib/auth/auth";
import { ok, fail, httpError } from "@/lib/http";
import { rateLimit } from "@/lib/security/security";
import { config } from "@/lib/config";

export const runtime = "nodejs";

const schema = z.object({ email: z.string().email(), password: z.string().min(1) });

export async function POST(req: Request): Promise<Response> {
  try {
    const ip = req.headers.get("x-forwarded-for") ?? "local";
    const rl = rateLimit(`auth:${ip}`, config.rateLimit.authPerMin);
    if (!rl.ok) return fail("Thử lại sau vài giây (rate limit).", 429);
    const body = schema.parse(await req.json());
    const user = await findUserByEmail(body.email);
    if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
      return fail("Email hoặc mật khẩu không đúng.", 401);
    }
    await ensureAdminRole(user.email);
    const fresh = (await findUserByEmail(body.email))!;
    const token = await signSession({ id: fresh.id, email: fresh.email, name: fresh.name, role: fresh.role });
    const c = setSessionCookie(token);
    const res = ok({ id: fresh.id, email: fresh.email, name: fresh.name, role: fresh.role });
    res.cookies.set(c.name, c.value, c.options as Parameters<typeof res.cookies.set>[2]);
    return res;
  } catch (e) { return httpError(e); }
}
