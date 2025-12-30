import { NextResponse } from 'next/server';

const COOKIE_NAME = 'dms_session';

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { maxAgeSec?: number } | null;
  const maxAgeSec = typeof body?.maxAgeSec === 'number' ? body.maxAgeSec : 60 * 60 * 24 * 7; // 7 days

  const res = NextResponse.json({ ok: true });

  res.cookies.set(COOKIE_NAME, '1', {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    path: '/',
    maxAge: maxAgeSec,
  });

  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });

  res.cookies.set(COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    path: '/',
    maxAge: 0,
  });

  return res;
}
