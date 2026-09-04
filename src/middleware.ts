import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function getBaseUrl(req: NextRequest): string {
  if (process.env.APP_URL) return process.env.APP_URL;
  const forwardedHost = req.headers.get("x-forwarded-host") || req.headers.get("host");
  const forwardedProto = req.headers.get("x-forwarded-proto") || "https";
  if (forwardedHost && !forwardedHost.includes("localhost") && !forwardedHost.includes("127.0.0.1")) {
    return `${forwardedProto}://${forwardedHost}`;
  }
  return "https://dungclaude.site";
}

// Lightweight route guard. Full role check happens server-side in layouts
// and API routes (requireUser/requireAdmin) — this just avoids flashing
// protected UI and bounces logged-out users early.
export function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;
  const code = searchParams.get("code");
  const oauthError = searchParams.get("error") || searchParams.get("error_description");
  const baseUrl = getBaseUrl(req);

  // If OAuth provider redirected to / or any page with a code, forward immediately to callback!
  if (code && pathname !== "/auth/callback") {
    const targetUrl = new URL(`/auth/callback${req.nextUrl.search}`, baseUrl);
    return NextResponse.redirect(targetUrl);
  }

  // If OAuth provider returned an error, redirect to /login with error
  if (oauthError && pathname !== "/login" && pathname !== "/auth/callback") {
    const targetUrl = new URL(`/login${req.nextUrl.search}`, baseUrl);
    return NextResponse.redirect(targetUrl);
  }

  const hasSession = Boolean(req.cookies.get(process.env.SESSION_COOKIE_NAME ?? "lumen_session")?.value);
  const isProtected = pathname.startsWith("/app") || pathname.startsWith("/admin");
  if (isProtected && !hasSession) {
    return NextResponse.redirect(new URL("/login", baseUrl));
  }
  if ((pathname === "/login" || pathname === "/signup") && hasSession) {
    return NextResponse.redirect(new URL("/app", baseUrl));
  }
  return NextResponse.next();
}

export const config = { matcher: ["/", "/app/:path*", "/admin/:path*", "/login", "/signup"] };
