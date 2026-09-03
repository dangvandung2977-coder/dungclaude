import bcrypt from "bcryptjs";
import * as jose from "jose";
import { cookies } from "next/headers";
import { getSupabase, uid } from "@/lib/db/supabase";
import { config, isAdminEmail } from "@/lib/config";

export interface SessionUser { id: string; email: string; name: string | null; role: string; }

const key = new TextEncoder().encode(config.authSecret.padEnd(32, "0").slice(0, 64));

export async function hashPassword(pw: string): Promise<string> {
  return bcrypt.hash(pw, 10);
}
export async function verifyPassword(pw: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pw, hash);
}

export async function signSession(user: SessionUser): Promise<string> {
  return new jose.SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${Math.round(config.sessionMaxAgeSec / 86400)}d`)
    .sign(key);
}

export async function readSession(): Promise<SessionUser | null> {
  try {
    const jar = await cookies();
    const token = jar.get(config.sessionCookie)?.value;
    if (!token) return null;
    const { payload } = await jose.jwtVerify(token, key);
    return { id: String(payload.id), email: String(payload.email), name: (payload.name as string) ?? null, role: String(payload.role ?? "user") };
  } catch { return null; }
}

export async function requireUser(): Promise<SessionUser> {
  const s = await readSession();
  if (!s) throw Object.assign(new Error("Unauthorized"), { status: 401 });
  return s;
}

export async function requireAdmin(): Promise<SessionUser> {
  const s = await requireUser();
  if (s.role !== "admin") throw Object.assign(new Error("Forbidden: admin only"), { status: 403 });
  return s;
}

export function setSessionCookie(token: string): { name: string; value: string; options: Record<string, unknown> } {
  return {
    name: config.sessionCookie, value: token,
    options: { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: config.sessionMaxAgeSec },
  };
}

export function clearSessionCookie(): { name: string; value: string; options: Record<string, unknown> } {
  return { name: config.sessionCookie, value: "", options: { httpOnly: true, path: "/", maxAge: 0 } };
}

// ── Users (Supabase) ──
export async function findUserByEmail(email: string): Promise<(SessionUser & { passwordHash: string }) | null> {
  const { data, error } = await getSupabase().from("users").select("*").eq("email", email.toLowerCase()).maybeSingle();
  if (error || !data) return null;
  const r = data as Record<string, unknown>;
  return {
    id: String(r.id), email: String(r.email), name: (r.name as string) ?? null,
    role: String(r.role ?? "user"), passwordHash: String(r.password_hash),
  };
}

export async function countAdmins(): Promise<number> {
  const { count } = await getSupabase().from("users").select("id", { count: "exact", head: true }).eq("role", "admin");
  return count ?? 0;
}

export async function createUser(email: string, password: string, name?: string): Promise<SessionUser> {
  const normalized = email.trim().toLowerCase();
  // SINGLE-ADMIN: chỉ tài khoản đầu tiên là admin. Mọi tài khoản sau đều là
  // user và tuân theo cấu hình của admin, không thể tự lên admin.
  const adminCount = await countAdmins();
  const role = adminCount === 0 ? "admin" : "user";
  const id = uid("user");
  const { error } = await getSupabase().from("users").insert({
    id, email: normalized, password_hash: await hashPassword(password),
    name: name?.slice(0, 80) ?? null, role,
  });
  if (error) throw new Error(error.message);
  return { id, email: normalized, name: name ?? null, role };
}

export async function ensureAdminRole(email: string): Promise<void> {
  // ADMIN_EMAILS chỉ có tác dụng khôi phục khi CHƯA có admin nào
  // (VD: xóa nhầm tài khoản admin). Không bao giờ tạo admin thứ hai.
  if (!isAdminEmail(email)) return;
  if ((await countAdmins()) > 0) return;
  await getSupabase().from("users").update({ role: "admin" }).eq("email", email.toLowerCase());
}

export async function listUsers(): Promise<Array<{ id: string; email: string; name: string | null; role: string; createdAt: string; conversations: number }>> {
  const sb = getSupabase();
  const { data, error } = await sb.from("users").select("*").order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  const rows = ((data ?? []) as Array<Record<string, unknown>>);
  const out = [];
  for (const r of rows) {
    const { count } = await sb.from("conversations").select("id", { count: "exact", head: true }).eq("user_id", String(r.id));
    out.push({
      id: String(r.id), email: String(r.email), name: (r.name as string) ?? null,
      role: String(r.role ?? "user"), createdAt: String(r.created_at), conversations: count ?? 0,
    });
  }
  return out;
}

// Không có setUserRole: SINGLE-ADMIN — hệ thống chỉ có đúng 1 admin
// (tài khoản đầu tiên), không API nào được đổi role.
