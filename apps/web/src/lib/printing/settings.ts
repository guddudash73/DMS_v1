// apps/web/src/lib/printing/settings.ts
import { z } from 'zod';

const KEY = 'dms.print.settings.v1';

export const PrintSettings = z.object({
  autoPrintToken: z.boolean().default(true),
  printerName: z.string().min(1).optional(), // QZ printer name
});

export type PrintSettings = z.infer<typeof PrintSettings>;

export function loadPrintSettings(): PrintSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { autoPrintToken: true };
    const parsed = PrintSettings.safeParse(JSON.parse(raw));
    if (!parsed.success) return { autoPrintToken: true };
    return parsed.data;
  } catch {
    return { autoPrintToken: true };
  }
}

export function savePrintSettings(next: PrintSettings) {
  localStorage.setItem(KEY, JSON.stringify(next));
}
