import { NextResponse } from "next/server";
import { z } from "zod";

export function ok(data: unknown, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, init);
}

export function fail(message: string, status = 400, extra?: Record<string, unknown>): NextResponse {
  return NextResponse.json({ error: message, ...extra }, { status });
}

export function httpError(e: unknown): NextResponse {
  if (e instanceof z.ZodError) {
    return fail(e.issues[0]?.message ?? "Dữ liệu không hợp lệ.", 400);
  }
  const status = (e as { status?: number })?.status ?? 500;
  const message = e instanceof Error ? e.message : "Internal error";
  if (status === 401) return fail("Chưa đăng nhập", 401);
  if (status === 403) return fail("Không có quyền (cần Admin)", 403);
  return fail(process.env.NODE_ENV === "production" && status === 500 ? "Có lỗi xảy ra, thử lại sau." : message, status);
}
