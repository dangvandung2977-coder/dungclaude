// Supabase data layer (Postgres + Storage).
// SERVER-ONLY: module này dùng SUPABASE_SECRET_KEY — chỉ import từ
// API routes / server components, không bao giờ import từ client components.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "@/lib/config";

let client: SupabaseClient | null = null;

// fetch có retry: mạng tới Supabase đôi khi reset giữa chừng (ECONNRESET),
// thử lại vài lần thay vì trả 500 ngay.
async function retryFetch(input: RequestInfo | URL, init?: RequestInit, attempt = 0): Promise<Response> {
  try {
    const res = await fetch(input, init);
    if ((res.status === 502 || res.status === 503 || res.status === 504) && attempt < 2) {
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      return retryFetch(input, init, attempt + 1);
    }
    return res;
  } catch (e) {
    if (attempt < 2) {
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      return retryFetch(input, init, attempt + 1);
    }
    throw e;
  }
}

export function getSupabase(): SupabaseClient {
  if (!config.supabase.url || !config.supabase.secretKey) {
    throw Object.assign(
      new Error("Thiếu SUPABASE_URL / SUPABASE_SECRET_KEY trong .env — xem supabase/migration.sql + ENVIRONMENT.md"),
      { status: 500 }
    );
  }
  if (!client) {
    client = createClient(config.supabase.url, config.supabase.secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: retryFetch },
    });
  }
  return client;
}

export function uid(prefix = "id"): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export type Row = Record<string, unknown>;

export function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}
export function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
export function bool(v: unknown): boolean {
  return v === true || v === 1 || v === "true";
}
export function nullableStr(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}
