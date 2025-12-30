import { NextResponse } from 'next/server';
import crypto from 'node:crypto';

export const runtime = 'nodejs';

type Body = { request?: string };

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as Body | null;
    const requestToSign = body?.request;

    if (!requestToSign || typeof requestToSign !== 'string') {
      return NextResponse.json({ error: 'BAD_REQUEST' }, { status: 400 });
    }

    const pemB64 = process.env.QZ_PRIVATE_KEY_PEM_BASE64;
    if (!pemB64 || typeof pemB64 !== 'string' || pemB64.trim().length === 0) {
      return NextResponse.json(
        { error: 'QZ_KEY_MISSING', message: 'QZ_PRIVATE_KEY_PEM_BASE64 not set' },
        { status: 500 },
      );
    }

    const privateKeyPem = Buffer.from(pemB64, 'base64').toString('utf8').trim();

    if (!privateKeyPem.includes('BEGIN PRIVATE KEY')) {
      return NextResponse.json(
        { error: 'QZ_KEY_INVALID', message: 'Decoded key is not a PEM private key' },
        { status: 500 },
      );
    }

    const signature = crypto.sign('RSA-SHA512', Buffer.from(requestToSign, 'utf8'), {
      key: privateKeyPem,
    });

    return NextResponse.json({ signature: signature.toString('base64') });
  } catch (err) {
    console.error('[qz/sign] failed:', err);
    return NextResponse.json(
      { error: 'SIGN_FAILED', message: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
