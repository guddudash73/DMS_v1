import express from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const router = express.Router();

const Body = z.object({
  request: z.string().min(1),
});

let cachedPem: string | null = null;
let cachedAtMs = 0;

async function loadPem(): Promise<string> {
  const secretId = process.env.QZ_PRIVATE_KEY_SECRET_ID;
  if (!secretId) throw new Error('QZ_PRIVATE_KEY_SECRET_ID not set');

  const now = Date.now();
  if (cachedPem && now - cachedAtMs < 5 * 60 * 1000) return cachedPem;

  const client = new SecretsManagerClient({});
  const resp = await client.send(new GetSecretValueCommand({ SecretId: secretId }));

  if (!resp.SecretString) {
    throw new Error('SecretString missing');
  }

  let raw = resp.SecretString.trim();

  // ✅ YOUR CASE: secret stored as { pem: "-----BEGIN PRIVATE KEY-----..." }
  if (raw.startsWith('{')) {
    const parsed = JSON.parse(raw);
    if (typeof parsed.pem === 'string') {
      raw = parsed.pem;
    } else {
      throw new Error('Secret JSON does not contain "pem" field');
    }
  }

  // Handle escaped newlines
  raw = raw.replace(/\\n/g, '\n').trim();

  if (!raw.includes('BEGIN PRIVATE KEY') && !raw.includes('BEGIN RSA PRIVATE KEY')) {
    throw new Error('Secret is not a PEM private key');
  }

  cachedPem = raw;
  cachedAtMs = now;
  return cachedPem;
}

router.post('/sign', async (req, res) => {
  try {
    const parsed = Body.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'BAD_REQUEST' });

    const pem = await loadPem();

    const signature = crypto.sign('RSA-SHA512', Buffer.from(parsed.data.request, 'utf8'), {
      key: pem,
    });

    return res.status(200).json({ signature: signature.toString('base64') });
  } catch (err) {
    console.error('[qz/sign] failed:', err);
    return res.status(500).json({
      error: 'SIGN_FAILED',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

export default router;
