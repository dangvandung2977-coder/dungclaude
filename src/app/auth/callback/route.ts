import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  findUserByEmail,
  countAdmins,
  hashPassword,
  ensureAdminRole,
  signSession,
  setSessionCookie,
} from "@/lib/auth/auth";
import { getSupabase } from "@/lib/db/supabase";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next") || "/app";
  const oauthError = requestUrl.searchParams.get("error");
  const oauthErrorDescription = requestUrl.searchParams.get("error_description");

  // Determine external origin safely (handles proxies / Cloudflare Tunnel / custom domain)
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") || "https";
  const origin = forwardedHost ? `${forwardedProto}://${forwardedHost}` : requestUrl.origin;

  // Handle OAuth provider error (e.g. user cancelled Google sign-in)
  if (oauthError || oauthErrorDescription) {
    const message = oauthErrorDescription || oauthError || "Đăng nhập Google đã bị hủy hoặc thất bại.";
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(message)}`);
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent("Mã xác thực Google không hợp lệ.")}`);
  }

  try {
    const supabase = await createServerSupabaseClient();
    const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

    if (exchangeError || !data?.user) {
      console.error("[Auth Callback] Exchange error:", exchangeError);
      return NextResponse.redirect(
        `${origin}/login?error=${encodeURIComponent(exchangeError?.message || "Không thể xác thực tài khoản Google.")}`
      );
    }

    const authUser = data.user;
    const email = authUser.email?.trim().toLowerCase();

    if (!email) {
      return NextResponse.redirect(
        `${origin}/login?error=${encodeURIComponent("Tài khoản Google không cung cấp địa chỉ email.")}`
      );
    }

    // Check existing application user profile in database
    let appUser = await findUserByEmail(email);

    if (!appUser) {
      // Create new application profile for first-time Google user
      const fullName = (
        authUser.user_metadata?.full_name ||
        authUser.user_metadata?.name ||
        email.split("@")[0]
      )?.slice(0, 80) || "User";

      const adminCount = await countAdmins();
      const role = adminCount === 0 ? "admin" : "user";

      const { error: insertError } = await getSupabase().from("users").insert({
        id: authUser.id,
        email,
        password_hash: await hashPassword(crypto.randomUUID()),
        name: fullName,
        role,
      });

      if (insertError) {
        // Concurrent insert or existing email fallback
        appUser = await findUserByEmail(email);
        if (!appUser) {
          console.error("[Auth Callback] Profile creation error:", insertError);
          return NextResponse.redirect(
            `${origin}/login?error=${encodeURIComponent("Không thể tạo hồ sơ người dùng trong hệ thống.")}`
          );
        }
      } else {
        appUser = {
          id: authUser.id,
          email,
          name: fullName,
          role,
          passwordHash: "",
        };
      }
    } else if (!appUser.name && authUser.user_metadata?.full_name) {
      // Sync user's display name if previously missing
      const fullName = String(authUser.user_metadata.full_name).slice(0, 80);
      await getSupabase().from("users").update({ name: fullName }).eq("id", appUser.id);
      appUser.name = fullName;
    }

    await ensureAdminRole(email);

    // Issue application session cookie JWT
    const token = await signSession({
      id: appUser.id,
      email: appUser.email,
      name: appUser.name,
      role: appUser.role,
    });

    const cookieData = setSessionCookie(token);
    const redirectUrl = new URL(next.startsWith("/") ? next : "/app", origin);
    const response = NextResponse.redirect(redirectUrl);

    response.cookies.set(
      cookieData.name,
      cookieData.value,
      cookieData.options as Parameters<typeof response.cookies.set>[2]
    );

    return response;
  } catch (err) {
    console.error("[Auth Callback] Unexpected error:", err);
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(
        err instanceof Error ? err.message : "Đã xảy ra lỗi không mong muốn khi xử lý đăng nhập."
      )}`
    );
  }
}
