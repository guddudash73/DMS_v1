// apps/web/proxy.ts
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const REFRESH_COOKIE = 'refreshToken';

// Allowlist for public assets that must never be auth-gated
const PUBLIC_FILE_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'avif',
  'svg',
  'ico',
  'txt',
  'json',
  'map',
  'css',
  'js',
  'woff',
  'woff2',
  'ttf',
  'eot',
]);

function isPublicAssetPath(pathname: string): boolean {
  // Next internals + common public endpoints
  if (pathname.startsWith('/_next')) return true;
  if (pathname === '/favicon.ico') return true;
  if (pathname === '/robots.txt') return true;
  if (pathname === '/sitemap.xml') return true;

  // If your app uses a dedicated static prefix, keep it
  if (pathname.startsWith('/images')) return true;

  // Public folder files are served from root, NOT /public/...
  const last = pathname.split('/').pop() ?? '';
  const ext = last.includes('.') ? last.split('.').pop()?.toLowerCase() : undefined;
  return !!ext && PUBLIC_FILE_EXTENSIONS.has(ext);
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ✅ Always bypass auth checks for assets/system routes
  if (isPublicAssetPath(pathname)) {
    return NextResponse.next();
  }

  const isLogin = pathname === '/login';
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
  // Keep excluding Next internals; everything else goes through proxy
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
