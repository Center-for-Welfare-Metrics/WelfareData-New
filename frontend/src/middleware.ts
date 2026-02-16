import { NextResponse, type NextRequest } from "next/server";

const PROTECTED_PREFIXES = ["/admin"];
const PUBLIC_PREFIXES = ["/view", "/login"];
const AUTH_ROUTES = ["/login"];
const COOKIE_NAME = "token";

function isProtected(pathname: string) {
  if (PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return false;
  }
  return PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasToken = request.cookies.has(COOKIE_NAME);

  if (isProtected(pathname) && !hasToken) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (AUTH_ROUTES.includes(pathname) && hasToken) {
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = "/";
    return NextResponse.redirect(homeUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api).*)",
  ],
};
