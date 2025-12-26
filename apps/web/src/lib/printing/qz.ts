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

let securityInitialized = false;
let connectInFlight: Promise<void> | null = null;

export async function initQzSecurity() {
  if (securityInitialized) return;
  securityInitialized = true;

  qz.security.setCertificatePromise(async () => {
    // apps/web/public/qz/digital-certificate.txt
    return await fetchTextOrEmpty('/qz/digital-certificate.txt');
  });

  qz.security.setSignatureAlgorithm('SHA512');

  qz.security.setSignaturePromise(async (toSign: string) => {
    const res = await fetch('/api/qz/sign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({ request: toSign }),
    });

    if (!res.ok) return '';
    const json = (await res.json()) as any;
    return typeof json?.signature === 'string' ? json.signature : '';
  });
}

export async function ensureQzConnected() {
  if (qz.websocket.isActive()) return;

  if (!connectInFlight) {
    connectInFlight = (async () => {
      await initQzSecurity();
      // local dev: ws://localhost:8182
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

// -----------------------------
// ✅ NEW: preferred printer pick
// -----------------------------
function normalize(s: string) {
  return s.trim().toLowerCase();
}

/**
 * Picks a printer from the list based on preferred names.
 * - Exact match (case-insensitive) wins
 * - Otherwise: substring match (case-insensitive)
 */
export function pickPreferredPrinter(printers: string[], preferredNames: string[]): string | null {
  if (!printers.length) return null;

  const preferredNorm = preferredNames.map(normalize).filter(Boolean);
  const printersNorm = printers.map((p) => ({ raw: p, norm: normalize(p) }));

  // 1) exact match
  for (const pref of preferredNorm) {
    const exact = printersNorm.find((p) => p.norm === pref);
    if (exact) return exact.raw;
  }

  // 2) substring match
  for (const pref of preferredNorm) {
    const partial = printersNorm.find((p) => p.norm.includes(pref));
    if (partial) return partial.raw;
  }

  return null;
}

/**
 * Print raw ESC/POS "command" text.
 */
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
