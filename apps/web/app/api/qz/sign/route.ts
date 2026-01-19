// apps/web/app/api/qz/sign/route.ts
import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

export const runtime = 'nodejs';

type Body = { request?: string };

let cachedPem: string | null = null;
let cachedAtMs = 0;

async function loadPemFromSecretsManager(): Promise<string> {
  const secretId = process.env.QZ_PRIVATE_KEY_SECRET_ID;
  if (!secretId) throw new Error('QZ_PRIVATE_KEY_SECRET_ID not set');

  // simple 5 minute cache per lambda container
  const now = Date.now();
  if (cachedPem && now - cachedAtMs < 5 * 60 * 1000) return cachedPem;

  const client = new SecretsManagerClient({});
  const resp = await client.send(new GetSecretValueCommand({ SecretId: secretId }));

  const value = resp.SecretString;
  if (!value) throw new Error('SecretString missing');

  // store base64 PEM or raw PEM; support both
  const maybePem = value.includes('BEGIN PRIVATE KEY')
    ? value
    : Buffer.from(value, 'base64').toString('utf8');

  if (!maybePem.includes('BEGIN PRIVATE KEY')) {
    throw new Error('Decoded key is not a PEM private key');
  }

  cachedPem = maybePem.trim();
  cachedAtMs = now;
  return cachedPem;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as Body | null;
    const requestToSign = body?.request;

    if (!requestToSign || typeof requestToSign !== 'string') {
      return NextResponse.json({ error: 'BAD_REQUEST' }, { status: 400 });
    }

    const privateKeyPem = await loadPemFromSecretsManager();

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
