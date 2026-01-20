import express from 'express';
import crypto from 'node:crypto';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const router = express.Router();

type Body = { request?: string };

let cachedPem: string | null = null;
let cachedAtMs = 0;

async function loadPemFromSecretsManager(): Promise<string> {
  const secretId = process.env.QZ_PRIVATE_KEY_SECRET_ID;
  if (!secretId) throw new Error('QZ_PRIVATE_KEY_SECRET_ID not set');

  const now = Date.now();
  if (cachedPem && now - cachedAtMs < 5 * 60 * 1000) return cachedPem;

  const client = new SecretsManagerClient({});
  const resp = await client.send(new GetSecretValueCommand({ SecretId: secretId }));

  const value = resp.SecretString;
  if (!value) throw new Error('SecretString missing');

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

router.post('/sign', async (req, res) => {
  try {
    const body = req.body as Body;
    const requestToSign = body?.request;

    if (!requestToSign || typeof requestToSign !== 'string') {
      return res.status(400).json({ error: 'BAD_REQUEST' });
    }

    const privateKeyPem = await loadPemFromSecretsManager();

    // Keep consistent with your current frontend setting (SHA512)
    const sig = crypto.sign('RSA-SHA512', Buffer.from(requestToSign, 'utf8'), {
      key: privateKeyPem,
    });

    return res.status(200).json({ signature: sig.toString('base64') });
  } catch (err) {
    console.error('[qz/sign] failed:', err);
    return res.status(500).json({
      error: 'SIGN_FAILED',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

export default router;
