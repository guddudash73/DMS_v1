// apps/web/middleware.ts
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const COOKIE_NAME = 'dms_logged_in';

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isLogin = pathname === '/login';

  // Public assets, Next internals, etc. always allowed
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon.ico') ||
    pathname.startsWith('/public') ||
    pathname.startsWith('/api/session') // our own session API – must stay public
  ) {
    return NextResponse.next();
  }

  const isLoggedIn = req.cookies.get(COOKIE_NAME)?.value === '1';

  // Not logged in -> block any protected route
  if (!isLoggedIn && !isLogin) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('from', pathname); // optional: remember where they came from
    return NextResponse.redirect(url);
  }

  // Already logged in -> keep them away from /login
  if (isLoggedIn && isLogin) {
    const url = req.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

// Apply to everything except static assets (adjust as needed)
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
