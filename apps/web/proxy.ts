import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const REFRESH_COOKIE = 'refreshToken';

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isLogin = pathname === '/login';

  if (
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico' ||
    pathname.startsWith('/images') ||
    pathname.startsWith('/public')
  ) {
    return NextResponse.next();
  }

  const hasRefreshCookie = Boolean(req.cookies.get(REFRESH_COOKIE)?.value);

  if (!hasRefreshCookie && !isLogin) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('from', pathname);
    return NextResponse.redirect(url);
  }

  if (hasRefreshCookie && isLogin) {
    const url = req.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
