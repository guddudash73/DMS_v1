import { NextResponse } from 'next/server';

const COOKIE_NAME = 'dms_logged_in';

type Body = {
  expiresAt?: number;
  maxAgeSec?: number;
};

export async function POST(req: Request) {
  const res = NextResponse.json({ ok: true });

  let maxAge = 60 * 60 * 24; // default 1 day

  try {
    const body = (await req.json()) as Body;

    if (typeof body.maxAgeSec === 'number' && body.maxAgeSec > 0) {
      maxAge = Math.floor(body.maxAgeSec);
    } else if (typeof body.expiresAt === 'number') {
      const deltaSec = Math.floor((body.expiresAt - Date.now()) / 1000);
      if (deltaSec > 0) maxAge = deltaSec;
    }
  } catch {
    // ignore
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

  res.cookies.set({
    name: COOKIE_NAME,
    value: '',
    path: '/',
    maxAge: 0,
  });

  return res;
}
