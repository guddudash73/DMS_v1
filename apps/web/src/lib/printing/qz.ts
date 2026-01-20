// apps/web/src/lib/printing/qz.ts
import qz from 'qz-tray';

async function fetchTextOrEmpty(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      cache: 'no-store',
      headers: { 'Content-Type': 'text/plain' },
    });
    if (!res.ok) return '';
    return await res.text();
  } catch {
    return '';
  }
}

function normalizeBaseUrl(url: string): string {
  // Trim whitespace and remove trailing slashes
  return url.trim().replace(/\/+$/, '');
}

function buildSignUrl(): string {
  const raw = process.env.NEXT_PUBLIC_API_BASE_URL;

  // If NEXT_PUBLIC_API_BASE_URL is missing at build time, DO NOT fall back to relative `/qz/sign`
  // because that will hit CloudFront/static origin and 404.
  if (!raw || raw.trim().length === 0) {
    console.error(
      '[qz] NEXT_PUBLIC_API_BASE_URL is not set. QZ signature endpoint will be unavailable in production.',
    );
    return '/api/qz/sign'; // local dev fallback (Next dev server may have this route)
  }

  const base = normalizeBaseUrl(raw);

  // Support both styles:
  // - base = https://api.example.com            -> https://api.example.com/qz/sign
  // - base = https://api.example.com/api        -> https://api.example.com/api/qz/sign
  return `${base}/qz/sign`;
}

let securityInitialized = false;
let connectInFlight: Promise<void> | null = null;

export async function initQzSecurity() {
  if (securityInitialized) return;
  securityInitialized = true;

  // Must exist in apps/web/public/qz/digital-certificate.txt for prod
  qz.security.setCertificatePromise(async () => {
    return await fetchTextOrEmpty('/qz/digital-certificate.txt');
  });

  // QZ expects SHA512 when using RSA private key signing
  qz.security.setSignatureAlgorithm('SHA512');

  qz.security.setSignaturePromise(async (toSign: string) => {
    const signUrl = buildSignUrl();

    try {
      const res = await fetch(signUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ request: toSign }),
      });

      if (!res.ok) {
        // Keep returning '' so QZ will prompt, but log the root cause for debugging
        console.error('[qz] signature endpoint failed', {
          signUrl,
          status: res.status,
        });
        return '';
      }

      const json = (await res.json()) as unknown;
      const sig = (json as any)?.signature;

      if (typeof sig !== 'string' || sig.length === 0) {
        console.error('[qz] signature missing in response', { signUrl, json });
        return '';
      }

      return sig;
    } catch (err) {
      console.error('[qz] signature fetch failed', { signUrl, err });
      return '';
    }
  });
}

export async function ensureQzConnected() {
  if (qz.websocket.isActive()) return;

  if (!connectInFlight) {
    connectInFlight = (async () => {
      await initQzSecurity();
      // usingSecure:false means ws://localhost:8182 (typical QZ Tray)
      await qz.websocket.connect({ usingSecure: false });
    })().finally(() => {
      connectInFlight = null;
    });
  }

  return connectInFlight;
}

export async function listPrinters(): Promise<string[]> {
  await ensureQzConnected();
  const printers = await qz.printers.find();
  if (Array.isArray(printers)) return printers;
  if (typeof printers === 'string') return [printers];
  return [];
}

function normalize(s: string) {
  return s.trim().toLowerCase();
}

export function pickPreferredPrinter(printers: string[], preferredNames: string[]): string | null {
  if (!printers.length) return null;

  const preferredNorm = preferredNames.map(normalize).filter(Boolean);
  const printersNorm = printers.map((p) => ({ raw: p, norm: normalize(p) }));

  for (const pref of preferredNorm) {
    const exact = printersNorm.find((p) => p.norm === pref);
    if (exact) return exact.raw;
  }

  for (const pref of preferredNorm) {
    const partial = printersNorm.find((p) => p.norm.includes(pref));
    if (partial) return partial.raw;
  }

  return null;
}

export async function printRaw(printerName: string, rawCommand: string): Promise<void> {
  await ensureQzConnected();

  const cfg = qz.configs.create(printerName, {
    forceRaw: true,
  });

  const data = [
    {
      type: 'raw',
      format: 'command',
      flavor: 'plain',
      data: rawCommand,
    },
  ];

  await qz.print(cfg, data as any);
}
