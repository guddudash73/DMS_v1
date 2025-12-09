// apps/web/app/api/session/route.ts
import { NextResponse } from 'next/server';

const COOKIE_NAME = 'dms_logged_in';

type Body = {
  // when the access token expires, in ms since epoch
  expiresAt?: number;
};

export async function POST(req: Request) {
  const res = NextResponse.json({ ok: true });

  let maxAge = 60 * 60 * 24; // 1 day default

  try {
    const body = (await req.json()) as Body;
    if (body.expiresAt && typeof body.expiresAt === 'number') {
      const deltaSec = Math.floor((body.expiresAt - Date.now()) / 1000);
      if (deltaSec > 0) {
        maxAge = deltaSec;
      }
    }
  } catch {
    // ignore, keep default maxAge
  }

  res.cookies.set({
    name: COOKIE_NAME,
    value: '1',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge,
  });

  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });

  // expire cookie immediately
  res.cookies.set({
    name: COOKIE_NAME,
    value: '',
    path: '/',
    maxAge: 0,
  });

  return res;
}
