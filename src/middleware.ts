import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Lightweight route guard. Full role check happens server-side in layouts
// and API routes (requireUser/requireAdmin) — this just avoids flashing
// protected UI and bounces logged-out users early.
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasSession = Boolean(req.cookies.get(process.env.SESSION_COOKIE_NAME ?? "lumen_session")?.value);
  const isProtected = pathname.startsWith("/app") || pathname.startsWith("/admin");
  if (isProtected && !hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  if ((pathname === "/login" || pathname === "/signup") && hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/app";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/app/:path*", "/admin/:path*", "/login", "/signup"] };
