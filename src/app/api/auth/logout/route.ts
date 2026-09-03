import { clearSessionCookie } from "@/lib/auth/auth";
import { ok } from "@/lib/http";
export const runtime = "nodejs";
export async function POST(): Promise<Response> {
  const c = clearSessionCookie();
  const res = ok({ ok: true });
  res.cookies.set(c.name, c.value, c.options as Parameters<typeof res.cookies.set>[2]);
  return res;
}
